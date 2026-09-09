# PayrollRemit Smart Contract ABI

## Overview

The `PayrollRemit` contract implements a batch, multi-recipient cross-border payout rail on Stellar's Soroban platform. It supports on-chain settlement in USDC or XLM, with off-ramp settlement confirmed out-of-band by an off-ramp partner.

## Type Definitions

### DataKey

Enum used as storage keys:

```rust
pub enum DataKey {
    Admin,                      // Address of contract admin
    Token,                      // Settlement token (USDC/XLM) address
    Recipient(Address),         // RecipientInfo indexed by recipient address
    History(Address),           // Vec<PayoutRecord> indexed by recipient address
}
```

### OffRampStatus

Status of an off-ramp payout transaction:

```rust
pub enum OffRampStatus {
    Pending,                    // Payout pending off-ramp confirmation
    Confirmed,                  // Off-ramp settlement confirmed
    Failed,                     // Off-ramp settlement failed
}
```

### RecipientInfo

Information about a registered recipient:

```rust
pub struct RecipientInfo {
    pub off_ramp_ref: String,   // Opaque/hashed reference to bank/mobile-money handle
    pub total_received: i128,   // Cumulative amount received in stroops/smallest unit
}
```

### PayoutRecord

Record of a single payout transaction:

```rust
pub struct PayoutRecord {
    pub amount: i128,           // Amount transferred in stroops/smallest unit
    pub timestamp: u64,         // Unix timestamp of payout
    pub status: OffRampStatus,  // Current status of off-ramp settlement
}
```

### PayrollError

Error codes returned by contract operations:

```rust
pub enum PayrollError {
    NotInitialized = 1,         // Contract has not been initialized
    AlreadyInitialized = 2,     // Contract already initialized
    Unauthorized = 3,           // Caller is not authorized (admin required)
    RecipientNotFound = 4,      // Recipient not registered
    MismatchedBatch = 5,        // recipients and amounts arrays length mismatch
    EmptyBatch = 6,             // Batch is empty
    InvalidAmount = 7,          // Amount is invalid (e.g., negative/zero)
}
```

## Contract Functions

### init

Initialize the contract with an admin address and settlement token.

**Parameters:**
- `env: Env` - Soroban environment
- `admin: Address` - Address of the contract administrator
- `token: Address` - Address of settlement token (USDC/XLM SAC)

**Returns:** `Result<(), PayrollError>`

**Errors:**
- `AlreadyInitialized` - If contract is already initialized

**Authorization:** Requires `admin.require_auth()`

**Example:**
```
init(env, admin_address, usdc_token_address)
```

### add_recipient

Register a new recipient or update an existing recipient's off-ramp reference.

**Parameters:**
- `env: Env` - Soroban environment
- `admin: Address` - Contract administrator (for authorization)
- `recipient: Address` - Recipient's Stellar address
- `off_ramp_ref: String` - Opaque/hashed reference to recipient's bank or mobile-money account

**Returns:** `Result<(), PayrollError>`

**Errors:**
- `Unauthorized` - If caller is not the admin
- `NotInitialized` - If contract not initialized

**Authorization:** Requires `admin.require_auth()`

**Note:** The `off_ramp_ref` should never contain raw account numbers; it should be a hashed or opaque identifier managed by the off-ramp service provider.

### batch_payout

Execute a batch payout to multiple recipients in a single transaction.

**Parameters:**
- `env: Env` - Soroban environment
- `admin: Address` - Contract administrator (for authorization)
- `recipients: Vec<Address>` - Array of recipient Stellar addresses
- `amounts: Vec<i128>` - Array of payout amounts in stroops (paired by index with recipients)

**Returns:** `Result<(), PayrollError>`

**Errors:**
- `Unauthorized` - If caller is not the admin
- `NotInitialized` - If contract not initialized
- `MismatchedBatch` - If recipients.len() != amounts.len()
- `EmptyBatch` - If recipients is empty
- `InvalidAmount` - If any amount is <= 0
- `RecipientNotFound` - If any recipient is not registered

**Authorization:** Requires `admin.require_auth()`

**Behavior:**
1. Validates all recipients are registered
2. Validates all amounts are positive and arrays match in length
3. Transfers settlement tokens from admin to each recipient
4. Creates a `Pending` `PayoutRecord` for each recipient
5. Appends payout records to recipient history

### record_offramp

Record the result of an off-ramp settlement (confirmation or failure).

**Parameters:**
- `env: Env` - Soroban environment
- `admin: Address` - Contract administrator (for authorization)
- `recipient: Address` - Recipient's Stellar address
- `status: OffRampStatus` - Final status (`Confirmed` or `Failed`)

**Returns:** `Result<(), PayrollError>`

**Errors:**
- `Unauthorized` - If caller is not the admin
- `NotInitialized` - If contract not initialized
- `RecipientNotFound` - If recipient not registered

**Authorization:** Requires `admin.require_auth()`

**Behavior:**
1. Validates recipient is registered
2. Updates the most recent `PayoutRecord` for the recipient to the new status
3. If status is `Failed`, the on-chain tokens remain with the recipient but off-ramp settlement did not complete

### query_recipient

Query information about a registered recipient.

**Parameters:**
- `env: Env` - Soroban environment
- `recipient: Address` - Recipient's Stellar address

**Returns:** `Result<RecipientInfo, PayrollError>`

**Errors:**
- `NotInitialized` - If contract not initialized
- `RecipientNotFound` - If recipient not registered

### query_history

Query the payout history for a recipient.

**Parameters:**
- `env: Env` - Soroban environment
- `recipient: Address` - Recipient's Stellar address

**Returns:** `Result<Vec<PayoutRecord>, PayrollError>`

**Errors:**
- `NotInitialized` - If contract not initialized
- `RecipientNotFound` - If recipient not registered

## Data Storage

### Instance Storage

- `DataKey::Admin` → `Address`
- `DataKey::Token` → `Address`

### Persistent Storage

- `DataKey::Recipient(address)` → `RecipientInfo`
- `DataKey::History(address)` → `Vec<PayoutRecord>`

## Security Considerations

1. **Off-ramp References:** Always hash/obfuscate bank account numbers or mobile-money handles before storing as `off_ramp_ref`.
2. **Authorization:** All state-changing operations require admin authorization.
3. **Amount Validation:** All amounts must be positive; amounts are in stroops (smallest unit).
4. **Token Transfers:** Settlement token transfers are initiated by the contract; the token must implement the Stellar Asset Contract interface.

## Deployment

Deploy using the Soroban CLI:

```bash
soroban contract deploy \
  --wasm payroll_remit.wasm \
  --source admin_key_name \
  --network testnet
```

Then initialize:

```bash
soroban contract invoke \
  --id CONTRACT_ID \
  --source admin_key_name \
  --network testnet \
  -- \
  init \
  --admin ADMIN_ADDRESS \
  --token TOKEN_ADDRESS
```
