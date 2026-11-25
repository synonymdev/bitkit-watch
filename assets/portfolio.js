/* Portfolio module. Dependencies are supplied by app.js; state access is explicit. */
((root) => {
  "use strict";
  function create({
    DAY_MS,
    HISTORY_DAYS,
    HOUR_MS,
    MAX_TIMELINE_POINTS,
    looksLikeBitcoinAddress,
    normalizeBitcoinAddress,
    normalizeTransactionDetails,
    shortAddress,
    startOfUtcDay,
    startOfUtcHour,
    toDateKey,
    toHourKey,
    uniqueStrings
  }) {
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
          refreshedAt: endTimestamp,
          refreshFailed: false,
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
          refreshedAt: Date.now(),
          refreshFailed: false,
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
        return combineSnapshotTimelines(
          snapshots,
          "balanceTimeline",
          priceHistory,
          startTimestamp,
          endTimestamp
        );
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
                hasAddressDetails: false,
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
            if (event.inputAddresses.length || event.outputAddresses.length) {
              row.hasAddressDetails = true;
            }
            event.inputAddresses.forEach((address) => row.inputAddresses.add(address));
            event.outputAddresses.forEach((address) => row.outputAddresses.add(address));
            event.walletInputAddresses.forEach((address) => row.walletInputAddresses.add(address));
            event.walletOutputAddresses.forEach((address) => row.walletOutputAddresses.add(address));
          });
        });

        return [...byTx.values()]
          .map((row) => {
            const price = priceHistory.get(toDateKey(row.timestamp));
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
              hasAddressDetails: Boolean(row.hasAddressDetails),
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
        if (normalizeBitcoinAddress(output.scriptpubkey_address) === normalizeBitcoinAddress(watchedAddress)) {
          receivedSats += Number(output.value || 0);
        }
      });

      (tx.vin || []).forEach((input) => {
        if (normalizeBitcoinAddress(input.prevout?.scriptpubkey_address) === normalizeBitcoinAddress(watchedAddress)) {
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

    function buildTransactionTechnicalDetails(tx) {
      const { inputAddresses, outputAddresses } = extractTransactionAddresses(tx);
      return normalizeTransactionDetails({
        txid: tx.txid,
        feeSats: Number.isFinite(tx?.fee) ? Number(tx.fee) : null,
        feeRateSatVb: extractTransactionFeeRate(tx),
        inputAddresses,
        outputAddresses,
      });
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

    function isSupportedTimelineRange(startTimestamp, endTimestamp, stepMs) {
      return Number.isFinite(startTimestamp) && Number.isFinite(endTimestamp) &&
        startTimestamp >= 0 && endTimestamp >= startTimestamp && endTimestamp <= Date.now() + DAY_MS &&
        Number.isFinite(stepMs) && stepMs > 0 &&
        Math.floor((endTimestamp - startTimestamp) / stepMs) + 1 <= MAX_TIMELINE_POINTS;
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
      if (!isSupportedTimelineRange(startTimestamp, endTimestamp, stepMs)) return [];
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
      if (!isSupportedTimelineRange(startTimestamp, endTimestamp, stepMs)) return [];
      const sources = (Array.isArray(snapshots) ? snapshots : [])
        .map((snapshot) => {
          const points = Array.isArray(snapshot?.[timelineKey])
            ? snapshot[timelineKey]
                .filter(
                  (point) =>
                    Number.isFinite(point?.timestamp) &&
                    Number.isFinite(point?.balanceSats)
                )
                .sort((left, right) => left.timestamp - right.timestamp)
            : [];
          return {
            points,
            index: 0,
            balanceSats: 0,
          };
        })
        .filter((source) => source.points.length);
      if (!sources.length) {
        return [];
      }

      const timelineStart = alignTime(startTimestamp);
      const safePriceHistory = priceHistory instanceof Map ? priceHistory : new Map();

      const timeline = [];
      for (let cursor = timelineStart; cursor <= endTimestamp; cursor += stepMs) {
        const key = keyForTimestamp(cursor);
        let balanceSats = 0;
        sources.forEach((source) => {
          while (
            source.index < source.points.length &&
            source.points[source.index].timestamp <= cursor
          ) {
            source.balanceSats = source.points[source.index].balanceSats;
            source.index += 1;
          }
          balanceSats += source.balanceSats;
        });
        const btcHoldings = balanceSats / 1e8;
        const usdPrice = safePriceHistory.get(key);
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


    return {
      PortfolioLayer,
      ActivityLayer,
      normalizeTransactionEvent,
      buildTransactionTechnicalDetails,
      buildDailyBalanceTimeline,
      buildIntervalBalanceTimeline,
      combineSnapshotTimelines,
      buildFlatTimeline
    };
  }
  root.BITKIT_WATCH_PORTFOLIO = { create };
  if (typeof module === "object" && module.exports) module.exports = { create };
})(globalThis);
