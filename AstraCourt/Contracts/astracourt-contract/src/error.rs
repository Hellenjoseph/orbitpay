use soroban_sdk::contracterror;

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum ContractError {
    AdminNotSet = 1,
    NotAuthorized = 2,
    EscrowNotFound = 3,
    EscrowNotActive = 4,
    EscrowExpired = 5,
    EscrowNotExpired = 6,
    DisputeAlreadyRaised = 7,
    DisputeNotFound = 8,
    DisputeNotActive = 9,
    MinStakeNotMet = 10,
    InsufficientStake = 11,
    JurorAlreadyVoted = 12,
    JurorNotSelected = 13,
    InvalidEscrowAmount = 14,
    NoJurorsAvailable = 15,
    JurorActiveInDisputes = 16,
    StakingTokenMismatch = 17,
}
