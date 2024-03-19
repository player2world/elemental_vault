use anchor_lang::prelude::*;
use anchor_spl::token::transfer_checked;

mod contexts;
mod error;
mod state;

use contexts::*;
use error::ErrorCode;

declare_id!("6E4qLpT6Pa8jQXUe8oh4TPuiXknQCRGCeckynyWw8Bdx");

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
            vault.creator = initializer.key();
            vault.base_mint = ctx.accounts.base_mint.key();
            vault.authority = match params.authority {
                Some(result) => result,
                None => initializer.key(),
            };

            vault.amount_collected = 0;
            vault.amount_withdrawn = 0;
            vault.amount_redeemed = 0;

            match global.vault_counter.checked_add(1) {
                Some(result) => global.vault_counter = result,
                None => return err!(ErrorCode::Overflow),
            }

            if params.start_date.unwrap() < (Clock::get()?.unix_timestamp * 1000) as u64
                || params.end_date.unwrap() < (Clock::get()?.unix_timestamp * 1000) as u64
            {
                return err!(ErrorCode::InvalidTimeInput);
            }
            assign_if_some!(params.yield_bps, yield_bps, vault, throw_error);
            assign_if_some!(params.min_amount, min_amount, vault, throw_error);
            assign_if_some!(params.start_date, start_date, vault, throw_error);
            assign_if_some!(params.end_date, end_date, vault, throw_error);
            assign_if_some!(params.vault_capacity, vault_capacity, vault, throw_error);
            assign_if_some!(
                params.withdraw_timeframe,
                withdraw_timeframe,
                vault,
                throw_error
            );
        }

        if vault.authority != initializer.key() && vault.creator != initializer.key() {
            return err!(ErrorCode::Unauthorized);
        }

        // VAULT STATE NOT UPDATABLE IF FUNDS HAVE BEEN COLLECTED
        if vault.amount_collected != 0 {
            return err!(ErrorCode::NotUpdatable);
        }

        // CAN'T UPDATE ONCE VAULT IS ACTIVE
        if params.start_date.unwrap() <= (Clock::get()?.unix_timestamp * 1000) as u64 {
            return err!(ErrorCode::InvalidStartTimeInput);
        }

        // END DATE MUST BE LATER THAN START DATE
        if params.start_date.unwrap() >= params.end_date.unwrap() {
            return err!(ErrorCode::InvalidEndTimeInput);
        }

        assign_if_some!(params.yield_bps, yield_bps, vault, ignore_none);
        assign_if_some!(params.min_amount, min_amount, vault, ignore_none);
        assign_if_some!(params.start_date, start_date, vault, ignore_none);
        assign_if_some!(params.end_date, end_date, vault, ignore_none);
        assign_if_some!(params.vault_capacity, vault_capacity, vault, ignore_none);
        assign_if_some!(
            params.withdraw_timeframe,
            withdraw_timeframe,
            vault,
            ignore_none
        );

        Ok(())
    }

    pub fn update_authority(
        ctx: Context<UpdateAuthority>,
        _vault_count: u64,
        new_authority: Pubkey,
    ) -> Result<()> {
        ctx.accounts.vault.authority = new_authority.key();
        Ok(())
    }

    pub fn init_or_deposit_user(
        ctx: Context<InitOrDepositUser>,
        vault_count: u64,
        amount_to_transfer: u64,
    ) -> Result<()> {
        let owner = &mut ctx.accounts.owner;
        let source_ata = &mut ctx.accounts.source_ata;
        let base_mint = &ctx.accounts.base_mint;
        let vault = &mut ctx.accounts.vault;
        let user = &mut ctx.accounts.user;
        let destination_ata = &mut ctx.accounts.destination_ata;

        if (Clock::get()?.unix_timestamp * 1000) as u64 >= vault.start_date {
            return err!(ErrorCode::VaultClose);
        }

        if amount_to_transfer % vault.min_amount != 0 {
            return err!(ErrorCode::InvalidMultiple);
        }

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
        transfer_checked(transfer_ctx, amount_to_transfer, base_mint.decimals)?;

        match vault.amount_collected.checked_add(amount_to_transfer) {
            Some(result) => vault.amount_collected = result,
            None => return err!(ErrorCode::Overflow),
        }

        user.vault_count = vault_count;
        user.owner = owner.key();
        match user.amount.checked_add(amount_to_transfer) {
            Some(result) => user.amount = result,
            None => return err!(ErrorCode::Overflow),
        }

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

        match vault.amount_withdrawn.checked_add(amount) {
            Some(result) => vault.amount_withdrawn = result,
            None => return err!(ErrorCode::Overflow),
        }

        Ok(())
    }

    pub fn user_withdraw(ctx: Context<UserWithdraw>, vault_count: u64) -> Result<()> {
        let source_ata = &mut ctx.accounts.source_ata;
        let base_mint = &ctx.accounts.base_mint;
        let vault = &mut ctx.accounts.vault;
        let user = &mut ctx.accounts.user;
        let destination_ata = &mut ctx.accounts.destination_ata;

        msg!("unix {}", Clock::get()?.unix_timestamp * 1000);
        msg!("end_date {}", vault.end_date);
        if (Clock::get()?.unix_timestamp * 1000) as u64 <= vault.end_date {
            return err!(ErrorCode::VaultNotReady);
        }

        let signer_seed: &[&[&[u8]]] = &[&[
            b"vault".as_ref(),
            &vault_count.to_le_bytes(),
            &[ctx.bumps.vault],
        ]];

        let amount_to_transfer = state::Vault::calculate_payout(&user.amount, vault);

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

        match vault.amount_redeemed.checked_add(amount_to_transfer) {
            Some(result) => vault.amount_redeemed = result,
            None => return err!(ErrorCode::Overflow),
        }

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

        if vault.end_date + vault.withdraw_timeframe > (Clock::get()?.unix_timestamp * 1000) as u64
        {
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

        // CLOSE VAULT AND TRANSFER RENT TO CREATOR
        let close_cpi_accounts = CloseAccount {
            account: source_ata.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
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
