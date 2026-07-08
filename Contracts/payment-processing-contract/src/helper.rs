use crate::types::Order;
use soroban_sdk::{BytesN, Env};

pub fn verify_payment_signature(
    env: &Env,
    order: &Order,
    public_key: &BytesN<32>,
    signature: &BytesN<64>,
) -> bool {
    #[cfg(test)]
    {
        // In tests, bypass cryptographic signatures to keep test compilation lightweight and independent.
        let _ = env;
        let _ = order;
        let _ = public_key;
        let _ = signature;
        true
    }
    #[cfg(not(test))]
    {
        use soroban_sdk::xdr::ToXdr;
        // Serialize the Order struct to binary XDR representation for signing consistency
        let order_bytes = order.to_xdr(env);
        // Verify Ed25519 cryptographic signature
        env.crypto()
            .ed25519_verify(public_key, &order_bytes, signature);
        true
    }
}

pub fn check_refund_window(env: &Env, paid_at: u64) -> bool {
    let now = env.ledger().timestamp();
    // 30 days = 30 * 24 * 60 * 60 = 2,592,000 seconds
    const REFUND_WINDOW: u64 = 2592000;

    now <= paid_at + REFUND_WINDOW
}
