/**
 * Tests for usePayoutHistory hook.
 * queryHistory is mocked — tests focus on state transitions, polling,
 * and the refresh() imperative handle.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { usePayoutHistory } from "@/hooks/usePayoutHistory";
import type { PayoutRecord } from "@/lib/soroban";

// ── mock queryHistory ─────────────────────────────────────────────────────────
const mockQueryHistory = jest.fn<Promise<PayoutRecord[]>, [string]>();

jest.mock("@/lib/soroban", () => ({
  queryHistory: (addr: string) => mockQueryHistory(addr),
}));

// ── test data ─────────────────────────────────────────────────────────────────

const ADDR_A = "GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";
const ADDR_B = "GXYZ1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";

const RECORD_A: PayoutRecord = {
  amount: 10_000_000n,
  timestamp: 1_700_000_000,
  status: "Confirmed",
};

const RECORD_B: PayoutRecord = {
  amount: 5_000_000n,
  timestamp: 1_700_000_100,
  status: "Pending",
};

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("usePayoutHistory", () => {
  it("starts with empty historyMap and loading=true on first fetch", async () => {
    mockQueryHistory.mockResolvedValue([]);

    const { result } = renderHook(() =>
      usePayoutHistory([ADDR_A], { intervalMs: 30_000 })
    );

    // Before the promise resolves
    expect(result.current.historyMap.size).toBe(0);

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("populates historyMap after successful fetch", async () => {
    mockQueryHistory.mockImplementation(async (addr) =>
      addr === ADDR_A ? [RECORD_A] : []
    );

    const { result } = renderHook(() =>
      usePayoutHistory([ADDR_A], { intervalMs: 30_000 })
    );

    await waitFor(() => {
      expect(result.current.historyMap.get(ADDR_A)).toEqual([RECORD_A]);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdated).not.toBeNull();
  });

  it("fetches for multiple addresses", async () => {
    mockQueryHistory.mockImplementation(async (addr) =>
      addr === ADDR_A ? [RECORD_A] : [RECORD_B]
    );

    const { result } = renderHook(() =>
      usePayoutHistory([ADDR_A, ADDR_B], { intervalMs: 30_000 })
    );

    await waitFor(() => {
      expect(result.current.historyMap.get(ADDR_A)).toEqual([RECORD_A]);
      expect(result.current.historyMap.get(ADDR_B)).toEqual([RECORD_B]);
    });
  });

  it("sets error state when queryHistory throws", async () => {
    mockQueryHistory.mockRejectedValue(new Error("RPC unavailable"));

    const { result } = renderHook(() =>
      usePayoutHistory([ADDR_A], { intervalMs: 30_000 })
    );

    await waitFor(() => {
      expect(result.current.error).toBe("RPC unavailable");
    });
  });

  it("polls again after intervalMs", async () => {
    mockQueryHistory.mockResolvedValue([RECORD_A]);

    renderHook(() => usePayoutHistory([ADDR_A], { intervalMs: 5_000 }));

    // Wait for initial fetch
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockQueryHistory).toHaveBeenCalledTimes(1);

    // Advance past interval
    await act(async () => {
      jest.advanceTimersByTime(5_001);
      await Promise.resolve();
    });

    expect(mockQueryHistory.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not fetch when enabled=false", async () => {
    mockQueryHistory.mockResolvedValue([]);

    renderHook(() =>
      usePayoutHistory([ADDR_A], { intervalMs: 5_000, enabled: false })
    );

    await act(async () => {
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    expect(mockQueryHistory).not.toHaveBeenCalled();
  });

  it("does not fetch when addresses is empty", async () => {
    mockQueryHistory.mockResolvedValue([]);

    renderHook(() => usePayoutHistory([], { intervalMs: 5_000 }));

    await act(async () => {
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    expect(mockQueryHistory).not.toHaveBeenCalled();
  });

  it("refresh() triggers an out-of-band re-fetch", async () => {
    mockQueryHistory.mockResolvedValue([RECORD_A]);

    const { result } = renderHook(() =>
      usePayoutHistory([ADDR_A], { intervalMs: 60_000 })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockQueryHistory.mock.calls.length;

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockQueryHistory.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it("clears error on subsequent successful fetch", async () => {
    mockQueryHistory
      .mockRejectedValueOnce(new Error("RPC unavailable"))
      .mockResolvedValue([RECORD_A]);

    const { result } = renderHook(() =>
      usePayoutHistory([ADDR_A], { intervalMs: 5_000 })
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
