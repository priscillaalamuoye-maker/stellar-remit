/**
 * soroban.ts — helpers for the batch_payout Soroban contract.
 *
 * Flow for a signed user transaction:
 *  1. Build the raw Soroban operation (buildBatchPayoutTx)
 *  2. simulateBatchPayout → get fee + footprint, return simulation response
 *  3. assembleTransaction → apply the simulation result
 *  4. Sign with Freighter (signTransaction from @stellar/freighter-api)
 *  5. submitBatchPayout → submit and poll until success/failure
 */

import {
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
  rpc as SorobanRpc,
  Transaction,
} from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";

// ─── environment ────────────────────────────────────────────────────────────

const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
  "https://soroban-testnet.stellar.org";

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? Networks.TESTNET;

const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";

// ─── types ──────────────────────────────────────────────────────────────────

export interface PayoutRecipient {
  address: string; // Stellar public key (G…)
  amount: bigint; // in stroops (1 USDC = 10_000_000 stroops at 7dp)
}

export interface FeeEstimate {
  /** Inclusive resource fee from simulation, in stroops. */
  resourceFee: bigint;
  /** Classic network base fee (100 stroops * operations). */
  baseFee: bigint;
  /** Total recommended fee to attach to the transaction. */
  totalFee: bigint;
}

export interface SubmitResult {
  txHash: string;
  status: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Convert a decimal USDC string ("12.50") to stroops (bigint, 7dp). */
export function usdcToStroops(usdc: string): bigint {
  const [int = "0", frac = ""] = usdc.split(".");
  const fracPadded = frac.padEnd(7, "0").slice(0, 7);
  return BigInt(int) * 10_000_000n + BigInt(fracPadded);
}

function buildServer(): SorobanRpc.Server {
  return new SorobanRpc.Server(RPC_URL, {
    allowHttp: RPC_URL.startsWith("http://"),
  });
}

/**
 * Build (but do not sign or submit) a batch_payout transaction.
 */
async function buildBatchPayoutTx(
  adminAddress: string,
  recipients: PayoutRecipient[]
): Promise<Transaction> {
  const server = buildServer();
  const account = await server.getAccount(adminAddress);

  const contract = new Contract(CONTRACT_ID);

  // Vec<Address>
  const recipientScVals = recipients.map((r) =>
    nativeToScVal(Address.fromString(r.address), { type: "address" })
  );
  const recipientsVec = xdr.ScVal.scvVec(recipientScVals);

  // Vec<i128>
  const amountScVals = recipients.map((r) =>
    nativeToScVal(r.amount, { type: "i128" })
  );
  const amountsVec = xdr.ScVal.scvVec(amountScVals);

  // admin Address arg
  const adminScVal = nativeToScVal(Address.fromString(adminAddress), {
    type: "address",
  });

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call("batch_payout", adminScVal, recipientsVec, amountsVec)
    )
    .setTimeout(180)
    .build();

  return tx;
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Simulate the batch_payout call and return a fee estimate.
 * Does NOT require a signature — safe to call before the user confirms.
 */
export async function estimateBatchFee(
  adminAddress: string,
  recipients: PayoutRecipient[]
): Promise<FeeEstimate> {
  const server = buildServer();
  const tx = await buildBatchPayoutTx(adminAddress, recipients);
  const sim = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(
      `Simulation failed: ${classifyContractError((sim as SorobanRpc.Api.SimulateTransactionErrorResponse).error)}`
    );
  }

  const successSim = sim as SorobanRpc.Api.SimulateTransactionSuccessResponse;
  const resourceFee = BigInt(successSim.minResourceFee ?? "0");
  const baseFee = BigInt(BASE_FEE);
  return {
    resourceFee,
    baseFee,
    totalFee: resourceFee + baseFee,
  };
}

/**
 * Build, simulate, sign (via Freighter), and submit a batch_payout.
 * Polls until the transaction is confirmed or fails.
 *
 * @throws WalletAuthError if the user rejects in Freighter.
 * @throws Error for contract errors or network failures.
 */
export async function invokeBatchPayout(
  adminAddress: string,
  recipients: PayoutRecipient[]
): Promise<SubmitResult> {
  const server = buildServer();

  // 1. Build raw tx
  const tx = await buildBatchPayoutTx(adminAddress, recipients);

  // 2. Simulate to get resource footprint
  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    const raw = (sim as SorobanRpc.Api.SimulateTransactionErrorResponse).error;
    throw new Error(classifyContractError(raw));
  }

  // 3. Assemble (apply footprint + fee from simulation)
  const assembled = SorobanRpc.assembleTransaction(
    tx,
    sim as SorobanRpc.Api.SimulateTransactionSuccessResponse
  ).build();

  // 4. Sign with Freighter
  const { signedTxXdr, error: signError } = await signTransaction(
    assembled.toXDR(),
    { networkPassphrase: NETWORK_PASSPHRASE, address: adminAddress }
  );
  if (signError) {
    // User rejected or extension error — surface with distinct error type.
    throw new WalletAuthError(signError.message ?? "Transaction was rejected.");
  }

  // 5. Submit
  const signedTx = new Transaction(signedTxXdr, NETWORK_PASSPHRASE);
  const sendResp = await server.sendTransaction(signedTx);
  if (sendResp.status === "ERROR") {
    const xdrB64 = sendResp.errorResult?.result().toXDR("base64") ?? "unknown";
    throw new Error(`Transaction submission failed: ${xdrB64}`);
  }

  // 6. Poll until ledger closes (~5 s) or 60 s timeout
  let getResp = await server.getTransaction(sendResp.hash);
  const deadline = Date.now() + 60_000;
  while (
    getResp.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 2_000));
    getResp = await server.getTransaction(sendResp.hash);
  }

  if (getResp.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(
      `Transaction failed on-chain. Hash: ${sendResp.hash} — check the explorer for details.`
    );
  }
  if (getResp.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
    throw new Error(
      `Transaction not confirmed within 60 s. Hash: ${sendResp.hash}`
    );
  }

  return { txHash: sendResp.hash, status: getResp.status };
}

// ─── read-only queries ───────────────────────────────────────────────────────

/**
 * Off-ramp status values mirroring the contract's OffRampStatus enum.
 * Order matches the Soroban discriminant: 0 = Pending, 1 = Confirmed, 2 = Failed.
 */
export type OffRampStatus = "Pending" | "Confirmed" | "Failed";

/** Decoded PayoutRecord as returned by get_history(). */
export interface PayoutRecord {
  amount: bigint;      // in stroops
  timestamp: number;   // Unix seconds
  status: OffRampStatus;
}

/** Decoded RecipientInfo as returned by get_recipient(). */
export interface RecipientInfo {
  offRampRef: string;
  totalReceived: bigint; // in stroops
}

/**
 * Query the on-chain payout history for a given recipient address.
 * Read-only — no auth or signing required.
 *
 * Returns an empty array if the recipient has no history or is not registered.
 */
export async function queryHistory(
  recipientAddress: string
): Promise<PayoutRecord[]> {
  const server = buildServer();
  const contract = new Contract(CONTRACT_ID);

  // Build a simulation-only tx from a throw-away account placeholder.
  // For view calls we still need a valid account, so we use the recipient.
  const account = await server.getAccount(recipientAddress).catch(() => null);
  if (!account) return [];

  const recipientScVal = nativeToScVal(
    Address.fromString(recipientAddress),
    { type: "address" }
  );

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("get_history", recipientScVal))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) return [];

  const successSim = sim as SorobanRpc.Api.SimulateTransactionSuccessResponse;
  const resultScVal = successSim.result?.retval;
  if (!resultScVal) return [];

  // retval is ScVal::Vec containing PayoutRecord structs (each a ScVal::Map)
  const raw = scValToNative(resultScVal) as Array<{
    amount: bigint;
    timestamp: bigint;
    status: { tag: string } | string;
  }>;

  if (!Array.isArray(raw)) return [];

  return raw.map((r) => ({
    amount: BigInt(r.amount ?? 0n),
    timestamp: Number(r.timestamp ?? 0n),
    status: decodeStatus(r.status),
  }));
}

/**
 * Query registration info for a recipient.
 * Returns null if the recipient is not registered.
 */
export async function queryRecipient(
  recipientAddress: string
): Promise<RecipientInfo | null> {
  const server = buildServer();
  const contract = new Contract(CONTRACT_ID);

  const account = await server.getAccount(recipientAddress).catch(() => null);
  if (!account) return null;

  const recipientScVal = nativeToScVal(
    Address.fromString(recipientAddress),
    { type: "address" }
  );

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("get_recipient", recipientScVal))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) return null;

  const successSim = sim as SorobanRpc.Api.SimulateTransactionSuccessResponse;
  const resultScVal = successSim.result?.retval;
  if (!resultScVal) return null;

  const raw = scValToNative(resultScVal) as
    | { off_ramp_ref: string; total_received: bigint }
    | null
    | undefined;

  if (!raw) return null;
  return {
    offRampRef: raw.off_ramp_ref ?? "",
    totalReceived: BigInt(raw.total_received ?? 0n),
  };
}

/** Decode a Soroban enum variant (can come back as string or { tag } object). */
function decodeStatus(raw: unknown): OffRampStatus {
  const tag =
    typeof raw === "string"
      ? raw
      : typeof raw === "object" && raw !== null && "tag" in raw
      ? String((raw as { tag: unknown }).tag)
      : "";
  if (tag === "Confirmed") return "Confirmed";
  if (tag === "Failed") return "Failed";
  return "Pending";
}

// ─── error classification ────────────────────────────────────────────────────

/**
 * A sentinel error class so the UI can show a specific "wallet rejected"
 * message rather than a generic failure.
 */
export class WalletAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletAuthError";
  }
}

/**
 * Map Soroban contract error codes to human-readable strings.
 * Codes correspond to the PayrollError enum in the contract.
 */
function classifyContractError(raw: string): string {
  if (/Error\(Contract, #3\)/.test(raw))
    return "Unauthorized: your wallet is not the contract admin.";
  if (/Error\(Contract, #4\)/.test(raw))
    return "One or more recipients are not registered in the contract. Add them with add_recipient first.";
  if (/Error\(Contract, #5\)/.test(raw))
    return "Batch error: recipients and amounts arrays have different lengths.";
  if (/Error\(Contract, #6\)/.test(raw))
    return "Batch is empty — add at least one recipient.";
  if (/Error\(Contract, #7\)/.test(raw))
    return "Invalid amount: all amounts must be greater than zero.";
  if (/Error\(Contract, #1\)/.test(raw))
    return "Contract not initialized. Run `init` first.";
  return `Contract error: ${raw}`;
}
