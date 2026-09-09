# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-09

### Added

- Initial release of PayrollRemit smart contract
  - Batch payout functionality for multiple recipients
  - Off-ramp settlement tracking and confirmation
  - Admin-controlled recipient registration
  - Payout history and recipient query functions
- Web dashboard for batch payout submission
  - Form-based recipient and amount entry
  - Integration with Stellar SDK (stub)
  - Mock transaction submission flow
- Docker setup for local development
  - Multi-stage builds for production optimization
  - Docker Compose for Soroban testnet integration
- CI/CD pipeline
  - Automated contract testing and linting (Rust)
  - Web app testing, linting, and type checking (TypeScript)
  - Artifact caching and wasm build artifacts
  - Automated deployment to Soroban testnet
- Code coverage
  - Jest coverage for web app
  - Cargo tarpaulin coverage for Rust contract
  - Codecov integration
- Pre-commit hooks with Husky
  - Automatic Rust formatting and clippy checks
  - TypeScript type checking and linting
  - Conventional Commits enforcement
- Security scanning
  - Trivy vulnerability scanner in CI pipeline
  - Dependency and image scanning

### Known Issues

- Web app signing flow is stubbed (requires Freighter or server-side signer implementation)
- Off-ramp integration is out-of-band (requires external service coordination)
- Contract audit not yet completed

### Security

- No publicly disclosed vulnerabilities at release time

## Unreleased

### Planned

- E2E testing between web app and contract
- OpenAPI documentation for potential backend API
- Performance benchmarking suite
- Extended test coverage for edge cases
- Multi-signature admin support

---

**Version History:**
- 0.1.0: Initial release
