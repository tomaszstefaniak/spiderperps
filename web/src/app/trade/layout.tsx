// Wallet, watchlist and live prices are only needed by the order ticket.
import Providers from "../providers";
import { LiveMidsProvider } from "@/app/components/_shared/LiveMidsContext";

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <LiveMidsProvider>{children}</LiveMidsProvider>
    </Providers>
  );
}
