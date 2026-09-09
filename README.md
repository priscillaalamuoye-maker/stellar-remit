# StellarRemit — Payroll → Cross-Border Payout Rail

Batch, low-cost cross-border payouts on Stellar/Soroban — built for diaspora
Nigerians paying salaries, family support, or vendor invoices in NGN,
settled on-chain in USDC/XLM and cashed out through local off-ramp partners.

Built by extending an existing Soroban payroll contract into a general
multi-recipient payout rail with off-ramp settlement hooks. Submitted to the
Stellar Community Fund (SCF) Open Track.

## Why this exists

Cross-border remittances to Nigeria carry high fees and slow settlement
through traditional rails. Stellar's low transaction costs and fast finality
make it well suited to batch payouts — one on-chain transaction can settle
dozens of recipients at once, with the last mile handled by a local off-ramp.

## Monorepo layout

```
stellar-remit/
├── contracts/payroll-remit/   # Soroban smart contract (Rust)
├── apps/web/                  # Next.js dashboard (batch payout UI)
├── docker/                    # Dockerfiles for contract + web build
├── .github/workflows/         # CI/CD: lint, test, build, contract deploy
├── scripts/                   # Local dev + deploy helper scripts
└── docker-compose.yml         # Full local stack (Stellar quickstart + web)
```

## Quick start

```bash
# 1. Copy env vars
cp .env.example .env

# 2. Spin up local Stellar network + web app
docker compose up --build

# 3. In another shell, deploy the contract to the local network
./scripts/deploy.sh local
```

Web dashboard: http://localhost:3000
Local Soroban RPC: http://localhost:8000/soroban/rpc

## Contract: `payroll-remit`

Core entrypoints (see `contracts/payroll-remit/src/lib.rs`):

- `init(admin, token)` — set contract admin and settlement token (USDC/XLM)
- `add_recipient(admin, recipient, off_ramp_ref)` — register a payout recipient
  with an off-ramp reference (bank account / mobile money handle, hashed)
- `batch_payout(admin, recipients, amounts)` — settle a batch of payments
  on-chain in a single transaction
- `record_offramp(admin, recipient, status)` — mark an off-ramp leg as
  completed once the local partner confirms fiat delivery
- `get_history(recipient)` — read a recipient's payout history

## Roadmap / SCF tranches

| Tranche | Milestone |
|---|---|
| MVP | Contract deployed to testnet; batch payout of ≥5 recipients; mocked off-ramp confirmation |
| Testnet | Real off-ramp partner integration (sandbox); web dashboard for senders; audit logging |
| Mainnet | Security review, mainnet deployment, live off-ramp partner, monitoring/alerting |

## Development

- Contracts: Rust + [Soroban SDK](https://developers.stellar.org/docs/build/smart-contracts/getting-started)
- Frontend: Next.js + TypeScript + plain CSS
- CI/CD: GitHub Actions (see `.github/workflows/ci.yml`)
- Containerized via Docker + Docker Compose for reproducible local dev and demo environments

### Setup

```bash
# Install Husky pre-commit hooks
npm run setup
```

Pre-commit hooks will run:
- Rust formatting and clippy checks
- TypeScript type checking and linting
- Conventional Commits validation

### Testing & Coverage

```bash
# Contract tests (Rust)
cargo test -p payroll-remit

# Web app tests (TypeScript)
cd apps/web
npm run test
npm run test:coverage

# Coverage reports uploaded to Codecov on CI
```

## Documentation

- **[CONTRACT_ABI.md](./contracts/payroll-remit/CONTRACT_ABI.md)** — Complete smart contract API reference
- **[CHANGELOG.md](./CHANGELOG.md)** — Release history and version timeline
- **[DEPRECATION_POLICY.md](./DEPRECATION_POLICY.md)** — Feature lifecycle and breaking change policy

## License

MIT — see `LICENSE`.
