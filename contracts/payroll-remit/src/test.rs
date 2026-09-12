#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, vec, Env, IntoVal,
};

fn create_token_contract<'a>(
    env: &Env,
    admin: &Address,
) -> (Address, token::StellarAssetClient<'a>, token::Client<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let address = sac.address();
    (
        address.clone(),
        token::StellarAssetClient::new(env, &address),
        token::Client::new(env, &address),
    )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/// Find events emitted by `contract_id` whose first topic matches `topic0`.
/// Returns `(topics Vec<Val>, data Val)` for the first match.
fn find_event(
    env: &Env,
    all: &soroban_sdk::Vec<(Address, soroban_sdk::Vec<Val>, Val)>,
    contract_id: &Address,
    topic0: soroban_sdk::Symbol,
) -> Option<(soroban_sdk::Vec<Val>, Val)> {
    for i in 0..all.len() {
        let (emitter, topics, data) = all.get(i).unwrap();
        if emitter == *contract_id {
            if let Some(t0) = topics.get(0) {
                if t0 == topic0.into_val(env) {
                    return Some((topics, data));
                }
            }
        }
    }
    None
}

/// Initialise a contract and return (contract_id, client, admin, token_addr).
fn setup(
    env: &Env,
) -> (
    Address,
    PayrollRemitClient,
    Address,
    Address,
    token::StellarAssetClient,
) {
    let admin = Address::generate(env);
    let (token_addr, token_admin, _) = create_token_contract(env, &admin);
    let contract_id = env.register(PayrollRemit, ());
    let client = PayrollRemitClient::new(env, &contract_id);
    client.init(&admin, &token_addr);
    (contract_id, client, admin, token_addr, token_admin)
}

// ─── init ─────────────────────────────────────────────────────────────────────

#[test]
fn test_init_and_add_recipient() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (token_addr, _, _) = create_token_contract(&env, &admin);

    let contract_id = env.register(PayrollRemit, ());
    let client = PayrollRemitClient::new(&env, &contract_id);

    client.init(&admin, &token_addr);

    let recipient = Address::generate(&env);
    client.add_recipient(&admin, &recipient, &String::from_str(&env, "hash:acct-001"));

    let info = client.get_recipient(&recipient).unwrap();
    assert_eq!(info.total_received, 0);
}

#[test]
fn test_init_emits_initialized_event() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);

    let admin = Address::generate(&env);
    let (token_addr, _, _) = create_token_contract(&env, &admin);

    let contract_id = env.register(PayrollRemit, ());
    let client = PayrollRemitClient::new(&env, &contract_id);

    client.init(&admin, &token_addr);

    let all = env.events().all();
    let result = find_event(&env, &all, &contract_id, symbol_short!("init"));
    assert!(result.is_some(), "expected 'init' event to be emitted");

    let (_topics, data) = result.unwrap();
    let payload: InitializedEvent = InitializedEvent::try_from_val(&env, &data)
        .expect("data should decode as InitializedEvent");
    assert_eq!(payload.admin, admin);
    assert_eq!(payload.token, token_addr);
    assert_eq!(payload.timestamp, 1_700_000_000);
}

// ─── add_recipient ────────────────────────────────────────────────────────────

#[test]
fn test_add_recipient_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_100);

    let admin = Address::generate(&env);
    let (token_addr, _, _) = create_token_contract(&env, &admin);

    let contract_id = env.register(PayrollRemit, ());
    let client = PayrollRemitClient::new(&env, &contract_id);
    client.init(&admin, &token_addr);

    let recipient = Address::generate(&env);
    client.add_recipient(&admin, &recipient, &String::from_str(&env, "hash:acct-007"));

    let all = env.events().all();

    let mut found = false;
    for i in 0..all.len() {
        let (emitter, topics, data) = all.get(i).unwrap();
        if emitter != contract_id {
            continue;
        }
        let t0_match = topics
            .get(0)
            .map(|t| t == symbol_short!("rcpt_add").into_val(&env))
            .unwrap_or(false);
        let t1_match = topics
            .get(1)
            .map(|t| t == recipient.clone().into_val(&env))
            .unwrap_or(false);
        if t0_match && t1_match {
            let payload: RecipientAddedEvent = RecipientAddedEvent::try_from_val(&env, &data)
                .expect("data should decode as RecipientAddedEvent");
            assert_eq!(
                payload.off_ramp_ref,
                String::from_str(&env, "hash:acct-007")
            );
            assert_eq!(payload.timestamp, 1_700_000_100);
            found = true;
            break;
        }
    }
    assert!(
        found,
        "expected 'rcpt_add' event with correct recipient topic"
    );
}

// ─── batch_payout ─────────────────────────────────────────────────────────────

#[test]
fn test_batch_payout_settles_and_records_history() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);

    let admin = Address::generate(&env);
    let (token_addr, token_admin, token_client) = create_token_contract(&env, &admin);
    token_admin.mint(&admin, &1_000_000);

    let contract_id = env.register(PayrollRemit, ());
    let client = PayrollRemitClient::new(&env, &contract_id);
    client.init(&admin, &token_addr);

    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);
    client.add_recipient(&admin, &r1, &String::from_str(&env, "hash:acct-001"));
    client.add_recipient(&admin, &r2, &String::from_str(&env, "hash:acct-002"));

    let recipients = soroban_sdk::Vec::from_array(&env, [r1.clone(), r2.clone()]);
    let amounts = soroban_sdk::Vec::from_array(&env, [1_000i128, 2_500i128]);

    client.batch_payout(&admin, &recipients, &amounts);

    assert_eq!(token_client.balance(&r1), 1_000);
    assert_eq!(token_client.balance(&r2), 2_500);

    let hist1 = client.get_history(&r1);
    assert_eq!(hist1.len(), 1);
    assert_eq!(hist1.get(0).unwrap().amount, 1_000);

    client.record_offramp(&admin, &r1, &OffRampStatus::Confirmed);
    let hist1_after = client.get_history(&r1);
    match hist1_after.get(0).unwrap().status {
        OffRampStatus::Confirmed => {}
        _ => panic!("expected Confirmed status"),
    }
}

#[test]
fn test_batch_payout_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_999);

    let admin = Address::generate(&env);
    let (token_addr, token_admin, _) = create_token_contract(&env, &admin);
    token_admin.mint(&admin, &1_000_000);

    let contract_id = env.register(PayrollRemit, ());
    let client = PayrollRemitClient::new(&env, &contract_id);
    client.init(&admin, &token_addr);

    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);
    client.add_recipient(&admin, &r1, &String::from_str(&env, "hash:a"));
    client.add_recipient(&admin, &r2, &String::from_str(&env, "hash:b"));

    let recipients = soroban_sdk::Vec::from_array(&env, [r1.clone(), r2.clone()]);
    let amounts = soroban_sdk::Vec::from_array(&env, [500i128, 1_500i128]);
    client.batch_payout(&admin, &recipients, &amounts);

    let all = env.events().all();
    let result = find_event(&env, &all, &contract_id, symbol_short!("payout"));
    assert!(result.is_some(), "expected 'payout' event to be emitted");

    let (_topics, data) = result.unwrap();
    let payload: PayoutBatchEvent = PayoutBatchEvent::try_from_val(&env, &data)
        .expect("data should decode as PayoutBatchEvent");
    assert_eq!(payload.recipients.len(), 2);
    assert_eq!(payload.amounts.get(0).unwrap(), 500i128);
    assert_eq!(payload.amounts.get(1).unwrap(), 1_500i128);
    assert_eq!(payload.timestamp, 1_700_000_999);
}

#[test]
fn test_batch_payout_rejects_mismatched_lengths() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (token_addr, _, _) = create_token_contract(&env, &admin);

    let contract_id = env.register(PayrollRemit, ());
    let client = PayrollRemitClient::new(&env, &contract_id);
    client.init(&admin, &token_addr);

    let r1 = Address::generate(&env);
    client.add_recipient(&admin, &r1, &String::from_str(&env, "hash:acct-001"));

    let recipients = soroban_sdk::Vec::from_array(&env, [r1]);
    let amounts = soroban_sdk::Vec::from_array(&env, [100i128, 200i128]);

    let result = client.try_batch_payout(&admin, &recipients, &amounts);
    assert!(result.is_err());
}

// ─── record_offramp ───────────────────────────────────────────────────────────

#[test]
fn test_record_offramp_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_001_000);

    let admin = Address::generate(&env);
    let (token_addr, token_admin, _) = create_token_contract(&env, &admin);
    token_admin.mint(&admin, &1_000_000);

    let contract_id = env.register(PayrollRemit, ());
    let client = PayrollRemitClient::new(&env, &contract_id);
    client.init(&admin, &token_addr);

    let recipient = Address::generate(&env);
    client.add_recipient(&admin, &recipient, &String::from_str(&env, "hash:acct-x"));

    let recipients = soroban_sdk::Vec::from_array(&env, [recipient.clone()]);
    let amounts = soroban_sdk::Vec::from_array(&env, [777i128]);
    client.batch_payout(&admin, &recipients, &amounts);

    env.ledger().set_timestamp(1_700_002_000);
    client.record_offramp(&admin, &recipient, &OffRampStatus::Confirmed);

    let all = env.events().all();

    let mut found = false;
    for i in 0..all.len() {
        let (emitter, topics, data) = all.get(i).unwrap();
        if emitter != contract_id {
            continue;
        }
        let t0_match = topics
            .get(0)
            .map(|t| t == symbol_short!("offramp").into_val(&env))
            .unwrap_or(false);
        let t1_match = topics
            .get(1)
            .map(|t| t == recipient.clone().into_val(&env))
            .unwrap_or(false);
        if t0_match && t1_match {
            let payload: OffRampRecordedEvent = OffRampRecordedEvent::try_from_val(&env, &data)
                .expect("data should decode as OffRampRecordedEvent");
            match payload.status {
                OffRampStatus::Confirmed => {}
                _ => panic!("expected Confirmed in event payload"),
            }
            assert_eq!(payload.timestamp, 1_700_002_000);
            found = true;
            break;
        }
    }
    assert!(
        found,
        "expected 'offramp' event with correct recipient topic"
    );
}

#[test]
fn test_record_offramp_failed_status() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);

    let admin = Address::generate(&env);
    let (token_addr, token_admin, _) = create_token_contract(&env, &admin);
    token_admin.mint(&admin, &1_000_000);

    let contract_id = env.register(PayrollRemit, ());
    let client = PayrollRemitClient::new(&env, &contract_id);
    client.init(&admin, &token_addr);

    let recipient = Address::generate(&env);
    client.add_recipient(
        &admin,
        &recipient,
        &String::from_str(&env, "hash:fail-test"),
    );

    let recipients = soroban_sdk::Vec::from_array(&env, [recipient.clone()]);
    let amounts = soroban_sdk::Vec::from_array(&env, [100i128]);
    client.batch_payout(&admin, &recipients, &amounts);

    client.record_offramp(&admin, &recipient, &OffRampStatus::Failed);

    let history = client.get_history(&recipient);
    match history.get(0).unwrap().status {
        OffRampStatus::Failed => {}
        _ => panic!("expected Failed status in history"),
    }

    let all = env.events().all();
    let result = find_event(&env, &all, &contract_id, symbol_short!("offramp"));
    assert!(
        result.is_some(),
        "expected 'offramp' event for Failed status"
    );

    let (_topics, data) = result.unwrap();
    let payload: OffRampRecordedEvent =
        OffRampRecordedEvent::try_from_val(&env, &data).expect("decode OffRampRecordedEvent");
    match payload.status {
        OffRampStatus::Failed => {}
        _ => panic!("expected Failed in event payload"),
    }
}

// ─── authorization — legacy boundary ─────────────────────────────────────────

#[test]
fn test_unauthorized_caller_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let intruder = Address::generate(&env);
    let (token_addr, _, _) = create_token_contract(&env, &admin);

    let contract_id = env.register(PayrollRemit, ());
    let client = PayrollRemitClient::new(&env, &contract_id);
    client.init(&admin, &token_addr);

    let r1 = Address::generate(&env);
    let result =
        client.try_add_recipient(&intruder, &r1, &String::from_str(&env, "hash:acct-001"));
    assert!(result.is_err());
}

// ─── RBAC: set_role ───────────────────────────────────────────────────────────

#[test]
fn test_set_role_persists_and_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_100_000);

    let (contract_id, client, admin, _token_addr, _token_admin) = setup(&env);

    let manager = Address::generate(&env);
    client.set_role(&admin, &manager, &Role::RecipientManager);

    // Role is stored on-chain.
    let stored = client.get_role(&manager);
    assert!(stored.is_some(), "role should be persisted");
    match stored.unwrap() {
        Role::RecipientManager => {}
        _ => panic!("expected RecipientManager"),
    }

    // Event is emitted with correct topic and payload.
    let all = env.events().all();
    let mut found = false;
    for i in 0..all.len() {
        let (emitter, topics, data) = all.get(i).unwrap();
        if emitter != contract_id {
            continue;
        }
        let t0_match = topics
            .get(0)
            .map(|t| t == symbol_short!("role_set").into_val(&env))
            .unwrap_or(false);
        let t1_match = topics
            .get(1)
            .map(|t| t == manager.clone().into_val(&env))
            .unwrap_or(false);
        if t0_match && t1_match {
            let payload: RoleSetEvent = RoleSetEvent::try_from_val(&env, &data)
                .expect("data should decode as RoleSetEvent");
            match payload.role {
                Role::RecipientManager => {}
                _ => panic!("expected RecipientManager in event payload"),
            }
            assert_eq!(payload.timestamp, 1_700_100_000);
            found = true;
            break;
        }
    }
    assert!(found, "expected 'role_set' event with grantee as topic[1]");
}

#[test]
fn test_only_top_admin_can_set_role() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, client, admin, _token_addr, _token_admin) = setup(&env);

    // Grant ContractAdmin to sub_admin.
    let sub_admin = Address::generate(&env);
    client.set_role(&admin, &sub_admin, &Role::ContractAdmin);

    // sub_admin should NOT be able to call set_role (not the top-level admin).
    let other = Address::generate(&env);
    let result = client.try_set_role(&sub_admin, &other, &Role::RecipientManager);
    assert!(
        result.is_err(),
        "sub-admin with ContractAdmin role must not be able to grant roles"
    );
}

#[test]
fn test_cannot_self_escalate() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, client, admin, _token_addr, _token_admin) = setup(&env);

    // Give a user RecipientManager.
    let user = Address::generate(&env);
    client.set_role(&admin, &user, &Role::RecipientManager);

    // user tries to upgrade themselves to ContractAdmin — must fail.
    let result = client.try_set_role(&user, &user, &Role::ContractAdmin);
    assert!(result.is_err(), "user must not be able to self-escalate");
}

// ─── RBAC: RecipientManager ───────────────────────────────────────────────────

#[test]
fn test_recipient_manager_can_add_recipient() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, client, admin, _token_addr, _token_admin) = setup(&env);

    let manager = Address::generate(&env);
    client.set_role(&admin, &manager, &Role::RecipientManager);

    let recipient = Address::generate(&env);
    // Must succeed — RecipientManager is allowed.
    client.add_recipient(
        &manager,
        &recipient,
        &String::from_str(&env, "hash:mgr-001"),
    );

    let info = client.get_recipient(&recipient);
    assert!(info.is_some(), "recipient should have been registered");
}

#[test]
fn test_recipient_manager_cannot_batch_payout() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, client, admin, _token_addr, _token_admin) = setup(&env);

    let manager = Address::generate(&env);
    client.set_role(&admin, &manager, &Role::RecipientManager);

    let r1 = Address::generate(&env);
    client.add_recipient(&admin, &r1, &String::from_str(&env, "hash:acct-001"));

    let recipients = soroban_sdk::Vec::from_array(&env, [r1]);
    let amounts = soroban_sdk::Vec::from_array(&env, [100i128]);

    // Must fail — RecipientManager is not allowed to trigger payouts.
    let result = client.try_batch_payout(&manager, &recipients, &amounts);
    assert!(
        result.is_err(),
        "RecipientManager must not be able to call batch_payout"
    );
}

#[test]
fn test_recipient_manager_cannot_record_offramp() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, client, admin, token_addr, token_admin) = setup(&env);
    token_admin.mint(&admin, &1_000_000);

    // Add and pay out a recipient using the top-level admin.
    let recipient = Address::generate(&env);
    client.add_recipient(&admin, &recipient, &String::from_str(&env, "hash:pay-001"));
    let recipients = soroban_sdk::Vec::from_array(&env, [recipient.clone()]);
    let amounts = soroban_sdk::Vec::from_array(&env, [500i128]);
    client.batch_payout(&admin, &recipients, &amounts);

    // Grant RecipientManager to a separate address.
    let manager = Address::generate(&env);
    client.set_role(&admin, &manager, &Role::RecipientManager);

    // Must fail — RecipientManager cannot record off-ramp outcomes.
    let result = client.try_record_offramp(&manager, &recipient, &OffRampStatus::Confirmed);
    assert!(
        result.is_err(),
        "RecipientManager must not be able to call record_offramp"
    );
}

// ─── RBAC: OffRampRecorder ────────────────────────────────────────────────────

#[test]
fn test_offramp_recorder_can_record_offramp() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, client, admin, _token_addr, token_admin) = setup(&env);
    token_admin.mint(&admin, &1_000_000);

    let recipient = Address::generate(&env);
    client.add_recipient(&admin, &recipient, &String::from_str(&env, "hash:rec-001"));
    let recipients = soroban_sdk::Vec::from_array(&env, [recipient.clone()]);
    let amounts = soroban_sdk::Vec::from_array(&env, [300i128]);
    client.batch_payout(&admin, &recipients, &amounts);

    // Grant OffRampRecorder role.
    let recorder = Address::generate(&env);
    client.set_role(&admin, &recorder, &Role::OffRampRecorder);

    // Must succeed.
    client.record_offramp(&recorder, &recipient, &OffRampStatus::Confirmed);

    let history = client.get_history(&recipient);
    match history.get(0).unwrap().status {
        OffRampStatus::Confirmed => {}
        _ => panic!("expected Confirmed status after recorder update"),
    }
}

#[test]
fn test_offramp_recorder_cannot_add_recipient() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, client, admin, _token_addr, _token_admin) = setup(&env);

    let recorder = Address::generate(&env);
    client.set_role(&admin, &recorder, &Role::OffRampRecorder);

    let recipient = Address::generate(&env);
    // Must fail — OffRampRecorder cannot register recipients.
    let result = client.try_add_recipient(&recorder, &recipient, &String::from_str(&env, "hash:x"));
    assert!(
        result.is_err(),
        "OffRampRecorder must not be able to call add_recipient"
    );
}

#[test]
fn test_offramp_recorder_cannot_batch_payout() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, client, admin, _token_addr, _token_admin) = setup(&env);

    let recorder = Address::generate(&env);
    client.set_role(&admin, &recorder, &Role::OffRampRecorder);

    let r1 = Address::generate(&env);
    client.add_recipient(&admin, &r1, &String::from_str(&env, "hash:acct-001"));

    let recipients = soroban_sdk::Vec::from_array(&env, [r1]);
    let amounts = soroban_sdk::Vec::from_array(&env, [100i128]);

    // Must fail — OffRampRecorder is not allowed to trigger payouts.
    let result = client.try_batch_payout(&recorder, &recipients, &amounts);
    assert!(
        result.is_err(),
        "OffRampRecorder must not be able to call batch_payout"
    );
}

// ─── RBAC: ContractAdmin role ─────────────────────────────────────────────────

#[test]
fn test_contract_admin_role_has_full_access() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, client, admin, _token_addr, token_admin) = setup(&env);
    token_admin.mint(&admin, &1_000_000);

    // Delegate ContractAdmin role to a sub-admin.
    let sub_admin = Address::generate(&env);
    client.set_role(&admin, &sub_admin, &Role::ContractAdmin);

    // Mint tokens to sub_admin so transfers succeed.
    token_admin.mint(&sub_admin, &1_000_000);

    // ContractAdmin can add_recipient.
    let recipient = Address::generate(&env);
    client.add_recipient(
        &sub_admin,
        &recipient,
        &String::from_str(&env, "hash:sub-001"),
    );
    assert!(client.get_recipient(&recipient).is_some());

    // ContractAdmin can batch_payout.
    let recipients = soroban_sdk::Vec::from_array(&env, [recipient.clone()]);
    let amounts = soroban_sdk::Vec::from_array(&env, [100i128]);
    client.batch_payout(&sub_admin, &recipients, &amounts);

    // ContractAdmin can record_offramp.
    client.record_offramp(&sub_admin, &recipient, &OffRampStatus::Confirmed);

    let history = client.get_history(&recipient);
    match history.get(0).unwrap().status {
        OffRampStatus::Confirmed => {}
        _ => panic!("expected Confirmed after ContractAdmin record_offramp"),
    }
}

// ─── RBAC: no-role address ────────────────────────────────────────────────────

#[test]
fn test_address_with_no_role_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (_, client, admin, _token_addr, _token_admin) = setup(&env);

    let nobody = Address::generate(&env);
    let recipient = Address::generate(&env);

    let r1 = client.try_add_recipient(&nobody, &recipient, &String::from_str(&env, "hash:x"));
    assert!(r1.is_err(), "address with no role must be rejected");

    let recipients = soroban_sdk::Vec::from_array(&env, [recipient.clone()]);
    let amounts = soroban_sdk::Vec::from_array(&env, [100i128]);
    let r2 = client.try_batch_payout(&nobody, &recipients, &amounts);
    assert!(r2.is_err(), "address with no role must be rejected");

    let r3 = client.try_record_offramp(&nobody, &recipient, &OffRampStatus::Confirmed);
    assert!(r3.is_err(), "address with no role must be rejected");
}
