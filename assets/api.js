/* API module. Dependencies are supplied by app.js; state access is explicit. */
((root) => {
  "use strict";
  function create({
    ADDRESS_API_PROVIDERS,
    DAY_MS,
    HOUR_MS,
    MAX_API_RESPONSE_BYTES,
    MAX_EXPLORER_CONCURRENCY,
    MAX_EXPLORER_TRANSACTION_RESPONSE_BYTES,
    MAX_TRANSACTIONS_PER_ADDRESS,
    MAX_TRANSACTION_PAGES,
    SUPPORTED_FIAT_CURRENCIES,
    getValidationLayer,
    buildTransactionTechnicalDetails,
    createDefaultFiatExchangeRates,
    getActiveRequests,
    getDataGeneration,
    getDirectFiatProductId,
    getLastFinitePriceFromHistory,
    getProductQuoteCurrency,
    isValidTxid,
    normalizeBitcoinAddress,
    normalizeFiatCurrency,
    readJsonResponse,
    requireCurrentGeneration,
    startOfUtcDay,
    startOfUtcHour,
    summarizePriceHistory,
    toDateKey,
    toHourKey,
    validateAddressSummaryPayload,
    validateCandlesPayload,
    validateTransactionListPayload,
    validateTransactionPayload
  }) {
    const APILayer = {
      async fetchAddressSummary(address) {
        const generation = getDataGeneration();
        const normalizedAddress = await requireValidMainnetBitcoinAddress(address);
        requireCurrentGeneration(generation);
        const attempts = ADDRESS_API_PROVIDERS.map((provider) => async () => {
          const summary = await fetchAddressSummaryFromProvider(provider, normalizedAddress);
          return {
            provider: provider.name,
            summary,
          };
        });

        return withFallback(attempts, "Address summary lookup failed.");
      },

      async fetchAddressBundle(address, startTimestamp) {
        const generation = getDataGeneration();
        const normalizedAddress = await requireValidMainnetBitcoinAddress(address);
        requireCurrentGeneration(generation);
        const attempts = ADDRESS_API_PROVIDERS.map((provider) => async () => {
          const bundle = await fetchAddressBundleFromProvider(provider, normalizedAddress, startTimestamp);
          return {
            provider: provider.name,
            bundle,
          };
        });

        return withFallback(attempts, "Address lookup failed.");
      },

      async fetchAddressDelta(address, knownTxids) {
        const generation = getDataGeneration();
        const normalizedAddress = await requireValidMainnetBitcoinAddress(address);
        requireCurrentGeneration(generation);
        const attempts = ADDRESS_API_PROVIDERS.map((provider) => async () => {
          const bundle = await fetchAddressDeltaFromProvider(provider, normalizedAddress, knownTxids);
          return {
            provider: provider.name,
            bundle,
          };
        });

        return withFallback(attempts, "Incremental address lookup failed.");
      },

      async fetchTransactionDetails(txid) {
        const normalizedTxid = requireValidTransactionId(txid);
        const attempts = ADDRESS_API_PROVIDERS.map((provider) => async () => {
          const transaction = await fetchTransactionFromProvider(provider, normalizedTxid);
          const details = buildTransactionTechnicalDetails(transaction);
          if (!details) {
            throw createApiError("Transaction detail response was incomplete.");
          }
          return {
            provider: provider.name,
            details,
          };
        });

        return withFallback(attempts, "Transaction detail lookup failed.");
      },

      async fetchCurrentPriceUsd() {
        return fetchCurrentPriceQuote();
      },

      async fetchFiatExchangeRates() {
        return fetchFiatExchangeRates();
      },

      async fetchMarketData(startTimestamp, endTimestamp, displayFiatCurrency = "USD") {
        const generation = getDataGeneration();
        let currentPrice = null;
        let currentPriceError = null;
        let fiatExchangeRates = createDefaultFiatExchangeRates();
        const [currentPriceResult, fiatExchangeRatesResult, displayFiatMarketResult] =
          await Promise.allSettled([
          fetchCurrentPriceQuote(),
          fetchFiatExchangeRates(),
          fetchDirectFiatMarketData(displayFiatCurrency, startTimestamp, endTimestamp),
        ]);
        requireCurrentGeneration(generation);
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

        requireCurrentGeneration(generation);
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

        requireCurrentGeneration(generation);
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
          priceStale: currentPriceResult.status !== "fulfilled",
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
              {
                providerName: "Coinbase Exchange",
                validate: validateTickerPayload,
              }
            );
            return { provider: "Coinbase Exchange", price: Number(response.price) };
          },
          async () => {
            const response = await fetchJson(
              `https://api.coinbase.com/v2/prices/${encodeURIComponent(productId)}/spot`,
              {
                providerName: "Coinbase Spot",
                validate: validateSpotPayload,
              }
            );
            return { provider: "Coinbase Spot", price: Number(response.data.amount) };
          },
          async () => {
            const response = await fetchJson(
              "https://api.coinbase.com/v2/exchange-rates?currency=BTC",
              {
                providerName: "Coinbase Rates",
                validate: validateRatesPayload,
              }
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
        validate: validateRatesPayload,
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
    // (with capped concurrency during refresh) expose multiple addresses in a short
    // window, which strengthens the correlation. Users concerned about this should
    // use Tor or a VPN (see FAQ).
    async function fetchAddressSummaryFromProvider(provider, address) {
      const encoded = encodeURIComponent(address);
      return fetchJson(`${provider.baseUrl}/address/${encoded}`, {
        providerName: provider.name,
        validate: (payload) => validateAddressSummaryPayload(payload, address),
      });
    }

    // Privacy: fetches full transaction history for an address. Same IP-correlation
    // risk as fetchAddressSummaryFromProvider above.
    async function fetchAddressBundleFromProvider(provider, address, startTimestamp) {
      const generation = getDataGeneration();
      const encoded = encodeURIComponent(address);
      const summary = await fetchJson(`${provider.baseUrl}/address/${encoded}`, {
        providerName: provider.name,
        validate: (payload) => validateAddressSummaryPayload(payload, address),
      });
      requireCurrentGeneration(generation);
      const txResult = await fetchAddressTransactions(provider, address, startTimestamp);

      return {
        summary,
        transactions: txResult.transactions,
        truncated: txResult.truncated,
      };
    }

    async function fetchAddressDeltaFromProvider(provider, address, knownTxids) {
      const generation = getDataGeneration();
      const encoded = encodeURIComponent(address);
      const summary = await fetchJson(`${provider.baseUrl}/address/${encoded}`, {
        providerName: provider.name,
        validate: (payload) => validateAddressSummaryPayload(payload, address),
      });
      requireCurrentGeneration(generation);
      const txResult = await fetchAddressTransactionsUntilKnown(provider, address, knownTxids);

      return {
        summary,
        transactions: txResult.transactions,
        truncated: txResult.truncated,
        overlapFound: txResult.overlapFound,
      };
    }

    async function fetchTransactionFromProvider(provider, txid) {
      const encoded = encodeURIComponent(txid);
      return fetchJson(`${provider.baseUrl}/tx/${encoded}`, {
        providerName: provider.name,
        validate: (payload) => validateTransactionPayload(payload, txid),
        maxBytes: MAX_EXPLORER_TRANSACTION_RESPONSE_BYTES,
      });
    }

    async function fetchAddressTransactions(provider, address, startTimestamp) {
      const generation = getDataGeneration();
      const encoded = encodeURIComponent(address);
      const firstPage = await fetchJson(`${provider.baseUrl}/address/${encoded}/txs`, {
        providerName: provider.name,
        validate: validateTransactionListPayload,
        maxBytes: MAX_EXPLORER_TRANSACTION_RESPONSE_BYTES,
      });
      const collected = [];
      const seen = new Set();

      const appendTransactions = (transactions) => {
        transactions.forEach((tx) => {
          if (collected.length >= MAX_TRANSACTIONS_PER_ADDRESS) {
            return;
          }
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
      while (
        lastSeen &&
        oldestConfirmedTime > startTimestamp / 1000 &&
        pageCount < MAX_TRANSACTION_PAGES &&
        collected.length < MAX_TRANSACTIONS_PER_ADDRESS
      ) {
        requireCurrentGeneration(generation);
        const nextPage = await fetchJson(`${provider.baseUrl}/address/${encoded}/txs/chain/${lastSeen}`, {
          providerName: provider.name,
          validate: validateTransactionListPayload,
          maxBytes: MAX_EXPLORER_TRANSACTION_RESPONSE_BYTES,
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
        truncated: Boolean(
          lastSeen &&
            oldestConfirmedTime > startTimestamp / 1000 &&
            (pageCount >= MAX_TRANSACTION_PAGES || collected.length >= MAX_TRANSACTIONS_PER_ADDRESS)
        ),
      };
    }

    async function fetchAddressTransactionsUntilKnown(provider, address, knownTxids) {
      const generation = getDataGeneration();
      const encoded = encodeURIComponent(address);
      const known = knownTxids instanceof Set ? knownTxids : new Set();
      const collected = [];
      const seen = new Set();
      let overlapFound = false;
      const appendTransactions = (transactions) => {
        transactions.forEach((tx) => {
          if (known.has(tx.txid)) {
            overlapFound = true;
            return;
          }
          if (collected.length >= MAX_TRANSACTIONS_PER_ADDRESS || seen.has(tx.txid)) {
            return;
          }
          seen.add(tx.txid);
          collected.push(tx);
        });
      };

      const firstPage = await fetchJson(`${provider.baseUrl}/address/${encoded}/txs`, {
        providerName: provider.name,
        validate: validateTransactionListPayload,
        maxBytes: MAX_EXPLORER_TRANSACTION_RESPONSE_BYTES,
      });
      appendTransactions(firstPage);

      const confirmedOnly = firstPage.filter((tx) => tx.status?.confirmed);
      let lastSeen = confirmedOnly.at(-1)?.txid || null;
      let pageCount = 0;
      while (
        lastSeen &&
        !overlapFound &&
        pageCount < MAX_TRANSACTION_PAGES &&
        collected.length < MAX_TRANSACTIONS_PER_ADDRESS
      ) {
        requireCurrentGeneration(generation);
        const nextPage = await fetchJson(`${provider.baseUrl}/address/${encoded}/txs/chain/${lastSeen}`, {
          providerName: provider.name,
          validate: validateTransactionListPayload,
          maxBytes: MAX_EXPLORER_TRANSACTION_RESPONSE_BYTES,
        });
        if (!nextPage.length) {
          lastSeen = null;
          break;
        }

        appendTransactions(nextPage);
        lastSeen = nextPage.at(-1)?.txid || null;
        pageCount += 1;
      }

      return {
        transactions: collected,
        overlapFound,
        truncated: Boolean(
          !overlapFound &&
            lastSeen &&
            (pageCount >= MAX_TRANSACTION_PAGES || collected.length >= MAX_TRANSACTIONS_PER_ADDRESS)
        ),
      };
    }

    async function fetchHistoricalPriceSeries(startTimestamp, endTimestamp) {
      return fetchProductHistoricalPriceSeries("BTC-USD", startTimestamp, endTimestamp);
    }

    async function fetchProductHistoricalPriceSeries(productId, startTimestamp, endTimestamp) {
      const generation = getDataGeneration();
      const requests = buildCandleRequests(startTimestamp, endTimestamp, 295);
      const candleResponses = await allSettledWithConcurrency(
        requests, MAX_EXPLORER_CONCURRENCY, (request) =>
          fetchJson(
            `https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}/candles?granularity=86400&start=${encodeURIComponent(
              new Date(request.start).toISOString()
            )}&end=${encodeURIComponent(new Date(request.end).toISOString())}`,
            {
              providerName: "Coinbase Exchange",
              validate: validateCandlesPayload,
            }
          )
      );

      requireCurrentGeneration(generation);
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

      return summarizePriceHistory(closeByDay, startTimestamp, endTimestamp);
    }

    async function fetchIntradayPriceSeries(startTimestamp, endTimestamp, fallbackPrice) {
      return fetchProductIntradayPriceSeries("BTC-USD", startTimestamp, endTimestamp, fallbackPrice);
    }

    async function fetchProductIntradayPriceSeries(productId, startTimestamp, endTimestamp, fallbackPrice) {
      const response = await fetchJson(
        `https://api.exchange.coinbase.com/products/${encodeURIComponent(productId)}/candles?granularity=3600&start=${encodeURIComponent(
          new Date(startTimestamp).toISOString()
        )}&end=${encodeURIComponent(new Date(endTimestamp).toISOString())}`,
        {
          providerName: "Coinbase Exchange",
          validate: validateCandlesPayload,
        }
      );

      const closeByHour = new Map();
      response.forEach((candle) => {
        closeByHour.set(toHourKey(candle[0] * 1000), Number(candle[4]));
      });

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
      const generation = getDataGeneration();
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

      requireCurrentGeneration(generation);
      let priceHistory = new Map();
      try {
        const historyResult = await fetchProductHistoricalPriceSeries(productId, startTimestamp, endTimestamp);
        priceHistory = historyResult.series;
      } catch (error) {
        priceHistory = new Map();
      }

      requireCurrentGeneration(generation);
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

      requireCurrentGeneration(generation);
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
      while (cursor <= endTimestamp) {
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

    async function allSettledWithConcurrency(items, maxConcurrent, worker) {
      const generation = getDataGeneration();
      const source = Array.isArray(items) ? items : [];
      const results = new Array(source.length);
      let nextIndex = 0;
      const workerCount = Math.min(Math.max(1, maxConcurrent), source.length);

      async function runWorker() {
        while (nextIndex < source.length) {
          requireCurrentGeneration(generation);
          const index = nextIndex;
          nextIndex += 1;
          try {
            results[index] = {
              status: "fulfilled",
              value: await worker(source[index], index),
            };
          } catch (error) {
            results[index] = {
              status: "rejected",
              reason: error,
            };
          }
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
      requireCurrentGeneration(generation);
      return results;
    }

    async function requireValidMainnetBitcoinAddress(address) {
      const normalized = normalizeBitcoinAddress(address);
      if (!(await getValidationLayer().isValidMainnetBitcoinAddress(normalized))) {
        throw createApiError("Skipped invalid stored Bitcoin address.");
      }
      return normalized;
    }

    function requireValidTransactionId(value) {
      if (!isValidTxid(value)) {
        throw createApiError("Invalid transaction id.");
      }
      return value;
    }

    function validateTickerPayload(payload) {
      if (!payload || !Number.isFinite(Number(payload.price)) || Number(payload.price) <= 0) {
        throw new Error("Invalid price ticker response.");
      }
    }

    function validateSpotPayload(payload) {
      if (!payload?.data || !Number.isFinite(Number(payload.data.amount)) || Number(payload.data.amount) <= 0) {
        throw new Error("Invalid spot price response.");
      }
    }

    function validateRatesPayload(payload) {
      if (!payload?.data?.rates || !Number.isFinite(Number(payload.data.rates.USD)) || Number(payload.data.rates.USD) <= 0) {
        throw new Error("Invalid exchange-rate response.");
      }
    }

    const providerCooldowns = new Map();

    function getRetryAt(value, now = Date.now()) {
      // RFC 9110 section 10.2.3: delay-seconds or HTTP-date. CORS may hide this header.
      if (typeof value === "string" && /^\d+$/.test(value.trim())) {
        const milliseconds = Number(value.trim()) * 1000;
        if (Number.isSafeInteger(milliseconds) && milliseconds <= 8.64e15 - now) return now + milliseconds;
      }
      const date = typeof value === "string" && /[a-z]/i.test(value) ? Date.parse(value) : NaN;
      return Number.isFinite(date) ? Math.max(now, date) : now + 60_000;
    }

    function cooldownError(providerName, url, retryAt) {
      const error = createApiError(`Rate limited. Retry after ${new Date(retryAt).toLocaleTimeString()}.`, {
        status: 429, providerName, url,
      });
      error.retryAt = retryAt;
      return error;
    }

    async function fetchJson(url, { providerName = "", validate = null, maxBytes = MAX_API_RESPONSE_BYTES } = {}) {
      const generation = getDataGeneration();
      const origin = new URL(url).origin;
      const retryAt = providerCooldowns.get(origin) || 0;
      requireCurrentGeneration(generation);
      // Keep long waits out of the UI. Fallback providers may proceed; this origin stays paused.
      if (retryAt > Date.now()) throw cooldownError(providerName, url, retryAt);
      const controller = new AbortController();
      getActiveRequests().add(controller);
      let timeout;
      let timedOut = false;
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          requireCurrentGeneration(generation);
          timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
          const response = await fetch(url, {
            headers: { Accept: "application/json" },
            mode: "cors", credentials: "omit", redirect: "error", cache: "no-store",
            referrerPolicy: "no-referrer", signal: controller.signal,
          });
          requireCurrentGeneration(generation);
          if (!response.ok) {
            await response.body?.cancel();
            if (response.status === 429 || (response.status === 503 && response.headers.get("Retry-After"))) {
              const nextRetryAt = Math.max(providerCooldowns.get(origin) || 0, getRetryAt(response.headers.get("Retry-After")));
              providerCooldowns.set(origin, nextRetryAt);
              const delay = Math.max(0, nextRetryAt - Date.now());
              if (attempt === 0 && delay <= 2000) {
                window.clearTimeout(timeout);
                await waitForRetry(delay, controller.signal);
                requireCurrentGeneration(generation);
                // Another in-flight request may have extended the shared cooldown.
                if ((providerCooldowns.get(origin) || 0) > Date.now()) {
                  throw cooldownError(providerName, url, providerCooldowns.get(origin));
                }
                continue;
              }
              throw cooldownError(providerName, url, nextRetryAt);
            }
            throw createApiError(`${response.status} ${response.statusText}`.trim(), { status: response.status, providerName, url });
          }
          const payload = await readJsonResponse(response, maxBytes);
          requireCurrentGeneration(generation);
          if (typeof validate === "function") validate(payload);
          return payload;
        }
      } catch (error) {
        requireCurrentGeneration(generation);
        if (timedOut) {
          const timeoutError = createApiError("Request timed out.", { providerName, url });
          timeoutError.isTimeout = true;
          throw timeoutError;
        }
        if (error?.name === "AbortError") throw error;
        throw annotateApiError(error, { providerName, url });
      } finally {
        window.clearTimeout(timeout);
        getActiveRequests().delete(controller);
      }
    }

    function waitForRetry(delay, signal) {
      return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
        const abort = () => {
          window.clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        };
        const timer = window.setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, delay);
        signal.addEventListener("abort", abort, { once: true });
      });
    }

    async function withFallback(attempts, finalMessage) {
      const generation = getDataGeneration();
      const errors = [];
      for (const attempt of attempts) {
        requireCurrentGeneration(generation);
        try {
          const result = await attempt();
          requireCurrentGeneration(generation);
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
          requireCurrentGeneration(generation);
          errors.push(annotateApiError(error));
        }
      }

      const finalError = new Error(buildApiFailureMessage(finalMessage, errors), { cause: new AggregateError(errors, finalMessage) });
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
      if (errors.length && errors.every((error) => error.isRateLimit)) {
        return "Public data services are busy. Try again shortly.";
      }
      if (errors.length && errors.every((error) => error.isTimeout || error.name === "AbortError")) {
        return "Data requests timed out. Click Refresh to try again.";
      }
      return `${finalMessage} Click Refresh to try again.`.trim();
    }

    function getProviderDisplayName(providerName) {
      if (providerName === "Mempool") {
        return "mempool.space";
      }
      return providerName || "";
    }


    return {
      APILayer,
      fetchCurrentProductQuote,
      fetchProductHistoricalPriceSeries,
      getHistoryStartTimestampFromAddressResults,
      allSettledWithConcurrency,
      getRetryAt,
      fetchJson,
      withFallback,
      toApiWarning
    };
  }
  root.BITKIT_WATCH_API = { create };
  if (typeof module === "object" && module.exports) module.exports = { create };
})(globalThis);
