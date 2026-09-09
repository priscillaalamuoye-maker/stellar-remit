#!/usr/bin/env bash
# Build and deploy the payroll-remit contract to the given Soroban network.
# Usage: ./scripts/deploy.sh [local|testnet|futurenet]

set -euo pipefail

NETWORK="${1:-local}"
WASM_PATH="target/wasm32-unknown-unknown/release/payroll_remit.wasm"

echo "==> Building contract (release, wasm32)"
cargo build --target wasm32-unknown-unknown --release -p payroll-remit

if [ ! -f "$WASM_PATH" ]; then
  echo "Build failed: $WASM_PATH not found" >&2
  exit 1
fi

echo "==> Deploying to network: $NETWORK"
soroban contract deploy \
  --wasm "$WASM_PATH" \
  --source deployer \
  --network "$NETWORK"

echo "==> Done."
