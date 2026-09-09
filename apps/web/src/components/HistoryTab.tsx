"use client";

/**
 * HistoryTab — shows a table of past payouts for one or more recipients,
 * with per-row status badges and stellar.expert explorer links.
 *
 * Props:
 *   addresses  — list of recipient Stellar addresses to display history for
 *   pendingTxHash — hash of the most-recently submitted tx (shown at the top)
 */

import TransactionStatus from "@/components/TransactionStatus";
import { usePayoutHistory } from "@/hooks/usePayoutHistory";
import type { PayoutRecord } from "@/lib/soroban";

const EXPLORER_BASE = "https://stellar.expert/explorer/testnet";
const POLL_INTERVAL_MS = 15_000;

interface HistoryTabProps {
  addresses: string[];
  pendingTxHash?: string | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function stroopsToUsdc(stroops: bigint): string {
  const units = stroops / 10_000_000n;
  const frac = stroops % 10_000_000n;
  return `${units}.${frac.toString().padStart(7, "0").replace(/0+$/, "") || "0"}`;
}

function formatTimestamp(unix: number): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── row type ────────────────────────────────────────────────────────────────

interface FlatRow extends PayoutRecord {
  recipient: string;
  rowKey: string;
}

function flattenHistory(
  historyMap: Map<string, PayoutRecord[]>
): FlatRow[] {
  const rows: FlatRow[] = [];
  historyMap.forEach((records, addr) => {
    records.forEach((rec, idx) => {
      rows.push({ ...rec, recipient: addr, rowKey: `${addr}-${idx}` });
    });
  });
  // Most recent first (highest timestamp)
  rows.sort((a, b) => b.timestamp - a.timestamp);
  return rows;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function HistoryTab({
  addresses,
  pendingTxHash,
}: HistoryTabProps) {
  const { historyMap, loading, error, refresh, lastUpdated } =
    usePayoutHistory(addresses, { intervalMs: POLL_INTERVAL_MS });

  const rows = flattenHistory(historyMap);
  const hasData = rows.length > 0;

  return (
    <section className="history-tab" aria-label="Payout history">
      {/* ── header bar ── */}
      <div className="history-header">
        <h2 className="history-title">Payout History</h2>
        <div className="history-meta">
          {lastUpdated && (
            <span className="history-updated">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          <button
            className="secondary-btn history-refresh-btn"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh history"
            title="Refresh now"
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* ── pending tx banner ── */}
      {pendingTxHash && (
        <div className="pending-tx-banner">
          <span className="pending-tx-label">Latest submission</span>
          <a
            className="tx-hash"
            href={`${EXPLORER_BASE}/tx/${pendingTxHash}`}
            target="_blank"
            rel="noreferrer"
            title={pendingTxHash}
          >
            {pendingTxHash.slice(0, 12)}…{pendingTxHash.slice(-8)}
          </a>
          <span className="pending-tx-hint">
            ↻ Status updates automatically every{" "}
            {POLL_INTERVAL_MS / 1000} s
          </span>
        </div>
      )}

      {/* ── error state ── */}
      {error && (
        <p className="history-error" role="alert">
          ⚠ {error}
        </p>
      )}

      {/* ── empty state ── */}
      {!loading && !hasData && !error && (
        <div className="history-empty">
          <p>No payout history yet.</p>
          <p className="history-empty-hint">
            History will appear here after your first batch payout.
          </p>
        </div>
      )}

      {/* ── loading first paint ── */}
      {loading && !hasData && (
        <div className="history-empty">
          <p className="history-loading">Loading history…</p>
        </div>
      )}

      {/* ── history table ── */}
      {hasData && (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Amount (USDC)</th>
                <th>Date</th>
                <th>Status</th>
                <th>Explorer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rowKey}>
                  <td>
                    <a
                      className="explorer-link"
                      href={`${EXPLORER_BASE}/account/${row.recipient}`}
                      target="_blank"
                      rel="noreferrer"
                      title={row.recipient}
                    >
                      {shortAddress(row.recipient)}
                    </a>
                  </td>
                  <td className="history-amount">
                    {stroopsToUsdc(row.amount)}
                  </td>
                  <td className="history-date">
                    {formatTimestamp(row.timestamp)}
                  </td>
                  <td>
                    <TransactionStatus status={row.status} />
                  </td>
                  <td>
                    {/* Link to account page; individual payout records don't
                        carry their own tx hash from the contract. */}
                    <a
                      className="explorer-link"
                      href={`${EXPLORER_BASE}/account/${row.recipient}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
