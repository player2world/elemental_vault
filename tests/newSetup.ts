import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ElementalVault } from "../target/types/elemental_vault";
import { IAccounts } from "./types";
import { Transaction } from "@solana/web3.js";
import { signAndSendTx } from "./utils";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { INITIAL_MINT_AMOUNT } from "./constant";

export const newSetup = async (
  program: Program<ElementalVault>,
  accounts: IAccounts
) => {
  const latestBlockHash =
    await program.provider.connection.getLatestBlockhash();
  await program.provider.connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: await program.provider.connection.requestAirdrop(
      accounts.creator.publicKey,
      1000000000
    ),
  });
  let ix1 = anchor.web3.SystemProgram.transfer({
    fromPubkey: accounts.creator.publicKey,
    toPubkey: accounts.authority.publicKey,
    lamports: 0.2 * 1000000000,
  });
  let ix2 = anchor.web3.SystemProgram.transfer({
    fromPubkey: accounts.creator.publicKey,
    toPubkey: accounts.user.publicKey,
    lamports: 0.2 * 1000000000,
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
      accounts.authority.publicKey
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

  return accounts;
};
