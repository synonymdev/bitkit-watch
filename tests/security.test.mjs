import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import validation from "../assets/api-validation.js";

const GENESIS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const SEGWIT = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const TXID = "a".repeat(64);
const TIMESTAMP = 1_700_000_000_000;
const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const snapshotSource = readFileSync(new URL("../assets/satoshi-demo-snapshot.js", import.meta.url), "utf8");

function harness({ stored = {}, fetch: fetchImpl = async () => { throw new Error("Unexpected network request"); }, crypto = webcrypto, demo = false } = {}) {
  const storage = new Map(Object.entries(stored));
  const context = vm.createContext({
    BITKIT_WATCH_API_VALIDATION: validation, crypto, Blob, TextDecoder, AbortController, DOMException,
    Map, Set, Date, Promise, console, URL,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    document: { addEventListener() {} },
    window: { setTimeout, clearTimeout, confirm: () => true },
    fetch: fetchImpl,
  });
  for (const name of ["market-history", "storage", "api", "portfolio", "charts"]) {
    vm.runInContext(readFileSync(new URL(`../assets/${name}.js`, import.meta.url), "utf8"), context);
  }
  if (demo) vm.runInContext(snapshotSource, context);
  // Test-only exports: production stays encapsulated and has no diagnostic API.
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    globalThis.app = {
      ValidationLayer, APILayer, StorageLayer, normalizeTransactionEvent, normalizeImportedState,
      normalizeRuntimeCache, normalizeCachedTxEvents, normalizeCachedBalanceTimeline,
      buildDailyBalanceTimeline, buildRuntimeCacheCandidates, classifyAddressBatchDuplicates,
      fetchJson, withFallback, allSettledWithConcurrency, refreshScopedEntries,
      getRetryAt, PortfolioLayer, getSeriesGrowthDescriptor, createSparklineScene,
      getDisplayFiatValueFromBtc, fetchProductHistoricalPriceSeries, fetchMarketDataWithCache,
      refreshVault, hydrateAddressAfterAdd, hydrateAddressDetail, loadTransactionTechnicalDetailsIfNeeded,
      clearVault, removeAddress, removeWallet, cancelPendingDataWork, handleStorageChange,
      parseAddressInput, buildWalletCard, buildAddressTagChips, escapeHtml,
      mergeAddressTransactionEvents, upsertAddressSnapshot, serializeRuntimeCache, combineSnapshotTimelines,
      hydrateBakedDemoRuntimeIfNeeded, hydrateRuntimeFromCache, updateBundledSatoshiDemoCache,
      getWalletView, getAddressView, getWalletSummaries, getCommonReliableDailyCoverage,
      get state() { return state; }, get runtime() { return runtime; },
      setState(value) { state = value; },
      setRuntime(value) { runtime = { ...createRuntimeState(), ...value }; },
      simulateRenderPersistence() { render = () => StorageLayer.saveState(state); },
      disableRendering() {
        render = () => {}; setHeaderStatus = () => {};
        clearAddressFeedback = () => {}; clearAddressTagFeedback = () => {};
        resetAddressTagForm = () => {}; syncViewRoute = () => {};
        hydrateBakedDemoRuntimeIfNeeded = () => {}; showAddressFeedback = () => {};
        applyRouteFromHash = () => {};
      }
    };
  })();`), context);
  return { app: context.app, context, storage };
}

function transaction(overrides = {}) {
  return { txid: TXID, vin: [{ is_coinbase: true, prevout: null }],
    vout: [{ scriptpubkey_address: SEGWIT, value: 12345 }],
    status: { confirmed: true, block_time: TIMESTAMP / 1000 }, fee: 0, ...overrides };
}
function summary(address = GENESIS) {
  return { address, chain_stats: { funded_txo_sum: 100, spent_txo_sum: 0 },
    mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 } };
}
function watchedState(app) {
  const next = app.state;
  next.addresses = [{ id: "private-address", address: SEGWIT, groupId: next.groups[0].id, tags: [] }];
  next.seededDemoWallets = ["satoshi-v1"];
  return next;
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("mainnet address checks cover Base58 and BIP 350 valid/invalid vectors", async () => {
  const { app } = harness();
  // https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki#test-vectors-for-v0-v16-native-segregated-witness-addresses
  for (const address of [GENESIS, "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", SEGWIT, SEGWIT.toUpperCase(),
    "BC1SW50QGDZ25J", "bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs",
    "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
    "bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y"]) {
    assert.equal(await app.ValidationLayer.isValidMainnetBitcoinAddress(address), true, address);
  }
  for (const address of [GENESIS.slice(0, -1) + "b", "bC" + SEGWIT.slice(2),
    "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd",
    "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh", "bc1pw5dgrnzv", "bc1gmk9yu",
    "BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P", "tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7"]) {
    assert.equal(await app.ValidationLayer.isValidMainnetBitcoinAddress(address), false, address);
  }
});

test("Base58 checksum verification fails closed without Web Crypto", async () => {
  assert.equal(await harness({ crypto: {} }).app.ValidationLayer.isValidMainnetBitcoinAddress(GENESIS), false);
});

test("secrets and invalid addresses never reach the network", async () => {
  const { app } = harness();
  for (const secret of ["abandon ".repeat(11) + "about", "a".repeat(64), "xprv" + "a".repeat(107)]) {
    assert.equal((await app.ValidationLayer.detectSensitiveBitcoinInput(secret, app.parseAddressInput(secret))).detected, true);
    await assert.rejects(app.APILayer.fetchAddressSummary(secret), /invalid stored Bitcoin address/);
  }
});

test("canonical SegWit input preserves Base58 case and rejects mixed case", async () => {
  const { app } = harness();
  assert.equal(app.parseAddressInput(SEGWIT.toUpperCase())[0], SEGWIT);
  assert.equal(validation.normalizeBitcoinAddress(GENESIS), GENESIS);
  const state = watchedState(app);
  state.addresses[0].address = GENESIS;
  assert.equal(app.classifyAddressBatchDuplicates([GENESIS.toLowerCase()]).existing.length, 0);
  const imported = app.normalizeImportedState({ ...state, addresses: [{ ...state.addresses[0], address: SEGWIT.toUpperCase() }] });
  assert.equal(imported.addresses[0].address, SEGWIT);
  const event = app.normalizeTransactionEvent(transaction(), SEGWIT.toUpperCase());
  assert.equal(event.receivedSats, 12345);
  assert.equal(event.netSats, 12345);
});

test("explorer summaries reject coerced, fractional, negative, unsafe and mismatched values", () => {
  validation.validateAddressSummary(summary(), GENESIS);
  for (const value of [null, "100", true, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
    const payload = summary(); payload.chain_stats.funded_txo_sum = value;
    assert.throws(() => validation.validateAddressSummary(payload, GENESIS));
  }
  assert.throws(() => validation.validateAddressSummary(summary(SEGWIT), GENESIS));
  const negative = summary(); negative.mempool_stats.spent_txo_sum = 101;
  assert.throws(() => validation.validateAddressSummary(negative));
});

test("transaction validation rejects malformed outputs, sums, status and txid substitution", () => {
  validation.validateTransaction(transaction(), TXID);
  validation.validateTransaction(transaction({ status: { confirmed: false } }));
  for (const changes of [
    { vout: [null] }, { vout: [{ value: "12345" }] }, { vout: [{ value: -1 }] },
    { vout: [{ value: 2_100_000_000_000_000 }, { value: 1 }] },
    { vin: [null] }, { vin: [{ prevout: null }] }, { status: { confirmed: "true" } },
    { status: { confirmed: true, block_time: 1e100 } }, { txid: "../escape" }, { fee: -1 },
  ]) assert.throws(() => validation.validateTransaction(transaction(changes)));
  assert.throws(() => validation.validateTransaction(transaction({ txid: "b".repeat(64) }), TXID));
});

test("candle validation rejects invalid timestamps, prices and oversized series", () => {
  validation.validateCandles([[TIMESTAMP / 1000, 1, 2, 1.5, 1.8, 10]]);
  for (const payload of [[[1e100, 1, 2, 1, 2, 10]], [[TIMESTAMP / 1000, 1, 2, 1, -1, 10]],
    [[TIMESTAMP / 1000, 1, 2, 1, null, 10]], Array(301).fill([])]) {
    assert.throws(() => validation.validateCandles(payload));
  }
});

test("JSON reader enforces streamed bytes, media type, UTF-8 and releases the stream", async () => {
  assert.deepEqual(await validation.readJsonResponse(new Response('{"ok":true}', {
    headers: { "Content-Type": "application/problem+json; charset=utf-8" },
  }), 100), { ok: true });
  await assert.rejects(validation.readJsonResponse(new Response("{}", { headers: { "Content-Type": "text/html" } }), 10), /non-JSON/);
  await assert.rejects(validation.readJsonResponse(new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": "100" } }), 10), /size/);
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('"' + "x".repeat(100))); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(validation.readJsonResponse(new Response(stream, { headers: { "Content-Type": "application/json" } }), 10), /size/);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
  await assert.rejects(validation.readJsonResponse(new Response(new Uint8Array([0xff]), {
    headers: { "Content-Type": "application/json" },
  }), 10));
});

test("requests omit credentials and referrers, bypass cache, and reject redirects", async () => {
  let options;
  const { app } = harness({ fetch: async (_, init) => { options = init; return Response.json({ ok: true }); } });
  await app.fetchJson("https://mempool.space/api/address/" + GENESIS);
  for (const [key, value] of Object.entries({ credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", redirect: "error" })) {
    assert.equal(options[key], value);
  }
});

test("clear data removes quarantine and prevents late requests from repopulating storage", async () => {
  const pending = deferred(); let requestSignal;
  const { app, storage } = harness({ stored: { "bitkit-vault-state-quarantine-v1": "private recovery data", "unrelated-key": "keep" },
    fetch: async (_, options) => { requestSignal = options.signal; return pending.promise; } });
  app.disableRendering();
  app.setState(watchedState(app));
  app.StorageLayer.saveState(app.state);
  const refresh = app.refreshVault({ reason: "manual", allowSkeleton: true });
  await tick();
  assert.ok(requestSignal);
  app.clearVault();
  assert.equal(requestSignal.aborted, true);
  assert.equal(storage.has("bitkit-vault-state-quarantine-v1"), false);
  assert.equal(storage.get("unrelated-key"), "keep");
  const afterClear = JSON.stringify([...storage]);
  pending.resolve(Response.json(summary(SEGWIT)));
  await refresh;
  assert.equal(JSON.stringify([...storage]), afterClear);
  assert.equal(app.runtime.addressSnapshots.length, 0);
  assert.equal(app.runtime.isRefreshing, false);
});

test("clear data reports failure when storage deletion is blocked", () => {
  const { app, context } = harness(); app.disableRendering();
  context.localStorage.removeItem = () => { throw new Error("blocked"); };
  app.clearVault();
  assert.equal(app.runtime.banner.tone, "warning");
  assert.match(app.runtime.banner.text, /could not be cleared/);
});

test("deleting the final address clears its cached history", () => {
  const { app, storage } = harness(); app.disableRendering();
  app.setState(watchedState(app));
  storage.set("bitkit-vault-runtime-cache-v1", "old private history");
  app.removeAddress("private-address");
  assert.equal(storage.has("bitkit-vault-runtime-cache-v1"), false);
  assert.equal(app.state.addresses.length, 0);
});

test("queued requests and provider fallbacks stop when wallet data is deleted", async () => {
  const { app } = harness(); const pending = deferred(); let calls = 0;
  const work = app.allSettledWithConcurrency([1, 2, 3], 1, async () => { calls++; await pending.promise; });
  app.cancelPendingDataWork(); pending.resolve();
  await assert.rejects(work, { name: "AbortError" }); assert.equal(calls, 1);
  const next = deferred(); calls = 0;
  const fallback = app.withFallback([async () => { calls++; await next.promise; throw new Error("failed"); }, async () => { calls++; }], "failed");
  app.cancelPendingDataWork(); next.resolve();
  await assert.rejects(fallback, { name: "AbortError" }); assert.equal(calls, 1);
});

test("corrupted cache cannot create unbounded timelines or invalid transactions", () => {
  const { app } = harness();
  assert.equal(app.buildDailyBalanceTimeline(0, [], -1e100, TIMESTAMP).length, 0);
  assert.equal(app.buildDailyBalanceTimeline(0, [], 0, 1e100).length, 0);
  assert.equal(app.combineSnapshotTimelines([], "balanceTimeline", new Map(), 0, 1e100).length, 0);
  assert.equal(app.normalizeCachedTxEvents([{ txid: TXID, timestamp: Infinity }]).length, 0);
  assert.equal(app.normalizeCachedBalanceTimeline([{ dateKey: "2023-01-01", timestamp: TIMESTAMP, balanceSats: "Infinity" }]).length, 0);
});

test("bundled demo history survives stricter cache normalization", () => {
  const { app, context } = harness(); vm.runInContext(snapshotSource, context);
  for (const snapshot of context.BITKIT_VAULT_SATOSHI_SNAPSHOT.runtimeCache.addressSnapshots) {
    assert.equal(app.normalizeCachedTxEvents(snapshot.txEvents).length, snapshot.txEvents.length);
  }
});

test("cache fallback serializes only the candidate needed for a successful write", () => {
  const { app } = harness(); let reads = 0;
  const entry = app.state.addresses[0];
  app.setRuntime({ addressSnapshots: [{ entry, balanceSats: 100, txEvents: [], balanceTimeline: [], hourlyBalanceTimeline: [] }] });
  Object.defineProperty(app.runtime.addressSnapshots[0], "provider", { get() { reads++; return "Test"; } });
  app.StorageLayer.saveRuntimeCache(app.runtime);
  assert.equal(reads, 1);
});

test("untrusted names and tags remain escaped in HTML templates", () => {
  const { app } = harness();
  const payload = '\"><img src=x onerror=alert(1)>';
  const tag = app.buildAddressTagChips([payload]);
  assert.ok(!tag.includes("<img")); assert.ok(tag.includes("&lt;img"));
  assert.ok(!app.buildWalletCard({ wallet: { id: payload, name: payload }, addressCount: 0, totalBtc: 0, totalUsd: 0 }).includes("<img"));
});


test("incremental refresh updates confirmed transactions and drops stale pending ones", () => {
  const { app } = harness();
  const cached = [
    app.normalizeTransactionEvent(transaction({ status: { confirmed: false } }), SEGWIT),
    app.normalizeTransactionEvent(transaction({ txid: "b".repeat(64), status: { confirmed: false } }), SEGWIT),
    app.normalizeTransactionEvent(transaction({ txid: "c".repeat(64) }), SEGWIT),
  ];
  const merged = app.mergeAddressTransactionEvents(cached, [transaction()], SEGWIT);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(event => event.txid === TXID).confirmed, true);
  assert.ok(!merged.some(event => event.txid === "b".repeat(64)));
});

test("refreshing an existing scope replaces its old transactions", () => {
  const { app } = harness(); const entry = app.state.addresses[0];
  const previous = { entry, detailScope: "ALL", txEvents: [{ txid: TXID }], balanceTimeline: [], hourlyBalanceTimeline: [] };
  app.setRuntime({ addressSnapshots: [previous] });
  const next = { ...previous, txEvents: [{ txid: "b".repeat(64) }] };
  app.upsertAddressSnapshot(next);
  assert.equal(app.runtime.addressSnapshots[0].txEvents[0].txid, "b".repeat(64));
});

test("quota fallback marks truncated cached history as approximate", () => {
  const { app } = harness(); const entry = app.state.addresses[0];
  app.setRuntime({ addressSnapshots: [{ entry, detailScope: "ALL", balanceSats: 0,
    txEvents: [app.normalizeTransactionEvent(transaction(), SEGWIT)], balanceTimeline: [], hourlyBalanceTimeline: [] }] });
  const cached = app.serializeRuntimeCache(app.runtime, { maxTxEventsPerSnapshot: 0 });
  assert.equal(cached.addressSnapshots[0].approximate, true);
  assert.equal(cached.addressSnapshots[0].detailScope, "SUMMARY");
  assert.equal(cached.addressSnapshots[0].txEvents.length, 0);
});

test("a deletion in another tab invalidates responses before its storage event arrives", async () => {
  const pending = deferred();
  const { app, storage } = harness({ fetch: async () => pending.promise });
  app.disableRendering(); app.setState(watchedState(app));
  app.StorageLayer.saveState(app.state);
  const work = app.refreshVault({ reason: "manual", allowSkeleton: true });
  await tick();
  // Simulate another tab publishing deletion before this tab receives an event.
  storage.set("bitkit-vault-data-epoch-v1", "another-tab-deleted-data");
  storage.delete("bitkit-vault-state-v1");
  pending.resolve(Response.json(summary(SEGWIT)));
  await work;
  assert.equal(storage.has("bitkit-vault-state-v1"), false);
  assert.equal(storage.has("bitkit-vault-runtime-cache-v1"), false);
  assert.equal(app.StorageLayer.saveState(app.state), false);
});


test("cross-tab synchronization cannot echo render-time state writes", () => {
  const { app, context, storage } = harness();
  app.disableRendering(); app.simulateRenderPersistence();
  app.setState(watchedState(app));
  app.StorageLayer.saveState(app.state);
  const replacement = { ...app.state, addresses: [] };
  storage.set("bitkit-vault-state-v1", JSON.stringify(replacement));
  const before = JSON.stringify([...storage]);
  app.handleStorageChange({ storageArea: context.localStorage, key: "bitkit-vault-state-v1" });
  assert.equal(app.state.addresses.length, 0);
  assert.equal(JSON.stringify([...storage]), before);
});

test("legacy uppercase SegWit history is discarded without losing the watchlist", () => {
  const { app, storage } = harness();
  const original = watchedState(app);
  original.addresses[0].address = SEGWIT.toUpperCase();
  const migrated = app.normalizeImportedState(original);
  storage.set("bitkit-vault-runtime-cache-v1", JSON.stringify({
    addressSnapshots: [{ entryId: "private-address", balanceSats: 12345, detailScope: "ALL", txEvents: [] }],
  }));
  assert.equal(app.StorageLayer.loadRuntimeCache(migrated), null);
  assert.equal(storage.has("bitkit-vault-runtime-cache-v1"), false);
  assert.equal(migrated.addresses[0].address, SEGWIT);
  assert.equal(migrated.addresses[0].id, "private-address");
});


test("all-time hydration starts market requests at known activity instead of 1970", async () => {
  const { app } = harness();
  app.APILayer.fetchAddressBundle = async () => ({ bundle: { transactions: [transaction()] } });
  let requestedStart;
  app.APILayer.fetchMarketData = async (start) => { requestedStart = start; throw new Error("market-stop"); };
  await assert.rejects(app.hydrateAddressDetail(app.state.addresses[0], "ALL"), /market-stop/);
  assert.equal(requestedStart, Date.UTC(2023, 10, 14));
});

test("missing historical prices stay unknown and growth never uses a future spot price", async () => {
  const day = 86_400_000;
  const start = Date.UTC(2020, 0, 1);
  const { app } = harness({ fetch: async () => Response.json([[ (start + 2 * day) / 1000, 6000, 8000, 7000, 7000, 1 ]]) });
  const result = await app.fetchProductHistoricalPriceSeries("BTC-USD", start, start + 4 * day);
  assert.equal(result.missingDays, 4);
  assert.equal(result.series.size, 1);
  assert.equal(result.series.get("2020-01-03"), 7000);
  assert.equal(result.series.has("2020-01-01"), false);
  app.setRuntime({ currentPriceUsd: 100_000 });
  assert.equal(app.getDisplayFiatValueFromBtc(1, { timestamp: start }), null);
  assert.equal(app.getSeriesGrowthDescriptor([null, 100, 200]), null);
  assert.equal(app.getSeriesGrowthDescriptor([100, null, 200]), null);
  const scene = app.createSparklineScene({ values: [null, 100, null, 200], timestamps: [1, 2, 3, 4], range: "ALL" });
  assert.equal(scene.points.length, 4);
  assert.equal(scene.points[0], null);
  assert.equal(scene.points[2], null);
  assert.equal(scene.values[0], null);
  assert.equal(scene.timestamps[3], 4);
  assert.ok(!scene.markup.includes("NaN"));
});

test("an empty price response reports the requested missing days, including single-day ranges", async () => {
  const { app } = harness({ fetch: async () => Response.json([]) });
  const start = Date.UTC(2020, 0, 1);
  assert.equal((await app.fetchProductHistoricalPriceSeries("BTC-USD", start, start)).missingDays, 1);
  assert.equal((await app.fetchProductHistoricalPriceSeries("BTC-USD", start, start + 4 * 86_400_000)).missingDays, 5);
});

test("legacy synthesized prices are invalidated without losing address balances or transactions", () => {
  const { app } = harness();
  const state = watchedState(app);
  const entry = state.addresses[0];
  const snapshot = app.PortfolioLayer.buildAddressSnapshot({ entry, provider: "test", bundle: { summary: summary(SEGWIT), transactions: [transaction()], truncated: false }, currentPriceUsd: 100, startTimestamp: TIMESTAMP, endTimestamp: Date.now() });
  const cache = app.serializeRuntimeCache({ ...app.runtime, priceHistory: new Map([["2020-01-01", 7000]]), addressSnapshots: [snapshot] });
  delete cache.priceHistoryVersion;
  const normalized = app.normalizeRuntimeCache(cache, state);
  assert.equal(normalized.priceHistory.size, 0);
  assert.equal(normalized.historyAvailable, false);
  assert.equal(normalized.addressSnapshots[0].balanceSats, 100);
  assert.equal(normalized.addressSnapshots[0].txEvents.length, 1);
});

test("Retry-After supports seconds and HTTP dates, with a conservative default when CORS hides it", () => {
  const { app } = harness();
  const now = Date.UTC(2026, 0, 1);
  assert.equal(app.getRetryAt("120", now), now + 120_000);
  assert.equal(app.getRetryAt(new Date(now + 120_000).toUTCString(), now), now + 120_000);
  assert.equal(app.getRetryAt(null, now), now + 60_000);
  assert.equal(app.getRetryAt("garbage", now), now + 60_000);
  assert.equal(app.getRetryAt("0", now), now);
});

test("rate-limited origins remain paused while fallback providers can still run", async () => {
  const calls = [];
  const { app } = harness({ fetch: async (url) => {
    calls.push(url);
    return url.includes("mempool") ? Response.json({}, { status: 429, headers: { "Retry-After": "120" } }) : Response.json({ ok: true });
  } });
  const first = "https://mempool.space/api/address/" + GENESIS;
  await assert.rejects(app.fetchJson(first), (error) => error.isRateLimit && error.retryAt > Date.now());
  await assert.rejects(app.fetchJson(first), /Retry after/);
  assert.equal(calls.length, 1);
  const fallback = await app.withFallback([() => app.fetchJson(first), () => app.fetchJson("https://blockstream.info/api/address/" + GENESIS)], "failed");
  assert.equal(fallback.ok, true);
  assert.equal(calls.length, 2);
});

test("short rate-limit delays retry once and abort promptly when data is cleared", async () => {
  let calls = 0;
  const { app } = harness({ fetch: async () => ++calls === 1 ? Response.json({}, { status: 429, headers: { "Retry-After": "0" } }) : Response.json({ ok: true }) });
  assert.equal((await app.fetchJson("https://mempool.space/api/test")).ok, true);
  assert.equal(calls, 2);
  let requests = 0;
  const aborting = harness({ fetch: async () => { requests++; return Response.json({}, { status: 429, headers: { "Retry-After": "1" } }); } });
  const pending = aborting.app.fetchJson("https://mempool.space/api/test");
  await tick();
  aborting.app.cancelPendingDataWork();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(requests, 1);
});

function refreshFixture() {
  const { app, storage } = harness();
  app.disableRendering();
  const state = watchedState(app);
  const second = { ...state.addresses[0], id: "second", address: GENESIS };
  state.addresses.push(second);
  const previousTime = Date.now() - 86_400_000;
  const snapshots = state.addresses.map((entry) => ({
    entry, provider: "saved", balanceSats: 100, usdValue: 1, refreshedAt: previousTime,
    txEvents: [], balanceTimeline: [], hourlyBalanceTimeline: [], detailScope: "ALL", approximate: false,
  }));
  app.setRuntime({ hasLoadedOnce: true, addressSnapshots: snapshots, currentPriceUsd: 100_000 });
  app.APILayer.fetchAddressBundle = async (address) => {
    if (address === GENESIS) throw new Error("Provider unavailable");
    return { provider: "test", bundle: { summary: summary(address), transactions: [transaction()], truncated: false } };
  };
  app.APILayer.fetchMarketData = async () => ({ currentPriceUsd: 100_000, priceHistory: new Map(), intradayPriceHistory: new Map(), fiatExchangeRates: new Map([["USD", 1]]), historyAvailable: false, historyMissingDays: 1 });
  return { app, storage, previousTime };
}

test("partial overview refresh retains saved balances, per-address timestamps and failure status", async () => {
  const { app, previousTime } = refreshFixture();
  await app.refreshVault({ reason: "manual", allowSkeleton: false });
  assert.equal(app.runtime.addressSnapshots.length, 2);
  const failed = app.runtime.addressSnapshots.find((snapshot) => snapshot.entry.id === "second");
  const fresh = app.runtime.addressSnapshots.find((snapshot) => snapshot.entry.id !== "second");
  assert.equal(failed.balanceSats, 100);
  assert.equal(failed.refreshedAt, previousTime);
  assert.equal(failed.refreshFailed, true);
  assert.ok(fresh.refreshedAt > previousTime);
  assert.equal(fresh.refreshFailed, false);
  assert.equal(app.PortfolioLayer.calculateTotals(app.runtime.addressSnapshots).balanceSats, 200);
  const normalized = app.normalizeRuntimeCache(app.serializeRuntimeCache(app.runtime), app.state);
  assert.equal(normalized.addressSnapshots[1].refreshFailed, true);
  assert.equal(normalized.addressSnapshots[1].refreshedAt, previousTime);
});

test("total refresh failure keeps last good data and never advances its freshness", async () => {
  const { app, previousTime } = refreshFixture();
  app.APILayer.fetchAddressBundle = async () => { throw new Error("offline"); };
  await assert.rejects(app.refreshVault({ reason: "manual", allowSkeleton: false }), /All address lookups failed/);
  assert.equal(app.runtime.addressSnapshots.length, 2);
  assert.ok(app.runtime.addressSnapshots.every((snapshot) => snapshot.refreshedAt === previousTime && snapshot.refreshFailed));
});

test("a price outage preserves cached prices and still accepts fresh address balances", async () => {
  const { app } = refreshFixture();
  app.APILayer.fetchMarketData = async () => { throw new Error("prices offline"); };
  await app.refreshVault({ reason: "manual", allowSkeleton: false });
  assert.equal(app.runtime.currentPriceUsd, 100_000);
  assert.equal(app.runtime.priceStale, true);
  assert.equal(app.runtime.addressSnapshots.length, 2);
});

test("two timed-out explorer attempts produce one clear message instead of duplicate abort errors", async () => {
  let requests = 0;
  const { app, context } = harness({ fetch: async (_, { signal }) => {
    requests++;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } });
  context.window.setTimeout = (callback) => setTimeout(callback, 0);
  await assert.rejects(app.APILayer.fetchAddressSummary(SEGWIT), (error) => {
    assert.equal(error.message, "Data requests timed out. Click Refresh to try again.");
    assert.equal(error.cause.errors.length, 2);
    assert.ok(error.cause.errors.every((failure) => failure.isTimeout));
    return true;
  });
  assert.equal(requests, 2);
});

test("provider failure details stay in the error cause instead of repeating in the user message", async () => {
  const { app } = harness({ fetch: async () => Response.json({}, { status: 503 }) });
  await assert.rejects(app.APILayer.fetchAddressSummary(SEGWIT), (error) => {
    assert.equal(error.message, "Address summary lookup failed. Click Refresh to try again.");
    assert.equal(error.cause.errors.length, 2);
    assert.ok(!error.message.includes(" · "));
    return true;
  });
});

test("wallet, address and homepage charts keep their history when another refresh changes shared bounds", () => {
  const { app } = harness({ demo: true });
  app.hydrateBakedDemoRuntimeIfNeeded();
  const entry = app.state.addresses.find((entry) => entry.address === GENESIS);
  const walletBefore = app.getWalletView(entry.groupId);
  const addressBefore = app.getAddressView(entry.id);
  const cardBefore = app.getWalletSummaries().find((item) => item.wallet.id === entry.groupId).miniChartMarkup;
  app.runtime.timelineStart = Date.now() - 86400000;
  app.runtime.timelineEnd = Date.now();
  app.runtime.intradayStart = Date.now() - 3600000;
  app.runtime.intradayEnd = Date.now();
  assert.deepEqual(app.getWalletView(entry.groupId).dailyTimeline, walletBefore.dailyTimeline);
  assert.deepEqual(app.getAddressView(entry.id).dailyTimeline, addressBefore.dailyTimeline);
  assert.deepEqual(app.getWalletView(entry.groupId).intradayTimeline, walletBefore.intradayTimeline);
  assert.equal(app.getWalletSummaries().find((item) => item.wallet.id === entry.groupId).miniChartMarkup, cardBefore);
});

test("loading a shortened ALL cache restores daily history without changing wallets, balances or transactions", () => {
  const { app } = harness({ demo: true });
  app.hydrateBakedDemoRuntimeIfNeeded();
  const entry = app.state.addresses.find((entry) => entry.address === GENESIS);
  const stateBefore = JSON.stringify(app.state);
  const dataBefore = JSON.stringify(app.runtime.addressSnapshots.map(({ entry, balanceSats, txEvents, refreshedAt }) => ({ entry, balanceSats, txEvents, refreshedAt })));
  const cache = app.serializeRuntimeCache(app.runtime);
  cache.timelineStart = null; // Legacy bounds or bounds from a different wallet.
  cache.addressSnapshots.forEach((snapshot) => { snapshot.balanceTimeline = snapshot.balanceTimeline.slice(-2); });
  const recovered = app.normalizeRuntimeCache(cache, app.state);
  assert.equal(recovered.rebuiltTimelines, true);
  app.setRuntime(recovered);
  assert.ok(app.getWalletView(entry.groupId).availableChartRanges.includes("30D"));
  assert.ok(app.getWalletView(entry.groupId).dailyTimeline.length >= 30);
  assert.equal(JSON.stringify(app.state), stateBefore);
  assert.equal(JSON.stringify(app.runtime.addressSnapshots.map(({ entry, balanceSats, txEvents, refreshedAt }) => ({ entry, balanceSats, txEvents, refreshedAt }))), dataBefore);
  assert.equal(app.normalizeRuntimeCache(app.serializeRuntimeCache(app.runtime), app.state).rebuiltTimelines, false);
});

test("incremental Satoshi refresh preserves full cached history after a narrow wallet refresh", async () => {
  const { app } = harness({ demo: true });
  app.hydrateBakedDemoRuntimeIfNeeded();
  const entry = app.state.addresses.find((entry) => entry.address === GENESIS);
  const initial = app.runtime.addressSnapshots.map((snapshot) => [snapshot.entry.id, snapshot.balanceTimeline[0].timestamp]);
  const balances = new Map(app.runtime.addressSnapshots.map((snapshot) => [snapshot.entry.address, snapshot.balanceSats]));
  app.disableRendering();
  app.runtime.timelineStart = Date.now() - 86400000;
  app.APILayer.fetchAddressDelta = async (address) => ({ provider: "Test", bundle: {
    summary: { chain_stats: { funded_txo_sum: balances.get(address), spent_txo_sum: 0 }, mempool_stats: {} },
    transactions: [], truncated: false, overlapFound: true,
  } });
  app.APILayer.fetchMarketData = async () => ({ ...app.runtime });
  await app.updateBundledSatoshiDemoCache(entry.groupId);
  for (const [id, start] of initial) {
    assert.equal(app.runtime.addressSnapshots.find((snapshot) => snapshot.entry.id === id).balanceTimeline[0].timestamp, start);
  }
  assert.ok(app.getWalletView(entry.groupId).availableChartRanges.includes("30D"));
});

test("a wallet needs daily coverage for every address before offering a shared history range", () => {
  const { app } = harness({ demo: true });
  app.hydrateBakedDemoRuntimeIfNeeded();
  app.runtime.addressSnapshots[0].balanceTimeline = [];
  assert.equal(app.getCommonReliableDailyCoverage(app.runtime.addressSnapshots), null);
});

test("bundled demo repairs truncated public history while preserving personal wallets and healthy newer caches", () => {
  const { app } = harness({ demo: true });
  app.hydrateBakedDemoRuntimeIfNeeded();
  const genesis = app.runtime.addressSnapshots.find((snapshot) => snapshot.entry.address === GENESIS);
  genesis.balanceSats += 100;
  genesis.refreshedAt = Date.now();
  assert.equal(app.hydrateBakedDemoRuntimeIfNeeded(), false);
  assert.equal(app.runtime.addressSnapshots.find((snapshot) => snapshot.entry.address === GENESIS), genesis);
  const privateEntry = { id: "personal", address: SEGWIT, groupId: app.state.groups[0].id, tags: ["keep"] };
  app.state.addresses.push(privateEntry);
  app.state.lastUpdated = new Date().toISOString();
  app.state.groups[0].name = "Personal savings";
  const personal = { ...genesis, entry: privateEntry, balanceSats: 777 };
  app.runtime.addressSnapshots.push(personal);
  const stateBefore = JSON.stringify(app.state);
  genesis.txEvents = genesis.txEvents.slice(0, 3);
  genesis.balanceTimeline = genesis.balanceTimeline.slice(-2);
  genesis.approximate = true;
  assert.equal(app.hydrateBakedDemoRuntimeIfNeeded(), true);
  assert.ok(app.getWalletView(genesis.entry.groupId).availableChartRanges.includes("30D"));
  assert.equal(JSON.stringify(app.state), stateBefore);
  assert.equal(app.runtime.addressSnapshots.find((snapshot) => snapshot.entry.id === "personal"), personal);
  assert.equal(app.hydrateBakedDemoRuntimeIfNeeded(), false);
});

test("demo recovery never recreates a removed demo address", () => {
  const { app } = harness({ demo: true });
  app.hydrateBakedDemoRuntimeIfNeeded();
  app.state.addresses = app.state.addresses.filter((entry) => entry.address !== GENESIS);
  app.runtime.addressSnapshots = [];
  assert.equal(app.hydrateBakedDemoRuntimeIfNeeded(), false);
  assert.equal(app.runtime.addressSnapshots.length, 0);
  assert.equal(app.state.addresses.length, 4);
});
