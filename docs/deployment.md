# Deployment

This document covers release operations for Bitkit Watch.

## Automatic Deployment

The active `.github/workflows/deploy.yml` workflow runs on pushes to `master` and supports manual dispatch. Merging a PR into `master` triggers a Docker build, pushes the commit-tagged image to Artifact Registry, and deploys the `bitkit-watch` Cloud Run service in `europe-west6`. Feature-branch pushes and PR creation do not match its automatic trigger.

The latest inspected deployment completed successfully on November 19, 2026, from commit `2122d87`, through manual dispatch. The workflow does not currently run `scripts/verify-release.sh`; run the release checks before merging.

## Runtime Requirements

Use the Node.js version in `.nvmrc` for release scripts (`nvm install && nvm use`). Node is a development/release tool only; the deployed app has no npm dependencies or Node server. The November 2026 review pins the patched 24.x LTS release, [24.22.3](https://nodejs.org/en/blog/release/v24.22.3).

Serve Bitkit Watch from HTTPS in production or from `http://localhost` during local development. Address validation relies on the browser Web Crypto API and fails closed when checksum verification is unavailable.

Browser reloads render the locally stored watchlist and cached history immediately. Ordinary wallet reloads with complete cached data do not contact blockchain explorers. Explorer requests happen after the user clicks Refresh, adds an address, opens a view whose required history scope is missing locally, or when the bundled Satoshi demo has not yet been checked in this browser or its local demo update is more than one hour old.

Missing active-view history loads automatically in the background while cached content remains visible and loading indicators are shown. A wallet or address Refresh collects bounded all-time transaction activity, capped at the newest 1000 transactions per address, while charts continue to display the selected visual range.

The bundled Satoshi demo wallet is the exception: its wallet-level Refresh uses the faster incremental path and merges only unseen public demo transactions. Address addition loads recent activity first, then fills bounded all-time activity in the background. The stale Satoshi demo update is silent and incremental: cached data renders first, refresh loading indicators remain visible while the check runs, then only unseen public demo transactions are merged into that browser's local cache.

Lightweight Coinbase spot-price and fiat-rate requests may run on reload and when the selected fiat currency changes.

Requests omit credentials and referrers, bypass the browser HTTP cache, and reject redirects. Removing an address or wallet, clearing data, and watchlist updates from another tab cancel outstanding work. Already transmitted requests cannot be recalled. Clearing data removes the recovery copy as well as state and history, then restores the public demo. A random deletion token with no wallet data remains to invalidate work in other tabs. Cached activity for legacy uppercase SegWit addresses is discarded when those addresses are canonicalized, so affected history can be rebuilt correctly.

## Satoshi Demo Snapshot

The bundled Satoshi demo wallet ships with bounded all-time per-address history and market data so a new browser can render the demo immediately.

Regenerate the release asset with:

```sh
./scripts/update.sh
```

Use `./scripts/update.sh` instead of running `scripts/build-satoshi-demo-snapshot.mjs` directly. The wrapper writes a temporary snapshot, checks it, and atomically replaces `assets/satoshi-demo-snapshot.js`.

Deploy `assets/api-validation.js` together with `app.js`, the snapshot, and the HTML. The app and snapshot builder share the same response validators. Update asset query versions in `index.html` when shipping changed scripts or a new snapshot.

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

Run:

```sh
./scripts/verify-release.sh
git diff --check
```

The release check intentionally fails while legal draft markers remain in the Terms of Use or Privacy Policy. Resolve those markers with counsel before publishing.

Release verification includes offline security regression tests. Snapshot freshness is checked separately against a 14-day maximum age; regenerate it before release when needed.
