#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Env,
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

    let recipients = Vec::from_array(&env, [r1.clone(), r2.clone()]);
    let amounts = Vec::from_array(&env, [1_000i128, 2_500i128]);

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

    let recipients = Vec::from_array(&env, [r1]);
    let amounts = Vec::from_array(&env, [100i128, 200i128]);

    let result = client.try_batch_payout(&admin, &recipients, &amounts);
    assert!(result.is_err());
}

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
    let result = client.try_add_recipient(
        &intruder,
        &r1,
        &String::from_str(&env, "hash:acct-001"),
    );
    // require_admin compares stored admin to caller before require_auth;
    // with mock_all_auths this still surfaces as Unauthorized from our check.
    assert!(result.is_err());
}
