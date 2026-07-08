use soroban_sdk::{contracttype, Address, String, Vec};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Active = 0,
    Released = 1,
    Refunded = 2,
    Disputed = 3,
    Resolved = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub payer: Address,
    pub beneficiary: Address,
    pub amount: i128,
    pub token: Address,
    pub status: EscrowStatus,
    pub deadline: u64,
    pub dispute_fee: i128,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DisputeStatus {
    Voting = 0,
    Ruled = 1,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Dispute {
    pub escrow_id: u32,
    pub payer_evidence: String,
    pub beneficiary_evidence: String,
    pub selected_jurors: Vec<Address>,
    pub votes_payer: Vec<Address>,
    pub votes_beneficiary: Vec<Address>,
    pub status: DisputeStatus,
    pub voted_jurors: Vec<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StorageKey {
    Admin,
    Escrow(u32),
    Dispute(u32),
    JurorStake(Address),
    ActiveJurors,
    TotalEscrowsCount,
    TotalDisputesCount,
    MinJurorStake,
    StakingToken,
}
