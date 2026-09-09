//! StellarRemit payroll-remit contract
//!
//! Extends a single-recipient payroll pattern into a batch, multi-recipient
//! cross-border payout rail. On-chain settlement happens in one token
//! (USDC or native XLM); the last-mile fiat delivery (NGN off-ramp) is
//! confirmed out-of-band by an off-ramp partner and recorded on-chain via
//! `record_offramp` for auditability.

#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Vec, String};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Recipient(Address),
    History(Address),
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

#[contract]
pub struct PayrollRemit;

#[contractimpl]
impl PayrollRemit {
    /// Initialize the contract with an admin and the settlement token
    /// (e.g. a USDC Stellar Asset Contract address, or native XLM's SAC).
    pub fn init(env: Env, admin: Address, token: Address) -> Result<(), PayrollError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(PayrollError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        Ok(())
    }

    /// Register (or update) a payout recipient with an off-ramp reference.
    /// The off_ramp_ref should be an opaque/hashed pointer to the
    /// recipient's local bank account or mobile-money handle — never store
    /// raw account numbers on-chain.
    pub fn add_recipient(
        env: Env,
        admin: Address,
        recipient: Address,
        off_ramp_ref: String,
    ) -> Result<(), PayrollError> {
        Self::require_admin(&env, &admin)?;
        let info = RecipientInfo {
            off_ramp_ref,
            total_received: 0,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Recipient(recipient), &info);
        Ok(())
    }

    /// Settle a batch of payouts in a single call. `recipients` and
    /// `amounts` must be the same length and are paired by index.
    /// Transfers the settlement token from the admin/treasury to each
    /// recipient's contract-tracked balance and appends a Pending
    /// off-ramp record for each.
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
                timestamp: env.ledger().timestamp(),
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

        Ok(())
    }

    /// Off-ramp partner (via admin-controlled call) confirms whether the
    /// fiat leg (NGN delivery) for a recipient's most recent payout
    /// succeeded. Keeps an auditable link between on-chain settlement and
    /// off-chain delivery.
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
            last.status = status;
            history.push_back(last);
            env.storage()
                .persistent()
                .set(&DataKey::History(recipient), &history);
        }
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
        env.storage().persistent().get(&DataKey::Recipient(recipient))
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
