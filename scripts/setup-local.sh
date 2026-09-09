#!/usr/bin/env bash
# One-shot local dev bootstrap: creates a deployer identity funded via
# Friendbot on the local Stellar quickstart network.

set -euo pipefail

echo "==> Adding local 'deployer' identity (if not already present)"
soroban keys add deployer --network local 2>/dev/null || true

echo "==> Funding deployer via Friendbot"
soroban keys fund deployer --network local

echo "==> Deployer address:"
soroban keys address deployer

echo "Done. Run ./scripts/deploy.sh local to deploy the contract."
