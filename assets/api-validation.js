/* Shared by the browser and the snapshot builder. No third-party dependencies. */
(() => {
  "use strict";

  const MAX_MONEY_SATS = 21_000_000 * 100_000_000;
  const GENESIS_TIMESTAMP = Date.UTC(2009, 0, 3);

  function normalizeBitcoinAddress(value) {
    const address = typeof value === "string" ? value.trim() : "";
    // Only Bech32 is case-insensitive. Preserve mixed case so validation rejects it.
    return /^bc1/i.test(address) && address === address.toUpperCase()
      ? address.toLowerCase()
      : address;
  }

  function isSatoshiAmount(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY_SATS;
  }

  function isTimestamp(value) {
    return Number.isSafeInteger(value) && value >= GENESIS_TIMESTAMP && value <= Date.now() + 2 * 60 * 60 * 1000;
  }

  function isValidTxid(value) {
    return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
  }

  function validateAddressSummary(payload, expectedAddress) {
    for (const key of ["chain_stats", "mempool_stats"]) {
      const stats = payload?.[key];
      if (!stats || ![stats.funded_txo_sum, stats.spent_txo_sum].every(
        (value) => Number.isSafeInteger(value) && value >= 0
      )) {
        throw new Error("Invalid address summary response.");
      }
    }
    const balance = payload.chain_stats.funded_txo_sum - payload.chain_stats.spent_txo_sum +
      payload.mempool_stats.funded_txo_sum - payload.mempool_stats.spent_txo_sum;
    if (!isSatoshiAmount(balance) || (expectedAddress &&
      normalizeBitcoinAddress(payload.address) !== normalizeBitcoinAddress(expectedAddress))) {
      throw new Error("Invalid address summary response.");
    }
  }

  function validateTransaction(payload, expectedTxid) {
    if (!payload || !isValidTxid(payload.txid) ||
      (expectedTxid && payload.txid.toLowerCase() !== expectedTxid.toLowerCase()) ||
      !Array.isArray(payload.vin) || !payload.vin.length ||
      !Array.isArray(payload.vout) || !payload.vout.length ||
      typeof payload.status?.confirmed !== "boolean" ||
      (payload.status.confirmed && (!Number.isSafeInteger(payload.status.block_time) ||
        !isTimestamp(payload.status.block_time * 1000))) ||
      (payload.fee !== undefined && !isSatoshiAmount(payload.fee))) {
      throw new Error("Invalid transaction response.");
    }
    const validateOutput = (output) => {
      if (!output || !isSatoshiAmount(output.value) ||
        (output.scriptpubkey_address !== undefined &&
          (typeof output.scriptpubkey_address !== "string" || output.scriptpubkey_address.length > 90))) {
        throw new Error("Invalid transaction output.");
      }
    };
    payload.vout.forEach(validateOutput);
    payload.vin.forEach((input) => {
      if (!input || typeof input !== "object") throw new Error("Invalid transaction input.");
      if (input.prevout != null) validateOutput(input.prevout);
      else if (input.is_coinbase !== true) throw new Error("Missing transaction input output.");
    });
    for (const outputs of [payload.vout, payload.vin.map((input) => input.prevout).filter(Boolean)]) {
      if (!isSatoshiAmount(outputs.reduce((sum, output) => sum + output.value, 0))) {
        throw new Error("Invalid transaction total.");
      }
    }
  }

  function validateTransactionList(payload) {
    if (!Array.isArray(payload) || payload.length > 1000) throw new Error("Invalid transaction list response.");
    payload.forEach((transaction) => validateTransaction(transaction));
  }

  function validateCandles(payload) {
    if (!Array.isArray(payload) || payload.length > 300) throw new Error("Invalid candle response.");
    for (const candle of payload) {
      if (!Array.isArray(candle) || candle.length < 6 || !Number.isSafeInteger(candle[0]) || !isTimestamp(candle[0] * 1000) ||
        !candle.slice(1, 5).every((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ||
        !Number.isFinite(candle[5]) || candle[5] < 0) {
        throw new Error("Invalid candle response.");
      }
    }
  }

  async function readJsonResponse(response, maxBytes) {
    const contentType = response.headers.get("content-type") || "";
    if (!/^application\/(?:[\w.-]+\+)?json\s*(?:;|$)/i.test(contentType)) {
      await response.body?.cancel();
      throw new Error("API returned a non-JSON response.");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel();
      throw new Error("API response exceeded the supported size.");
    }
    if (!response.body?.getReader) throw new Error("Streaming API responses are required.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let receivedBytes = 0;
    let text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > maxBytes) throw new Error("API response exceeded the supported size.");
        text += decoder.decode(value, { stream: true });
      }
      return JSON.parse(text + decoder.decode());
    } finally {
      try { await reader.cancel(); } catch { /* Preserve the original read error. */ }
      reader.releaseLock();
    }
  }

  const api = Object.freeze({ normalizeBitcoinAddress, isSatoshiAmount, isTimestamp, isValidTxid,
    validateAddressSummary, validateTransaction, validateTransactionList, validateCandles, readJsonResponse });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.BITKIT_WATCH_API_VALIDATION = api;
})();
