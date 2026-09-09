"use client";

import { useWallet } from "@/context/WalletContext";

/**
 * WalletButton — shows connect/disconnect in the site header.
 *
 * • Not connected → teal "Connect Wallet" button
 * • Connecting    → disabled spinner state
 * • Connected     → truncated address pill + "Disconnect" link
 */
export default function WalletButton() {
  const { address, isConnected, connecting, connect, disconnect } = useWallet();

  if (connecting) {
    return (
      <button className="wallet-btn wallet-btn--connecting" disabled>
        Connecting…
      </button>
    );
  }

  if (isConnected && address) {
    const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
    return (
      <span className="wallet-connected">
        <span className="wallet-address" title={address}>
          {short}
        </span>
        <button
          className="wallet-btn wallet-btn--disconnect"
          onClick={disconnect}
        >
          Disconnect
        </button>
      </span>
    );
  }

  return (
    <button className="wallet-btn wallet-btn--connect" onClick={connect}>
      Connect Wallet
    </button>
  );
}
