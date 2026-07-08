use crate::types::{Merchant, MultisigPayment, PaymentRecord, RefundRecord, StorageKey};
use soroban_sdk::{Address, Env, String, Vec};

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&StorageKey::Admin)
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&StorageKey::Admin, admin);
}

pub fn get_merchant(env: &Env, address: &Address) -> Option<Merchant> {
    env.storage()
        .persistent()
        .get(&StorageKey::Merchant(address.clone()))
}

pub fn set_merchant(env: &Env, address: &Address, merchant: &Merchant) {
    env.storage()
        .persistent()
        .set(&StorageKey::Merchant(address.clone()), merchant);
}

pub fn has_merchant(env: &Env, address: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&StorageKey::Merchant(address.clone()))
}

pub fn get_payment(env: &Env, order_id: &String) -> Option<PaymentRecord> {
    env.storage()
        .persistent()
        .get(&StorageKey::Payment(order_id.clone()))
}

pub fn set_payment(env: &Env, order_id: &String, payment: &PaymentRecord) {
    env.storage()
        .persistent()
        .set(&StorageKey::Payment(order_id.clone()), payment);
}

pub fn get_refund(env: &Env, refund_id: &String) -> Option<RefundRecord> {
    env.storage()
        .persistent()
        .get(&StorageKey::Refund(refund_id.clone()))
}

pub fn set_refund(env: &Env, refund_id: &String, refund: &RefundRecord) {
    env.storage()
        .persistent()
        .set(&StorageKey::Refund(refund_id.clone()), refund);
}

pub fn get_multisig(env: &Env, payment_id: &String) -> Option<MultisigPayment> {
    env.storage()
        .persistent()
        .get(&StorageKey::Multisig(payment_id.clone()))
}

pub fn set_multisig(env: &Env, payment_id: &String, multisig: &MultisigPayment) {
    env.storage()
        .persistent()
        .set(&StorageKey::Multisig(payment_id.clone()), multisig);
}

pub fn get_merchant_payments(env: &Env, merchant: &Address) -> Vec<String> {
    env.storage()
        .persistent()
        .get(&StorageKey::MerchantPayments(merchant.clone()))
        .unwrap_or_else(|| Vec::new(env))
}

pub fn add_merchant_payment(env: &Env, merchant: &Address, order_id: &String) {
    let mut list = get_merchant_payments(env, merchant);
    list.push_back(order_id.clone());
    env.storage()
        .persistent()
        .set(&StorageKey::MerchantPayments(merchant.clone()), &list);
}

pub fn set_merchant_payments(env: &Env, merchant: &Address, list: &Vec<String>) {
    env.storage()
        .persistent()
        .set(&StorageKey::MerchantPayments(merchant.clone()), list);
}

pub fn get_payer_payments(env: &Env, payer: &Address) -> Vec<String> {
    env.storage()
        .persistent()
        .get(&StorageKey::PayerPayments(payer.clone()))
        .unwrap_or_else(|| Vec::new(env))
}

pub fn add_payer_payment(env: &Env, payer: &Address, order_id: &String) {
    let mut list = get_payer_payments(env, payer);
    list.push_back(order_id.clone());
    env.storage()
        .persistent()
        .set(&StorageKey::PayerPayments(payer.clone()), &list);
}

pub fn set_payer_payments(env: &Env, payer: &Address, list: &Vec<String>) {
    env.storage()
        .persistent()
        .set(&StorageKey::PayerPayments(payer.clone()), list);
}

pub fn get_global_payments(env: &Env) -> Vec<String> {
    env.storage()
        .persistent()
        .get(&StorageKey::GlobalPayments)
        .unwrap_or_else(|| Vec::new(env))
}

pub fn add_global_payment(env: &Env, order_id: &String) {
    let mut list = get_global_payments(env);
    list.push_back(order_id.clone());
    env.storage()
        .persistent()
        .set(&StorageKey::GlobalPayments, &list);
}

pub fn set_global_payments(env: &Env, list: &Vec<String>) {
    env.storage()
        .persistent()
        .set(&StorageKey::GlobalPayments, list);
}

pub fn get_cleanup_period(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&StorageKey::CleanupPeriod)
        .unwrap_or(2592000) // Default: 30 days
}

pub fn set_cleanup_period(env: &Env, period: u64) {
    env.storage()
        .instance()
        .set(&StorageKey::CleanupPeriod, &period);
}
