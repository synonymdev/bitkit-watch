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

function harness({ stored = {}, fetch: fetchImpl = async () => { throw new Error("Unexpected network request"); }, crypto = webcrypto } = {}) {
  const storage = new Map(Object.entries(stored));
  const context = vm.createContext({
    BITKIT_WATCH_API_VALIDATION: validation, crypto, Blob, TextDecoder, AbortController, DOMException,
    Map, Set, Date, Promise, console,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    document: { addEventListener() {} },
    window: { setTimeout, clearTimeout, confirm: () => true },
    fetch: fetchImpl,
  });
  // Test-only exports: production stays encapsulated and has no diagnostic API.
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    globalThis.app = {
      ValidationLayer, APILayer, StorageLayer, normalizeTransactionEvent, normalizeImportedState,
      normalizeRuntimeCache, normalizeCachedTxEvents, normalizeCachedBalanceTimeline,
      buildDailyBalanceTimeline, buildRuntimeCacheCandidates, classifyAddressBatchDuplicates,
      fetchJson, withFallback, allSettledWithConcurrency, refreshScopedEntries,
      refreshVault, hydrateAddressAfterAdd, hydrateAddressDetail, loadTransactionTechnicalDetailsIfNeeded,
      clearVault, removeAddress, removeWallet, cancelPendingDataWork, handleStorageChange,
      parseAddressInput, buildWalletCard, buildAddressTagChips, escapeHtml,
      mergeAddressTransactionEvents, upsertAddressSnapshot, serializeRuntimeCache, combineSnapshotTimelines,
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
