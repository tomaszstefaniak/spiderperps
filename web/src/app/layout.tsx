// src/app/layout.tsx
import './globals.css';

export const metadata = {
  title: 'My DEX',
  description: 'Swap SOL and SPL tokens on Raydium/Jupiter…',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
