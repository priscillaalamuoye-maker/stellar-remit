"use client";

import { useState } from "react";

type Recipient = {
  address: string;
  amount: string;
  offRampRef: string;
};

export default function Dashboard() {
  const [recipients, setRecipients] = useState<Recipient[]>([
    { address: "", amount: "", offRampRef: "" },
  ]);
  const [status, setStatus] = useState<string | null>(null);

  function updateRecipient(index: number, field: keyof Recipient, value: string) {
    setRecipients((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  function addRow() {
    setRecipients((prev) => [...prev, { address: "", amount: "", offRampRef: "" }]);
  }

  function removeRow(index: number) {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  }

  async function submitBatch() {
    setStatus("Submitting batch payout to testnet…");
    try {
      // Wire this to your Soroban invocation (via @stellar/stellar-sdk +
      // freighter or a server-side signer). Left as a stub so the UI can
      // be demoed before the signing flow is finished.
      await new Promise((res) => setTimeout(res, 800));
      setStatus(
        `Simulated: batch of ${recipients.length} recipient(s) queued for on-chain settlement.`
      );
    } catch (err) {
      setStatus("Batch payout failed. Check console for details.");
      console.error(err);
    }
  }

  const total = recipients.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  return (
    <section className="dashboard">
      <h1>Batch Payout</h1>
      <p className="subtitle">
        Send a single on-chain transaction that settles multiple recipients,
        each linked to a local NGN off-ramp reference.
      </p>

      <table className="payout-table">
        <thead>
          <tr>
            <th>Stellar Address</th>
            <th>Amount (USDC)</th>
            <th>Off-ramp reference</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((r, i) => (
            <tr key={i}>
              <td>
                <input
                  value={r.address}
                  onChange={(e) => updateRecipient(i, "address", e.target.value)}
                  placeholder="G..."
                />
              </td>
              <td>
                <input
                  value={r.amount}
                  onChange={(e) => updateRecipient(i, "amount", e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </td>
              <td>
                <input
                  value={r.offRampRef}
                  onChange={(e) => updateRecipient(i, "offRampRef", e.target.value)}
                  placeholder="bank/mobile-money handle"
                />
              </td>
              <td>
                <button className="link-btn" onClick={() => removeRow(i)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="dashboard-actions">
        <button className="secondary-btn" onClick={addRow}>
          + Add recipient
        </button>
        <div className="total">Total: {total.toFixed(2)} USDC</div>
        <button className="primary-btn" onClick={submitBatch}>
          Submit batch payout
        </button>
      </div>

      {status && <p className="status-line">{status}</p>}
    </section>
  );
}
