import { test, expect } from "@playwright/test";
const SEGWIT = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const SECOND = "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy";

async function mockApis(context, { failAddress = () => false, holdAddress = async () => {} } = {}) {
  const requests = [];
  await context.route("https://**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    requests.push(url.href);
    let payload;
    if (url.pathname.includes("/address/")) {
      const address = url.pathname.split("/address/")[1].split("/")[0];
      await holdAddress(address);
      if (failAddress(address)) {
        await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
        return;
      }
      if (url.pathname.includes("/txs")) payload = url.pathname.includes("/chain/") ? [] : [{
        txid: "a".repeat(64), vin: [{ is_coinbase: true, prevout: null }],
        vout: [{ scriptpubkey_address: address, value: 12345 }],
        status: { confirmed: true, block_time: 1700000000 }, fee: 0,
      }];
      else payload = { address, chain_stats: { funded_txo_sum: 12345, spent_txo_sum: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 } };
    } else if (url.pathname.endsWith("/candles")) payload = [];
    else if (url.pathname.endsWith("/ticker")) payload = { price: "100000" };
    else if (url.pathname.endsWith("/spot")) payload = { data: { amount: "100000" } };
    else if (url.pathname.endsWith("/exchange-rates")) payload = { data: { rates: { USD: "100000", EUR: "90000", JPY: "15000000", GBP: "80000", CNY: "700000" } } };
    else payload = {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }).catch(() => {});
  });
  return requests;
}

function collectErrors(context) {
  const errors = [];
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  return errors;
}

async function addAddress(page, address) {
  await page.locator("#walletAddressInput").fill(address);
  if (address.startsWith("BC1")) {
    await page.evaluate(() => {
      document.querySelector("#walletAddAddressForm").requestSubmit();
      document.querySelector("#walletAddAddressForm").requestSubmit();
    });
  } else await page.locator("#walletAddressInput").press("Enter");
  await expect.poll(() => page.evaluate((value) => {
    const cache = JSON.parse(localStorage.getItem("bitkit-vault-runtime-cache-v1"));
    const state = JSON.parse(localStorage.getItem("bitkit-vault-state-v1"));
    const id = state.addresses.find((entry) => entry.address === value)?.id;
    return cache?.addressSnapshots.some((entry) => entry.entryId === id && entry.detailScope === "ALL");
  }, address.toLowerCase().startsWith("bc1") ? address.toLowerCase() : address)).toBe(true);
}

test("watchlist persists, rejects secrets, and keeps balances after a partial refresh", async ({ context }) => {
  const errors = collectErrors(context);
  let fail = false;
  const requests = await mockApis(context, { failAddress: (address) => fail && address === SECOND });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".wallet-card[data-wallet-id]")).toHaveCount(3);
  await page.getByRole("button", { name: "Savings", exact: false }).click();
  await page.locator("#walletAddressInput").fill("a".repeat(64));
  await page.locator("#walletAddressInput").press("Enter");
  await expect(page.locator("#walletAddressFeedback")).toContainText("private key");
  expect(requests.some((url) => url.includes("/address/" + "a".repeat(64)))).toBe(false);
  await addAddress(page, SEGWIT.toUpperCase());
  expect(await page.evaluate((address) => JSON.parse(localStorage.getItem("bitkit-vault-state-v1")).addresses.filter((entry) => entry.address === address).length, SEGWIT)).toBe(1);
  await addAddress(page, SECOND);
  await page.reload();
  await expect(page.locator("#walletAddressList [data-action='open-address']")).toHaveCount(2);
  const before = await page.locator("#walletPrimarySummary").textContent();
  fail = true;
  await page.locator("#refreshButton").click();
  await expect.poll(() => page.evaluate((address) => {
    const state = JSON.parse(localStorage.getItem("bitkit-vault-state-v1"));
    const cache = JSON.parse(localStorage.getItem("bitkit-vault-runtime-cache-v1"));
    const id = state.addresses.find((entry) => entry.address === address)?.id;
    return cache.addressSnapshots.find((snapshot) => snapshot.entryId === id)?.refreshFailed;
  }, SECOND)).toBe(true);
  await expect(page.locator("#walletPrimarySummary")).toHaveText(before);
  // Simulate a cache with no market coverage. Real prices from the public demo can otherwise be reused.
  await page.evaluate(() => {
    const key = "bitkit-vault-runtime-cache-v1";
    const cache = JSON.parse(localStorage.getItem(key));
    cache.priceHistory = []; cache.intradayPriceHistory = []; cache.historyAvailable = false;
    localStorage.setItem(key, JSON.stringify(cache));
  });
  await page.reload();
  // Fiat history must show gaps, never today's spot price in the past.
  await page.locator("#unitDisplayButton").click();
  await expect(page.locator("#walletChartDataStatus")).toContainText("Price history incomplete");
  await expect(page.locator("#walletChartGrowth")).toBeHidden();
  await page.reload();
  await expect.poll(() => page.evaluate((address) => {
    const state = JSON.parse(localStorage.getItem("bitkit-vault-state-v1"));
    const cache = JSON.parse(localStorage.getItem("bitkit-vault-runtime-cache-v1"));
    const id = state.addresses.find((entry) => entry.address === address)?.id;
    return cache.addressSnapshots.find((snapshot) => snapshot.entryId === id)?.refreshFailed;
  }, SECOND)).toBe(true);
  expect(errors).toEqual([]);
});

test("clearing another tab cancels pending requests; demo chart works on mobile and desktop", async ({ context }, testInfo) => {
  const errors = collectErrors(context);
  let release, start;
  const started = new Promise((resolve) => { start = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  let hold = false;
  await mockApis(context, { holdAddress: async (address) => {
    if (hold && address === SECOND) { start(); await held; }
  } });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Savings", exact: false }).click();
  await addAddress(page, SEGWIT);
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator(".wallet-card[data-wallet-id]")).toHaveCount(3);
  hold = true;
  await page.locator("#walletAddressInput").fill(SECOND);
  await page.locator("#walletAddressInput").press("Enter");
  await started;
  await second.evaluate(() => localStorage.setItem("bitkit-vault-state-quarantine-v1", "private recovery copy"));
  await second.locator("#settingsButton").click();
  second.once("dialog", (dialog) => dialog.accept());
  await second.locator("#settingsClearStorageButton").click();
  hold = false; release();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("bitkit-vault-state-v1"))).not.toContain(SECOND);
  await page.locator("#settingsButton").click();
  await page.locator("#settingsHideDustButton").click();
  const saved = await page.evaluate(() => ({
    state: localStorage.getItem("bitkit-vault-state-v1"), cache: localStorage.getItem("bitkit-vault-runtime-cache-v1"),
    quarantine: localStorage.getItem("bitkit-vault-state-quarantine-v1"),
  }));
  expect(saved.quarantine).toBeNull();
  expect(JSON.stringify(saved)).not.toContain(SECOND);
  expect(JSON.stringify(saved)).not.toContain(SEGWIT);
  await page.locator("#settingsModalClose").click();
  await page.locator("#brandHomeButton").click();
  await page.getByRole("button", { name: "Satoshi", exact: false }).click();
  await expect(page.locator("#walletChartStage svg")).toBeVisible();
  await page.locator("#walletChartStage").click();
  await expect(page.locator("#chartModal")).toBeVisible();
  await page.locator("#chartModalClose").click();
  await page.screenshot({ path: testInfo.outputPath("wallet.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("expanded chart refreshes price notes across ranges and clears them for BTC", async ({ context }) => {
  const errors = collectErrors(context);
  await mockApis(context);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Savings", exact: false }).click();
  await addAddress(page, SEGWIT);
  // Daily prices are unavailable; the hourly observations fully cover the 1D chart.
  await page.evaluate(() => {
    const key = "bitkit-vault-runtime-cache-v1";
    const cache = JSON.parse(localStorage.getItem(key));
    cache.priceHistory = [];
    cache.historyAvailable = false;
    cache.intradayPriceHistory = [];
    for (let time = cache.intradayStart; time <= cache.intradayEnd; time += 3_600_000) {
      cache.intradayPriceHistory.push([new Date(time).toISOString().slice(0, 13), 100_000]);
    }
    localStorage.setItem(key, JSON.stringify(cache));
  });
  await page.reload();
  await page.locator("#unitDisplayButton").click();
  const warning = "Price history incomplete; gaps are left blank.";
  await expect(page.locator("#walletChartDataStatus")).toHaveText(warning);
  await page.locator("#walletChartStage").click();
  await expect(page.locator("#chartModalDataStatus")).toHaveText(warning);
  await page.locator('#chartModalTabs [data-range="1D"]').click();
  await expect(page.locator("#chartModalDataStatus")).toHaveText("");
  await expect(page.locator("#walletChartDataStatus")).toHaveText("");
  await page.locator('#chartModalTabs [data-range="30D"]').click();
  await expect(page.locator("#chartModalDataStatus")).toHaveText(warning);
  await page.locator("#chartModalClose").click();
  await expect(page.locator("#chartModalDataStatus")).toHaveText("");
  await page.locator("#unitDisplayButton").click();
  await page.locator("#walletChartStage").click();
  await expect(page.locator("#chartModalDataStatus")).toHaveText("");
  await expect(page.locator("#walletChartDataStatus")).toHaveText("");
  expect(errors).toEqual([]);
});

test("address lookup timeouts show one readable warning and keep the address saved", async ({ context }) => {
  const errors = collectErrors(context);
  const requests = await mockApis(context, { holdAddress: async (address) => {
    if (address === SEGWIT) await new Promise(resolve => setTimeout(resolve, 500));
  } });
  await context.addInitScript(() => {
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = (callback, milliseconds, ...args) => schedule(callback, milliseconds === 15000 ? 100 : milliseconds, ...args);
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Savings", exact: false }).click();
  await page.locator("#walletAddressInput").fill(SEGWIT);
  await page.locator("#walletAddressInput").press("Enter");
  await expect(page.locator("#walletAddressFeedback")).toHaveText("Address saved locally. Data requests timed out. Click Refresh to try again.");
  expect(requests.filter(url => url.endsWith(`/address/${SEGWIT}`))).toHaveLength(2);
  expect(await page.evaluate((address) => JSON.parse(localStorage.getItem("bitkit-vault-state-v1")).addresses.some(entry => entry.address === address), SEGWIT)).toBe(true);
  expect(errors).toEqual([]);
});
