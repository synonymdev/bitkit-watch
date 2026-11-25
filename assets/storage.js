/* Storage module. Dependencies are supplied by app.js; state access is explicit. */
((root) => {
  "use strict";
  function create({
    DEFAULT_WALLET_NAMES,
    HOUR_MS,
    MAX_RUNTIME_CACHE_STORAGE_BYTES,
    MAX_STATE_STORAGE_BYTES,
    MAX_TIMELINE_POINTS,
    MAX_TRANSACTIONS_PER_ADDRESS,
    MAX_WALLETS,
    MAX_WATCHED_ADDRESSES,
    STORAGE_KEYS,
    SUPPORTED_FIAT_CURRENCIES,
    buildDailyBalanceTimeline,
    buildIntervalBalanceTimeline,
    createDefaultFiatExchangeRates,
    createDefaultSettings,
    createId,
    getDataGeneration,
    isCurrentGeneration,
    isSatoshiAmount,
    isStorageSyncing,
    isTimestamp,
    isValidTxid,
    normalizeAddressTags,
    normalizeBitcoinAddress,
    normalizeBitcoinNotation,
    normalizeChartRange,
    normalizeDemoSeedKeys,
    normalizeFiatCurrency,
    normalizeHistoryScope,
    normalizeSnapshotDetailScope,
    normalizeWalletName,
    seedSatoshiDemoWallet,
    startOfUtcHour,
    toHourKey,
    uniqueStrings,
    warnStorageFailure
  }) {
    function buildDefaultState() {
      const next = {
        groups: DEFAULT_WALLET_NAMES.map((name) => ({
          id: createId("grp"),
          name,
        })),
        addresses: [],
        seededDemoWallets: [],
        hideBalances: false,
        selectedRange: "30D",
        settings: createDefaultSettings(),
        lastUpdated: null,
        satoshiDemoLastRefreshedAt: null,
      };
      seedSatoshiDemoWallet(next, { force: true });
      return next;
    }

    function loadState() {
      const fallback = buildDefaultState();
      let raw = "";
      try {
        raw = localStorage.getItem(STORAGE_KEYS.state) || "";
        if (!raw) {
          return fallback;
        }

        if (getUtf8ByteLength(raw) > MAX_STATE_STORAGE_BYTES) {
          throw new Error("Stored state exceeds the supported size.");
        }

        return normalizeImportedState(JSON.parse(raw));
      } catch (error) {
        const recovered = quarantineStoredState(raw);
        return {
          ...fallback,
          _loadWarning: recovered
            ? "Stored Bitkit Watch data could not be loaded. A recovery copy was preserved before defaults were restored."
            : "Stored Bitkit Watch data could not be loaded and a recovery copy could not be saved. Defaults were restored.",
        };
      }
    }

    function saveState(nextState) {
      if (isStorageSyncing()) return true;
      if (!isCurrentGeneration(getDataGeneration())) return false;
      try {
        const serialized = JSON.stringify(serializeInternalState(nextState));
        if (getUtf8ByteLength(serialized) > MAX_STATE_STORAGE_BYTES) {
          throw new Error("Local watchlist data exceeds the supported size.");
        }
        localStorage.setItem(STORAGE_KEYS.state, serialized);
        return true;
      } catch (error) {
        warnStorageFailure("Wallet changes could not be saved. This session will continue without persistence.");
        return false;
      }
    }

    function loadRuntimeCache(currentState) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.runtimeCache);
        if (!raw) {
          return null;
        }

        if (getUtf8ByteLength(raw) > MAX_RUNTIME_CACHE_STORAGE_BYTES) {
          warnStorageFailure("Cached wallet history is too large to load. Click Refresh to rebuild it.");
          return null;
        }

        const cached = normalizeRuntimeCache(JSON.parse(raw), currentState);
        if (currentState.addresses.some((entry) => entry.needsHistoryRefresh)) {
          // Older versions cached zero transaction amounts for uppercase Bech32.
          // Persist the pruned cache before the canonicalized watchlist is saved.
          if (cached) saveRuntimeCache(cached);
          else clearRuntimeCache();
        }
        return cached;
      } catch (error) {
        warnStorageFailure("Cached wallet history could not be loaded. Click Refresh to rebuild it.");
        return null;
      }
    }

    function saveRuntimeCache(currentRuntime) {
      if (isStorageSyncing() || !isCurrentGeneration(getDataGeneration())) return;
      if (!currentRuntime.addressSnapshots?.length) {
        return clearRuntimeCache();
      }
      for (const serialized of buildRuntimeCacheCandidates(currentRuntime)) {
        try {
          const encoded = JSON.stringify(serialized);
          if (getUtf8ByteLength(encoded) > MAX_RUNTIME_CACHE_STORAGE_BYTES) {
            continue;
          }
          localStorage.setItem(STORAGE_KEYS.runtimeCache, encoded);
          return;
        } catch (error) {
          if (!isStorageQuotaError(error)) {
            break;
          }
        }
      }

      warnStorageFailure("Wallet history could not be cached. This session will continue without persistence.");
    }

    function clearRuntimeCache() {
      try {
        localStorage.removeItem(STORAGE_KEYS.runtimeCache);
      } catch (error) {
        warnStorageFailure("Cached wallet history could not be deleted from this browser.");
      }
    }

    function quarantineStoredState(raw) {
      if (!raw) {
        return false;
      }

      try {
        localStorage.setItem(STORAGE_KEYS.stateQuarantine, raw);
        return true;
      } catch (error) {
        // Best effort only. The caller still restores a usable default state.
        return false;
      }
    }

    function getUtf8ByteLength(value) {
      return new Blob([String(value || "")]).size;
    }

    function isStorageQuotaError(error) {
      if (!error) {
        return false;
      }

      return (
        error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        error.code === 22 ||
        error.code === 1014
      );
    }

    function serializeInternalState(currentState) {
      return {
        groups: currentState.groups.map((group) => ({
          id: group.id,
          name: group.name,
        })),
        addresses: currentState.addresses.map((address) => ({
          id: address.id,
          address: address.address,
          tags: normalizeAddressTags(address.tags),
          groupId: address.groupId,
          createdAt: address.createdAt,
        })),
        seededDemoWallets: normalizeDemoSeedKeys(currentState.seededDemoWallets),
        hideBalances: currentState.hideBalances,
        selectedRange: normalizeChartRange(currentState.selectedRange),
        settings: {
          activeWalletId: currentState.settings.activeWalletId || null,
          activeAddressId: currentState.settings.activeAddressId || null,
          displayUnit: ["BTC", "USD"].includes(currentState.settings.displayUnit)
            ? currentState.settings.displayUnit
            : "BTC",
          fiatCurrency: normalizeFiatCurrency(currentState.settings.fiatCurrency),
          hideDust: Boolean(currentState.settings.hideDust),
          bitcoinNotation: normalizeBitcoinNotation(currentState.settings.bitcoinNotation),
          showBackgroundGraphics: currentState.settings.showBackgroundGraphics !== false,
        },
        lastUpdated: currentState.lastUpdated,
        satoshiDemoLastRefreshedAt: currentState.satoshiDemoLastRefreshedAt,
      };
    }

    function normalizeImportedState(candidate) {
      const next = buildDefaultState();
      if (!candidate || typeof candidate !== "object") {
        return next;
      }

      const groups = normalizeGroups(candidate.groups);
      const groupNameToId = new Map(groups.map((group) => [group.name.toLowerCase(), group.id]));
      const validGroupIds = new Set(groups.map((group) => group.id));
      const addresses = normalizeAddresses(candidate.addresses, groupNameToId, validGroupIds);

      next.groups = groups;
      next.addresses = addresses;
      next.hideBalances = Boolean(candidate.hideBalances);
      next.seededDemoWallets = normalizeDemoSeedKeys(candidate.seededDemoWallets);
      next.selectedRange = normalizeChartRange(candidate.selectedRange);
      next.settings = {
        ...createDefaultSettings(),
        activeWalletId:
          candidate.settings && typeof candidate.settings.activeWalletId === "string"
            ? candidate.settings.activeWalletId
            : null,
        activeAddressId:
          candidate.settings && typeof candidate.settings.activeAddressId === "string"
            ? candidate.settings.activeAddressId
            : null,
        displayUnit:
          candidate.settings &&
          (candidate.settings.displayUnit === "BTC" || candidate.settings.displayUnit === "USD")
            ? candidate.settings.displayUnit
            : "BTC",
        fiatCurrency: normalizeFiatCurrency(candidate.settings?.fiatCurrency),
        hideDust: typeof candidate.settings?.hideDust === "boolean" ? candidate.settings.hideDust : true,
        bitcoinNotation: normalizeBitcoinNotation(candidate.settings?.bitcoinNotation),
        showBackgroundGraphics:
          typeof candidate.settings?.showBackgroundGraphics === "boolean"
            ? candidate.settings.showBackgroundGraphics
            : true,
      };
      next.lastUpdated =
        typeof candidate.lastUpdated === "string" && !Number.isNaN(Date.parse(candidate.lastUpdated))
          ? candidate.lastUpdated
          : null;
      next.satoshiDemoLastRefreshedAt =
        typeof candidate.satoshiDemoLastRefreshedAt === "string" &&
        !Number.isNaN(Date.parse(candidate.satoshiDemoLastRefreshedAt))
          ? candidate.satoshiDemoLastRefreshedAt
          : null;

      seedSatoshiDemoWallet(next);
      return next;
    }

    function* buildRuntimeCacheCandidates(currentRuntime) {
      yield serializeRuntimeCache(currentRuntime);
      const compact = { includeIntradayPriceHistory: false, includeHourlyBalanceTimeline: false };
      yield serializeRuntimeCache(currentRuntime, compact);
      for (const maxTxEventsPerSnapshot of [500, 120, 60, 0]) {
        yield serializeRuntimeCache(currentRuntime, { ...compact, maxTxEventsPerSnapshot });
      }
    }

    function serializeRuntimeCache(
      currentRuntime,
      {
        includeAddressDetails = false,
        includeIntradayPriceHistory = true,
        includeHourlyBalanceTimeline = true,
        maxTxEventsPerSnapshot = Infinity,
      } = {}
    ) {
      if (!Array.isArray(currentRuntime.addressSnapshots) || !currentRuntime.addressSnapshots.length) {
        return null;
      }

      return {
        priceHistoryVersion: 1,
        priceStale: Boolean(currentRuntime.priceStale),
        historyScope: normalizeHistoryScope(currentRuntime.historyScope),
        currentPriceUsd: Number.isFinite(currentRuntime.currentPriceUsd)
          ? currentRuntime.currentPriceUsd
          : null,
        fiatExchangeRates: serializeNumberMap(currentRuntime.fiatExchangeRates),
        priceHistory: serializeNumberMap(currentRuntime.priceHistory),
        intradayPriceHistory: includeIntradayPriceHistory
          ? serializeNumberMap(currentRuntime.intradayPriceHistory)
          : [],
        historyAvailable: Boolean(currentRuntime.historyAvailable),
        historyMissingDays: Number.isFinite(currentRuntime.historyMissingDays)
          ? currentRuntime.historyMissingDays
          : 0,
        approximationMode: Boolean(currentRuntime.approximationMode),
        timelineStart: Number.isFinite(currentRuntime.timelineStart) ? currentRuntime.timelineStart : null,
        timelineEnd: Number.isFinite(currentRuntime.timelineEnd) ? currentRuntime.timelineEnd : null,
        intradayStart: Number.isFinite(currentRuntime.intradayStart) ? currentRuntime.intradayStart : null,
        intradayEnd: Number.isFinite(currentRuntime.intradayEnd) ? currentRuntime.intradayEnd : null,
        transactionDetails: serializeTransactionDetailsMap(currentRuntime.transactionDetailsByTxid),
        addressSnapshots: currentRuntime.addressSnapshots.map((snapshot) => ({
          entryId: snapshot.entry?.id || null,
          provider: snapshot.provider || "",
          refreshedAt: isTimestamp(snapshot.refreshedAt) ? snapshot.refreshedAt : null,
          refreshFailed: Boolean(snapshot.refreshFailed),
          balanceSats: Number(snapshot.balanceSats || 0),
          usdValue: Number.isFinite(snapshot.usdValue) ? snapshot.usdValue : null,
          approximate: Boolean(snapshot.approximate) || snapshot.txEvents.length > maxTxEventsPerSnapshot,
          detailScope: maxTxEventsPerSnapshot === 0 ? "SUMMARY" : normalizeSnapshotDetailScope(snapshot.detailScope),
          txEvents: serializeTxEvents(snapshot.txEvents, {
            includeAddressDetails,
            maxItems: maxTxEventsPerSnapshot,
          }),
          balanceTimeline: serializeBalanceTimeline(snapshot.balanceTimeline),
          hourlyBalanceTimeline: includeHourlyBalanceTimeline
            ? serializeBalanceTimeline(snapshot.hourlyBalanceTimeline)
            : [],
        })),
      };
    }

    function normalizeRuntimeCache(candidate, currentState) {
      if (!candidate || typeof candidate !== "object") {
        return null;
      }

      const addressById = new Map(currentState.addresses.map((entry) => [entry.id, entry]));
      const snapshots = Array.isArray(candidate.addressSnapshots)
        ? candidate.addressSnapshots
            .slice(0, MAX_WATCHED_ADDRESSES)
            .map((snapshot) => normalizeCachedSnapshot(snapshot, addressById))
            .filter(Boolean)
        : [];

      if (!snapshots.length) {
        return null;
      }

      const timelineStart = isTimestamp(candidate.timelineStart) ? candidate.timelineStart : null;
      const timelineEnd = isTimestamp(candidate.timelineEnd) ? candidate.timelineEnd : null;
      const intradayStart = isTimestamp(candidate.intradayStart) ? candidate.intradayStart : null;
      const intradayEnd = isTimestamp(candidate.intradayEnd) ? candidate.intradayEnd : null;
      let rebuiltTimelines = false;
      snapshots.forEach((snapshot) => {
        rebuiltTimelines =
          rebuildCachedSnapshotTimelinesIfNeeded(snapshot, {
            timelineStart,
            timelineEnd,
            intradayStart,
            intradayEnd,
          }) || rebuiltTimelines;
      });

      return {
        priceStale: Boolean(candidate.priceStale),
        historyScope: normalizeHistoryScope(candidate.historyScope),
        currentPriceUsd: Number.isFinite(candidate.currentPriceUsd) ? candidate.currentPriceUsd : null,
        fiatExchangeRates: normalizeFiatExchangeRates(candidate.fiatExchangeRates),
        priceHistory: candidate.priceHistoryVersion === 1 ? deserializeNumberMap(candidate.priceHistory) : new Map(),
        intradayPriceHistory: candidate.priceHistoryVersion === 1 ? deserializeNumberMap(candidate.intradayPriceHistory) : new Map(),
        historyAvailable: candidate.priceHistoryVersion === 1 && candidate.historyAvailable !== false,
        historyMissingDays: Number.isFinite(candidate.historyMissingDays) ? candidate.historyMissingDays : 0,
        approximationMode: Boolean(candidate.approximationMode),
        timelineStart,
        timelineEnd,
        intradayStart,
        intradayEnd,
        addressSnapshots: snapshots,
        transactionDetailsByTxid: normalizeTransactionDetailsMap(candidate.transactionDetails),
        needsPriceHistoryRefresh: candidate.priceHistoryVersion !== 1,
        rebuiltTimelines,
      };
    }

    function rebuildCachedSnapshotTimelinesIfNeeded(
      snapshot,
      { timelineStart, timelineEnd, intradayStart, intradayEnd }
    ) {
      if (!snapshot || normalizeSnapshotDetailScope(snapshot.detailScope) === "SUMMARY") {
        return false;
      }

      let rebuilt = false;
      if (
        shouldRebuildCachedTimeline(snapshot.balanceTimeline, snapshot.txEvents, timelineStart, timelineEnd)
      ) {
        snapshot.balanceTimeline = buildDailyBalanceTimeline(
          snapshot.balanceSats,
          snapshot.txEvents,
          timelineStart,
          timelineEnd
        );
        rebuilt = true;
      }

      if (
        shouldRebuildCachedTimeline(
          snapshot.hourlyBalanceTimeline,
          snapshot.txEvents,
          intradayStart,
          intradayEnd
        )
      ) {
        snapshot.hourlyBalanceTimeline = buildIntervalBalanceTimeline(
          snapshot.balanceSats,
          snapshot.txEvents,
          intradayStart,
          intradayEnd,
          HOUR_MS,
          startOfUtcHour,
          toHourKey
        );
        rebuilt = true;
      }

      return rebuilt;
    }

    function shouldRebuildCachedTimeline(points, txEvents, startTimestamp, endTimestamp) {
      if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
        return false;
      }

      const events = Array.isArray(txEvents) ? txEvents : [];
      if (!events.length) {
        return false;
      }

      const validPoints = Array.isArray(points)
        ? points.filter((point) => Number.isFinite(point?.timestamp) && Number.isFinite(point?.balanceSats))
        : [];
      if (!validPoints.length) {
        return true;
      }

      const uniqueBalances = new Set(validPoints.map((point) => point.balanceSats));
      if (uniqueBalances.size > 1) {
        return false;
      }

      return events.some((event) => {
        const timestamp = Number(event?.timestamp);
        const netSats = Number(event?.netSats || 0);
        return (
          Number.isFinite(timestamp) &&
          timestamp >= startTimestamp &&
          timestamp <= endTimestamp &&
          netSats !== 0
        );
      });
    }

    function normalizeCachedSnapshot(snapshot, addressById) {
      if (!snapshot || typeof snapshot !== "object" || typeof snapshot.entryId !== "string") {
        return null;
      }

      const entry = addressById.get(snapshot.entryId);
      if (!entry || entry.needsHistoryRefresh || !isSatoshiAmount(snapshot.balanceSats)) {
        return null;
      }

      return {
        entry,
        provider: typeof snapshot.provider === "string" ? snapshot.provider : "",
        refreshedAt: isTimestamp(snapshot.refreshedAt) ? snapshot.refreshedAt : null,
        refreshFailed: Boolean(snapshot.refreshFailed),
        balanceSats: Number(snapshot.balanceSats || 0),
        usdValue: Number.isFinite(snapshot.usdValue) ? snapshot.usdValue : null,
        approximate: Boolean(snapshot.approximate),
        detailScope: normalizeSnapshotDetailScope(snapshot.detailScope),
        txEvents: normalizeCachedTxEvents(snapshot.txEvents),
        balanceTimeline: normalizeCachedBalanceTimeline(snapshot.balanceTimeline),
        hourlyBalanceTimeline: normalizeCachedBalanceTimeline(snapshot.hourlyBalanceTimeline),
      };
    }

    function serializeNumberMap(source) {
      if (!(source instanceof Map)) {
        return [];
      }

      return [...source.entries()].filter(
        (entry) => typeof entry[0] === "string" && Number.isFinite(entry[1])
      );
    }

    function deserializeNumberMap(source) {
      const map = new Map();
      if (!Array.isArray(source)) {
        return map;
      }

      source.slice(0, MAX_TIMELINE_POINTS).forEach((entry) => {
        if (Array.isArray(entry) && typeof entry[0] === "string" && Number.isFinite(entry[1])) {
          map.set(entry[0], entry[1]);
        }
      });
      return map;
    }

    function normalizeFiatExchangeRates(source) {
      const map = createDefaultFiatExchangeRates();
      const candidate = source instanceof Map ? source : deserializeNumberMap(source);

      SUPPORTED_FIAT_CURRENCIES.forEach((currency) => {
        if (currency === "USD") {
          return;
        }

        const rate = candidate.get(currency);
        if (Number.isFinite(rate) && rate > 0) {
          map.set(currency, rate);
        }
      });

      return map;
    }

    function mergeFiatExchangeRates(preferred, fallback) {
      const merged = normalizeFiatExchangeRates(fallback);
      normalizeFiatExchangeRates(preferred).forEach((value, key) => {
        merged.set(key, value);
      });
      return merged;
    }

    function mergeNumberMaps(fallback, preferred) {
      const merged = fallback instanceof Map ? new Map(fallback) : new Map();
      if (preferred instanceof Map) {
        preferred.forEach((value, key) => {
          if (typeof key === "string" && Number.isFinite(value)) {
            merged.set(key, value);
          }
        });
      }
      return merged;
    }

    function areNumberMapsEqual(left, right) {
      const normalizedLeft = left instanceof Map ? left : new Map();
      const normalizedRight = right instanceof Map ? right : new Map();
      if (normalizedLeft.size !== normalizedRight.size) {
        return false;
      }

      for (const [key, value] of normalizedLeft.entries()) {
        if (normalizedRight.get(key) !== value) {
          return false;
        }
      }

      return true;
    }

    function serializeTxEvents(
      source,
      {
        includeAddressDetails = true,
        maxItems = Infinity,
      } = {}
    ) {
      if (!Array.isArray(source)) {
        return [];
      }

      const limit = Number.isFinite(maxItems) && maxItems >= 0
        ? Math.min(maxItems, MAX_TRANSACTIONS_PER_ADDRESS) : MAX_TRANSACTIONS_PER_ADDRESS;
      return source.slice(0, limit).map((event) => ({
        txid: event.txid,
        timestamp: Number(event.timestamp || 0),
        confirmed: Boolean(event.confirmed),
        receivedSats: Number(event.receivedSats || 0),
        sentSats: Number(event.sentSats || 0),
        netSats: Number(event.netSats || 0),
        feeSats: Number.isFinite(event.feeSats) ? Number(event.feeSats) : null,
        feeRateSatVb: Number.isFinite(event.feeRateSatVb) ? Number(event.feeRateSatVb) : null,
        inputAddresses:
          includeAddressDetails && Array.isArray(event.inputAddresses) ? event.inputAddresses : [],
        outputAddresses:
          includeAddressDetails && Array.isArray(event.outputAddresses) ? event.outputAddresses : [],
        walletInputAddresses:
          includeAddressDetails && Array.isArray(event.walletInputAddresses)
            ? event.walletInputAddresses
            : [],
        walletOutputAddresses:
          includeAddressDetails && Array.isArray(event.walletOutputAddresses)
            ? event.walletOutputAddresses
            : [],
      }));

    }

    function normalizeCachedTxEvents(source) {
      if (!Array.isArray(source)) {
        return [];
      }

      return source
        .slice(0, MAX_TRANSACTIONS_PER_ADDRESS)
        .map((event) => {
          if (!event || !isValidTxid(event.txid) || !isTimestamp(event.timestamp) ||
            !isSatoshiAmount(event.receivedSats) || !isSatoshiAmount(event.sentSats) ||
            event.netSats !== event.receivedSats - event.sentSats) {
            return null;
          }

          return {
            txid: event.txid,
            timestamp: Number(event.timestamp || 0),
            confirmed: Boolean(event.confirmed),
            receivedSats: Number(event.receivedSats || 0),
            sentSats: Number(event.sentSats || 0),
            netSats: Number(event.netSats || 0),
            feeSats: Number.isFinite(event.feeSats) ? Number(event.feeSats) : null,
            feeRateSatVb: Number.isFinite(event.feeRateSatVb) ? Number(event.feeRateSatVb) : null,
            inputAddresses: Array.isArray(event.inputAddresses)
              ? uniqueStrings(event.inputAddresses.filter((entry) => typeof entry === "string" && entry.trim()))
              : [],
            outputAddresses: Array.isArray(event.outputAddresses)
              ? uniqueStrings(event.outputAddresses.filter((entry) => typeof entry === "string" && entry.trim()))
              : [],
            walletInputAddresses: Array.isArray(event.walletInputAddresses)
              ? uniqueStrings(
                  event.walletInputAddresses.filter((entry) => typeof entry === "string" && entry.trim())
                )
              : [],
            walletOutputAddresses: Array.isArray(event.walletOutputAddresses)
              ? uniqueStrings(
                  event.walletOutputAddresses.filter((entry) => typeof entry === "string" && entry.trim())
                )
              : [],
          };
        })
        .filter(Boolean);
    }

    function serializeTransactionDetailsMap(source) {
      const entries = source instanceof Map ? [...source.entries()] : [];
      return entries
        .filter(([txid, details]) => isValidTxid(txid) && details && typeof details === "object")
        .slice(-MAX_TRANSACTIONS_PER_ADDRESS)
        .map(([txid, details]) => [
          txid,
          normalizeTransactionDetails({
            txid,
            ...details,
          }),
        ])
        .filter(([, details]) => details);
    }

    function normalizeTransactionDetailsMap(source) {
      if (!Array.isArray(source)) {
        return new Map();
      }

      const detailsByTxid = new Map();
      source.slice(-MAX_TRANSACTIONS_PER_ADDRESS).forEach((entry) => {
        if (!Array.isArray(entry) || entry.length < 2 || !isValidTxid(entry[0])) {
          return;
        }

        const details = normalizeTransactionDetails({
          ...entry[1],
          txid: entry[0],
        });
        if (details) {
          detailsByTxid.set(entry[0], details);
        }
      });
      return detailsByTxid;
    }

    function normalizeTransactionDetails(candidate) {
      if (!candidate || typeof candidate !== "object" || !isValidTxid(candidate.txid)) {
        return null;
      }

      return {
        txid: candidate.txid,
        feeSats: Number.isFinite(candidate.feeSats) ? Number(candidate.feeSats) : null,
        feeRateSatVb: Number.isFinite(candidate.feeRateSatVb)
          ? Number(candidate.feeRateSatVb)
          : null,
        inputAddresses: Array.isArray(candidate.inputAddresses)
          ? uniqueStrings(candidate.inputAddresses.filter((entry) => typeof entry === "string" && entry.trim()))
          : [],
        outputAddresses: Array.isArray(candidate.outputAddresses)
          ? uniqueStrings(candidate.outputAddresses.filter((entry) => typeof entry === "string" && entry.trim()))
          : [],
      };
    }

    function serializeBalanceTimeline(source) {
      if (!Array.isArray(source)) {
        return [];
      }

      return source.map((point) => ({
        dateKey: point.dateKey,
        timestamp: Number(point.timestamp || 0),
        balanceSats: Number(point.balanceSats || 0),
      }));
    }

    function normalizeCachedBalanceTimeline(source) {
      if (!Array.isArray(source)) {
        return [];
      }

      return source
        .slice(0, MAX_TIMELINE_POINTS)
        .map((point) => {
          if (!point || typeof point.dateKey !== "string" || !isTimestamp(point.timestamp) ||
              !isSatoshiAmount(point.balanceSats)) {
            return null;
          }

          return {
            dateKey: point.dateKey,
            timestamp: Number(point.timestamp || 0),
            balanceSats: Number(point.balanceSats || 0),
          };
        })
        .filter(Boolean);
    }

    function normalizeGroups(rawGroups) {
      const source = (Array.isArray(rawGroups) && rawGroups.length ? rawGroups : DEFAULT_WALLET_NAMES).slice(
        0,
        MAX_WALLETS
      );
      const normalized = [];
      const seen = new Set();

      source.forEach((group) => {
        const name = typeof group === "string" ? group : group?.name;
        const normalizedName = normalizeWalletName(name);
        if (!normalizedName) {
          return;
        }

        const key = normalizedName.toLowerCase();
        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        normalized.push({
          id: typeof group === "object" && typeof group.id === "string" ? group.id : createId("grp"),
          name: normalizedName,
        });
      });

      return normalized.length ? normalized : buildDefaultState().groups;
    }

    function normalizeAddresses(rawAddresses, groupNameToId, validGroupIds) {
      const source = Array.isArray(rawAddresses) ? rawAddresses.slice(0, MAX_WATCHED_ADDRESSES) : [];
      const seen = new Set();
      const normalized = [];

      source.forEach((entry) => {
        const address = normalizeBitcoinAddress(entry?.address);
        if (!address) {
          return;
        }

        const key = normalizeBitcoinAddress(address);
        if (seen.has(key)) {
          return;
        }
        seen.add(key);

        let groupId = null;
        if (typeof entry.groupId === "string" && validGroupIds.has(entry.groupId)) {
          groupId = entry.groupId;
        } else if (typeof entry.group === "string") {
          groupId = groupNameToId.get(entry.group.toLowerCase()) || null;
        }

        normalized.push({
          id: typeof entry.id === "string" ? entry.id : createId("addr"),
          address,
          needsHistoryRefresh: address !== entry.address.trim(),
          tags: normalizeAddressTags(entry.tags),
          groupId,
          createdAt:
            typeof entry.createdAt === "string" && !Number.isNaN(Date.parse(entry.createdAt))
              ? entry.createdAt
              : new Date().toISOString(),
        });
      });

      return normalized;
    }


    return {
      buildDefaultState,
      loadState,
      saveState,
      loadRuntimeCache,
      saveRuntimeCache,
      clearRuntimeCache,
      normalizeImportedState,
      buildRuntimeCacheCandidates,
      serializeRuntimeCache,
      normalizeRuntimeCache,
      deserializeNumberMap,
      normalizeFiatExchangeRates,
      mergeFiatExchangeRates,
      mergeNumberMaps,
      areNumberMapsEqual,
      normalizeCachedTxEvents,
      normalizeTransactionDetails,
      normalizeCachedBalanceTimeline
    };
  }
  root.BITKIT_WATCH_STORAGE = { create };
  if (typeof module === "object" && module.exports) module.exports = { create };
})(globalThis);
