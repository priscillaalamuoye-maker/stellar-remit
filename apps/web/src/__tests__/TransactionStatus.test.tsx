/**
 * Tests for TransactionStatus badge component.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import TransactionStatus from "@/components/TransactionStatus";

describe("TransactionStatus", () => {
  it("renders Pending badge with correct class", () => {
    render(<TransactionStatus status="Pending" />);
    const badge = screen.getByText("Pending");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("status-badge--pending");
  });

  it("renders Confirmed badge with correct class", () => {
    render(<TransactionStatus status="Confirmed" />);
    const badge = screen.getByText("Confirmed");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("status-badge--confirmed");
  });

  it("renders Failed badge with correct class", () => {
    render(<TransactionStatus status="Failed" />);
    const badge = screen.getByText("Failed");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("status-badge--failed");
  });

  it("has an accessible aria-label for each status", () => {
    const { rerender } = render(<TransactionStatus status="Pending" />);
    expect(screen.getByLabelText("Status: Pending")).toBeInTheDocument();

    rerender(<TransactionStatus status="Confirmed" />);
    expect(screen.getByLabelText("Status: Confirmed")).toBeInTheDocument();

    rerender(<TransactionStatus status="Failed" />);
    expect(screen.getByLabelText("Status: Failed")).toBeInTheDocument();
  });
});
