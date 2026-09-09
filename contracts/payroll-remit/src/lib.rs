//! StellarRemit payroll-remit contract
//!
//! Extends a single-recipient payroll pattern into a batch, multi-recipient
//! cross-border payout rail. On-chain settlement happens in one token
//! (USDC or native XLM); the last-mile fiat delivery (NGN off-ramp) is
//! confirmed out-of-band by an off-ramp partner and recorded on-chain via
//! `record_offramp` for auditability.
//!
//! ## Events
//!
//! All state-changing operations emit a Soroban contract event so that
//! indexers, off-ramp partners, and audit tooling can track every lifecycle
//! transition without reading contract storage directly.
//!
//! | topic[0] (symbol) | topic[1]         | data payload                               |
//! |-------------------|------------------|--------------------------------------------|
//! | `"initialized"`   | —                | `{ admin, token, timestamp }`              |
//! | `"recipient_added"` | recipient addr | `{ off_ramp_ref, timestamp }`              |
//! | `"payout_batch"`  | —                | `{ recipients, amounts, timestamp }`       |
//! | `"offramp_recorded"` | recipient addr| `{ status, timestamp }`                    |

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

// ─── storage keys ────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Recipient(Address),
    History(Address),
}

// ─── domain types ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum OffRampStatus {
    Pending,
    Confirmed,
    Failed,
}

#[contracttype]
#[derive(Clone)]
pub struct RecipientInfo {
    pub off_ramp_ref: String, // hashed/opaque reference to bank/mobile-money handle
    pub total_received: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct PayoutRecord {
    pub amount: i128,
    pub timestamp: u64,
    pub status: OffRampStatus,
}

// ─── event data payloads ──────────────────────────────────────────────────────

/// Emitted by `init`.
#[contracttype]
#[derive(Clone)]
pub struct InitializedEvent {
    pub admin: Address,
    pub token: Address,
    pub timestamp: u64,
}

/// Emitted by `add_recipient`.
#[contracttype]
#[derive(Clone)]
pub struct RecipientAddedEvent {
    pub off_ramp_ref: String,
    pub timestamp: u64,
}

/// Emitted by `batch_payout`.
#[contracttype]
#[derive(Clone)]
pub struct PayoutBatchEvent {
    pub recipients: Vec<Address>,
    pub amounts: Vec<i128>,
    pub timestamp: u64,
}

/// Emitted by `record_offramp`.
#[contracttype]
#[derive(Clone)]
pub struct OffRampRecordedEvent {
    pub status: OffRampStatus,
    pub timestamp: u64,
}

// ─── errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum PayrollError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    RecipientNotFound = 4,
    MismatchedBatch = 5,
    EmptyBatch = 6,
    InvalidAmount = 7,
}

// ─── contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct PayrollRemit;

#[contractimpl]
impl PayrollRemit {
    /// Initialize the contract with an admin and the settlement token
    /// (e.g. a USDC Stellar Asset Contract address, or native XLM's SAC).
    ///
    /// Emits: `initialized` event.
    pub fn init(env: Env, admin: Address, token: Address) -> Result<(), PayrollError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(PayrollError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);

        env.events().publish(
            (symbol_short!("init"),),
            InitializedEvent {
                admin,
                token,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Register (or update) a payout recipient with an off-ramp reference.
    /// The off_ramp_ref should be an opaque/hashed pointer to the
    /// recipient's local bank account or mobile-money handle — never store
    /// raw account numbers on-chain.
    ///
    /// Emits: `rcpt_added` event with the recipient address as a second topic
    /// so subscribers can filter by specific recipient.
    pub fn add_recipient(
        env: Env,
        admin: Address,
        recipient: Address,
        off_ramp_ref: String,
    ) -> Result<(), PayrollError> {
        Self::require_admin(&env, &admin)?;
        let info = RecipientInfo {
            off_ramp_ref: off_ramp_ref.clone(),
            total_received: 0,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Recipient(recipient.clone()), &info);

        env.events().publish(
            (symbol_short!("rcpt_add"), recipient),
            RecipientAddedEvent {
                off_ramp_ref,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Settle a batch of payouts in a single call. `recipients` and
    /// `amounts` must be the same length and are paired by index.
    /// Transfers the settlement token from the admin/treasury to each
    /// recipient's contract-tracked balance and appends a Pending
    /// off-ramp record for each.
    ///
    /// Emits: `payout` event containing the full recipients/amounts vectors
    /// and the ledger timestamp so the batch is fully reconstructable from
    /// the event alone.
    pub fn batch_payout(
        env: Env,
        admin: Address,
        recipients: Vec<Address>,
        amounts: Vec<i128>,
    ) -> Result<(), PayrollError> {
        Self::require_admin(&env, &admin)?;

        if recipients.len() != amounts.len() {
            return Err(PayrollError::MismatchedBatch);
        }
        if recipients.is_empty() {
            return Err(PayrollError::EmptyBatch);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(PayrollError::NotInitialized)?;
        let token_client = soroban_sdk::token::Client::new(&env, &token);

        let timestamp = env.ledger().timestamp();

        for i in 0..recipients.len() {
            let recipient = recipients.get(i).unwrap();
            let amount = amounts.get(i).unwrap();

            if amount <= 0 {
                return Err(PayrollError::InvalidAmount);
            }

            let mut info: RecipientInfo = env
                .storage()
                .persistent()
                .get(&DataKey::Recipient(recipient.clone()))
                .ok_or(PayrollError::RecipientNotFound)?;

            // On-chain settlement leg: admin/treasury -> recipient.
            token_client.transfer(&admin, &recipient, &amount);

            info.total_received += amount;
            env.storage()
                .persistent()
                .set(&DataKey::Recipient(recipient.clone()), &info);

            let record = PayoutRecord {
                amount,
                timestamp,
                status: OffRampStatus::Pending,
            };
            let mut history: Vec<PayoutRecord> = env
                .storage()
                .persistent()
                .get(&DataKey::History(recipient.clone()))
                .unwrap_or_else(|| Vec::new(&env));
            history.push_back(record);
            env.storage()
                .persistent()
                .set(&DataKey::History(recipient), &history);
        }

        // Single batch-level event: contains the full recipients/amounts so
        // indexers can reconstruct the batch without reading storage.
        env.events().publish(
            (symbol_short!("payout"),),
            PayoutBatchEvent {
                recipients,
                amounts,
                timestamp,
            },
        );

        Ok(())
    }

    /// Off-ramp partner (via admin-controlled call) confirms whether the
    /// fiat leg (NGN delivery) for a recipient's most recent payout
    /// succeeded. Keeps an auditable link between on-chain settlement and
    /// off-chain delivery.
    ///
    /// Emits: `offramp` event with the recipient address as a second topic
    /// so subscribers can filter by specific recipient.
    pub fn record_offramp(
        env: Env,
        admin: Address,
        recipient: Address,
        status: OffRampStatus,
    ) -> Result<(), PayrollError> {
        Self::require_admin(&env, &admin)?;

        let mut history: Vec<PayoutRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::History(recipient.clone()))
            .ok_or(PayrollError::RecipientNotFound)?;

        if let Some(mut last) = history.pop_back() {
            last.status = status.clone();
            history.push_back(last);
            env.storage()
                .persistent()
                .set(&DataKey::History(recipient.clone()), &history);
        }

        env.events().publish(
            (symbol_short!("offramp"), recipient),
            OffRampRecordedEvent {
                status,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Read a recipient's full payout history.
    pub fn get_history(env: Env, recipient: Address) -> Vec<PayoutRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::History(recipient))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Read a recipient's registration info.
    pub fn get_recipient(env: Env, recipient: Address) -> Option<RecipientInfo> {
        env.storage()
            .persistent()
            .get(&DataKey::Recipient(recipient))
    }

    fn require_admin(env: &Env, caller: &Address) -> Result<(), PayrollError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(PayrollError::NotInitialized)?;
        if admin != *caller {
            return Err(PayrollError::Unauthorized);
        }
        caller.require_auth();
        Ok(())
    }
}

mod test;
