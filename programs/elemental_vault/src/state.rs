use anchor_lang::prelude::*;

#[account]
pub struct Global {
    pub vault_counter: u64,
}

#[account]
pub struct Vault {
    // Vault UUID
    pub vault_count: u64,
    // Withdraw and update vault state
    pub authority: Pubkey,
    // Vault Mint
    pub base_mint: Pubkey,
    // Vault Yield
    pub yield_bps: u16,
    // Capacity of vault
    pub vault_capacity: u64,
    // Minimum deposit per user
    pub min_amount: u64,
    // Vault activation date
    pub start_date: u64,
    // Vault end date
    pub end_date: u64,
    // Withdrable period after end_date
    pub withdraw_timeframe: u64,
    // Total amount collected
    pub amount_collected: u64,
    // Total amount withdrawn by authority
    pub amount_withdrawn: u64,
    // Total amount redeemed by users
    pub amount_redeemed: u64,
}
#[account]
pub struct User {
    // Vault count for Vault reference
    pub vault_count: u64,
    // User pubkey
    pub owner: Pubkey,
    // Total amount deposited by user
    pub amount: u64,
}

impl Global {
    pub fn seed<'s>() -> &'s [u8] {
        b"global"
    }
}
impl Vault {
    pub fn seed<'s>() -> &'s [u8] {
        b"vault"
    }

    pub fn calculate_payout(base_amount: &u64, vault: &Vault) -> u64 {
        // Calculate the commission amount using integer math, considering decimal places.
        let duration_seconds = vault.end_date - vault.start_date;
        let yield_per_second = vault.yield_bps as u64 / 31_536_000;
        let commission_amount = (base_amount * yield_per_second * duration_seconds) / 10_000;

        commission_amount
    }
}
impl User {
    pub fn seed<'s>() -> &'s [u8] {
        b"user"
    }
}

#[macro_export]
macro_rules! assign_if_some {
    ($option:expr, $field:ident, $target:expr, throw_error) => {
        match $option {
            Some(x) => {
                $target.$field = x;
            }
            None => {
                return err!(ErrorCode::MissingParams);
            }
        }
    };
    ($option:expr, $field:ident, $target:expr, ignore_none) => {
        if let Some(x) = $option {
            $target.$field = x;
        }
    };
}
