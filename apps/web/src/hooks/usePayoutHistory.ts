"use client";

/**
 * usePayoutHistory — polls get_history() for a list of recipient addresses
 * at a configurable interval and returns the combined records keyed by address.
 *
 * Usage:
 *   const { historyMap, loading, error, refresh } = usePayoutHistory(
 *     ["G...", "G..."],
 *     { intervalMs: 15_000 }
 *   );
 *
 * historyMap is a Map<address, PayoutRecord[]> updated on every poll cycle.
 * Polling stops when `addresses` is empty or the component unmounts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { queryHistory, type PayoutRecord } from "@/lib/soroban";

export interface UsePayoutHistoryOptions {
  /** Poll interval in milliseconds. Default: 15 000 (15 s). */
  intervalMs?: number;
  /** Set to false to disable auto-polling. Default: true. */
  enabled?: boolean;
}

export interface UsePayoutHistoryResult {
  /** Per-address payout history. Empty map while loading for the first time. */
  historyMap: Map<string, PayoutRecord[]>;
  /** True only during the very first fetch (before any data is available). */
  loading: boolean;
  /** Last fetch error, if any. Cleared on the next successful fetch. */
  error: string | null;
  /** Trigger an immediate out-of-band refresh. */
  refresh: () => void;
  /** Timestamp (ms) of the last successful fetch, or null. */
  lastUpdated: number | null;
}

const DEFAULT_INTERVAL = 15_000;

export function usePayoutHistory(
  addresses: string[],
  options: UsePayoutHistoryOptions = {}
): UsePayoutHistoryResult {
  const { intervalMs = DEFAULT_INTERVAL, enabled = true } = options;

  const [historyMap, setHistoryMap] = useState<Map<string, PayoutRecord[]>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Use a ref so the fetch function always sees the latest addresses without
  // needing to be in the dependency array (avoids re-creating the interval).
  const addressesRef = useRef(addresses);
  useEffect(() => {
    addressesRef.current = addresses;
  }, [addresses]);

  const fetchAll = useCallback(async (isInitial = false) => {
    const addrs = addressesRef.current;
    if (addrs.length === 0) return;

    if (isInitial) setLoading(true);

    try {
      const entries = await Promise.all(
        addrs.map(async (addr) => {
          const records = await queryHistory(addr);
          return [addr, records] as [string, PayoutRecord[]];
        })
      );
      setHistoryMap(new Map(entries));
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch payout history."
      );
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Initial fetch + set up interval
  useEffect(() => {
    if (!enabled || addresses.length === 0) return;

    fetchAll(true);

    const id = setInterval(() => fetchAll(false), intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, fetchAll, addresses.length]);

  const refresh = useCallback(() => {
    fetchAll(false);
  }, [fetchAll]);

  return { historyMap, loading, error, refresh, lastUpdated };
}
