import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "./context/WalletContext";

export const metadata: Metadata = {
  title: "dex-hl",
  description: "Hyperliquid DEX UI (no Solana/Raydium)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
