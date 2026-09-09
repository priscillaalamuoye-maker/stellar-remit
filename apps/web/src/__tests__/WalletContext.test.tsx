/**
 * Tests for WalletContext — connect/disconnect state management.
 * Freighter API calls are mocked.
 */

import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// ── mock Freighter API ────────────────────────────────────────────────────────
const mockIsConnected = jest.fn();
const mockIsAllowed = jest.fn();
const mockGetAddress = jest.fn();
const mockRequestAccess = jest.fn();

jest.mock("@stellar/freighter-api", () => ({
  isConnected: () => mockIsConnected(),
  isAllowed: () => mockIsAllowed(),
  getAddress: () => mockGetAddress(),
  requestAccess: () => mockRequestAccess(),
}));

// ── import after mocks ────────────────────────────────────────────────────────
import { WalletProvider, useWallet } from "@/context/WalletContext";

// A simple consumer component to read wallet state.
function TestConsumer() {
  const { address, isConnected, connecting, connect, disconnect } = useWallet();
  return (
    <div>
      <span data-testid="address">{address ?? "none"}</span>
      <span data-testid="connected">{String(isConnected)}</span>
      <span data-testid="connecting">{String(connecting)}</span>
      <button onClick={connect}>Connect</button>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <WalletProvider>
      <TestConsumer />
    </WalletProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: extension absent / not yet connected
  mockIsConnected.mockResolvedValue({ isConnected: false });
  mockIsAllowed.mockResolvedValue({ isAllowed: false });
  mockGetAddress.mockResolvedValue({ address: "" });
  mockRequestAccess.mockResolvedValue({ address: "" });
});

describe("WalletProvider", () => {
  it("starts disconnected with no address", async () => {
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent("none");
      expect(screen.getByTestId("connected")).toHaveTextContent("false");
    });
  });

  it("restores address on mount when already allowed", async () => {
    const addr = "GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";
    mockIsConnected.mockResolvedValue({ isConnected: true });
    mockIsAllowed.mockResolvedValue({ isAllowed: true });
    mockGetAddress.mockResolvedValue({ address: addr });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent(addr);
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });
  });

  it("sets address after successful connect", async () => {
    const addr = "GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";
    mockIsConnected.mockResolvedValue({ isConnected: true });
    mockRequestAccess.mockResolvedValue({ address: addr });

    renderWithProvider();
    await act(async () => {
      userEvent.click(screen.getByText("Connect"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent(addr);
      expect(screen.getByTestId("connected")).toHaveTextContent("true");
    });
  });

  it("throws when Freighter extension is not installed", async () => {
    mockIsConnected.mockResolvedValue({ isConnected: false });

    // Wrap in try/catch since useWallet.connect() throws
    let thrown = false;
    function ThrowingConsumer() {
      const { connect } = useWallet();
      return (
        <button
          onClick={async () => {
            try {
              await connect();
            } catch {
              thrown = true;
            }
          }}
        >
          Connect
        </button>
      );
    }

    render(
      <WalletProvider>
        <ThrowingConsumer />
      </WalletProvider>
    );

    await act(async () => {
      userEvent.click(screen.getByText("Connect"));
    });

    await waitFor(() => {
      expect(thrown).toBe(true);
    });
  });

  it("clears address on disconnect", async () => {
    const addr = "GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678";
    mockIsConnected.mockResolvedValue({ isConnected: true });
    mockRequestAccess.mockResolvedValue({ address: addr });

    renderWithProvider();

    // Connect first
    await act(async () => {
      userEvent.click(screen.getByText("Connect"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("connected")).toHaveTextContent("true")
    );

    // Then disconnect
    await act(async () => {
      userEvent.click(screen.getByText("Disconnect"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent("none");
      expect(screen.getByTestId("connected")).toHaveTextContent("false");
    });
  });
});
