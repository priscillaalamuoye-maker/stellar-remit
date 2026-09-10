/**
 * Tests for AnalyticsTab component.
 * useAnalytics is NOT mocked — we test the component's rendering
 * by feeding it real historyMap data and asserting on visible output.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import AnalyticsTab from "@/components/AnalyticsTab";
import type { PayoutRecord } from "@/lib/soroban";

// ── fixtures ──────────────────────────────────────────────────────────────────

const ADDR_A = "GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";
const ADDR_B = "GXYZ1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";

const USDC = (n: number) => BigInt(Math.round(n * 10_000_000));
const NOW_SEC = Math.floor(Date.now() / 1000);

function rec(
  amount: bigint,
  status: PayoutRecord["status"],
  timestamp = NOW_SEC
): PayoutRecord {
  return { amount, status, timestamp };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("AnalyticsTab — empty state", () => {
  it("renders section with accessible label", () => {
    render(<AnalyticsTab historyMap={new Map()} />);
    expect(
      screen.getByRole("region", { name: /payout analytics/i })
    ).toBeInTheDocument();
  });

  it("shows Analytics heading", () => {
    render(<AnalyticsTab historyMap={new Map()} />);
    expect(
      screen.getByRole("heading", { name: /analytics/i })
    ).toBeInTheDocument();
  });

  it("shows empty-state message when historyMap is empty", () => {
    render(<AnalyticsTab historyMap={new Map()} />);
    expect(screen.getByText(/no payout data yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/analytics will populate after your first batch payout/i)
    ).toBeInTheDocument();
  });

  it("does not render stat cards when empty", () => {
    render(<AnalyticsTab historyMap={new Map()} />);
    expect(screen.queryByLabelText(/total volume/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("AnalyticsTab — stat cards", () => {
  const map = new Map<string, PayoutRecord[]>([
    [
      ADDR_A,
      [
        rec(USDC(10), "Confirmed"),
        rec(USDC(5), "Confirmed"),
        rec(USDC(2), "Failed"),
        rec(USDC(3), "Pending"),
      ],
    ],
  ]);

  it("renders Total Volume card", () => {
    render(<AnalyticsTab historyMap={map} />);
    expect(screen.getByLabelText(/total volume/i)).toBeInTheDocument();
    // 10 + 5 + 2 + 3 = 20 USDC
    expect(screen.getByLabelText(/total volume/i)).toHaveTextContent("20.00");
  });

  it("renders Success Rate card", () => {
    render(<AnalyticsTab historyMap={map} />);
    // 2 confirmed / (2 confirmed + 1 failed) ≈ 66.7%
    const card = screen.getByLabelText(/success rate/i);
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("%");
  });

  it("renders Avg Settlement card", () => {
    render(<AnalyticsTab historyMap={map} />);
    expect(screen.getByLabelText(/avg settlement/i)).toBeInTheDocument();
    // (10 + 5) / 2 = 7.5 USDC
    expect(screen.getByLabelText(/avg settlement/i)).toHaveTextContent("7.50");
  });

  it("renders Pending card with pending count", () => {
    render(<AnalyticsTab historyMap={map} />);
    const card = screen.getByLabelText(/pending/i);
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("1");
  });

  it("shows '—' for success rate when only pending records", () => {
    const onlyPending = new Map([[ADDR_A, [rec(USDC(5), "Pending")]]]);
    render(<AnalyticsTab historyMap={onlyPending} />);
    expect(screen.getByLabelText(/success rate/i)).toHaveTextContent("—");
  });

  it("shows '—' for avg settlement when no confirmed records", () => {
    const onlyFailed = new Map([[ADDR_A, [rec(USDC(5), "Failed")]]]);
    render(<AnalyticsTab historyMap={onlyFailed} />);
    expect(screen.getByLabelText(/avg settlement/i)).toHaveTextContent("—");
  });

  it("shows payout count in total volume sub-line", () => {
    render(<AnalyticsTab historyMap={map} />);
    expect(screen.getByLabelText(/total volume/i)).toHaveTextContent("4 payouts");
  });

  it("shows singular 'payout' for single record", () => {
    const single = new Map([[ADDR_A, [rec(USDC(5), "Confirmed")]]]);
    render(<AnalyticsTab historyMap={single} />);
    expect(screen.getByLabelText(/total volume/i)).toHaveTextContent("1 payout");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("AnalyticsTab — trend chart", () => {
  it("renders the trend chart figure", () => {
    const map = new Map([[ADDR_A, [rec(USDC(10), "Confirmed")]]]);
    render(<AnalyticsTab historyMap={map} />);
    expect(
      screen.getByRole("figure", { name: /daily volume trend/i })
    ).toBeInTheDocument();
  });

  it("renders Volume Trend section heading", () => {
    const map = new Map([[ADDR_A, [rec(USDC(10), "Confirmed")]]]);
    render(<AnalyticsTab historyMap={map} />);
    expect(screen.getByText(/volume trend/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("AnalyticsTab — top recipients table", () => {
  const map = new Map<string, PayoutRecord[]>([
    [ADDR_A, [rec(USDC(100), "Confirmed")]],
    [ADDR_B, [rec(USDC(50), "Confirmed")]],
  ]);

  it("renders Top Recipients section heading", () => {
    render(<AnalyticsTab historyMap={map} />);
    expect(screen.getByText(/top recipients/i)).toBeInTheDocument();
  });

  it("renders a table with correct columns", () => {
    render(<AnalyticsTab historyMap={map} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("#")).toBeInTheDocument();
    expect(screen.getByText("Address")).toBeInTheDocument();
    expect(screen.getByText("Total (USDC)")).toBeInTheDocument();
    expect(screen.getByText("Payouts")).toBeInTheDocument();
  });

  it("renders a row for each recipient", () => {
    render(<AnalyticsTab historyMap={map} />);
    const rows = screen.getAllByRole("row");
    // 1 header + 2 data rows
    expect(rows).toHaveLength(3);
  });

  it("highest-volume recipient appears first (rank 1)", () => {
    render(<AnalyticsTab historyMap={map} />);
    const rows = screen.getAllByRole("row");
    // ADDR_A has 100 USDC; ADDR_B has 50 USDC — A should be first data row
    const shortA = `${ADDR_A.slice(0, 6)}…${ADDR_A.slice(-4)}`;
    expect(rows[1]).toHaveTextContent(shortA);
  });

  it("renders explorer link for each recipient", () => {
    render(<AnalyticsTab historyMap={map} />);
    const shortA = `${ADDR_A.slice(0, 6)}…${ADDR_A.slice(-4)}`;
    const link = screen.getByText(shortA).closest("a");
    expect(link).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/account/${ADDR_A}`
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("does not render top recipients section when map is empty", () => {
    render(<AnalyticsTab historyMap={new Map()} />);
    expect(screen.queryByText(/top recipients/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("AnalyticsTab — large volume formatting", () => {
  it("formats volumes ≥ 1000 with K suffix", () => {
    const map = new Map([[ADDR_A, [rec(USDC(1500), "Confirmed")]]]);
    render(<AnalyticsTab historyMap={map} />);
    expect(screen.getByLabelText(/total volume/i)).toHaveTextContent("1.50K");
  });

  it("formats volumes ≥ 1 000 000 with M suffix", () => {
    const map = new Map([[ADDR_A, [rec(USDC(2_500_000), "Confirmed")]]]);
    render(<AnalyticsTab historyMap={map} />);
    expect(screen.getByLabelText(/total volume/i)).toHaveTextContent("2.50M");
  });
});
