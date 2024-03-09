import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Vault } from "../target/types/vault";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export const amountToToptup = async (
  program: Program<Vault>,
  vaultPda: PublicKey
) => {
  // Calculate amount to topup with amount_collected x yield - ata_amount - amount_redeemed
  const vaultData = await program.account.vault.fetch(vaultPda);
  console.log("amountCollected", +vaultData.amountCollected);
  console.log("yieldBps", vaultData.yieldBps);
  const amountToReturn =
    (+vaultData.amountCollected / 10_000) * vaultData.yieldBps;
  const vaultAta = getAssociatedTokenAddressSync(
    vaultData.baseMint,
    vaultPda,
    true
  );
  console.log("amountToReturn", amountToReturn);
  const currentVaultAtaAmount =
    await program.provider.connection.getTokenAccountBalance(vaultAta);
  console.log("currentVaultAtaAmount", currentVaultAtaAmount);
  const amountToTopup =
    amountToReturn -
    +currentVaultAtaAmount.value.amount -
    +vaultData.amountRedeemed;
  console.log("amountToTopup", amountToTopup);

  return amountToTopup;
};
