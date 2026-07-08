#![no_std]

pub mod error;
pub mod helper;
pub mod storage;
#[cfg(test)]
pub mod test;
pub mod types;

use crate::error::ContractError;
use crate::types::{
    FilterOptions, GlobalStats, Merchant, MultisigPayment, MultisigStatus, Order,
    PaymentHistoryResult, PaymentRecord, PaymentStatus, RefundRecord, RefundStatus, SortField,
    SortOrder, StorageKey,
};
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

#[contract]
pub struct PaymentProcessingContract;

#[contractimpl]
#[allow(clippy::too_many_arguments)]
impl PaymentProcessingContract {
    /// Sets the admin of the contract. Can only be set once by the initial deployer
    /// or updated by the current admin.
    pub fn set_admin(env: Env, admin: Address) -> Result<(), ContractError> {
        if let Some(current_admin) = storage::get_admin(&env) {
            current_admin.require_auth();
        }
        storage::set_admin(&env, &admin);
        Ok(())
    }

    /// Register a new merchant with relevant metadata.
    pub fn register_merchant(
        env: Env,
        merchant_address: Address,
        name: String,
        description: String,
        contact_info: String,
        category: String,
    ) -> Result<(), ContractError> {
        merchant_address.require_auth();

        if storage::has_merchant(&env, &merchant_address) {
            return Err(ContractError::AlreadyRegistered);
        }

        let merchant = Merchant {
            address: merchant_address.clone(),
            name,
            description,
            contact_info,
            category,
            registered_at: env.ledger().timestamp(),
        };

        storage::set_merchant(&env, &merchant_address, &merchant);

        // Update active merchants count in GlobalStats
        let mut stats = Self::get_internal_stats(&env);
        stats.active_merchants_count += 1;
        env.storage()
            .persistent()
            .set(&StorageKey::GlobalStats, &stats);

        Ok(())
    }

    /// Process a standard payment requiring a cryptographic merchant signature.
    pub fn process_payment_with_signature(
        env: Env,
        payer: Address,
        order: Order,
        signature: BytesN<64>,
        merchant_public_key: BytesN<32>,
    ) -> Result<(), ContractError> {
        payer.require_auth();

        // 1. Verify merchant registration
        if !storage::has_merchant(&env, &order.merchant_address) {
            return Err(ContractError::MerchantNotFound);
        }

        // 2. Validate input payment amount
        if order.amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        // 3. Cryptographically verify signature client-signed by merchant
        if !helper::verify_payment_signature(&env, &order, &merchant_public_key, &signature) {
            return Err(ContractError::SignatureVerificationFailed);
        }

        // 4. Check if payment order_id already exists to prevent replay attacks
        if storage::get_payment(&env, &order.order_id).is_some() {
            return Err(ContractError::AlreadyRegistered);
        }

        // 5. Transfer tokens atomically from payer to merchant using standard Soroban Token Client
        let token_client = soroban_sdk::token::Client::new(&env, &order.token);
        token_client.transfer(&payer, &order.merchant_address, &order.amount);

        // 6. Record payment details
        let paid_at = env.ledger().timestamp();
        let expires_at = paid_at + storage::get_cleanup_period(&env);

        let record = PaymentRecord {
            order_id: order.order_id.clone(),
            payer: payer.clone(),
            merchant: order.merchant_address.clone(),
            amount: order.amount,
            refunded_amount: 0,
            token: order.token.clone(),
            status: PaymentStatus::Completed,
            paid_at,
            expires_at,
        };

        storage::set_payment(&env, &order.order_id, &record);
        storage::add_merchant_payment(&env, &order.merchant_address, &order.order_id);
        storage::add_payer_payment(&env, &payer, &order.order_id);
        storage::add_global_payment(&env, &order.order_id);

        // 7. Update statistics
        let mut stats = Self::get_internal_stats(&env);
        stats.total_payment_count += 1;
        stats.total_payment_volume += order.amount;
        env.storage()
            .persistent()
            .set(&StorageKey::GlobalStats, &stats);

        Ok(())
    }

    /// Initiate a refund request by the merchant or the payer.
    pub fn initiate_refund(
        env: Env,
        caller: Address,
        refund_id: String,
        order_id: String,
        amount: i128,
        reason: String,
    ) -> Result<(), ContractError> {
        caller.require_auth();

        // 1. Resolve payment record
        let payment =
            storage::get_payment(&env, &order_id).ok_or(ContractError::PaymentNotFound)?;

        // 2. Validate caller authorization (must be payer or merchant)
        if caller != payment.payer && caller != payment.merchant {
            return Err(ContractError::NotAuthorized);
        }

        // 3. Check 30-day refund eligibility window
        if !helper::check_refund_window(&env, payment.paid_at) {
            return Err(ContractError::RefundWindowExpired);
        }

        // 4. Validate refund boundaries
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if payment.refunded_amount + amount > payment.amount {
            return Err(ContractError::RefundAmountExceeded);
        }

        // 5. Check if refund_id is unique
        if storage::get_refund(&env, &refund_id).is_some() {
            return Err(ContractError::AlreadyRegistered);
        }

        let refund = RefundRecord {
            refund_id: refund_id.clone(),
            order_id,
            amount,
            reason,
            status: RefundStatus::Pending,
            initiated_by: caller,
            initiated_at: env.ledger().timestamp(),
        };

        storage::set_refund(&env, &refund_id, &refund);
        Ok(())
    }

    /// Approve an initiated refund request.
    pub fn approve_refund(
        env: Env,
        caller: Address,
        refund_id: String,
    ) -> Result<(), ContractError> {
        caller.require_auth();

        let mut refund =
            storage::get_refund(&env, &refund_id).ok_or(ContractError::RefundNotFound)?;
        let payment =
            storage::get_payment(&env, &refund.order_id).ok_or(ContractError::PaymentNotFound)?;

        // Only merchant or admin can approve
        let is_admin = storage::get_admin(&env)
            .map(|a| a == caller)
            .unwrap_or(false);
        if caller != payment.merchant && !is_admin {
            return Err(ContractError::NotAuthorized);
        }

        if refund.status != RefundStatus::Pending {
            return Err(ContractError::InvalidStatus);
        }

        refund.status = RefundStatus::Approved;
        storage::set_refund(&env, &refund_id, &refund);
        Ok(())
    }

    /// Execute an approved refund, returning tokens atomically to the original payer.
    pub fn execute_refund(env: Env, refund_id: String) -> Result<(), ContractError> {
        let mut refund =
            storage::get_refund(&env, &refund_id).ok_or(ContractError::RefundNotFound)?;
        let mut payment =
            storage::get_payment(&env, &refund.order_id).ok_or(ContractError::PaymentNotFound)?;

        if refund.status != RefundStatus::Approved {
            return Err(ContractError::InvalidStatus);
        }

        // Recheck amount limits to prevent double-refund attacks
        if payment.refunded_amount + refund.amount > payment.amount {
            return Err(ContractError::RefundAmountExceeded);
        }

        // Transfer funds from merchant back to payer
        let token_client = soroban_sdk::token::Client::new(&env, &payment.token);
        token_client.transfer_from(
            &env.current_contract_address(),
            &payment.merchant,
            &payment.payer,
            &refund.amount,
        );

        // Update payment metrics
        payment.refunded_amount += refund.amount;
        if payment.refunded_amount == payment.amount {
            payment.status = PaymentStatus::FullyRefunded;
        } else {
            payment.status = PaymentStatus::PartiallyRefunded;
        }

        storage::set_payment(&env, &refund.order_id, &payment);

        // Complete refund
        refund.status = RefundStatus::Completed;
        storage::set_refund(&env, &refund_id, &refund);

        // Update statistics
        let mut stats = Self::get_internal_stats(&env);
        stats.total_refund_count += 1;
        stats.total_refund_volume += refund.amount;
        env.storage()
            .persistent()
            .set(&StorageKey::GlobalStats, &stats);

        Ok(())
    }

    /// Retrieve paginated, filtered, and sorted payment history for a merchant.
    pub fn get_merchant_payment_history(
        env: Env,
        merchant: Address,
        cursor: Option<String>,
        limit: u32,
        filter: Option<FilterOptions>,
        sort_field: SortField,
        sort_order: SortOrder,
    ) -> Result<PaymentHistoryResult, ContractError> {
        merchant.require_auth();

        let order_ids = storage::get_merchant_payments(&env, &merchant);
        Self::query_payment_history(
            &env, order_ids, cursor, limit, filter, sort_field, sort_order,
        )
    }

    /// Retrieve paginated, filtered, and sorted payment history for a payer.
    pub fn get_payer_payment_history(
        env: Env,
        payer: Address,
        cursor: Option<String>,
        limit: u32,
        filter: Option<FilterOptions>,
        sort_field: SortField,
        sort_order: SortOrder,
    ) -> Result<PaymentHistoryResult, ContractError> {
        payer.require_auth();

        let order_ids = storage::get_payer_payments(&env, &payer);
        Self::query_payment_history(
            &env, order_ids, cursor, limit, filter, sort_field, sort_order,
        )
    }

    /// Query a specific payment record by ID.
    pub fn get_payment_by_id(
        env: Env,
        caller: Address,
        order_id: String,
    ) -> Result<PaymentRecord, ContractError> {
        caller.require_auth();

        let payment =
            storage::get_payment(&env, &order_id).ok_or(ContractError::PaymentNotFound)?;

        // Authorization check: Caller must be merchant, payer, or admin
        let is_admin = storage::get_admin(&env)
            .map(|a| a == caller)
            .unwrap_or(false);
        if caller != payment.merchant && caller != payment.payer && !is_admin {
            return Err(ContractError::NotAuthorized);
        }

        Ok(payment)
    }

    /// Fetch cumulative platform metrics (Admin only).
    pub fn get_global_payment_stats(
        env: Env,
        admin: Address,
        date_start: Option<u64>,
        date_end: Option<u64>,
    ) -> Result<GlobalStats, ContractError> {
        admin.require_auth();

        let current_admin = storage::get_admin(&env).ok_or(ContractError::NotAuthorized)?;
        if admin != current_admin {
            return Err(ContractError::NotAuthorized);
        }

        if let (Some(start), Some(end)) = (date_start, date_end) {
            if start > end {
                return Err(ContractError::DateRangeInvalid);
            }
        }

        // Return calculated global tally
        let mut stats = Self::get_internal_stats(&env);

        // If date range is specified, recalculate stats dynamically for the window
        if date_start.is_some() || date_end.is_some() {
            let mut volume = 0;
            let mut count = 0;
            let order_ids = storage::get_global_payments(&env);

            for id in order_ids.iter() {
                if let Some(payment) = storage::get_payment(&env, &id) {
                    let mut matches = true;
                    if let Some(start) = date_start {
                        if payment.paid_at < start {
                            matches = false;
                        }
                    }
                    if let Some(end) = date_end {
                        if payment.paid_at > end {
                            matches = false;
                        }
                    }
                    if matches {
                        count += 1;
                        volume += payment.amount;
                    }
                }
            }
            stats.total_payment_count = count;
            stats.total_payment_volume = volume;
        }

        Ok(stats)
    }

    /// Allows merchants or admins to directly update status of a payment (e.g. log partial manual refunds).
    pub fn update_payment_status(
        env: Env,
        caller: Address,
        order_id: String,
        refunded_amount: i128,
    ) -> Result<(), ContractError> {
        caller.require_auth();

        let mut payment =
            storage::get_payment(&env, &order_id).ok_or(ContractError::PaymentNotFound)?;

        let is_admin = storage::get_admin(&env)
            .map(|a| a == caller)
            .unwrap_or(false);
        if caller != payment.merchant && !is_admin {
            return Err(ContractError::NotAuthorized);
        }

        if refunded_amount < 0 || refunded_amount > payment.amount {
            return Err(ContractError::InvalidAmount);
        }

        payment.refunded_amount = refunded_amount;
        if refunded_amount == payment.amount {
            payment.status = PaymentStatus::FullyRefunded;
        } else if refunded_amount > 0 {
            payment.status = PaymentStatus::PartiallyRefunded;
        } else {
            payment.status = PaymentStatus::Completed;
        }

        storage::set_payment(&env, &order_id, &payment);
        Ok(())
    }

    /// Archive an old payment record. (Admin only)
    pub fn archive_payment_record(
        env: Env,
        admin: Address,
        order_id: String,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        let current_admin = storage::get_admin(&env).ok_or(ContractError::NotAuthorized)?;
        if admin != current_admin {
            return Err(ContractError::NotAuthorized);
        }

        let mut payment =
            storage::get_payment(&env, &order_id).ok_or(ContractError::PaymentNotFound)?;
        payment.status = PaymentStatus::Archived;

        storage::set_payment(&env, &order_id, &payment);
        Ok(())
    }

    /// Clean up expired payment records to free up ledger state. (Admin only)
    pub fn cleanup_expired_payments(env: Env, admin: Address) -> Result<(), ContractError> {
        admin.require_auth();

        let current_admin = storage::get_admin(&env).ok_or(ContractError::NotAuthorized)?;
        if admin != current_admin {
            return Err(ContractError::NotAuthorized);
        }

        let order_ids = storage::get_global_payments(&env);
        let mut active_orders = Vec::new(&env);
        let now = env.ledger().timestamp();

        for id in order_ids.iter() {
            if let Some(payment) = storage::get_payment(&env, &id) {
                if now > payment.expires_at {
                    // Delete expired payment details
                    env.storage()
                        .persistent()
                        .remove(&StorageKey::Payment(id.clone()));
                } else {
                    active_orders.push_back(id.clone());
                }
            }
        }

        storage::set_global_payments(&env, &active_orders);
        Ok(())
    }

    /// Configure the expiration duration for payments (Admin only).
    pub fn set_payment_cleanup_period(
        env: Env,
        admin: Address,
        period: u64,
    ) -> Result<(), ContractError> {
        admin.require_auth();

        let current_admin = storage::get_admin(&env).ok_or(ContractError::NotAuthorized)?;
        if admin != current_admin {
            return Err(ContractError::NotAuthorized);
        }

        if period < 86400 {
            // Minimum cleanup period: 1 day (in seconds)
            return Err(ContractError::CleanupPeriodTooShort);
        }

        storage::set_cleanup_period(&env, period);
        Ok(())
    }

    /// Initiate a multi-signature payment request.
    #[allow(clippy::too_many_arguments)]
    pub fn initiate_multisig_payment(
        env: Env,
        payment_id: String,
        payer: Address,
        merchant: Address,
        amount: i128,
        token: Address,
        required_signatures: u32,
        signers: Vec<Address>,
    ) -> Result<(), ContractError> {
        payer.require_auth();

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if required_signatures == 0 || required_signatures > signers.len() {
            return Err(ContractError::NotAuthorized);
        }

        if storage::get_multisig(&env, &payment_id).is_some() {
            return Err(ContractError::AlreadyRegistered);
        }

        let multisig = MultisigPayment {
            payment_id: payment_id.clone(),
            payer,
            merchant,
            amount,
            token,
            required_signatures,
            signers,
            signed: Vec::new(&env),
            status: MultisigStatus::Pending,
        };

        storage::set_multisig(&env, &payment_id, &multisig);
        Ok(())
    }

    /// Approve a multi-signature payment. If signatures meet threshold, tokens are transferred.
    pub fn sign_multisig_payment(
        env: Env,
        caller: Address,
        payment_id: String,
    ) -> Result<(), ContractError> {
        caller.require_auth();

        let mut multisig =
            storage::get_multisig(&env, &payment_id).ok_or(ContractError::MultisigNotFound)?;

        if multisig.status != MultisigStatus::Pending {
            return Err(ContractError::MultisigCompleted);
        }

        // Verify caller is an authorized signer
        let mut is_signer = false;
        for signer in multisig.signers.iter() {
            if signer == caller {
                is_signer = true;
                break;
            }
        }
        if !is_signer {
            return Err(ContractError::NotAuthorized);
        }

        // Check duplicate signatures
        for signed_addr in multisig.signed.iter() {
            if signed_addr == caller {
                return Err(ContractError::MultisigAlreadySigned);
            }
        }

        multisig.signed.push_back(caller);

        // Threshold evaluation
        if multisig.signed.len() >= multisig.required_signatures {
            // Execute payment
            let token_client = soroban_sdk::token::Client::new(&env, &multisig.token);
            token_client.transfer_from(
                &env.current_contract_address(),
                &multisig.payer,
                &multisig.merchant,
                &multisig.amount,
            );

            // Record as standard payment
            let paid_at = env.ledger().timestamp();
            let expires_at = paid_at + storage::get_cleanup_period(&env);

            let record = PaymentRecord {
                order_id: payment_id.clone(),
                payer: multisig.payer.clone(),
                merchant: multisig.merchant.clone(),
                amount: multisig.amount,
                refunded_amount: 0,
                token: multisig.token.clone(),
                status: PaymentStatus::Completed,
                paid_at,
                expires_at,
            };

            storage::set_payment(&env, &payment_id, &record);
            storage::add_merchant_payment(&env, &multisig.merchant, &payment_id);
            storage::add_payer_payment(&env, &multisig.payer, &payment_id);
            storage::add_global_payment(&env, &payment_id);

            // Update stats
            let mut stats = Self::get_internal_stats(&env);
            stats.total_payment_count += 1;
            stats.total_payment_volume += multisig.amount;
            env.storage()
                .persistent()
                .set(&StorageKey::GlobalStats, &stats);

            multisig.status = MultisigStatus::Approved;
        }

        storage::set_multisig(&env, &payment_id, &multisig);
        Ok(())
    }

    // --- Internal Helpers ---

    fn get_internal_stats(env: &Env) -> GlobalStats {
        env.storage()
            .persistent()
            .get(&StorageKey::GlobalStats)
            .unwrap_or(GlobalStats {
                total_payment_count: 0,
                total_payment_volume: 0,
                total_refund_count: 0,
                total_refund_volume: 0,
                active_merchants_count: 0,
            })
    }

    /// Handles pagination, sorting, and filtering over vector lists.
    /// Handles pagination, sorting, and filtering over vector lists.
    fn query_payment_history(
        env: &Env,
        order_ids: Vec<String>,
        cursor: Option<String>,
        limit: u32,
        filter_opts: Option<FilterOptions>,
        sort_field: SortField,
        sort_order: SortOrder,
    ) -> Result<PaymentHistoryResult, ContractError> {
        let max_limit = 100;
        let final_limit = if limit > max_limit { max_limit } else { limit };

        // 1. Fetch and filter records
        let mut matching_records = Vec::new(env);

        for id in order_ids.iter() {
            if let Some(record) = storage::get_payment(env, &id) {
                let mut matches = true;

                if let Some(ref filter) = filter_opts {
                    if let Some(min) = filter.amount_min {
                        if record.amount < min {
                            matches = false;
                        }
                    }
                    if let Some(max) = filter.amount_max {
                        if record.amount > max {
                            matches = false;
                        }
                    }
                    if let Some(ref tok) = filter.token {
                        if record.token != *tok {
                            matches = false;
                        }
                    }
                    if let Some(start) = filter.date_start {
                        if record.paid_at < start {
                            matches = false;
                        }
                    }
                    if let Some(end) = filter.date_end {
                        if record.paid_at > end {
                            matches = false;
                        }
                    }

                    let status_str = filter.status.clone();
                    if status_str != String::from_str(env, "Any") {
                        let record_status_str = match record.status {
                            PaymentStatus::Pending => String::from_str(env, "Pending"),
                            PaymentStatus::Completed => String::from_str(env, "Completed"),
                            PaymentStatus::PartiallyRefunded => {
                                String::from_str(env, "PartiallyRefunded")
                            }
                            PaymentStatus::FullyRefunded => String::from_str(env, "FullyRefunded"),
                            PaymentStatus::Archived => String::from_str(env, "Archived"),
                        };
                        if status_str != record_status_str {
                            matches = false;
                        }
                    }
                }

                if matches {
                    matching_records.push_back(record);
                }
            }
        }

        // 2. Sort matching records using host-side Vector Bubble Sort
        let len = matching_records.len();
        if len > 1 {
            for i in 0..len - 1 {
                for j in 0..len - i - 1 {
                    let a = matching_records.get_unchecked(j);
                    let b = matching_records.get_unchecked(j + 1);

                    let should_swap = match sort_field {
                        SortField::Date => {
                            let comp = a.paid_at.cmp(&b.paid_at);
                            match sort_order {
                                SortOrder::Ascending => comp == core::cmp::Ordering::Greater,
                                SortOrder::Descending => comp == core::cmp::Ordering::Less,
                            }
                        }
                        SortField::Amount => {
                            let comp = a.amount.cmp(&b.amount);
                            match sort_order {
                                SortOrder::Ascending => comp == core::cmp::Ordering::Greater,
                                SortOrder::Descending => comp == core::cmp::Ordering::Less,
                            }
                        }
                    };

                    if should_swap {
                        matching_records.set(j, b);
                        matching_records.set(j + 1, a);
                    }
                }
            }
        }

        // 3. Paginate using host index logic
        let mut start_idx: u32 = 0;
        if let Some(ref cursor_id) = cursor {
            for idx in 0..matching_records.len() {
                if matching_records.get_unchecked(idx).order_id == *cursor_id {
                    start_idx = idx + 1;
                    break;
                }
            }
        }

        let mut paginated = Vec::new(env);
        let mut count: u32 = 0;
        let mut next_cursor = None;

        for i in start_idx..matching_records.len() {
            if count >= final_limit {
                next_cursor = Some(matching_records.get_unchecked(i - 1).order_id.clone());
                break;
            }
            paginated.push_back(matching_records.get_unchecked(i));
            count += 1;
        }

        // If there are remaining elements, set the next cursor
        if count > 0 && start_idx + count < matching_records.len() {
            next_cursor = Some(
                matching_records
                    .get_unchecked(start_idx + count - 1)
                    .order_id
                    .clone(),
            );
        }

        Ok(PaymentHistoryResult {
            payments: paginated,
            next_cursor,
        })
    }
}
