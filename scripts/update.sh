#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_FILE="$ROOT_DIR/assets/satoshi-demo-snapshot.js"

ADDRESSES=(
  "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
  "12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S"
  "12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX"
  "1HLoD9E4SDFFPDiYfNYnkBLQ85Y51J3Zb1"
  "1FvzCLoTPGANNjWoUo6jUGuAG3wg1w4YjR"
)

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
price_json="$(curl -sL "https://api.coinbase.com/v2/prices/BTC-USD/spot")"
price_usd="$(
  printf '%s' "$price_json" | python3 -c 'import json, sys; print(json.load(sys.stdin)["data"]["amount"])'
)"

balance_lines=()
for address in "${ADDRESSES[@]}"; do
  response="$(curl -sL "https://mempool.space/api/address/${address}")"
  balance_sats="$(
    printf '%s' "$response" | python3 -c 'import json, sys; payload = json.load(sys.stdin); print(int(payload["chain_stats"]["funded_txo_sum"]) - int(payload["chain_stats"]["spent_txo_sum"]) + int(payload["mempool_stats"]["funded_txo_sum"]) - int(payload["mempool_stats"]["spent_txo_sum"]))'
  )"
  balance_lines+=("    \"${address}\": ${balance_sats},")
done

{
  echo '/*'
  echo '  Bundled Satoshi demo snapshot'
  echo '  This ships with the prototype so the demo wallet can bootstrap quickly for any user,'
  echo '  even after local storage has been cleared.'
  echo '*/'
  echo
  echo 'globalThis.BITKIT_VAULT_SATOSHI_SNAPSHOT = Object.freeze({'
  echo "  asOf: \"${timestamp}\","
  echo "  currentPriceUsd: ${price_usd},"
  echo '  balancesByAddress: Object.freeze({'
  printf '%s\n' "${balance_lines[@]}"
  echo '  }),'
  echo '});'
} > "$OUTPUT_FILE"

echo "Updated $OUTPUT_FILE"
