/*
  Bitkit Watch local prototype
  Open index.html directly in a browser. No build step is required.

  API swap points:
  - ADDRESS_API_PROVIDERS below can be replaced with your preferred on-chain providers.
  - PRICE_API layer below can be replaced with an internal market data service later.
*/

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants and configuration
  // ---------------------------------------------------------------------------

  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;
  const CACHE_MAX_AGE_MS = HOUR_MS;
  const ONE_YEAR_DAYS = 365;
  const HISTORY_DAYS = 120;
  const COLLAPSED_TRANSACTION_COUNT = 3;
  const TRANSACTION_PAGE_SIZE = 10;
  const MAX_PASTED_ADDRESSES = 10;
  const DUST_ACTIVITY_THRESHOLD_SATS = 1000;
  const DETAIL_CHART_RANGES = {
    "1D": "1 day",
    "30D": "30 day",
    "1Y": "1 year",
    ALL: "All time",
  };
  const STORAGE_KEYS = {
    state: "bitkit-vault-state-v1",
    runtimeCache: "bitkit-vault-runtime-cache-v1",
  };
  const FIGMA_CAPTURE_HASH_KEYS = Object.freeze([
    "figmacapture",
    "figmaendpoint",
    "figmadelay",
    "figmaselector",
  ]);

  const DEFAULT_WALLET_NAMES = ["Savings", "Retirement"];
  const LEGACY_BUSINESS_WALLET_NAME = "Business";
  const SATOSHI_DEMO_KEY = "satoshi-v1";
  const SATOSHI_DEMO_NAME = "Satoshi";
  const SATOSHI_DEMO_ADDRESSES = [
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    "12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S",
    "12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX",
    "1HLoD9E4SDFFPDiYfNYnkBLQ85Y51J3Zb1",
    "1FvzCLoTPGANNjWoUo6jUGuAG3wg1w4YjR",
  ];
  const SATOSHI_DEMO_ADDRESS_TAGS = Object.freeze({
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa": ["genesis", "unspendable"],
  });
  const SATOSHI_BAKED_SNAPSHOT = normalizeBakedDemoSnapshot(globalThis.BITKIT_VAULT_SATOSHI_SNAPSHOT);
  const BUNDLED_BITCOIN_FACTS = globalThis.BITKIT_VAULT_BITCOIN_FACTS;
  const PROBABLE_MNEMONIC_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
  const EXTENDED_PRIVATE_KEY_PREFIXES = Object.freeze([
    "xprv",
    "yprv",
    "zprv",
    "Yprv",
    "Zprv",
    "tprv",
    "uprv",
    "vprv",
    "Uprv",
    "Vprv",
  ]);
  const ADDRESS_API_PROVIDERS = [
    { name: "Mempool", baseUrl: "https://mempool.space/api" },
    { name: "Blockstream", baseUrl: "https://blockstream.info/api" },
  ];
  const SUPPORTED_FIAT_CURRENCIES = Object.freeze(["USD", "EUR", "JPY", "GBP", "CNY"]);
  const FIAT_DISPLAY_META = Object.freeze({
    USD: { prefix: "$", icon: "$", fractionDigits: 2 },
    EUR: { prefix: "€", icon: "€", fractionDigits: 2 },
    JPY: { prefix: "¥", icon: "¥", fractionDigits: 0 },
    GBP: { prefix: "£", icon: "£", fractionDigits: 2 },
    CNY: { prefix: "CN¥", icon: "¥", fractionDigits: 2 },
  });
  const FAQ_ITEMS = Object.freeze([
    {
      question: "Does Bitkit Watch hold my keys?",
      answer:
        "No. Bitkit Watch is watch-only. It never asks for a seed, never imports a private key, and cannot sign on your behalf.",
    },
    {
      question: "Where does my data live?",
      answer:
        "On this device, in this browser. Wallet names, watchlists, settings, and cached snapshots stay local until you wipe them.",
    },
    {
      question: "Does Synonym get my watchlist?",
      answer:
        "There is no Bitkit Watch account and no cloud sync. Synonym does not get a hosted profile of your watch-only setup.",
    },
    {
      question: "What gets sent to APIs?",
      answer:
        "Only the public addresses you choose to watch, plus market-data requests needed to price them. Enough to price your stack, not enough to control it.",
    },
    {
      question: "Can Bitkit Watch move my bitcoin?",
      answer:
        "Not a chance. No signing. No custody. No hot wallet tricks. It cannot spend your ₿. Download Bitkit for iOS and Android to intentionally spend your bitcoin.",
    },
    {
      question: "How do I stay extra private?",
      answer:
        "Watch-only is safer, but not invisible. Address lookups still touch public APIs, so use a fresh browser profile, VPN, or Tor when you want more distance.",
    },
  ]);
  const DEFAULT_SETTINGS = Object.freeze({
    activeWalletId: null,
    activeAddressId: null,
    displayUnit: "BTC",
    fiatCurrency: "USD",
    hideDust: true,
    bitcoinNotation: "MODERN",
    showBackgroundGraphics: true,
  });
  const DOM_ID_GROUPS = {
    header: [
      "brandHomeButton",
      "vaultHomeButton",
      "refreshButton",
      "toggleBalancesButton",
      "balanceToggleIcon",
      "unitDisplayButton",
      "unitDisplayButtonLabel",
      "settingsButton",
      "faqButton",
      "headerStatus",
      "faqHeaderDivider",
      "faqCrumb",
      "walletHeaderDivider",
      "walletCrumb",
      "addressHeaderDivider",
      "addressCrumb",
      "addressStatusDivider",
      "addressCopyStatus",
      "addressCrumbTextFull",
      "addressCrumbTextShort",
      "walletTitleButton",
      "walletTitleText",
      "walletTitleIcon",
      "walletTitleCaret",
      "walletDeleteButton",
    ],
    overview: ["walletsOverview", "walletGrid", "overviewFaqButton"],
    faq: ["faqView", "faqGrid"],
    detail: [
      "walletDetail",
      "walletSecondarySummary",
      "walletPrimarySummary",
      "walletTransactions",
      "walletTransactionsToggle",
      "addressTagsSection",
      "addressTagList",
      "addressTagForm",
      "addressTagInput",
      "addressTagFeedback",
      "walletAddressesSection",
      "walletDetailSidebar",
      "walletAddressesKicker",
      "walletAddressesHeading",
      "walletAddressList",
      "walletAddAddressForm",
      "walletAddressInput",
      "walletAddressEmptyWarning",
      "walletAddressFeedback",
      "walletChartKicker",
      "walletChartTitleSymbol",
      "walletChartTitleText",
      "walletChartGrowth",
      "walletChartTabs",
      "walletChartStage",
      "walletFactsSection",
      "walletFactsText",
      "walletFactsButton",
    ],
    modals: [
      "chartModal",
      "chartModalBackdrop",
      "chartModalClose",
      "chartModalKicker",
      "chartModalTitleSymbol",
      "chartModalTitleText",
      "chartModalGrowth",
      "chartModalTabs",
      "chartModalStage",
      "settingsModal",
      "settingsModalBackdrop",
      "settingsModalClose",
      "settingsFooterCloseButton",
      "settingsClearStorageButton",
      "settingsHideDustButton",
      "settingsBackgroundGraphicsButton",
      "settingsNotationModern",
      "settingsNotationClassic",
      "settingsFiatIcon",
      "settingsFiatNotice",
      "settingsFiatUsd",
      "settingsFiatEur",
      "settingsFiatJpy",
      "settingsFiatGbp",
      "settingsFiatCny",
      "transactionModal",
      "transactionModalBackdrop",
      "transactionModalClose",
      "transactionModalKicker",
      "transactionModalBody",
    ],
    shell: ["appBanner", "appFooterPrice", "appFooterPriceReference", "appFooterPriceValue"],
  };

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const dom = {};
  let bitcoinFacts = [];
  let chartResizeFrame = 0;
  let headerStatusTimer = 0;
  let addressFeedbackFadeTimer = 0;
  let addressFeedbackHideTimer = 0;
  let overviewDetailPreloadPromise = null;
  const StorageLayer = {
    buildDefaultState,
    loadState,
    saveState,
    normalizeImportedState,
    loadRuntimeCache,
    saveRuntimeCache,
    clearRuntimeCache,
  };

  const HISTORY_SCOPE_ORDER = {
    SUMMARY: 0,
    "30D": 1,
    "1Y": 2,
    ALL: 3,
  };

  let state = StorageLayer.loadState();
  let runtime = createRuntimeState();

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheDom();
    sanitizeState();
    hydrateRuntimeFromCache();
    const bootstrappedDemoCache = hydrateBakedDemoRuntimeIfNeeded();
    bitcoinFacts = normalizeBitcoinFactsPayload(BUNDLED_BITCOIN_FACTS);
    ensureCurrentBitcoinFactIndex();
    applyRouteFromHash({ replaceInvalid: true, renderAfter: false, preloadDetail: false });
    StorageLayer.saveState(state);
    bindEvents();
    render();
    syncViewRoute("replace");
    if (getFiatCurrency() !== "USD") {
      refreshFiatExchangeRatesInBackground();
    }
    if (state.addresses.length) {
      refreshCurrentPriceInBackground();
    }
    if (state._loadWarning) {
      runtime.banner = {
        tone: "warning",
        text: state._loadWarning,
      };
      renderBanner();
    }

    if (bootstrappedDemoCache) {
      refreshVault({ reason: "demo-preload", allowSkeleton: false }).catch(() => {
        render();
      });
      return;
    }

    if (shouldAutoRefreshVault()) {
      refreshVault({ reason: "initial", allowSkeleton: !runtime.hasLoadedOnce }).catch((error) => {
        setBanner("error", `Refresh failed. ${error.message || "Public APIs did not respond."}`);
        render();
      });
    }
  }

  function createRuntimeState() {
    return {
      isLoading: false,
      isRefreshing: false,
      hasLoadedOnce: false,
      historyScope: "SUMMARY",
      currentPriceUsd: null,
      fiatExchangeRates: createDefaultFiatExchangeRates(),
      currentPriceFiat: null,
      currentPriceFiatCurrency: null,
      fiatPriceHistory: new Map(),
      fiatIntradayPriceHistory: new Map(),
      priceHistory: new Map(),
      intradayPriceHistory: new Map(),
      historyAvailable: true,
      historyMissingDays: 0,
      addressSnapshots: [],
      partialFailures: [],
      approximationMode: false,
      banner: null,
      headerStatus: "",
      headerStatusTone: "default",
      currentView: "watch",
      currentFactIndex: null,
      lastFactsWalletId: null,
      chartModalOpen: false,
      settingsModalOpen: false,
      timelineStart: null,
      timelineEnd: null,
      intradayStart: null,
      intradayEnd: null,
      editingWalletId: null,
      walletNameDraft: "",
      transactionVisibleCountByDetailId: {},
      selectedTransactionTxid: null,
      expandedTechnicalTransactionTxid: null,
      transactionTechnicalAnimationTimer: null,
      transactionDetailsLoadingTxids: [],
    };
  }

  function hydrateRuntimeFromCache() {
    const cachedRuntime = StorageLayer.loadRuntimeCache(state);
    if (!cachedRuntime) {
      return;
    }

    runtime = {
      ...runtime,
      ...cachedRuntime,
      hasLoadedOnce: cachedRuntime.addressSnapshots.length > 0,
    };
  }

  function hydrateBakedDemoRuntimeIfNeeded() {
    if (!SATOSHI_BAKED_SNAPSHOT || runtime.hasLoadedOnce || runtime.addressSnapshots.length || !isFreshSatoshiDemoVault()) {
      return false;
    }

    const snapshots = state.addresses
      .filter((entry) =>
        Object.prototype.hasOwnProperty.call(SATOSHI_BAKED_SNAPSHOT.balancesByAddress, entry.address)
      )
      .map((entry) =>
        PortfolioLayer.buildSummarySnapshot({
          entry,
          provider: "Baked Demo Cache",
          balanceSats: SATOSHI_BAKED_SNAPSHOT.balancesByAddress[entry.address],
          currentPriceUsd: SATOSHI_BAKED_SNAPSHOT.currentPriceUsd,
        })
      );

    if (!snapshots.length) {
      return false;
    }

    runtime = {
      ...runtime,
      hasLoadedOnce: true,
      currentPriceUsd: SATOSHI_BAKED_SNAPSHOT.currentPriceUsd,
      addressSnapshots: snapshots,
      partialFailures: [],
      approximationMode: false,
      banner: {
        tone: "default",
        text: `Loaded Satoshi demo snapshot from ${formatBootstrapTimestamp(SATOSHI_BAKED_SNAPSHOT.asOf)}. Updating in background.`,
      },
    };

    StorageLayer.saveRuntimeCache(runtime);

    return true;
  }

  function normalizeBitcoinFactsPayload(payload) {
    const source = Array.isArray(payload) ? payload : payload?.facts;
    if (!Array.isArray(source)) {
      return [];
    }

    return uniqueStrings(
      source.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
    );
  }

  function ensureCurrentBitcoinFactIndex() {
    if (!bitcoinFacts.length) {
      runtime.currentFactIndex = null;
      return;
    }

    if (
      Number.isInteger(runtime.currentFactIndex) &&
      runtime.currentFactIndex >= 0 &&
      runtime.currentFactIndex < bitcoinFacts.length
    ) {
      return;
    }

    runtime.currentFactIndex = getRandomBitcoinFactIndex();
  }

  function getRandomBitcoinFactIndex(excludedIndex = null) {
    if (!bitcoinFacts.length) {
      return null;
    }

    if (bitcoinFacts.length === 1) {
      return 0;
    }

    let nextIndex = Math.floor(Math.random() * bitcoinFacts.length);
    while (nextIndex === excludedIndex) {
      nextIndex = Math.floor(Math.random() * bitcoinFacts.length);
    }

    return nextIndex;
  }

  function showNextBitcoinFact() {
    if (!bitcoinFacts.length) {
      return;
    }

    runtime.currentFactIndex = getRandomBitcoinFactIndex(runtime.currentFactIndex);
    renderBitcoinFactsWidget(getActiveAddress());
  }

  function createDefaultSettings() {
    return { ...DEFAULT_SETTINGS };
  }

  function createDefaultFiatExchangeRates() {
    return new Map([["USD", 1]]);
  }

  function cacheDom() {
    Object.values(DOM_ID_GROUPS)
      .flat()
      .forEach((id) => {
        dom[id] = document.getElementById(id);
      });
  }

  // ---------------------------------------------------------------------------
  // Events and actions
  // ---------------------------------------------------------------------------

  function bindEvents() {
    window.addEventListener("hashchange", () => {
      applyRouteFromHash({ replaceInvalid: true, renderAfter: true, preloadDetail: true });
    });
    window.addEventListener("resize", scheduleChartResizeRender);

    dom.brandHomeButton.addEventListener("click", openOverview);
    dom.vaultHomeButton.addEventListener("click", openOverview);

    dom.refreshButton.addEventListener("click", () => {
      refreshCurrentScope({ reason: "manual", allowSkeleton: !runtime.hasLoadedOnce }).catch((error) => {
        setBanner("error", `Refresh failed. ${error.message || "Try again later."}`);
        render();
      });
    });

    dom.toggleBalancesButton.addEventListener("click", () => {
      state.hideBalances = !state.hideBalances;
      StorageLayer.saveState(state);
      syncBalanceToggle();
      render();
    });

    dom.unitDisplayButton.addEventListener("click", () => {
      state.settings.displayUnit = getDisplayUnit() === "BTC" ? "USD" : "BTC";
      StorageLayer.saveState(state);
      render();
    });

    dom.overviewFaqButton.addEventListener("click", openFaq);
    dom.settingsButton.addEventListener("click", openSettingsModal);
    dom.faqButton.addEventListener("click", () => {
      if (isFaqView()) {
        openOverview();
        return;
      }

      openFaq();
    });
    dom.settingsClearStorageButton.addEventListener("click", clearVault);
    dom.addressCrumb.addEventListener("click", copyActiveAddressToClipboard);
    dom.addressCrumb.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        copyActiveAddressToClipboard();
      }
    });

    dom.walletGrid.addEventListener("click", (event) => {
      const actionTarget = event.target.closest("[data-action]");
      if (!actionTarget) {
        return;
      }

      const action = actionTarget.dataset.action;
      if (action === "open-wallet") {
        openWallet(actionTarget.dataset.walletId);
      }

      if (action === "create-wallet") {
        createWallet();
      }
    });

    dom.walletTitleButton.addEventListener("click", (event) => {
      if (runtime.editingWalletId) {
        return;
      }

      const activeWallet = getActiveWallet();
      if (!activeWallet) {
        return;
      }

      if (getActiveAddress()) {
        openWallet(activeWallet.id);
        return;
      }

      enterWalletRename();
    });

    dom.walletDeleteButton.addEventListener("click", () => {
      const activeWallet = getActiveWallet();
      if (activeWallet) {
        removeWallet(activeWallet.id);
      }
    });

    dom.walletTitleButton.addEventListener("keydown", (event) => {
      if (runtime.editingWalletId) {
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (getActiveAddress()) {
          const activeWallet = getActiveWallet();
          if (activeWallet) {
            openWallet(activeWallet.id);
          }
          return;
        }

        enterWalletRename();
      }
    });

    dom.walletTitleText.addEventListener("input", () => {
      if (!runtime.editingWalletId) {
        return;
      }

      const normalized = normalizeWalletName(dom.walletTitleText.textContent || "");
      runtime.walletNameDraft = normalized;
      if (dom.walletTitleText.textContent !== normalized) {
        dom.walletTitleText.textContent = normalized;
        placeCaretAtEnd(dom.walletTitleText);
      }
    });

    dom.walletTitleText.addEventListener("keydown", (event) => {
      if (!runtime.editingWalletId) {
        return;
      }

      if (isEnterKeyEvent(event)) {
        event.preventDefault();
        commitWalletRename();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        cancelWalletRename();
      }
    });

    dom.walletTitleText.addEventListener("beforeinput", (event) => {
      if (!runtime.editingWalletId) {
        return;
      }

      if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
        event.preventDefault();
        commitWalletRename();
      }
    });

    dom.walletTitleText.addEventListener("mouseup", () => {
      if (runtime.editingWalletId) {
        placeCaretAtEnd(dom.walletTitleText);
      }
    });

    dom.walletTitleText.addEventListener("blur", () => {
      if (runtime.editingWalletId) {
        commitWalletRename({ quiet: true });
      }
    });

    dom.walletTransactionsToggle.addEventListener("click", () => {
      const detailKey = getActiveDetailKey();
      if (!detailKey) {
        return;
      }

      runtime.transactionVisibleCountByDetailId[detailKey] =
        getVisibleTransactionCount(detailKey) + TRANSACTION_PAGE_SIZE;
      render();
    });

    dom.walletTransactions.addEventListener("click", (event) => {
      const openButton = event.target.closest("[data-action='open-transaction']");
      if (!openButton) {
        return;
      }

      const activeDetailKey = getActiveDetailKey();
      if (!activeDetailKey || !openButton.dataset.txid) {
        return;
      }

      openTransactionDetail(activeDetailKey, openButton.dataset.txid);
    });

    dom.walletAddressList.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-action='remove-address']");
      if (removeButton) {
        removeAddress(removeButton.dataset.addressId);
        return;
      }

      const openButton = event.target.closest("[data-action='open-address']");
      if (openButton?.dataset.addressId) {
        openAddress(openButton.dataset.addressId);
      }
    });

    dom.walletAddAddressForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearAddressFeedback();

      const activeWallet = getActiveWallet();
      if (!activeWallet) {
        return;
      }

      const parsedAddresses = parseAddressInput(dom.walletAddressInput.value);
      if (!parsedAddresses.length) {
        showAddressFeedback("Enter a Bitcoin address.", "error");
        return;
      }

      const sensitiveInputCheck = await ValidationLayer.detectSensitiveBitcoinInput(
        dom.walletAddressInput.value,
        parsedAddresses
      );
      if (sensitiveInputCheck.detected) {
        dom.walletAddAddressForm.reset();
        showAddressFeedback(sensitiveInputCheck.message, "error");
        render();
        return;
      }

      if (parsedAddresses.length > MAX_PASTED_ADDRESSES) {
        showAddressFeedback(`You can add up to ${MAX_PASTED_ADDRESSES} addresses at once.`, "error");
        return;
      }

      const duplicateCheck = classifyAddressBatchDuplicates(parsedAddresses);
      if (duplicateCheck.existing.length) {
        showAddressFeedback(
          duplicateCheck.existing.length === 1
            ? "That address is already in Bitkit Watch."
            : `${duplicateCheck.existing.length} addresses are already in Bitkit Watch.`,
          "error"
        );
        return;
      }

      if (duplicateCheck.duplicates.length) {
        showAddressFeedback(
          duplicateCheck.duplicates.length === 1
            ? "Remove the duplicate address from your pasted list."
            : "Remove duplicate addresses from your pasted list.",
          "error"
        );
        return;
      }

      const addressesToAdd = duplicateCheck.unique;
      showAddressFeedback(
        addressesToAdd.length === 1
          ? "Validating address…"
          : `Validating ${addressesToAdd.length} addresses…`,
        "success"
      );
      const validationResults = await Promise.all(
        addressesToAdd.map(async (address) => ({
          address,
          isValid: await ValidationLayer.isValidMainnetBitcoinAddress(address),
        }))
      );
      const invalidAddresses = validationResults.filter((result) => !result.isValid).map((result) => result.address);
      if (invalidAddresses.length) {
        showAddressFeedback(
          invalidAddresses.length === 1
            ? "Enter a valid Bitcoin mainnet address."
            : `${invalidAddresses.length} pasted entries are not valid Bitcoin mainnet addresses.`,
          "error"
        );
        return;
      }

      const createdAt = new Date().toISOString();
      const newEntries = addressesToAdd.map((address) => ({
        id: createId("addr"),
        address,
        tags: [],
        groupId: activeWallet.id,
        createdAt,
      }));
      state.addresses.push(...newEntries);
      StorageLayer.saveState(state);
      dom.walletAddAddressForm.reset();
      showAddressFeedback(
        newEntries.length === 1
          ? "Address added. Loading current balance…"
          : `${newEntries.length} addresses added. Loading current balances…`,
        "success"
      );
      render();

      try {
        if (newEntries.length === 1) {
          await hydrateAddressAfterAdd(newEntries[0]);
        } else {
          await hydrateAddressesAfterAdd(newEntries);
        }
        showAddressFeedback(
          newEntries.length === 1
            ? "Address added to the wallet."
            : `${newEntries.length} addresses added to the wallet.`,
          "success"
        );
      } catch (error) {
        showAddressFeedback(
          `${newEntries.length === 1 ? "Address" : "Addresses"} saved locally, but loading failed. ${
            error.message || "Try again later."
          }`,
          "error"
        );
      }
    });

    dom.addressTagForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addAddressTag();
    });

    dom.addressTagInput.addEventListener("input", () => {
      clearAddressTagFeedback();
    });

    dom.addressTagList.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-action='remove-tag']");
      if (!removeButton?.dataset.tag) {
        return;
      }

      removeAddressTag(removeButton.dataset.tag);
    });

    const onChartRangeClick = (event) => {
      const button = event.target.closest("[data-range]");
      if (!button) {
        return;
      }

      const nextRange = normalizeChartRange(button.dataset.range);
      if (nextRange === state.selectedRange) {
        return;
      }

      state.selectedRange = nextRange;
      StorageLayer.saveState(state);
      render();

      if (state.addresses.length && !hasCompleteDetailCoverage(getRequiredDetailScopeForRange(nextRange))) {
        refreshVault({ reason: "all-time", allowSkeleton: false }).catch((error) => {
          setBanner("warning", `History failed to load. ${error.message || "Try again later."}`);
          render();
        });
      }
    };

    dom.walletChartTabs.addEventListener("click", onChartRangeClick);
    dom.chartModalTabs.addEventListener("click", onChartRangeClick);
    dom.walletChartStage.addEventListener("click", openChartModal);
    dom.walletChartStage.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openChartModal();
      }
    });
    dom.chartModalBackdrop.addEventListener("click", closeChartModal);
    dom.chartModalClose.addEventListener("click", closeChartModal);
    dom.walletFactsButton.addEventListener("click", showNextBitcoinFact);

    dom.settingsModalBackdrop.addEventListener("click", closeSettingsModal);
    dom.settingsModalClose.addEventListener("click", closeSettingsModal);
    dom.settingsFooterCloseButton.addEventListener("click", closeSettingsModal);
    dom.settingsHideDustButton.addEventListener("click", () => {
      state.settings.hideDust = !state.settings.hideDust;
      StorageLayer.saveState(state);
      render();
    });
    dom.settingsBackgroundGraphicsButton.addEventListener("click", () => {
      state.settings.showBackgroundGraphics = !state.settings.showBackgroundGraphics;
      StorageLayer.saveState(state);
      render();
    });
    [dom.settingsNotationModern, dom.settingsNotationClassic].forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked || !input.dataset.notation) {
          return;
        }

        const nextNotation = normalizeBitcoinNotation(input.dataset.notation);
        if (state.settings.bitcoinNotation === nextNotation) {
          return;
        }

        state.settings.bitcoinNotation = nextNotation;
        StorageLayer.saveState(state);
        render();
      });
    });
    [
      dom.settingsFiatUsd,
      dom.settingsFiatEur,
      dom.settingsFiatJpy,
      dom.settingsFiatGbp,
      dom.settingsFiatCny,
    ].forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked || !input.dataset.fiat) {
          return;
        }

        const nextFiat = normalizeFiatCurrency(input.dataset.fiat);
        if (state.settings.fiatCurrency === nextFiat) {
          return;
        }

        state.settings.fiatCurrency = nextFiat;
        StorageLayer.saveState(state);
        render();

        if (nextFiat !== "USD" && !Number.isFinite(getFiatExchangeRate(nextFiat))) {
          refreshFiatExchangeRatesInBackground();
        }
      });
    });

    dom.transactionModalBackdrop.addEventListener("click", closeTransactionDetail);
    dom.transactionModalClose.addEventListener("click", closeTransactionDetail);
    dom.transactionModalBody.addEventListener("click", (event) => {
      const technicalAddressButton = event.target.closest("[data-action='open-technical-address']");
      if (technicalAddressButton?.dataset.addressId) {
        openAddress(technicalAddressButton.dataset.addressId);
        return;
      }

      const toggleButton = event.target.closest("[data-action='toggle-technical']");
      if (!toggleButton) {
        return;
      }

      toggleTransactionTechnicalDetails(toggleButton.dataset.txid || "");
    });

    document.addEventListener("keydown", (event) => {
      if (runtime.editingWalletId) {
        if (isEnterKeyEvent(event)) {
          event.preventDefault();
          event.stopPropagation();
          commitWalletRename();
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelWalletRename();
          return;
        }
      }

      if (event.key === "Escape" && runtime.selectedTransactionTxid) {
        event.preventDefault();
        closeTransactionDetail();
        return;
      }

      if (event.key === "Escape" && runtime.settingsModalOpen) {
        event.preventDefault();
        closeSettingsModal();
        return;
      }

      if (event.key === "Escape" && runtime.chartModalOpen) {
        event.preventDefault();
        closeChartModal();
      }
    }, true);
  }

  async function refreshVault({ reason, allowSkeleton }) {
    if (!state.addresses.length) {
      runtime = {
        ...createRuntimeState(),
        banner: null,
      };
      setHeaderStatus(reason === "manual" ? "No addresses to refresh." : "");
      render();
      return;
    }

    runtime.isLoading = allowSkeleton && !runtime.hasLoadedOnce;
    runtime.isRefreshing = runtime.hasLoadedOnce;
    runtime.partialFailures = [];
    setHeaderStatus("");
    if (reason !== "initial") {
      runtime.banner = null;
    }
    render();

    const isOverviewFastRefresh = !getActiveWallet() && reason !== "detail-preload";
    const shouldPreloadOverviewDetail = isOverviewFastRefresh && shouldPreloadOverviewDetailInBackground();
    const requestedHistoryScope = isOverviewFastRefresh
      ? "SUMMARY"
      : getFullHistoryScopeForBackground();
    const startTimestamp = isOverviewFastRefresh
      ? startOfUtcHour(Date.now() - 23 * HOUR_MS)
      : requestedHistoryScope === "ALL"
        ? 0
        : startOfUtcDay(Date.now() - (ONE_YEAR_DAYS - 1) * DAY_MS);
    const endTimestamp = Date.now();

    try {
      const addressResults = await Promise.allSettled(
        state.addresses.map((entry) => APILayer.fetchAddressBundle(entry.address, startTimestamp))
      );
      const effectiveStartTimestamp =
        requestedHistoryScope === "ALL"
          ? getHistoryStartTimestampFromAddressResults(addressResults) ||
            startOfUtcDay(Date.now() - (ONE_YEAR_DAYS - 1) * DAY_MS)
          : startTimestamp;
      const marketData = await APILayer.fetchMarketData(
        effectiveStartTimestamp,
        endTimestamp,
        getFiatCurrency()
      );
      const rateLimitWarnings = collectRateLimitWarningsFromSettledResults(addressResults);

      const snapshots = [];
      const partialFailures = [];
      let approximationMode = false;

      addressResults.forEach((result, index) => {
        const entry = state.addresses[index];
        if (result.status === "fulfilled") {
          const snapshot = PortfolioLayer.buildAddressSnapshot({
            entry,
            bundle: result.value.bundle,
            provider: result.value.provider,
            currentPriceUsd: marketData.currentPriceUsd,
            priceHistory: marketData.priceHistory,
            startTimestamp: effectiveStartTimestamp,
            endTimestamp,
            detailScope: requestedHistoryScope,
          });

          snapshots.push(snapshot);
          if (snapshot.approximate) {
            approximationMode = true;
          }
        } else {
          partialFailures.push({
            address: entry.address,
            message: result.reason?.message || "Address data unavailable.",
          });
        }
      });

      if (!snapshots.length) {
        throw new Error("All address lookups failed.");
      }

      if (partialFailures.length) {
        approximationMode = true;
      }

      if (!marketData.historyAvailable || marketData.historyMissingDays > 0) {
        approximationMode = true;
      }

      const bannerParts = [];
      if (rateLimitWarnings.length) {
        bannerParts.push(formatRateLimitWarning(rateLimitWarnings));
      }
      if (partialFailures.length) {
        bannerParts.push(
          `${partialFailures.length} ${
            partialFailures.length === 1 ? "address" : "addresses"
          } could not be refreshed. Showing partial data.`
        );
      }
      if (!marketData.historyAvailable) {
        bannerParts.push("Historical BTC/USD data is unavailable, so wallet growth is approximate.");
      } else if (marketData.historyMissingDays > 0) {
        bannerParts.push("Historical BTC/USD data has gaps, so some wallet growth points are approximate.");
      }

      runtime = {
        ...runtime,
        isLoading: false,
        isRefreshing: false,
        hasLoadedOnce: true,
        currentPriceUsd: marketData.currentPriceUsd,
        fiatExchangeRates: mergeFiatExchangeRates(marketData.fiatExchangeRates, runtime.fiatExchangeRates),
        currentPriceFiat: Number.isFinite(marketData.displayFiatMarket?.currentPrice)
          ? marketData.displayFiatMarket.currentPrice
          : null,
        currentPriceFiatCurrency: marketData.displayFiatMarket?.currency || null,
        fiatPriceHistory:
          marketData.displayFiatMarket?.priceHistory instanceof Map
            ? marketData.displayFiatMarket.priceHistory
            : new Map(),
        fiatIntradayPriceHistory:
          marketData.displayFiatMarket?.intradayPriceHistory instanceof Map
            ? marketData.displayFiatMarket.intradayPriceHistory
            : new Map(),
        priceHistory: marketData.priceHistory,
        intradayPriceHistory: marketData.intradayPriceHistory,
        historyAvailable: marketData.historyAvailable,
        historyMissingDays: marketData.historyMissingDays,
        addressSnapshots: snapshots,
        partialFailures,
        approximationMode,
        historyScope: requestedHistoryScope,
        banner: bannerParts.length
          ? {
              tone: "warning",
              text: bannerParts.join(" "),
            }
          : null,
        timelineStart: effectiveStartTimestamp,
        timelineEnd: endTimestamp,
        intradayStart: marketData.intradayStart,
        intradayEnd: marketData.intradayEnd,
      };
      setHeaderStatus(bannerParts.length || reason !== "manual" ? "" : "Watch refreshed");

      state.lastUpdated = new Date().toISOString();
      StorageLayer.saveState(state);
      StorageLayer.saveRuntimeCache(runtime);
      render();
      if (shouldPreloadOverviewDetail) {
        preloadOverviewDetailDataIfNeeded({ force: true });
      }
    } catch (error) {
      runtime.isLoading = false;
      runtime.isRefreshing = false;
      render();
      throw error;
    }
  }

  async function refreshCurrentScope({ reason, allowSkeleton }) {
    const activeAddress = getActiveAddress();
    if (activeAddress) {
      return refreshScopedEntries([activeAddress], { reason, allowSkeleton });
    }

    const activeWallet = getActiveWallet();
    if (activeWallet) {
      return refreshScopedEntries(
        state.addresses.filter((entry) => entry.groupId === activeWallet.id),
        { reason, allowSkeleton }
      );
    }

    return refreshVault({ reason, allowSkeleton });
  }

  async function refreshScopedEntries(
    entries,
    { reason, allowSkeleton, historyScopeOverride = null, silent = false } = {}
  ) {
    const scopedEntries = Array.isArray(entries)
      ? entries.filter(
          (entry, index, source) =>
            entry &&
            source.findIndex((candidate) => candidate && candidate.id === entry.id) === index
        )
      : [];

    if (!scopedEntries.length) {
      runtime.banner = null;
      setHeaderStatus(reason === "manual" ? "No addresses to refresh." : "");
      render();
      return;
    }

    if (!silent) {
      runtime.isLoading = allowSkeleton && !runtime.hasLoadedOnce;
      runtime.isRefreshing = runtime.hasLoadedOnce;
      setHeaderStatus("");
      if (reason !== "initial") {
        runtime.banner = null;
      }
      render();
    }

    const requestedHistoryScope = normalizeHistoryScope(
      historyScopeOverride || getRequiredDetailScopeForRange()
    );
    const startTimestamp = getStartTimestampForHistoryScope(requestedHistoryScope);
    const endTimestamp = Date.now();

    try {
      const addressResults = await Promise.allSettled(
        scopedEntries.map((entry) => APILayer.fetchAddressBundle(entry.address, startTimestamp))
      );
      const effectiveStartTimestamp =
        requestedHistoryScope === "ALL"
          ? getHistoryStartTimestampFromAddressResults(addressResults) || startTimestamp
          : startTimestamp;
      const marketData = await APILayer.fetchMarketData(
        effectiveStartTimestamp,
        endTimestamp,
        getFiatCurrency()
      );
      const rateLimitWarnings = collectRateLimitWarningsFromSettledResults(addressResults);

      const snapshots = [];
      const partialFailures = [];

      addressResults.forEach((result, index) => {
        const entry = scopedEntries[index];
        if (result.status === "fulfilled") {
          const snapshot = PortfolioLayer.buildAddressSnapshot({
            entry,
            bundle: result.value.bundle,
            provider: result.value.provider,
            currentPriceUsd: marketData.currentPriceUsd,
            priceHistory: marketData.priceHistory,
            startTimestamp: effectiveStartTimestamp,
            endTimestamp,
            detailScope: requestedHistoryScope,
          });

          snapshots.push(snapshot);
        } else {
          partialFailures.push({
            address: entry.address,
            message: result.reason?.message || "Address data unavailable.",
          });
        }
      });

      if (!snapshots.length) {
        throw new Error("All address lookups failed.");
      }

      replaceAddressSnapshots(snapshots);

      const refreshedAddressSet = new Set(scopedEntries.map((entry) => entry.address));
      const retainedFailures = runtime.partialFailures.filter(
        (failure) => !refreshedAddressSet.has(failure.address)
      );
      const mergedPartialFailures = [...retainedFailures, ...partialFailures];

      const bannerParts = [];
      if (rateLimitWarnings.length) {
        bannerParts.push(formatRateLimitWarning(rateLimitWarnings));
      }
      if (partialFailures.length) {
        bannerParts.push(
          `${partialFailures.length} ${
            partialFailures.length === 1 ? "address" : "addresses"
          } could not be refreshed. Showing partial data.`
        );
      }
      if (!marketData.historyAvailable) {
        bannerParts.push("Historical BTC/USD data is unavailable, so wallet growth is approximate.");
      } else if (marketData.historyMissingDays > 0) {
        bannerParts.push("Historical BTC/USD data has gaps, so some wallet growth points are approximate.");
      }

      runtime = {
        ...runtime,
        isLoading: silent ? runtime.isLoading : false,
        isRefreshing: silent ? runtime.isRefreshing : false,
        hasLoadedOnce: true,
        currentPriceUsd: marketData.currentPriceUsd,
        fiatExchangeRates: mergeFiatExchangeRates(marketData.fiatExchangeRates, runtime.fiatExchangeRates),
        currentPriceFiat: Number.isFinite(marketData.displayFiatMarket?.currentPrice)
          ? marketData.displayFiatMarket.currentPrice
          : null,
        currentPriceFiatCurrency: marketData.displayFiatMarket?.currency || null,
        fiatPriceHistory:
          marketData.displayFiatMarket?.priceHistory instanceof Map
            ? marketData.displayFiatMarket.priceHistory
            : new Map(),
        fiatIntradayPriceHistory:
          marketData.displayFiatMarket?.intradayPriceHistory instanceof Map
            ? marketData.displayFiatMarket.intradayPriceHistory
            : new Map(),
        priceHistory: marketData.priceHistory,
        intradayPriceHistory: marketData.intradayPriceHistory,
        historyAvailable: marketData.historyAvailable,
        historyMissingDays: marketData.historyMissingDays,
        partialFailures: mergedPartialFailures,
        approximationMode:
          runtime.addressSnapshots.some((snapshot) => snapshot.approximate) ||
          mergedPartialFailures.length > 0 ||
          !marketData.historyAvailable ||
          marketData.historyMissingDays > 0,
        historyScope: pickHigherHistoryScope(runtime.historyScope, requestedHistoryScope),
        banner: silent
          ? runtime.banner
          : bannerParts.length
            ? {
                tone: "warning",
                text: bannerParts.join(" "),
              }
            : null,
        timelineStart: effectiveStartTimestamp,
        timelineEnd: endTimestamp,
        intradayStart: marketData.intradayStart,
        intradayEnd: marketData.intradayEnd,
      };
      if (!silent) {
        setHeaderStatus(bannerParts.length || reason !== "manual" ? "" : "Watch refreshed");
      }

      state.lastUpdated = new Date().toISOString();
      StorageLayer.saveState(state);
      StorageLayer.saveRuntimeCache(runtime);
      render();
    } catch (error) {
      if (!silent) {
        runtime.isLoading = false;
        runtime.isRefreshing = false;
        setHeaderStatus("");
        render();
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering and view models
  // ---------------------------------------------------------------------------

  function render() {
    sanitizeState();
    syncBalanceToggle();
    syncDisplayModeToggle();
    syncBackgroundGraphicsPreference();
    syncViewModeClass();
    renderRefreshState();
    renderBanner();
    renderFooter();
    renderHeader();
    renderOverview();
    renderFaq();
    renderDetail();
    renderSettingsModal();
    syncBodyModalState();
  }

  function renderBanner() {
    const banner = runtime.banner;
    if (!banner?.text) {
      dom.appBanner.hidden = true;
      dom.appBanner.className = "app-banner";
      dom.appBanner.textContent = "";
      return;
    }

    dom.appBanner.hidden = false;
    dom.appBanner.className = `app-banner ${
      banner.tone === "warning" ? "is-warning" : banner.tone === "error" ? "is-error" : ""
    }`.trim();
    dom.appBanner.textContent = banner.text;
  }

  function renderFooter() {
    if (!dom.appFooterPriceReference || !dom.appFooterPriceValue) {
      return;
    }

    dom.appFooterPriceReference.textContent = getFooterBitcoinReferenceDisplay();
    dom.appFooterPriceValue.textContent = formatDisplayFiatFooterValue(getCurrentDisplayFiatUnitPrice());
  }

  function renderHeader() {
    const activeWallet = getActiveWallet();
    const activeAddress = getActiveAddress();
    const isEditing = Boolean(activeWallet && runtime.editingWalletId === activeWallet.id);
    const showCopyStatus =
      Boolean(activeAddress) && runtime.headerStatusTone === "success" && Boolean(runtime.headerStatus);
    const faqOpen = isFaqView();

    dom.headerStatus.hidden = !runtime.headerStatus || showCopyStatus;
    dom.headerStatus.className = `topbar-status text-meta${
      runtime.headerStatusTone === "success" ? " is-success" : ""
    }`;
    dom.headerStatus.textContent = showCopyStatus ? "" : runtime.headerStatus || "";
    dom.faqHeaderDivider.hidden = !faqOpen;
    dom.faqCrumb.hidden = !faqOpen;
    dom.walletHeaderDivider.hidden = !activeWallet;
    dom.walletCrumb.hidden = !activeWallet;
    dom.addressHeaderDivider.hidden = !activeAddress;
    dom.addressCrumb.hidden = !activeAddress;
    dom.addressStatusDivider.hidden = !showCopyStatus;
    dom.addressCopyStatus.hidden = !showCopyStatus;
    dom.addressCopyStatus.textContent = showCopyStatus ? runtime.headerStatus : "";
    dom.walletTitleButton.classList.toggle("is-editing", isEditing);
    dom.walletTitleButton.classList.toggle("is-back", Boolean(activeAddress));
    dom.walletDeleteButton.hidden = !activeWallet || Boolean(activeAddress);
    dom.walletDeleteButton.disabled = !activeWallet || state.groups.length <= 1;
    dom.faqButton.classList.toggle("is-active", faqOpen);
    dom.faqButton.setAttribute("aria-pressed", String(faqOpen));
    dom.faqButton.setAttribute("aria-label", faqOpen ? "Close FAQ" : "Open FAQ");
    dom.faqButton.title = faqOpen ? "Close FAQ" : "FAQ";

    if (!activeWallet) {
      dom.walletTitleText.textContent = "";
      dom.walletTitleText.contentEditable = "false";
      dom.walletTitleButton.tabIndex = -1;
      dom.addressCrumbTextFull.textContent = "";
      dom.addressCrumbTextShort.textContent = "";
      dom.addressCopyStatus.textContent = "";
      return;
    }

    dom.walletTitleText.textContent = isEditing ? runtime.walletNameDraft : activeWallet.name;
    dom.walletTitleText.contentEditable = isEditing ? "true" : "false";
    dom.walletTitleText.spellcheck = false;
    dom.walletTitleButton.tabIndex = isEditing ? -1 : 0;
    dom.walletTitleButton.setAttribute("role", isEditing ? "presentation" : "button");
    dom.walletTitleButton.setAttribute(
      "aria-label",
      isEditing
        ? "Editing wallet name"
        : activeAddress
          ? `Back to ${activeWallet.name}`
          : "Rename wallet"
    );
    dom.addressCrumb.setAttribute(
      "aria-label",
      activeAddress ? `Copy address ${activeAddress.address}` : "Copy address"
    );
    dom.addressCrumb.title = activeAddress ? "Copy address" : "";
    dom.addressCrumbTextFull.textContent = activeAddress ? getAddressHeaderCrumbFullLabel(activeAddress) : "";
    dom.addressCrumbTextShort.textContent = activeAddress ? getAddressHeaderCrumbLabel(activeAddress) : "";
  }

  function renderSettingsModal() {
    const isOpen = Boolean(runtime.settingsModalOpen);
    dom.settingsModal.hidden = !isOpen;

    if (!isOpen) {
      return;
    }

    const isModern = normalizeBitcoinNotation(state.settings.bitcoinNotation) === "MODERN";
    const fiatCurrency = getFiatCurrency();
    const showFiatApproximationNotice = fiatCurrency !== "USD" && !getDirectFiatProductId(fiatCurrency);
    const showDust = !Boolean(state.settings.hideDust);
    const showBackgroundGraphics = state.settings.showBackgroundGraphics !== false;

    dom.settingsHideDustButton.classList.toggle("is-on", showDust);
    dom.settingsHideDustButton.setAttribute("aria-checked", String(showDust));
    dom.settingsBackgroundGraphicsButton.classList.toggle("is-on", showBackgroundGraphics);
    dom.settingsBackgroundGraphicsButton.setAttribute("aria-checked", String(showBackgroundGraphics));

    dom.settingsNotationModern.checked = isModern;
    dom.settingsNotationClassic.checked = !isModern;
    dom.settingsFiatIcon.textContent = getFiatIconGlyph(fiatCurrency);
    dom.settingsFiatNotice.hidden = !showFiatApproximationNotice;
    dom.settingsFiatUsd.checked = fiatCurrency === "USD";
    dom.settingsFiatEur.checked = fiatCurrency === "EUR";
    dom.settingsFiatJpy.checked = fiatCurrency === "JPY";
    dom.settingsFiatGbp.checked = fiatCurrency === "GBP";
    dom.settingsFiatCny.checked = fiatCurrency === "CNY";
  }

  function syncBodyModalState() {
    document.body.classList.toggle(
      "has-modal",
      Boolean(runtime.selectedTransactionTxid || runtime.chartModalOpen || runtime.settingsModalOpen)
    );
  }

  function renderRefreshState() {
    const isBusy = runtime.isLoading || runtime.isRefreshing;
    const label = isBusy ? "Refreshing" : "Refresh";
    dom.refreshButton.disabled = isBusy || !state.addresses.length;
    dom.refreshButton.classList.toggle("is-spinning", isBusy);
    dom.refreshButton.setAttribute("aria-label", label);
    dom.refreshButton.title = label;
  }

  function renderOverview() {
    const activeWallet = getActiveWallet();
    const faqOpen = isFaqView();
    dom.walletsOverview.hidden = Boolean(activeWallet) || faqOpen;
    if (activeWallet || faqOpen) {
      return;
    }

    const walletSummaries = getWalletSummaries();
    const cards = [
      ...walletSummaries.map((summary) => buildWalletCard(summary)),
      `
        <button class="wallet-card wallet-card--action" type="button" data-action="create-wallet">
          <strong class="wallet-card-name">+ New wallet</strong>
        </button>
      `,
    ];
    const fillerCount = Math.max(0, 4 - cards.length);
    dom.walletGrid.innerHTML = `${cards.join("")}${Array.from({ length: fillerCount }, () => buildWalletPlaceholderCard()).join("")}`;
  }

  function renderFaq() {
    const isOpen = isFaqView();
    dom.faqView.hidden = !isOpen;
    if (!isOpen) {
      return;
    }

    dom.faqGrid.innerHTML = FAQ_ITEMS.map((item) => buildFaqCard(item)).join("");
  }

  function renderDetail() {
    const activeWallet = getActiveWallet();
    const activeAddress = getActiveAddress();
    const faqOpen = isFaqView();
    dom.walletDetail.hidden = !activeWallet || faqOpen;
    if (!activeWallet || faqOpen) {
      dom.walletFactsSection.hidden = true;
      runtime.lastFactsWalletId = null;
      clearAddressFeedback();
      clearAddressTagFeedback();
      resetAddressTagForm();
      dom.walletAddressEmptyWarning.hidden = true;
      closeChartModal({ restoreFocus: false });
      renderTransactionModal(null, null, []);
      return;
    }

    const detailView = activeAddress ? getAddressView(activeAddress.id) : getWalletView(activeWallet.id);
    if (!detailView) {
      clearAddressFeedback();
      return;
    }
    const loadingWallet = runtime.isLoading && !runtime.hasLoadedOnce && state.addresses.length > 0;
    const loadingDetail = !detailView.hasDetailData && detailView.monitoredCount > 0;
    const shouldShowSidebar = Boolean(activeAddress) || detailView.monitoredCount > 0;
    const summaryDisplay = getWalletSummaryDisplay(detailView.totalBtc, detailView.totalUsd);
    const secondaryLabel = summaryDisplay.secondary;
    const secondaryHiddenLabel = summaryDisplay.secondaryHidden;
    const chartDisplay = getWalletChartDisplay(detailView);
    const detailKey = activeAddress ? activeAddress.id : activeWallet.id;
    const visibleTransactionCount = getVisibleTransactionCount(detailKey);
    const chartKicker = activeAddress ? "ADDRESS GROWTH" : "WALLET GROWTH";
    const showEmptyAddressWarning = !activeAddress && detailView.addresses.length === 0;
    renderChartTabs();
    renderBitcoinFactsWidget(activeAddress);
    dom.addressTagsSection.hidden = !activeAddress;
    dom.walletAddressesSection.hidden = Boolean(activeAddress);
    dom.walletDetailSidebar.hidden = !shouldShowSidebar;
    dom.walletAddressEmptyWarning.hidden = !showEmptyAddressWarning;
    if (loadingWallet) {
      dom.walletSecondarySummary.textContent = secondaryHiddenLabel;
      dom.walletPrimarySummary.innerHTML = getWalletPrimaryMarkup(summaryDisplay.primaryHidden);
      dom.walletTransactions.innerHTML = buildTransactionSkeletons(COLLAPSED_TRANSACTION_COUNT);
      dom.walletTransactionsToggle.hidden = true;
      if (activeAddress) {
        renderAddressTags(activeAddress.tags || []);
      }
      if (!activeAddress) {
        dom.walletAddressesKicker.textContent = getWalletAddressesKicker(detailView.addresses.length);
        dom.walletAddressesHeading.textContent = "ADDRESSES";
        dom.walletAddressList.hidden = detailView.addresses.length === 0;
        dom.walletAddressList.innerHTML = detailView.addresses.length ? buildAddressRows(detailView.addresses) : "";
      }
      dom.walletChartKicker.textContent = chartKicker;
      dom.walletChartTitleSymbol.textContent = chartDisplay.symbol;
      renderChartTitleText(dom.walletChartTitleText, null);
      renderChartGrowthStat(dom.walletChartGrowth, null);
      delete dom.walletChartStage.dataset.tone;
      dom.walletChartStage.innerHTML = buildSparklineSkeleton();
      renderChartModal(activeWallet, detailView, chartDisplay);
      renderTransactionModal(activeWallet, activeAddress, []);
      return;
    }

    dom.walletSecondarySummary.textContent = secondaryLabel;
    dom.walletPrimarySummary.innerHTML = getWalletPrimaryMarkup(summaryDisplay.primary);
    if (activeAddress) {
      renderAddressTags(detailView.address.tags || []);
    } else {
      clearAddressTagFeedback();
      resetAddressTagForm();
      dom.addressTagList.innerHTML = "";
    }
    if (!activeAddress) {
      dom.walletAddressesKicker.textContent = getWalletAddressesKicker(detailView.addresses.length);
      dom.walletAddressesHeading.textContent = "ADDRESSES";
      dom.walletAddressList.hidden = detailView.addresses.length === 0;
      dom.walletAddressList.innerHTML = detailView.addresses.length ? buildAddressRows(detailView.addresses) : "";
    }
    if (loadingDetail) {
      dom.walletTransactions.innerHTML = buildTransactionSkeletons(COLLAPSED_TRANSACTION_COUNT);
      dom.walletTransactionsToggle.hidden = true;
    } else {
      dom.walletTransactions.innerHTML = buildTransactionRows(detailView.activity, {
        visibleCount: visibleTransactionCount,
      });
      const remainingTransactions = Math.max(0, detailView.activity.length - visibleTransactionCount);
      dom.walletTransactionsToggle.hidden = remainingTransactions <= 0;
      dom.walletTransactionsToggle.textContent = `Show more`;
    }
    dom.walletChartKicker.textContent = chartKicker;
    dom.walletChartTitleSymbol.textContent = chartDisplay.symbol;
    renderChartTitleText(dom.walletChartTitleText, chartDisplay);
    if (loadingDetail) {
      renderChartGrowthStat(dom.walletChartGrowth, null);
      delete dom.walletChartStage.dataset.tone;
      dom.walletChartStage.innerHTML = buildSparklineSkeleton();
      if (runtime.chartModalOpen) {
        dom.chartModal.hidden = false;
        dom.chartModalKicker.textContent = detailView.address ? "ADDRESS GROWTH" : "WALLET GROWTH";
        dom.chartModalTitleSymbol.textContent = chartDisplay.symbol;
        renderChartTitleText(dom.chartModalTitleText, null);
        renderChartGrowthStat(dom.chartModalGrowth, null);
        delete dom.chartModalStage.dataset.tone;
        dom.chartModalStage.innerHTML = buildSparklineSkeleton();
      }
      renderTransactionModal(activeWallet, activeAddress, []);
      return;
    }

    renderChartGrowthStat(dom.walletChartGrowth, chartDisplay);
    renderSparkline(dom.walletChartStage, chartDisplay, {
      width: 560,
      height: 284,
    });
    renderChartModal(activeWallet, detailView, chartDisplay);
    renderTransactionModal(activeWallet, activeAddress, detailView.activity);
  }

  function renderChartModal(activeWallet, detailView, chartDisplay) {
    if (!runtime.chartModalOpen || !activeWallet || !detailView) {
      dom.chartModal.hidden = true;
      dom.chartModalStage.innerHTML = "";
      renderChartTitleText(dom.chartModalTitleText, null);
      renderChartGrowthStat(dom.chartModalGrowth, null);
      return;
    }

    dom.chartModal.hidden = false;
    dom.chartModalKicker.textContent = detailView.address ? "ADDRESS GROWTH" : "WALLET GROWTH";
    dom.chartModalTitleSymbol.textContent = chartDisplay.symbol;
    renderChartTitleText(dom.chartModalTitleText, chartDisplay);
    renderChartGrowthStat(dom.chartModalGrowth, chartDisplay);
    renderSparkline(dom.chartModalStage, chartDisplay, {
      width: 1200,
      height: 560,
    });
  }

  function renderChartGrowthStat(element, chartDisplay) {
    if (!element) {
      return;
    }

    const descriptor = getSeriesGrowthDescriptor(chartDisplay?.values);
    if (!descriptor) {
      element.hidden = true;
      element.className = "wallet-chart-growth";
      element.textContent = "";
      return;
    }

    element.hidden = false;
    element.className = `wallet-chart-growth ${descriptor.toneClass}`.trim();
    element.textContent = descriptor.chartLabel || descriptor.label;
  }

  function renderChartTitleText(element, chartDisplay) {
    if (!element) {
      return;
    }

    const descriptor = getSeriesGrowthDescriptor(chartDisplay?.values);
    element.textContent = shouldUseCompactChartTitle(descriptor) ? "OVER TIME" : "VALUE OVER TIME";
  }

  function shouldUseCompactChartTitle(descriptor) {
    return window.innerWidth < 1180 || Boolean(descriptor?.compactTitle);
  }

  function renderBitcoinFactsWidget(activeAddress) {
    const activeWallet = getActiveWallet();
    const shouldShow = !activeAddress && bitcoinFacts.length > 0;
    dom.walletFactsSection.hidden = !shouldShow;
    if (!shouldShow) {
      runtime.lastFactsWalletId = null;
      dom.walletFactsText.textContent = "";
      return;
    }

    if (runtime.lastFactsWalletId !== activeWallet?.id) {
      if (
        Number.isInteger(runtime.currentFactIndex) &&
        runtime.currentFactIndex >= 0 &&
        runtime.currentFactIndex < bitcoinFacts.length
      ) {
        runtime.currentFactIndex = getRandomBitcoinFactIndex(runtime.currentFactIndex);
      } else {
        ensureCurrentBitcoinFactIndex();
      }
      runtime.lastFactsWalletId = activeWallet?.id || null;
    } else {
      ensureCurrentBitcoinFactIndex();
    }

    const currentFact = bitcoinFacts[runtime.currentFactIndex] || "";
    dom.walletFactsText.textContent = currentFact;
    dom.walletFactsButton.disabled = bitcoinFacts.length <= 1;
  }

  function renderSparkline(container, chartDisplay, options = {}) {
    const rect = container.getBoundingClientRect();
    const measuredWidth = Math.round(rect.width || container.clientWidth || 0);
    const measuredHeight = Math.round(rect.height || container.clientHeight || 0);
    const scene = createSparklineScene(chartDisplay, {
      ...options,
      width: measuredWidth > 0 ? measuredWidth : options.width,
      height: measuredHeight > 0 ? measuredHeight : options.height,
    });
    if (scene?.tone) {
      container.dataset.tone = scene.tone;
    } else {
      delete container.dataset.tone;
    }
    container.innerHTML = scene ? scene.markup : `<div class="sparkline-empty">No history yet.</div>`;
    bindSparklineInteraction(container, scene);
  }

  function scheduleChartResizeRender() {
    if (chartResizeFrame) {
      window.cancelAnimationFrame(chartResizeFrame);
    }

    chartResizeFrame = window.requestAnimationFrame(() => {
      chartResizeFrame = 0;
      rerenderVisibleCharts();
    });
  }

  function rerenderVisibleCharts() {
    const activeWallet = getActiveWallet();
    if (!activeWallet) {
      return;
    }

    const activeAddress = getActiveAddress();
    const detailView = activeAddress ? getAddressView(activeAddress.id) : getWalletView(activeWallet.id);
    const chartDisplay =
      detailView && detailView.hasDetailData && detailView.monitoredCount > 0
        ? getWalletChartDisplay(detailView)
        : null;

    renderChartTitleText(dom.walletChartTitleText, chartDisplay);
    if (runtime.chartModalOpen) {
      renderChartTitleText(dom.chartModalTitleText, chartDisplay);
    }

    if (!detailView || !detailView.hasDetailData || detailView.monitoredCount <= 0) {
      return;
    }

    renderSparkline(dom.walletChartStage, chartDisplay, {
      width: 560,
      height: 284,
    });

    if (runtime.chartModalOpen) {
      renderChartModal(activeWallet, detailView, chartDisplay);
    }
  }

  function renderChartTabs() {
    [dom.walletChartTabs, dom.chartModalTabs].forEach((tablist) => {
      Array.from(tablist.querySelectorAll("[data-range]")).forEach((button) => {
        const isActive = normalizeChartRange(button.dataset.range) === state.selectedRange;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });
    });
  }

  function buildWalletCard(summary) {
    const balanceMarkup = summary.isBalanceLoading
      ? `
        <span class="wallet-card-balance--loading" aria-label="Loading wallet balance">
          <span class="wallet-card-spinner" aria-hidden="true"></span>
          <span class="sr-only">Loading wallet balance</span>
        </span>
      `
      : `<span>${getOverviewBalance(summary.totalBtc, summary.totalUsd)}</span>`;

    const secondary = summary.addressCount
      ? `<span class="wallet-card-secondary">${escapeHtml(
          summary.addressCount === 1 ? "1 address" : `${summary.addressCount} addresses`
        )}</span>`
      : `
        <span class="wallet-card-secondary">
          <span class="wallet-card-secondary-text wallet-card-secondary-text--default">No addresses</span>
          <span class="wallet-card-secondary-text wallet-card-secondary-text--hover">Add address</span>
        </span>
      `;

    return `
      <button
        class="wallet-card ${summary.addressCount ? "" : "has-empty-state"} ${
          summary.hasMiniChart ? "has-mini-chart" : ""
        } ${summary.showMiniChartPlaceholder ? "has-chart-placeholder" : ""}"
        type="button"
        data-action="open-wallet"
        data-wallet-id="${escapeHtml(summary.wallet.id)}"
      >
        ${
          summary.hasMiniChart
            ? `<div class="wallet-card-chart" aria-hidden="true">${summary.miniChartMarkup}</div>`
            : summary.showMiniChartPlaceholder
              ? `<div class="wallet-card-chart wallet-card-chart--placeholder" aria-hidden="true">${buildWalletCardChartPlaceholder()}</div>`
            : ""
        }
        <strong class="wallet-card-name text-strong">${escapeHtml(summary.wallet.name)}</strong>
        <div class="wallet-card-stats text-meta">
          ${balanceMarkup}
          <span class="wallet-card-divider" aria-hidden="true"></span>
          ${secondary}
        </div>
      </button>
    `;
  }

  function buildWalletPlaceholderCard() {
    return `
      <div class="wallet-card wallet-card--action wallet-card--placeholder" aria-hidden="true"></div>
    `;
  }

  function buildFaqCard(item) {
    return `
      <article class="panel faq-card">
        <div class="faq-card-copy">
          <h3 class="faq-card-question">${escapeHtml(item.question)}</h3>
          <p class="faq-card-answer">${escapeHtml(item.answer)}</p>
        </div>
      </article>
    `;
  }

  function buildAddressRows(addresses) {
    if (!addresses.length) {
      return "";
    }

    return addresses
      .map(
        (entry) => `
          <div class="address-row">
            <button
              class="address-open-button"
              type="button"
              data-action="open-address"
              data-address-id="${escapeHtml(entry.id)}"
              aria-label="Open address detail for ${escapeHtml(shortAddress(entry.address))}"
              title="${escapeHtml(entry.address)}"
            >
              <span class="address-value">${escapeHtml(entry.address)}</span>
            </button>
            <span class="address-balance">
              ${getAddressRowBalanceMarkup(entry)}
            </span>
            <button
              class="wallet-address-remove"
              type="button"
              data-action="remove-address"
              data-address-id="${escapeHtml(entry.id)}"
              aria-label="Remove address"
              title="Remove address"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18"></path>
                <path d="M8 6V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8V6"></path>
                <path d="M19 6l-1 13.2A2 2 0 0 1 16 21H8a2 2 0 0 1-2-1.8L5 6"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
              </svg>
            </button>
          </div>
        `
      )
      .join("");
  }

  function renderAddressTags(tags) {
    const normalizedTags = normalizeAddressTags(tags);
    dom.addressTagList.hidden = normalizedTags.length === 0;
    dom.addressTagList.innerHTML = normalizedTags.length ? buildAddressTagChips(normalizedTags) : "";
  }

  function buildAddressTagChips(tags) {
    return tags
      .map(
        (tag) => `
          <span class="address-tag-chip">
            <span>${escapeHtml(tag)}</span>
            <button
              class="address-tag-remove"
              type="button"
              data-action="remove-tag"
              data-tag="${escapeHtml(tag)}"
              aria-label="Delete tag ${escapeHtml(tag)}"
              title="Delete tag"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m6 6 12 12"></path>
                <path d="M18 6 6 18"></path>
              </svg>
            </button>
          </span>
        `
      )
      .join("");
  }

  function buildTransactionRows(activity, { visibleCount = COLLAPSED_TRANSACTION_COUNT } = {}) {
    const visibleActivity = activity.slice(0, visibleCount);

    if (!activity.length) {
      return "";
    }

    return visibleActivity
      .map((item) => {
        const directionLabel = escapeHtml(item.direction);
        const amountDisplay = getTransactionAmountDisplay(item);
        return `
          <button
            class="transaction-card transaction-card-button"
            type="button"
            data-action="open-transaction"
            data-txid="${escapeHtml(item.txid)}"
            aria-label="Open ${directionLabel} transaction"
          >
            <div class="transaction-main">
              <span class="transaction-icon" aria-hidden="true">${getTransactionIcon(item.direction)}</span>
              <div class="transaction-copy">
                <span class="transaction-title text-strong">${directionLabel}</span>
                <span class="transaction-meta text-meta">${escapeHtml(formatTransactionTime(item.timestamp))}</span>
              </div>
            </div>
            <div class="transaction-side">
              <span class="transaction-primary-amount text-strong">${amountDisplay.primary}</span>
              <span class="transaction-secondary-amount text-meta">${amountDisplay.secondary}</span>
            </div>
          </button>
        `;
      })
      .join("");
  }

  function renderTransactionModal(activeWallet, activeAddress, activity) {
    const selectedTxid = runtime.selectedTransactionTxid;
    const transaction = selectedTxid ? activity.find((entry) => entry.txid === selectedTxid) : null;
    const isOpen = Boolean(activeWallet && transaction);
    const isExpanded = Boolean(transaction && runtime.expandedTechnicalTransactionTxid === transaction.txid);

    clearTransactionTechnicalAnimationTimer();
    dom.transactionModal.hidden = !isOpen;

    if (!isOpen) {
      dom.transactionModalBody.innerHTML = "";
      dom.transactionModalBody.classList.remove("is-technical-expanded");
      dom.transactionModalKicker.textContent = "TRANSACTION";
      if (selectedTxid && activeWallet) {
        runtime.selectedTransactionTxid = null;
      }
      return;
    }

    dom.transactionModalKicker.textContent = buildTransactionModalKicker(
      activeAddress ? getAddressHeaderCrumbLabel(activeAddress) : activeWallet.name,
      activeAddress ? "ADDRESS" : "WALLET"
    );
    dom.transactionModalBody.innerHTML = buildTransactionDetailMarkup(activeWallet, transaction);
    dom.transactionModalBody.classList.toggle("is-technical-expanded", isExpanded);
  }

  function openTransactionDetail(detailId, txid) {
    const activeDetailId = getActiveDetailKey();
    if (!activeDetailId || activeDetailId !== detailId || !txid) {
      return;
    }

    clearTransactionTechnicalAnimationTimer();
    runtime.selectedTransactionTxid = txid;
    runtime.expandedTechnicalTransactionTxid = null;
    render();

    requestAnimationFrame(() => {
      dom.transactionModalClose.focus({ preventScroll: true });
    });
  }

  function closeTransactionDetail() {
    if (!runtime.selectedTransactionTxid) {
      return;
    }

    clearTransactionTechnicalAnimationTimer();
    runtime.selectedTransactionTxid = null;
    runtime.expandedTechnicalTransactionTxid = null;
    render();
  }

  function openChartModal() {
    const activeWallet = getActiveWallet();
    if (!activeWallet) {
      return;
    }

    runtime.chartModalOpen = true;
    render();

    requestAnimationFrame(() => {
      dom.chartModalClose.focus({ preventScroll: true });
    });
  }

  function openSettingsModal() {
    runtime.settingsModalOpen = true;
    render();

    requestAnimationFrame(() => {
      dom.settingsModalClose.focus({ preventScroll: true });
    });
  }

  function closeChartModal({ restoreFocus = true } = {}) {
    if (!runtime.chartModalOpen) {
      return;
    }

    runtime.chartModalOpen = false;
    render();

    if (restoreFocus) {
      requestAnimationFrame(() => {
        dom.walletChartStage.focus({ preventScroll: true });
      });
    }
  }

  function closeSettingsModal({ restoreFocus = true } = {}) {
    if (!runtime.settingsModalOpen) {
      return;
    }

    runtime.settingsModalOpen = false;
    render();

    if (restoreFocus) {
      requestAnimationFrame(() => {
        dom.settingsButton.focus({ preventScroll: true });
      });
    }
  }

  function toggleTransactionTechnicalDetails(txid) {
    if (!txid || runtime.selectedTransactionTxid !== txid) {
      return;
    }

    clearTransactionTechnicalAnimationTimer();

    const toggleButton = dom.transactionModalBody.querySelector("[data-action='toggle-technical']");
    const currentSection = dom.transactionModalBody.querySelector("[data-role='transaction-technical']");
    const isExpanded = runtime.expandedTechnicalTransactionTxid === txid;

    if (isExpanded) {
      runtime.expandedTechnicalTransactionTxid = null;
      syncTransactionTechnicalButton(toggleButton, false);
      dom.transactionModalBody.classList.remove("is-technical-expanded");
      if (currentSection) {
        currentSection.classList.remove("is-expanded");
        currentSection.classList.add("is-collapsing");
      }
      return;
    }

    const transaction = getActiveWalletTransaction(txid);
    if (!transaction) {
      return;
    }

    runtime.expandedTechnicalTransactionTxid = txid;
    syncTransactionTechnicalButton(toggleButton, true);
    const hydrationStarted = startTransactionDetailsHydrationIfNeeded(txid, { renderOnStart: false });
    dom.transactionModalBody.classList.add("is-technical-expanded");

    if (hydrationStarted) {
      render();
      return;
    }

    window.requestAnimationFrame(() => {
      const technicalSection = dom.transactionModalBody.querySelector("[data-role='transaction-technical']");
      if (!technicalSection) {
        return;
      }
      technicalSection.classList.remove("is-collapsing");
      technicalSection.classList.add("is-expanded");
    });
  }

  function buildTransactionDetailMarkup(wallet, item) {
    const summaryAmount = getTransactionSummaryAmount(item);
    const valueMetrics = getTransactionValueMetrics(item);
    const technicalMetrics = getTransactionTechnicalMetrics(item);
    const isExpanded = runtime.expandedTechnicalTransactionTxid === item.txid;
    const isTechnicalLoading = runtime.transactionDetailsLoadingTxids.includes(item.txid);
    const statusTone = item.confirmed ? "is-confirmed" : "is-pending";
    const technicalButtonLabel = isExpanded ? "Hide Technical Details" : "Show Technical Details";
    const technicalButtonIcon = isExpanded ? getEyeSlashIconMarkup() : getEyeIconMarkup();
    const inputAddresses = Array.isArray(item.inputAddresses) ? item.inputAddresses : [];
    const outputAddresses = Array.isArray(item.outputAddresses) ? item.outputAddresses : [];
    const inputHighlights = new Set(item.walletInputAddresses || []);
    const outputHighlights = new Set(item.walletOutputAddresses || []);

    return `
      <div class="transaction-modal-summary">
        <div class="transaction-main">
          <span class="transaction-icon" aria-hidden="true">${getTransactionIcon(item.direction)}</span>
          <div class="transaction-modal-summary-copy">
            <h2 class="modal-title" id="transactionModalTitle">${escapeHtml(item.direction)}</h2>
          </div>
        </div>

        <div class="transaction-modal-amounts">
          <span class="transaction-modal-primary">${summaryAmount}</span>
        </div>
      </div>

      <div class="transaction-modal-content">
        <div class="transaction-modal-collapsed-stack">
          <div class="transaction-modal-metadata">
            <div class="transaction-metadata-cell">
              <span class="text-label">Date</span>
              <span class="transaction-metadata-value-row">
                <span class="transaction-metadata-icon transaction-metadata-icon--accent" aria-hidden="true">${getCalendarIconMarkup()}</span>
                <span class="text-value-sm">${escapeHtml(
                  formatTransactionDateLabel(item.timestamp)
                )}</span>
              </span>
            </div>

            <div class="transaction-metadata-cell">
              <span class="text-label">Time</span>
              <span class="transaction-metadata-value-row">
                <span class="transaction-metadata-icon transaction-metadata-icon--accent" aria-hidden="true">${getClockIconMarkup()}</span>
                <span class="text-value-sm">${escapeHtml(
                  formatTransactionClockLabel(item.timestamp)
                )}</span>
              </span>
            </div>

            <div class="transaction-metadata-cell">
              <span class="text-label">Status</span>
              <span class="transaction-metadata-value-row ${statusTone}">
                <span class="transaction-metadata-icon" aria-hidden="true">${getCheckCircleIconMarkup()}</span>
                <span class="text-value-sm">${escapeHtml(
                  item.confirmed ? "Confirmed" : "Pending"
                )}</span>
              </span>
            </div>
          </div>

          <div class="transaction-modal-metadata">
            <div class="transaction-metadata-cell">
              <span class="text-label">$ Value Then</span>
              <span class="transaction-metadata-value-row">
                <span class="transaction-metadata-icon transaction-metadata-icon--accent" aria-hidden="true">${getClockCounterClockwiseIconMarkup()}</span>
                <span class="text-value-sm">${escapeHtml(valueMetrics.thenLabel)}</span>
              </span>
            </div>

            <div class="transaction-metadata-cell">
              <span class="text-label">$ Value Now</span>
              <span class="transaction-metadata-value-row">
                <span class="transaction-metadata-icon transaction-metadata-icon--accent" aria-hidden="true">${getStarIconMarkup()}</span>
                <span class="text-value-sm">${escapeHtml(valueMetrics.nowLabel)}</span>
              </span>
            </div>

            <div class="transaction-metadata-cell">
              <span class="text-label">Growth</span>
              <span class="transaction-metadata-value-row ${valueMetrics.growthTone}">
                <span class="transaction-metadata-icon" aria-hidden="true">${valueMetrics.growthIcon}</span>
                <span class="text-value-sm">${escapeHtml(valueMetrics.growthLabel)}</span>
              </span>
            </div>
          </div>
        </div>

        <div class="transaction-modal-detail-stack">
          ${buildTransactionTechnicalMarkup(
            item,
            technicalMetrics,
            inputAddresses,
            outputAddresses,
            inputHighlights,
            outputHighlights,
            isExpanded,
            isTechnicalLoading
          )}

          <div class="transaction-modal-actions">
            <a
              class="button button--pill button--outline button--fit"
              href="https://mempool.space/tx/${encodeURIComponent(item.txid)}"
              target="_blank"
              rel="noreferrer"
            >
              <span class="button__icon" aria-hidden="true">${getGitBranchIconMarkup()}</span>
              <span>Block Explorer</span>
            </a>

            <button
              class="button button--pill button--filled button--stretch"
              type="button"
              data-action="toggle-technical"
              data-txid="${escapeHtml(item.txid)}"
              aria-expanded="${isExpanded ? "true" : "false"}"
            >
              <span class="button__icon" aria-hidden="true">${technicalButtonIcon}</span>
              <span>${escapeHtml(technicalButtonLabel)}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function buildTransactionTechnicalMarkup(
    item,
    technicalMetrics,
    inputAddresses = Array.isArray(item.inputAddresses) ? item.inputAddresses : [],
    outputAddresses = Array.isArray(item.outputAddresses) ? item.outputAddresses : [],
    inputHighlights = new Set(item.walletInputAddresses || []),
    outputHighlights = new Set(item.walletOutputAddresses || []),
    expanded = false,
    isLoading = false
  ) {
    const inputCountLabel = isLoading && !inputAddresses.length ? "..." : inputAddresses.length;
    const outputCountLabel = isLoading && !outputAddresses.length ? "..." : outputAddresses.length;
    return `
      <div class="transaction-technical-section ${expanded ? "is-expanded" : ""}" data-role="transaction-technical">
        <div class="transaction-technical-inner">
          <div class="transaction-technical-metadata">
            <div class="transaction-metadata-cell">
              <span class="text-label">Fee Paid</span>
              <span class="transaction-metadata-value-row">
                <span class="transaction-metadata-icon transaction-metadata-icon--accent" aria-hidden="true">${getFeePaidIconMarkup()}</span>
                <span class="text-value-sm">${escapeHtml(technicalMetrics.feeLabel)}</span>
              </span>
            </div>

            <div class="transaction-metadata-cell">
              <span class="text-label">Fee Rate</span>
              <span class="transaction-metadata-value-row">
                <span class="transaction-metadata-icon transaction-metadata-icon--accent" aria-hidden="true">${getFeeRateIconMarkup()}</span>
                <span class="text-value-sm">${escapeHtml(technicalMetrics.feeRateLabel)}</span>
              </span>
            </div>
          </div>

          <div class="transaction-technical-group">
            <p class="text-label transaction-technical-heading">Transaction ID</p>
            <p class="transaction-technical-value transaction-technical-value--mono">${escapeHtml(item.txid)}</p>
          </div>

          <div class="transaction-technical-group">
            <p class="text-label transaction-technical-heading">Input Addresses (${inputCountLabel})</p>
            <div class="transaction-technical-list">
              ${buildTransactionTechnicalAddressLines(inputAddresses, inputHighlights, isLoading)}
            </div>
          </div>

          <div class="transaction-technical-group">
            <p class="text-label transaction-technical-heading">Output Addresses (${outputCountLabel})</p>
            <div class="transaction-technical-list">
              ${buildTransactionTechnicalAddressLines(outputAddresses, outputHighlights, isLoading)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function syncTransactionTechnicalButton(button, isExpanded) {
    if (!button) {
      return;
    }

    button.setAttribute("aria-expanded", String(isExpanded));
    button.innerHTML = `
      <span class="button__icon" aria-hidden="true">${
        isExpanded ? getEyeSlashIconMarkup() : getEyeIconMarkup()
      }</span>
      <span>${escapeHtml(isExpanded ? "Hide Technical Details" : "Show Technical Details")}</span>
    `;
  }

  function clearTransactionTechnicalAnimationTimer() {
    if (!runtime.transactionTechnicalAnimationTimer) {
      return;
    }

    window.clearTimeout(runtime.transactionTechnicalAnimationTimer);
    runtime.transactionTechnicalAnimationTimer = null;
  }

  function getActiveWalletTransaction(txid) {
    const activeWallet = getActiveWallet();
    const activeAddress = getActiveAddress();
    if (!activeWallet || !txid) {
      return null;
    }

    const detailView = activeAddress ? getAddressView(activeAddress.id) : getWalletView(activeWallet.id);
    return detailView?.activity.find((entry) => entry.txid === txid) || null;
  }

  function buildTransactionTechnicalAddressLines(addresses, highlighted = new Set(), isLoading = false) {
    if (isLoading) {
      return `<p class="transaction-technical-value">Loading technical details...</p>`;
    }

    if (!addresses?.length) {
      return `<p class="transaction-technical-value">Unavailable</p>`;
    }

    return addresses
      .map((address) => {
        const isHighlighted = highlighted.has(address);
        const linkedAddressId = isHighlighted ? getSavedAddressIdByValue(address) : null;
        if (linkedAddressId) {
          return `
            <button
              class="transaction-technical-address transaction-technical-address-button is-highlighted"
              type="button"
              data-action="open-technical-address"
              data-address-id="${escapeHtml(linkedAddressId)}"
              title="${escapeHtml(address)}"
              aria-label="Open address detail for ${escapeHtml(address)}"
            >${escapeHtml(address)}</button>
          `;
        }

        return `<p class="transaction-technical-address ${isHighlighted ? "is-highlighted" : ""}">${escapeHtml(
          address
        )}</p>`;
      })
      .join("");
  }

  function getSavedAddressIdByValue(addressValue) {
    if (!addressValue) {
      return null;
    }

    const normalized = String(addressValue).trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    return state.addresses.find((entry) => entry.address.toLowerCase() === normalized)?.id || null;
  }

  function transactionNeedsAddressHydration(item) {
    if (!item) {
      return false;
    }

    const inputAddresses = Array.isArray(item.inputAddresses) ? item.inputAddresses : [];
    const outputAddresses = Array.isArray(item.outputAddresses) ? item.outputAddresses : [];
    const isFeeMissing = !Number.isFinite(item.feeSats) || !Number.isFinite(item.feeRateSatVb);
    return (inputAddresses.length === 0 && outputAddresses.length === 0) || isFeeMissing;
  }

  function startTransactionDetailsHydrationIfNeeded(txid, options = {}) {
    const renderOnStart = options.renderOnStart !== false;
    const transaction = getActiveWalletTransaction(txid);
    if (!transactionNeedsAddressHydration(transaction) || runtime.transactionDetailsLoadingTxids.includes(txid)) {
      return false;
    }

    runtime.transactionDetailsLoadingTxids = uniqueStrings([...runtime.transactionDetailsLoadingTxids, txid]);
    if (renderOnStart) {
      render();
    }

    hydrateTransactionDetails(txid);
    return true;
  }

  async function hydrateTransactionDetails(txid) {
    try {
      const { transaction, warnings = [] } = await APILayer.fetchTransactionDetails(txid);
      mergeTransactionDetailsIntoSnapshots(txid, transaction);
      const rateLimitWarnings = dedupeRateLimitWarnings(warnings.filter((warning) => warning?.isRateLimit));
      if (rateLimitWarnings.length) {
        setBanner("warning", formatRateLimitWarning(rateLimitWarnings, "technical details lookup"));
      }
      StorageLayer.saveRuntimeCache(runtime);
    } catch (error) {
      setBanner(
        "warning",
        `Technical details are unavailable right now. ${error?.message || "Try a manual refresh."}`.trim()
      );
    } finally {
      runtime.transactionDetailsLoadingTxids = runtime.transactionDetailsLoadingTxids.filter((entry) => entry !== txid);
      render();
    }
  }

  function mergeTransactionDetailsIntoSnapshots(txid, transaction) {
    const { inputAddresses, outputAddresses } = extractTransactionAddresses(transaction);
    const feeSats = Number.isFinite(transaction?.fee) ? Number(transaction.fee) : null;
    const feeRateSatVb = extractTransactionFeeRate(transaction);

    runtime.addressSnapshots = runtime.addressSnapshots.map((snapshot) => {
      let snapshotChanged = false;
      const nextEvents = snapshot.txEvents.map((event) => {
        if (event.txid !== txid) {
          return event;
        }

        snapshotChanged = true;
        return {
          ...event,
          inputAddresses,
          outputAddresses,
          walletInputAddresses: uniqueStrings(inputAddresses.filter((address) => address === snapshot.entry.address)),
          walletOutputAddresses: uniqueStrings(outputAddresses.filter((address) => address === snapshot.entry.address)),
          feeSats,
          feeRateSatVb,
        };
      });

      return snapshotChanged ? { ...snapshot, txEvents: nextEvents } : snapshot;
    });
  }

  function buildTransactionSkeletons(count) {
    return Array.from({ length: count })
      .map(() => `<div class="skeleton-card skeleton-transaction"></div>`)
      .join("");
  }

  function buildSparklineSkeleton() {
    return `<div class="wallet-chart-loader wallet-card-chart--placeholder" aria-hidden="true">${buildWalletCardChartPlaceholder()}</div>`;
  }

  function buildWalletCardChartPlaceholder() {
    return `
      <svg class="wallet-card-chart-svg wallet-card-chart-svg--placeholder" viewBox="0 0 464 152" preserveAspectRatio="none" role="presentation">
        <path
          class="wallet-card-chart-placeholder-area"
          d="M-8 140 C 28 136, 64 124, 102 114 C 140 104, 176 108, 212 92 C 248 76, 286 38, 326 32 C 364 26, 402 54, 438 40 C 452 35, 464 24, 474 12 L 474 152 L -8 152 Z"
        ></path>
        <path
          class="wallet-card-chart-placeholder-line wallet-card-chart-placeholder-line--glow"
          d="M-8 140 C 28 136, 64 124, 102 114 C 140 104, 176 108, 212 92 C 248 76, 286 38, 326 32 C 364 26, 402 54, 438 40 C 452 35, 464 24, 474 12"
        ></path>
        <path
          class="wallet-card-chart-placeholder-line wallet-card-chart-placeholder-line--dotted"
          d="M-8 140 C 28 136, 64 124, 102 114 C 140 104, 176 108, 212 92 C 248 76, 286 38, 326 32 C 364 26, 402 54, 438 40 C 452 35, 464 24, 474 12"
        ></path>
      </svg>
    `;
  }

  function getWalletSummaries() {
    const snapshotsById = getSnapshotsById();

    return state.groups.map((wallet) => {
      const addresses = state.addresses.filter((entry) => entry.groupId === wallet.id);
      const snapshots = addresses
        .map((entry) => snapshotsById.get(entry.id))
        .filter(Boolean);
      const totals = PortfolioLayer.calculateTotals(snapshots);
      const miniChartScene = getWalletCardMiniChartScene({
        walletId: wallet.id,
        addressCount: addresses.length,
        snapshots,
        balanceSats: totals.balanceSats,
      });

      return {
        wallet,
        addressCount: addresses.length,
        totalBtc: totals.balanceSats / 1e8,
        totalUsd: totals.usdValue,
        miniChartMarkup: miniChartScene ? miniChartScene.markup : "",
        hasMiniChart: Boolean(miniChartScene),
        showMiniChartPlaceholder:
          !miniChartScene &&
          addresses.length > 0 &&
          (runtime.isLoading || runtime.isRefreshing || !runtime.hasLoadedOnce),
        isBalanceLoading:
          addresses.length > 0 &&
          snapshots.length < addresses.length &&
          (runtime.isLoading || runtime.isRefreshing || !runtime.hasLoadedOnce),
      };
    });
  }

  function getWalletView(walletId) {
    const wallet = state.groups.find((entry) => entry.id === walletId);
    const snapshotsById = getSnapshotsById();
    const requiredDetailScope = getRequiredDetailScopeForRange();
    const addresses = state.addresses
      .filter((entry) => entry.groupId === walletId)
      .map((entry) => {
        const snapshot = snapshotsById.get(entry.id) || null;
        return {
          ...entry,
          totalBtc: snapshot ? snapshot.balanceSats / 1e8 : null,
          totalUsd: snapshot ? snapshot.usdValue : null,
          isBalanceLoading:
            !snapshot && (runtime.isLoading || runtime.isRefreshing || !runtime.hasLoadedOnce),
        };
      });
    const snapshots = addresses
      .map((entry) => snapshotsById.get(entry.id))
      .filter(Boolean);
    const detailSnapshots = snapshots.filter((snapshot) =>
      hasRequiredDetailScope(snapshot, requiredDetailScope)
    );
    const hasDetailData = addresses.length === 0 || detailSnapshots.length === addresses.length;
    const totals = PortfolioLayer.calculateTotals(snapshots);

    let dailyTimeline = [];
    if (hasDetailData && runtime.timelineStart && runtime.timelineEnd) {
      dailyTimeline = PortfolioLayer.combineTimelines(
        detailSnapshots,
        runtime.priceHistory,
        runtime.timelineStart,
        runtime.timelineEnd
      );
    }
    if (!dailyTimeline.length && hasDetailData) {
      dailyTimeline = buildFlatTimeline(totals.balanceSats, runtime.currentPriceUsd);
    }

    let intradayTimeline = [];
    if (hasDetailData && runtime.intradayStart && runtime.intradayEnd) {
      intradayTimeline = combineSnapshotTimelines(
        detailSnapshots,
        "hourlyBalanceTimeline",
        runtime.intradayPriceHistory,
        runtime.intradayStart,
        runtime.intradayEnd,
        {
          stepMs: HOUR_MS,
          alignTime: startOfUtcHour,
          keyForTimestamp: toHourKey,
        }
      );
    }
    if (!intradayTimeline.length && hasDetailData) {
      intradayTimeline = buildFlatTimeline(
        totals.balanceSats,
        runtime.currentPriceUsd,
        24,
        HOUR_MS,
        startOfUtcHour
      );
    }

    return {
      wallet,
      addresses,
      monitoredCount: addresses.length,
      totalBtc: totals.balanceSats / 1e8,
      totalUsd: totals.usdValue,
      dailyTimeline,
      intradayTimeline,
      hasDetailData,
      activity: hasDetailData
        ? applyActivitySettings(
            ActivityLayer.buildCombinedActivity(detailSnapshots, runtime.priceHistory, runtime.currentPriceUsd)
          )
        : [],
    };
  }

  function getAddressView(addressId) {
    const entry = state.addresses.find((address) => address.id === addressId) || null;
    if (!entry) {
      return null;
    }

    const wallet = state.groups.find((group) => group.id === entry.groupId) || null;
    const snapshotsById = getSnapshotsById();
    const snapshot = snapshotsById.get(entry.id) || null;
    const requiredDetailScope = getRequiredDetailScopeForRange();
    const hasDetailData = hasRequiredDetailScope(snapshot, requiredDetailScope);
    const address = {
      ...entry,
      totalBtc: snapshot ? snapshot.balanceSats / 1e8 : null,
      totalUsd: snapshot ? snapshot.usdValue : null,
      isBalanceLoading:
        !snapshot && (runtime.isLoading || runtime.isRefreshing || !runtime.hasLoadedOnce),
    };
    const snapshots = snapshot ? [snapshot] : [];
    const totals = PortfolioLayer.calculateTotals(snapshots);

    let dailyTimeline = [];
    if (hasDetailData && runtime.timelineStart && runtime.timelineEnd) {
      dailyTimeline = PortfolioLayer.combineTimelines(
        snapshots,
        runtime.priceHistory,
        runtime.timelineStart,
        runtime.timelineEnd
      );
    }
    if (!dailyTimeline.length && hasDetailData) {
      dailyTimeline = buildFlatTimeline(totals.balanceSats, runtime.currentPriceUsd);
    }

    let intradayTimeline = [];
    if (hasDetailData && runtime.intradayStart && runtime.intradayEnd) {
      intradayTimeline = combineSnapshotTimelines(
        snapshots,
        "hourlyBalanceTimeline",
        runtime.intradayPriceHistory,
        runtime.intradayStart,
        runtime.intradayEnd,
        {
          stepMs: HOUR_MS,
          alignTime: startOfUtcHour,
          keyForTimestamp: toHourKey,
        }
      );
    }
    if (!intradayTimeline.length && hasDetailData) {
      intradayTimeline = buildFlatTimeline(
        totals.balanceSats,
        runtime.currentPriceUsd,
        24,
        HOUR_MS,
        startOfUtcHour
      );
    }

    return {
      wallet,
      address,
      monitoredCount: 1,
      totalBtc: totals.balanceSats / 1e8,
      totalUsd: totals.usdValue,
      dailyTimeline,
      intradayTimeline,
      hasDetailData,
      activity: hasDetailData
        ? applyActivitySettings(
            ActivityLayer.buildCombinedActivity(snapshots, runtime.priceHistory, runtime.currentPriceUsd)
          )
        : [],
    };
  }

  function getActiveWallet() {
    return state.groups.find((entry) => entry.id === state.settings.activeWalletId) || null;
  }

  function applyActivitySettings(activity) {
    const source = Array.isArray(activity) ? activity : [];
    if (!state.settings.hideDust) {
      return source;
    }

    return source.filter((item) => Math.abs(Number(item?.netSats || 0)) >= DUST_ACTIVITY_THRESHOLD_SATS);
  }

  function getActiveAddress() {
    const activeWallet = getActiveWallet();
    if (!activeWallet || !state.settings.activeAddressId) {
      return null;
    }

    return (
      state.addresses.find(
        (entry) => entry.id === state.settings.activeAddressId && entry.groupId === activeWallet.id
      ) || null
    );
  }

  function getActiveDetailKey() {
    return getActiveAddress()?.id || getActiveWallet()?.id || null;
  }

  function isFaqView() {
    return runtime.currentView === "faq";
  }

  function getVisibleTransactionCount(detailKey) {
    if (!detailKey) {
      return COLLAPSED_TRANSACTION_COUNT;
    }

    const storedCount = Number(runtime.transactionVisibleCountByDetailId?.[detailKey]);
    return Number.isFinite(storedCount) && storedCount > COLLAPSED_TRANSACTION_COUNT
      ? storedCount
      : COLLAPSED_TRANSACTION_COUNT;
  }

  function getSnapshotsById() {
    return new Map(runtime.addressSnapshots.map((snapshot) => [snapshot.entry.id, snapshot]));
  }

  function shouldAutoRefreshVault() {
    if (!state.addresses.length) {
      return false;
    }

    if (!hasCompleteDetailCoverage(getRequiredDetailScopeForRange())) {
      return true;
    }

    if (!hasCompleteCachedCoverage()) {
      return true;
    }

    return isRuntimeCacheStale();
  }

  function isRuntimeCacheStale() {
    if (!state.lastUpdated) {
      return true;
    }

    const lastUpdatedAt = Date.parse(state.lastUpdated);
    if (Number.isNaN(lastUpdatedAt)) {
      return true;
    }

    return Date.now() - lastUpdatedAt > CACHE_MAX_AGE_MS;
  }

  function hasCompleteCachedCoverage() {
    if (!runtime.hasLoadedOnce || !runtime.addressSnapshots.length || !Number.isFinite(runtime.currentPriceUsd)) {
      return false;
    }

    const cachedIds = new Set(runtime.addressSnapshots.map((snapshot) => snapshot.entry.id));
    return state.addresses.every((entry) => cachedIds.has(entry.id));
  }

  function hasCompleteDetailCoverage(requiredScope) {
    if (!hasCompleteCachedCoverage()) {
      return false;
    }

    const snapshotsById = getSnapshotsById();
    return state.addresses.every((entry) =>
      hasRequiredDetailScope(snapshotsById.get(entry.id), requiredScope)
    );
  }

  function shouldPreloadOverviewDetailInBackground() {
    if (!state.addresses.length || getActiveWallet()) {
      return false;
    }

    const fullScope = getFullHistoryScopeForBackground();
    return !hasCompleteCachedCoverage() || !hasCompleteDetailCoverage(fullScope) || isRuntimeCacheStale();
  }

  function preloadOverviewDetailDataIfNeeded({ force = false } = {}) {
    if (overviewDetailPreloadPromise || runtime.isLoading || getActiveWallet() || !state.addresses.length) {
      return overviewDetailPreloadPromise;
    }

    if (!force && !shouldPreloadOverviewDetailInBackground()) {
      return null;
    }

    overviewDetailPreloadPromise = refreshScopedEntries(state.addresses, {
      reason: "overview-detail-preload",
      allowSkeleton: false,
      historyScopeOverride: getFullHistoryScopeForBackground(),
      silent: true,
    })
      .catch(() => null)
      .finally(() => {
        overviewDetailPreloadPromise = null;
      });

    return overviewDetailPreloadPromise;
  }

  function preloadActiveDetailDataIfNeeded() {
    if (runtime.isLoading || runtime.isRefreshing || overviewDetailPreloadPromise) {
      return;
    }

    const activeWallet = getActiveWallet();
    if (!activeWallet) {
      return;
    }

    const activeAddress = getActiveAddress();
    const detailView = activeAddress ? getAddressView(activeAddress.id) : getWalletView(activeWallet.id);
    if (!detailView || detailView.hasDetailData || detailView.monitoredCount <= 0) {
      return;
    }

    refreshVault({ reason: "detail-preload", allowSkeleton: false }).catch(() => {
      render();
    });
  }

  async function hydrateAddressAfterAdd(entry) {
    if (!entry) {
      return;
    }

    const currentPriceUsd = await ensureCurrentPriceUsd();
    const summaryResult = await APILayer.fetchAddressSummary(entry.address);
    const balanceSats = getBalanceSatsFromSummary(summaryResult.summary);
    const summarySnapshot = PortfolioLayer.buildSummarySnapshot({
      entry,
      provider: summaryResult.provider,
      balanceSats,
      currentPriceUsd,
    });

    upsertAddressSnapshot(summarySnapshot);
    runtime.currentPriceUsd = currentPriceUsd;
    runtime.hasLoadedOnce = runtime.addressSnapshots.length > 0;
    runtime.partialFailures = [];
    StorageLayer.saveRuntimeCache(runtime);
    render();

    showAddressFeedback("Address added. Loading recent wallet activity…", "success");
    const quickScope = "30D";
    await hydrateAddressDetail(entry, quickScope, { updateLastUpdated: true });
    render();

    const fullScope = getFullHistoryScopeForBackground();
    if (!hasScopeCoverage(quickScope, fullScope)) {
      showAddressFeedback("Address added. Loading more history in the background…", "success");
      hydrateAddressDetail(entry, fullScope, { updateLastUpdated: true })
        .then(() => {
          render();
        })
        .catch(() => {
          render();
        });
    }
  }

  async function hydrateAddressesAfterAdd(entries) {
    const nextEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (!nextEntries.length) {
      return;
    }

    showAddressFeedback(
      `${nextEntries.length} addresses added. Loading recent wallet activity…`,
      "success"
    );
    const quickScope = "30D";
    await refreshScopedEntries(nextEntries, {
      reason: "address-add",
      allowSkeleton: false,
      historyScopeOverride: quickScope,
    });
    render();

    const fullScope = getFullHistoryScopeForBackground();
    if (!hasScopeCoverage(quickScope, fullScope)) {
      showAddressFeedback(
        `${nextEntries.length} addresses added. Loading more history in the background…`,
        "success"
      );
      refreshScopedEntries(nextEntries, {
        reason: "address-add-background",
        allowSkeleton: false,
        historyScopeOverride: fullScope,
      })
        .then(() => {
          render();
        })
        .catch(() => {
          render();
        });
    }
  }

  async function hydrateAddressDetail(entry, detailScope, { updateLastUpdated = false } = {}) {
    const normalizedScope = normalizeHistoryScope(detailScope);
    const startTimestamp = getStartTimestampForHistoryScope(normalizedScope);
    const endTimestamp = Date.now();
    const hadCoverage = hasScopeCoverage(runtime.historyScope, normalizedScope);
    const [addressResult, marketData] = await Promise.all([
      APILayer.fetchAddressBundle(entry.address, startTimestamp),
      APILayer.fetchMarketData(startTimestamp, endTimestamp, getFiatCurrency()),
    ]);

    const snapshot = PortfolioLayer.buildAddressSnapshot({
      entry,
      bundle: addressResult.bundle,
      provider: addressResult.provider,
      currentPriceUsd: marketData.currentPriceUsd,
      priceHistory: marketData.priceHistory,
      startTimestamp,
      endTimestamp,
      detailScope: normalizedScope,
    });

    upsertAddressSnapshot(snapshot);
    runtime.currentPriceUsd = marketData.currentPriceUsd;
    runtime.fiatExchangeRates = mergeFiatExchangeRates(marketData.fiatExchangeRates, runtime.fiatExchangeRates);
    runtime.currentPriceFiat = Number.isFinite(marketData.displayFiatMarket?.currentPrice)
      ? marketData.displayFiatMarket.currentPrice
      : null;
    runtime.currentPriceFiatCurrency = marketData.displayFiatMarket?.currency || null;
    runtime.fiatPriceHistory =
      marketData.displayFiatMarket?.priceHistory instanceof Map
        ? marketData.displayFiatMarket.priceHistory
        : new Map();
    runtime.fiatIntradayPriceHistory =
      marketData.displayFiatMarket?.intradayPriceHistory instanceof Map
        ? marketData.displayFiatMarket.intradayPriceHistory
        : new Map();
    if (!hadCoverage) {
      runtime.priceHistory = marketData.priceHistory;
    }
    runtime.intradayPriceHistory = marketData.intradayPriceHistory;
    runtime.intradayStart = marketData.intradayStart;
    runtime.intradayEnd = marketData.intradayEnd;
    runtime.historyAvailable = marketData.historyAvailable;
    runtime.historyMissingDays = marketData.historyMissingDays;
    runtime.hasLoadedOnce = runtime.addressSnapshots.length > 0;
    runtime.historyScope = pickHigherHistoryScope(runtime.historyScope, normalizedScope);
    if (!hadCoverage || !Number.isFinite(runtime.timelineStart)) {
      runtime.timelineStart = startTimestamp;
      runtime.timelineEnd = endTimestamp;
    } else if (normalizedScope === "ALL" || normalizedScope === "1Y" || normalizedScope === "30D") {
      runtime.timelineStart = Math.min(
        Number.isFinite(runtime.timelineStart) ? runtime.timelineStart : startTimestamp,
        startTimestamp
      );
      runtime.timelineEnd = Math.max(
        Number.isFinite(runtime.timelineEnd) ? runtime.timelineEnd : endTimestamp,
        endTimestamp
      );
    }

    if (updateLastUpdated) {
      state.lastUpdated = new Date().toISOString();
      StorageLayer.saveState(state);
    }
    StorageLayer.saveRuntimeCache(runtime);
    return snapshot;
  }

  async function ensureCurrentPriceUsd() {
    if (Number.isFinite(runtime.currentPriceUsd)) {
      return runtime.currentPriceUsd;
    }

    const quote = await APILayer.fetchCurrentPriceUsd();
    runtime.currentPriceUsd = quote.price;
    return quote.price;
  }

  async function refreshCurrentPriceInBackground() {
    if (!state.addresses.length) {
      return;
    }

    try {
      const selectedFiatCurrency = getFiatCurrency();
      const directFiatProductId = getDirectFiatProductId(selectedFiatCurrency);
      const [quote, fiatExchangeRates, directFiatQuote] = await Promise.all([
        APILayer.fetchCurrentPriceUsd(),
        APILayer.fetchFiatExchangeRates().catch(() => null),
        directFiatProductId ? fetchCurrentProductQuote(directFiatProductId).catch(() => null) : null,
      ]);
      if (!Number.isFinite(quote?.price)) {
        return;
      }

      const normalizedRates =
        fiatExchangeRates instanceof Map
          ? normalizeFiatExchangeRates(fiatExchangeRates)
          : runtime.fiatExchangeRates;
      const priceUnchanged = runtime.currentPriceUsd === quote.price;
      const ratesUnchanged = areNumberMapsEqual(runtime.fiatExchangeRates, normalizedRates);
      const directPrice = Number.isFinite(directFiatQuote?.price) ? directFiatQuote.price : null;
      const directPriceUnchanged =
        runtime.currentPriceFiat === directPrice &&
        runtime.currentPriceFiatCurrency === (Number.isFinite(directPrice) ? selectedFiatCurrency : null);
      if (priceUnchanged && ratesUnchanged && directPriceUnchanged) {
        return;
      }

      runtime.currentPriceUsd = quote.price;
      runtime.fiatExchangeRates = normalizedRates;
      runtime.currentPriceFiat = directPrice;
      runtime.currentPriceFiatCurrency = Number.isFinite(directPrice) ? selectedFiatCurrency : null;
      if (!Number.isFinite(directPrice)) {
        runtime.fiatPriceHistory = new Map();
        runtime.fiatIntradayPriceHistory = new Map();
      }
      runtime.addressSnapshots = runtime.addressSnapshots.map((snapshot) => ({
        ...snapshot,
        usdValue: (Number(snapshot.balanceSats || 0) / 1e8) * quote.price,
      }));

      if (runtime.addressSnapshots.length) {
        StorageLayer.saveRuntimeCache(runtime);
      }

      render();
    } catch (error) {
      // Keep the cached price if the lightweight live quote refresh fails.
    }
  }

  async function refreshFiatExchangeRatesInBackground() {
    const fiatCurrency = getFiatCurrency();
    if (fiatCurrency === "USD") {
      const hadDirectFiatState =
        runtime.currentPriceFiatCurrency !== null ||
        (runtime.fiatPriceHistory instanceof Map && runtime.fiatPriceHistory.size > 0) ||
        (runtime.fiatIntradayPriceHistory instanceof Map && runtime.fiatIntradayPriceHistory.size > 0);
      runtime.currentPriceFiat = null;
      runtime.currentPriceFiatCurrency = null;
      runtime.fiatPriceHistory = new Map();
      runtime.fiatIntradayPriceHistory = new Map();
      if (hadDirectFiatState) {
        render();
      }
      return;
    }

    try {
      const historyStart = Number.isFinite(runtime.timelineStart)
        ? runtime.timelineStart
        : startOfUtcDay(Date.now() - 29 * DAY_MS);
      const historyEnd = Number.isFinite(runtime.timelineEnd) ? runtime.timelineEnd : Date.now();
      const intradayStart = Number.isFinite(runtime.intradayStart)
        ? runtime.intradayStart
        : startOfUtcHour(Date.now() - 23 * HOUR_MS);
      const intradayEnd = Number.isFinite(runtime.intradayEnd) ? runtime.intradayEnd : Date.now();
      const [nextRatesRaw, displayFiatMarket] = await Promise.all([
        APILayer.fetchFiatExchangeRates().catch(() => null),
        fetchDirectFiatMarketData(fiatCurrency, historyStart, historyEnd, {
          intradayStart,
          intradayEnd,
        }).catch(() => null),
      ]);

      const nextRates =
        nextRatesRaw instanceof Map ? normalizeFiatExchangeRates(nextRatesRaw) : runtime.fiatExchangeRates;
      const ratesUnchanged = areNumberMapsEqual(runtime.fiatExchangeRates, nextRates);
      const directPrice = Number.isFinite(displayFiatMarket?.currentPrice)
        ? displayFiatMarket.currentPrice
        : null;
      const nextFiatHistory =
        displayFiatMarket?.priceHistory instanceof Map ? displayFiatMarket.priceHistory : new Map();
      const nextFiatIntradayHistory =
        displayFiatMarket?.intradayPriceHistory instanceof Map
          ? displayFiatMarket.intradayPriceHistory
          : new Map();
      const directUnchanged =
        runtime.currentPriceFiat === directPrice &&
        runtime.currentPriceFiatCurrency === (displayFiatMarket?.currency || null) &&
        areNumberMapsEqual(runtime.fiatPriceHistory, nextFiatHistory) &&
        areNumberMapsEqual(runtime.fiatIntradayPriceHistory, nextFiatIntradayHistory);

      if (ratesUnchanged && directUnchanged) {
        return;
      }

      runtime.fiatExchangeRates = nextRates;
      runtime.currentPriceFiat = directPrice;
      runtime.currentPriceFiatCurrency = displayFiatMarket?.currency || null;
      runtime.fiatPriceHistory = nextFiatHistory;
      runtime.fiatIntradayPriceHistory = nextFiatIntradayHistory;
      if (runtime.addressSnapshots.length) {
        StorageLayer.saveRuntimeCache(runtime);
      }
      render();
    } catch (error) {
      // Keep existing FX rates if the background refresh fails.
    }
  }

  function upsertAddressSnapshot(nextSnapshot) {
    const nextId = nextSnapshot?.entry?.id;
    if (!nextId) {
      return;
    }

    const nextSnapshots = [...runtime.addressSnapshots];
    const index = nextSnapshots.findIndex((snapshot) => snapshot.entry?.id === nextId);
    if (index === -1) {
      nextSnapshots.push(nextSnapshot);
    } else {
      const current = nextSnapshots[index];
      nextSnapshots[index] =
        current && hasScopeCoverage(current.detailScope, nextSnapshot.detailScope)
          ? {
              ...nextSnapshot,
              detailScope: pickHigherHistoryScope(current.detailScope, nextSnapshot.detailScope),
              txEvents: hasScopeCoverage(current.detailScope, nextSnapshot.detailScope)
                ? current.txEvents
                : nextSnapshot.txEvents,
              balanceTimeline: hasScopeCoverage(current.detailScope, nextSnapshot.detailScope)
                ? current.balanceTimeline
                : nextSnapshot.balanceTimeline,
              hourlyBalanceTimeline: nextSnapshot.hourlyBalanceTimeline,
            }
          : nextSnapshot;
    }
    runtime.addressSnapshots = nextSnapshots;
  }

  function replaceAddressSnapshots(nextSnapshots) {
    const snapshotsById = new Map(runtime.addressSnapshots.map((snapshot) => [snapshot.entry?.id, snapshot]));
    nextSnapshots.forEach((snapshot) => {
      if (snapshot?.entry?.id) {
        snapshotsById.set(snapshot.entry.id, snapshot);
      }
    });
    runtime.addressSnapshots = state.addresses
      .map((entry) => snapshotsById.get(entry.id))
      .filter(Boolean);
  }

  function getBalanceSatsFromSummary(summary) {
    return (
      Number(summary?.chain_stats?.funded_txo_sum || 0) -
      Number(summary?.chain_stats?.spent_txo_sum || 0) +
      Number(summary?.mempool_stats?.funded_txo_sum || 0) -
      Number(summary?.mempool_stats?.spent_txo_sum || 0)
    );
  }

  function getFullHistoryScopeForBackground() {
    return getRequiredDetailScopeForRange();
  }

  function resetViewTransientState() {
    runtime.editingWalletId = null;
    runtime.walletNameDraft = "";
    runtime.chartModalOpen = false;
    runtime.transactionVisibleCountByDetailId = {};
    runtime.selectedTransactionTxid = null;
    runtime.expandedTechnicalTransactionTxid = null;
  }

  function buildViewHash(view = "watch", walletId = null, addressId = null) {
    const params = new URLSearchParams();
    if (addressId && walletId) {
      params.set("view", "address");
      params.set("wallet", walletId);
      params.set("address", addressId);
      return `#${params.toString()}`;
    }

    if (walletId) {
      params.set("view", "wallet");
      params.set("wallet", walletId);
      return `#${params.toString()}`;
    }

    params.set("view", view === "faq" ? "faq" : "watch");
    return `#${params.toString()}`;
  }

  function getCurrentViewHash() {
    return buildViewHash(
      isFaqView() ? "faq" : "watch",
      state.settings.activeWalletId || null,
      state.settings.activeAddressId || null
    );
  }

  function isLocalFigmaCaptureHost() {
    const host = window.location.hostname;
    return (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      /^127(?:\.\d{1,3}){3}$/.test(host)
    );
  }

  function preserveFigmaCaptureParams(nextHash, currentHash = window.location.hash) {
    if (!isLocalFigmaCaptureHost()) {
      return nextHash;
    }

    const currentParams = new URLSearchParams(String(currentHash || "").replace(/^#/, ""));
    if (!currentParams.has("figmacapture")) {
      return nextHash;
    }

    const nextParams = new URLSearchParams(String(nextHash || "").replace(/^#/, ""));
    const orderedParams = new URLSearchParams();

    FIGMA_CAPTURE_HASH_KEYS.forEach((key) => {
      const value = currentParams.get(key);
      if (value !== null) {
        orderedParams.set(key, value);
      }
      nextParams.delete(key);
    });

    nextParams.forEach((value, key) => {
      orderedParams.append(key, value);
    });

    return `#${orderedParams.toString()}`;
  }

  function syncViewRoute(mode = "push") {
    const nextHash = preserveFigmaCaptureParams(getCurrentViewHash());
    if (window.location.hash === nextHash) {
      return;
    }

    if (mode === "replace") {
      window.history.replaceState(null, "", nextHash);
      return;
    }

    window.location.hash = nextHash;
  }

  function parseViewRouteFromHash(hash = window.location.hash) {
    const raw = String(hash || "").replace(/^#/, "");
    const params = new URLSearchParams(raw);
    const view = params.get("view");
    const walletId = params.get("wallet");
    const addressId = params.get("address");

    if (view === "faq") {
      return { view: "faq", walletId: null, addressId: null };
    }

    if (view === "address" && addressId) {
      return { view: "address", walletId: walletId || null, addressId };
    }

    if (view === "wallet" && walletId) {
      return { view: "wallet", walletId, addressId: null };
    }

    if (view === "watch" || view === "vault") {
      return { view: "watch", walletId: null, addressId: null };
    }

    return { view: "watch", walletId: null, addressId: null };
  }

  function resolveViewRoute(route) {
    if (route.view === "faq") {
      return { view: "faq", walletId: null, addressId: null };
    }

    if (route.view === "address" && route.addressId) {
      const address = state.addresses.find((entry) => entry.id === route.addressId);
      if (address) {
        return { view: "watch", walletId: address.groupId, addressId: address.id };
      }
    }

    if (route.view === "wallet" && route.walletId) {
      const wallet = state.groups.find((entry) => entry.id === route.walletId);
      if (wallet) {
        return { view: "watch", walletId: wallet.id, addressId: null };
      }
    }

    return { view: "watch", walletId: null, addressId: null };
  }

  function applyRouteFromHash({ replaceInvalid = false, renderAfter = true, preloadDetail = true } = {}) {
    const route = parseViewRouteFromHash();
    const resolved = resolveViewRoute(route);
    const nextView = resolved.view === "faq" ? "faq" : "watch";
    const walletId = resolved.walletId || null;
    const addressId = resolved.addressId || null;
    const changed =
      state.settings.activeWalletId !== walletId ||
      state.settings.activeAddressId !== addressId ||
      runtime.currentView !== nextView;

    if (!changed) {
      if (replaceInvalid) {
        syncViewRoute("replace");
      }
      return false;
    }

    state.settings.activeWalletId = walletId;
    state.settings.activeAddressId = addressId;
    runtime.currentView = nextView;
    resetViewTransientState();
    StorageLayer.saveState(state);
    clearAddressFeedback();
    if (renderAfter) {
      render();
    }
    if (replaceInvalid) {
      syncViewRoute("replace");
    }
    if (preloadDetail && walletId) {
      preloadActiveDetailDataIfNeeded();
    }
    return true;
  }

  function openOverview() {
    runtime.currentView = "watch";
    state.settings.activeWalletId = null;
    state.settings.activeAddressId = null;
    resetViewTransientState();
    StorageLayer.saveState(state);
    clearAddressFeedback();
    clearAddressTagFeedback();
    resetAddressTagForm();
    render();
    syncViewRoute("push");
  }

  function openFaq() {
    runtime.currentView = "faq";
    state.settings.activeWalletId = null;
    state.settings.activeAddressId = null;
    resetViewTransientState();
    StorageLayer.saveState(state);
    clearAddressFeedback();
    clearAddressTagFeedback();
    resetAddressTagForm();
    render();
    syncViewRoute("push");
  }

  function openWallet(walletId) {
    const wallet = state.groups.find((entry) => entry.id === walletId);
    if (!wallet) {
      return;
    }

    runtime.currentView = "watch";
    state.settings.activeWalletId = wallet.id;
    state.settings.activeAddressId = null;
    resetViewTransientState();
    StorageLayer.saveState(state);
    clearAddressFeedback();
    clearAddressTagFeedback();
    resetAddressTagForm();
    render();
    syncViewRoute("push");
    preloadActiveDetailDataIfNeeded();

    if (!state.addresses.some((entry) => entry.groupId === wallet.id)) {
      requestAnimationFrame(() => {
        dom.walletAddressInput.focus();
      });
    }
  }

  function createWallet() {
    const wallet = {
      id: createId("grp"),
      name: getNextWalletName(),
    };

    state.groups.push(wallet);
    runtime.currentView = "watch";
    state.settings.activeWalletId = wallet.id;
    state.settings.activeAddressId = null;
    state.selectedRange = "30D";
    resetViewTransientState();
    StorageLayer.saveState(state);
    clearAddressFeedback();
    clearAddressTagFeedback();
    resetAddressTagForm();
    render();
    syncViewRoute("push");

    requestAnimationFrame(() => {
      dom.walletAddressInput.focus();
    });
  }

  function openAddress(addressId) {
    const address = state.addresses.find((entry) => entry.id === addressId);
    if (!address) {
      return;
    }

    runtime.currentView = "watch";
    state.settings.activeWalletId = address.groupId;
    state.settings.activeAddressId = address.id;
    resetViewTransientState();
    StorageLayer.saveState(state);
    clearAddressFeedback();
    clearAddressTagFeedback();
    resetAddressTagForm();
    render();
    syncViewRoute("push");
    preloadActiveDetailDataIfNeeded();
  }

  async function copyActiveAddressToClipboard() {
    const activeAddress = getActiveAddress();
    if (!activeAddress?.address) {
      return;
    }

    try {
      await copyPlainTextToClipboard(activeAddress.address);
      setHeaderStatus("Address copied", "success", { autoClearMs: 1800 });
      render();
    } catch (error) {
      setBanner("warning", "Copy failed. Try selecting the address manually.");
      render();
    }
  }

  function enterWalletRename() {
    const activeWallet = getActiveWallet();
    if (!activeWallet) {
      return;
    }

    runtime.editingWalletId = activeWallet.id;
    runtime.walletNameDraft = activeWallet.name;
    render();

    requestAnimationFrame(() => {
      dom.walletTitleText.focus();
      placeCaretAtEnd(dom.walletTitleText);
    });
  }

  function commitWalletRename({ quiet = false } = {}) {
    const activeWallet = getActiveWallet();
    if (!activeWallet || runtime.editingWalletId !== activeWallet.id) {
      return;
    }

    const normalized = normalizeWalletName(runtime.walletNameDraft);
    if (!normalized) {
      if (!quiet) {
        setBanner("warning", "Wallet name cannot be empty.");
      }
      cancelWalletRename();
      return;
    }

    const duplicate = state.groups.some(
      (entry) => entry.id !== activeWallet.id && entry.name.toLowerCase() === normalized.toLowerCase()
    );
    if (duplicate) {
      if (!quiet) {
        setBanner("warning", "That wallet name is already in use.");
      }
      cancelWalletRename();
      render();
      return;
    }

    activeWallet.name = normalized;
    runtime.editingWalletId = null;
    runtime.walletNameDraft = "";
    StorageLayer.saveState(state);
    render();
    clearWalletRenameFocus();
  }

  function cancelWalletRename() {
    runtime.editingWalletId = null;
    runtime.walletNameDraft = "";
    render();
    clearWalletRenameFocus();
  }

  function isEnterKeyEvent(event) {
    return (
      event.key === "Enter" ||
      event.code === "Enter" ||
      event.code === "NumpadEnter" ||
      event.keyCode === 13 ||
      event.which === 13
    );
  }

  function placeCaretAtEnd(element) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function clearWalletRenameFocus() {
    requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (activeElement && typeof activeElement.blur === "function") {
        activeElement.blur();
      }

      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
    });
  }

  function removeAddress(addressId) {
    const address = state.addresses.find((entry) => entry.id === addressId);
    if (!address) {
      return;
    }

    const wallet = state.groups.find((entry) => entry.id === address.groupId);
    const confirmed = window.confirm(
      `Remove ${shortAddress(address.address)} from ${wallet?.name || "this wallet"}?`
    );
    if (!confirmed) {
      return;
    }

    state.addresses = state.addresses.filter((entry) => entry.id !== addressId);
    if (state.settings.activeAddressId === addressId) {
      state.settings.activeAddressId = null;
    }
    runtime.addressSnapshots = runtime.addressSnapshots.filter((snapshot) => snapshot.entry.id !== addressId);
    StorageLayer.saveState(state);
    clearAddressFeedback();
    clearAddressTagFeedback();
    resetAddressTagForm();
    runtime.selectedTransactionTxid = null;
    runtime.expandedTechnicalTransactionTxid = null;

    if (!state.addresses.length) {
      state.lastUpdated = null;
      StorageLayer.saveState(state);
      StorageLayer.clearRuntimeCache();
      runtime = {
        ...createRuntimeState(),
        banner: {
          tone: "default",
          text: "Address removed.",
        },
      };
      render();
      syncViewRoute("replace");
      return;
    }

    StorageLayer.saveRuntimeCache(runtime);
    setBanner("default", "Address removed.");
    render();
    syncViewRoute("replace");

    refreshVault({ reason: "address-remove", allowSkeleton: false }).catch((error) => {
      setBanner("warning", `Address removed, but refresh failed. ${error.message || ""}`.trim());
      render();
    });
  }

  function removeWallet(walletId) {
    const wallet = state.groups.find((entry) => entry.id === walletId);
    if (!wallet) {
      return;
    }

    if (state.groups.length <= 1) {
      setBanner("warning", "Bitkit Watch needs at least one wallet.");
      render();
      return;
    }

    const walletAddresses = state.addresses.filter((entry) => entry.groupId === wallet.id);
    const addressCount = walletAddresses.length;
    const suffix =
      addressCount > 0
        ? ` This will also remove ${addressCount} ${addressCount === 1 ? "address" : "addresses"} from Bitkit Watch.`
        : "";
    const confirmed = window.confirm(`Delete ${wallet.name}?${suffix}`);
    if (!confirmed) {
      return;
    }

    const removedAddressIds = new Set(walletAddresses.map((entry) => entry.id));
    state.groups = state.groups.filter((entry) => entry.id !== wallet.id);
    state.addresses = state.addresses.filter((entry) => entry.groupId !== wallet.id);
    runtime.addressSnapshots = runtime.addressSnapshots.filter(
      (snapshot) => !removedAddressIds.has(snapshot.entry.id)
    );
    state.settings.activeWalletId = null;
    state.settings.activeAddressId = null;
    runtime.editingWalletId = null;
    runtime.walletNameDraft = "";
    runtime.transactionVisibleCountByDetailId = {};
    runtime.selectedTransactionTxid = null;
    runtime.expandedTechnicalTransactionTxid = null;
    if (!Array.isArray(state.seededDemoWallets)) {
      state.seededDemoWallets = [];
    }
    if (wallet.name.toLowerCase() === SATOSHI_DEMO_NAME.toLowerCase()) {
      state.seededDemoWallets = uniqueStrings([...state.seededDemoWallets, SATOSHI_DEMO_KEY]);
    }
    StorageLayer.saveState(state);
    clearAddressFeedback();

    if (!state.addresses.length) {
      state.lastUpdated = null;
      StorageLayer.saveState(state);
      StorageLayer.clearRuntimeCache();
      runtime.banner = {
        tone: "default",
        text: "Wallet deleted.",
      };
      render();
      syncViewRoute("replace");
      return;
    }

    StorageLayer.saveRuntimeCache(runtime);
    setBanner("default", "Wallet deleted.");
    render();
    syncViewRoute("replace");

    refreshVault({ reason: "wallet-remove", allowSkeleton: false }).catch((error) => {
      setBanner("warning", `Wallet deleted, but refresh failed. ${error.message || ""}`.trim());
      render();
    });
  }

  function clearVault() {
    const confirmed = window.confirm("Clear all local Bitkit Watch data from this browser?");
    if (!confirmed) {
      return;
    }

    state = StorageLayer.buildDefaultState();
    runtime = {
      ...createRuntimeState(),
      banner: {
        tone: "default",
        text: "Local Bitkit Watch data cleared.",
      },
    };
    localStorage.removeItem(STORAGE_KEYS.state);
    StorageLayer.clearRuntimeCache();
    clearAddressFeedback();
    clearAddressTagFeedback();
    resetAddressTagForm();
    render();
    syncViewRoute("replace");
  }

  function showAddressFeedback(message, tone) {
    clearAddressFeedbackTimers();
    dom.walletAddressFeedback.hidden = false;
    dom.walletAddressFeedback.className = `form-feedback is-${tone}`;
    dom.walletAddressFeedback.textContent = message;

    if (tone === "success") {
      addressFeedbackFadeTimer = window.setTimeout(() => {
        dom.walletAddressFeedback.classList.add("is-fading");
        addressFeedbackHideTimer = window.setTimeout(() => {
          clearAddressFeedback();
        }, 300);
      }, 2000);
    }
  }

  function clearAddressFeedback() {
    clearAddressFeedbackTimers();
    dom.walletAddressFeedback.hidden = true;
    dom.walletAddressFeedback.className = "form-feedback";
    dom.walletAddressFeedback.textContent = "";
  }

  function clearAddressFeedbackTimers() {
    if (addressFeedbackFadeTimer) {
      window.clearTimeout(addressFeedbackFadeTimer);
      addressFeedbackFadeTimer = 0;
    }
    if (addressFeedbackHideTimer) {
      window.clearTimeout(addressFeedbackHideTimer);
      addressFeedbackHideTimer = 0;
    }
  }

  function showAddressTagFeedback(message, tone) {
    dom.addressTagFeedback.hidden = false;
    dom.addressTagFeedback.className = `form-feedback is-${tone}`;
    dom.addressTagFeedback.textContent = message;
  }

  function clearAddressTagFeedback() {
    dom.addressTagFeedback.hidden = true;
    dom.addressTagFeedback.className = "form-feedback";
    dom.addressTagFeedback.textContent = "";
  }

  function resetAddressTagForm() {
    dom.addressTagForm.reset();
  }

  function addAddressTag() {
    clearAddressTagFeedback();
    const activeAddress = getActiveAddress();
    if (!activeAddress) {
      return;
    }

    const nextTag = normalizeAddressTag(dom.addressTagInput.value);
    if (!nextTag) {
      showAddressTagFeedback("Enter a tag.", "error");
      return;
    }

    const currentTags = normalizeAddressTags(activeAddress.tags);
    const isDuplicate = currentTags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase());
    if (isDuplicate) {
      showAddressTagFeedback("That tag already exists.", "error");
      return;
    }

    activeAddress.tags = [...currentTags, nextTag];
    StorageLayer.saveState(state);
    resetAddressTagForm();
    render();
    requestAnimationFrame(() => {
      dom.addressTagInput.focus();
    });
  }

  function removeAddressTag(rawTag) {
    const activeAddress = getActiveAddress();
    const nextTag = normalizeAddressTag(rawTag);
    if (!activeAddress || !nextTag) {
      return;
    }

    activeAddress.tags = normalizeAddressTags(activeAddress.tags).filter(
      (tag) => tag.toLowerCase() !== nextTag.toLowerCase()
    );
    StorageLayer.saveState(state);
    clearAddressTagFeedback();
    render();
  }

  function syncBalanceToggle() {
    const label = state.hideBalances ? "Show balances" : "Hide balances";
    dom.toggleBalancesButton.setAttribute("aria-label", label);
    dom.toggleBalancesButton.title = label;
    dom.toggleBalancesButton.setAttribute("aria-pressed", String(state.hideBalances));
    if (dom.balanceToggleIcon) {
      dom.balanceToggleIcon.innerHTML = state.hideBalances ? getEyeSlashIconMarkup() : getEyeIconMarkup();
    }
  }

  function syncDisplayModeToggle() {
    const displayUnit = getDisplayUnit();
    const nextUnit = displayUnit === "BTC" ? getFiatCurrency() : "BTC";
    const currentUnitLabel = displayUnit === "BTC" ? getBitcoinDisplayPrefix() : getFiatDisplayPrefix();
    const currentUnitName = displayUnit === "BTC" ? "BTC" : getFiatCurrency();
    dom.unitDisplayButtonLabel.textContent = currentUnitLabel;
    dom.unitDisplayButton.classList.toggle("has-long-label", currentUnitLabel.length > 1);
    dom.unitDisplayButton.setAttribute("aria-label", `Primary display unit: ${currentUnitName}`);
    dom.unitDisplayButton.setAttribute("aria-pressed", String(displayUnit === "USD"));
    dom.unitDisplayButton.title = `Switch primary display to ${nextUnit}`;
  }

  function syncBackgroundGraphicsPreference() {
    document.body.classList.toggle("background-graphics-hidden", state.settings.showBackgroundGraphics === false);
  }

  function syncViewModeClass() {
    const faqOpen = isFaqView();
    document.body.classList.toggle("is-watch-view", !getActiveWallet() && !faqOpen);
    document.body.classList.toggle("is-faq-view", faqOpen);
  }

  // ---------------------------------------------------------------------------
  // State normalization and storage
  // ---------------------------------------------------------------------------

  function sanitizeState() {
    if (!Array.isArray(state.groups) || !state.groups.length) {
      state.groups = buildDefaultState().groups;
    }

    if (!Array.isArray(state.addresses)) {
      state.addresses = [];
    }

    if (!state.settings || typeof state.settings !== "object") {
      state.settings = createDefaultSettings();
    }

    const validIds = new Set(state.groups.map((entry) => entry.id));
    const fallbackWalletId = state.groups[0]?.id || null;

    state.addresses.forEach((entry) => {
      if (!validIds.has(entry.groupId)) {
        entry.groupId = fallbackWalletId;
      }
      entry.tags = normalizeAddressTags(entry.tags);
    });

    if (!validIds.has(state.settings.activeWalletId)) {
      state.settings.activeWalletId = null;
    }

    const addressIds = new Set(state.addresses.map((entry) => entry.id));
    if (
      !addressIds.has(state.settings.activeAddressId) ||
      (state.settings.activeAddressId &&
        state.settings.activeWalletId &&
        state.addresses.find((entry) => entry.id === state.settings.activeAddressId)?.groupId !==
          state.settings.activeWalletId)
    ) {
      state.settings.activeAddressId = null;
    }

    if (runtime.editingWalletId && !validIds.has(runtime.editingWalletId)) {
      runtime.editingWalletId = null;
      runtime.walletNameDraft = "";
    }

    if (!Array.isArray(state.seededDemoWallets)) {
      state.seededDemoWallets = [];
    }

    state.selectedRange = normalizeChartRange(state.selectedRange);
    if (!["BTC", "USD"].includes(state.settings.displayUnit)) {
      state.settings.displayUnit = "BTC";
    }
    state.settings.fiatCurrency = normalizeFiatCurrency(state.settings.fiatCurrency);
    state.settings.hideDust =
      typeof state.settings.hideDust === "boolean" ? state.settings.hideDust : true;
    state.settings.bitcoinNotation = normalizeBitcoinNotation(state.settings.bitcoinNotation);
    state.settings.showBackgroundGraphics =
      typeof state.settings.showBackgroundGraphics === "boolean"
        ? state.settings.showBackgroundGraphics
        : true;
  }

  function setBanner(tone, text) {
    setHeaderStatus("");
    runtime.banner = { tone, text };
  }

  function setHeaderStatus(text, tone = "default", { autoClearMs = 0 } = {}) {
    if (headerStatusTimer) {
      window.clearTimeout(headerStatusTimer);
      headerStatusTimer = 0;
    }

    runtime.headerStatus = text || "";
    runtime.headerStatusTone = text ? tone : "default";

    if (text && autoClearMs > 0) {
      headerStatusTimer = window.setTimeout(() => {
        runtime.headerStatus = "";
        runtime.headerStatusTone = "default";
        headerStatusTimer = 0;
        render();
      }, autoClearMs);
    }
  }

  function getNextWalletName() {
    const nextNumber =
      state.groups.reduce((max, entry) => {
        const match = /^wallet#(\d+)$/i.exec(entry.name.trim());
        if (!match) {
          return max;
        }
        return Math.max(max, Number(match[1]) || 0);
      }, 0) + 1;

    return `WALLET#${nextNumber}`;
  }

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
    };
    seedSatoshiDemoWallet(next, { force: true });
    return next;
  }

  function loadState() {
    const fallback = buildDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.state);
      if (!raw) {
        return fallback;
      }

      return normalizeImportedState(JSON.parse(raw));
    } catch (error) {
      return {
        ...fallback,
        _loadWarning: "Stored Bitkit Watch data was corrupted and has been reset.",
      };
    }
  }

  function saveState(nextState) {
    localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(serializeInternalState(nextState)));
  }

  function loadRuntimeCache(currentState) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.runtimeCache);
      if (!raw) {
        return null;
      }

      return normalizeRuntimeCache(JSON.parse(raw), currentState);
    } catch (error) {
      localStorage.removeItem(STORAGE_KEYS.runtimeCache);
      return null;
    }
  }

  function saveRuntimeCache(currentRuntime) {
    const candidates = buildRuntimeCacheCandidates(currentRuntime);
    if (!candidates.length) {
      clearRuntimeCache();
      return;
    }

    for (const serialized of candidates) {
      try {
        localStorage.setItem(STORAGE_KEYS.runtimeCache, JSON.stringify(serialized));
        return;
      } catch (error) {
        if (!isStorageQuotaError(error)) {
          return;
        }
      }
    }
  }

  function clearRuntimeCache() {
    localStorage.removeItem(STORAGE_KEYS.runtimeCache);
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

    seedSatoshiDemoWallet(next);
    return next;
  }

  function buildRuntimeCacheCandidates(currentRuntime) {
    return [
      serializeRuntimeCache(currentRuntime),
      serializeRuntimeCache(currentRuntime, {
        includeAddressDetails: false,
      }),
      serializeRuntimeCache(currentRuntime, {
        includeAddressDetails: false,
        includeIntradayPriceHistory: false,
        includeHourlyBalanceTimeline: false,
      }),
      serializeRuntimeCache(currentRuntime, {
        includeAddressDetails: false,
        includeIntradayPriceHistory: false,
        includeHourlyBalanceTimeline: false,
        maxTxEventsPerSnapshot: 60,
      }),
      serializeRuntimeCache(currentRuntime, {
        includeAddressDetails: false,
        includeIntradayPriceHistory: false,
        includeHourlyBalanceTimeline: false,
        maxTxEventsPerSnapshot: 0,
      }),
    ].filter(Boolean);
  }

  function serializeRuntimeCache(
    currentRuntime,
    {
      includeAddressDetails = true,
      includeIntradayPriceHistory = true,
      includeHourlyBalanceTimeline = true,
      maxTxEventsPerSnapshot = Infinity,
    } = {}
  ) {
    if (!Array.isArray(currentRuntime.addressSnapshots) || !currentRuntime.addressSnapshots.length) {
      return null;
    }

    return {
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
      addressSnapshots: currentRuntime.addressSnapshots.map((snapshot) => ({
        entryId: snapshot.entry?.id || null,
        provider: snapshot.provider || "",
        balanceSats: Number(snapshot.balanceSats || 0),
        usdValue: Number.isFinite(snapshot.usdValue) ? snapshot.usdValue : null,
        approximate: Boolean(snapshot.approximate),
        detailScope: normalizeSnapshotDetailScope(snapshot.detailScope),
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
          .map((snapshot) => normalizeCachedSnapshot(snapshot, addressById))
          .filter(Boolean)
      : [];

    if (!snapshots.length) {
      return null;
    }

    return {
      historyScope: normalizeHistoryScope(candidate.historyScope),
      currentPriceUsd: Number.isFinite(candidate.currentPriceUsd) ? candidate.currentPriceUsd : null,
      fiatExchangeRates: normalizeFiatExchangeRates(candidate.fiatExchangeRates),
      priceHistory: deserializeNumberMap(candidate.priceHistory),
      intradayPriceHistory: deserializeNumberMap(candidate.intradayPriceHistory),
      historyAvailable: candidate.historyAvailable !== false,
      historyMissingDays: Number.isFinite(candidate.historyMissingDays) ? candidate.historyMissingDays : 0,
      approximationMode: Boolean(candidate.approximationMode),
      timelineStart: Number.isFinite(candidate.timelineStart) ? candidate.timelineStart : null,
      timelineEnd: Number.isFinite(candidate.timelineEnd) ? candidate.timelineEnd : null,
      intradayStart: Number.isFinite(candidate.intradayStart) ? candidate.intradayStart : null,
      intradayEnd: Number.isFinite(candidate.intradayEnd) ? candidate.intradayEnd : null,
      addressSnapshots: snapshots,
    };
  }

  function normalizeCachedSnapshot(snapshot, addressById) {
    if (!snapshot || typeof snapshot !== "object" || typeof snapshot.entryId !== "string") {
      return null;
    }

    const entry = addressById.get(snapshot.entryId);
    if (!entry) {
      return null;
    }

    return {
      entry,
      provider: typeof snapshot.provider === "string" ? snapshot.provider : "",
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

    source.forEach((entry) => {
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

    const serialized = source.map((event) => ({
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

    if (!Number.isFinite(maxItems) || maxItems < 0) {
      return serialized;
    }

    return maxItems === 0 ? [] : serialized.slice(0, maxItems);
  }

  function normalizeCachedTxEvents(source) {
    if (!Array.isArray(source)) {
      return [];
    }

    return source
      .map((event) => {
        if (!event || typeof event.txid !== "string") {
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
      .map((point) => {
        if (!point || typeof point.dateKey !== "string") {
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
    const source = Array.isArray(rawGroups) && rawGroups.length ? rawGroups : DEFAULT_WALLET_NAMES;
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
    const source = Array.isArray(rawAddresses) ? rawAddresses : [];
    const seen = new Set();
    const normalized = [];

    source.forEach((entry) => {
      const address = typeof entry?.address === "string" ? entry.address.trim() : "";
      if (!address) {
        return;
      }

      const key = address.toLowerCase();
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

  function normalizeAddressTag(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().toLowerCase() : "";
  }

  function normalizeAddressTags(values) {
    const source = Array.isArray(values) ? values : [];
    const seen = new Set();
    const normalized = [];

    source.forEach((value) => {
      const tag = normalizeAddressTag(value);
      if (!tag) {
        return;
      }

      const key = tag.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      normalized.push(tag);
    });

    return normalized;
  }

  function parseAddressInput(rawValue) {
    if (typeof rawValue !== "string") {
      return [];
    }

    return rawValue
      .split(/[\s,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function classifyAddressBatchDuplicates(addresses) {
    const existingAddresses = new Set(state.addresses.map((entry) => entry.address.toLowerCase()));
    const seen = new Set();
    const unique = [];
    const duplicates = [];
    const existing = [];

    addresses.forEach((address) => {
      const key = address.toLowerCase();
      if (existingAddresses.has(key)) {
        existing.push(address);
        return;
      }
      if (seen.has(key)) {
        duplicates.push(address);
        return;
      }

      seen.add(key);
      unique.push(address);
    });

    return {
      unique,
      duplicates: uniqueStrings(duplicates),
      existing: uniqueStrings(existing),
    };
  }

  function normalizeDemoSeedKeys(rawKeys) {
    if (!Array.isArray(rawKeys)) {
      return [];
    }

    return uniqueStrings(
      rawKeys.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
    );
  }

  function seedSatoshiDemoWallet(nextState, { force = false } = {}) {
    const seededKeys = normalizeDemoSeedKeys(nextState.seededDemoWallets);
    const alreadySeeded = seededKeys.includes(SATOSHI_DEMO_KEY);
    if (alreadySeeded && !force) {
      nextState.seededDemoWallets = seededKeys;
      return nextState;
    }

    const hasAnyDemoAddress = nextState.addresses.some((entry) =>
      SATOSHI_DEMO_ADDRESSES.some((address) => address.toLowerCase() === entry.address.toLowerCase())
    );
    if (hasAnyDemoAddress && !force) {
      nextState.seededDemoWallets = uniqueStrings([...seededKeys, SATOSHI_DEMO_KEY]);
      return nextState;
    }

    let satoshiWallet = nextState.groups.find(
      (entry) => entry.name.toLowerCase() === SATOSHI_DEMO_NAME.toLowerCase()
    );

    if (!satoshiWallet) {
      const emptyBusinessWallet = nextState.groups.find(
        (entry) =>
          entry.name.toLowerCase() === LEGACY_BUSINESS_WALLET_NAME.toLowerCase() &&
          !nextState.addresses.some((address) => address.groupId === entry.id)
      );
      if (emptyBusinessWallet) {
        emptyBusinessWallet.name = SATOSHI_DEMO_NAME;
        satoshiWallet = emptyBusinessWallet;
      }
    }

    if (!satoshiWallet) {
      satoshiWallet = {
        id: createId("grp"),
        name: SATOSHI_DEMO_NAME,
      };
      const insertIndex = Math.min(2, nextState.groups.length);
      nextState.groups.splice(insertIndex, 0, satoshiWallet);
    }

    const existingAddresses = new Set(nextState.addresses.map((entry) => entry.address.toLowerCase()));
    const createdAt = new Date().toISOString();
    SATOSHI_DEMO_ADDRESSES.forEach((address) => {
      if (existingAddresses.has(address.toLowerCase())) {
        return;
      }

      nextState.addresses.push({
        id: createId("addr"),
        address,
        tags: normalizeAddressTags(SATOSHI_DEMO_ADDRESS_TAGS[address]),
        groupId: satoshiWallet.id,
        createdAt,
      });
    });

    nextState.seededDemoWallets = uniqueStrings([...seededKeys, SATOSHI_DEMO_KEY]);
    return nextState;
  }

  function uniqueStrings(values) {
    return [...new Set(values)];
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function looksLikeBitcoinAddress(value) {
    if (typeof value !== "string") return false;
    const s = value.trim();
    if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(s)) return true;
    if (/^bc1[a-z0-9]{11,71}$/i.test(s)) return true;
    return false;
  }

  const ValidationLayer = {
    async isValidMainnetBitcoinAddress(address) {
      const normalized = address.trim();
      if (!normalized) {
        return false;
      }

      if (normalized.toLowerCase().startsWith("bc1")) {
        return validateBech32Address(normalized);
      }

      if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(normalized)) {
        return validateBase58Address(normalized);
      }

      return false;
    },

    async detectSensitiveBitcoinInput(rawValue, parsedEntries = []) {
      const sourceEntries = Array.isArray(parsedEntries) ? parsedEntries : [];
      for (const entry of sourceEntries) {
        const secretKind = await classifySensitiveBitcoinToken(entry);
        if (secretKind) {
          return {
            detected: true,
            kind: secretKind,
            message:
              secretKind === "recovery-phrase"
                ? "That looks like a Bitcoin recovery phrase. Bitkit Watch only accepts public addresses, so the pasted secret was cleared before anything was validated or sent anywhere."
                : "That looks like a Bitcoin private key. Bitkit Watch only accepts public addresses, so the pasted secret was cleared before anything was validated or sent anywhere.",
          };
        }
      }

      const normalizedRaw = typeof rawValue === "string" ? rawValue.trim() : "";
      if (looksLikeRecoveryPhrase(normalizedRaw)) {
        return {
          detected: true,
          kind: "recovery-phrase",
          message:
            "That looks like a Bitcoin recovery phrase. Bitkit Watch only accepts public addresses, so the pasted secret was cleared before anything was validated or sent anywhere.",
        };
      }

      return {
        detected: false,
        kind: null,
        message: "",
      };
    },
  };

  async function classifySensitiveBitcoinToken(value) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      return null;
    }

    if (looksLikeExtendedPrivateKey(normalized) || looksLikeRawHexPrivateKey(normalized)) {
      return "private-key";
    }

    if (await validateWifPrivateKey(normalized)) {
      return "private-key";
    }

    return null;
  }

  async function validateWifPrivateKey(value) {
    if (!/^(5[1-9A-HJ-NP-Za-km-z]{50}|[KL][1-9A-HJ-NP-Za-km-z]{51})$/.test(value)) {
      return false;
    }

    const decoded = decodeBase58(value);
    if (!decoded || (decoded.length !== 37 && decoded.length !== 38)) {
      return false;
    }

    const payload = decoded.slice(0, -4);
    const checksum = decoded.slice(-4);
    if (payload[0] !== 0x80) {
      return false;
    }

    if (payload.length !== 33 && payload.length !== 34) {
      return false;
    }

    if (payload.length === 34 && payload[payload.length - 1] !== 0x01) {
      return false;
    }

    if (!crypto?.subtle?.digest) {
      return true;
    }

    try {
      const hash = await doubleSha256(payload);
      return checksum.every((byte, index) => byte === hash[index]);
    } catch (error) {
      return true;
    }
  }

  function looksLikeExtendedPrivateKey(value) {
    return (
      EXTENDED_PRIVATE_KEY_PREFIXES.some((prefix) => value.startsWith(prefix)) &&
      /^[1-9A-HJ-NP-Za-km-z]+$/.test(value.slice(4)) &&
      value.length >= 100
    );
  }

  function looksLikeRawHexPrivateKey(value) {
    return /^(0x)?[0-9a-fA-F]{64}$/.test(value);
  }

  function looksLikeRecoveryPhrase(value) {
    if (!value || /[,;]/.test(value)) {
      return false;
    }

    const words = value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return (
      PROBABLE_MNEMONIC_WORD_COUNTS.has(words.length) &&
      words.every((word) => /^[a-z]{3,8}$/.test(word))
    );
  }

  async function validateBase58Address(address) {
    const decoded = decodeBase58(address);
    if (!decoded || decoded.length !== 25) {
      return false;
    }

    const payload = decoded.slice(0, 21);
    const checksum = decoded.slice(21);

    if (![0x00, 0x05].includes(payload[0])) {
      return false;
    }

    if (!crypto?.subtle?.digest) {
      return true;
    }

    try {
      const hash = await doubleSha256(payload);
      return checksum.every((value, index) => value === hash[index]);
    } catch (error) {
      return true;
    }
  }

  function decodeBase58(value) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let num = 0n;

    for (const char of value) {
      const index = alphabet.indexOf(char);
      if (index === -1) {
        return null;
      }
      num = num * 58n + BigInt(index);
    }

    const bytes = [];
    while (num > 0n) {
      bytes.push(Number(num % 256n));
      num /= 256n;
    }
    bytes.reverse();

    let leadingZeroes = 0;
    while (leadingZeroes < value.length && value[leadingZeroes] === "1") {
      bytes.unshift(0);
      leadingZeroes += 1;
    }

    return Uint8Array.from(bytes);
  }

  async function doubleSha256(bytes) {
    const first = await crypto.subtle.digest("SHA-256", bytes);
    const second = await crypto.subtle.digest("SHA-256", first);
    return new Uint8Array(second).slice(0, 4);
  }

  function validateBech32Address(address) {
    const normalized = address.toLowerCase();
    if (address !== normalized && address !== address.toUpperCase()) {
      return false;
    }

    if (normalized.length < 14 || normalized.length > 74) {
      return false;
    }

    const separatorIndex = normalized.lastIndexOf("1");
    if (separatorIndex < 1 || separatorIndex + 7 > normalized.length) {
      return false;
    }

    const hrp = normalized.slice(0, separatorIndex);
    const dataPart = normalized.slice(separatorIndex + 1);
    if (hrp !== "bc") {
      return false;
    }

    const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    const data = [];
    for (const char of dataPart) {
      const value = charset.indexOf(char);
      if (value === -1) {
        return false;
      }
      data.push(value);
    }

    const encoding = verifyBech32Checksum(hrp, data);
    if (!encoding) {
      return false;
    }

    const payload = data.slice(0, -6);
    const witnessVersion = payload[0];
    if (witnessVersion > 16) {
      return false;
    }

    const program = convertBits(payload.slice(1), 5, 8, false);
    if (!program || program.length < 2 || program.length > 40) {
      return false;
    }

    if (witnessVersion === 0) {
      return encoding === "bech32" && (program.length === 20 || program.length === 32);
    }

    return encoding === "bech32m";
  }

  function verifyBech32Checksum(hrp, data) {
    const check = bech32Polymod([...expandBech32Hrp(hrp), ...data]);
    if (check === 1) {
      return "bech32";
    }
    if (check === 0x2bc830a3) {
      return "bech32m";
    }
    return null;
  }

  function expandBech32Hrp(hrp) {
    const result = [];
    for (let i = 0; i < hrp.length; i += 1) {
      result.push(hrp.charCodeAt(i) >> 5);
    }
    result.push(0);
    for (let i = 0; i < hrp.length; i += 1) {
      result.push(hrp.charCodeAt(i) & 31);
    }
    return result;
  }

  function bech32Polymod(values) {
    const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let checksum = 1;
    for (const value of values) {
      const top = checksum >> 25;
      checksum = ((checksum & 0x1ffffff) << 5) ^ value;
      for (let i = 0; i < 5; i += 1) {
        if ((top >> i) & 1) {
          checksum ^= generators[i];
        }
      }
    }
    return checksum;
  }

  function convertBits(data, fromBits, toBits, pad) {
    let acc = 0;
    let bits = 0;
    const result = [];
    const maxValue = (1 << toBits) - 1;

    for (const value of data) {
      if (value < 0 || value >> fromBits !== 0) {
        return null;
      }
      acc = (acc << fromBits) | value;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        result.push((acc >> bits) & maxValue);
      }
    }

    if (pad) {
      if (bits > 0) {
        result.push((acc << (toBits - bits)) & maxValue);
      }
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxValue)) {
      return null;
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // API layer
  // ---------------------------------------------------------------------------

  const APILayer = {
    async fetchAddressSummary(address) {
      const attempts = ADDRESS_API_PROVIDERS.map((provider) => async () => {
        const summary = await fetchAddressSummaryFromProvider(provider, address);
        return {
          provider: provider.name,
          summary,
        };
      });

      return withFallback(attempts, "Address summary lookup failed.");
    },

    async fetchAddressBundle(address, startTimestamp) {
      const attempts = ADDRESS_API_PROVIDERS.map((provider) => async () => {
        const bundle = await fetchAddressBundleFromProvider(provider, address, startTimestamp);
        return {
          provider: provider.name,
          bundle,
        };
      });

      return withFallback(attempts, "Address lookup failed.");
    },

    async fetchTransactionDetails(txid) {
      const attempts = ADDRESS_API_PROVIDERS.map((provider) => async () => {
        const transaction = await fetchJson(`${provider.baseUrl}/tx/${encodeURIComponent(txid)}`, {
          providerName: provider.name,
        });
        return {
          provider: provider.name,
          transaction,
        };
      });

      return withFallback(attempts, "Transaction details unavailable.");
    },

    async fetchCurrentPriceUsd() {
      return fetchCurrentPriceQuote();
    },

    async fetchFiatExchangeRates() {
      return fetchFiatExchangeRates();
    },

    async fetchMarketData(startTimestamp, endTimestamp, displayFiatCurrency = "USD") {
      let currentPrice = null;
      let currentPriceError = null;
      let fiatExchangeRates = createDefaultFiatExchangeRates();
      const [currentPriceResult, fiatExchangeRatesResult, displayFiatMarketResult] =
        await Promise.allSettled([
        fetchCurrentPriceQuote(),
        fetchFiatExchangeRates(),
        fetchDirectFiatMarketData(displayFiatCurrency, startTimestamp, endTimestamp),
      ]);
      if (currentPriceResult.status === "fulfilled") {
        currentPrice = currentPriceResult.value;
      } else {
        currentPriceError = currentPriceResult.reason;
      }
      if (fiatExchangeRatesResult.status === "fulfilled") {
        fiatExchangeRates = fiatExchangeRatesResult.value;
      }
      const displayFiatMarket =
        displayFiatMarketResult.status === "fulfilled" ? displayFiatMarketResult.value : null;

      let priceHistory = new Map();
      let historyAvailable = true;
      let historyMissingDays = 0;
      try {
        const historyResult = await fetchHistoricalPriceSeries(startTimestamp, endTimestamp);
        priceHistory = historyResult.series;
        historyMissingDays = historyResult.missingDays;
        historyAvailable = priceHistory.size > 0;
      } catch (error) {
        historyAvailable = false;
      }

      if ((!currentPrice || !Number.isFinite(currentPrice.price)) && priceHistory.size) {
        currentPrice = {
          provider: "Historical close fallback",
          price: getLastFinitePriceFromHistory(priceHistory),
        };
      }

      if (!currentPrice || !Number.isFinite(currentPrice.price)) {
        throw new Error(
          currentPriceError?.message || "Current BTC/USD price and historical fallback both failed."
        );
      }

      const intradayStart = startOfUtcHour(Date.now() - 23 * HOUR_MS);
      const intradayEnd = Date.now();
      let intradayPriceHistory = new Map();
      try {
        intradayPriceHistory = await fetchIntradayPriceSeries(
          intradayStart,
          intradayEnd,
          currentPrice.price
        );
      } catch (error) {
        intradayPriceHistory = new Map();
      }

      return {
        currentPriceUsd: currentPrice.price,
        fiatExchangeRates,
        displayFiatMarket,
        priceHistory,
        intradayPriceHistory,
        intradayStart,
        intradayEnd,
        historyAvailable,
        historyMissingDays,
        provider: currentPrice.provider,
      };
    },
  };

  // Privacy note: market-data requests do not reveal watched addresses, but the
  // timing pattern of price fetches alongside address fetches could fingerprint
  // a Bitkit Watch session to the price-data provider.
  function fetchCurrentPriceQuote() {
    return fetchCurrentProductQuote("BTC-USD");
  }

  function fetchCurrentProductQuote(productId) {
    const quoteCurrency = getProductQuoteCurrency(productId);
    return withFallback(
      [
        async () => {
          const response = await fetchJson(
            `https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}/ticker`,
            { providerName: "Coinbase Exchange" }
          );
          return { provider: "Coinbase Exchange", price: Number(response.price) };
        },
        async () => {
          const response = await fetchJson(
            `https://api.coinbase.com/v2/prices/${encodeURIComponent(productId)}/spot`,
            {
              providerName: "Coinbase Spot",
            }
          );
          return { provider: "Coinbase Spot", price: Number(response.data.amount) };
        },
        async () => {
          const response = await fetchJson(
            "https://api.coinbase.com/v2/exchange-rates?currency=BTC",
            { providerName: "Coinbase Rates" }
          );
          return { provider: "Coinbase Rates", price: Number(response.data.rates[quoteCurrency]) };
        },
      ],
      `Current ${productId} price unavailable.`
    );
  }

  async function fetchFiatExchangeRates() {
    const response = await fetchJson("https://api.coinbase.com/v2/exchange-rates?currency=BTC", {
      providerName: "Coinbase Rates",
    });
    const btcRates = response?.data?.rates || {};
    const usdPerBtc = Number(btcRates.USD);
    if (!Number.isFinite(usdPerBtc) || usdPerBtc <= 0) {
      throw new Error("Current fiat exchange rates unavailable.");
    }

    const nextRates = createDefaultFiatExchangeRates();
    SUPPORTED_FIAT_CURRENCIES.forEach((currency) => {
      if (currency === "USD") {
        return;
      }

      const quote = Number(btcRates[currency]);
      if (Number.isFinite(quote) && quote > 0) {
        nextRates.set(currency, quote / usdPerBtc);
      }
    });

    return nextRates;
  }

  // Privacy note: sends a watched address to a third-party block explorer API.
  // The provider can correlate the address with the requester's IP. Batch calls
  // (via Promise.allSettled in refreshVault) expose multiple addresses in a short
  // window, which strengthens the correlation. Users concerned about this should
  // use Tor or a VPN (see FAQ).
  async function fetchAddressSummaryFromProvider(provider, address) {
    const encoded = encodeURIComponent(address);
    return fetchJson(`${provider.baseUrl}/address/${encoded}`, {
      providerName: provider.name,
    });
  }

  // Privacy: fetches full transaction history for an address. Same IP-correlation
  // risk as fetchAddressSummaryFromProvider above.
  async function fetchAddressBundleFromProvider(provider, address, startTimestamp) {
    const encoded = encodeURIComponent(address);
    const summary = await fetchJson(`${provider.baseUrl}/address/${encoded}`, {
      providerName: provider.name,
    });
    const txResult = await fetchAddressTransactions(provider, address, startTimestamp);

    return {
      summary,
      transactions: txResult.transactions,
      truncated: txResult.truncated,
    };
  }

  async function fetchAddressTransactions(provider, address, startTimestamp) {
    const encoded = encodeURIComponent(address);
    const firstPage = await fetchJson(`${provider.baseUrl}/address/${encoded}/txs`, {
      providerName: provider.name,
    });
    const collected = [];
    const seen = new Set();

    const appendTransactions = (transactions) => {
      transactions.forEach((tx) => {
        if (!seen.has(tx.txid)) {
          seen.add(tx.txid);
          collected.push(tx);
        }
      });
    };

    appendTransactions(firstPage);

    const confirmedOnly = firstPage.filter((tx) => tx.status?.confirmed);
    let lastSeen = confirmedOnly.at(-1)?.txid || null;
    let oldestConfirmedTime = confirmedOnly.at(-1)?.status?.block_time || Number.MAX_SAFE_INTEGER;
    let pageCount = 0;
    const maxPages = 18;

    while (lastSeen && oldestConfirmedTime > startTimestamp / 1000 && pageCount < maxPages) {
      const nextPage = await fetchJson(`${provider.baseUrl}/address/${encoded}/txs/chain/${lastSeen}`, {
        providerName: provider.name,
      });
      if (!nextPage.length) {
        break;
      }

      appendTransactions(nextPage);
      lastSeen = nextPage.at(-1)?.txid || null;
      oldestConfirmedTime = nextPage.at(-1)?.status?.block_time || 0;
      pageCount += 1;
    }

    return {
      transactions: collected.filter((tx) => {
        if (!tx.status?.confirmed) {
          return true;
        }
        return (tx.status.block_time || 0) * 1000 >= startTimestamp;
      }),
      truncated: Boolean(lastSeen && oldestConfirmedTime > startTimestamp / 1000),
    };
  }

  async function fetchHistoricalPriceSeries(startTimestamp, endTimestamp) {
    return fetchProductHistoricalPriceSeries("BTC-USD", startTimestamp, endTimestamp);
  }

  async function fetchProductHistoricalPriceSeries(productId, startTimestamp, endTimestamp) {
    const requests = buildCandleRequests(startTimestamp, endTimestamp, 295);
    const candleResponses = await Promise.allSettled(
      requests.map((request) =>
        fetchJson(
          `https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}/candles?granularity=86400&start=${encodeURIComponent(
            new Date(request.start).toISOString()
          )}&end=${encodeURIComponent(new Date(request.end).toISOString())}`
        )
      )
    );

    const closeByDay = new Map();
    candleResponses.forEach((response) => {
      if (response.status !== "fulfilled") {
        return;
      }

      response.value.forEach((candle) => {
        const timestamp = candle[0] * 1000;
        const dateKey = toDateKey(timestamp);
        closeByDay.set(dateKey, Number(candle[4]));
      });
    });

    if (!closeByDay.size) {
      return {
        series: closeByDay,
        missingDays: ONE_YEAR_DAYS,
      };
    }

    let lastKnown = null;
    const pendingSpotDates = [];
    for (let cursor = startOfUtcDay(startTimestamp); cursor <= endTimestamp; cursor += DAY_MS) {
      const key = toDateKey(cursor);
      if (closeByDay.has(key)) {
        lastKnown = closeByDay.get(key);
      } else if (lastKnown !== null) {
        closeByDay.set(key, lastKnown);
      } else {
        pendingSpotDates.push(key);
      }
    }

    if (pendingSpotDates.length && pendingSpotDates.length <= 45) {
      for (const dateKey of pendingSpotDates) {
        try {
          const response = await fetchJson(
            `https://api.coinbase.com/v2/prices/${encodeURIComponent(productId)}/spot?date=${encodeURIComponent(dateKey)}`
          );
          closeByDay.set(dateKey, Number(response.data.amount));
        } catch (error) {
          // Leave the gap empty. Rendering layers handle missing price points.
        }
      }
    }

    const firstKnown = getFirstFinitePriceFromHistory(closeByDay);
    let missingDays = 0;
    for (let cursor = startOfUtcDay(startTimestamp); cursor <= endTimestamp; cursor += DAY_MS) {
      const key = toDateKey(cursor);
      if (!closeByDay.has(key) && Number.isFinite(firstKnown)) {
        closeByDay.set(key, firstKnown);
      }
      if (!closeByDay.has(key)) {
        missingDays += 1;
      }
    }

    return {
      series: closeByDay,
      missingDays,
    };
  }

  async function fetchIntradayPriceSeries(startTimestamp, endTimestamp, fallbackPrice) {
    return fetchProductIntradayPriceSeries("BTC-USD", startTimestamp, endTimestamp, fallbackPrice);
  }

  async function fetchProductIntradayPriceSeries(productId, startTimestamp, endTimestamp, fallbackPrice) {
    const response = await fetchJson(
      `https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}/candles?granularity=3600&start=${encodeURIComponent(
        new Date(startTimestamp).toISOString()
      )}&end=${encodeURIComponent(new Date(endTimestamp).toISOString())}`
    );

    const closeByHour = new Map();
    response.forEach((candle) => {
      closeByHour.set(toHourKey(candle[0] * 1000), Number(candle[4]));
    });

    let lastKnown = null;
    for (let cursor = startOfUtcHour(startTimestamp); cursor <= endTimestamp; cursor += HOUR_MS) {
      const key = toHourKey(cursor);
      if (closeByHour.has(key)) {
        lastKnown = closeByHour.get(key);
      } else if (lastKnown !== null) {
        closeByHour.set(key, lastKnown);
      } else if (Number.isFinite(fallbackPrice)) {
        closeByHour.set(key, fallbackPrice);
      }
    }

    return closeByHour;
  }

  async function fetchDirectFiatMarketData(
    fiatCurrency,
    startTimestamp,
    endTimestamp,
    {
      intradayStart = startOfUtcHour(Date.now() - 23 * HOUR_MS),
      intradayEnd = Date.now(),
    } = {}
  ) {
    const normalizedFiat = normalizeFiatCurrency(fiatCurrency);
    const productId = getDirectFiatProductId(normalizedFiat);
    if (!productId) {
      return null;
    }

    let currentPrice = null;
    let currentPriceError = null;
    try {
      currentPrice = await fetchCurrentProductQuote(productId);
    } catch (error) {
      currentPriceError = error;
    }

    let priceHistory = new Map();
    try {
      const historyResult = await fetchProductHistoricalPriceSeries(productId, startTimestamp, endTimestamp);
      priceHistory = historyResult.series;
    } catch (error) {
      priceHistory = new Map();
    }

    if ((!currentPrice || !Number.isFinite(currentPrice.price)) && priceHistory.size) {
      currentPrice = {
        provider: "Historical close fallback",
        price: getLastFinitePriceFromHistory(priceHistory),
      };
    }

    if (!currentPrice || !Number.isFinite(currentPrice.price)) {
      throw new Error(currentPriceError?.message || `Current ${productId} price unavailable.`);
    }

    let intradayPriceHistory = new Map();
    try {
      intradayPriceHistory = await fetchProductIntradayPriceSeries(
        productId,
        intradayStart,
        intradayEnd,
        currentPrice.price
      );
    } catch (error) {
      intradayPriceHistory = new Map();
    }

    return {
      currency: normalizedFiat,
      productId,
      currentPrice: currentPrice.price,
      priceHistory,
      intradayPriceHistory,
      intradayStart,
      intradayEnd,
      provider: currentPrice.provider,
    };
  }

  function buildCandleRequests(startTimestamp, endTimestamp, maxDaysPerRequest) {
    const requests = [];
    let cursor = startOfUtcDay(startTimestamp);
    while (cursor < endTimestamp) {
      const chunkEnd = Math.min(cursor + (maxDaysPerRequest - 1) * DAY_MS, endTimestamp);
      requests.push({ start: cursor, end: chunkEnd });
      cursor = chunkEnd + DAY_MS;
    }
    return requests;
  }

  function getHistoryStartTimestampFromAddressResults(addressResults) {
    const timestamps = addressResults.flatMap((result) => {
      if (result.status !== "fulfilled" || !Array.isArray(result.value?.bundle?.transactions)) {
        return [];
      }

      return result.value.bundle.transactions
        .map((tx) => Number(tx?.status?.block_time || 0) * 1000)
        .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
    });

    if (!timestamps.length) {
      return null;
    }

    return startOfUtcDay(Math.min(...timestamps));
  }

  async function fetchJson(url, { providerName = "" } = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        mode: "cors",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw createApiError(`${response.status} ${response.statusText}`.trim(), {
          status: response.status,
          providerName,
          url,
        });
      }
      return await response.json();
    } catch (error) {
      throw annotateApiError(error, { providerName, url });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function withFallback(attempts, finalMessage) {
    const errors = [];
    for (const attempt of attempts) {
      try {
        const result = await attempt();
        if (!errors.length) {
          return result;
        }

        if (result && typeof result === "object" && !Array.isArray(result)) {
          return {
            ...result,
            warnings: errors.map(toApiWarning),
          };
        }

        return result;
      } catch (error) {
        errors.push(annotateApiError(error));
      }
    }

    const finalError = new Error(buildApiFailureMessage(finalMessage, errors));
    finalError.isRateLimit = errors.some((error) => Boolean(error?.isRateLimit));
    finalError.rateLimitWarnings = errors.filter((error) => error?.isRateLimit).map(toApiWarning);
    throw finalError;
  }

  function createApiError(message, { status = null, providerName = "", url = "" } = {}) {
    const error = new Error(message || "Unknown error");
    error.status = Number.isFinite(status) ? status : null;
    error.providerName = providerName || "";
    error.url = url || "";
    error.isRateLimit = Number(status) === 429;
    return error;
  }

  function annotateApiError(error, { providerName = "", url = "" } = {}) {
    if (error instanceof Error) {
      if (providerName && !error.providerName) {
        error.providerName = providerName;
      }
      if (url && !error.url) {
        error.url = url;
      }
      if (!("status" in error)) {
        error.status = null;
      }
      error.isRateLimit = Boolean(error.isRateLimit || Number(error.status) === 429);
      return error;
    }

    return createApiError(typeof error === "string" ? error : "Unknown error", {
      providerName,
      url,
    });
  }

  function toApiWarning(error) {
    const annotated = annotateApiError(error);
    return {
      provider: getProviderDisplayName(annotated.providerName),
      status: Number.isFinite(annotated.status) ? Number(annotated.status) : null,
      isRateLimit: Boolean(annotated.isRateLimit),
      message: annotated.message || "Unknown error",
    };
  }

  function buildApiFailureMessage(finalMessage, errors) {
    const normalizedWarnings = errors.map(toApiWarning);
    if (normalizedWarnings.length && normalizedWarnings.every((warning) => warning.isRateLimit)) {
      return `${finalMessage} Public APIs are rate limiting requests right now.`.trim();
    }

    const detail = normalizedWarnings
      .map((warning) => formatApiWarningMessage(warning))
      .filter(Boolean)
      .join(" · ");
    return `${finalMessage} ${detail}`.trim();
  }

  function formatApiWarningMessage(warning) {
    if (!warning) {
      return "";
    }

    const normalizedMessage =
      warning.message && Number.isFinite(warning.status) && warning.message.startsWith(String(warning.status))
        ? warning.message.slice(String(warning.status).length).trim()
        : warning.message;

    const parts = [];
    if (warning.provider) {
      parts.push(warning.provider);
    }
    if (Number.isFinite(warning.status)) {
      parts.push(String(warning.status));
    }
    if (normalizedMessage) {
      parts.push(normalizedMessage);
    }
    return parts.join(" ");
  }

  function getProviderDisplayName(providerName) {
    if (providerName === "Mempool") {
      return "mempool.space";
    }
    return providerName || "";
  }

  async function copyPlainTextToClipboard(value) {
    const text = typeof value === "string" ? value : "";
    if (!text) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      if (!document.execCommand("copy")) {
        throw new Error("Copy failed");
      }
    } finally {
      document.body.removeChild(textarea);
    }
  }

  function collectRateLimitWarningsFromSettledResults(results) {
    const warnings = [];
    results.forEach((result) => {
      if (result?.status === "fulfilled" && Array.isArray(result.value?.warnings)) {
        warnings.push(...result.value.warnings.filter((warning) => warning?.isRateLimit));
        return;
      }

      if (result?.status === "rejected") {
        if (Array.isArray(result.reason?.rateLimitWarnings)) {
          warnings.push(...result.reason.rateLimitWarnings.filter((warning) => warning?.isRateLimit));
        } else if (result.reason?.isRateLimit) {
          warnings.push(toApiWarning(result.reason));
        }
      }
    });
    return dedupeRateLimitWarnings(warnings);
  }

  function dedupeRateLimitWarnings(warnings) {
    const byKey = new Map();
    warnings.forEach((warning) => {
      if (!warning?.isRateLimit) {
        return;
      }
      const key = `${warning.provider || ""}:${warning.status || ""}:${warning.message || ""}`;
      if (!byKey.has(key)) {
        byKey.set(key, warning);
      }
    });
    return [...byKey.values()];
  }

  function formatRateLimitWarning(warnings, context = "refresh") {
    const providers = uniqueStrings(
      warnings.map((warning) => warning?.provider).filter((provider) => typeof provider === "string" && provider)
    );
    const suffix = context === "refresh" ? "Using fallback data where possible." : "Using fallback data where available.";
    if (!providers.length) {
      return `A public API rate limited this ${context}. ${suffix}`.trim();
    }
    if (providers.length === 1) {
      return `${providers[0]} rate limited this ${context}. ${suffix}`.trim();
    }
    if (providers.length === 2) {
      return `${providers[0]} and ${providers[1]} rate limited this ${context}. ${suffix}`.trim();
    }
    return `Public APIs rate limited this ${context}. ${suffix}`.trim();
  }

  // ---------------------------------------------------------------------------
  // Portfolio, activity, and chart math
  // ---------------------------------------------------------------------------

  const PortfolioLayer = {
    buildAddressSnapshot({
      entry,
      bundle,
      provider,
      currentPriceUsd,
      priceHistory,
      startTimestamp,
      endTimestamp,
      detailScope = "1Y",
    }) {
      const balanceSats =
        Number(bundle.summary.chain_stats?.funded_txo_sum || 0) -
        Number(bundle.summary.chain_stats?.spent_txo_sum || 0) +
        Number(bundle.summary.mempool_stats?.funded_txo_sum || 0) -
        Number(bundle.summary.mempool_stats?.spent_txo_sum || 0);

      const txEvents = bundle.transactions
        .map((tx) => normalizeTransactionEvent(tx, entry.address))
        .filter((event) => event && (event.netSats !== 0 || event.sentSats !== 0 || event.receivedSats !== 0));

      const balanceTimeline = buildDailyBalanceTimeline(
        balanceSats,
        txEvents,
        startTimestamp,
        endTimestamp
      );

      const hourlyBalanceTimeline = buildIntervalBalanceTimeline(
        balanceSats,
        txEvents,
        endTimestamp - 23 * HOUR_MS,
        endTimestamp,
        HOUR_MS,
        startOfUtcHour,
        toHourKey
      );

      return {
        entry,
        provider,
        balanceSats,
        usdValue: (balanceSats / 1e8) * currentPriceUsd,
        txEvents,
        balanceTimeline,
        hourlyBalanceTimeline,
        approximate: bundle.truncated,
        detailScope,
      };
    },

    buildSummarySnapshot({
      entry,
      provider,
      balanceSats,
      currentPriceUsd,
    }) {
      return {
        entry,
        provider,
        balanceSats: Number(balanceSats || 0),
        usdValue: (Number(balanceSats || 0) / 1e8) * currentPriceUsd,
        txEvents: [],
        balanceTimeline: [],
        hourlyBalanceTimeline: [],
        approximate: false,
        detailScope: "SUMMARY",
      };
    },

    combineTimelines(snapshots, priceHistory, startTimestamp, endTimestamp) {
      const totalsByDay = new Map();

      snapshots.forEach((snapshot) => {
        snapshot.balanceTimeline.forEach((point) => {
          totalsByDay.set(point.dateKey, (totalsByDay.get(point.dateKey) || 0) + point.balanceSats);
        });
      });

      const timeline = [];
      for (let cursor = startOfUtcDay(startTimestamp); cursor <= endTimestamp; cursor += DAY_MS) {
        const dateKey = toDateKey(cursor);
        const balanceSats = totalsByDay.get(dateKey) || 0;
        const btcHoldings = balanceSats / 1e8;
        const usdPrice = priceHistory.get(dateKey);
        timeline.push({
          dateKey,
          timestamp: cursor,
          balanceSats,
          btcHoldings,
          usdPrice,
          usdValue: Number.isFinite(usdPrice) ? btcHoldings * usdPrice : null,
        });
      }

      return timeline;
    },

    calculateTotals(snapshots) {
      const balanceSats = snapshots.reduce((sum, snapshot) => sum + snapshot.balanceSats, 0);
      const usdValue = snapshots.reduce((sum, snapshot) => sum + snapshot.usdValue, 0);
      return { balanceSats, usdValue };
    },
  };

  const ActivityLayer = {
    buildCombinedActivity(snapshots, priceHistory, currentPriceUsd) {
      const byTx = new Map();

      snapshots.forEach((snapshot) => {
        const label = shortAddress(snapshot.entry.address);

        snapshot.txEvents.forEach((event) => {
          if (!byTx.has(event.txid)) {
            byTx.set(event.txid, {
              txid: event.txid,
              timestamp: event.timestamp,
              confirmed: event.confirmed,
              netSats: 0,
              feeSats: Number.isFinite(event.feeSats) ? event.feeSats : null,
              feeRateSatVb: Number.isFinite(event.feeRateSatVb) ? event.feeRateSatVb : null,
              relatedAddresses: new Set(),
              inputAddresses: new Set(),
              outputAddresses: new Set(),
              walletInputAddresses: new Set(),
              walletOutputAddresses: new Set(),
            });
          }

          const row = byTx.get(event.txid);
          row.timestamp = Math.max(row.timestamp, event.timestamp);
          row.netSats += event.netSats;
          if (!Number.isFinite(row.feeSats) && Number.isFinite(event.feeSats)) {
            row.feeSats = event.feeSats;
          }
          if (!Number.isFinite(row.feeRateSatVb) && Number.isFinite(event.feeRateSatVb)) {
            row.feeRateSatVb = event.feeRateSatVb;
          }
          row.relatedAddresses.add(label);
          event.inputAddresses.forEach((address) => row.inputAddresses.add(address));
          event.outputAddresses.forEach((address) => row.outputAddresses.add(address));
          event.walletInputAddresses.forEach((address) => row.walletInputAddresses.add(address));
          event.walletOutputAddresses.forEach((address) => row.walletOutputAddresses.add(address));
        });
      });

      return [...byTx.values()]
        .map((row) => {
          const price = priceHistory.get(toDateKey(row.timestamp)) || currentPriceUsd;
          return {
            txid: row.txid,
            timestamp: row.timestamp,
            confirmed: row.confirmed,
            netSats: row.netSats,
            feeSats: Number.isFinite(row.feeSats) ? row.feeSats : null,
            feeRateSatVb: Number.isFinite(row.feeRateSatVb) ? row.feeRateSatVb : null,
            direction: row.netSats > 0 ? "Received" : row.netSats < 0 ? "Sent" : "Internal",
            usdValue: Number.isFinite(price) ? Math.abs(row.netSats / 1e8) * price : null,
            relatedAddresses: [...row.relatedAddresses],
            inputAddresses: [...row.inputAddresses],
            outputAddresses: [...row.outputAddresses],
            walletInputAddresses: [...row.walletInputAddresses],
            walletOutputAddresses: [...row.walletOutputAddresses],
          };
        })
        .sort((left, right) => right.timestamp - left.timestamp);
    },
  };

  function extractTransactionAddresses(tx) {
    const inputAddresses = [];
    const outputAddresses = [];

    (tx.vout || []).forEach((output) => {
      if (looksLikeBitcoinAddress(output.scriptpubkey_address)) {
        outputAddresses.push(output.scriptpubkey_address);
      }
    });

    (tx.vin || []).forEach((input) => {
      if (looksLikeBitcoinAddress(input.prevout?.scriptpubkey_address)) {
        inputAddresses.push(input.prevout.scriptpubkey_address);
      }
    });

    return {
      inputAddresses: uniqueStrings(inputAddresses),
      outputAddresses: uniqueStrings(outputAddresses),
    };
  }

  function extractTransactionFeeRate(tx) {
    const fee = Number(tx?.fee);
    if (!Number.isFinite(fee) || fee < 0) {
      return null;
    }

    const vsize = Number(tx?.vsize);
    if (Number.isFinite(vsize) && vsize > 0) {
      return fee / vsize;
    }

    const weight = Number(tx?.weight);
    if (Number.isFinite(weight) && weight > 0) {
      return fee / (weight / 4);
    }

    return null;
  }

  function normalizeTransactionEvent(tx, watchedAddress) {
    let receivedSats = 0;
    let sentSats = 0;
    const { inputAddresses, outputAddresses } = extractTransactionAddresses(tx);
    const feeSats = Number.isFinite(tx?.fee) ? Number(tx.fee) : null;
    const feeRateSatVb = extractTransactionFeeRate(tx);

    (tx.vout || []).forEach((output) => {
      if (output.scriptpubkey_address === watchedAddress) {
        receivedSats += Number(output.value || 0);
      }
    });

    (tx.vin || []).forEach((input) => {
      if (input.prevout?.scriptpubkey_address === watchedAddress) {
        sentSats += Number(input.prevout.value || 0);
      }
    });

    const netSats = receivedSats - sentSats;
    const timestamp = tx.status?.block_time ? tx.status.block_time * 1000 : Date.now();

    return {
      txid: tx.txid,
      timestamp,
      confirmed: Boolean(tx.status?.confirmed),
      receivedSats,
      sentSats,
      netSats,
      feeSats,
      feeRateSatVb,
      inputAddresses,
      outputAddresses,
      walletInputAddresses: uniqueStrings(inputAddresses.filter((address) => address === watchedAddress)),
      walletOutputAddresses: uniqueStrings(outputAddresses.filter((address) => address === watchedAddress)),
    };
  }

  function buildDailyBalanceTimeline(currentBalanceSats, txEvents, startTimestamp, endTimestamp) {
    return buildIntervalBalanceTimeline(
      currentBalanceSats,
      txEvents,
      startTimestamp,
      endTimestamp,
      DAY_MS,
      startOfUtcDay,
      toDateKey
    );
  }

  function buildIntervalBalanceTimeline(
    currentBalanceSats,
    txEvents,
    startTimestamp,
    endTimestamp,
    stepMs,
    alignTime,
    keyForTimestamp
  ) {
    const sortedDescending = [...txEvents].sort((a, b) => b.timestamp - a.timestamp);
    const points = [];
    let balance = currentBalanceSats;
    let txIndex = 0;

    for (let cursor = alignTime(endTimestamp); cursor >= alignTime(startTimestamp); cursor -= stepMs) {
      const intervalEnd = cursor + stepMs - 1;
      while (txIndex < sortedDescending.length && sortedDescending[txIndex].timestamp > intervalEnd) {
        balance -= sortedDescending[txIndex].netSats;
        txIndex += 1;
      }

      points.push({
        dateKey: keyForTimestamp(cursor),
        timestamp: cursor,
        balanceSats: balance,
      });
    }

    return points.reverse();
  }

  function combineSnapshotTimelines(
    snapshots,
    timelineKey,
    priceHistory,
    startTimestamp,
    endTimestamp,
    {
      stepMs = DAY_MS,
      alignTime = startOfUtcDay,
      keyForTimestamp = toDateKey,
    } = {}
  ) {
    const totalsByKey = new Map();

    snapshots.forEach((snapshot) => {
      const timeline = snapshot[timelineKey] || [];
      timeline.forEach((point) => {
        totalsByKey.set(point.dateKey, (totalsByKey.get(point.dateKey) || 0) + point.balanceSats);
      });
    });

    const timeline = [];
    for (let cursor = alignTime(startTimestamp); cursor <= endTimestamp; cursor += stepMs) {
      const key = keyForTimestamp(cursor);
      const balanceSats = totalsByKey.get(key) || 0;
      const btcHoldings = balanceSats / 1e8;
      const usdPrice = priceHistory.get(key);
      timeline.push({
        dateKey: key,
        timestamp: cursor,
        balanceSats,
        btcHoldings,
        usdPrice,
        usdValue: Number.isFinite(usdPrice) ? btcHoldings * usdPrice : null,
      });
    }

    return timeline;
  }

  function buildFlatTimeline(balanceSats, currentPriceUsd, pointCount = HISTORY_DAYS, stepMs = DAY_MS, alignTime = startOfUtcDay) {
    const timeline = [];
    const start = alignTime(Date.now() - (pointCount - 1) * stepMs);
    const usdValue = Number.isFinite(currentPriceUsd) ? (balanceSats / 1e8) * currentPriceUsd : null;
    const keyForTimestamp = stepMs === HOUR_MS ? toHourKey : toDateKey;
    for (let cursor = start; cursor <= Date.now(); cursor += stepMs) {
      timeline.push({
        timestamp: cursor,
        dateKey: keyForTimestamp(cursor),
        balanceSats,
        btcHoldings: balanceSats / 1e8,
        usdValue,
      });
    }
    return timeline;
  }

  function getWalletCardMiniChartScene({ walletId, addressCount, snapshots, balanceSats }) {
    if (!addressCount || !snapshots.length) {
      return null;
    }

    if (
      !(runtime.intradayPriceHistory instanceof Map) ||
      !runtime.intradayPriceHistory.size ||
      !Number.isFinite(runtime.intradayStart) ||
      !Number.isFinite(runtime.intradayEnd)
    ) {
      return null;
    }

    const intradaySnapshots = snapshots.filter(
      (snapshot) => Array.isArray(snapshot.hourlyBalanceTimeline) && snapshot.hourlyBalanceTimeline.length
    );

    let timeline = [];
    if (intradaySnapshots.length === addressCount) {
      timeline = combineSnapshotTimelines(
        intradaySnapshots,
        "hourlyBalanceTimeline",
        runtime.intradayPriceHistory,
        runtime.intradayStart,
        runtime.intradayEnd,
        {
          stepMs: HOUR_MS,
          alignTime: startOfUtcHour,
          keyForTimestamp: toHourKey,
        }
      );
    }

    if (!timeline.length) {
      return null;
    }

    const points = timeline.slice(-24);
    if (points.length < 2) {
      return null;
    }
    const values = points.map((point) =>
      getDisplayUnit() === "USD"
        ? getPointDisplayFiatValue(point, {
            preferIntraday: true,
          })
        : point.btcHoldings
    );
    return createWalletCardMiniChartScene({
      key: `${walletId}-wallet-card-chart-1d-${getDisplayChartUnitKey()}`,
      values,
      width: 464,
      height: 152,
    });
  }

  function createWalletCardMiniChartScene({ key, values, width = 464, height = 152 }) {
    const normalizedValues = fillSeriesGaps(values);
    if (!normalizedValues.length) {
      return null;
    }

    const tone = getSparklineTone(normalizedValues);
    const palette = getSparklinePalette(tone);
    const leftInset = 0;
    const rightInset = 0;
    const topInset = 6;
    const plotBottom = height - 1;
    const plotWidth = Math.max(1, width - leftInset - rightInset);
    const plotHeight = Math.max(1, plotBottom - topInset);
    const min = Math.min(...normalizedValues);
    const max = Math.max(...normalizedValues);
    const range = max - min;
    const paddedMin = range === 0 ? min : min - range * 0.08;
    const paddedMax = range === 0 ? max : max + range * 0.12;
    const paddedRange = paddedMax - paddedMin;
    const points = normalizedValues.map((value, index) => {
      const x =
        normalizedValues.length === 1
          ? leftInset + plotWidth / 2
          : leftInset + (index / (normalizedValues.length - 1)) * plotWidth;
      const y =
        paddedRange === 0
          ? topInset + plotHeight * 0.72
          : plotBottom - ((value - paddedMin) / paddedRange) * plotHeight;
      return { x, y };
    });

    const safeKey = escapeHtml(String(key || "wallet-card-chart").replace(/[^a-z0-9-]/gi, "-"));
    const linePath = buildSmoothPath(points);
    const areaPath = `${linePath} L ${points.at(-1).x} ${plotBottom} L ${points[0].x} ${plotBottom} Z`;

    return {
      tone,
      markup: `
        <svg class="wallet-card-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="presentation">
          <defs>
            <linearGradient id="wallet-card-line-${safeKey}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="${palette.lineStart}"></stop>
              <stop offset="100%" stop-color="${palette.lineEnd}"></stop>
            </linearGradient>
            <linearGradient id="wallet-card-fill-${safeKey}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="${palette.fillStart}"></stop>
              <stop offset="100%" stop-color="${palette.fillEnd}"></stop>
            </linearGradient>
          </defs>
          <path d="${areaPath}" fill="url(#wallet-card-fill-${safeKey})"></path>
          <path
            d="${linePath}"
            fill="none"
            stroke="url(#wallet-card-line-${safeKey})"
            stroke-width="2.25"
            stroke-linecap="round"
            stroke-linejoin="round"
          ></path>
        </svg>
      `,
    };
  }

  function createSparklineScene(chartDisplay, { width = 352, height = 96 } = {}) {
    const values = Array.isArray(chartDisplay?.values) ? chartDisplay.values : [];
    const key = typeof chartDisplay?.key === "string" ? chartDisplay.key : "sparkline";
    const timestamps = Array.isArray(chartDisplay?.timestamps) ? chartDisplay.timestamps : [];
    const rangeLabel =
      typeof chartDisplay?.range === "string" ? chartDisplay.range : normalizeChartRange(state.selectedRange);
    const normalizedValues = fillSeriesGaps(values);
    if (!normalizedValues.length) {
      return null;
    }

    const tone = getSparklineTone(normalizedValues);
    const palette = getSparklinePalette(tone);

    const leftInset = 0;
    const rightInset = 0;
    const topInset = 8;
    const bottomInset = 36;
    const plotWidth = Math.max(1, width - leftInset - rightInset);
    const plotBottom = height - bottomInset;
    const plotHeight = Math.max(1, plotBottom - topInset);
    const min = Math.min(...normalizedValues);
    const max = Math.max(...normalizedValues);
    const range = max - min;
    const points = normalizedValues.map((value, index) => {
      const x =
        normalizedValues.length === 1
          ? leftInset + plotWidth / 2
          : leftInset + (index / (normalizedValues.length - 1)) * plotWidth;
      const y =
        range === 0
          ? topInset + plotHeight * 0.58
          : plotBottom - ((value - min) / range) * plotHeight;
      return { x, y };
    });

    const safeKey = escapeHtml(key.replace(/[^a-z0-9-]/gi, "-"));
    const linePath = buildSmoothPath(points);
    const areaPath = `${linePath} L ${points.at(-1).x} ${plotBottom} L ${points[0].x} ${plotBottom} Z`;
    const yAxisLabels = buildSparklineYAxisLabels(min, max, topInset, plotBottom, range);
    const xAxisLabels = buildSparklineXAxisLabels(timestamps, rangeLabel, leftInset, plotWidth, height);

    return {
      width,
      height,
      leftInset,
      rightInset,
      topInset,
      plotBottom,
      plotWidth,
      rangeLabel,
      points,
      values: normalizedValues,
      timestamps,
      tone,
      markup: `
      <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="presentation">
        <defs>
          <linearGradient id="line-${safeKey}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${palette.lineStart}"></stop>
            <stop offset="100%" stop-color="${palette.lineEnd}"></stop>
          </linearGradient>
          <linearGradient id="fill-${safeKey}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${palette.fillStart}"></stop>
            <stop offset="100%" stop-color="${palette.fillEnd}"></stop>
          </linearGradient>
        </defs>
        <line class="sparkline-axis-line" x1="${leftInset}" y1="${plotBottom}" x2="${width - rightInset}" y2="${plotBottom}"></line>
        ${yAxisLabels
          .map(
            (label) => `
              <line class="sparkline-guide-line" x1="${leftInset}" y1="${label.y}" x2="${width - rightInset}" y2="${label.y}"></line>
              <text class="sparkline-axis-label sparkline-axis-label--y" x="${leftInset}" y="${label.y}" dominant-baseline="middle">${escapeHtml(
                label.text
              )}</text>
            `
          )
          .join("")}
        <path d="${areaPath}" fill="url(#fill-${safeKey})"></path>
        <path
          d="${linePath}"
          fill="none"
          stroke="url(#line-${safeKey})"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        ></path>
        ${xAxisLabels
          .map(
            (label) => `
              <text class="sparkline-axis-label sparkline-axis-label--x" x="${label.x}" y="${height - 4}" text-anchor="${label.anchor}">${escapeHtml(
                label.text
              )}</text>
            `
          )
          .join("")}
      </svg>
      <div class="sparkline-interaction" data-role="sparkline-interaction" hidden>
        <div class="sparkline-hover-line" data-role="sparkline-hover-line"></div>
        <div class="sparkline-hover-dot" data-role="sparkline-hover-dot"></div>
        <div class="sparkline-tooltip" data-role="sparkline-tooltip">
          <span class="sparkline-tooltip-value" data-role="sparkline-tooltip-value"></span>
          <span class="sparkline-tooltip-time" data-role="sparkline-tooltip-time"></span>
        </div>
      </div>
    `,
    };
  }

  function bindSparklineInteraction(container, scene) {
    container.onpointerenter = null;
    container.onpointermove = null;
    container.onpointerleave = null;
    container.onpointerdown = null;
    container.onblur = null;
    container._sparklineScene = scene || null;

    if (!scene) {
      return;
    }

    const interaction = container.querySelector("[data-role='sparkline-interaction']");
    const guideLine = container.querySelector("[data-role='sparkline-hover-line']");
    const dot = container.querySelector("[data-role='sparkline-hover-dot']");
    const tooltip = container.querySelector("[data-role='sparkline-tooltip']");
    const tooltipValue = container.querySelector("[data-role='sparkline-tooltip-value']");
    const tooltipTime = container.querySelector("[data-role='sparkline-tooltip-time']");
    if (!interaction || !guideLine || !dot || !tooltip || !tooltipValue || !tooltipTime) {
      return;
    }

    const hideInteraction = () => {
      interaction.hidden = true;
    };

    const updateInteraction = (clientX) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        hideInteraction();
        return;
      }

      const plotLeftPx = (scene.leftInset / scene.width) * rect.width;
      const plotWidthPx = (scene.plotWidth / scene.width) * rect.width;
      const localX = clamp(clientX - rect.left, plotLeftPx, plotLeftPx + plotWidthPx);
      const pointIndex =
        scene.points.length === 1
          ? 0
          : clamp(
              Math.round(((localX - plotLeftPx) / plotWidthPx) * (scene.points.length - 1)),
              0,
              scene.points.length - 1
            );
      const point = scene.points[pointIndex];
      const pointX = (point.x / scene.width) * rect.width;
      const pointY = (point.y / scene.height) * rect.height;
      const lineTop = (scene.topInset / scene.height) * rect.height;
      const lineBottom = (scene.plotBottom / scene.height) * rect.height;

      tooltipValue.textContent = formatSparklineTooltipValue(scene.values[pointIndex]);
      tooltipTime.textContent = formatSparklineTooltipTimestamp(
        scene.timestamps[pointIndex],
        scene.rangeLabel
      );

      interaction.hidden = false;
      guideLine.style.left = `${pointX}px`;
      guideLine.style.top = `${lineTop}px`;
      guideLine.style.height = `${Math.max(0, lineBottom - lineTop)}px`;
      dot.style.left = `${pointX}px`;
      dot.style.top = `${pointY}px`;

      const tooltipWidth = tooltip.offsetWidth || 140;
      const tooltipHeight = tooltip.offsetHeight || 48;
      const clampedTooltipX = clamp(pointX, tooltipWidth / 2 + 8, rect.width - tooltipWidth / 2 - 8);
      const tooltipY = Math.max(8, pointY - tooltipHeight - 18);
      tooltip.style.left = `${clampedTooltipX}px`;
      tooltip.style.top = `${tooltipY}px`;
    };

    container.onpointerenter = (event) => {
      updateInteraction(event.clientX);
    };
    container.onpointermove = (event) => {
      updateInteraction(event.clientX);
    };
    container.onpointerdown = (event) => {
      updateInteraction(event.clientX);
    };
    container.onpointerleave = hideInteraction;
    container.onblur = hideInteraction;
  }

  function getSparklineTone(values) {
    const normalizedValues = fillSeriesGaps(values);
    if (!normalizedValues.length) {
      return "up";
    }

    return normalizedValues.at(-1) < normalizedValues[0] ? "down" : "up";
  }

  function getSparklinePalette(tone) {
    if (tone === "down") {
      return {
        lineStart: "rgba(255, 68, 0, 0.92)",
        lineEnd: "rgba(255, 68, 0, 0.35)",
        fillStart: "rgba(255, 68, 0, 0.32)",
        fillEnd: "rgba(255, 68, 0, 0)",
      };
    }

    return {
      lineStart: "rgba(125, 229, 147, 0.92)",
      lineEnd: "rgba(125, 229, 147, 0.35)",
      fillStart: "rgba(125, 229, 147, 0.38)",
      fillEnd: "rgba(125, 229, 147, 0)",
    };
  }

  function buildSparklineYAxisLabels(min, max, topY, bottomY, range) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [];
    }

    if (range === 0) {
      return [
        {
          y: topY + (bottomY - topY) * 0.58,
          text: formatChartAxisValue(max),
        },
      ];
    }

    const stops = [0.75, 0.5, 0.25];
    return stops.map((stop) => ({
      y: topY + (bottomY - topY) * (1 - stop),
      text: formatChartAxisValue(min + range * stop),
    }));
  }

  function buildSparklineXAxisLabels(timestamps, rangeLabel, leftInset, plotWidth, height) {
    if (!timestamps.length) {
      return [];
    }

    const indexes = uniqueNumbers(
      [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
        Math.max(0, Math.round((timestamps.length - 1) * ratio))
      )
    );

    return indexes.map((index, labelIndex) => {
      const ratio = timestamps.length === 1 ? 0.5 : index / (timestamps.length - 1);
      return {
        x: leftInset + ratio * plotWidth,
        anchor: labelIndex === 0 ? "start" : labelIndex === indexes.length - 1 ? "end" : "middle",
        text: formatChartXAxisLabel(timestamps[index], rangeLabel),
      };
    });
  }

  function formatChartAxisValue(value) {
    if (state.hideBalances) {
      return "•••";
    }

    if (!Number.isFinite(value)) {
      return "--";
    }

    if (getDisplayUnit() === "USD") {
      return `${getFiatDisplayPrefix()}${formatCompactAxisNumber(value)}`;
    }

    return `${getBitcoinDisplayPrefix()} ${
      getBitcoinNotation() === "CLASSIC"
        ? formatCompactClassicBitcoinAxisValue(value)
        : formatCompactBitcoinAxisValue(value)
    }`;
  }

  function formatCompactAxisNumber(value) {
    const absolute = Math.abs(value);
    const maximumFractionDigits = getFiatFractionDigits() === 0 ? 0 : 2;
    if (absolute >= 1000) {
      return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: maximumFractionDigits === 0 ? 0 : absolute >= 100000 ? 0 : 1,
      }).format(value);
    }

    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits:
        maximumFractionDigits === 0 ? 0 : absolute < 10 ? Math.min(2, maximumFractionDigits) : 0,
    }).format(value);
  }

  function formatCompactBitcoinAxisValue(value) {
    const absolute = Math.abs(value);
    if (absolute >= 1000) {
      return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: absolute >= 100000 ? 0 : 1,
      }).format(value);
    }

    if (absolute >= 1) {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    }

    return stripTrailingZeroes(Number(value).toFixed(4));
  }

  function formatCompactClassicBitcoinAxisValue(value) {
    const absolute = Math.abs(value);
    if (absolute >= 1000) {
      return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: absolute >= 100000 ? 0 : 1,
      }).format(value);
    }

    if (absolute >= 1) {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    }

    return stripTrailingZeroes(Number(value).toFixed(6));
  }

  function formatChartXAxisLabel(timestamp, rangeLabel) {
    const date = new Date(timestamp);
    if (rangeLabel === "1D") {
      return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    }

    if (rangeLabel === "30D") {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(date);
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function formatSparklineTooltipValue(value) {
    if (getDisplayUnit() === "USD") {
      return formatDisplayFiatValue(value, state.hideBalances);
    }

    return formatWalletBtc(value, state.hideBalances);
  }

  function formatSparklineTooltipTimestamp(timestamp, rangeLabel) {
    if (!Number.isFinite(timestamp)) {
      return "";
    }

    const date = new Date(timestamp);
    if (rangeLabel === "1D") {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function uniqueNumbers(values) {
    return [...new Set(values.filter((value) => Number.isFinite(value)))];
  }

  function buildSmoothPath(points) {
    if (!points.length) {
      return "";
    }

    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const controlX = (current.x + next.x) / 2;
      path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
    }
    return path;
  }

  function fillSeriesGaps(values) {
    const source = Array.isArray(values) ? values : [];
    const result = [];
    let lastKnown = null;

    source.forEach((value) => {
      if (Number.isFinite(value)) {
        lastKnown = Number(value);
        result.push(Number(value));
      } else if (lastKnown !== null) {
        result.push(lastKnown);
      } else {
        result.push(0);
      }
    });

    return result.filter((value) => Number.isFinite(value));
  }

  function getSeriesGrowthDescriptor(values) {
    const series = Array.isArray(values) ? values.filter((value) => Number.isFinite(value)) : [];
    if (!series.length) {
      return null;
    }

    const first = Number(series[0]);
    const last = Number(series.at(-1));
    if (!Number.isFinite(first) || !Number.isFinite(last)) {
      return null;
    }

    if (state.hideBalances) {
      return null;
    }

    let percent = null;
    if (first === 0) {
      percent = last === 0 ? 0 : null;
    } else {
      percent = ((last - first) / Math.abs(first)) * 100;
    }

    if (!Number.isFinite(percent)) {
      return null;
    }

    const normalizedPercent = normalizeDisplayedGrowthPercent(percent);
    const sign = normalizedPercent > 0 ? "+" : "";
    const maximumFractionDigits = Math.abs(normalizedPercent) >= 100 ? 0 : 2;

    return {
      label: `${sign}${formatCompactDecimal(normalizedPercent, maximumFractionDigits)}%`,
      chartLabel: `${normalizedPercent >= 0 ? "+" : ""}${formatCompactDecimal(
        normalizedPercent,
        maximumFractionDigits
      )}%`,
      compactTitle: Math.abs(normalizedPercent) >= 1000,
      toneClass:
        normalizedPercent < 0
          ? "is-negative"
          : normalizedPercent > 0
            ? "is-confirmed"
            : "",
      icon:
        normalizedPercent === 0
          ? getChartLineFlatIconMarkup()
          : normalizedPercent < 0
            ? getChartLineDownIconMarkup()
            : getChartLineUpIconMarkup(),
    };
  }

  function getTransactionIcon(direction) {
    if (direction === "Sent") {
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5"></path>
          <path d="m5 12 7-7 7 7"></path>
        </svg>
      `;
    }

    if (direction === "Received") {
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14"></path>
          <path d="m19 12-7 7-7-7"></path>
        </svg>
      `;
    }

    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14"></path>
        <path d="m13 5 7 7-7 7"></path>
      </svg>
    `;
  }

  function getEyeIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.06 12.34a1 1 0 0 1 0-.68 10.94 10.94 0 0 1 19.88 0 1 1 0 0 1 0 .68 10.94 10.94 0 0 1-19.88 0"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
  }

  function getEyeSlashIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.733 5.076A10.744 10.744 0 0 1 12 5c4.205 0 7.793 2.478 9.435 6.04a1 1 0 0 1 0 .84 10.826 10.826 0 0 1-1.444 2.527"></path>
        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"></path>
        <path d="M17.479 17.499A10.75 10.75 0 0 1 12 19c-4.205 0-7.792-2.475-9.436-6.04a1 1 0 0 1 0-.84 10.75 10.75 0 0 1 3.362-4.208"></path>
        <path d="m2 2 20 20"></path>
      </svg>
    `;
  }

  function getCalendarIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 2v4"></path>
        <path d="M16 2v4"></path>
        <rect x="3" y="5" width="18" height="16" rx="2"></rect>
        <path d="M3 10h18"></path>
      </svg>
    `;
  }

  function getClockIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 7v5l3 2"></path>
      </svg>
    `;
  }

  function getCheckCircleIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="m9 12 2 2 4-4"></path>
      </svg>
    `;
  }

  function getGitBranchIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 3v12"></path>
        <path d="M18 9a3 3 0 1 0-3-3"></path>
        <path d="M6 15a3 3 0 1 0 3 3"></path>
        <path d="M18 6v2a4 4 0 0 1-4 4H6"></path>
      </svg>
    `;
  }

  function getClockCounterClockwiseIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 3v5h5"></path>
        <path d="M4.64 15a8 8 0 1 0 .9-8.21L3 8"></path>
        <path d="M12 7v5l3 2"></path>
      </svg>
    `;
  }

  function getStarIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="m12 3.5 2.63 5.33 5.88.86-4.25 4.14 1 5.84L12 17.06l-5.26 2.61 1-5.84-4.25-4.14 5.88-.86L12 3.5Z"></path>
      </svg>
    `;
  }

  function getFeePaidIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <ellipse cx="8" cy="6" rx="4.5" ry="2.5"></ellipse>
        <path d="M3.5 6v5c0 1.38 2.01 2.5 4.5 2.5s4.5-1.12 4.5-2.5V6"></path>
        <path d="M3.5 11c0 1.38 2.01 2.5 4.5 2.5s4.5-1.12 4.5-2.5"></path>
        <ellipse cx="15.5" cy="10.5" rx="3" ry="1.7"></ellipse>
        <path d="M12.5 10.5v3.25c0 .94 1.34 1.7 3 1.7s3-.76 3-1.7v-3.25"></path>
      </svg>
    `;
  }

  function getFeeRateIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 15a8 8 0 0 1 16 0"></path>
        <path d="M12 15l4.5-4.5"></path>
        <path d="M12 15h.01"></path>
      </svg>
    `;
  }

  function getChartLineUpIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="m3 16 6-6 4 4 8-8"></path>
        <path d="M15 6h6v6"></path>
      </svg>
    `;
  }

  function getChartLineDownIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="m3 8 6 6 4-4 8 8"></path>
        <path d="M15 18h6v-6"></path>
      </svg>
    `;
  }

  function getChartLineFlatIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="#FF4400" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 12h14"></path>
        <path d="m14 8 4 4-4 4"></path>
      </svg>
    `;
  }

  // ---------------------------------------------------------------------------
  // Formatting and utilities
  // ---------------------------------------------------------------------------

  function buildSignedAmountMarkup(value, hidden) {
    const bitcoinAmount = toBaseUnitBitcoinAmount(value);

    if (hidden) {
      if (bitcoinAmount > 0) {
        return `<span class="transaction-amount-sign">+</span> ••••••`;
      }
      if (bitcoinAmount < 0) {
        return `<span class="transaction-amount-sign">-</span> ••••••`;
      }
      return "••••••";
    }

    const sign = bitcoinAmount > 0 ? "+" : bitcoinAmount < 0 ? "-" : "";
    const amount =
      getBitcoinNotation() === "CLASSIC"
        ? formatClassicBitcoinNumber(Math.abs(value))
        : formatBitcoinNumber(Math.abs(bitcoinAmount));
    return sign
      ? `<span class="transaction-amount-sign">${escapeHtml(sign)}</span> ${escapeHtml(amount)}`
      : escapeHtml(amount);
  }

  function buildSignedBitcoinPrimaryMarkup(value, hidden) {
    const bitcoinAmount = toBaseUnitBitcoinAmount(value);
    const prefix = getBitcoinDisplayPrefix();

    if (hidden) {
      if (bitcoinAmount > 0) {
        return `<span class="transaction-amount-sign">+</span> ${escapeHtml(prefix)} ••••••`;
      }
      if (bitcoinAmount < 0) {
        return `<span class="transaction-amount-sign">-</span> ${escapeHtml(prefix)} ••••••`;
      }
      return `${escapeHtml(prefix)} ••••••`;
    }

    const sign = bitcoinAmount > 0 ? "+" : bitcoinAmount < 0 ? "-" : "";
    const amount =
      getBitcoinNotation() === "CLASSIC"
        ? formatClassicBitcoinNumber(Math.abs(value))
        : formatBitcoinNumber(Math.abs(bitcoinAmount));

    return sign
      ? `<span class="transaction-amount-sign">${escapeHtml(sign)}</span> ${escapeHtml(prefix)} ${escapeHtml(amount)}`
      : `${escapeHtml(prefix)} ${escapeHtml(amount)}`;
  }

  function buildSignedUsdMarkup(value, hidden) {
    const convertedValue = convertUsdValueToFiat(value);
    const prefix = getFiatDisplayPrefix();

    if (hidden) {
      if (value > 0) {
        return `<span class="transaction-amount-sign">+</span> ${escapeHtml(prefix)} ••••••`;
      }
      if (value < 0) {
        return `<span class="transaction-amount-sign">-</span> ${escapeHtml(prefix)} ••••••`;
      }
      return `${escapeHtml(prefix)} ••••••`;
    }

    if (!Number.isFinite(convertedValue)) {
      return `${escapeHtml(prefix)} --`;
    }

    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    const formatted = formatFiatNumber(Math.abs(convertedValue), {
      minimumFractionDigits: getFiatFractionDigits(),
      maximumFractionDigits: getFiatFractionDigits(),
    });

    return sign
      ? `<span class="transaction-amount-sign">${escapeHtml(sign)}</span> ${escapeHtml(prefix)} ${escapeHtml(formatted)}`
      : `${escapeHtml(prefix)} ${escapeHtml(formatted)}`;
  }

  function buildSignedDisplayFiatMarkup(value, signValue, hidden) {
    const prefix = getFiatDisplayPrefix();
    const sign = signValue > 0 ? "+" : signValue < 0 ? "-" : "";

    if (hidden) {
      return sign
        ? `<span class="transaction-amount-sign">${escapeHtml(sign)}</span> ${escapeHtml(prefix)} ••••••`
        : `${escapeHtml(prefix)} ••••••`;
    }

    if (!Number.isFinite(value)) {
      return `${escapeHtml(prefix)} --`;
    }

    const formatted = formatFiatNumber(Math.abs(value), {
      minimumFractionDigits: getFiatFractionDigits(),
      maximumFractionDigits: getFiatFractionDigits(),
    });

    return sign
      ? `<span class="transaction-amount-sign">${escapeHtml(sign)}</span> ${escapeHtml(prefix)} ${escapeHtml(formatted)}`
      : `${escapeHtml(prefix)} ${escapeHtml(formatted)}`;
  }

  function formatDisplayFiatValue(value, hidden) {
    return formatFiatWithOptions(value, hidden, {
      minimumFractionDigits:
        getFiatFractionDigits() === 0 ? 0 : Math.abs(Number(value) || 0) < 1000 ? 2 : 0,
      maximumFractionDigits: getFiatFractionDigits(),
    });
  }

  function formatDisplayFiatTransactionValue(value, hidden) {
    return formatFiatWithOptions(value, hidden, {
      minimumFractionDigits: getFiatFractionDigits(),
      maximumFractionDigits: getFiatFractionDigits(),
    });
  }

  function formatDisplayFiatMetricValue(value, hidden) {
    return formatFiatWithOptions(value, hidden, {
      minimumFractionDigits: getFiatFractionDigits(),
      maximumFractionDigits: getFiatFractionDigits(),
      spaceAfterPrefix: false,
      hiddenDigits: "••••",
      missingDigits: "--",
    });
  }

  function formatDisplayFiatFooterValue(value) {
    return formatFiatWithOptions(value, false, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      spaceAfterPrefix: false,
      missingDigits: "--",
    });
  }

  function formatFiatWithOptions(
    value,
    hidden,
    {
      minimumFractionDigits = 0,
      maximumFractionDigits = getFiatFractionDigits(),
      spaceAfterPrefix = true,
      hiddenDigits = "••••••",
      missingDigits = "--",
    } = {}
  ) {
    const prefix = getFiatDisplayPrefix();
    const gap = spaceAfterPrefix ? " " : "";
    if (hidden) {
      return `${prefix}${gap}${hiddenDigits}`;
    }

    if (!Number.isFinite(value)) {
      return `${prefix}${gap}${missingDigits}`;
    }

    return `${prefix}${gap}${formatFiatNumber(value, {
      minimumFractionDigits,
      maximumFractionDigits,
    })}`;
  }

  function formatFiatNumber(
    value,
    {
      minimumFractionDigits = 0,
      maximumFractionDigits = getFiatFractionDigits(),
      notation = "standard",
    } = {}
  ) {
    if (!Number.isFinite(value)) {
      return "";
    }

    return new Intl.NumberFormat("en-US", {
      notation,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value);
  }

  function formatWalletBtc(value, hidden) {
    if (hidden) {
      return getHiddenBitcoinDisplay();
    }
    return `${getBitcoinDisplayPrefix()} ${
      getBitcoinNotation() === "CLASSIC"
        ? formatClassicBitcoinNumber(value)
        : formatBitcoinNumber(toBaseUnitBitcoinAmount(value))
    }`;
  }

  function formatBitcoinNumber(value) {
    if (!Number.isFinite(value)) {
      return "0";
    }

    const absolute = Math.abs(value);
    const fixed = stripTrailingZeroes(absolute.toFixed(8));
    const [integerPart, fractionalPart] = (fixed || "0").split(".");
    const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return fractionalPart ? `${groupedInteger}.${fractionalPart}` : groupedInteger;
  }

  function formatClassicBitcoinNumber(value) {
    if (!Number.isFinite(value)) {
      return "0";
    }

    const absolute = Math.abs(value);
    const fixed = stripTrailingZeroes(absolute.toFixed(8));
    const [integerPart, fractionalPart] = (fixed || "0").split(".");
    const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return fractionalPart ? `${groupedInteger}.${fractionalPart}` : groupedInteger;
  }

  function stripTrailingZeroes(value) {
    return String(value).replace(/\.?0+$/, "");
  }

  function formatUsdDisplay(value, hidden) {
    return formatDisplayFiatValue(convertUsdValueToFiat(value), hidden);
  }

  function formatTransactionUsd(value, hidden) {
    return formatDisplayFiatTransactionValue(convertUsdValueToFiat(value), hidden);
  }

  function formatTransactionBtc(value, hidden) {
    if (hidden) {
      return getHiddenBitcoinDisplay();
    }
    return `${getBitcoinDisplayPrefix()} ${
      getBitcoinNotation() === "CLASSIC"
        ? formatClassicBitcoinNumber(value)
        : formatBitcoinNumber(toBaseUnitBitcoinAmount(value))
    }`;
  }

  function formatTransactionBitcoinAmount(netSats, hidden) {
    const prefix = getBitcoinDisplayPrefix();
    if (hidden) {
      return `${prefix} ••••••`;
    }

    const amount =
      getBitcoinNotation() === "CLASSIC"
        ? formatClassicBitcoinNumber(Math.abs(netSats) / 1e8)
        : formatBitcoinNumber(Math.abs(netSats));
    return `${prefix} ${amount}`;
  }

  function getFooterBitcoinReferenceDisplay() {
    if (getBitcoinNotation() === "CLASSIC") {
      return `${formatClassicBitcoinNumber(1)} BTC`;
    }

    return `₿ ${formatBitcoinNumber(1e8)}`;
  }

  function formatFooterUsdValue(value) {
    return formatDisplayFiatFooterValue(convertUsdValueToFiat(value));
  }

  function formatTechnicalFee(feeSats, hidden) {
    if (hidden) {
      return getHiddenBitcoinDisplay();
    }

    if (!Number.isFinite(feeSats)) {
      return `${getBitcoinDisplayPrefix()} --`;
    }

    if (getBitcoinNotation() === "CLASSIC") {
      return `BTC ${formatClassicBitcoinNumber(Math.max(0, feeSats) / 1e8)}`;
    }

    return `₿ ${formatBitcoinNumber(Math.max(0, feeSats))}`;
  }

  function formatTechnicalFeeRate(feeRateSatVb, hidden) {
    if (hidden) {
      return "••• sat/vB";
    }

    if (!Number.isFinite(feeRateSatVb)) {
      return "-- sat/vB";
    }

    return `${formatCompactDecimal(feeRateSatVb, 2)} sat/vB`;
  }

  function formatCompactDecimal(value, maximumFractionDigits = 2) {
    if (!Number.isFinite(value)) {
      return "--";
    }

    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits,
    }).format(value);
  }

  function getOverviewBalance(totalBtc, totalUsd) {
    return getDisplayUnit() === "USD"
      ? formatDisplayFiatValue(
          getDisplayFiatValueFromBtc(totalBtc, {
            fallbackUsd: totalUsd,
          }),
          state.hideBalances
        )
      : formatWalletBtc(totalBtc, state.hideBalances);
  }

  function getWalletSummaryDisplay(totalBtc, totalUsd) {
    if (getDisplayUnit() === "USD") {
      return {
        primary: formatDisplayFiatValue(
          getDisplayFiatValueFromBtc(totalBtc, {
            fallbackUsd: totalUsd,
          }),
          state.hideBalances
        ),
        primaryHidden: formatDisplayFiatValue(null, true),
        secondary: formatWalletBtc(totalBtc, state.hideBalances),
        secondaryHidden: getHiddenBitcoinDisplay(),
      };
    }

    return {
      primary: formatWalletBtc(totalBtc, state.hideBalances),
      primaryHidden: getHiddenBitcoinDisplay(),
      secondary: formatDisplayFiatValue(
        getDisplayFiatValueFromBtc(totalBtc, {
          fallbackUsd: totalUsd,
        }),
        state.hideBalances
      ),
      secondaryHidden: formatDisplayFiatValue(null, true),
    };
  }

  function getWalletPrimaryMarkup(value) {
    if (typeof value !== "string") {
      return escapeHtml(value);
    }

    const prefix = getSupportedDisplayPrefixes().find((candidate) => value.startsWith(candidate));
    if (!prefix) {
      return escapeHtml(value);
    }

    const amount = value.slice(prefix.length).trimStart();
    return `<span class="wallet-balance-primary-symbol">${escapeHtml(prefix)}</span><span>${escapeHtml(
      amount
    )}</span>`;
  }

  function getTransactionAmountDisplay(item) {
    if (getDisplayUnit() === "USD") {
      const signedFiatValue = getTransactionSignedDisplayFiatValue(item);
      return {
        primary: buildSignedDisplayFiatMarkup(signedFiatValue, Math.sign(item.netSats || 0), state.hideBalances),
        secondary: formatTransactionBitcoinAmount(item.netSats, state.hideBalances),
      };
    }

    return {
      primary: buildSignedBitcoinPrimaryMarkup(item.netSats / 1e8, state.hideBalances),
      secondary: formatDisplayFiatTransactionValue(getTransactionThenDisplayFiatValue(item), state.hideBalances),
    };
  }

  function getTransactionSummaryAmount(item) {
    return getTransactionAmountDisplay(item).primary;
  }

  function getTransactionValueMetrics(item) {
    const valueThen = getTransactionThenDisplayFiatValue(item);
    const valueNow = getTransactionCurrentDisplayFiatValue(item);
    const rawGrowthPercent =
      Number.isFinite(valueThen) && valueThen > 0 && Number.isFinite(valueNow)
        ? ((valueNow - valueThen) / valueThen) * 100
        : null;
    const growthPercent = normalizeDisplayedGrowthPercent(rawGrowthPercent);

    return {
      thenLabel: formatDisplayFiatMetricValue(valueThen, state.hideBalances),
      nowLabel: formatDisplayFiatMetricValue(valueNow, state.hideBalances),
      growthLabel: formatTransactionGrowth(growthPercent),
      growthIcon:
        Number.isFinite(growthPercent) && growthPercent === 0
          ? getChartLineFlatIconMarkup()
          : Number.isFinite(growthPercent) && growthPercent < 0
          ? getChartLineDownIconMarkup()
          : getChartLineUpIconMarkup(),
      growthTone:
        Number.isFinite(growthPercent) && growthPercent < 0
          ? "is-negative"
          : Number.isFinite(growthPercent) && growthPercent > 0
            ? "is-confirmed"
            : "",
    };
  }

  function getTransactionTechnicalMetrics(item) {
    return {
      feeLabel: formatTechnicalFee(item?.feeSats, state.hideBalances),
      feeRateLabel: formatTechnicalFeeRate(item?.feeRateSatVb, state.hideBalances),
    };
  }

  function getAddressRowBalanceMarkup(entry) {
    if (entry.isBalanceLoading) {
      return `
        <span class="address-balance-loading" aria-label="Loading address balance">
          <span class="wallet-card-spinner address-balance-spinner" aria-hidden="true"></span>
          <span class="sr-only">Loading address balance</span>
        </span>
      `;
    }

    const value =
      getDisplayUnit() === "USD"
        ? formatDisplayFiatValue(
            getDisplayFiatValueFromBtc(entry.totalBtc, {
              fallbackUsd: entry.totalUsd,
            }),
            state.hideBalances
          )
        : Number.isFinite(entry.totalBtc)
          ? formatWalletBtc(entry.totalBtc, state.hideBalances)
          : `${getBitcoinDisplayPrefix()} --`;

    return `<span class="address-balance-value text-meta">${escapeHtml(value)}</span>`;
  }

  function getWalletAddressesKicker(count) {
    return "WALLET WATCHLIST";
  }

  function getWalletChartDisplay(walletView) {
    const range = normalizeChartRange(state.selectedRange);
    let points;
    if (range === "1D") {
      points = walletView.intradayTimeline;
    } else if (range === "30D") {
      points = walletView.dailyTimeline.slice(-30);
    } else if (range === "1Y") {
      points = walletView.dailyTimeline.slice(-365);
    } else {
      points = walletView.dailyTimeline;
    }

    return {
      symbol: getDisplayUnit() === "USD" ? getFiatDisplayPrefix() : getBitcoinDisplayPrefix(),
      range,
      timestamps: points.map((point) => point.timestamp),
      values: points.map((point) =>
        getDisplayUnit() === "USD"
          ? getPointDisplayFiatValue(point, {
              preferIntraday: range === "1D",
            })
          : point.btcHoldings
      ),
      key: `${walletView.address?.id || walletView.wallet.id}-${range}-${getDisplayChartUnitKey()}`,
    };
  }

  function formatTransactionTime(value) {
    const date = new Date(value);
    const now = new Date();
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);

    if (isSameLocalDay(date, now)) {
      return time;
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (isSameLocalDay(date, yesterday)) {
      return `Yesterday, ${time}`;
    }

    return `${new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    }).format(date)}, ${time}`;
  }

  function formatTransactionTimeDetailed(value) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  }

  function formatTransactionDateLabel(value) {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  }

  function formatTransactionClockLabel(value) {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  }

  function formatTransactionMetricUsd(value) {
    return formatDisplayFiatMetricValue(convertUsdValueToFiat(value), state.hideBalances);
  }

  function formatTransactionGrowth(value) {
    if (state.hideBalances) {
      return "•••";
    }

    if (!Number.isFinite(value)) {
      return "--";
    }

    const maximumFractionDigits = Math.abs(value) >= 100 ? 0 : 2;
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits,
    }).format(value)}%`;
  }

  function normalizeDisplayedGrowthPercent(value) {
    if (!Number.isFinite(value)) {
      return value;
    }

    const factor = 100;
    const rounded = Math.round(value * factor) / factor;
    return Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
  }

  function buildTransactionModalKicker(label, kind = "WALLET") {
    const prefix = kind === "ADDRESS" ? "TRANSACTION TO ADDRESS" : "TRANSACTION TO WALLET";
    const formattedLabel =
      kind === "ADDRESS" ? String(label || "") : String(label || "").toUpperCase();
    return `${prefix} ${formattedLabel}`.trim();
  }

  function isSameLocalDay(left, right) {
    return (
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
    );
  }

  function shortAddress(address) {
    return `${address.slice(0, 8)}…${address.slice(-6)}`;
  }

  function getAddressHeaderCrumbLabel(address) {
    if (!address?.address) {
      return "";
    }

    return `${address.address.slice(0, 4)}...${address.address.slice(-4)}`;
  }

  function getAddressHeaderCrumbFullLabel(address) {
    if (!address?.address) {
      return "";
    }

    return address.address;
  }

  function startOfUtcHour(timestamp) {
    const date = new Date(timestamp);
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours()
    );
  }

  function startOfUtcDay(timestamp) {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  function toHourKey(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 13);
  }

  function toDateKey(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  function normalizeChartRange(value) {
    if (Object.prototype.hasOwnProperty.call(DETAIL_CHART_RANGES, value)) {
      return value;
    }

    if (value === "7D") {
      return "30D";
    }

    if (value === "90D" || value === "1Y") {
      return "1Y";
    }

    return "30D";
  }

  function getRequiredDetailScopeForRange(range = state.selectedRange) {
    const normalizedRange = normalizeChartRange(range);
    if (normalizedRange === "ALL") {
      return "ALL";
    }

    if (normalizedRange === "1Y") {
      return "1Y";
    }

    return "30D";
  }

  function normalizeHistoryScope(value) {
    if (value === "ALL" || value === "1Y" || value === "30D" || value === "SUMMARY") {
      return value;
    }

    return "SUMMARY";
  }

  function normalizeBakedDemoSnapshot(candidate) {
    if (!candidate || typeof candidate !== "object") {
      return null;
    }

    const balancesByAddress = {};
    const sourceBalances = candidate.balancesByAddress;
    if (!sourceBalances || typeof sourceBalances !== "object") {
      return null;
    }

    Object.entries(sourceBalances).forEach(([address, balanceSats]) => {
      if (typeof address !== "string" || !address.trim() || !Number.isFinite(balanceSats)) {
        return;
      }

      balancesByAddress[address.trim()] = Math.max(0, Math.round(balanceSats));
    });

    if (!Object.keys(balancesByAddress).length) {
      return null;
    }

    if (!Number.isFinite(candidate.currentPriceUsd)) {
      return null;
    }

    return {
      asOf:
        typeof candidate.asOf === "string" && !Number.isNaN(Date.parse(candidate.asOf))
          ? candidate.asOf
          : null,
      currentPriceUsd: candidate.currentPriceUsd,
      balancesByAddress,
    };
  }

  function normalizeSnapshotDetailScope(value) {
    if (value === "ALL" || value === "1Y" || value === "30D" || value === "SUMMARY") {
      return value;
    }

    return "SUMMARY";
  }

  function getHistoryScopeRank(value) {
    return HISTORY_SCOPE_ORDER[normalizeSnapshotDetailScope(value)] ?? HISTORY_SCOPE_ORDER.SUMMARY;
  }

  function hasScopeCoverage(currentScope, requiredScope) {
    return getHistoryScopeRank(currentScope) >= getHistoryScopeRank(requiredScope);
  }

  function pickHigherHistoryScope(leftScope, rightScope) {
    return hasScopeCoverage(leftScope, rightScope)
      ? normalizeSnapshotDetailScope(leftScope)
      : normalizeSnapshotDetailScope(rightScope);
  }

  function getStartTimestampForHistoryScope(scope) {
    const normalizedScope = normalizeHistoryScope(scope);
    if (normalizedScope === "ALL") {
      return 0;
    }

    if (normalizedScope === "30D") {
      return startOfUtcDay(Date.now() - 29 * DAY_MS);
    }

    return startOfUtcDay(Date.now() - (ONE_YEAR_DAYS - 1) * DAY_MS);
  }

  function hasRequiredDetailScope(snapshot, requiredScope) {
    return hasScopeCoverage(snapshot?.detailScope, requiredScope);
  }

  function normalizeFiatCurrency(value) {
    return SUPPORTED_FIAT_CURRENCIES.includes(value) ? value : "USD";
  }

  function getFiatCurrency() {
    return normalizeFiatCurrency(state.settings.fiatCurrency);
  }

  function getFiatDisplayPrefix(currency = getFiatCurrency()) {
    return FIAT_DISPLAY_META[normalizeFiatCurrency(currency)]?.prefix || "$";
  }

  function getFiatIconGlyph(currency = getFiatCurrency()) {
    return FIAT_DISPLAY_META[normalizeFiatCurrency(currency)]?.icon || "$";
  }

  function getDirectFiatProductId(currency = getFiatCurrency()) {
    const normalizedCurrency = normalizeFiatCurrency(currency);
    if (normalizedCurrency === "EUR") {
      return "BTC-EUR";
    }
    if (normalizedCurrency === "GBP") {
      return "BTC-GBP";
    }
    return null;
  }

  function getProductQuoteCurrency(productId) {
    return String(productId || "BTC-USD").split("-")[1] || "USD";
  }

  function getFiatFractionDigits(currency = getFiatCurrency()) {
    return FIAT_DISPLAY_META[normalizeFiatCurrency(currency)]?.fractionDigits ?? 2;
  }

  function getFiatExchangeRate(currency = getFiatCurrency()) {
    const normalizedCurrency = normalizeFiatCurrency(currency);
    if (normalizedCurrency === "USD") {
      return 1;
    }

    const rate =
      runtime.fiatExchangeRates instanceof Map ? runtime.fiatExchangeRates.get(normalizedCurrency) : null;
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  }

  function convertUsdValueToFiat(value, currency = getFiatCurrency()) {
    if (!Number.isFinite(value)) {
      return null;
    }

    const rate = getFiatExchangeRate(currency);
    return Number.isFinite(rate) ? value * rate : null;
  }

  function hasDirectDisplayFiatMarket(currency = getFiatCurrency()) {
    const normalizedCurrency = normalizeFiatCurrency(currency);
    return (
      Boolean(getDirectFiatProductId(normalizedCurrency)) &&
      runtime.currentPriceFiatCurrency === normalizedCurrency &&
      Number.isFinite(runtime.currentPriceFiat)
    );
  }

  function getCurrentDisplayFiatUnitPrice() {
    if (hasDirectDisplayFiatMarket()) {
      return runtime.currentPriceFiat;
    }

    return convertUsdValueToFiat(runtime.currentPriceUsd);
  }

  function getHistoricalDisplayFiatUnitPrice(timestamp, { preferIntraday = false } = {}) {
    if (!Number.isFinite(timestamp) || !hasDirectDisplayFiatMarket()) {
      return null;
    }

    if (preferIntraday && runtime.fiatIntradayPriceHistory instanceof Map) {
      const hourlyPrice = runtime.fiatIntradayPriceHistory.get(toHourKey(timestamp));
      if (Number.isFinite(hourlyPrice)) {
        return hourlyPrice;
      }
    }

    if (runtime.fiatPriceHistory instanceof Map) {
      const dailyPrice = runtime.fiatPriceHistory.get(toDateKey(timestamp));
      if (Number.isFinite(dailyPrice)) {
        return dailyPrice;
      }
    }

    return null;
  }

  function getDisplayFiatValueFromBtc(
    btcHoldings,
    {
      timestamp = null,
      preferIntraday = false,
      fallbackUsd = null,
      preferCurrentPrice = !Number.isFinite(timestamp),
    } = {}
  ) {
    if (!Number.isFinite(btcHoldings)) {
      return Number.isFinite(fallbackUsd) ? convertUsdValueToFiat(fallbackUsd) : null;
    }

    const historicalPrice = Number.isFinite(timestamp)
      ? getHistoricalDisplayFiatUnitPrice(timestamp, { preferIntraday })
      : null;
    if (Number.isFinite(historicalPrice)) {
      return btcHoldings * historicalPrice;
    }

    const currentPrice = getCurrentDisplayFiatUnitPrice();
    if (preferCurrentPrice && Number.isFinite(currentPrice)) {
      return btcHoldings * currentPrice;
    }

    if (Number.isFinite(fallbackUsd)) {
      return convertUsdValueToFiat(fallbackUsd);
    }

    return Number.isFinite(currentPrice) ? btcHoldings * currentPrice : null;
  }

  function getPointDisplayFiatValue(point, { preferIntraday = false } = {}) {
    return getDisplayFiatValueFromBtc(point?.btcHoldings, {
      timestamp: point?.timestamp,
      preferIntraday,
      fallbackUsd: point?.usdValue,
    });
  }

  function getTransactionThenDisplayFiatValue(item) {
    const absoluteBtc = Math.abs(item?.netSats || 0) / 1e8;
    return getDisplayFiatValueFromBtc(absoluteBtc, {
      timestamp: item?.timestamp,
      fallbackUsd: item?.usdValue,
    });
  }

  function getTransactionCurrentDisplayFiatValue(item) {
    const absoluteBtc = Math.abs(item?.netSats || 0) / 1e8;
    const fallbackUsd = Number.isFinite(runtime.currentPriceUsd) ? absoluteBtc * runtime.currentPriceUsd : null;
    return getDisplayFiatValueFromBtc(absoluteBtc, {
      fallbackUsd,
    });
  }

  function getTransactionSignedDisplayFiatValue(item) {
    const absoluteValue = getTransactionThenDisplayFiatValue(item);
    if (!Number.isFinite(absoluteValue)) {
      return null;
    }

    return Math.sign(item?.netSats || 0) * absoluteValue;
  }

  function getSupportedDisplayPrefixes() {
    return uniqueStrings([
      getFiatDisplayPrefix(),
      getBitcoinDisplayPrefix(),
      "BTC",
      "₿",
    ]).sort((left, right) => right.length - left.length);
  }

  function getDisplayChartUnitKey() {
    return getDisplayUnit() === "USD" ? getFiatCurrency().toLowerCase() : getDisplayUnit().toLowerCase();
  }

  function getDisplayUnit() {
    return state.settings.displayUnit === "USD" ? "USD" : "BTC";
  }

  function normalizeBitcoinNotation(value) {
    return value === "CLASSIC" ? "CLASSIC" : "MODERN";
  }

  function getBitcoinNotation() {
    return normalizeBitcoinNotation(state.settings.bitcoinNotation);
  }

  function getBitcoinDisplayPrefix() {
    return getBitcoinNotation() === "CLASSIC" ? "BTC" : "₿";
  }

  function getHiddenBitcoinDisplay() {
    return `${getBitcoinDisplayPrefix()} ••••••`;
  }

  function toBaseUnitBitcoinAmount(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.round(value * 1e8);
  }

  function normalizeWalletName(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 32) : "";
  }

  function isFreshSatoshiDemoVault() {
    if (state.lastUpdated || state.addresses.length !== SATOSHI_DEMO_ADDRESSES.length) {
      return false;
    }

    const demoSet = new Set(SATOSHI_DEMO_ADDRESSES.map((address) => address.toLowerCase()));
    return state.addresses.every((entry) => demoSet.has(entry.address.toLowerCase()));
  }

  function formatBootstrapTimestamp(value) {
    if (!value || Number.isNaN(Date.parse(value))) {
      return "recently";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  }

  function getFirstFinitePriceFromHistory(priceHistory) {
    const firstEntry = [...priceHistory.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .find(([, value]) => Number.isFinite(value));
    return firstEntry ? firstEntry[1] : null;
  }

  function getLastFinitePriceFromHistory(priceHistory) {
    const lastEntry = [...priceHistory.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .find(([, value]) => Number.isFinite(value));
    return lastEntry ? lastEntry[1] : null;
  }

  function createId(prefix) {
    if (crypto.randomUUID) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
