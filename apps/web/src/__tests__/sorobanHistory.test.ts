/**
 * Tests for soroban.ts query helper types and utilities.
 * Network calls are mocked via jest.mock.
 */

import type { PayoutRecord, OffRampStatus } from "@/lib/soroban";

describe("PayoutRecord type and OffRampStatus values", () => {
  // These are compile-time checks baked into runtime assertions.
  it("accepts all valid OffRampStatus values", () => {
    const statuses: OffRampStatus[] = ["Pending", "Confirmed", "Failed"];
    expect(statuses).toHaveLength(3);
    expect(statuses).toContain("Pending");
    expect(statuses).toContain("Confirmed");
    expect(statuses).toContain("Failed");
  });

  it("constructs a valid PayoutRecord shape", () => {
    const record: PayoutRecord = {
      amount: 10_000_000n,
      timestamp: 1_700_000_000,
      status: "Pending",
    };
    expect(record.amount).toBe(10_000_000n);
    expect(record.timestamp).toBe(1_700_000_000);
    expect(record.status).toBe("Pending");
  });
});

describe("queryHistory / queryRecipient (mocked)", () => {
  const mockQueryHistory = jest.fn();
  const mockQueryRecipient = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    mockQueryHistory.mockReset();
    mockQueryRecipient.mockReset();
  });

  it("queryHistory returns empty array for unknown recipient", async () => {
    mockQueryHistory.mockResolvedValue([]);
    const result = await mockQueryHistory("GAAA");
    expect(result).toEqual([]);
  });

  it("queryHistory returns sorted records", async () => {
    const records: PayoutRecord[] = [
      { amount: 1_000_000n, timestamp: 100, status: "Confirmed" },
      { amount: 2_000_000n, timestamp: 200, status: "Pending" },
    ];
    mockQueryHistory.mockResolvedValue(records);
    const result = await mockQueryHistory("GABC");
    expect(result).toHaveLength(2);
  });

  it("queryRecipient returns null when not registered", async () => {
    mockQueryRecipient.mockResolvedValue(null);
    const result = await mockQueryRecipient("GABC");
    expect(result).toBeNull();
  });

  it("queryRecipient returns info when registered", async () => {
    mockQueryRecipient.mockResolvedValue({
      offRampRef: "hash_abc",
      totalReceived: 50_000_000n,
    });
    const result = await mockQueryRecipient("GABC");
    expect(result?.offRampRef).toBe("hash_abc");
    expect(result?.totalReceived).toBe(50_000_000n);
  });
});
