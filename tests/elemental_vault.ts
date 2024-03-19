import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ElementalVault } from "../target/types/elemental_vault";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
} from "@solana/spl-token";
import {
  getVaultData,
  getVaultPda,
  getGlobalPda,
  getAllVaultData,
  getUserPda,
  getUserData,
} from "./pda";
import { assert, expect, use } from "chai";
import {
  END_DATE,
  MIN_AMOUNT,
  START_DATE,
  USER_DEPOSIT_AMOUNT,
  VAULT_CAPACITY,
  WITHDRAW_TIMEFRAME,
  YIELD_BPS,
} from "./constant";
import { amountToToptup, delay, signAndSendTx } from "./utils";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import dotenv from "dotenv";
import { initGlobal, initVault } from "./funtions";
import { newSetup } from "./newSetup";
dotenv.config();

describe("elemental_vault", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.ElementalVault as Program<ElementalVault>;

  let creator = anchor.web3.Keypair.generate();
  let authority = anchor.web3.Keypair.generate();
  let user = anchor.web3.Keypair.generate();
  let authorityMintAta: PublicKey;
  let global: PublicKey;
  let vault: PublicKey;
  let vaultAta: PublicKey;
  let userMintAta: PublicKey;
  let baseMint: PublicKey;

  console.log("creator:", creator.publicKey.toString());
  console.log("program:", program.programId.toString());

  let accounts = {
    creator,
    authority,
    authorityMintAta,
    user,
    userMintAta,
    global,
    vault,
    vaultAta,
    baseMint,
  };

  it("Setup", async () => {
    // Initialize all Mint
    accounts.baseMint = new PublicKey(
      "CADRwufG5Z6mkDr9nxizybxCtbtctU1ChCQwN4ptKy3D"
    );
    accounts = await newSetup(program, accounts);
    accounts.authorityMintAta = (
      await getOrCreateAssociatedTokenAccount(
        program.provider.connection,
        accounts.authority,
        accounts.baseMint,
        accounts.authority.publicKey
      )
    ).address;
    accounts.userMintAta = (
      await getOrCreateAssociatedTokenAccount(
        program.provider.connection,
        accounts.authority,
        accounts.baseMint,
        accounts.user.publicKey
      )
    ).address;

    console.log("baseMint", accounts.baseMint.toString());
    console.log("user", accounts.user.publicKey.toString());
  });

  it("Initialize Global", async () => {
    accounts = await initGlobal(program, accounts);
  });

  it("Initialize Vault", async () => {
    accounts = await initVault(program, accounts);
  });

  it("Update Escrow Authority", async () => {
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];

    try {
      await program.methods
        .updateAuthority(selectedVault.account.vaultCount, creator.publicKey)
        .accounts({
          currentAuthority: authority.publicKey,
          vault: accounts.vault,
        })
        .signers([authority])
        .rpc();
    } catch (error) {
      console.log("error", error);
      process.exit();
    }
    const vaultData = await getVaultData(program, selectedVault.publicKey);

    assert.equal(
      vaultData.authority.toString(),
      creator.publicKey.toString(),
      "authority"
    );

    // CHANGE BACK
    await program.methods
      .updateAuthority(selectedVault.account.vaultCount, authority.publicKey)
      .accounts({
        currentAuthority: creator.publicKey,
        vault: accounts.vault,
      })
      .signers([creator])
      .rpc();
    const vaultDataPost = await getVaultData(program, selectedVault.publicKey);

    assert.equal(
      vaultDataPost.authority.toString(),
      authority.publicKey.toString(),
      "authority2"
    );
  });

  it("Initialize user and deposit amount to vault", async () => {
    const selectedVault = await getVaultData(program, accounts.vault);
    const userPda = getUserPda(
      program,
      selectedVault.vaultCount,
      user.publicKey
    );

    await program.methods
      .initOrDepositUser(
        selectedVault.vaultCount,
        new anchor.BN(USER_DEPOSIT_AMOUNT)
      )
      .accounts({
        owner: user.publicKey,
        sourceAta: accounts.userMintAta,
        destinationAta: accounts.vaultAta,
        vault: accounts.vault,
        user: userPda,
        baseMint: accounts.baseMint,
      })
      .signers([user])
      .rpc();

    const vaultData = await getVaultData(program, accounts.vault);

    const userData = await getUserData(program, userPda);

    const vaultBalance =
      await program.provider.connection.getTokenAccountBalance(
        accounts.vaultAta
      );

    assert.equal(+userData.amount, USER_DEPOSIT_AMOUNT, "amount");
    assert.equal(
      userData.owner.toString(),
      accounts.user.publicKey.toString(),
      "owner"
    );

    // assert.equal(+userData.vaultCount, +selectedVault.vaultCount, "vaultCount");

    assert.equal(+vaultData.amountCollected, USER_DEPOSIT_AMOUNT);

    assert.equal(+vaultBalance.value.amount, USER_DEPOSIT_AMOUNT);
  });

  it("User deposit amount ot vault", async () => {
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];
    const userPda = getUserPda(
      program,
      selectedVault.account.vaultCount,
      accounts.user.publicKey
    );

    await program.methods
      .initOrDepositUser(
        selectedVault.account.vaultCount,
        new anchor.BN(USER_DEPOSIT_AMOUNT)
      )
      .accounts({
        owner: accounts.user.publicKey,
        sourceAta: accounts.userMintAta,
        destinationAta: accounts.vaultAta,
        vault: selectedVault.publicKey,
        user: userPda,
        baseMint: accounts.baseMint,
      })
      .signers([user])
      .rpc();

    const vaultData = await getVaultData(program, selectedVault.publicKey);
    const userData = await getUserData(program, userPda);

    assert.equal(+userData.amount, USER_DEPOSIT_AMOUNT * 2, "amount");
    assert.equal(
      userData.owner.toString(),
      accounts.user.publicKey.toString(),
      "owner"
    );

    assert.equal(
      +vaultData.amountCollected,
      USER_DEPOSIT_AMOUNT * 2,
      "amountCollected"
    );
  });

  it("Authority withdraw from vault", async () => {
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];

    await program.methods
      .authorityWithdraw(
        selectedVault.account.vaultCount,
        new anchor.BN(USER_DEPOSIT_AMOUNT * 2)
      )
      .accounts({
        authority: authority.publicKey,
        destinationAta: accounts.authorityMintAta,
        vaultAta: accounts.vaultAta,
        vault: selectedVault.publicKey,
        baseMint: accounts.baseMint,
      })
      .signers([authority])
      .rpc();

    const vaultData = await getVaultData(program, selectedVault.publicKey);

    assert.equal(
      +vaultData.amountWithdrawn,
      USER_DEPOSIT_AMOUNT * 2,
      "amountWithdrawn"
    );
  });
  // TODO: DATE CONFIG REQUIRED. GO TO CONSTRAINT AND COMMENT OUT TEST
  it("User to withdraw amount with yield from vault", async () => {
    // AUTHORITY TOPUP AMOUNT BACK AFTER END_DATE
    const amount = await amountToToptup(program, accounts.vault);
    try {
      await transfer(
        program.provider.connection,
        authority,
        accounts.authorityMintAta,
        accounts.vaultAta,
        authority.publicKey,
        amount
      );
    } catch (error) {
      console.log("error", error);
    }
    const vaultAtaAmountPre =
      await program.provider.connection.getTokenAccountBalance(
        accounts.vaultAta
      );

    const vaultData = await program.account.vault.fetch(accounts.vault);
    console.log("vaultData.vaultCount", +vaultData.vaultCount);
    const user = getUserPda(
      program,
      vaultData.vaultCount,
      accounts.user.publicKey
    );

    const userAtaAmountPre =
      await program.provider.connection.getTokenAccountBalance(
        accounts.userMintAta
      );

    await delay(9_000);
    try {
      await program.methods
        .userWithdraw(vaultData.vaultCount)
        .accounts({
          owner: accounts.user.publicKey,
          sourceAta: accounts.vaultAta,
          destinationAta: accounts.userMintAta,
          vault: accounts.vault,
          user: user,
          baseMint: accounts.baseMint,
        })
        .signers([accounts.user])
        .rpc();
    } catch (error) {
      console.log("error", error);
      process.exit();
    }

    try {
      await program.account.user.fetch(user);
    } catch (error) {
      assert.ok(error.toString().includes("Account does not exist"));
    }
    const vaultAtaAmountPost =
      await program.provider.connection.getTokenAccountBalance(
        accounts.vaultAta
      );
    const userAtaAmountPost =
      await program.provider.connection.getTokenAccountBalance(
        accounts.userMintAta
      );

    assert.equal(
      +vaultAtaAmountPost.value.amount - +vaultAtaAmountPre.value.amount,
      +userAtaAmountPre.value.amount - +userAtaAmountPost.value.amount
    );
  });

  it("Authority Close Escrow", async () => {
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];

    try {
      await program.methods
        .closeVault(selectedVault.account.vaultCount)
        .accounts({
          authority: authority.publicKey,
          sourceAta: accounts.vaultAta,
          destinationAta: accounts.authorityMintAta,
          vault: selectedVault.publicKey,
          baseMint: accounts.baseMint,
          creator: creator.publicKey,
        })
        .signers([authority])
        .rpc();
    } catch (error) {
      console.log("error", error);
    }

    try {
      const vault = await program.account.vault.fetch(accounts.vault);
      assert.fail();
    } catch (error) {
      assert.ok(error.toString().includes("Account does not exist"));
    }
  });
});
