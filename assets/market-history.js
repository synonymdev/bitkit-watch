/* Shared browser / snapshot-builder price coverage. Never invent historical prices. */
((root) => {
  "use strict";
  const DAY_MS = 86_400_000;
  function summarizePriceHistory(prices, startTimestamp, endTimestamp) {
    const series = new Map();
    let missingDays = 0;
    const start = Math.floor(startTimestamp / DAY_MS) * DAY_MS;
    if (!Number.isFinite(start) || !Number.isFinite(endTimestamp) || endTimestamp < start ||
        (endTimestamp - start) / DAY_MS > 25_000) throw new Error("Unsupported price history range.");
    for (let time = start; time <= endTimestamp; time += DAY_MS) {
      const key = new Date(time).toISOString().slice(0, 10);
      const price = prices.get(key);
      if (Number.isFinite(price) && price > 0) series.set(key, price);
      else missingDays += 1;
    }
    return { series, missingDays };
  }
  const api = { summarizePriceHistory };
  root.BITKIT_WATCH_MARKET_HISTORY = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
