# Bitkit Watch

See your bitcoin grow over time. Safely and privately.

Bitkit Watch is a watch-only Bitcoin dashboard that runs in your browser. No private keys, no account, no authentication. Just keep watch.

## Privacy Model

Bitkit Watch stores wallets, addresses, preferences, and cached history locally in your browser. This local watchlist is not sent to Synonym servers.

When blockchain or market data is refreshed, your browser connects directly to third-party public APIs. These providers may receive the public Bitcoin addresses being queried, transaction IDs requested for technical details, your IP address, and standard browser request metadata.

## Features

- Watch one or more Bitcoin addresses.
- Group addresses into wallets.
- View balances, transaction activity, and historical charts.
- Cache wallet data locally for fast reloads.
- Load transaction input/output details.
- Try the bundled Satoshi demo wallet.

## Local Development

The browser app has no third-party JavaScript packages, CDN scripts, or build step. Release tooling uses Node.js 24.22.3, pinned in `.nvmrc`, plus Python 3, Bash, and OpenSSL. Playwright is a pinned development dependency for browser tests; it is not shipped to users.

With nvm installed, select the project's patched runtime:

```sh
nvm install
nvm use
npm ci --ignore-scripts
npx playwright install chromium webkit
npm test
npm run test:browser
```

Serve the project from localhost:

```sh
npm start
```

Then open:

```text
http://localhost:8765
```

For Safari-compatible local previews, use `npm start -- --https` and open `https://127.0.0.1:8765`. The local server generates a temporary self-signed certificate; it does not install a trusted certificate. Browser tests use this HTTPS mode to preserve the production security policy.

Bitkit Watch should be served from HTTPS in production or from `http://localhost` during local development. Address validation relies on the browser Web Crypto API and fails closed when checksum verification is unavailable.

## Code Layout

- `app.js`: UI, wallet actions, and refresh coordination.
- `assets/storage.js`: bounded persistence, cache recovery, and normalization.
- `assets/api.js`: validated provider requests, fallback, cancellation, and rate-limit cooldowns.
- `assets/portfolio.js`: balances, transaction activity, and timeline calculations.
- `assets/charts.js`: chart geometry, gaps, labels, and pointer interaction.
- `assets/market-history.js`: shared real-price coverage for the app and snapshot builder.

Modules receive explicit dependencies from `app.js`; browser scripts are served directly without bundling.

## Prepare a Release

```sh
npm run prepare:release -- 0.1.5
```

This refreshes the public Satoshi snapshot, updates the manifest, lockfile, visible version and asset URLs, then runs release and desktop/mobile Chromium and WebKit checks. Failed checks, Ctrl+C, and SIGTERM restore the previous release files after stopping child commands. Review the diff and personally sign and push your commit afterward.

## Deployment

See [docs/deployment.md](docs/deployment.md) for release checks, Satoshi demo snapshot updates, and production HTTP header recommendations.

See [docs/security-audit-2026-11-24.md](docs/security-audit-2026-11-24.md) for the security review, fixes, and remaining deployment considerations.
