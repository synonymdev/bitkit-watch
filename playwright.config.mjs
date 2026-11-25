import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: "list",
  // Ignore only the ephemeral local server certificate; retain the production CSP.
  use: { baseURL: "https://127.0.0.1:8766", trace: "retain-on-failure", ignoreHTTPSErrors: true },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    { name: "webkit-desktop", use: { browserName: "webkit", viewport: { width: 1440, height: 1000 } } },
    { name: "webkit-mobile", use: { browserName: "webkit", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: "node scripts/serve.mjs --https", env: { PORT: "8766" }, url: "https://127.0.0.1:8766", reuseExistingServer: false, ignoreHTTPSErrors: true },
});
