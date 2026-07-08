use crate::types::{Dispute, Escrow, StorageKey};
use soroban_sdk::{Address, Env, Vec};

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&StorageKey::Admin)
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().persistent().set(&StorageKey::Admin, admin);
}

pub fn get_escrow(env: &Env, escrow_id: u32) -> Option<Escrow> {
    env.storage()
        .persistent()
        .get(&StorageKey::Escrow(escrow_id))
}

pub fn set_escrow(env: &Env, escrow_id: u32, escrow: &Escrow) {
    env.storage()
        .persistent()
        .set(&StorageKey::Escrow(escrow_id), escrow);
}

pub fn get_dispute(env: &Env, dispute_id: u32) -> Option<Dispute> {
    env.storage()
        .persistent()
        .get(&StorageKey::Dispute(dispute_id))
}

pub fn set_dispute(env: &Env, dispute_id: u32, dispute: &Dispute) {
    env.storage()
        .persistent()
        .set(&StorageKey::Dispute(dispute_id), dispute);
}

pub fn get_juror_stake(env: &Env, juror: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&StorageKey::JurorStake(juror.clone()))
        .unwrap_or(0)
}

pub fn set_juror_stake(env: &Env, juror: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&StorageKey::JurorStake(juror.clone()), &amount);
}

pub fn remove_juror_stake(env: &Env, juror: &Address) {
    env.storage()
        .persistent()
        .remove(&StorageKey::JurorStake(juror.clone()));
}

pub fn get_active_jurors(env: &Env) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&StorageKey::ActiveJurors)
        .unwrap_or_else(|| Vec::new(env))
}

pub fn set_active_jurors(env: &Env, jurors: &Vec<Address>) {
    env.storage()
        .persistent()
        .set(&StorageKey::ActiveJurors, jurors);
}

pub fn get_total_escrows(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&StorageKey::TotalEscrowsCount)
        .unwrap_or(0)
}

pub fn increment_total_escrows(env: &Env) -> u32 {
    let count = get_total_escrows(env) + 1;
    env.storage()
        .persistent()
        .set(&StorageKey::TotalEscrowsCount, &count);
    count
}

pub fn get_total_disputes(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&StorageKey::TotalDisputesCount)
        .unwrap_or(0)
}

pub fn increment_total_disputes(env: &Env) -> u32 {
    let count = get_total_disputes(env) + 1;
    env.storage()
        .persistent()
        .set(&StorageKey::TotalDisputesCount, &count);
    count
}

pub fn get_min_juror_stake(env: &Env) -> i128 {
    env.storage()
        .persistent()
        .get(&StorageKey::MinJurorStake)
        .unwrap_or(1000)
}

pub fn set_min_juror_stake(env: &Env, amount: i128) {
    env.storage()
        .persistent()
        .set(&StorageKey::MinJurorStake, &amount);
}

pub fn get_staking_token(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&StorageKey::StakingToken)
}

pub fn set_staking_token(env: &Env, token: &Address) {
    env.storage()
        .persistent()
        .set(&StorageKey::StakingToken, token);
}
