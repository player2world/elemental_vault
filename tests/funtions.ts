import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { getGlobalPda, getVaultData, getVaultPda } from "./pda";
import { ElementalVault } from "../target/types/elemental_vault";
import { IAccounts } from "./types";
import { assert, expect } from "chai";
import { Transaction } from "@solana/web3.js";
import { signAndSendTx } from "./utils";
import {
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  END_DATE,
  INITIAL_MINT_AMOUNT,
  MIN_AMOUNT,
  START_DATE,
  VAULT_CAPACITY,
  WITHDRAW_TIMEFRAME,
  YIELD_BPS,
} from "./constant";

export const newSetup = async (
  program: Program<ElementalVault>,
  accounts: IAccounts
) => {
  console.log("TEST 0");
  const latestBlockHash =
    await program.provider.connection.getLatestBlockhash();
  await program.provider.connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: await program.provider.connection.requestAirdrop(
      accounts.creator.publicKey,
      1e9
    ),
  });
  let ix1 = anchor.web3.SystemProgram.transfer({
    fromPubkey: accounts.creator.publicKey,
    toPubkey: accounts.authority.publicKey,
    lamports: 0.2 * 1e9,
  });
  let ix2 = anchor.web3.SystemProgram.transfer({
    fromPubkey: accounts.creator.publicKey,
    toPubkey: accounts.user.publicKey,
    lamports: 0.2 * 1e9,
  });

  let tx = new Transaction().add(ix1, ix2);
  await signAndSendTx(program.provider.connection, tx, accounts.creator);

  accounts.baseMint = await createMint(
    program.provider.connection,
    accounts.creator,
    accounts.creator.publicKey,
    accounts.creator.publicKey,
    6
  );

  accounts.authorityMintAta = (
    await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      accounts.creator,
      accounts.baseMint,
      accounts.creator.publicKey
    )
  ).address;
  accounts.userMintAta = (
    await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      accounts.creator,
      accounts.baseMint,
      accounts.user.publicKey
    )
  ).address;
  // Mint baseMint1 ATA
  console.log("TEST 1");
  await mintTo(
    program.provider.connection,
    accounts.creator,
    accounts.baseMint,
    accounts.authorityMintAta,
    accounts.creator,
    INITIAL_MINT_AMOUNT
  );
  await mintTo(
    program.provider.connection,
    accounts.creator,
    accounts.baseMint,
    accounts.userMintAta,
    accounts.creator,
    INITIAL_MINT_AMOUNT
  );
  console.log("TEST 2");

  return accounts;
};

export const initGlobal = async (
  program: Program<ElementalVault>,
  accounts: IAccounts
) => {
  accounts.global = getGlobalPda(program);
  console.log("global", accounts.global.toString());
  console.log("program.programId", program.programId.toString());
  try {
    await program.methods
      .initGlobal()
      .accounts({
        initializer: accounts.creator.publicKey,
        global: accounts.global,
      })
      .signers([accounts.creator])
      .rpc();
  } catch (error) {
    console.log("error", error);
    process.exit();
  }
  const globalData = await program.account.global.fetch(accounts.global);

  assert.equal(+globalData.vaultCounter, 0);

  return accounts;
};

export const initVault = async (
  program: Program<ElementalVault>,
  accounts: IAccounts
) => {
  accounts.global = getGlobalPda(program);
  console.log("global: ", accounts.global.toString());
  const globalData = await program.account.global.fetch(accounts.global);
  // console.log("globalData", +globalData.vaultCounter);
  accounts.vault = getVaultPda(program, globalData.vaultCounter);
  accounts.vaultAta = getAssociatedTokenAddressSync(
    accounts.baseMint,
    accounts.vault,
    true
  );
  console.log("vault", accounts.vault.toString());
  try {
    await program.methods
      .initOrUpdateVault(globalData.vaultCounter, {
        startDate: new anchor.BN(START_DATE),
        endDate: new anchor.BN(END_DATE),
        minAmount: new anchor.BN(MIN_AMOUNT),
        vaultCapacity: new anchor.BN(VAULT_CAPACITY),
        withdrawTimeframe: new anchor.BN(WITHDRAW_TIMEFRAME),
        yieldBps: YIELD_BPS,
        authority: accounts.authority.publicKey,
      })
      .accounts({
        initializer: accounts.creator.publicKey,
        global: accounts.global,
        baseMint: accounts.baseMint,
        vault: accounts.vault,
        vaultAta: accounts.vaultAta,
      })
      .signers([accounts.creator])
      .rpc();
  } catch (error) {
    console.log("error", error);
    process.exit();
  }
  const vaultData = await getVaultData(program, accounts.vault);
  assert.equal(
    vaultData.creator.toString(),
    accounts.creator.publicKey.toString(),
    "creator"
  );
  assert.equal(
    vaultData.authority.toString(),
    accounts.authority.publicKey.toString(),
    "authority"
  );
  assert.equal(
    vaultData.baseMint.toString(),
    accounts.baseMint.toString(),
    "baseMint"
  );
  assert.equal(vaultData.yieldBps, YIELD_BPS, "yieldBps");
  assert.equal(+vaultData.vaultCapacity, +VAULT_CAPACITY, "vaultCapacity");
  assert.equal(+vaultData.minAmount, +MIN_AMOUNT, "minAmount");

  expect(+vaultData.endDate, "endDate").to.be.greaterThan(+vaultData.startDate);

  assert.equal(
    +vaultData.withdrawTimeframe,
    +WITHDRAW_TIMEFRAME,
    "withdrawTimeframe"
  );
  assert.equal(+vaultData.amountCollected, 0, "amountCollected");
  assert.equal(+vaultData.amountWithdrawn, 0, "amountWithdrawn");
  assert.equal(+vaultData.amountRedeemed, 0, "amountRedeemed");

  return accounts;
};
