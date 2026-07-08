# OrbitPay 🌌

[![OrbitPay CI](https://github.com/Hellenjoseph/stellarsettle/actions/workflows/ci.yml/badge.svg)](https://github.com/Hellenjoseph/stellarsettle/actions/workflows/ci.yml)
[![Soroban](https://img.shields.io/badge/Soroban-v26.1.0-blue.svg)](https://soroban.stellar.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg)](LICENSE)

**OrbitPay** is a comprehensive, production-grade payment processing smart contract built for the Stellar Soroban network. Designed to power decentralized commerce, it features robust merchant onboarding, secure signature-verified payments, client-side zero-knowledge-ready refund approvals, multi-signature checkout pipelines, and host-managed filtered and sorted transaction history queries.

---

## 🚀 Key Features

*   **Merchant Registry**: Transparent merchant registration and metadata management (name, description, email, category) with active merchant accounting.
*   **Signature-Verified Payments**: Ed25519 cryptographic signature checks protecting merchant orders against replays, double-spend, and unauthorized claims.
*   **Refund Lifecycles**: Multi-step refund pipeline (initiation by payer $\rightarrow$ approval by merchant $\rightarrow$ execution by contract) protected by standard ERC-20 token approval rules.
*   **Multi-Signature Checkout**: Threshold-based signer groups for secure corporate payment approvals.
*   **Dynamic Ledger Queries**: On-chain pagination, sorting, and filtering of transactions without relying on external indexers.
*   **State Sanitation**: Persistent state cleanups and garbage collection parameters to manage ledger storage fees.

---

## 🛠️ Folder Architecture

```
orbitpay/
├── .github/workflows/
│   └── ci.yml                          # Continuous Integration pipeline
├── Contracts/
│   └── payment-processing-contract/
│       ├── src/
│       │   ├── error.rs                # Execution error codes
│       │   ├── helper.rs               # Cryptographic and time helpers
│       │   ├── lib.rs                  # Core contract methods
│       │   ├── storage.rs              # Persistent storage wrappers
│       │   ├── test.rs                 # Unit test suite
│       │   └── types.rs                # State types and structures
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

Run these commands inside `Contracts/payment-processing-contract/`:

### 🧪 Run Unit Tests

Execute the full suite of unit tests checking merchant registrations, signature checks, refunds, and multisig:

```bash
cargo test
```

### 📦 Build WebAssembly Contract

Compile the optimized, bare-metal WebAssembly contract ready for deployment:

```bash
cargo build --target wasm32v1-none --release
```

The compiled contract will be output at:
`target/wasm32v1-none/release/payment_processing_contract.wasm`

---

## 📜 Smart Contract API

### Merchant Registry
*   `register_merchant(merchant: Address, name: String, description: String, email: String, category: String)`
*   `get_merchant(merchant: Address) -> Merchant`

### Payments
*   `process_payment_with_signature(payer: Address, order: Order, signature: BytesN<64>, merchant_pubkey: BytesN<32>)`
*   `get_payment_by_id(payer: Address, order_id: String) -> PaymentRecord`

### Refunds
*   `initiate_refund(payer: Address, refund_id: String, order_id: String, amount: i128, reason: String)`
*   `approve_refund(merchant: Address, refund_id: String)`
*   `execute_refund(refund_id: String)`

### Multi-Signature Payments
*   `initiate_multisig_payment(payment_id: String, payer: Address, merchant: Address, amount: i128, token: Address, required_signatures: u32, signers: Vec<Address>)`
*   `sign_multisig_payment(caller: Address, payment_id: String)`

### Queries & Administration
*   `get_merchant_payment_history(merchant: Address, cursor: Option<String>, limit: u32, filter: Option<FilterOptions>, sort_field: SortField, sort_order: SortOrder) -> PaymentHistoryResult`
*   `get_payer_payment_history(payer: Address, cursor: Option<String>, limit: u32, filter: Option<FilterOptions>, sort_field: SortField, sort_order: SortOrder) -> PaymentHistoryResult`
*   `set_cleanup_period(admin: Address, period: u64)`

---

## 🛡️ License

This project is licensed under the Apache License 2.0. See the `LICENSE` file for details.
