"use client";

import { useState, useCallback, useMemo } from "react";
import { useWallet } from "@/context/WalletContext";
import HistoryTab from "@/components/HistoryTab";
import {
  estimateBatchFee,
  invokeBatchPayout,
  usdcToStroops,
  WalletAuthError,
  type FeeEstimate,
} from "@/lib/soroban";

type Recipient = {
  address: string;
  amount: string;
  offRampRef: string;
};

type Tab = "payout" | "history";
type StatusKind =
  | "idle"
  | "estimating"
  | "submitting"
  | "success"
  | "error"
  | "auth-error";

interface TxResult {
  txHash: string;
  status: string;
}

function validateRecipients(recipients: Recipient[]): string | null {
  if (recipients.length === 0) return "Add at least one recipient.";
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    if (!r.address.trim().startsWith("G") || r.address.trim().length < 56) {
      return `Row ${i + 1}: invalid Stellar address (must start with G, 56 chars).`;
    }
    const amt = Number(r.amount);
    if (!r.amount || isNaN(amt) || amt <= 0) {
      return `Row ${i + 1}: amount must be a positive number.`;
    }
  }
  return null;
}

function stroopsToDisplay(stroops: bigint): string {
  const units = stroops / 10_000_000n;
  const frac = stroops % 10_000_000n;
  return `${units}.${frac.toString().padStart(7, "0").replace(/0+$/, "") || "0"}`;
}

export default function Dashboard() {
  const { address, isConnected, connect, connecting } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>("payout");
  const [recipients, setRecipients] = useState<Recipient[]>([
    { address: "", amount: "", offRampRef: "" },
  ]);
  const [statusKind, setStatusKind] = useState<StatusKind>("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const [txResult, setTxResult] = useState<TxResult | null>(null);
  const [knownAddresses, setKnownAddresses] = useState<string[]>([]);

  function updateRecipient(index: number, field: keyof Recipient, value: string) {
    setRecipients((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
    setFeeEstimate(null);
  }

  function addRow() {
    setRecipients((prev) => [...prev, { address: "", amount: "", offRampRef: "" }]);
    setFeeEstimate(null);
  }

  function removeRow(index: number) {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
    setFeeEstimate(null);
  }

  const handleEstimateFee = useCallback(async () => {
    if (!address) return;
    const err = validateRecipients(recipients);
    if (err) {
      setStatusKind("error");
      setStatusMsg(err);
      return;
    }
    setStatusKind("estimating");
    setStatusMsg("Estimating transaction fee…");
    setFeeEstimate(null);
    try {
      const estimate = await estimateBatchFee(
        address,
        recipients.map((r) => ({ address: r.address.trim(), amount: usdcToStroops(r.amount) }))
      );
      setFeeEstimate(estimate);
      setStatusKind("idle");
      setStatusMsg(null);
    } catch (e) {
      setStatusKind("error");
      setStatusMsg(e instanceof Error ? e.message : "Fee estimation failed.");
    }
  }, [address, recipients]);

  async function submitBatch() {
    if (!address) {
      setStatusKind("error");
      setStatusMsg("Connect your Freighter wallet before submitting.");
      return;
    }
    const err = validateRecipients(recipients);
    if (err) {
      setStatusKind("error");
      setStatusMsg(err);
      return;
    }

    setStatusKind("submitting");
    setStatusMsg("Waiting for Freighter signature…");
    setTxResult(null);

    try {
      const payoutRecipients = recipients.map((r) => ({
        address: r.address.trim(),
        amount: usdcToStroops(r.amount),
      }));
      const result = await invokeBatchPayout(address, payoutRecipients);

      setTxResult(result);
      setStatusKind("success");
      setStatusMsg(`Batch of ${recipients.length} recipient(s) settled on-chain.`);
      setKnownAddresses((prev) => {
        const next = new Set([...prev, ...recipients.map((r) => r.address.trim())]);
        return [...next];
      });
    } catch (e) {
      if (e instanceof WalletAuthError) {
        setStatusKind("auth-error");
        setStatusMsg(e.message);
      } else {
        setStatusKind("error");
        setStatusMsg(e instanceof Error ? e.message : "Batch payout failed.");
      }
    }
  }

  const total = recipients.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const isBusy = statusKind === "estimating" || statusKind === "submitting" || connecting;
  const canSubmit = isConnected && !isBusy;
  const historyAddresses = useMemo(() => {
    const fromForm = recipients
      .map((r) => r.address.trim())
      .filter((a) => a.startsWith("G") && a.length >= 56);
    return [...new Set([...knownAddresses, ...fromForm])];
  }, [recipients, knownAddresses]);

  return (
    <section className="dashboard">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Operations workspace</p>
          <h1>Batch payouts</h1>
          <p className="subtitle">Settle payroll and vendor invoices on Stellar, then hand off to your local NGN off-ramp partner.</p>
        </div>
        <div className="dashboard-network"><span /> Stellar testnet</div>
      </div>

      <div className="tab-bar" role="tablist">
        <button role="tab" aria-selected={activeTab === "payout"} className={`tab-btn${activeTab === "payout" ? " tab-btn--active" : ""}`} onClick={() => setActiveTab("payout")}>Batch Payout</button>
        <button role="tab" aria-selected={activeTab === "history"} className={`tab-btn${activeTab === "history" ? " tab-btn--active" : ""}`} onClick={() => setActiveTab("history")}>History{knownAddresses.length > 0 && <span className="tab-badge">{knownAddresses.length}</span>}</button>
      </div>

      {activeTab === "payout" && (
        <div role="tabpanel" aria-label="Batch Payout">
          {!isConnected && <div className="wallet-gate"><p>Connect your Freighter wallet to submit payouts.</p><button className="primary-btn" onClick={connect} disabled={connecting}>{connecting ? "Connecting…" : "Connect Wallet"}</button></div>}
          <table className="payout-table"><thead><tr><th>Stellar Address</th><th>Amount (USDC)</th><th>Off-ramp reference</th><th /></tr></thead><tbody>{recipients.map((r, i) => <tr key={i}><td><input value={r.address} onChange={(e) => updateRecipient(i, "address", e.target.value)} placeholder="G…" disabled={isBusy} /></td><td><input value={r.amount} onChange={(e) => updateRecipient(i, "amount", e.target.value)} placeholder="0.00" inputMode="decimal" disabled={isBusy} /></td><td><input value={r.offRampRef} onChange={(e) => updateRecipient(i, "offRampRef", e.target.value)} placeholder="bank/mobile-money handle" disabled={isBusy} /></td><td><button className="link-btn" onClick={() => removeRow(i)} disabled={isBusy || recipients.length === 1}>Remove</button></td></tr>)}</tbody></table>
          <div className="dashboard-actions"><button className="secondary-btn" onClick={addRow} disabled={isBusy}>+ Add recipient</button><div className="total">Total: {total.toFixed(2)} USDC</div>{isConnected && <button className="secondary-btn" onClick={handleEstimateFee} disabled={isBusy}>{statusKind === "estimating" ? "Estimating…" : "Estimate fee"}</button>}<button className="primary-btn" onClick={submitBatch} disabled={!canSubmit} title={!isConnected ? "Connect wallet first" : undefined}>{statusKind === "submitting" ? "Submitting…" : "Submit batch payout"}</button></div>
          {feeEstimate && <div className="fee-estimate"><span className="fee-label">Estimated fee</span><span className="fee-value">{stroopsToDisplay(feeEstimate.totalFee)} XLM<span className="fee-breakdown"> ({stroopsToDisplay(feeEstimate.baseFee)} base + {stroopsToDisplay(feeEstimate.resourceFee)} resource)</span></span></div>}
          {statusMsg && <div className={`status-line status-line--${statusKind}`} role="status" aria-live="polite">{statusKind === "auth-error" && <span className="status-icon">🔐 </span>}{statusKind === "error" && <span className="status-icon">⚠ </span>}{statusKind === "success" && <span className="status-icon">✓ </span>}{statusMsg}</div>}
          {txResult && <div className="tx-result"><span className="tx-label">Transaction hash</span><a className="tx-hash" href={`https://stellar.expert/explorer/testnet/tx/${txResult.txHash}`} target="_blank" rel="noreferrer" title={txResult.txHash}>{txResult.txHash.slice(0, 12)}…{txResult.txHash.slice(-8)}</a><span className="tx-copy-btn" role="button" tabIndex={0} title="Copy full hash" onClick={() => navigator.clipboard.writeText(txResult.txHash)} onKeyDown={(e) => e.key === "Enter" && navigator.clipboard.writeText(txResult.txHash)}>Copy</span><button className="secondary-btn" style={{ marginLeft: "auto", fontSize: "0.8rem", padding: "0.25rem 0.6rem" }} onClick={() => setActiveTab("history")}>View in History →</button></div>}
        </div>
      )}

      {activeTab === "history" && <div role="tabpanel" aria-label="Payout History">{!isConnected && <div className="wallet-gate"><p>Connect your wallet to load payout history.</p><button className="primary-btn" onClick={connect} disabled={connecting}>{connecting ? "Connecting…" : "Connect Wallet"}</button></div>}{isConnected && <HistoryTab addresses={historyAddresses} pendingTxHash={txResult?.txHash} />}</div>}
    </section>
  );
}
