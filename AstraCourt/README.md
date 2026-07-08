# AstraCourt ⚖️

[![AstraCourt CI](https://github.com/Hellenjoseph/orbitpay/actions/workflows/ci.yml/badge.svg)](https://github.com/Hellenjoseph/orbitpay/actions/workflows/ci.yml)
[![Soroban](https://img.shields.io/badge/Soroban-v26.1.0-blue.svg)](https://soroban.stellar.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg)](LICENSE)

**AstraCourt** is a decentralized, Kleros-inspired escrow and dispute arbitration protocol built natively on the Stellar Soroban smart contract network. It allows parties to conduct high-value transactions (such as freelancing, OTC trades, and e-commerce checkouts) with funds held safely in smart contract escrows. If a dispute arises, it is resolved on-chain by an incentivized panel of staker-jurors selected pseudo-randomly from the court's staking pool.

---

## 🚀 Key Features

*   **Secure Escrow Locks**: Payer locks contract tokens, specifying the beneficiary, payout deadline, and dispute fees.
*   **Decentralized Staking Court**: Stakers lock tokens into the court to qualify as active Jurors, earning yields from transaction dispute fees.
*   **Pseudo-Random Juror Selection**: Employs ledger-seeded entropy to select unique, randomized juror panels on-chain, preventing selection forecasting.
*   **Kleros-Inspired Slashing & Rewards**: 
    *   Winning jurors receive the dispute fee plus a split of slashed stakes from losing jurors.
    *   Losing jurors (who voted in the minority) have their stakes penalized/slashed, creating a strong game-theoretic incentive for fair voting.
*   **Automated Dispute Resolutions**: Once all jurors vote, the contract automatically payouts the winner and settles the court fees.

---

## 🛠️ Folder Architecture

```
AstraCourt/
├── .github/workflows/
│   └── ci.yml                          # Continuous Integration pipeline
├── Contracts/
│   └── astracourt-contract/
│       ├── src/
│       │   ├── error.rs                # Execution error codes
│       │   ├── helper.rs               # Unique random juror selector
│       │   ├── lib.rs                  # Core court methods
│       │   ├── storage.rs              # State persistent interfaces
│       │   ├── test.rs                 # Unit test suite
│       │   └── types.rs                # State types and storage structures
│       └── Cargo.toml                  # Contract dependencies
├── Cargo.toml                          # Workspace root
└── README.md                           # Documentation
```

---

## ⚙️ Setup & Installation

### Prerequisites

Ensure you have Rust and the WebAssembly target installed:

1.  **Install Rust**:
    ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    ```
2.  **Add target `wasm32v1-none`** (recommended for Soroban contracts compiled on Rust 1.84+):
    ```bash
    rustup target add wasm32v1-none
    ```
3.  **Install Soroban CLI**:
    ```bash
    cargo install --locked soroban-cli
    ```

---

## 💻 Developer Commands

Run these commands inside `Contracts/astracourt-contract/`:

### 🧪 Run Unit Tests

Execute the full suite of unit tests checking staking, release, dispute creation, juror voting, majority rulings, and stake slashing:

```bash
cargo test
```

### 📦 Build WebAssembly Contract

Compile the optimized, bare-metal WebAssembly contract ready for deployment:

```bash
cargo build --target wasm32v1-none --release
```

The compiled contract will be output at:
`target/wasm32v1-none/release/astracourt_contract.wasm`

---

## 📜 Smart Contract API

### Court Staking Configuration
*   `set_admin(admin: Address)`
*   `configure_staking(admin: Address, token: Address, min_stake: i128)`
*   `stake_juror(juror: Address, amount: i128)`
*   `unstake_juror(juror: Address, amount: i128)`
*   `get_juror_stake(juror: Address) -> i128`

### Escrows
*   `create_escrow(payer: Address, beneficiary: Address, amount: i128, token: Address, deadline: u64, dispute_fee: i128) -> u32`
*   `release_funds(escrow_id: u32)`
*   `refund_escrow(escrow_id: u32)`
*   `get_escrow(escrow_id: u32) -> Option<Escrow>`

### Disputes & Arbitration
*   `raise_dispute(caller: Address, escrow_id: u32, evidence_hash: String) -> u32`
*   `cast_vote(juror: Address, dispute_id: u32, vote: u32)`
*   `resolve_dispute(dispute_id: u32)`
*   `get_dispute(dispute_id: u32) -> Option<Dispute>`

---

## 🛡️ License

This project is licensed under the Apache License 2.0. See the `LICENSE` file for details.
