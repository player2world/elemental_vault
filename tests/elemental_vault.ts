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
import { amountToToptup, delay } from "./utils";

describe("elemental_vault", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const connection = provider.connection;

  const program = anchor.workspace.ElementalVault as Program<ElementalVault>;

  let vaultOwner = anchor.web3.Keypair.generate();
  let vaultOwnerMint1Ata: PublicKey;
  let vaultOwnerMint2Ata: PublicKey;
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
      signature: await connection.requestAirdrop(vaultOwner.publicKey, 2e9),
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
    vaultOwnerMint1Ata = (
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
      vaultOwnerMint1Ata,
      vaultOwner,
      100_000_000
    );
    await mintTo(
      connection,
      vaultOwner,
      baseMint1,
      user1Mint1Ata,
      vaultOwner,
      100_000_000
    );
    await mintTo(
      connection,
      vaultOwner,
      baseMint1,
      user2Mint1Ata,
      vaultOwner,
      100_000_000
    );
    // Create baseMint2 ATA
    vaultOwnerMint2Ata = (
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
      100_000_000
    );
    await mintTo(
      connection,
      vaultOwner,
      baseMint2,
      user2Mint2Ata,
      vaultOwner,
      100_000_000
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
      process.exit();
    }
    const globalData = await program.account.global.fetch(global);

    assert.equal(+globalData.vaultCounter, 0);
  });

  it("Initialize Vault", async () => {
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
      process.exit();
    }
    const globalDataPost = await program.account.global.fetch(global);
    const vaultData = await getVaultData(program, vault);

    assert.equal(+globalDataPost.vaultCounter, 1, "vaultCounter");

    assert.equal(+vaultData.vaultCount, 0, "vaultCount");
    assert.equal(
      vaultData.authority.toString(),
      vaultOwner.publicKey.toString(),
      "authority"
    );
    assert.equal(
      vaultData.baseMint.toString(),
      baseMint1.toString(),
      "baseMint"
    );
    assert.equal(vaultData.yieldBps, YIELD_BPS, "yieldBps");
    assert.equal(+vaultData.vaultCapacity, +VAULT_CAPACITY, "vaultCapacity");
    assert.equal(+vaultData.minAmount, +MIN_AMOUNT, "minAmount");
    expect(Date.now() * 1000, "startDate").to.be.greaterThan(
      +vaultData.startDate
    );
    expect(+vaultData.endDate, "endDate").to.be.greaterThan(
      +vaultData.startDate
    );
    assert.equal(
      +vaultData.withdrawTimeframe,
      +WITHDRAW_TIMEFRAME,
      "withdrawTimeframe"
    );
    assert.equal(+vaultData.amountCollected, 0, "amountCollected");
    assert.equal(+vaultData.amountWithdrawn, 0, "amountWithdrawn");
    assert.equal(+vaultData.amountRedeemed, 0, "amountRedeemed");
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
      process.exit();
    }
    const vaultData = await getVaultData(program, selectedVault.publicKey);

    assert.equal(
      vaultData.authority.toString(),
      user1.publicKey.toString(),
      "authority"
    );

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

    assert.equal(
      vaultDataPost.authority.toString(),
      vaultOwner.publicKey.toString(),
      "authority2"
    );
  });

  it("Initialize user1 and deposit amount ot vault", async () => {
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];
    const userPda = getUserPda(
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
    const vaultBalance =
      await program.provider.connection.getTokenAccountBalance(vaultAta);

    assert.equal(+userData.amount, USER1_DEPOSIT_AMOUNT, "amount");
    assert.equal(
      userData.owner.toString(),
      user1.publicKey.toString(),
      "owner"
    );
    assert.equal(
      +userData.vaultCount,
      +selectedVault.account.vaultCount,
      "vaultCount"
    );

    assert.equal(+vaultData.amountCollected, USER1_DEPOSIT_AMOUNT);

    assert.equal(+vaultBalance.value.amount, USER1_DEPOSIT_AMOUNT);
  });

  it("User1 deposit amount ot vault", async () => {
    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];
    const userPda = getUserPda(
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

    assert.equal(+userData.amount, USER1_DEPOSIT_AMOUNT * 2, "amount");
    assert.equal(
      userData.owner.toString(),
      user1.publicKey.toString(),
      "owner"
    );
    assert.equal(
      +userData.vaultCount,
      +selectedVault.account.vaultCount,
      "vaultCount"
    );

    assert.equal(
      +vaultData.amountCollected,
      USER1_DEPOSIT_AMOUNT * 2,
      "amountCollected"
    );
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
        destinationAta: vaultOwnerMint1Ata,
        vaultAta: vaultAta,
        vault: selectedVault.publicKey,
        baseMint: baseMint1,
      })
      .signers([vaultOwner])
      .rpc();

    const vaultData = await getVaultData(program, selectedVault.publicKey);

    assert.equal(
      +vaultData.amountWithdrawn,
      USER1_DEPOSIT_AMOUNT * 2,
      "amountWithdrawn"
    );
  });
  it("User to withdraw amount with yield from vault", async () => {
    // AUTHORITY TOPUP AMOUNT BACK AFTER END_DATE
    const amount = await amountToToptup(program, vault);
    await transfer(
      program.provider.connection,
      vaultOwner,
      vaultOwnerMint1Ata,
      vaultAta,
      vaultOwner.publicKey,
      amount
    );
    const vaultAtaAmountPre =
      await program.provider.connection.getTokenAccountBalance(vaultAta);

    const allVault = await getAllVaultData(program);
    const selectedVault = allVault[0];

    const user = getUserPda(
      program,
      selectedVault.account.vaultCount,
      user1.publicKey
    );

    const userAtaAmountPre =
      await program.provider.connection.getTokenAccountBalance(user1Mint1Ata);

    await delay(8_000);
    try {
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
      await program.provider.connection.getTokenAccountBalance(vaultAta);
    const userAtaAmountPost =
      await program.provider.connection.getTokenAccountBalance(user1Mint1Ata);

    assert.equal(
      +vaultAtaAmountPre.value.amount - +vaultAtaAmountPost.value.amount,
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
          authority: vaultOwner.publicKey,
          sourceAta: vaultAta,
          destinationAta: vaultOwnerMint1Ata,
          vault: selectedVault.publicKey,
          baseMint: baseMint1,
        })
        .signers([vaultOwner])
        .rpc();
    } catch (error) {
      console.log("error", error);
    }

    try {
      await program.account.vault.fetch(vault);
      assert.fail();
    } catch (error) {
      assert.ok(error.toString().includes("Account does not exist"));
    }
  });
});
