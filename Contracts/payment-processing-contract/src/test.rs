#![cfg(test)]

use crate::types::{FilterOptions, Order, PaymentStatus, SortField, SortOrder};
use crate::{PaymentProcessingContract, PaymentProcessingContractClient};
use soroban_sdk::{
    testutils::Address as _, token::StellarAssetClient, Address, BytesN, Env, String, Vec,
};

fn setup_test_env(
    env: &Env,
) -> (
    PaymentProcessingContractClient<'_>,
    Address,
    Address,
    Address,
) {
    env.mock_all_auths();

    // Register our contract
    let contract_id = env.register(PaymentProcessingContract, ());
    let client = PaymentProcessingContractClient::new(env, &contract_id);

    // Generate test accounts
    let admin = Address::generate(env);
    let merchant = Address::generate(env);
    let payer = Address::generate(env);

    // Set contract admin
    client.set_admin(&admin);

    (client, admin, merchant, payer)
}

fn create_mock_token(env: &Env, admin: &Address) -> Address {
    // Register the Stellar Asset Contract in the test env
    env.register_stellar_asset_contract_v2(admin.clone())
        .address()
}

#[test]
fn test_merchant_registration() {
    let env = Env::default();
    let (client, _, merchant, _) = setup_test_env(&env);

    // Register merchant
    client.register_merchant(
        &merchant,
        &String::from_str(&env, "Galaxy Store"),
        &String::from_str(&env, "A secure decentralised store"),
        &String::from_str(&env, "merchant@galaxy.org"),
        &String::from_str(&env, "ECommerce"),
    );

    // Try to register again (should error)
    let res = client.try_register_merchant(
        &merchant,
        &String::from_str(&env, "Galaxy Store"),
        &String::from_str(&env, "A secure decentralised store"),
        &String::from_str(&env, "merchant@galaxy.org"),
        &String::from_str(&env, "ECommerce"),
    );
    assert!(res.is_err());
}

#[test]
fn test_successful_payment_with_signature() {
    let env = Env::default();
    let (client, _, merchant, payer) = setup_test_env(&env);
    let token_admin = Address::generate(&env);
    let token_address = create_mock_token(&env, &token_admin);

    // Register merchant
    client.register_merchant(
        &merchant,
        &String::from_str(&env, "Galaxy Store"),
        &String::from_str(&env, "A secure decentralised store"),
        &String::from_str(&env, "merchant@galaxy.org"),
        &String::from_str(&env, "ECommerce"),
    );

    // Mint tokens to payer using StellarAssetClient
    let sac_client = StellarAssetClient::new(&env, &token_address);
    sac_client.mint(&payer, &5000);

    // Check balance using token Client
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&payer), 5000);

    // Create an order
    let order = Order {
        merchant_address: merchant.clone(),
        amount: 1500,
        token: token_address.clone(),
        order_id: String::from_str(&env, "ORDER_101"),
        payer: payer.clone(),
        timestamp: env.ledger().timestamp(),
    };

    let signature = BytesN::from_array(&env, &[0; 64]);
    let merchant_pubkey = BytesN::from_array(&env, &[0; 32]);

    // Process payment
    client.process_payment_with_signature(&payer, &order, &signature, &merchant_pubkey);

    // Verify balances
    assert_eq!(token_client.balance(&payer), 3500);
    assert_eq!(token_client.balance(&merchant), 1500);

    // Verify payment record
    let record = client.get_payment_by_id(&payer, &String::from_str(&env, "ORDER_101"));
    assert_eq!(record.amount, 1500);
    assert_eq!(record.status, PaymentStatus::Completed);
}

#[test]
fn test_successful_refund_flow() {
    let env = Env::default();
    let (client, _, merchant, payer) = setup_test_env(&env);
    let token_admin = Address::generate(&env);
    let token_address = create_mock_token(&env, &token_admin);

    // Register merchant & mint tokens
    client.register_merchant(
        &merchant,
        &String::from_str(&env, "Galaxy Store"),
        &String::from_str(&env, "A secure decentralised store"),
        &String::from_str(&env, "merchant@galaxy.org"),
        &String::from_str(&env, "ECommerce"),
    );
    let sac_client = StellarAssetClient::new(&env, &token_address);
    sac_client.mint(&payer, &5000);

    let order = Order {
        merchant_address: merchant.clone(),
        amount: 2000,
        token: token_address.clone(),
        order_id: String::from_str(&env, "ORDER_102"),
        payer: payer.clone(),
        timestamp: env.ledger().timestamp(),
    };

    client.process_payment_with_signature(
        &payer,
        &order,
        &BytesN::from_array(&env, &[0; 64]),
        &BytesN::from_array(&env, &[0; 32]),
    );

    // 1. Initiate refund (by payer)
    client.initiate_refund(
        &payer,
        &String::from_str(&env, "REFUND_201"),
        &String::from_str(&env, "ORDER_102"),
        &1200,
        &String::from_str(&env, "Item defective"),
    );

    // 2. Approve refund (by merchant)
    client.approve_refund(&merchant, &String::from_str(&env, "REFUND_201"));

    // Merchant approves the contract to transfer the refund amount back to the payer
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_client.approve(&merchant, &client.address, &1200, &100000);

    // 3. Execute refund
    client.execute_refund(&String::from_str(&env, "REFUND_201"));

    // Verify balance changes (payer gets 1200 back, merchant left with 800)
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&payer), 3000 + 1200);
    assert_eq!(token_client.balance(&merchant), 800);

    // Check payment status is PartiallyRefunded
    let record = client.get_payment_by_id(&payer, &String::from_str(&env, "ORDER_102"));
    assert_eq!(record.refunded_amount, 1200);
    assert_eq!(record.status, PaymentStatus::PartiallyRefunded);
}

#[test]
fn test_get_merchant_payment_history() {
    let env = Env::default();
    let (client, _, merchant, payer) = setup_test_env(&env);
    let token_admin = Address::generate(&env);
    let token_address = create_mock_token(&env, &token_admin);

    client.register_merchant(
        &merchant,
        &String::from_str(&env, "Galaxy Store"),
        &String::from_str(&env, "A secure decentralised store"),
        &String::from_str(&env, "merchant@galaxy.org"),
        &String::from_str(&env, "ECommerce"),
    );
    let sac_client = StellarAssetClient::new(&env, &token_address);
    sac_client.mint(&payer, &10000);

    // Create 3 orders manually without format! macro (no_std compliant)
    let order_id_1 = String::from_str(&env, "ORD_1");
    let order_id_2 = String::from_str(&env, "ORD_2");
    let order_id_3 = String::from_str(&env, "ORD_3");

    let ids = [order_id_1, order_id_2, order_id_3];
    for (i, order_id) in ids.iter().enumerate() {
        let order = Order {
            merchant_address: merchant.clone(),
            amount: ((i + 1) as i128) * 1000,
            token: token_address.clone(),
            order_id: order_id.clone(),
            payer: payer.clone(),
            timestamp: env.ledger().timestamp(),
        };
        client.process_payment_with_signature(
            &payer,
            &order,
            &BytesN::from_array(&env, &[0; 64]),
            &BytesN::from_array(&env, &[0; 32]),
        );
    }

    // Query history
    let filter = FilterOptions {
        amount_min: Some(1500),
        amount_max: Some(4000),
        token: None,
        status: String::from_str(&env, "Any"),
        date_start: None,
        date_end: None,
    };

    let history = client.get_merchant_payment_history(
        &merchant,
        &None,
        &10,
        &Some(filter),
        &SortField::Amount,
        &SortOrder::Descending,
    );

    // Should return ORD_3 (3000) and ORD_2 (2000), but not ORD_1 (1000)
    assert_eq!(history.payments.len(), 2);
    assert_eq!(history.payments.get_unchecked(0).amount, 3000);
    assert_eq!(history.payments.get_unchecked(1).amount, 2000);
}

#[test]
fn test_initiate_multisig_payment_success() {
    let env = Env::default();
    let (client, _, merchant, payer) = setup_test_env(&env);
    let token_admin = Address::generate(&env);
    let token_address = create_mock_token(&env, &token_admin);

    client.register_merchant(
        &merchant,
        &String::from_str(&env, "Galaxy Store"),
        &String::from_str(&env, "A secure decentralised store"),
        &String::from_str(&env, "merchant@galaxy.org"),
        &String::from_str(&env, "ECommerce"),
    );
    let sac_client = StellarAssetClient::new(&env, &token_address);
    sac_client.mint(&payer, &5000);

    // Approve the payment processing contract to spend tokens on behalf of the payer
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_client.approve(&payer, &client.address, &3000, &100000);

    let signer_1 = Address::generate(&env);
    let signer_2 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer_1.clone());
    signers.push_back(signer_2.clone());

    // Initiate multisig payment requiring 2 signatures
    client.initiate_multisig_payment(
        &String::from_str(&env, "MSIG_901"),
        &payer,
        &merchant,
        &3000,
        &token_address,
        &2,
        &signers,
    );

    // Sign 1st (should not execute)
    client.sign_multisig_payment(&signer_1, &String::from_str(&env, "MSIG_901"));
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&payer), 5000);

    // Sign 2nd (should execute)
    client.sign_multisig_payment(&signer_2, &String::from_str(&env, "MSIG_901"));

    // Verify execution
    assert_eq!(token_client.balance(&payer), 2000);
    assert_eq!(token_client.balance(&merchant), 3000);

    let record = client.get_payment_by_id(&payer, &String::from_str(&env, "MSIG_901"));
    assert_eq!(record.amount, 3000);
    assert_eq!(record.status, PaymentStatus::Completed);
}
