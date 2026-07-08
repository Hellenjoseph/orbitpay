# Contributing to OrbitPay 🌌

Thank you for your interest in contributing to OrbitPay! We welcome community contributions, bug reports, feature requests, and documentation improvements.

---

## 🗺️ Contribution Guidelines

1.  **Search Existing Issues**: Before starting work or submitting a bug report, search the issue tracker to ensure it hasn't already been discussed.
2.  **Submit a Proposal**: For larger features or changes, open an issue first to align on the design and scope.
3.  **Create a Branch**: Create a descriptive branch name (e.g. `feat/add-new-metric` or `fix/revert-reentrancy`).

---

## 🛠️ Local Development & Standards

To ensure your code meets the quality standards required for the Stellar Wave Program:

### 1. Style & Formatting
We enforce standard Rust formatting rules. Run:
```bash
cargo fmt --all -- --check
```

### 2. Linting (Clippy)
Ensure there are no compiler or style warnings:
```bash
cargo clippy --all-targets -- -D warnings
```

### 3. Unit Testing
All code changes must have associated unit tests. Verify that the entire test suite passes:
```bash
cargo test
```

### 4. Build Verification
Make sure the contract compiles to bare-metal WebAssembly release:
```bash
cargo build --target wasm32v1-none --release
```

---

## 📬 Pull Request Checklist

When submitting a Pull Request, ensure that:
*   [ ] All tests pass successfully (`cargo test`).
*   [ ] Code is properly formatted (`cargo fmt`).
*   [ ] Clippy lints are warning-free (`cargo clippy`).
*   [ ] The contract builds for the `wasm32v1-none` target.
*   [ ] Descriptive comments are added, preserving existing documentation.
