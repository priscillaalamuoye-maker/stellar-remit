/**
 * Tests for HistoryTab component.
 *
 * usePayoutHistory is mocked so we test the component's rendering logic
 * in isolation without any network or timer dependencies.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import HistoryTab from "@/components/HistoryTab";
import type { PayoutRecord } from "@/lib/soroban";

// ── mock usePayoutHistory ─────────────────────────────────────────────────────

const mockRefresh = jest.fn();

const defaultHookReturn = {
  historyMap: new Map<string, PayoutRecord[]>(),
  loading: false,
  error: null,
  refresh: mockRefresh,
  lastUpdated: null,
};

// Explicit type so overrides can assign string | null and number | null
// without being constrained to the literal null inferred from defaultHookReturn.
interface HookReturnOverride {
  historyMap?: Map<string, PayoutRecord[]>;
  loading?: boolean;
  error?: string | null;
  refresh?: () => void;
  lastUpdated?: number | null;
}

let hookReturnOverride: HookReturnOverride = {};

jest.mock("@/hooks/usePayoutHistory", () => ({
  usePayoutHistory: () => ({ ...defaultHookReturn, ...hookReturnOverride }),
}));

// ── test data ─────────────────────────────────────────────────────────────────

const ADDR_A = "GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";
const ADDR_B = "GXYZ1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";

const RECORD_CONFIRMED: PayoutRecord = {
  amount: 10_000_000n,   // 1.0 USDC
  timestamp: 1_700_000_000,
  status: "Confirmed",
};

const RECORD_PENDING: PayoutRecord = {
  amount: 25_000_000n,   // 2.5 USDC
  timestamp: 1_700_000_100,
  status: "Pending",
};

const RECORD_FAILED: PayoutRecord = {
  amount: 5_500_000n,    // 0.55 USDC
  timestamp: 1_699_999_000,
  status: "Failed",
};

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  hookReturnOverride = {};
  mockRefresh.mockClear();
});

// ── empty / loading states ────────────────────────────────────────────────────

describe("HistoryTab — empty and loading states", () => {
  it("renders the section with aria-label", () => {
    render(<HistoryTab addresses={[]} />);
    expect(
      screen.getByRole("region", { name: /payout history/i })
    ).toBeInTheDocument();
  });

  it("shows empty-state message when there is no data", () => {
    render(<HistoryTab addresses={[]} />);
    expect(screen.getByText(/no payout history yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/history will appear here after your first batch payout/i)
    ).toBeInTheDocument();
  });

  it("shows loading message while first fetch is in progress", () => {
    hookReturnOverride = { loading: true };
    render(<HistoryTab addresses={[ADDR_A]} />);
    expect(screen.getByText(/loading history/i)).toBeInTheDocument();
  });

  it("shows error message when fetch fails", () => {
    hookReturnOverride = { error: "RPC unavailable" };
    render(<HistoryTab addresses={[ADDR_A]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("RPC unavailable");
  });
});

// ── header bar ────────────────────────────────────────────────────────────────

describe("HistoryTab — header", () => {
  it("renders the 'Payout History' heading", () => {
    render(<HistoryTab addresses={[]} />);
    expect(
      screen.getByRole("heading", { name: /payout history/i })
    ).toBeInTheDocument();
  });

  it("shows a refresh button", () => {
    render(<HistoryTab addresses={[]} />);
    expect(
      screen.getByRole("button", { name: /refresh history/i })
    ).toBeInTheDocument();
  });

  it("calls refresh() when the refresh button is clicked", () => {
    render(<HistoryTab addresses={[ADDR_A]} />);
    fireEvent.click(screen.getByRole("button", { name: /refresh history/i }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("disables the refresh button while loading", () => {
    hookReturnOverride = { loading: true };
    render(<HistoryTab addresses={[ADDR_A]} />);
    expect(
      screen.getByRole("button", { name: /refresh history/i })
    ).toBeDisabled();
  });

  it("shows 'Refreshing…' label on the button while loading", () => {
    hookReturnOverride = { loading: true };
    render(<HistoryTab addresses={[ADDR_A]} />);
    expect(screen.getByText(/refreshing…/i)).toBeInTheDocument();
  });

  it("shows lastUpdated time when present", () => {
    const ts = new Date("2024-01-15T10:30:00").getTime();
    hookReturnOverride = { lastUpdated: ts };
    render(<HistoryTab addresses={[ADDR_A]} />);
    // Just check the "Updated" label is rendered; locale formatting varies.
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
  });
});

// ── pending tx banner ─────────────────────────────────────────────────────────

describe("HistoryTab — pending transaction banner", () => {
  const TX_HASH =
    "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  it("does not render banner when pendingTxHash is not provided", () => {
    render(<HistoryTab addresses={[]} />);
    expect(screen.queryByText(/latest submission/i)).not.toBeInTheDocument();
  });

  it("renders banner with truncated hash link when pendingTxHash is provided", () => {
    render(<HistoryTab addresses={[]} pendingTxHash={TX_HASH} />);
    expect(screen.getByText(/latest submission/i)).toBeInTheDocument();
    // The hash link shows first 12 + last 8 chars
    const expectedText = `${TX_HASH.slice(0, 12)}…${TX_HASH.slice(-8)}`;
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it("banner hash link points to stellar.expert explorer", () => {
    render(<HistoryTab addresses={[]} pendingTxHash={TX_HASH} />);
    const link = screen.getByText(`${TX_HASH.slice(0, 12)}…${TX_HASH.slice(-8)}`).closest("a");
    expect(link).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${TX_HASH}`
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("shows auto-refresh hint text in banner", () => {
    render(<HistoryTab addresses={[]} pendingTxHash={TX_HASH} />);
    expect(screen.getByText(/status updates automatically every/i)).toBeInTheDocument();
  });
});

// ── history table ─────────────────────────────────────────────────────────────

describe("HistoryTab — history table", () => {
  it("renders the table with column headers when records exist", () => {
    hookReturnOverride = {
      historyMap: new Map([[ADDR_A, [RECORD_CONFIRMED]]]),
    };
    render(<HistoryTab addresses={[ADDR_A]} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Recipient")).toBeInTheDocument();
    expect(screen.getByText("Amount (USDC)")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Explorer")).toBeInTheDocument();
  });

  it("renders a row for each payout record", () => {
    hookReturnOverride = {
      historyMap: new Map([
        [ADDR_A, [RECORD_CONFIRMED, RECORD_FAILED]],
      ]),
    };
    render(<HistoryTab addresses={[ADDR_A]} />);
    const rows = screen.getAllByRole("row");
    // 1 header row + 2 data rows
    expect(rows).toHaveLength(3);
  });

  it("renders records from multiple addresses", () => {
    hookReturnOverride = {
      historyMap: new Map([
        [ADDR_A, [RECORD_CONFIRMED]],
        [ADDR_B, [RECORD_PENDING]],
      ]),
    };
    render(<HistoryTab addresses={[ADDR_A, ADDR_B]} />);
    const rows = screen.getAllByRole("row");
    // 1 header + 2 data rows
    expect(rows).toHaveLength(3);
  });

  it("displays amount as USDC decimal string", () => {
    hookReturnOverride = {
      historyMap: new Map([[ADDR_A, [RECORD_CONFIRMED]]]),
    };
    render(<HistoryTab addresses={[ADDR_A]} />);
    // RECORD_CONFIRMED.amount = 10_000_000 stroops = 1.0 USDC
    expect(screen.getByText("1.0")).toBeInTheDocument();
  });

  it("renders Confirmed status badge", () => {
    hookReturnOverride = {
      historyMap: new Map([[ADDR_A, [RECORD_CONFIRMED]]]),
    };
    render(<HistoryTab addresses={[ADDR_A]} />);
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByLabelText("Status: Confirmed")).toHaveClass(
      "status-badge--confirmed"
    );
  });

  it("renders Pending status badge", () => {
    hookReturnOverride = {
      historyMap: new Map([[ADDR_A, [RECORD_PENDING]]]),
    };
    render(<HistoryTab addresses={[ADDR_A]} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByLabelText("Status: Pending")).toHaveClass(
      "status-badge--pending"
    );
  });

  it("renders Failed status badge", () => {
    hookReturnOverride = {
      historyMap: new Map([[ADDR_A, [RECORD_FAILED]]]),
    };
    render(<HistoryTab addresses={[ADDR_A]} />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByLabelText("Status: Failed")).toHaveClass(
      "status-badge--failed"
    );
  });

  it("shows recipient as shortened address link to explorer", () => {
    hookReturnOverride = {
      historyMap: new Map([[ADDR_A, [RECORD_CONFIRMED]]]),
    };
    render(<HistoryTab addresses={[ADDR_A]} />);
    const shortAddr = `${ADDR_A.slice(0, 6)}…${ADDR_A.slice(-4)}`;
    const recipientLink = screen.getAllByText(shortAddr)[0].closest("a");
    expect(recipientLink).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/account/${ADDR_A}`
    );
  });

  it("sorts rows most-recent first", () => {
    // RECORD_PENDING has timestamp 1_700_000_100 (newer)
    // RECORD_CONFIRMED has timestamp 1_700_000_000 (older)
    hookReturnOverride = {
      historyMap: new Map([
        [ADDR_A, [RECORD_CONFIRMED, RECORD_PENDING]],
      ]),
    };
    render(<HistoryTab addresses={[ADDR_A]} />);
    const statusBadges = screen.getAllByRole("generic", { hidden: false }).filter(
      (el) => el.classList.contains("status-badge")
    );
    // Most-recent (Pending, ts=1_700_000_100) should come before
    // Confirmed (ts=1_700_000_000)
    expect(statusBadges[0]).toHaveClass("status-badge--pending");
    expect(statusBadges[1]).toHaveClass("status-badge--confirmed");
  });

  it("shows '—' for zero timestamp", () => {
    const recordNoTs: PayoutRecord = {
      amount: 1_000_000n,
      timestamp: 0,
      status: "Pending",
    };
    hookReturnOverride = {
      historyMap: new Map([[ADDR_A, [recordNoTs]]]),
    };
    render(<HistoryTab addresses={[ADDR_A]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("does not render table when historyMap is empty", () => {
    render(<HistoryTab addresses={[]} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

// ── combined: error + data shown together ─────────────────────────────────────

describe("HistoryTab — error with stale data", () => {
  it("shows both error and table when previous data exists and a new fetch fails", () => {
    hookReturnOverride = {
      historyMap: new Map([[ADDR_A, [RECORD_CONFIRMED]]]),
      error: "Network timeout",
    };
    render(<HistoryTab addresses={[ADDR_A]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Network timeout");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
