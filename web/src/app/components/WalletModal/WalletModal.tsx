"use client";
import { useWallet } from "@/app/context/WalletContext";
export default function WalletModal() {
  const { address, connect, disconnect } = useWallet();
  return (
    <div style={{display:"flex",gap:8}}>
      {address ? (
        <>
          <span>{address}</span>
          <button onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <button onClick={connect}>Connect (HL)</button>
      )}
    </div>
  );
}
