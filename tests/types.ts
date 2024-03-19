import { Keypair, PublicKey } from "@solana/web3.js";

export interface IAccounts {
  creator: Keypair;
  authority: Keypair;
  authorityMintAta: PublicKey;
  user: Keypair;
  userMintAta: PublicKey;
  global: PublicKey;
  vault: PublicKey;
  vaultAta: PublicKey;
  baseMint: PublicKey;
}
