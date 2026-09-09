import "../styles/globals.css";
import type { ReactNode } from "react";
import { WalletProvider } from "@/context/WalletContext";
import WalletButton from "@/components/WalletButton";

export const metadata = {
  title: "StellarRemit — Batch Payout Dashboard",
  description: "Cross-border payroll & remittance payouts on Stellar/Soroban",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <header className="site-header">
            <div className="brand">StellarRemit</div>
            <nav>
              <a href="/">Dashboard</a>
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
