import { Connection, PublicKey } from '@solana/web3.js';
import { parseTokenAccountResp, Raydium } from '@raydium-io/raydium-sdk-v2';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, NATIVE_MINT } from '@solana/spl-token';

export async function updateRaydiumAccounts(
  raydium: Raydium,
  connection: Connection,
  userPubkey: PublicKey
) {
  // 1) Get the user’s SOL account info
  const solAccountResp = await connection.getAccountInfo(userPubkey);

  // 2) Get the user’s SPL token accounts
  const tokenAccountResp = await connection.getTokenAccountsByOwner(userPubkey, {
    programId: TOKEN_PROGRAM_ID,
  });

  // 3) Parse them into Raydium’s format
  const tokenAccountData = parseTokenAccountResp({
    owner: userPubkey,
    solAccountResp,
    tokenAccountResp,
  });

  // 4) (Optionally) derive the user's WSOL ATA if you need it elsewhere
  const expectedWSOL = await getAssociatedTokenAddress(NATIVE_MINT, userPubkey);

  // 5) Update Raydium’s internal cache
  raydium.account.updateTokenAccount(tokenAccountData);
}
