use crate::storage;
use soroban_sdk::{Address, Env, Vec};

/// Selects unique random jurors from the active pool of staked addresses.
pub fn select_random_jurors(env: &Env, count: u32) -> Vec<Address> {
    let active = storage::get_active_jurors(env);
    let active_len = active.len();
    let mut selected = Vec::new(env);

    if active_len == 0 {
        return selected;
    }

    // Seed using ledger entropy
    let timestamp = env.ledger().timestamp();
    let sequence = env.ledger().sequence();
    let mut seed = (timestamp ^ (sequence as u64)).wrapping_add(1103515245);

    // Limit selection size to the available pool size to avoid infinite loops
    let target_count = if count > active_len {
        active_len
    } else {
        count
    };

    while selected.len() < target_count {
        // Linear Congruential Generator step
        seed = seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        let idx = (seed % (active_len as u64)) as u32;
        let juror = active.get_unchecked(idx);

        // Ensure unique selection
        let mut already_selected = false;
        for s in selected.iter() {
            if s == juror {
                already_selected = true;
                break;
            }
        }

        if !already_selected {
            selected.push_back(juror);
        }
    }

    selected
}
