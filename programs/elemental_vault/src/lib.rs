use anchor_lang::prelude::*;
use anchor_spl::token::transfer_checked;

mod contexts;
mod error;
mod state;

use contexts::*;
use error::ErrorCode;

declare_id!("4mEadSTaipg1DNU4ELELNNMqmTNhCbKHHjckDdXM3DLx");

#[program]
pub mod elemental_vault {
    use anchor_spl::token::{close_account, CloseAccount, TransferChecked};

    use super::*;

    pub fn init_global(ctx: Context<InitGlobal>) -> Result<()> {
        ctx.accounts.global.vault_counter = 0;
        Ok(())
    }

    pub fn init_or_update_vault(
        ctx: Context<InitOrUpdateVault>,
        vault_count: u64,
        params: InitOrUpdateVaultParam,
    ) -> Result<()> {
        let initializer = &mut ctx.accounts.initializer;
        let vault = &mut ctx.accounts.vault;
        let global = &mut ctx.accounts.global;

        // CHECK IF IS INITIALIZE
        if global.vault_counter == vault_count {
            vault.vault_count = vault_count;
            vault.base_mint = ctx.accounts.base_mint.key();
            vault.authority = initializer.key();
            vault.amount_collected = 0;
            vault.amount_withdrawn = 0;
            vault.amount_redeemed = 0;

            global.vault_counter = global.vault_counter.checked_add(1).unwrap();

            let start_time = InitOrUpdateVaultParam::to_unix_time(params.start_date);
            let end_time = InitOrUpdateVaultParam::to_unix_time(params.end_date);

            if start_time.unwrap() < Clock::get()?.unix_timestamp as u64
                || end_time.unwrap() < Clock::get()?.unix_timestamp as u64
            {
                return err!(ErrorCode::InvalidTimeInput);
            }
            assign_if_some!(params.yield_bps, yield_bps, vault, throw_error);
            assign_if_some!(params.min_amount, min_amount, vault, throw_error);
            assign_if_some!(start_time, start_date, vault, throw_error);
            assign_if_some!(end_time, end_date, vault, throw_error);
            assign_if_some!(params.vault_capacity, vault_capacity, vault, throw_error);
            assign_if_some!(
                params.withdraw_timeframe,
                withdraw_timeframe,
                vault,
                throw_error
            );
        }

        if vault.authority != initializer.key() {
            return err!(ErrorCode::Unauthorized);
        }

        // VAULT STATE NOT UPDATABLE IF FUNDS HAVE BEEN COLLECTED
        if vault.amount_collected != 0 {
            return err!(ErrorCode::NotUpdatable);
        }

        let start_time = InitOrUpdateVaultParam::to_unix_time(params.start_date);
        let end_time = InitOrUpdateVaultParam::to_unix_time(params.end_date);
        // CAN'T UPDATE ONCE VAULT IS ACTIVE
        if start_time.unwrap() <= Clock::get()?.unix_timestamp as u64 {
            return err!(ErrorCode::InvalidStartTimeInput);
        }

        // END DATE MUST BE LATER THAN START DATE
        if start_time.unwrap() >= end_time.unwrap() {
            return err!(ErrorCode::InvalidEndTimeInput);
        }

        assign_if_some!(params.yield_bps, yield_bps, vault, ignore_none);
        assign_if_some!(params.min_amount, min_amount, vault, ignore_none);
        assign_if_some!(start_time, start_date, vault, ignore_none);
        assign_if_some!(end_time, end_date, vault, ignore_none);
        assign_if_some!(params.vault_capacity, vault_capacity, vault, ignore_none);
        assign_if_some!(
            params.withdraw_timeframe,
            withdraw_timeframe,
            vault,
            ignore_none
        );

        Ok(())
    }

    pub fn update_authority(ctx: Context<UpdateAuthority>, _vault_count: u64) -> Result<()> {
        ctx.accounts.vault.authority = ctx.accounts.new_authority.key();
        Ok(())
    }

    pub fn init_or_deposit_user(
        ctx: Context<InitOrDepositUser>,
        vault_count: u64,
        amount: u64,
        multiplier: u16,
    ) -> Result<()> {
        let owner = &mut ctx.accounts.owner;
        let source_ata = &mut ctx.accounts.source_ata;
        let base_mint = &ctx.accounts.base_mint;
        let vault = &mut ctx.accounts.vault;
        let user = &mut ctx.accounts.user;
        let destination_ata = &mut ctx.accounts.destination_ata;

        if Clock::get()?.unix_timestamp as u64 >= vault.start_date {
            return err!(ErrorCode::VaultClose);
        }

        let amount_to_transfer = amount * multiplier as u64;
        if amount_to_transfer + vault.amount_collected > vault.vault_capacity {
            return err!(ErrorCode::AmountExceedVaultCapacity);
        }
        // TRANSNFER AMOUNT FROM VAULT TO AUTHORITY ATA
        let transfer_cpi_accounts = TransferChecked {
            from: source_ata.to_account_info(),
            mint: base_mint.to_account_info(),
            to: destination_ata.to_account_info(),
            authority: owner.to_account_info(),
        };
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_cpi_accounts,
        );
        transfer_checked(transfer_ctx, amount, base_mint.decimals)?;

        vault.amount_collected = vault.amount_collected.checked_add(amount).unwrap();

        user.vault_count = vault_count;
        user.owner = owner.key();
        user.amount = user.amount.checked_add(amount).unwrap();

        Ok(())
    }

    pub fn authority_withdraw(
        ctx: Context<AuthorityWithdraw>,
        vault_count: u64,
        amount: u64,
    ) -> Result<()> {
        let destination_ata = &mut ctx.accounts.destination_ata;
        let base_mint = &ctx.accounts.base_mint;
        let vault = &mut ctx.accounts.vault;
        let vault_ata = &mut ctx.accounts.vault_ata;

        let signer_seed: &[&[&[u8]]] = &[&[
            b"vault".as_ref(),
            &vault_count.to_le_bytes(),
            &[ctx.bumps.vault],
        ]];

        // TRANSFER AMOUNT FROM VAULT TO AUTHORITY ATA
        let transfer_cpi_accounts = TransferChecked {
            from: vault_ata.to_account_info(),
            mint: base_mint.to_account_info(),
            to: destination_ata.to_account_info(),
            authority: vault.to_account_info(),
        };
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_cpi_accounts,
        )
        .with_signer(signer_seed);
        transfer_checked(transfer_ctx, amount, base_mint.decimals)?;

        vault.amount_withdrawn = vault.amount_withdrawn.checked_add(amount).unwrap();

        Ok(())
    }

    pub fn user_withdraw(ctx: Context<UserWithdraw>, vault_count: u64) -> Result<()> {
        let source_ata = &mut ctx.accounts.source_ata;
        let base_mint = &ctx.accounts.base_mint;
        let vault = &mut ctx.accounts.vault;
        let user = &mut ctx.accounts.user;
        let destination_ata = &mut ctx.accounts.destination_ata;

        msg!("unix_timestamp: {}", Clock::get()?.unix_timestamp);
        msg!("end_date: {}", vault.end_date);
        if Clock::get()?.unix_timestamp as u64 <= vault.end_date {
            return err!(ErrorCode::VaultNotReady);
        }

        let signer_seed: &[&[&[u8]]] = &[&[
            b"vault".as_ref(),
            &vault_count.to_le_bytes(),
            &[ctx.bumps.vault],
        ]];

        let amount_to_transfer = state::Vault::calculate_payout(&user.amount, &vault.yield_bps);

        // TRANSNFER AMOUNT FROM VAULT TO AUTHORITY ATA
        let transfer_cpi_accounts = TransferChecked {
            from: source_ata.to_account_info(),
            mint: base_mint.to_account_info(),
            to: destination_ata.to_account_info(),
            authority: vault.to_account_info(),
        };
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_cpi_accounts,
        )
        .with_signer(signer_seed);
        transfer_checked(transfer_ctx, amount_to_transfer, base_mint.decimals)?;

        vault.amount_redeemed = vault
            .amount_redeemed
            .checked_add(amount_to_transfer)
            .unwrap();

        Ok(())
    }

    pub fn close_vault(ctx: Context<CloseVault>, vault_count: u64) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let source_ata = &ctx.accounts.source_ata;
        let destination_ata = &ctx.accounts.destination_ata;
        let base_mint = &ctx.accounts.base_mint;

        // PDA REQUIRE SEED SIGNER
        let signer_seed: &[&[&[u8]]] = &[&[
            b"vault".as_ref(),
            &vault_count.to_le_bytes(),
            &[ctx.bumps.vault],
        ]];

        if vault.end_date + vault.withdraw_timeframe < Clock::get()?.unix_timestamp as u64 {
            return err!(ErrorCode::VaultNotReady);
        }

        // TRANSNFER ALL FUNDS IN VAULT TO AUTHORITY
        let transfer_cpi_accounts = TransferChecked {
            from: source_ata.to_account_info(),
            mint: base_mint.to_account_info(),
            to: destination_ata.to_account_info(),
            authority: vault.to_account_info(),
        };
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_cpi_accounts,
        )
        .with_signer(signer_seed);
        transfer_checked(transfer_ctx, source_ata.amount, base_mint.decimals)?;

        // CLOSE VAULT AND TRANSFER RENT TO INITIALIZER
        let close_cpi_accounts = CloseAccount {
            account: source_ata.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: vault.to_account_info(),
        };
        let close_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            close_cpi_accounts,
        )
        .with_signer(signer_seed);
        close_account(close_ctx)?;

        Ok(())
    }
}
