use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
#[repr(u32)]
pub enum ContractError {
    NotAuthorized = 1,
    NotRegistered = 2,
    AlreadyRegistered = 3,
    MerchantNotFound = 4,
    PaymentNotFound = 5,
    RefundNotFound = 6,
    InvalidAmount = 7,
    InvalidStatus = 8,
    RefundWindowExpired = 9,
    RefundAmountExceeded = 10,
    SignatureVerificationFailed = 11,
    MultisigAlreadySigned = 12,
    MultisigCompleted = 13,
    MultisigNotFound = 14,
    TokenTransferFailed = 15,
    CleanupPeriodTooShort = 16,
    DateRangeInvalid = 17,
}
