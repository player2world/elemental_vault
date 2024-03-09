import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ElementalVault } from "../target/types/elemental_vault";
import { PublicKey } from "@solana/web3.js";
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
import { assert, expect } from "chai";
import {
  END_DATE,
  MIN_AMOUNT,
  START_DATE,
  USER1_DEPOSIT_AMOUNT,
  VAULT_CAPACITY,
  WITHDRAW_TIMEFRAME,
  YIELD_BPS,
} from "./constant";
import { amountToToptup } from "./utils";

describe("elemental_vault", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const connection = provider.connection;

  const program = anchor.workspace.ElementalVault as Program<ElementalVault>;

  let vaultOwner = anchor.web3.Keypair.generate();
  let vaultOwnerAta: PublicKey;
  let global: PublicKey;
  let vault: PublicKey;
  let vaultAta: PublicKey;
  let user1 = anchor.web3.Keypair.generate();
  let user2 = anchor.web3.Keypair.generate();
  let bozo = anchor.web3.Keypair.generate();
  let user1Mint1Ata: PublicKey;
  let user2Mint1Ata: PublicKey;
  let user1Mint2Ata: PublicKey;
  let user2Mint2Ata: PublicKey;
  let baseMint1: PublicKey;
  let baseMint2: PublicKey;

  it("Setup", async () => {
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: await connection.requestAirdrop(vaultOwner.publicKey, 1e9),
    });
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: await connection.requestAirdrop(user1.publicKey, 1e9),
    });
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: await connection.requestAirdrop(user2.publicKey, 1e9),
    });

    // Initialize all Mint
    baseMint1 = await createMint(
      connection,
      vaultOwner,
      vaultOwner.publicKey,
      vaultOwner.publicKey,
      6
    );
    baseMint2 = await createMint(
      connection,
      vaultOwner,
      vaultOwner.publicKey,
      vaultOwner.publicKey,
      9
    );

    // Create baseMint1 ATA
    vaultOwnerAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        vaultOwner,
        baseMint1,
        vaultOwner.publicKey
      )
    ).address;
    user1Mint1Ata = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        vaultOwner,
        baseMint1,
        user1.publicKey
      )
    ).address;
    user2Mint1Ata = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        vaultOwner,
        baseMint1,
        user2.publicKey
      )
    ).address;
    // Mint baseMint1 ATA
    await mintTo(
      connection,
      vaultOwner,
      baseMint1,
      user1Mint1Ata,
      vaultOwner,
      10_000_000
    );
    await mintTo(
      connection,
      vaultOwner,
      baseMint1,
      user2Mint1Ata,
      vaultOwner,
      10_000_000
    );
    // Create baseMint2 ATA
    vaultOwnerAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        vaultOwner,
        baseMint2,
        vaultOwner.publicKey
      )
    ).address;
    user1Mint2Ata = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        vaultOwner,
        baseMint2,
        user1.publicKey
      )
    ).address;
    user2Mint2Ata = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        vaultOwner,
        baseMint2,
        user2.publicKey
      )
    ).address;
    // Mint baseMint2 ATA
    await mintTo(
      connection,
      vaultOwner,
      baseMint2,
      user1Mint2Ata,
      vaultOwner,
      10_000_000
    );
    await mintTo(
      connection,
      vaultOwner,
      baseMint2,
      user2Mint2Ata,
      vaultOwner,
      10_000_000
    );
  });
  it("Initialize Global", async () => {
    global = getGlobalPda(program);

    try {
      await program.methods
        .initGlobal()
        .accounts({
          initializer: vaultOwner.publicKey,
          global: global,
        })
        .signers([vaultOwner])
        .rpc();
    } catch (error) {
      console.log("error", error);
    }
    const globalData = await program.account.global.fetch(global);

    assert(+globalData.vaultCounter, 0);
  });
  it("Initialize Escrow", async () => {
    const globalData = await program.account.global.fetch(global);
    vault = getVaultPda(program, globalData.vaultCounter);
    vaultAta = getAssociatedTokenAddressSync(baseMint1, vault, true);

    try {
      await program.methods
        .initOrUpdateVault(globalData.vaultCounter, {
          startDate: new anchor.BN(START_DATE),
          endDate: new anchor.BN(END_DATE),
          minAmount: new anchor.BN(MIN_AMOUNT),
          vaultCapacity: new anchor.BN(VAULT_CAPACITY),
          withdrawTimeframe: new anchor.BN(WITHDRAW_TIMEFRAME),
          yieldBps: YIELD_BPS,
        })
        .accounts({
          initializer: vaultOwner.publicKey,
          global: global,
          baseMint: baseMint1,
          vault,
          vaultAta,
        })
        .signers([vaultOwner])
        .rpc();
    } catch (error) {
      console.log("error", error);
    }
    const globalDataPost = await program.account.global.fetch(global);
    const vaultData = await getVaultData(program, vault);

    assert(+globalDataPost.vaultCounter, 1);

    assert(+vaultData.vaultCount, 0);
    assert(vaultData.authority.toString(), vaultOwner.publicKey.toString());
    assert(vaultData.baseMint.toString(), baseMint1.toString());
    assert(vaultData.yieldBps, YIELD_BPS);
    assert(+vaultData.vaultCapacity, +VAULT_CAPACITY);
    assert(+vaultData.minAmount, +MIN_AMOUNT);
    expect(+vaultData.startDate).to.be.greaterThan(Date.now());
    expect(+vaultData.endDate).to.be.greaterThan(+vaultData.startDate);
    assert(+vaultData.withdrawTimeframe, +WITHDRAW_TIMEFRAME);
    assert(+vaultData.amountCollected, 0);
    assert(+vaultData.amountWithdrawn, 0);
    assert(+vaultData.amountRedeemed, 0);
  });

  it("Update Escrow Authority", async () => {
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];

    try {
      await program.methods
        .updateAuthority(selectedVault.account.vaultCount)
        .accounts({
          currentAuthority: vaultOwner.publicKey,
          newAuthority: user1.publicKey,
          vault,
        })
        .signers([vaultOwner])
        .rpc();
    } catch (error) {
      console.log("error", error);
    }
    const vaultData = await getVaultData(program, selectedVault.publicKey);

    assert(vaultData.authority.toString(), user1.publicKey.toString());

    await program.methods
      .updateAuthority(selectedVault.account.vaultCount)
      .accounts({
        currentAuthority: user1.publicKey,
        newAuthority: vaultOwner.publicKey,
        vault,
      })
      .signers([user1])
      .rpc();
    const vaultDataPost = await getVaultData(program, selectedVault.publicKey);

    assert(vaultDataPost.authority.toString(), user1.publicKey.toString());
  });

  it("Initialize user1 and deposit amount ot vault", async () => {
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];
    const userPda = await getUserPda(
      program,
      selectedVault.account.vaultCount,
      user1.publicKey
    );

    await program.methods
      .initOrDepositUser(
        selectedVault.account.vaultCount,
        new anchor.BN(USER1_DEPOSIT_AMOUNT),
        1
      )
      .accounts({
        owner: user1.publicKey,
        sourceAta: user1Mint1Ata,
        destinationAta: vaultAta,
        vault: selectedVault.publicKey,
        user: userPda,
        baseMint: baseMint1,
      })
      .signers([user1])
      .rpc();

    const vaultData = await getVaultData(program, selectedVault.publicKey);
    const userData = await getUserData(program, userPda);

    assert(+userData.amount, USER1_DEPOSIT_AMOUNT);
    assert(+userData.owner, user1.publicKey.toString());
    assert(+userData.vaultCount, +selectedVault.account.vaultCount);

    assert(+vaultData.amountCollected, USER1_DEPOSIT_AMOUNT);
  });

  it("User1 deposit amount ot vault", async () => {
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];
    const userPda = await getUserPda(
      program,
      selectedVault.account.vaultCount,
      user1.publicKey
    );

    await program.methods
      .initOrDepositUser(
        selectedVault.account.vaultCount,
        new anchor.BN(USER1_DEPOSIT_AMOUNT),
        1
      )
      .accounts({
        owner: user1.publicKey,
        sourceAta: user1Mint1Ata,
        destinationAta: vaultAta,
        vault: selectedVault.publicKey,
        user: userPda,
        baseMint: baseMint1,
      })
      .signers([user1])
      .rpc();

    const vaultData = await getVaultData(program, selectedVault.publicKey);
    const userData = await getUserData(program, userPda);

    assert(+userData.amount, USER1_DEPOSIT_AMOUNT * 2);
    assert(+userData.owner, user1.publicKey.toString());
    assert(+userData.vaultCount, +selectedVault.account.vaultCount);

    assert(+vaultData.amountCollected, USER1_DEPOSIT_AMOUNT * 2);
  });

  it("Authority withdraw from vault", async () => {
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];

    await program.methods
      .authorityWithdraw(
        selectedVault.account.vaultCount,
        new anchor.BN(USER1_DEPOSIT_AMOUNT * 2)
      )
      .accounts({
        authority: vaultOwner.publicKey,
        destinationAta: vaultOwnerAta,
        vaultAta: vaultAta,
        vault: selectedVault.publicKey,
        baseMint: baseMint1,
      })
      .signers([vaultOwner])
      .rpc();

    const vaultData = await getVaultData(program, selectedVault.publicKey);

    assert(+vaultData.amountWithdrawn, USER1_DEPOSIT_AMOUNT * 2);
  });
  it("User to withdraw amount with yield from vault", async () => {
    // AUTHORITY TOPUP AMOUNT BACK AFTER END_DATE
    const amount = await amountToToptup(program, vault);
    await transfer(
      program.provider.connection,
      vaultOwner,
      vaultOwnerAta,
      vaultAta,
      vault,
      amount
    );
    const vaultAtaAmountPre =
      await program.provider.connection.getTokenAccountBalance(vaultAta);
    const vaultDataPre = await program.account.vault.fetch(vault);
    assert(
      +vaultAtaAmountPre.value.amount,
      (+vaultDataPre.amountCollected / 10_000) * vaultDataPre.yieldBps
    );
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];

    const user = getUserPda(
      program,
      selectedVault.account.vaultCount,
      user1.publicKey
    );
    const userAtaAmountPre =
      await program.provider.connection.getTokenAccountBalance(user1Mint1Ata);

    await program.methods
      .userWithdraw(selectedVault.account.vaultCount)
      .accounts({
        owner: user1.publicKey,
        sourceAta: vaultAta,
        destinationAta: user1Mint1Ata,
        vault: selectedVault.publicKey,
        user: user,
        baseMint: baseMint1,
      })
      .signers([user1])
      .rpc();

    const userData = await program.account.user.fetch(user);
    const vaultData = await getVaultData(program, selectedVault.publicKey);
    const vaultAtaAmountPost =
      await program.provider.connection.getTokenAccountBalance(vaultAta);
    const userAtaAmountPost =
      await program.provider.connection.getTokenAccountBalance(user1Mint1Ata);

    assert(+vaultData.amountRedeemed, +userData.amount);
    assert(
      +vaultAtaAmountPre.value.amount - +vaultAtaAmountPost.value.amount,
      +userAtaAmountPre.value.amount - +userAtaAmountPost.value.amount
    );
  });

  // TODO: close_escrow
  it("User to withdraw amount with yield from vault", async () => {
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];

    await program.methods
      .closeVault(selectedVault.account.vaultCount)
      .accounts({
        owner: vaultOwner.publicKey,
        sourceAta: vaultAta,
        destinationAta: vaultOwnerAta,
        vault: selectedVault.publicKey,
        baseMint: baseMint1,
      })
      .signers([vaultOwner])
      .rpc();

    try {
      await program.account.vault.fetch(vault);
      assert.fail();
    } catch (error) {
      console.log("error", error);
      assert.ok(error.includes("not found"));
    }
  });
});
