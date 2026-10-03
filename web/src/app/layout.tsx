// src/app/layout.tsx
import '@/app/polyfills/ssr-localstorage';
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpiderPerps: copy top Hyperliquid traders from your phone",
  description:
    "Follow the best Hyperliquid traders, get their moves as one-tap copies on your phone, approve every trade. Your keys never leave your devices.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
