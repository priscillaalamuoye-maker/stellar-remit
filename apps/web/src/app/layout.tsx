import "../styles/globals.css";
import type { ReactNode } from "react";
import { WalletProvider } from "@/context/WalletContext";
import WalletButton from "@/components/WalletButton";

export const metadata = {
  title: "StellarRemit — Cross-border payouts to Nigeria",
  description: "Fast, transparent cross-border payroll and remittance payouts on Stellar.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <header className="site-header">
            <a className="brand" href="/">StellarRemit<span>.</span></a>
            <nav>
              <a href="/#how-it-works">How it works</a>
              <a href="/dashboard">Dashboard</a>
              <a href="https://github.com/" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </nav>
            <WalletButton />
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            Built on Stellar/Soroban · SCF Open Track submission
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
