use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Signer does not have authorisation")]
    Unauthorized,
    #[msg("Invalid multiple")]
    InvalidMultiple,
    #[msg("Pass in the current counter's count")]
    IncorrectCount,
    #[msg("Escrow state no longer updatable")]
    NotUpdatable,
    #[msg("Invalid time input")]
    InvalidTimeInput,
    #[msg("Start date must be later than the current time")]
    InvalidStartTimeInput,
    #[msg("End date must be later than start time")]
    InvalidEndTimeInput,
    #[msg("All params must to included to initialize escrow")]
    MissingParams,
    #[msg("Amount exceed vault capacity")]
    AmountExceedVaultCapacity,
    #[msg("Vault no longer accepting new deposit")]
    VaultClose,
    #[msg("Vault not ready")]
    VaultNotReady,
    #[msg("Incorrect mint input")]
    InvalidMint,
    #[msg("Overflow detected")]
    Overflow,
}
