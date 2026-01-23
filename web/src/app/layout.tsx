// src/app/layout.tsx
import '@/app/polyfills/ssr-localstorage';
import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { LiveMidsProvider } from "@/app/components/_shared/LiveMidsContext";
import { CopyModeProvider } from '@/app/context/CopyModeContext';
import { CopyTradeConfigProvider } from '@/app/context/CopyTradeConfigContext';

export const metadata: Metadata = {
  title: "dex-hl",
  description: "Hyperliquid Perps",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {/* Order: mode + config are client providers */}
          <CopyModeProvider>
            <CopyTradeConfigProvider>
              <LiveMidsProvider>
                {children}
              </LiveMidsProvider>
            </CopyTradeConfigProvider>
          </CopyModeProvider>
        </Providers>
      </body>
    </html>
  );
}
