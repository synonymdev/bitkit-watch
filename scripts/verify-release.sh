#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
failures=0

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

for script in "$ROOT_DIR/app.js" "$ROOT_DIR/assets/"*.js "$ROOT_DIR/scripts/"*.mjs; do
  if node --check "$script"; then
    pass "${script#$ROOT_DIR/} syntax"
  else
    fail "${script#$ROOT_DIR/} syntax"
  fi
done

if node --test "$ROOT_DIR/tests/"*.test.mjs; then
  pass "security regression tests"
else
  fail "security regression tests"
fi

if grep -En 'fonts\.googleapis\.com|fonts\.gstatic\.com|mcp\.figma\.com|figma-capture-loader' \
  "$ROOT_DIR/index.html" "$ROOT_DIR/terms-of-use.html" "$ROOT_DIR/privacy-policy.html"; then
  fail "production HTML contains a prohibited external asset origin or development capture loader"
else
  pass "production HTML excludes Google Fonts and Figma capture references"
fi

if grep -En '\[[^]]*\]|aria-label="Blank draft cell"|<td>\[</td>' \
  "$ROOT_DIR/terms-of-use.html" "$ROOT_DIR/privacy-policy.html"; then
  fail "legal pages still contain draft markers that require counsel review"
else
  pass "legal pages contain no draft markers"
fi

if python3 - "$ROOT_DIR/assets/satoshi-demo-snapshot.js" "${1:-}" <<'PY'
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys

text = Path(sys.argv[1]).read_text()
prefix = "globalThis.BITKIT_VAULT_SATOSHI_SNAPSHOT = Object.freeze("
if prefix not in text or not text.rstrip().endswith(");"):
    raise SystemExit("snapshot payload wrapper missing")
payload = json.loads(text.split(prefix, 1)[1].rsplit(");", 1)[0])
as_of = datetime.fromisoformat(payload["asOf"].replace("Z", "+00:00"))
age_days = (datetime.now(timezone.utc) - as_of).total_seconds() / 86400
if age_days < 0 or (age_days > 14 and "--allow-stale-snapshot" not in sys.argv):
    raise SystemExit(f"snapshot is {age_days:.1f} days old")
runtime_cache = payload.get("runtimeCache")
if not isinstance(runtime_cache, dict) or runtime_cache.get("priceHistoryVersion") != 1:
    raise SystemExit("snapshot has unverified legacy price history")
if not isinstance(runtime_cache, dict) or runtime_cache.get("historyScope") != "ALL":
    raise SystemExit("snapshot must include bounded all-time runtime cache")
balances = payload.get("balancesByAddress")
snapshots = runtime_cache.get("addressSnapshots")
if not isinstance(balances, dict) or not isinstance(snapshots, list):
    raise SystemExit("snapshot address payload missing")
if set(balances) != {snapshot.get("address") for snapshot in snapshots}:
    raise SystemExit("snapshot address payload is incomplete")
if not all(isinstance(snapshot.get("txEvents"), list) and snapshot["txEvents"] for snapshot in snapshots):
    raise SystemExit("snapshot per-address transaction cache missing")
PY
then
  pass "bundled Satoshi snapshot meets the selected age policy and includes per-address detail"
else
  fail "bundled Satoshi snapshot is stale, invalid, or missing per-address detail"
fi

if python3 - "$ROOT_DIR/site.webmanifest" <<'PY'
import json
from pathlib import Path
import sys

manifest = json.loads(Path(sys.argv[1]).read_text())
paths = [manifest.get("start_url", "")]
paths.extend(icon.get("src", "") for icon in manifest.get("icons", []))
if not paths or any(not value.startswith("./") for value in paths):
    raise SystemExit("manifest paths must be relative")
PY
then
  pass "manifest paths are relative"
else
  fail "manifest paths are not relative"
fi

if node "$ROOT_DIR/scripts/check-release.mjs"; then
  pass "release versions and local assets agree"
else
  fail "release versions or local assets disagree"
fi

if (( failures > 0 )); then
  printf '\nRelease verification failed with %d issue(s).\n' "$failures" >&2
  exit 1
fi

printf '\nRelease verification passed.\n'
