"use client";

/**
 * AnalyticsTab — assembles stat cards, trend chart, and top recipients table.
 *
 * Receives historyMap directly from the parent (no separate network calls —
 * historyMap is already kept live by usePayoutHistory in the parent).
 */

import { useAnalytics } from "@/hooks/useAnalytics";
import StatCard from "@/components/StatCard";
import TrendChart from "@/components/TrendChart";
import type { PayoutRecord } from "@/lib/soroban";

interface AnalyticsTabProps {
  historyMap: Map<string, PayoutRecord[]>;
}

// ── formatting helpers ────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(decimals);
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AnalyticsTab({ historyMap }: AnalyticsTabProps) {
  const {
    totalVolumeUsdc,
    totalCount,
    confirmedCount,
    failedCount,
    pendingCount,
    successRate,
    avgSettlementUsdc,
    topRecipients,
    dailyVolume,
  } = useAnalytics(historyMap);

  const isEmpty = totalCount === 0;

  return (
    <section className="analytics-tab" aria-label="Payout analytics">
      <h2 className="analytics-title">Analytics</h2>

      {isEmpty ? (
        <div className="analytics-empty">
          <p>No payout data yet.</p>
          <p className="analytics-empty-hint">
            Analytics will populate after your first batch payout.
          </p>
        </div>
      ) : (
        <>
          {/* ── stat cards ── */}
          <div className="stat-grid">
            <StatCard
              label="Total Volume"
              value={`${fmt(totalVolumeUsdc)} USDC`}
              sub={`${totalCount} payout${totalCount !== 1 ? "s" : ""}`}
            />
            <StatCard
              label="Success Rate"
              value={successRate !== null ? `${successRate.toFixed(1)}%` : "—"}
              sub={`${confirmedCount} confirmed · ${failedCount} failed`}
              accent={
                successRate === null
                  ? "default"
                  : successRate >= 90
                  ? "success"
                  : successRate >= 70
                  ? "warning"
                  : "danger"
              }
            />
            <StatCard
              label="Avg Settlement"
              value={
                avgSettlementUsdc !== null
                  ? `${fmt(avgSettlementUsdc)} USDC`
                  : "—"
              }
              sub="per confirmed payout"
              accent="default"
            />
            <StatCard
              label="Pending"
              value={String(pendingCount)}
              sub="awaiting confirmation"
              accent={pendingCount > 0 ? "warning" : "default"}
            />
          </div>

          {/* ── trend chart ── */}
          <div className="analytics-section">
            <h3 className="analytics-section-title">Volume Trend</h3>
            <TrendChart data={dailyVolume} height={100} />
          </div>

          {/* ── top recipients ── */}
          {topRecipients.length > 0 && (
            <div className="analytics-section">
              <h3 className="analytics-section-title">Top Recipients</h3>
              <div className="top-recipients-wrap">
                <table className="top-recipients-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Address</th>
                      <th>Total (USDC)</th>
                      <th>Payouts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRecipients.map((r, i) => (
                      <tr key={r.address}>
                        <td className="rank-cell">{i + 1}</td>
                        <td>
                          <a
                            className="explorer-link"
                            href={`https://stellar.expert/explorer/testnet/account/${r.address}`}
                            target="_blank"
                            rel="noreferrer"
                            title={r.address}
                          >
                            {shortAddress(r.address)}
                          </a>
                        </td>
                        <td className="analytics-amount">
                          {fmt(r.totalUsdc)} USDC
                        </td>
                        <td className="analytics-count">{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
