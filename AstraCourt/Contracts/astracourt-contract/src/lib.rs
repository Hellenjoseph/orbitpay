#![no_std]

pub mod error;
pub mod helper;
pub mod storage;
#[cfg(test)]
pub mod test;
pub mod types;

use crate::error::ContractError;
use crate::types::{Dispute, DisputeStatus, Escrow, EscrowStatus};
use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

#[contract]
pub struct AstraCourtContract;

#[contractimpl]
#[allow(clippy::too_many_arguments)]
impl AstraCourtContract {
    /// Sets the admin of the court. Can only be set once.
    pub fn set_admin(env: Env, admin: Address) -> Result<(), ContractError> {
        if let Some(current_admin) = storage::get_admin(&env) {
            current_admin.require_auth();
        }
        storage::set_admin(&env, &admin);
        Ok(())
    }

    /// Configures the staking settings for jurors.
    pub fn configure_staking(
        env: Env,
        admin: Address,
        token: Address,
        min_stake: i128,
    ) -> Result<(), ContractError> {
        // Authenticate admin
        let current_admin = storage::get_admin(&env).ok_or(ContractError::AdminNotSet)?;
        if current_admin != admin {
            return Err(ContractError::NotAuthorized);
        }
        admin.require_auth();

        storage::set_staking_token(&env, &token);
        storage::set_min_juror_stake(&env, min_stake);
        Ok(())
    }

    /// Allows a user to stake tokens to register as a juror.
    pub fn stake_juror(env: Env, juror: Address, amount: i128) -> Result<(), ContractError> {
        juror.require_auth();

        let token_address =
            storage::get_staking_token(&env).ok_or(ContractError::StakingTokenMismatch)?;
        let min_stake = storage::get_min_juror_stake(&env);

        let token_client = soroban_sdk::token::Client::new(&env, &token_address);

        // Transfer staking tokens from juror to contract
        token_client.transfer_from(
            &env.current_contract_address(),
            &juror,
            &env.current_contract_address(),
            &amount,
        );

        let current_stake = storage::get_juror_stake(&env, &juror);
        let new_stake = current_stake + amount;
        storage::set_juror_stake(&env, &juror, new_stake);

        // Add to active juror pool if stake meets the minimum threshold
        if new_stake >= min_stake {
            let mut active_jurors = storage::get_active_jurors(&env);
            let mut already_active = false;
            for j in active_jurors.iter() {
                if j == juror {
                    already_active = true;
                    break;
                }
            }
            if !already_active {
                active_jurors.push_back(juror.clone());
                storage::set_active_jurors(&env, &active_jurors);
            }
        }

        Ok(())
    }

    /// Allows a juror to unstake tokens.
    pub fn unstake_juror(env: Env, juror: Address, amount: i128) -> Result<(), ContractError> {
        juror.require_auth();

        let token_address =
            storage::get_staking_token(&env).ok_or(ContractError::StakingTokenMismatch)?;
        let current_stake = storage::get_juror_stake(&env, &juror);

        if current_stake < amount {
            return Err(ContractError::InsufficientStake);
        }

        // Subtract stake
        let new_stake = current_stake - amount;
        storage::set_juror_stake(&env, &juror, new_stake);

        // Remove from active pool if new stake falls below minimum
        let min_stake = storage::get_min_juror_stake(&env);
        if new_stake < min_stake {
            let mut active_jurors = storage::get_active_jurors(&env);
            if let Some(pos) = active_jurors.iter().position(|j| j == juror) {
                active_jurors.remove(pos as u32);
                storage::set_active_jurors(&env, &active_jurors);
            }
        }

        // Transfer tokens back to juror
        let token_client = soroban_sdk::token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &juror, &amount);

        Ok(())
    }

    /// Creates a secure escrow transaction lock.
    pub fn create_escrow(
        env: Env,
        payer: Address,
        beneficiary: Address,
        amount: i128,
        token: Address,
        deadline: u64,
        dispute_fee: i128,
    ) -> Result<u32, ContractError> {
        payer.require_auth();

        if amount <= 0 || dispute_fee < 0 {
            return Err(ContractError::InvalidEscrowAmount);
        }

        // Transfer funds from payer to contract Address
        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer_from(
            &env.current_contract_address(),
            &payer,
            &env.current_contract_address(),
            &amount,
        );

        let escrow = Escrow {
            payer: payer.clone(),
            beneficiary: beneficiary.clone(),
            amount,
            token,
            status: EscrowStatus::Active,
            deadline,
            dispute_fee,
        };

        let escrow_id = storage::increment_total_escrows(&env);
        storage::set_escrow(&env, escrow_id, &escrow);

        Ok(escrow_id)
    }

    /// Releases escrowed funds to the beneficiary (invoked by Payer).
    pub fn release_funds(env: Env, escrow_id: u32) -> Result<(), ContractError> {
        let mut escrow =
            storage::get_escrow(&env, escrow_id).ok_or(ContractError::EscrowNotFound)?;

        if escrow.status != EscrowStatus::Active {
            return Err(ContractError::EscrowNotActive);
        }

        // Only the payer can release funds before timeout
        escrow.payer.require_auth();

        escrow.status = EscrowStatus::Released;
        storage::set_escrow(&env, escrow_id, &escrow);

        // Payout to beneficiary
        let token_client = soroban_sdk::token::Client::new(&env, &escrow.token);
        token_client.transfer(
            &env.current_contract_address(),
            &escrow.beneficiary,
            &escrow.amount,
        );

        Ok(())
    }

    /// Refunds escrowed funds back to the payer (invoked by Beneficiary).
    pub fn refund_escrow(env: Env, escrow_id: u32) -> Result<(), ContractError> {
        let mut escrow =
            storage::get_escrow(&env, escrow_id).ok_or(ContractError::EscrowNotFound)?;

        if escrow.status != EscrowStatus::Active {
            return Err(ContractError::EscrowNotActive);
        }

        // Only beneficiary can voluntarily refund payer
        escrow.beneficiary.require_auth();

        escrow.status = EscrowStatus::Refunded;
        storage::set_escrow(&env, escrow_id, &escrow);

        // Payout back to payer
        let token_client = soroban_sdk::token::Client::new(&env, &escrow.token);
        token_client.transfer(
            &env.current_contract_address(),
            &escrow.payer,
            &escrow.amount,
        );

        Ok(())
    }

    /// Raises an on-chain dispute locking the escrow and selecting random jurors.
    pub fn raise_dispute(
        env: Env,
        caller: Address,
        escrow_id: u32,
        evidence_hash: String,
    ) -> Result<u32, ContractError> {
        caller.require_auth();

        let mut escrow =
            storage::get_escrow(&env, escrow_id).ok_or(ContractError::EscrowNotFound)?;

        if escrow.status != EscrowStatus::Active {
            return Err(ContractError::EscrowNotActive);
        }

        // Only payer or beneficiary can raise a dispute
        if caller != escrow.payer && caller != escrow.beneficiary {
            return Err(ContractError::NotAuthorized);
        }

        // Select 3 random unique jurors from the pool
        let selected_jurors = helper::select_random_jurors(&env, 3);
        if selected_jurors.is_empty() {
            return Err(ContractError::NoJurorsAvailable);
        }

        escrow.status = EscrowStatus::Disputed;
        storage::set_escrow(&env, escrow_id, &escrow);

        let dispute_id = storage::increment_total_disputes(&env);

        let dispute = Dispute {
            escrow_id,
            payer_evidence: if caller == escrow.payer {
                evidence_hash.clone()
            } else {
                String::from_str(&env, "")
            },
            beneficiary_evidence: if caller == escrow.beneficiary {
                evidence_hash
            } else {
                String::from_str(&env, "")
            },
            selected_jurors,
            votes_payer: Vec::new(&env),
            votes_beneficiary: Vec::new(&env),
            status: DisputeStatus::Voting,
            voted_jurors: Vec::new(&env),
        };

        storage::set_dispute(&env, dispute_id, &dispute);
        Ok(dispute_id)
    }

    /// Allows selected jurors to cast votes on active disputes.
    pub fn cast_vote(
        env: Env,
        juror: Address,
        dispute_id: u32,
        vote: u32, // 1 = Refund Payer, 2 = Release to Beneficiary
    ) -> Result<(), ContractError> {
        juror.require_auth();

        let mut dispute =
            storage::get_dispute(&env, dispute_id).ok_or(ContractError::DisputeNotFound)?;

        if dispute.status != DisputeStatus::Voting {
            return Err(ContractError::DisputeNotActive);
        }

        // Check if juror is selected
        let mut is_selected = false;
        for j in dispute.selected_jurors.iter() {
            if j == juror {
                is_selected = true;
                break;
            }
        }
        if !is_selected {
            return Err(ContractError::JurorNotSelected);
        }

        // Check if already voted
        for v in dispute.voted_jurors.iter() {
            if v == juror {
                return Err(ContractError::JurorAlreadyVoted);
            }
        }

        // Record vote
        if vote == 1 {
            dispute.votes_payer.push_back(juror.clone());
        } else {
            dispute.votes_beneficiary.push_back(juror.clone());
        }

        dispute.voted_jurors.push_back(juror);
        storage::set_dispute(&env, dispute_id, &dispute);

        // Auto-resolve if all selected jurors have voted
        if dispute.voted_jurors.len() == dispute.selected_jurors.len() {
            Self::resolve_dispute(env, dispute_id)?;
        }

        Ok(())
    }

    /// Resolves disputes by distributing rewards/slashing stakes.
    pub fn resolve_dispute(env: Env, dispute_id: u32) -> Result<(), ContractError> {
        let mut dispute =
            storage::get_dispute(&env, dispute_id).ok_or(ContractError::DisputeNotFound)?;

        if dispute.status != DisputeStatus::Voting {
            return Err(ContractError::DisputeNotActive);
        }

        let mut escrow =
            storage::get_escrow(&env, dispute.escrow_id).ok_or(ContractError::EscrowNotFound)?;

        let payer_votes_count = dispute.votes_payer.len();
        let beneficiary_votes_count = dispute.votes_beneficiary.len();

        // Determine winning ruling and payout destination
        let (winner, winning_jurors, losing_jurors) = if payer_votes_count > beneficiary_votes_count
        {
            (
                escrow.payer.clone(),
                dispute.votes_payer.clone(),
                dispute.votes_beneficiary.clone(),
            )
        } else {
            (
                escrow.beneficiary.clone(),
                dispute.votes_beneficiary.clone(),
                dispute.votes_payer.clone(),
            )
        };

        // Determine fee cap
        let fee = if escrow.dispute_fee > escrow.amount {
            escrow.amount
        } else {
            escrow.dispute_fee
        };
        let payout = escrow.amount - fee;

        // 1. Release funds to winner
        let token_client = soroban_sdk::token::Client::new(&env, &escrow.token);
        if payout > 0 {
            token_client.transfer(&env.current_contract_address(), &winner, &payout);
        }

        // 2. Punish/Slash losing jurors
        let penalty = 100; // Flat penalty (in tokens) for voting with the minority
        let mut total_slashed_tokens = 0;
        let min_stake = storage::get_min_juror_stake(&env);

        for juror in losing_jurors.iter() {
            let current_stake = storage::get_juror_stake(&env, &juror);
            let slash_amount = if current_stake > penalty {
                penalty
            } else {
                current_stake
            };
            let new_stake = current_stake - slash_amount;

            storage::set_juror_stake(&env, &juror, new_stake);
            total_slashed_tokens += slash_amount;

            // Remove from active stakers if below min stake limit
            if new_stake < min_stake {
                let mut active_jurors = storage::get_active_jurors(&env);
                if let Some(pos) = active_jurors.iter().position(|x| x == juror) {
                    active_jurors.remove(pos as u32);
                    storage::set_active_jurors(&env, &active_jurors);
                }
            }
        }

        // 3. Reward winning jurors (dispute fee + slashed losing stakes split equally)
        let winning_jurors_len = winning_jurors.len();
        if winning_jurors_len > 0 {
            let total_reward_pool = fee + total_slashed_tokens;
            let reward_per_juror = total_reward_pool / (winning_jurors_len as i128);

            let staking_token =
                storage::get_staking_token(&env).ok_or(ContractError::StakingTokenMismatch)?;
            let court_token_client = soroban_sdk::token::Client::new(&env, &staking_token);

            for juror in winning_jurors.iter() {
                court_token_client.transfer(
                    &env.current_contract_address(),
                    &juror,
                    &reward_per_juror,
                );
            }
        }

        // Update states
        escrow.status = EscrowStatus::Resolved;
        storage::set_escrow(&env, dispute.escrow_id, &escrow);

        dispute.status = DisputeStatus::Ruled;
        storage::set_dispute(&env, dispute_id, &dispute);

        Ok(())
    }

    /// Reads details of an escrow.
    pub fn get_escrow(env: Env, escrow_id: u32) -> Option<Escrow> {
        storage::get_escrow(&env, escrow_id)
    }

    /// Reads details of a dispute.
    pub fn get_dispute(env: Env, dispute_id: u32) -> Option<Dispute> {
        storage::get_dispute(&env, dispute_id)
    }

    /// Reads a juror's current stake.
    pub fn get_juror_stake(env: Env, juror: Address) -> i128 {
        storage::get_juror_stake(&env, &juror)
    }
}
