#![cfg(test)]

use crate::types::{DisputeStatus, EscrowStatus};
use crate::{AstraCourtContract, AstraCourtContractClient};
use soroban_sdk::{testutils::Address as _, token::StellarAssetClient, Address, Env, String};

fn setup_test_env(env: &Env) -> (AstraCourtContractClient<'_>, Address, Address, Address) {
    env.mock_all_auths();

    // Register AstraCourt contract
    let contract_id = env.register(AstraCourtContract, ());
    let client = AstraCourtContractClient::new(env, &contract_id);

    // Generate test accounts
    let admin = Address::generate(env);
    let payer = Address::generate(env);
    let beneficiary = Address::generate(env);

    // Set admin
    client.set_admin(&admin);

    (client, admin, payer, beneficiary)
}

fn create_mock_token(env: &Env, admin: &Address) -> Address {
    // Register the Stellar Asset Contract in the test env
    env.register_stellar_asset_contract_v2(admin.clone())
        .address()
}

#[test]
fn test_successful_escrow_lifecycle() {
    let env = Env::default();
    let (client, _, payer, beneficiary) = setup_test_env(&env);
    let token_admin = Address::generate(&env);
    let token_address = create_mock_token(&env, &token_admin);

    // Mint tokens to payer
    let sac_client = StellarAssetClient::new(&env, &token_address);
    sac_client.mint(&payer, &10000);

    // Approve the contract to spend payer's tokens
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_client.approve(&payer, &client.address, &5000, &100000);

    // Create escrow (Payer locks 5000 tokens)
    let deadline = env.ledger().timestamp() + 86400; // 1 day
    let escrow_id =
        client.create_escrow(&payer, &beneficiary, &5000, &token_address, &deadline, &500);

    // Verify balance changes (payer lost 5000, contract holds 5000)
    assert_eq!(token_client.balance(&payer), 5000);
    assert_eq!(token_client.balance(&client.address), 5000);

    let escrow = client.get_escrow(&escrow_id).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Active);

    // Release funds (by Payer)
    client.release_funds(&escrow_id);

    // Verify funds transfer (beneficiary has 5000, contract is empty)
    assert_eq!(token_client.balance(&beneficiary), 5000);
    assert_eq!(token_client.balance(&client.address), 0);

    let updated_escrow = client.get_escrow(&escrow_id).unwrap();
    assert_eq!(updated_escrow.status, EscrowStatus::Released);
}

#[test]
fn test_refund_flow() {
    let env = Env::default();
    let (client, _, payer, beneficiary) = setup_test_env(&env);
    let token_admin = Address::generate(&env);
    let token_address = create_mock_token(&env, &token_admin);

    // Mint and approve
    let sac_client = StellarAssetClient::new(&env, &token_address);
    sac_client.mint(&payer, &10000);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_client.approve(&payer, &client.address, &5000, &100000);

    // Create escrow
    let deadline = env.ledger().timestamp() + 86400;
    let escrow_id =
        client.create_escrow(&payer, &beneficiary, &5000, &token_address, &deadline, &500);

    // Refund escrow (by Beneficiary)
    client.refund_escrow(&escrow_id);

    // Verify funds transfer (payer gets 5000 back, contract is empty)
    assert_eq!(token_client.balance(&payer), 10000);
    assert_eq!(token_client.balance(&client.address), 0);

    let updated_escrow = client.get_escrow(&escrow_id).unwrap();
    assert_eq!(updated_escrow.status, EscrowStatus::Refunded);
}

#[test]
fn test_juror_staking_and_unstaking() {
    let env = Env::default();
    let (client, admin, _, _) = setup_test_env(&env);
    let token_admin = Address::generate(&env);
    let token_address = create_mock_token(&env, &token_admin);

    // Configure staking parameters
    client.configure_staking(&admin, &token_address, &1000);

    // Juror account setup
    let juror = Address::generate(&env);
    let sac_client = StellarAssetClient::new(&env, &token_address);
    sac_client.mint(&juror, &5000);

    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_client.approve(&juror, &client.address, &5000, &100000);

    // Stake 2000 tokens
    client.stake_juror(&juror, &2000);

    // Verify staker balances and contract state
    assert_eq!(token_client.balance(&juror), 3000);
    assert_eq!(token_client.balance(&client.address), 2000);
    assert_eq!(client.get_juror_stake(&juror), 2000);

    // Unstake 1000 tokens
    client.unstake_juror(&juror, &1000);
    assert_eq!(token_client.balance(&juror), 4000);
    assert_eq!(token_client.balance(&client.address), 1000);
    assert_eq!(client.get_juror_stake(&juror), 1000);
}

#[test]
fn test_dispute_and_resolution_flow() {
    let env = Env::default();
    let (client, admin, payer, beneficiary) = setup_test_env(&env);
    let token_admin = Address::generate(&env);
    let token_address = create_mock_token(&env, &token_admin);

    // 1. Configure court staking token (USDC / XLM mock)
    client.configure_staking(&admin, &token_address, &1000);

    // 2. Setup 3 Jurors with stakes
    let juror_1 = Address::generate(&env);
    let juror_2 = Address::generate(&env);
    let juror_3 = Address::generate(&env);
    let jurors = [juror_1.clone(), juror_2.clone(), juror_3.clone()];

    let sac_client = StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);

    for j in jurors.iter() {
        sac_client.mint(j, &5000);
        token_client.approve(j, &client.address, &5000, &100000);
        client.stake_juror(j, &2000);
    }

    // 3. Payer creates escrow with 5000 amount and 900 dispute fee
    sac_client.mint(&payer, &5000);
    token_client.approve(&payer, &client.address, &5000, &100000);

    let deadline = env.ledger().timestamp() + 86400;
    let escrow_id =
        client.create_escrow(&payer, &beneficiary, &5000, &token_address, &deadline, &900);

    // 4. Raise dispute
    let evidence = String::from_str(&env, "ipfs://evidence-data-hash");
    let dispute_id = client.raise_dispute(&payer, &escrow_id, &evidence);

    // Verify dispute states and selection of 3 jurors
    let dispute = client.get_dispute(&dispute_id).unwrap();
    assert_eq!(dispute.status, DisputeStatus::Voting);
    assert_eq!(dispute.selected_jurors.len(), 3);

    // 5. Jurors cast votes:
    // Juror 1 and Juror 2 vote for Refund Payer (1)
    // Juror 3 votes for Release to Beneficiary (2)
    let selected_0 = dispute.selected_jurors.get_unchecked(0);
    let selected_1 = dispute.selected_jurors.get_unchecked(1);
    let selected_2 = dispute.selected_jurors.get_unchecked(2);

    client.cast_vote(&selected_0, &dispute_id, &1);
    client.cast_vote(&selected_1, &dispute_id, &1);
    // Cast last vote triggers resolution automatically
    client.cast_vote(&selected_2, &dispute_id, &2);

    // 6. Verify resolutions:
    // Payer won (2 votes to 1)
    // Payer payout: 5000 escrow - 900 dispute fee = 4100
    assert_eq!(token_client.balance(&payer), 4100);
    assert_eq!(token_client.balance(&beneficiary), 0);

    // Verify losing juror (selected_2) was slashed 100 tokens.
    // Their stake should be 2000 - 100 = 1900.
    assert_eq!(client.get_juror_stake(&selected_2), 1900);

    // Winning jurors (selected_0 and selected_1) split the dispute fee (900)
    // plus the slashed stakes (100) -> total reward pool of 1000 -> 500 each.
    // Their stake balances in the court remain 2000 (since they didn't unstake),
    // but their external wallet balances (which receive the payouts) should increase by 500.
    assert_eq!(token_client.balance(&selected_0), 3000 + 500);
    assert_eq!(token_client.balance(&selected_1), 3000 + 500);
    assert_eq!(token_client.balance(&selected_2), 3000); // Losing juror receives no reward

    // Escrow status resolved
    let resolved_escrow = client.get_escrow(&escrow_id).unwrap();
    assert_eq!(resolved_escrow.status, EscrowStatus::Resolved);
}
