#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const ONE_YEAR_DAYS = 365;
const MAX_TRANSACTION_PAGES = 18;
const MAX_TRANSACTIONS_PER_ADDRESS = 1000;
const MAX_EXPLORER_CONCURRENCY = 3;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const OUTPUT_FILE = process.argv[2];
const ADDRESSES = [
  "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S",
  "12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX",
  "1HLoD9E4SDFFPDiYfNYnkBLQ85Y51J3Zb1",
  "1FvzCLoTPGANNjWoUo6jUGuAG3wg1w4YjR",
];
const EXPLORERS = [
  { name: "Mempool", baseUrl: "https://mempool.space/api" },
  { name: "Blockstream", baseUrl: "https://blockstream.info/api" },
];

if (!OUTPUT_FILE) {
  throw new Error("Usage: node scripts/build-satoshi-demo-snapshot.mjs OUTPUT_FILE");
}

const endTimestamp = Date.now();
const [currentPriceUsd, fiatExchangeRates, bundles] = await Promise.all([
  fetchCurrentPriceUsd(),
  fetchFiatExchangeRates(),
  mapWithConcurrency(ADDRESSES, MAX_EXPLORER_CONCURRENCY, fetchAddressBundle),
]);
const timelineStart =
  getOldestTransactionTimestamp(bundles) || startOfUtcDay(endTimestamp - (ONE_YEAR_DAYS - 1) * DAY_MS);
const intradayStart = startOfUtcHour(endTimestamp - 23 * HOUR_MS);
const [priceHistory, intradayPriceHistory] = await Promise.all([
  fetchDailyPriceHistory(timelineStart, endTimestamp),
  fetchIntradayPriceHistory(intradayStart, endTimestamp, currentPriceUsd),
]);
const addressSnapshots = bundles.map(({ address, provider, summary, transactions, truncated }) => {
  const balanceSats = getBalanceSats(summary);
  return {
    address,
    provider,
    balanceSats,
    approximate: truncated,
    detailScope: "ALL",
    txEvents: transactions
      .map((transaction) => normalizeTransactionEvent(transaction, address))
      .filter(Boolean),
  };
});
const balancesByAddress = Object.fromEntries(
  addressSnapshots.map((snapshot) => [snapshot.address, snapshot.balanceSats])
);
const runtimeCache = {
  historyScope: "ALL",
  currentPriceUsd,
  fiatExchangeRates: [...fiatExchangeRates.entries()],
  priceHistory: [...priceHistory.entries()],
  intradayPriceHistory: [...intradayPriceHistory.entries()],
  historyAvailable: priceHistory.size > 0,
  historyMissingDays: countMissingDays(priceHistory, timelineStart, endTimestamp),
  approximationMode: addressSnapshots.some((snapshot) => snapshot.approximate),
  timelineStart,
  timelineEnd: endTimestamp,
  intradayStart,
  intradayEnd: endTimestamp,
  addressSnapshots,
};
const payload = {
  asOf: new Date(endTimestamp).toISOString().replace(".000Z", "Z"),
  currentPriceUsd,
  balancesByAddress,
  runtimeCache,
};
const source = `/*
  Bundled Satoshi demo snapshot
  This ships with the prototype so the demo wallet can bootstrap quickly for any user,
  even after local storage has been cleared.
*/

globalThis.BITKIT_VAULT_SATOSHI_SNAPSHOT = Object.freeze(${JSON.stringify(payload, null, 2)});
`;

await writeFile(OUTPUT_FILE, source, "utf8");
console.log(`Wrote ${OUTPUT_FILE}`);
console.log(
  `Bundled ${addressSnapshots.length} addresses, ${addressSnapshots.reduce(
    (total, snapshot) => total + snapshot.txEvents.length,
    0
  )} normalized transactions, and ${priceHistory.size} daily price points.`
);

async function fetchAddressBundle(address) {
  let lastError = null;
  for (const provider of EXPLORERS) {
    try {
      const encoded = encodeURIComponent(address);
      const summary = await fetchJson(`${provider.baseUrl}/address/${encoded}`, validateAddressSummary);
      const { transactions, truncated } = await fetchAddressTransactions(provider, address);
      return {
        address,
        provider: provider.name,
        summary,
        transactions,
        truncated,
      };
    } catch (error) {
      lastError = error;
      console.warn(`${provider.name} failed for ${address}: ${error.message}`);
    }
  }

  throw new Error(`All explorers failed for ${address}. ${lastError?.message || ""}`.trim());
}

async function fetchAddressTransactions(provider, address) {
  const encoded = encodeURIComponent(address);
  const firstPage = await fetchJson(
    `${provider.baseUrl}/address/${encoded}/txs`,
    validateTransactionList
  );
  const collected = [];
  const seen = new Set();
  const appendTransactions = (transactions) => {
    transactions.forEach((transaction) => {
      if (collected.length >= MAX_TRANSACTIONS_PER_ADDRESS || seen.has(transaction.txid)) {
        return;
      }
      seen.add(transaction.txid);
      collected.push(transaction);
    });
  };

  appendTransactions(firstPage);
  const confirmedOnly = firstPage.filter((transaction) => transaction.status?.confirmed);
  let lastSeen = confirmedOnly.at(-1)?.txid || null;
  let pageCount = 0;
  while (
    lastSeen &&
    pageCount < MAX_TRANSACTION_PAGES &&
    collected.length < MAX_TRANSACTIONS_PER_ADDRESS
  ) {
    const nextPage = await fetchJson(
      `${provider.baseUrl}/address/${encoded}/txs/chain/${encodeURIComponent(lastSeen)}`,
      validateTransactionList
    );
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
    truncated: Boolean(
      lastSeen &&
        (pageCount >= MAX_TRANSACTION_PAGES || collected.length >= MAX_TRANSACTIONS_PER_ADDRESS)
    ),
  };
}

async function fetchCurrentPriceUsd() {
  const response = await fetchJson(
    "https://api.coinbase.com/v2/prices/BTC-USD/spot",
    (payload) => {
      const value = Number(payload?.data?.amount);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Invalid Coinbase spot response.");
      }
    }
  );
  return Number(response.data.amount);
}

async function fetchFiatExchangeRates() {
  const response = await fetchJson(
    "https://api.coinbase.com/v2/exchange-rates?currency=BTC",
    (payload) => {
      const usd = Number(payload?.data?.rates?.USD);
      if (!Number.isFinite(usd) || usd <= 0) {
        throw new Error("Invalid Coinbase rates response.");
      }
    }
  );
  const supportedCurrencies = ["USD", "EUR", "JPY", "GBP", "CNY"];
  const usdPerBtc = Number(response.data.rates.USD);
  return new Map(
    supportedCurrencies
      .map((currency) => {
        const value = currency === "USD" ? 1 : Number(response.data.rates[currency]) / usdPerBtc;
        return [currency, value];
      })
      .filter(([, value]) => Number.isFinite(value) && value > 0)
  );
}

async function fetchDailyPriceHistory(startTimestamp, endTimestamp) {
  const prices = new Map();
  for (const range of buildCandleRequests(startTimestamp, endTimestamp, 295)) {
    const candles = await fetchCoinbaseCandles(range.start, range.end, 86400);
    candles.forEach((candle) => {
      prices.set(toDateKey(candle[0] * 1000), Number(candle[4]));
    });
  }

  fillPriceHistory(prices, startTimestamp, endTimestamp, DAY_MS, startOfUtcDay, toDateKey);
  return prices;
}

async function fetchIntradayPriceHistory(startTimestamp, endTimestamp, fallbackPrice) {
  const prices = new Map();
  const candles = await fetchCoinbaseCandles(startTimestamp, endTimestamp, 3600);
  candles.forEach((candle) => {
    prices.set(toHourKey(candle[0] * 1000), Number(candle[4]));
  });

  fillPriceHistory(prices, startTimestamp, endTimestamp, HOUR_MS, startOfUtcHour, toHourKey, fallbackPrice);
  return prices;
}

async function fetchCoinbaseCandles(startTimestamp, endTimestamp, granularity) {
  return fetchJson(
    `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=${granularity}&start=${encodeURIComponent(
      new Date(startTimestamp).toISOString()
    )}&end=${encodeURIComponent(new Date(endTimestamp).toISOString())}`,
    (payload) => {
      if (!Array.isArray(payload)) {
        throw new Error("Invalid Coinbase candle response.");
      }
      payload.forEach((candle) => {
        if (!Array.isArray(candle) || candle.length < 5 || !Number.isFinite(Number(candle[4]))) {
          throw new Error("Invalid Coinbase candle response.");
        }
      });
    }
  );
}

async function fetchJson(url, validate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("json")) {
      throw new Error(`Expected JSON but received ${contentType || "an unknown content type"}.`);
    }

    const body = await readBoundedText(response, MAX_RESPONSE_BYTES);
    const payload = JSON.parse(body);
    validate(payload);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedText(response, maxBytes) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeds ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  chunks.forEach((chunk) => {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return new TextDecoder().decode(joined);
}

function validateAddressSummary(payload) {
  ["chain_stats", "mempool_stats"].forEach((key) => {
    const stats = payload?.[key];
    if (
      !stats ||
      !Number.isFinite(Number(stats.funded_txo_sum)) ||
      !Number.isFinite(Number(stats.spent_txo_sum))
    ) {
      throw new Error("Invalid explorer address summary.");
    }
  });
}

function validateTransactionList(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("Invalid explorer transaction list.");
  }
  payload.forEach((transaction) => {
    if (!transaction || typeof transaction.txid !== "string") {
      throw new Error("Invalid explorer transaction.");
    }
  });
}

function getBalanceSats(summary) {
  return (
    Number(summary.chain_stats.funded_txo_sum) -
    Number(summary.chain_stats.spent_txo_sum) +
    Number(summary.mempool_stats.funded_txo_sum) -
    Number(summary.mempool_stats.spent_txo_sum)
  );
}

function normalizeTransactionEvent(transaction, watchedAddress) {
  let receivedSats = 0;
  let sentSats = 0;
  (transaction.vout || []).forEach((output) => {
    if (output.scriptpubkey_address === watchedAddress) {
      receivedSats += Number(output.value || 0);
    }
  });
  (transaction.vin || []).forEach((input) => {
    if (input.prevout?.scriptpubkey_address === watchedAddress) {
      sentSats += Number(input.prevout.value || 0);
    }
  });
  const netSats = receivedSats - sentSats;
  if (!netSats && !sentSats && !receivedSats) {
    return null;
  }

  const feeSats = Number.isFinite(transaction.fee) ? Number(transaction.fee) : null;
  const vsize = Number(transaction.vsize);
  const weight = Number(transaction.weight);
  const feeRateSatVb =
    Number.isFinite(feeSats) && Number.isFinite(vsize) && vsize > 0
      ? feeSats / vsize
      : Number.isFinite(feeSats) && Number.isFinite(weight) && weight > 0
        ? feeSats / (weight / 4)
        : null;
  return {
    txid: transaction.txid,
    timestamp: transaction.status?.block_time ? transaction.status.block_time * 1000 : Date.now(),
    confirmed: Boolean(transaction.status?.confirmed),
    receivedSats,
    sentSats,
    netSats,
    feeSats,
    feeRateSatVb,
  };
}

function getOldestTransactionTimestamp(bundles) {
  const timestamps = bundles.flatMap((bundle) =>
    bundle.transactions
      .map((transaction) => Number(transaction.status?.block_time || 0) * 1000)
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
  );
  return timestamps.length ? startOfUtcDay(Math.min(...timestamps)) : null;
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

async function mapWithConcurrency(items, maxConcurrent, worker) {
  const source = Array.isArray(items) ? items : [];
  const results = new Array(source.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, maxConcurrent), source.length);
  async function runWorker() {
    while (nextIndex < source.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(source[index], index);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

function fillPriceHistory(prices, startTimestamp, endTimestamp, stepMs, alignTime, keyForTimestamp, fallbackPrice = null) {
  const firstKnown = [...prices.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([, price]) => price)
    .find(Number.isFinite);
  let lastKnown = null;
  for (let cursor = alignTime(startTimestamp); cursor <= endTimestamp; cursor += stepMs) {
    const key = keyForTimestamp(cursor);
    if (prices.has(key)) {
      lastKnown = prices.get(key);
    } else if (Number.isFinite(lastKnown)) {
      prices.set(key, lastKnown);
    } else if (Number.isFinite(firstKnown)) {
      prices.set(key, firstKnown);
    } else if (Number.isFinite(fallbackPrice)) {
      prices.set(key, fallbackPrice);
    }
  }
}

function countMissingDays(prices, startTimestamp, endTimestamp) {
  let missingDays = 0;
  for (let cursor = startOfUtcDay(startTimestamp); cursor <= endTimestamp; cursor += DAY_MS) {
    if (!prices.has(toDateKey(cursor))) {
      missingDays += 1;
    }
  }
  return missingDays;
}

function startOfUtcDay(timestamp) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
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

function toDateKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function toHourKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 13);
}
