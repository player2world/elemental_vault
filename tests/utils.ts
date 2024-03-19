import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { ElementalVault } from "../target/types/elemental_vault";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export const amountToToptup = async (
  program: Program<ElementalVault>,
  vaultPda: PublicKey
) => {
  // Calculate amount to topup with amount_collected x yield - ata_amount - amount_redeemed
  const vaultData = await program.account.vault.fetch(vaultPda);

  const amountToReturn =
    +vaultData.amountCollected +
    (+vaultData.amountCollected / 10_000) * vaultData.yieldBps;
  const vaultAta = getAssociatedTokenAddressSync(
    vaultData.baseMint,
    vaultPda,
    true
  );
  const currentVaultAtaAmount =
    await program.provider.connection.getTokenAccountBalance(vaultAta);
  const amountToTopup =
    amountToReturn -
    +currentVaultAtaAmount.value.amount -
    +vaultData.amountRedeemed;

  return amountToTopup;
};

export const delay = async (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const signAndSendTx = async (
  connection: Connection,
  tx: Transaction,
  payer: Keypair
) => {
  tx.recentBlockhash = (
    await connection.getLatestBlockhash("singleGossip")
  ).blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const rawTransaction = tx.serialize();
  const txSig = await connection.sendRawTransaction(rawTransaction);

  const latestBlockHash = await connection.getLatestBlockhash();

  await connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: txSig,
  });

  return txSig;
};
