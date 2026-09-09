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

## Events

All state-changing operations emit a Soroban contract event. Indexers, off-ramp partners, and audit tooling can reconstruct every lifecycle transition from events alone without reading contract storage.

### Event topic conventions

Each event has one or two topics followed by a typed data payload:

| topic\[0\] | topic\[1\] | Emitted by |
|---|---|---|
| `"init"` | — | `init` |
| `"rcpt_add"` | `recipient: Address` | `add_recipient` |
| `"payout"` | — | `batch_payout` |
| `"offramp"` | `recipient: Address` | `record_offramp` |

Events with a `recipient` in topic\[1\] allow subscribers to filter by a specific recipient address without decoding the data payload.

---

### `InitializedEvent`

Emitted once when `init` is called successfully.

**Topics:** `("init",)`

**Data payload:**

```rust
pub struct InitializedEvent {
    pub admin: Address,   // Contract administrator
    pub token: Address,   // Settlement token (USDC/XLM SAC address)
    pub timestamp: u64,   // Ledger timestamp at initialization
}
```

**Example (pseudocode):**
```
topics: ["init"]
data:   { admin: "GADMIN…", token: "GAUSDC…", timestamp: 1700000000 }
```

---

### `RecipientAddedEvent`

Emitted each time `add_recipient` registers or updates a recipient.

**Topics:** `("rcpt_add", recipient: Address)`

**Data payload:**

```rust
pub struct RecipientAddedEvent {
    pub off_ramp_ref: String,   // Opaque/hashed off-ramp handle (never raw account number)
    pub timestamp: u64,         // Ledger timestamp at registration
}
```

**Example (pseudocode):**
```
topics: ["rcpt_add", "GRECIP…"]
data:   { off_ramp_ref: "hash:acct-001", timestamp: 1700000100 }
```

---

### `PayoutBatchEvent`

Emitted once per `batch_payout` call. The full `recipients`/`amounts` vectors are included so the batch is fully reconstructable from the event without reading storage.

**Topics:** `("payout",)`

**Data payload:**

```rust
pub struct PayoutBatchEvent {
    pub recipients: Vec<Address>,   // Ordered list of recipient addresses
    pub amounts: Vec<i128>,         // Corresponding payout amounts in stroops
    pub timestamp: u64,             // Ledger timestamp of the batch
}
```

`recipients[i]` and `amounts[i]` are always paired: the amount at index _i_ was sent to the recipient at index _i_.

**Example (pseudocode):**
```
topics: ["payout"]
data:   {
  recipients: ["GRECIP1…", "GRECIP2…"],
  amounts:    [1000, 2500],
  timestamp:  1700000999
}
```

---

### `OffRampRecordedEvent`

Emitted each time `record_offramp` updates the fiat-delivery status for a recipient.

**Topics:** `("offramp", recipient: Address)`

**Data payload:**

```rust
pub struct OffRampRecordedEvent {
    pub status: OffRampStatus,   // Confirmed | Failed (never Pending — that is set by batch_payout)
    pub timestamp: u64,          // Ledger timestamp of the status update
}
```

**Example (pseudocode):**
```
topics: ["offramp", "GRECIP…"]
data:   { status: Confirmed, timestamp: 1700002000 }
```

---

### Indexer integration notes

- All four topic\[0\] symbols are ≤ 9 characters, satisfying the `symbol_short!` constraint.
- `PayoutBatchEvent` is the primary event for payment rail auditing: a single event per transaction contains the complete batch.
- `OffRampRecordedEvent` closes the loop: pair it with the preceding `PayoutBatchEvent` (matched by `recipient` topic and ordered `timestamp`) to confirm end-to-end settlement.
- `RecipientAddedEvent` and `OffRampRecordedEvent` carry the recipient address as topic\[1\], enabling O(1) filter-by-recipient on any Soroban event indexer.

---

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
