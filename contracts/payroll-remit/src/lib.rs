//! StellarRemit payroll-remit contract
//!
//! Extends a single-recipient payroll pattern into a batch, multi-recipient
//! cross-border payout rail. On-chain settlement happens in one token
//! (USDC or native XLM); the last-mile fiat delivery (NGN off-ramp) is
//! confirmed out-of-band by an off-ramp partner and recorded on-chain via
//! `record_offramp` for auditability.
//!
//! ## Role-based access control
//!
//! The contract admin can delegate specific permissions to sub-admin addresses
//! using `set_role`. Three roles are defined:
//!
//! | Role               | `add_recipient` | `batch_payout` | `record_offramp` | `set_role` |
//! |--------------------|:-:|:-:|:-:|:-:|
//! | `ContractAdmin`    | ✓ | ✓ | ✓ | ✓ |
//! | `RecipientManager` | ✓ | ✗ | ✗ | ✗ |
//! | `OffRampRecorder`  | ✗ | ✗ | ✓ | ✗ |
//!
//! Only the top-level contract admin stored at `DataKey::Admin` can call
//! `set_role`. Roles cannot be self-escalated — a sub-admin cannot grant
//! roles to themselves or others.
//!
//! ## Events
//!
//! All state-changing operations emit a Soroban contract event so that
//! indexers, off-ramp partners, and audit tooling can track every lifecycle
//! transition without reading contract storage directly.
//!
//! | topic[0] (symbol) | topic[1]         | data payload                               |
//! |-------------------|------------------|--------------------------------------------|
//! | `"init"`          | —                | `{ admin, token, timestamp }`              |
//! | `"rcpt_add"`      | recipient addr   | `{ off_ramp_ref, timestamp }`              |
//! | `"payout"`        | —                | `{ recipients, amounts, timestamp }`       |
//! | `"offramp"`       | recipient addr   | `{ status, timestamp }`                    |
//! | `"role_set"`      | grantee addr     | `{ role, timestamp }`                      |

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
    Role(Address),
    Recipient(Address),
    History(Address),
}

// ─── domain types ─────────────────────────────────────────────────────────────

/// Permission role assigned to a sub-admin address.
///
/// Only the top-level `Admin` (stored at `DataKey::Admin`) may call
/// `set_role`. Sub-admins cannot escalate their own or others' privileges.
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum Role {
    /// Full access: can manage recipients, execute payouts, record off-ramp
    /// results, and delegate roles to others.
    ContractAdmin,
    /// Restricted: can call `add_recipient` only.
    RecipientManager,
    /// Restricted: can call `record_offramp` only.
    OffRampRecorder,
}

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

/// Emitted by `set_role`.
#[contracttype]
#[derive(Clone)]
pub struct RoleSetEvent {
    pub role: Role,
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
    /// Emits: `init` event.
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

    /// Delegate a role to a sub-admin address.
    ///
    /// Only the top-level contract admin may call this function. Sub-admins
    /// with `ContractAdmin`, `RecipientManager`, or `OffRampRecorder` roles
    /// cannot escalate their own or anyone else's privileges.
    ///
    /// Roles are persisted in contract storage under `DataKey::Role(grantee)`.
    ///
    /// Emits: `role_set` event with the grantee as topic[1].
    pub fn set_role(
        env: Env,
        admin: Address,
        grantee: Address,
        role: Role,
    ) -> Result<(), PayrollError> {
        // Only the top-level admin stored at DataKey::Admin can grant roles.
        Self::require_top_admin(&env, &admin)?;

        env.storage()
            .persistent()
            .set(&DataKey::Role(grantee.clone()), &role);

        env.events().publish(
            (symbol_short!("role_set"), grantee),
            RoleSetEvent {
                role,
                timestamp: env.ledger().timestamp(),
            },
        );

        Ok(())
    }

    /// Read the role assigned to an address, if any.
    pub fn get_role(env: Env, address: Address) -> Option<Role> {
        env.storage().persistent().get(&DataKey::Role(address))
    }

    /// Register (or update) a payout recipient with an off-ramp reference.
    /// The off_ramp_ref should be an opaque/hashed pointer to the
    /// recipient's local bank account or mobile-money handle — never store
    /// raw account numbers on-chain.
    ///
    /// Authorized callers: `ContractAdmin` role or top-level admin,
    ///                      `RecipientManager` role.
    ///
    /// Emits: `rcpt_add` event with the recipient address as topic[1].
    pub fn add_recipient(
        env: Env,
        caller: Address,
        recipient: Address,
        off_ramp_ref: String,
    ) -> Result<(), PayrollError> {
        Self::require_role_any(
            &env,
            &caller,
            &[Role::ContractAdmin, Role::RecipientManager],
        )?;

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
    /// Transfers the settlement token from the caller/treasury to each
    /// recipient's contract-tracked balance and appends a Pending
    /// off-ramp record for each.
    ///
    /// Authorized callers: top-level admin or `ContractAdmin` role only.
    ///
    /// Emits: `payout` event containing the full recipients/amounts vectors
    /// and the ledger timestamp so the batch is fully reconstructable from
    /// the event alone.
    pub fn batch_payout(
        env: Env,
        caller: Address,
        recipients: Vec<Address>,
        amounts: Vec<i128>,
    ) -> Result<(), PayrollError> {
        Self::require_role_any(&env, &caller, &[Role::ContractAdmin])?;

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

            // On-chain settlement leg: caller/treasury -> recipient.
            token_client.transfer(&caller, &recipient, &amount);

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
    /// Authorized callers: top-level admin, `ContractAdmin` role,
    ///                      or `OffRampRecorder` role.
    ///
    /// Emits: `offramp` event with the recipient address as topic[1].
    pub fn record_offramp(
        env: Env,
        caller: Address,
        recipient: Address,
        status: OffRampStatus,
    ) -> Result<(), PayrollError> {
        Self::require_role_any(&env, &caller, &[Role::ContractAdmin, Role::OffRampRecorder])?;

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

    // ─── internal auth helpers ────────────────────────────────────────────────

    /// Require that `caller` is the top-level contract admin stored at
    /// `DataKey::Admin`. Used exclusively by `set_role` to prevent privilege
    /// escalation by sub-admins.
    fn require_top_admin(env: &Env, caller: &Address) -> Result<(), PayrollError> {
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

    /// Require that `caller` is either:
    /// - the top-level contract admin (`DataKey::Admin`), or
    /// - an address whose stored `Role` is one of `allowed_roles`.
    ///
    /// Always calls `caller.require_auth()` so Soroban verifies the
    /// transaction signature regardless of which path matches.
    fn require_role_any(
        env: &Env,
        caller: &Address,
        allowed_roles: &[Role],
    ) -> Result<(), PayrollError> {
        // Check contract not yet initialized.
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(PayrollError::NotInitialized);
        }

        let top_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(PayrollError::NotInitialized)?;

        // Top-level admin always has full access.
        if *caller == top_admin {
            caller.require_auth();
            return Ok(());
        }

        // Check the caller's assigned role.
        let stored_role: Option<Role> = env
            .storage()
            .persistent()
            .get(&DataKey::Role(caller.clone()));

        let authorized = match stored_role {
            Some(ref role) => allowed_roles.iter().any(|r| r == role),
            None => false,
        };

        if !authorized {
            return Err(PayrollError::Unauthorized);
        }

        caller.require_auth();
        Ok(())
    }
}

mod test;
