# Deployment

This document covers release operations for Bitkit Watch.

## Runtime Requirements

Serve Bitkit Watch from HTTPS in production or from `http://localhost` during local development. Address validation relies on the browser Web Crypto API and fails closed when checksum verification is unavailable.

Browser reloads render the locally stored watchlist and cached history immediately. Ordinary wallet reloads with complete cached data do not contact blockchain explorers. Explorer requests happen after the user clicks Refresh, adds an address, opens a view whose required history scope is missing locally, or when the bundled Satoshi demo has not yet been checked in this browser or its local demo update is more than one hour old.

Missing active-view history loads automatically in the background while cached content remains visible and loading indicators are shown. A wallet or address Refresh collects bounded all-time transaction activity, capped at the newest 1000 transactions per address, while charts continue to display the selected visual range.

The bundled Satoshi demo wallet is the exception: its wallet-level Refresh uses the faster incremental path and merges only unseen public demo transactions. Address addition loads recent activity first, then fills bounded all-time activity in the background. The stale Satoshi demo update is silent and incremental: cached data renders first, refresh loading indicators remain visible while the check runs, then only unseen public demo transactions are merged into that browser's local cache.

Lightweight Coinbase spot-price and fiat-rate requests may run on reload and when the selected fiat currency changes.

## Satoshi Demo Snapshot

The bundled Satoshi demo wallet ships with bounded all-time per-address history and market data so a new browser can render the demo immediately.

Regenerate the release asset with:

```sh
./scripts/update.sh
```

Use `./scripts/update.sh` instead of running `scripts/build-satoshi-demo-snapshot.mjs` directly. The wrapper writes a temporary snapshot, checks it, and atomically replaces `assets/satoshi-demo-snapshot.js`.

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
