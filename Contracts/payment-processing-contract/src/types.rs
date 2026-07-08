use soroban_sdk::{contracttype, Address, String, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Merchant {
    pub address: Address,
    pub name: String,
    pub description: String,
    pub contact_info: String,
    pub category: String,
    pub registered_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Order {
    pub merchant_address: Address,
    pub amount: i128,
    pub token: Address,
    pub order_id: String,
    pub payer: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentStatus {
    Pending = 0,
    Completed = 1,
    PartiallyRefunded = 2,
    FullyRefunded = 3,
    Archived = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRecord {
    pub order_id: String,
    pub payer: Address,
    pub merchant: Address,
    pub amount: i128,
    pub refunded_amount: i128,
    pub token: Address,
    pub status: PaymentStatus,
    pub paid_at: u64,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RefundStatus {
    Pending = 0,
    Approved = 1,
    Rejected = 2,
    Completed = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RefundRecord {
    pub refund_id: String,
    pub order_id: String,
    pub amount: i128,
    pub reason: String,
    pub status: RefundStatus,
    pub initiated_by: Address,
    pub initiated_at: u64,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MultisigStatus {
    Pending = 0,
    Approved = 1,
    Cancelled = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MultisigPayment {
    pub payment_id: String,
    pub payer: Address,
    pub merchant: Address,
    pub amount: i128,
    pub token: Address,
    pub required_signatures: u32,
    pub signers: Vec<Address>,
    pub signed: Vec<Address>,
    pub status: MultisigStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FilterOptions {
    pub amount_min: Option<i128>,
    pub amount_max: Option<i128>,
    pub token: Option<Address>,
    pub status: String, // "Any", "Completed", "PartiallyRefunded", "FullyRefunded"
    pub date_start: Option<u64>,
    pub date_end: Option<u64>,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SortField {
    Date,
    Amount,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SortOrder {
    Ascending,
    Descending,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentHistoryResult {
    pub payments: Vec<PaymentRecord>,
    pub next_cursor: Option<String>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GlobalStats {
    pub total_payment_count: u64,
    pub total_payment_volume: i128,
    pub total_refund_count: u64,
    pub total_refund_volume: i128,
    pub active_merchants_count: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StorageKey {
    Admin,
    Merchant(Address),
    Payment(String),
    Refund(String),
    Multisig(String),
    MerchantPayments(Address),
    PayerPayments(Address),
    GlobalPayments,
    GlobalStats,
    CleanupPeriod,
}
