"use client";

/**
 * WalletContext — wraps Freighter wallet state across the app.
 *
 * Exposes:
 *   address      — connected public key, or null when disconnected
 *   isConnected  — true once the user has authorised this origin in Freighter
 *   connecting   — true while the connect handshake is in flight
 *   connect()    — prompt Freighter for access, store the address
 *   disconnect() — clear local wallet state (Freighter has no programmatic
 *                  revoke; the user must do that inside the extension)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  isConnected as freighterIsConnected,
  isAllowed,
  requestAccess,
  getAddress,
} from "@stellar/freighter-api";

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, check whether the extension has already authorised this origin
  // and restore the address if so.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { isConnected } = await freighterIsConnected();
        if (!isConnected || cancelled) return;
        const { isAllowed: allowed } = await isAllowed();
        if (!allowed || cancelled) return;
        const { address: addr, error } = await getAddress();
        if (!error && addr && !cancelled) setAddress(addr);
      } catch {
        // Extension absent or unavailable — silently skip.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const { isConnected } = await freighterIsConnected();
      if (!isConnected) {
        setError(
          "Freighter is not available in this browser. Install the extension, then reload this page."
        );
        return;
      }
      // requestAccess prompts the user in the extension popup.
      const { address: addr, error } = await requestAccess();
      if (error) {
        setError(error.message ?? "Freighter access request was rejected.");
        return;
      }
      if (!addr) {
        setError("Freighter did not return a wallet address. Please try again.");
        return;
      }
      setAddress(addr);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to connect to Freighter. Please try again."
      );
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: !!address,
        connecting,
        error,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

/** Throw if used outside <WalletProvider>. */
export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used inside <WalletProvider>");
  }
  return ctx;
}
