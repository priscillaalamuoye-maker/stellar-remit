/**
 * TransactionStatus — renders a coloured status badge for a single
 * off-ramp payout record.
 *
 * Pending   → amber pill
 * Confirmed → green pill
 * Failed    → red pill
 */

import type { OffRampStatus } from "@/lib/soroban";

interface TransactionStatusProps {
  status: OffRampStatus;
}

const LABELS: Record<OffRampStatus, string> = {
  Pending: "Pending",
  Confirmed: "Confirmed",
  Failed: "Failed",
};

export default function TransactionStatus({ status }: TransactionStatusProps) {
  return (
    <span
      className={`status-badge status-badge--${status.toLowerCase()}`}
      aria-label={`Status: ${LABELS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
