/**
 * useAnalytics — derives all dashboard analytics from a historyMap.
 *
 * Pure computation — no network calls, no side effects.
 * Re-runs whenever historyMap reference changes.
 *
 * Metrics produced:
 *   totalVolumeUsdc   — sum of all payout amounts in USDC
 *   totalCount        — total number of payout records
 *   confirmedCount    — records with status === "Confirmed"
 *   failedCount       — records with status === "Failed"
 *   pendingCount      — records with status === "Pending"
 *   successRate       — confirmedCount / (confirmedCount + failedCount) * 100
 *   avgSettlementUsdc — average amount per Confirmed payout in USDC
 *   topRecipients     — top 5 addresses by total confirmed volume, desc
 *   dailyVolume       — array of { date, usdc } for the last 30 days
 */

import { useMemo } from "react";
import type { PayoutRecord } from "@/lib/soroban";

// ─── types ────────────────────────────────────────────────────────────────────

export interface TopRecipient {
  address: string;
  totalUsdc: number;
  count: number;
}

export interface DailyVolume {
  /** ISO date string: "YYYY-MM-DD" */
  date: string;
  /** Total USDC sent on that day (Confirmed + Pending; excludes Failed) */
  usdc: number;
}

export interface AnalyticsResult {
  totalVolumeUsdc: number;
  totalCount: number;
  confirmedCount: number;
  failedCount: number;
  pendingCount: number;
  /** 0–100, or null when there are no settled records */
  successRate: number | null;
  /** Average USDC per Confirmed payout, or null when none */
  avgSettlementUsdc: number | null;
  /** Top 5 recipients by total volume (all statuses) */
  topRecipients: TopRecipient[];
  /** Daily volume for the last 30 calendar days */
  dailyVolume: DailyVolume[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const STROOPS_PER_USDC = 10_000_000;
const DAYS_WINDOW = 30;
const TOP_N = 5;

function stroopsToUsdc(stroops: bigint): number {
  return Number(stroops) / STROOPS_PER_USDC;
}

/** "YYYY-MM-DD" from a Unix-second timestamp */
function toDateStr(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

/** Generate the last `n` calendar day strings (inclusive of today) in asc order */
function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    days.push(new Date(now - i * 86_400_000).toISOString().slice(0, 10));
  }
  return days;
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useAnalytics(
  historyMap: Map<string, PayoutRecord[]>
): AnalyticsResult {
  return useMemo(() => {
    // Flatten all records with their address
    const allRecords: Array<{ addr: string; rec: PayoutRecord }> = [];
    historyMap.forEach((records, addr) => {
      records.forEach((rec) => allRecords.push({ addr, rec }));
    });

    // ── counts & volume ──────────────────────────────────────────────────────
    let totalStroops = 0n;
    let confirmedCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    let confirmedStroops = 0n;

    for (const { rec } of allRecords) {
      totalStroops += rec.amount;
      if (rec.status === "Confirmed") {
        confirmedCount++;
        confirmedStroops += rec.amount;
      } else if (rec.status === "Failed") {
        failedCount++;
      } else {
        pendingCount++;
      }
    }

    const totalCount = allRecords.length;
    const totalVolumeUsdc = stroopsToUsdc(totalStroops);

    const settled = confirmedCount + failedCount;
    const successRate = settled > 0 ? (confirmedCount / settled) * 100 : null;

    const avgSettlementUsdc =
      confirmedCount > 0
        ? stroopsToUsdc(confirmedStroops) / confirmedCount
        : null;

    // ── top recipients ───────────────────────────────────────────────────────
    const recipientMap = new Map<string, { stroops: bigint; count: number }>();
    for (const { addr, rec } of allRecords) {
      const existing = recipientMap.get(addr) ?? { stroops: 0n, count: 0 };
      recipientMap.set(addr, {
        stroops: existing.stroops + rec.amount,
        count: existing.count + 1,
      });
    }

    const topRecipients: TopRecipient[] = Array.from(recipientMap.entries())
      .map(([address, { stroops, count }]) => ({
        address,
        totalUsdc: stroopsToUsdc(stroops),
        count,
      }))
      .sort((a, b) => b.totalUsdc - a.totalUsdc)
      .slice(0, TOP_N);

    // ── daily volume (last 30 days) ──────────────────────────────────────────
    const days = lastNDays(DAYS_WINDOW);
    const dayTotals = new Map<string, number>();
    days.forEach((d) => dayTotals.set(d, 0));

    const cutoff = Date.now() / 1000 - DAYS_WINDOW * 86_400;
    for (const { rec } of allRecords) {
      if (rec.status === "Failed") continue; // exclude failed from volume trend
      if (rec.timestamp < cutoff) continue;
      const d = toDateStr(rec.timestamp);
      if (dayTotals.has(d)) {
        dayTotals.set(d, (dayTotals.get(d) ?? 0) + stroopsToUsdc(rec.amount));
      }
    }

    const dailyVolume: DailyVolume[] = days.map((date) => ({
      date,
      usdc: dayTotals.get(date) ?? 0,
    }));

    return {
      totalVolumeUsdc,
      totalCount,
      confirmedCount,
      failedCount,
      pendingCount,
      successRate,
      avgSettlementUsdc,
      topRecipients,
      dailyVolume,
    };
  }, [historyMap]);
}
