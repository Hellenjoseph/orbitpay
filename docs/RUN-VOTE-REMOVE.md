# Room Member Removal & Voting Runbook 🗳️

This documentation covers the setup, execution, and verification of the wallet-based room member removal and voting mechanisms in **StellarWhisper**.

---

## 🛠️ Step 1: Database Migration Setup

Before testing, you must apply the required schema modifications in your Supabase SQL Editor.

Run the migrations in this order:

1. **[001_create_profiles.sql](../scripts/001_create_profiles.sql)**: Initializes the `public.profiles` schema to map user accounts with Stellar public keys.
2. **[002_create_profile_trigger.sql](../scripts/002_create_profile_trigger.sql)**: Establishes the triggers to sync new user signups from Supabase Auth to public profiles automatically.
3. **[003_room_members_and_removal_votes.sql](../scripts/003_room_members_and_removal_votes.sql)**: Creates tables for `rooms`, `room_members`, `room_removal_votes`, and `messages`. It also compiles the `check_removal_threshold` trigger function to handle automatic democratic expulsions of flagged addresses once a majority vote is reached.

---

## 🧪 Step 2: Running Automated API Smoke Tests

The project includes an automated test runner to ensure API security policies work as designed.

### Prerequisites

1. Ensure dependencies are fully installed:
   ```bash
   pnpm install
   ```
2. Start the local Next.js development server:
   ```bash
   pnpm dev
   ```

### Running the Tests

While the development server is active, open another terminal pane and run:

```bash
pnpm run test:vote-remove
```

This runs the custom test client inside `scripts/test-vote-remove.ts` to verify:
- **Unauthenticated requests** (without standard auth Bearer tokens) receive `401 Unauthorized`.
- **Invalid requests** (with valid auth but missing parameters like `roomId` or `targetId`) receive `400 Bad Request`.

---

## 🖥️ Step 3: Manual UI Verification

To manually test the end-to-end room expulsion flow:

1. Open your browser to `http://localhost:3000/chat`.
2. Connect a Stellar wallet (or generate a mock wallet if running locally without extensions).
3. Create a room (e.g. `Privacy Zone`) or join an existing room.
4. Open the room.
5. In the room header, click the **⋮ (More Options)** button.
6. Open the **Room Members & Voting** dialog.
   * *If you are unauthenticated*, it will display: *"No members yet, or you need to sign in."*
   * *If authenticated*, it will display a list of all active participants in the room.
7. Click the **Vote to Remove** button next to any member's Stellar address.
8. Once a majority (>50%) of active members vote to remove that user, the database trigger will change their status to `removed`.
9. The removed user's UI will block chat input and indicate that they have been removed from the room, preventing further message retrieval or publishing.
