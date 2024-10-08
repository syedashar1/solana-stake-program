import BN from "bn.js";
import * as web3 from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as anchor from "@project-serum/anchor";
import { utils, BN } from "@project-serum/anchor";
import {PublicKey} from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import * as token from "@solana/spl-token"
import { NftStakeVault } from "../target/types/nft_stake_vault";
import type { Instructions } from "../target/types/instructions";

//constants
const collectionAddress = new PublicKey("AyRhD1Yh8MAdZAhQL8eK1FZcogg1GW4Y87HqsWJytTzo"); // Mint Address of the Collection NFT for which the staking to be activated
const tokenMint = new PublicKey("5Nyxoz6SUavnfu4vTYzvP9hVndTez1YEBW9zvbBV3zuS"); // Mint of the Token to be given as reward
const tokenAccount = new PublicKey("HMAA7vvmESq6qzE6iuhAfPrr6AefHHBJs7KvfsoMSkye"); // Token account for the reward token

// NFT of the collection - must be owned by the Signer
const nftMint = new PublicKey("DskQgewLBTmPBZwWAZ5U7swcPeggpZ5eRbb6gurY1oZd");
const nftToken = new PublicKey("H8nooeBKDQTcp75zZoyBuMHiWjsWPWH42q3dWJn8CA3a");
const nftMetadata = new PublicKey("9naYoZ4uZxCPPvQPnQwzmFFnFKwrLiUNLf7sQnqWr4RN")
const nftEdition = new PublicKey("FkHtoHUk6kWehv6VrH1mdbgfBM7xxhmcpEubZ8cz3quq");

// NFT from a different collection
const nftMint2 = new PublicKey("N7aCLcbFrFi17J2DfW9G9FoBHjJXZr9hSy8HSP9wzPL");
const nftToken2 = new PublicKey("HyUXydfnfu4kJABGE63cy9EeyfDqqqgKs6wuo6FkY1PL");
const nftMetadata2 = new PublicKey("C5TEagbhLjyhhVeWcCGJBFHwZt6TSWZaoXxK3q2Tpwg1");
const nftEdition2 = new PublicKey("D9XovNCb3Jgt5t4akUDdWnRPovRaZr2uxwJdzhNhDxU8");

// Configure the client to use the local cluster.
anchor.setProvider(anchor.AnchorProvider.env());

const program = anchor.workspace.NftStakeAuth as Program<NftStakeVault>;
const programId = program.idl.metadata.address;

// PDAs
const [stakeDetails] = PublicKey.findProgramAddressSync([
    utils.bytes.utf8.encode("stake"),
    collectionAddress.toBytes(),
    program.provider.publicKey.toBytes()
], programId);

const [tokenAuthority] = PublicKey.findProgramAddressSync([
    utils.bytes.utf8.encode("token-authority"),
    stakeDetails.toBytes()
], programId);

const [nftAuthority] = PublicKey.findProgramAddressSync([
    utils.bytes.utf8.encode("nft-authority"),
    stakeDetails.toBytes()
], programId);

const [nftRecord] = PublicKey.findProgramAddressSync([
    utils.bytes.utf8.encode("nft-record"),
    stakeDetails.toBytes(),
    nftMint.toBytes()
], programId);

const [nftRecord2] = PublicKey.findProgramAddressSync([
    utils.bytes.utf8.encode("nft-record"),
    stakeDetails.toBytes(),
    nftMint2.toBytes()
], programId);

const nftCustody = token.getAssociatedTokenAddressSync(nftMint, nftAuthority, true);
const stakeTokenVault = token.getAssociatedTokenAddressSync(tokenMint, tokenAuthority, true);

describe("nft-stake-vault", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Instructions as anchor.Program<Instructions>;
  
  it("initializes staking", async() => {
    const minimumPeriod = new BN(0);
    const reward = new BN(1);
    const startTime = new BN(Date.now()/1000);
    const endTime = startTime.add(new BN(3600));
    const maxStakerCount = new BN(10);

    const tx = await program.methods.initStaking(
      reward,
      minimumPeriod,
      startTime,
      endTime,
      maxStakerCount
    )
    .accounts({
        stakeDetails,
        tokenMint,
        tokenAuthority,
        collectionAddress,
        nftAuthority,
        stakeTokenVault,
        tokenAccount
    })
    .rpc();

    console.log("TX: ", tx);

    let stakeAccount = await program.account.details.fetch(stakeDetails);
    console.log(stakeAccount);
  });

  it("stakes NFT", async() => {
    const tx = await program.methods.stake()
    .accounts({
      stakeDetails,
      nftRecord,
      nftMint,
      nftToken,
      nftMetadata,
      nftAuthority,
      nftEdition,
      nftCustody,
    })
    .rpc()

    console.log("TX: ", tx);

    let stakeAccount = await program.account.details.fetch(stakeDetails);
    let nftRecordAccount = await program.account.nftRecord.fetch(nftRecord);

    console.log("Stake Details: ", stakeAccount);
    console.log("NFT Record: ", nftRecordAccount);
  });

  it("stakes NFT from different collection and fails", async() => {
    try {
      const tx = await program.methods.stake()
      .accounts({
        stakeDetails,
        nftRecord: nftRecord2,
        nftMint: nftMint2,
        nftToken: nftToken2,
        nftMetadata: nftMetadata2,
        nftEdition: nftEdition2,
        nftAuthority,
        nftCustody
      })
      .rpc()
    } catch(e) {
      console.log(e)
    }
  });

  it("claims rewards without unstaking", async() => {
    let nftRecordAccount = await program.account.nftRecord.fetch(nftRecord);
    console.log("NFT Staked at: ", nftRecordAccount.stakedAt.toNumber());

    const tx = await program.methods.withdrawReward()
    .accounts({
      stakeDetails,
      nftRecord,
      rewardMint: tokenMint,
      rewardReceiveAccount: tokenAccount,
      tokenAuthority,
      stakeTokenVault       
    })
    .rpc()

    console.log("TX: ", tx);

    nftRecordAccount = await program.account.nftRecord.fetch(nftRecord);
    console.log("NFT Staked at: ", nftRecordAccount.stakedAt.toNumber());
  });

  it("claims rewards and unstakes", async() => { 
    const tx = await program.methods.unstake()
    .accounts({
      stakeDetails,
      nftRecord,
      rewardMint: tokenMint,
      rewardReceiveAccount: tokenAccount,
      tokenAuthority,
      nftAuthority,
      nftCustody,
      nftMint,
      nftReceiveAccount: nftToken,
      stakeTokenVault         
    })
    .rpc()

    console.log("TX: ", tx);

    let stakeAccount = await program.account.details.fetch(stakeDetails);
    console.log("Stake Details: ", stakeAccount);
  });

  it("extends staking", async() => {
    const newEndTime = new BN(Date.now() / 1000 + 3710);

    const tx = await program.methods.extendStaking(newEndTime)
    .accounts({
      stakeDetails,
    })
    .rpc();

    console.log("TX: ", tx);

    let stakeAccount = await program.account.details.fetch(stakeDetails);
    console.log("Stake Details: ", stakeAccount);
  });

  it("increase reward", async() => {
    const newReward = new BN(2);

    const tx = await program.methods.changeReward(newReward)
    .accounts({
        stakeDetails,
    })
    .rpc()

    console.log("TX: ", tx);

    let stakeAccount = await program.account.details.fetch(stakeDetails);
    console.log("Stake Details: ", stakeAccount);
  });

  it("adds funds to the vault", async() => {
    const amount = new BN(7000);

    const tx = await program.methods.addFunds(amount).accounts({
      stakeDetails,
      rewardMint: tokenMint,
      tokenAccount,
      stakeTokenVault,
      tokenAuthority
    })
    .rpc()

    console.log("Tx: ", tx);

    let stakeAccount = await program.account.details.fetch(stakeDetails);
    console.log("Stake Details: ", stakeAccount);
  });

  it("closes staking", async() => {
    const tx = await program.methods.closeStaking()
    .accounts({
      stakeDetails,
      tokenMint,
      tokenAuthority,
      tokenAccount,
      stakeTokenVault      
    })
    .rpc()

    console.log("TX: ", tx);

    let stakeAccount = await program.account.details.fetch(stakeDetails);
    console.log("Stake Details: ", stakeAccount);
  });
});
