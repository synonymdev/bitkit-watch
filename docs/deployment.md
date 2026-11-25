# Deployment

This document covers release operations for Bitkit Watch.

## Automatic Deployment

The `.github/workflows/deploy.yml` workflow checks PRs targeting `master`, pushes to `master`, and manual dispatches. Unit tests, release checks, and desktop/mobile Chromium and WebKit smoke tests must pass before the deployment job can run. PRs never run the deployment job or receive deployment credentials.

Merging a PR into `master` triggers the checks, then a Docker build, a commit-tagged image push to Artifact Registry, and deployment to the `bitkit-watch` Cloud Run service in `europe-west6`. Feature-branch pushes do not deploy. A manual run can deploy only `master`.

PR checks allow an older bundled snapshot so unrelated contributions are not blocked by time. Master deployment and local release preparation enforce the 14-day snapshot limit. Repository branch protection also requires the `checks` job from GitHub Actions before merging into `master`, with the branch up to date. These rules apply to administrators too. No approving review is required, so maintainers can merge their own PRs after CI passes.

## Runtime Requirements

Use the Node.js version in `.nvmrc` for release scripts (`nvm install && nvm use`). Node is a development/release tool only; the deployed app has no npm dependencies or Node server. The November 2026 review pins the patched 24.x LTS release, [24.22.3](https://nodejs.org/en/blog/release/v24.22.3).

Serve Bitkit Watch from HTTPS in production or from `http://localhost` during local development. Address validation relies on the browser Web Crypto API and fails closed when checksum verification is unavailable.

Browser reloads render the locally stored watchlist and cached history immediately. Ordinary wallet reloads with complete cached data do not contact blockchain explorers. Explorer requests happen after the user clicks Refresh, adds an address, opens a view whose required history scope is missing locally, or when the bundled Satoshi demo has not yet been checked in this browser or its local demo update is more than one hour old.

Missing active-view history loads automatically in the background while cached content remains visible and loading indicators are shown. A wallet or address Refresh collects bounded all-time transaction activity, capped at the newest 1000 transactions per address, while charts continue to display the selected visual range.

The bundled Satoshi demo wallet is the exception: its wallet-level Refresh uses the faster incremental path and merges only unseen public demo transactions. Address addition loads recent activity first, then fills bounded all-time activity in the background. The stale Satoshi demo update is silent and incremental: cached data renders first, refresh loading indicators remain visible while the check runs, then only unseen public demo transactions are merged into that browser's local cache.

Lightweight Coinbase spot-price and fiat-rate requests may run on reload and when the selected fiat currency changes.

Requests omit credentials and referrers, bypass the browser HTTP cache, and reject redirects. Removing an address or wallet, clearing data, and watchlist updates from another tab cancel outstanding work. Already transmitted requests cannot be recalled. Clearing data removes the recovery copy as well as state and history, then restores the public demo. A random deletion token with no wallet data remains to invalidate work in other tabs. Cached activity for legacy uppercase SegWit addresses is discarded when those addresses are canonicalized, so affected history can be rebuilt correctly.

## Satoshi Demo Snapshot

The bundled Satoshi demo wallet ships with bounded all-time per-address history and market data so a new browser can render the demo immediately. Existing browsers rebuild shortened daily charts from their cached transactions on reload. If the public demo still lacks the month covered by the bundled snapshot, only its deficient address snapshots are restored; personal wallets and healthy demo caches are retained. Chart ranges and incremental demo refreshes use each address's own history bounds.

Regenerate the release asset with:

```sh
./scripts/update.sh
```

Use `./scripts/update.sh` instead of running `scripts/build-satoshi-demo-snapshot.mjs` directly. The wrapper writes a temporary snapshot, checks it, and atomically replaces `assets/satoshi-demo-snapshot.js`.

Deploy the entire `assets` directory together with `app.js` and the HTML; the Docker image already copies it. The app and snapshot builder share response validation and price-coverage logic.

Daily and hourly maps store only real provider observations. Missing prices remain blank; charts break at gaps and suppress growth percentages when the selected range is incomplete. Historical non-USD values that use today's exchange rate are labeled as estimates. Legacy synthesized price maps are discarded while retaining wallet balances and transactions; verified prices from the bundled demo can seed the replacement market cache.

Every address snapshot records its last successful refresh and whether its last refresh failed. Saved balances survive failed refreshes. A fresh price quote does not advance address freshness. Rate-limited origins honor `Retry-After` seconds or HTTP dates; short delays retry once, longer delays pause the origin and allow a fallback provider. If CORS hides the header, the default pause is 60 seconds. Clearing data also cancels pending short retries.

## Production Response Headers

The HTML files include Content Security Policy fallbacks for static previews. Configure the production host to send these HTTP response headers as well:

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self' https://mempool.space https://blockstream.info https://api.exchange.coinbase.com https://api.coinbase.com; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()
Strict-Transport-Security: max-age=31536000
```

Enable HSTS only after HTTPS deployment is confirmed. Do not add `includeSubDomains` until every subdomain is HTTPS-only.

## Release Checks

Install the pinned Node runtime and test tooling once, then prepare the release:

```sh
nvm install
nvm use
npm ci --ignore-scripts
npx playwright install chromium webkit
npm run prepare:release -- 0.1.5
git diff --check
```

The release command fetches a new public snapshot into a temporary file, updates the manifest/lockfile, visible version and all script/style query versions, and runs both release verification and browser tests. If verification fails or you interrupt with Ctrl+C/SIGTERM, it stops the active command and its descendants before restoring the previous release files. It never commits, signs, pushes or deploys.

To check an already prepared release without fetching another snapshot:

```sh
npm run verify
npm run test:browser
```

Release verification checks JavaScript syntax, offline regression tests, production asset restrictions, legal draft markers, snapshot schema/freshness, manifest paths, and version consistency. Browser tests mock third-party APIs and use an isolated HTTPS server on port 8766, with a temporary self-signed certificate generated by OpenSSL. Certificate verification is bypassed only in the test browser; the production CSP remains intact. `npm start` serves an HTTP preview on port 8765; `npm start -- --https` enables a Safari-compatible HTTPS preview.
