use anchor_lang::__private::ZeroCopyAccessor;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::state::{Vault, Global};
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(vault_count: u64)]
pub struct InitOrUpdateVault<'info> {
    // initializer & payer for any rent and transaction fee
    #[account(mut)]
    pub initializer: Signer<'info>,
    #[account(mut, seeds = [Global::seed()], bump)]
    pub global: Account<'info, Global>,
    // The base mint of the vault
    pub base_mint: Account<'info, Mint>,
    // vault that holds state
    #[account(
        init_if_needed,
        payer = initializer,
        seeds = [Vault::seed(), &vault_count.to_le_bytes()],
        bump,
        space = 8 + std::mem::size_of::<Vault>(),
    )]
    pub vault: Account<'info, Vault>,
    // vault ATA to store base mint token.
    #[account(
        init_if_needed,
        payer = initializer,
        associated_token::mint = base_mint,
        associated_token::authority = vault
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
#[instruction(vault_count: u64)]
pub struct UpdateAuthority<'info> {
    #[account(mut)]
    pub current_authority: Signer<'info>,
    /// CHECK:
    pub new_authority: AccountInfo<'info>,
    // vault that holds state
    #[account(
        mut,
        seeds = [Vault::seed(), &vault_count.to_le_bytes()],
        bump,
        constraint = vault.authority == current_authority.key() 
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vault_count: u64)]
pub struct AuthorityWithdraw<'info> {
    // vault authority
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = authority
    )]
    pub destination_ata: Account<'info, TokenAccount>,
    // vault that holds state
    #[account(
        mut, seeds = [Vault::seed(), &vault_count.to_le_bytes()], bump,
        constraint = vault.authority == authority.key() @ ErrorCode::Unauthorized,
        constraint = vault.base_mint == base_mint.key() @ ErrorCode::InvalidMint
    )]
    pub vault: Account<'info, Vault>,
    // vault ATA to store base mint token.
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = vault
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    // The base mint of the vault
    pub base_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(vault_count: u64)]
pub struct CloseVault<'info> {
    // Vault authority
    #[account(mut)]
    pub authority: Signer<'info>,
    // Vault ATA to store base mint token.
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = vault,
    )]
    pub source_ata: Account<'info, TokenAccount>,
    // authority's ATA
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = authority
    )]
    pub destination_ata: Account<'info, TokenAccount>,
    // Vault that holds state
    #[account(
        mut,
        seeds = [Vault::seed(), &vault_count.to_le_bytes()],
        bump,
        constraint = vault.authority == authority.key(),
        constraint = vault.base_mint == base_mint.key(),
        close = authority
    )]
    pub vault: Account<'info, Vault>,
    // The base mint of the vault
    pub base_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}


#[derive(AnchorSerialize, AnchorDeserialize, Clone, ZeroCopyAccessor)]
pub struct InitOrUpdateVaultParam {
    pub yield_bps: Option<u16>,
    pub vault_capacity: Option<u64>,
    pub min_amount: Option<u64>,
    pub start_date: Option<u64>,
    pub end_date: Option<u64>,
    pub withdraw_timeframe: Option<u64>,
}

impl InitOrUpdateVaultParam {
    pub fn to_unix_time(timestamp: Option<u64>) -> Option<u64> {
        match timestamp {
            Some(time) => {
                if time > 1_000_000_000_000 {
                    // Assuming it's in milliseconds
                    Some(time / 1000)
                } else {
                    // Assuming it's in seconds
                    Some(time)
                }
            }
            None => None,
        }
    }
}