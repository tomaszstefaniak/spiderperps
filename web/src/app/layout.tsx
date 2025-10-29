import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "./context/WalletContext";
import Providers from './providers';

export const metadata: Metadata = {
  title: "dex-hl",
  description: "Hyperliquid Perps",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
