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
fn find_event<'a>(
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

    // Find an 'rcpt_add' event where topic[1] is the recipient address.
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

    // Advance ledger timestamp before recording the off-ramp outcome.
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

    // Storage should reflect Failed status.
    let history = client.get_history(&recipient);
    match history.get(0).unwrap().status {
        OffRampStatus::Failed => {}
        _ => panic!("expected Failed status in history"),
    }

    // The emitted offramp event should also carry Failed.
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

// ─── authorization ────────────────────────────────────────────────────────────

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
    // require_admin compares stored admin to caller before require_auth;
    // with mock_all_auths this still surfaces as Unauthorized from our check.
    assert!(result.is_err());
}
