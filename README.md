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

The browser app has no third-party JavaScript packages, CDN scripts, or build step. Release tooling uses Node.js 24.22.3, pinned in `.nvmrc`, plus Python 3, zsh, and ripgrep.

With nvm installed, select the project's patched runtime:

```sh
nvm install
nvm use
node --test tests/*.test.mjs
```

Serve the project from localhost:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open:

```text
http://localhost:8765
```

Bitkit Watch should be served from HTTPS in production or from `http://localhost` during local development. Address validation relies on the browser Web Crypto API and fails closed when checksum verification is unavailable.

## Deployment

See [docs/deployment.md](docs/deployment.md) for release checks, Satoshi demo snapshot updates, and production HTTP header recommendations.

See [docs/security-audit-2026-11-24.md](docs/security-audit-2026-11-24.md) for the security review, fixes, and remaining deployment considerations.
