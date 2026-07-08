# StellarWhisper 🌌

StellarWhisper is a Stellar-based, privacy-first anonymous group chat platform. It enables users to create temporary/permanent messaging circles and chat freely with strangers — without exposing their identity or metadata. Access is cryptographically powered by Web3 wallet signatures, guaranteeing trustless decentralization.

Speak freely. Stay anonymous. Powered by Stellar.

---

## 🚀 Key Features

* **Complete Cryptographic Anonymity**: No emails, passwords, usernames, or phone numbers. Your identity is represented solely by your Stellar public ledger address.
* **True End-to-End Encryption (E2E)**: Messages are encrypted client-side using `AES-GCM` before being sent to the database. Room keys are shared securely by encrypting them with a master key derived from the user's signature.
* **Democratic Expulsion (Web3 Voting)**: A member of a room can be removed if a democratic majority (>50%) of active participants vote to expel their address. The database automatically revokes access tokens and message decryption keys for the expelled member.
* **Lightning Fast Messaging**: Built on Next.js 15, React 19, and Supabase Realtime for near-instant message routing and syncing.
* **Seamless Local Testing**: Includes an offline simulation mode with in-memory state so developers and reviewers can run the app instantly without having to provision live Supabase credentials.

---

## 🏛️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| **Authentication** | Stellar Web3 Signatures + Supabase Auth Session Handshake |
| **Database & Realtime** | Supabase (PostgreSQL) + Supabase Realtime Channels |
| **Cryptography** | Web Crypto API (PBKDF2, AES-GCM 256-bit) & `@stellar/stellar-sdk` (Ed25519) |
| **CI/CD & Workflows** | GitHub Actions (Linting, Build, Automated API Smoke Testing) |
| **Hosting** | Vercel |

---

## 🔐 Cryptographic & Security Model

1. **Deterministic Master Key**: When logging in, the user signs a challenge string using their private key. The client hashes this signature to generate a master key:
   $$\text{Master Key} = \text{SHA-256}(\text{Ed25519-Signature}(\text{Challenge Nonce}))$$
2. **Room Symmetric Keys**: Every chat room generates a random 256-bit symmetric key. This key is encrypted with each member's master key and stored in `room_members`.
3. **E2E Message Transmission**: Before sending a message, the client decrypts the room key using their master key, encrypts the message content using `AES-GCM` with the room key, and publishes the ciphertext.

---

## 🛠️ Quick Start

### 1. Prerequisites

* **Node.js**: `>= 18.x` (Recommended: `>= 20.x`)
* **Package Manager**: `pnpm` (version `>= 10.x`)

### 2. Installation

```bash
git clone https://github.com/Hellenjoseph/STELLAR.git
cd STELLAR
pnpm install
```

### 3. Database Migration Setup

Apply these migration scripts in your Supabase SQL Editor:
1. `scripts/001_create_profiles.sql`
2. `scripts/002_create_profile_trigger.sql`
3. `scripts/003_room_members_and_removal_votes.sql`

### 4. Configure Environment

Copy `.env.example` to `.env.local` and add your credentials:

```bash
cp .env.example .env.local
```

*(Note: If these variables are omitted, the application will automatically fallback to **Offline Mock Mode**, allowing you to test the app instantly!)*

### 5. Launch Development Server

```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🧪 Testing the Voting & Member Removal

To run the automated API security checks (unauthenticated and invalid inputs):

1. Spin up the dev server:
   ```bash
   pnpm dev
   ```
2. In another terminal pane, execute the test command:
   ```bash
   pnpm run test:vote-remove
   ```

To read the full runbook for manual and automated verification, check out the [Remove-Voting Runbook](docs/RUN-VOTE-REMOVE.md).

---

## 🤝 Contributing

Contributions are welcome! Please read the guidelines inside [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## 📜 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.