use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::state::{Vault, User};
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(vault_count: u64, amount: u64)]
pub struct InitOrDepositUser<'info> {
    // User's wallet
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = owner,
        constraint = source_ata.amount >= amount,
    )]
    pub source_ata: Account<'info, TokenAccount>,
    // vault ATA to store base mint token.
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = vault
    )]
    pub destination_ata: Account<'info, TokenAccount>,
    // Vault that holds state
    #[account(mut, seeds = [Vault::seed(), &vault_count.to_le_bytes()], bump)]
    pub vault: Account<'info, Vault>,
    // User PDA
    #[account(
        init_if_needed, 
        payer = owner,
        seeds = [User::seed(), &vault_count.to_le_bytes(), owner.key().as_ref()],
        bump,
        space = 8 + std::mem::size_of::<User>(),
    )]
    pub user: Account<'info, User>,
    // The base mint of the vault
    pub base_mint: Account<'info, Mint>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vault_count: u64)]
pub struct UserWithdraw<'info> {
    // User's wallet
    #[account(mut)]
    pub owner: Signer<'info>,
    // Vault ATA to store base mint token.
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = vault,
        constraint = source_ata.amount <= user.amount @ ErrorCode::VaultNotReady
    )]
    pub source_ata: Account<'info, TokenAccount>,
    // User's ATA
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = owner
    )]
    pub destination_ata: Account<'info, TokenAccount>,
    // Vault that holds state
    #[account(mut, seeds = [Vault::seed(), &vault_count.to_le_bytes()], bump)]
    pub vault: Account<'info, Vault>,
    // User PDA
    #[account(
        mut,
        seeds = [User::seed(), &vault_count.to_le_bytes(), owner.key().as_ref()],
        bump,
        close = owner
    )]
    pub user: Account<'info, User>,
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
    pub owner: Signer<'info>,
    // Vault ATA to store base mint token.
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = vault,
        // close = owner
    )]
    pub source_ata: Account<'info, TokenAccount>,
    // authority's ATA
    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = owner
    )]
    pub destination_ata: Account<'info, TokenAccount>,
    // Vault that holds state
    #[account(
        mut,
        seeds = [Vault::seed(), &vault_count.to_le_bytes()],
        bump,
        close = owner
    )]
    pub vault: Account<'info, Vault>,
    // The base mint of the vault
    pub base_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
