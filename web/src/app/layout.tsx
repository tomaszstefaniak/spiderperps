// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { LiveMidsProvider } from "@/app/components/_shared/LiveMidsContext";

export const metadata: Metadata = {
  title: "dex-hl",
  description: "Hyperliquid Perps",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <LiveMidsProvider>
            {children}
          </LiveMidsProvider>
        </Providers>
      </body>
    </html>
  );
}
