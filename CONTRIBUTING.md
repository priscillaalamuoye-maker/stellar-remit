# Contributing

## Local development

1. Install [Rust](https://rustup.rs/) + `wasm32-unknown-unknown` target
2. Install [soroban-cli](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli)
3. Install [Docker](https://docs.docker.com/get-docker/)
4. `cp .env.example .env`
5. `docker compose up --build`

## Running tests

```bash
# Contract tests
cargo test -p payroll-remit

# Web lint + typecheck
cd apps/web && npm run lint && npm run typecheck
```

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`

## Branching

- `main` — always deployable; CI auto-deploys the contract to testnet on merge
- feature branches — `feat/<short-description>`, opened as PRs against `main`

## Code review

All PRs require CI to pass (contract tests, web build, docker build) before merge.
