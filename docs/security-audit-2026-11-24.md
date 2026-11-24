# Security and maintenance review — 2026-11-24

Scope: local source review of browser storage, address validation, HTML rendering, explorer/market API access, background refreshes, and release scripts. Public production response headers were also inspected. This is a targeted review, not an exhaustive penetration test or independent verification of blockchain data.

## Fixed

| Area | Finding and change |
| --- | --- |
| Data deletion | Clear Data left the recovery/quarantine copy behind; deleting the final address could leave history cached. Both are now removed, and storage failures show a warning instead of claiming success. |
| Background work | Late refreshes could restore removed data and continue querying deleted addresses. Destructive actions abort active requests, invalidate results and queued work, and synchronize state changes across open tabs. |
| Address correctness | Uppercase SegWit addresses passed validation but did not match lowercase explorer outputs, producing incorrect activity totals. Inputs and stored addresses are canonicalized while preserving Base58's case sensitivity and rejecting mixed-case Bech32. |
| API trust boundary | Numeric coercion accepted null, negative, fractional and unsafe values. Shared validators now check satoshi amounts, transaction inputs/outputs, timestamps, candle values and requested address/transaction identity. |
| Transport | API redirects are rejected, HTTP caching is disabled for API requests, and JSON size limits are enforced while streaming. Readers are canceled/released on failure. Credential/referrer omission is retained. |
| Local cache | Invalid transaction/timeline values are rejected, reconstruction is bounded, and truncated cache fallbacks are marked approximate. |
| Concurrent submissions | Address duplicates and capacity are rechecked after asynchronous checksum validation. |
| Refresh correctness | Equal-scope refreshes replace stale events; incremental demo updates reconsider pending transactions instead of treating them as confirmed overlap. |
| Efficiency | Cache fallback serialization is lazy instead of constructing every candidate on each save. Historical price requests use bounded concurrency; adding an address requests all-time prices from its known activity instead of January 1970. Empty addresses use a one-year fallback. |
| Maintenance | Shared API validation replaces divergent browser/builder checks. All three HTML pages apply CSP before assets and add a referrer-policy fallback. Snapshot replacement preserves public readability. |

## Dependencies and data

There were no package manifests, lockfiles, vendored third-party JavaScript libraries, or CDN runtime dependencies to upgrade. No npm dependency was introduced.

The production Docker image layers and external reusable GitHub Actions are outside these JavaScript dependency checks and were not upgraded by this change.

The existing shell used Node 24.15.0. `.nvmrc` now pins [Node 24.22.3, an official security release](https://nodejs.org/en/blog/release/v24.22.3). Its official archive was downloaded to a temporary directory, verified against the official SHA-256 manifest, and used for validation. The global Node installation was not changed. Run `nvm install && nvm use` to adopt the project version in a development shell.

The 173-day-old bundled demo snapshot was regenerated through the normal atomic update script. The result includes five public demo addresses, 952 cached transactions, and 5,658 daily price points. Some Mempool requests returned HTTP 429 or timed out; the existing Blockstream fallback completed successfully. No personal watchlist was queried.

## Verification

- All 24 offline regression tests passed. The suite covers Bitcoin address vectors, secret rejection, malformed responses, response-size limits, deletion races (including delayed cross-tab events), persistence, cache truncation and HTML escaping.
- Release checks cover syntax, tests, prohibited external scripts, legal draft markers, snapshot freshness/completeness and manifest paths.
- Chromium browser checks passed for startup, secret rejection, concurrent address submission, uppercase SegWit, persistence after reload, cross-tab clearing with an in-flight request, and the mobile chart dialog, with zero page JavaScript errors. These use an isolated profile with mocked external API responses; the snapshot builder separately exercised live provider responses.
- Source review found escaping at the inspected dynamic HTML boundaries. This does not establish that every possible injection path is absent.

## Remaining considerations

- The public HTTPS response from `https://watch.bitkit.to/` included CSP with `frame-ancestors 'none'`, Referrer-Policy, nosniff, X-Frame-Options and Permissions-Policy. It did **not** include Strict-Transport-Security. HSTS is commented out in `security-headers.inc` on current `master`; enable it after confirming the load balancer's HTTPS coverage, following `deployment.md`. Deployment configuration was not changed by this audit.
- Watchlists remain unencrypted in browser storage. Scripts running on the same origin and someone with access to the browser profile can read them. Public API providers receive queried addresses and connection metadata as described in the existing privacy model.
- Provider responses are structurally validated, not cryptographically authenticated against a local Bitcoin node. History is bounded and price series use existing gap-filling behavior; portfolio history remains approximate.
- This review did not deploy changes or modify the global Node runtime.

Address-vector reference: [BIP 350](https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki). API-schema reference: [Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md).
