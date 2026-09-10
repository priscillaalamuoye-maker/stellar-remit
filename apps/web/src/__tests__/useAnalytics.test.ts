/**
 * Tests for useAnalytics hook.
 * Pure computation — no mocks needed, just data fixtures.
 */

import { renderHook } from "@testing-library/react";
import { useAnalytics } from "@/hooks/useAnalytics";
import type { PayoutRecord } from "@/lib/soroban";

// ── helpers ───────────────────────────────────────────────────────────────────

const ADDR_A = "GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";
const ADDR_B = "GXYZ1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";
const ADDR_C = "GQQQ1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";

/** Build a PayoutRecord fixture */
function rec(
  amount: bigint,
  status: PayoutRecord["status"],
  timestamp = 1_700_000_000
): PayoutRecord {
  return { amount, status, timestamp };
}

const USDC = (n: number) => BigInt(Math.round(n * 10_000_000));

// ─────────────────────────────────────────────────────────────────────────────

describe("useAnalytics — empty map", () => {
  it("returns zero totals for empty historyMap", () => {
    const { result } = renderHook(() => useAnalytics(new Map()));
    expect(result.current.totalVolumeUsdc).toBe(0);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.confirmedCount).toBe(0);
    expect(result.current.failedCount).toBe(0);
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.successRate).toBeNull();
    expect(result.current.avgSettlementUsdc).toBeNull();
    expect(result.current.topRecipients).toHaveLength(0);
    expect(result.current.dailyVolume).toHaveLength(30);
  });

  it("dailyVolume has all-zero usdc when no records", () => {
    const { result } = renderHook(() => useAnalytics(new Map()));
    const allZero = result.current.dailyVolume.every((d) => d.usdc === 0);
    expect(allZero).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAnalytics — counts and volume", () => {
  it("sums totalVolumeUsdc across all statuses", () => {
    const map = new Map<string, PayoutRecord[]>([
      [ADDR_A, [rec(USDC(10), "Confirmed"), rec(USDC(5), "Failed")]],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.totalVolumeUsdc).toBeCloseTo(15);
  });

  it("counts confirmed, failed, pending correctly", () => {
    const map = new Map<string, PayoutRecord[]>([
      [
        ADDR_A,
        [
          rec(USDC(1), "Confirmed"),
          rec(USDC(1), "Confirmed"),
          rec(USDC(1), "Failed"),
          rec(USDC(1), "Pending"),
        ],
      ],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.confirmedCount).toBe(2);
    expect(result.current.failedCount).toBe(1);
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.totalCount).toBe(4);
  });

  it("sums across multiple addresses", () => {
    const map = new Map<string, PayoutRecord[]>([
      [ADDR_A, [rec(USDC(20), "Confirmed")]],
      [ADDR_B, [rec(USDC(30), "Confirmed")]],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.totalVolumeUsdc).toBeCloseTo(50);
    expect(result.current.totalCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAnalytics — success rate", () => {
  it("is null when no confirmed or failed records", () => {
    const map = new Map([[ADDR_A, [rec(USDC(1), "Pending")]]]);
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.successRate).toBeNull();
  });

  it("is 100% when all confirmed", () => {
    const map = new Map([
      [ADDR_A, [rec(USDC(1), "Confirmed"), rec(USDC(1), "Confirmed")]],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.successRate).toBeCloseTo(100);
  });

  it("is 0% when all failed", () => {
    const map = new Map([
      [ADDR_A, [rec(USDC(1), "Failed"), rec(USDC(1), "Failed")]],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.successRate).toBeCloseTo(0);
  });

  it("is 50% with equal confirmed and failed", () => {
    const map = new Map([
      [ADDR_A, [rec(USDC(1), "Confirmed"), rec(USDC(1), "Failed")]],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.successRate).toBeCloseTo(50);
  });

  it("excludes pending from success rate denominator", () => {
    const map = new Map([
      [
        ADDR_A,
        [
          rec(USDC(1), "Confirmed"),
          rec(USDC(1), "Pending"),
          rec(USDC(1), "Pending"),
        ],
      ],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    // 1 confirmed / (1 confirmed + 0 failed) = 100%
    expect(result.current.successRate).toBeCloseTo(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAnalytics — average settlement", () => {
  it("is null when no confirmed records", () => {
    const map = new Map([[ADDR_A, [rec(USDC(5), "Pending")]]]);
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.avgSettlementUsdc).toBeNull();
  });

  it("computes average over confirmed records only", () => {
    const map = new Map([
      [
        ADDR_A,
        [
          rec(USDC(10), "Confirmed"),
          rec(USDC(20), "Confirmed"),
          rec(USDC(999), "Failed"), // should be excluded
        ],
      ],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.avgSettlementUsdc).toBeCloseTo(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAnalytics — top recipients", () => {
  it("returns recipients sorted by total volume descending", () => {
    const map = new Map<string, PayoutRecord[]>([
      [ADDR_A, [rec(USDC(5), "Confirmed")]],
      [ADDR_B, [rec(USDC(50), "Confirmed")]],
      [ADDR_C, [rec(USDC(20), "Confirmed")]],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    const addrs = result.current.topRecipients.map((r) => r.address);
    expect(addrs[0]).toBe(ADDR_B);
    expect(addrs[1]).toBe(ADDR_C);
    expect(addrs[2]).toBe(ADDR_A);
  });

  it("caps at 5 recipients", () => {
    const map = new Map(
      Array.from({ length: 8 }, (_, i) => [
        `G${"X".repeat(55)}${i}`.slice(0, 56),
        [rec(USDC(i + 1), "Confirmed")],
      ])
    );
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.topRecipients.length).toBeLessThanOrEqual(5);
  });

  it("sums amounts across multiple payouts per recipient", () => {
    const map = new Map([
      [
        ADDR_A,
        [rec(USDC(10), "Confirmed"), rec(USDC(15), "Confirmed")],
      ],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.topRecipients[0].totalUsdc).toBeCloseTo(25);
    expect(result.current.topRecipients[0].count).toBe(2);
  });

  it("includes failed and pending amounts in top-recipients volume", () => {
    // topRecipients is by total volume (all statuses), for ranking purposes
    const map = new Map([
      [ADDR_A, [rec(USDC(100), "Failed")]],
      [ADDR_B, [rec(USDC(10), "Confirmed")]],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    expect(result.current.topRecipients[0].address).toBe(ADDR_A);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAnalytics — daily volume", () => {
  it("always returns exactly 30 entries", () => {
    const { result } = renderHook(() => useAnalytics(new Map()));
    expect(result.current.dailyVolume).toHaveLength(30);
  });

  it("entries have ascending dates", () => {
    const { result } = renderHook(() => useAnalytics(new Map()));
    const dates = result.current.dailyVolume.map((d) => d.date);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });

  it("excludes Failed records from daily volume", () => {
    const todaySec = Math.floor(Date.now() / 1000);
    const map = new Map([
      [ADDR_A, [rec(USDC(100), "Failed", todaySec)]],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    const total = result.current.dailyVolume.reduce((s, d) => s + d.usdc, 0);
    expect(total).toBe(0);
  });

  it("includes Confirmed records in daily volume", () => {
    const todaySec = Math.floor(Date.now() / 1000);
    const map = new Map([
      [ADDR_A, [rec(USDC(42), "Confirmed", todaySec)]],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    const today = result.current.dailyVolume[result.current.dailyVolume.length - 1];
    expect(today.usdc).toBeCloseTo(42);
  });

  it("includes Pending records in daily volume", () => {
    const todaySec = Math.floor(Date.now() / 1000);
    const map = new Map([
      [ADDR_A, [rec(USDC(7), "Pending", todaySec)]],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    const today = result.current.dailyVolume[result.current.dailyVolume.length - 1];
    expect(today.usdc).toBeCloseTo(7);
  });

  it("excludes records older than 30 days from daily buckets", () => {
    const oldSec = Math.floor(Date.now() / 1000) - 31 * 86_400;
    const map = new Map([
      [ADDR_A, [rec(USDC(999), "Confirmed", oldSec)]],
    ]);
    const { result } = renderHook(() => useAnalytics(map));
    const total = result.current.dailyVolume.reduce((s, d) => s + d.usdc, 0);
    expect(total).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAnalytics — memoisation", () => {
  it("returns the same object reference when historyMap is unchanged", () => {
    const map = new Map([[ADDR_A, [rec(USDC(1), "Confirmed")]]]);
    const { result, rerender } = renderHook(() => useAnalytics(map));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("recomputes when historyMap reference changes", () => {
    const map1 = new Map([[ADDR_A, [rec(USDC(1), "Confirmed")]]]);
    let map = map1;
    const { result, rerender } = renderHook(() => useAnalytics(map));
    const first = result.current;

    map = new Map([[ADDR_A, [rec(USDC(99), "Confirmed")]]]);
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current.totalVolumeUsdc).toBeCloseTo(99);
  });
});
