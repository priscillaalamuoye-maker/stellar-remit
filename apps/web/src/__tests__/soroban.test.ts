/**
 * Tests for the soroban.ts utility helpers.
 * Network / RPC calls are mocked — we test logic only.
 */

import { usdcToStroops, WalletAuthError } from "@/lib/soroban";

describe("usdcToStroops", () => {
  it("converts whole numbers correctly", () => {
    expect(usdcToStroops("1")).toBe(10_000_000n);
    expect(usdcToStroops("10")).toBe(100_000_000n);
    expect(usdcToStroops("100")).toBe(1_000_000_000n);
  });

  it("converts decimal values correctly", () => {
    expect(usdcToStroops("1.5")).toBe(15_000_000n);
    expect(usdcToStroops("1.25")).toBe(12_500_000n);
    expect(usdcToStroops("0.0000001")).toBe(1n);
  });

  it("pads fractional part to 7 decimal places", () => {
    expect(usdcToStroops("1.1")).toBe(11_000_000n);
    expect(usdcToStroops("1.10")).toBe(11_000_000n);
  });

  it("truncates fractional part beyond 7 decimal places", () => {
    // 1.12345678 → 1.1234567 (truncated, not rounded)
    expect(usdcToStroops("1.12345678")).toBe(11_234_567n);
  });

  it("handles zero correctly", () => {
    expect(usdcToStroops("0")).toBe(0n);
    expect(usdcToStroops("0.0")).toBe(0n);
  });

  it("handles large amounts without overflow", () => {
    // 1 million USDC
    expect(usdcToStroops("1000000")).toBe(10_000_000_000_000n);
  });
});

describe("WalletAuthError", () => {
  it("has name WalletAuthError", () => {
    const err = new WalletAuthError("rejected");
    expect(err.name).toBe("WalletAuthError");
    expect(err.message).toBe("rejected");
    expect(err).toBeInstanceOf(Error);
  });

  it("is distinguishable from a generic Error", () => {
    const walletErr = new WalletAuthError("rejected");
    const genericErr = new Error("other");
    expect(walletErr instanceof WalletAuthError).toBe(true);
    expect(genericErr instanceof WalletAuthError).toBe(false);
  });
});
