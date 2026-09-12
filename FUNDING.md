# StellarRemit Funding Brief

## Executive summary

StellarRemit is an open-source cross-border payout rail for Nigeria. It helps diaspora senders, payroll teams, and remittance services settle multiple payouts on Stellar, with a transparent handoff to local NGN off-ramp partners.

The current product includes a Soroban payroll contract, delegated operational roles, payout history, fee estimation, and a web dashboard. Funding will move the project from a testnet-capable prototype to a partner-ready pilot with stronger security, observability, and off-ramp integration.

## The problem

Nigeria-bound payments are often expensive, slow, and difficult to reconcile. Payroll managers and remittance operators also have to coordinate recipient data, payment status, and local settlement across disconnected systems.

StellarRemit focuses on one practical wedge: a single batch payout can settle many recipients on-chain while preserving an auditable status trail for the NGN leg.

## Why Stellar

- Fast finality and low transaction costs support frequent, smaller payouts.
- Soroban gives the payout rules a public, deterministic execution layer.
- USDC settlement reduces dependence on bespoke ledger reconciliation.
- Stellar wallets and explorers make payment status independently verifiable.

## What funding unlocks

### 1. Partner-ready settlement

- Integrate one NGN off-ramp partner sandbox.
- Define the partner callback and reconciliation contract.
- Demonstrate end-to-end payout status from USDC transfer to NGN confirmation.

### 2. Security and operational readiness

- Commission an independent review of the Soroban contract.
- Add role-management runbooks, key rotation, rate limits, and incident procedures.
- Add monitoring for failed transactions, pending off-ramp records, and unusual payout activity.

### 3. Pilot adoption

- Recruit a small cohort of diaspora senders, payroll operators, or remittance providers.
- Run a documented testnet pilot before any mainnet funds are handled.
- Publish anonymized pilot results and lessons learned.

## Proposed milestones

| Phase | Deliverables | Evidence of completion |
| --- | --- | --- |
| Foundation | Testnet deployment, contract tests, dashboard demo, role delegation | Public deployment notes, test results, recorded walkthrough |
| Integration | Off-ramp sandbox, callback flow, reconciliation, failure handling | End-to-end sandbox transaction and partner integration notes |
| Readiness | Security review, monitoring, runbooks, support process | Review report, remediation log, operational checklist |
| Pilot | Controlled users and test transactions | Anonymized metrics, user feedback, pilot report |

## Success metrics

The pilot should report these metrics publicly, with dates and network used:

- Number of successful batch payout transactions.
- Number of recipients paid and median batch size.
- Median time from on-chain settlement to NGN confirmation.
- Total and median transaction cost in XLM.
- Off-ramp confirmation, failure, and retry rates.
- Contract errors, incidents, and time to resolution.
- Number of active pilot operators and repeat payout runs.

These are targets to measure during the funded work, not claims about current production usage.

## Risk controls

- Testnet-only operation until contract review and partner controls are complete.
- No raw bank or mobile-money account numbers stored on-chain; only opaque references are supported.
- Least-privilege roles separate recipient management, payout execution, and off-ramp recording.
- Admin keys should use a controlled signer and documented rotation process.
- Payouts should be reconciled against partner confirmations before the pilot is expanded.

## Budget framework

The final application should attach a line-item budget in the fund's requested currency. Recommended categories are:

- Contract security review and remediation.
- Off-ramp sandbox integration and compliance/operations work.
- Engineering for monitoring, reconciliation, and pilot support.
- Testnet pilot incentives and user research.
- Documentation, open-source maintenance, and reporting.

No mainnet customer funds should be included in the MVP budget assumption.

## What reviewers can verify today

- [Soroban contract API](contracts/payroll-remit/CONTRACT_ABI.md)
- [Contract implementation](contracts/payroll-remit/src/lib.rs)
- [Contract tests](contracts/payroll-remit/src/test.rs)
- [Web dashboard](apps/web/src/app/dashboard/page.tsx)
- [Local development instructions](README.md)

Before submission, add named contributors, links to the testnet deployment, a dated demo, the requested amount, and any confirmed partner or pilot commitments. Those details are intentionally not presented as facts until they exist.
