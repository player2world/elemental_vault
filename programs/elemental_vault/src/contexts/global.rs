use anchor_lang::prelude::*;

use crate::state::Global;

#[derive(Accounts)]
pub struct InitGlobal<'info> {
    // initializer & payer for any rent and transaction fee
    #[account(mut)]
    pub initializer: Signer<'info>,
    // Global State
    #[account(
        init,
        payer = initializer,
        seeds = [Global::seed()],
        bump,
        space = 8 + std::mem::size_of::<Global>(),
    )]
    pub global: Account<'info, Global>,
    pub system_program: Program<'info, System>,
}
