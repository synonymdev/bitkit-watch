#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_FILE="$ROOT_DIR/assets/satoshi-demo-snapshot.js"
TEMP_FILE="$(mktemp "$ROOT_DIR/assets/.satoshi-demo-snapshot.XXXXXX")"
trap 'rm -f "$TEMP_FILE"' EXIT

node "$ROOT_DIR/scripts/build-satoshi-demo-snapshot.mjs" "$TEMP_FILE"
node --check --input-type=commonjs < "$TEMP_FILE"
mv "$TEMP_FILE" "$OUTPUT_FILE"
trap - EXIT
echo "Updated $OUTPUT_FILE"
