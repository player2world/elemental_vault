import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { ElementalVault } from "../target/types/elemental_vault";

export const getGlobalPda = (program: Program<ElementalVault>) => {
  const [globalPda, _globalPdaBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );
  return globalPda;
};
export const getVaultPda = (
  program: Program<ElementalVault>,
  vaultCount: anchor.BN
) => {
  const [vaultPda, _vaultPdaBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vaultCount.toBuffer("le", 8)],
    program.programId
  );
  return vaultPda;
};
export const getUserPda = (
  program: Program<ElementalVault>,
  vaultCount: anchor.BN,
  owner: PublicKey
) => {
  const [userPda, _userPdaBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("user"), vaultCount.toBuffer("le", 8), owner.toBuffer()],
    program.programId
  );
  return userPda;
};
export const getVaultData = async (
  program: Program<ElementalVault>,
  pubkey: PublicKey
) => {
  const data = await program.account.vault.fetch(pubkey);
  return data;
};
export const getUserData = async (
  program: Program<ElementalVault>,
  pubkey: PublicKey
) => {
  const data = await program.account.user.fetch(pubkey);
  return data;
};
export const getAllVaultData = async (program: Program<ElementalVault>) => {
  const allVault = await program.account.vault.all();
  return allVault;
};
