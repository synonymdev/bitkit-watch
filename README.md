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
- Load transaction input/output details on demand when Technical Details is opened, then cache them locally.
- Use the bundled Satoshi demo wallet without creating an account.

## Local Development

Serve the project from localhost:

```sh
python3 -m http.server 8765
```

Then open:

```text
http://localhost:8765
```

Bitkit Watch should be served from HTTPS in production or from `http://localhost` during local development. Address validation relies on the browser Web Crypto API and fails closed when checksum verification is unavailable.

## Deployment

See [docs/deployment.md](docs/deployment.md) for release checks, Satoshi demo snapshot updates, and production HTTP header recommendations.
