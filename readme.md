# Liquidity Vault

## State Accounts

#### Global

The Global state store a counter to generate an UUID for the Vault.

```
["global"]
vault_counter: u64,
```

#### Vault

The Vault state stores information. The state is updatable as long as the vault is inactive (before start time) and no funds have been deposited.

```
["vault", vault_count]
vault_count: u64,
authority: Pubkey, // Withdraw and update vault state
base_mint: Pubkey,
yield_bps: u16,
vault_capacity: u64,
min_amount: u64,
start_date: u64,
end_date: u64,
withdraw_timeframe: u64,
amount_collected: u64,
amount_withdrawn: u64,
amount_redeemed: u64,
```

#### User

The User state stores information for each user. Users can deposit multiple times before the Vault start time. Upon withdrawal, this account will be closed, and the rent will be returned to the user.

```
["user", vault_count, owner_pubkey]
vault_count: u64,
owner: Pubkey,
amount: u64,
```

## Instruction

1. init_global
2. init_or_update_vault
3. update_authority
4. init_or_deposit_user
5. authority_withdraw
6. user_withdraw
7. close_vault

## Limitation

Most instructions require the vault to be mutable. Multiple requests within the same block will cause an issue due to a write-lock.
