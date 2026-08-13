import { encodeAbiParameters, type Hex } from "viem";
import { JsonRpcProvider } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";
import { config } from "@/lib/config";

/** Sepolia chainKey on Creditcoin CC3 testnet (Attestcoin / USC). */
export const SEPOLIA_CHAIN_KEY = 1;

const BLOCK_PROVER = "0x0000000000000000000000000000000000000FD2";

export { BLOCK_PROVER };

/** Real pipeline stages — only advanced when the matching SDK/RPC step finishes. */
export type AttestcoinPhase =
  | "finding_tx"
  | "waiting_attestation"
  | "attested"
  | "building_proof"
  | "proof_ready";

export type AttestcoinProofMeta = {
  chainKey: number;
  headerNumber: number;
  txHash: Hex;
  root: Hex;
  blockNumber: number;
};

export type BuildAttestcoinProofResult = {
  proof: Hex;
  meta: AttestcoinProofMeta;
};

export type AttestcoinPairProgress = {
  phase: AttestcoinPhase;
  meta?: Partial<AttestcoinProofMeta>;
  /** When blocks differ, both must attest — we wait in parallel (one ~8–10 min window). */
  parallel?: boolean;
};

const ATTEST_POLL_MS = 3_000;
/** Attestcoin on Sepolia often needs 8–20 min; allow up to 30 min before failing. */
const ATTEST_TIMEOUT_MS = 1_800_000;
const ATTEST_INITIAL_DELAY_MS = 5_000;

function proverConfig() {
  return {
    proverUrl: config.proverUrl || "https://proof-gen-api.cc3-testnet.creditcoin.network",
    sepoliaRpc: config.sepoliaRpc || "https://ethereum-sepolia-rpc.publicnode.com",
  };
}

function encodeProofFromSdk(
  txHash: Hex,
  blockNumber: number,
  // USC SDK proof payload — shape is stable but not exported from @gluwa/usc-sdk.
  data: {
    chainKey: bigint | number;
    headerNumber: bigint | number;
    txHash?: string;
    txBytes: string;
    merkleProof: { root: string; siblings: { hash: string; isLeft: boolean }[] };
    continuityProof: { lowerEndpointDigest: string; roots: string[] };
  },
): BuildAttestcoinProofResult {
  const siblingHashes = data.merkleProof.siblings.map((s) => s.hash as Hex);
  const siblingIsLeft = data.merkleProof.siblings.map((s) => s.isLeft);

  const meta: AttestcoinProofMeta = {
    chainKey: Number(data.chainKey),
    headerNumber: Number(data.headerNumber),
    txHash: (data.txHash || txHash) as Hex,
    root: data.merkleProof.root as Hex,
    blockNumber,
  };

  const proof = encodeAbiParameters(
    [
      { type: "uint64" },
      { type: "uint64" },
      { type: "bytes32" },
      { type: "bytes" },
      { type: "bytes32" },
      { type: "bytes32[]" },
      { type: "bool[]" },
      { type: "bytes32" },
      { type: "bytes32[]" },
    ],
    [
      BigInt(data.chainKey),
      BigInt(data.headerNumber),
      (data.txHash || txHash) as Hex,
      data.txBytes as Hex,
      data.merkleProof.root as Hex,
      siblingHashes,
      siblingIsLeft,
      data.continuityProof.lowerEndpointDigest as Hex,
      data.continuityProof.roots as Hex[],
    ],
  );

  return { proof, meta };
}

async function waitForBlocks(
  builder: {
    waitUntilHeightAttested: (
      chainKey: number,
      blockNumber: number,
      initialDelay: number,
      timeout: number,
      poll: number,
    ) => Promise<void>;
  },
  blocks: number[],
  onPhase?: (phase: AttestcoinPhase, meta?: Partial<AttestcoinProofMeta>) => void,
) {
  const unique = [...new Set(blocks)];
  onPhase?.("waiting_attestation", {
    blockNumber: Math.max(...unique),
  });
  await Promise.all(
    unique.map((blockNumber) =>
      builder.waitUntilHeightAttested(
        SEPOLIA_CHAIN_KEY,
        blockNumber,
        ATTEST_INITIAL_DELAY_MS,
        ATTEST_TIMEOUT_MS,
        ATTEST_POLL_MS,
      ),
    ),
  );
  onPhase?.("attested");
}

/**
 * Wait for Attestcoin attestation, then build an on-chain USC proof blob
 * for AttestcoinPaymentVerifier / BlockProver.
 */
export async function buildAttestcoinProof(
  txHash: Hex,
  onPhase?: (phase: AttestcoinPhase, meta?: Partial<AttestcoinProofMeta>) => void,
): Promise<BuildAttestcoinProofResult> {
  const { proverUrl, sepoliaRpc } = proverConfig();

  onPhase?.("finding_tx");
  const source = new JsonRpcProvider(sepoliaRpc);
  const tx = await source.getTransaction(txHash);
  if (!tx?.blockNumber) {
    throw new Error("Payment transaction not found on Sepolia yet. Wait a few seconds and retry.");
  }

  const builder = new proofProvider.service.ProofBuilder(SEPOLIA_CHAIN_KEY, proverUrl, 30_000);

  onPhase?.("waiting_attestation", { blockNumber: tx.blockNumber, txHash });
  await waitForBlocks(builder, [tx.blockNumber], onPhase);

  onPhase?.("building_proof", { blockNumber: tx.blockNumber, txHash });
  const result = await builder.getProof(txHash);
  if (!result.success || !result.data) {
    throw new Error(result.error || "Attestcoin proof generation failed.");
  }

  onPhase?.("proof_ready", { blockNumber: tx.blockNumber, txHash });
  return encodeProofFromSdk(txHash, tx.blockNumber, result.data);
}

/**
 * Build deposit + balance USC proofs with parallel attestation waits.
 * Avoids stacking two sequential ~8–10 min waits when blocks differ.
 */
export async function buildAttestcoinProofPair(
  depositTxHash: Hex,
  balanceTxHash: Hex,
  onProgress?: (progress: AttestcoinPairProgress) => void,
): Promise<{ deposit: BuildAttestcoinProofResult; balance: BuildAttestcoinProofResult }> {
  const { proverUrl, sepoliaRpc } = proverConfig();
  const source = new JsonRpcProvider(sepoliaRpc);
  const builder = new proofProvider.service.ProofBuilder(SEPOLIA_CHAIN_KEY, proverUrl, 30_000);

  onProgress?.({ phase: "finding_tx" });
  const [depTx, balTx] = await Promise.all([
    source.getTransaction(depositTxHash),
    source.getTransaction(balanceTxHash),
  ]);
  if (!depTx?.blockNumber) {
    throw new Error("Deposit transaction not found on Sepolia yet. Wait a few seconds and retry.");
  }
  if (!balTx?.blockNumber) {
    throw new Error("Balance attestation not found on Sepolia yet. Wait a few seconds and retry.");
  }

  const parallel = depTx.blockNumber !== balTx.blockNumber;
  onProgress?.({
    phase: "waiting_attestation",
    meta: { blockNumber: Math.max(depTx.blockNumber, balTx.blockNumber), txHash: depositTxHash },
    parallel,
  });

  await Promise.all([
    builder.waitUntilHeightAttested(
      SEPOLIA_CHAIN_KEY,
      depTx.blockNumber,
      ATTEST_INITIAL_DELAY_MS,
      ATTEST_TIMEOUT_MS,
      ATTEST_POLL_MS,
    ),
    builder.waitUntilHeightAttested(
      SEPOLIA_CHAIN_KEY,
      balTx.blockNumber,
      ATTEST_INITIAL_DELAY_MS,
      ATTEST_TIMEOUT_MS,
      ATTEST_POLL_MS,
    ),
  ]);

  onProgress?.({ phase: "attested", parallel });
  onProgress?.({ phase: "building_proof", parallel });

  const [depResult, balResult] = await Promise.all([
    builder.getProof(depositTxHash),
    builder.getProof(balanceTxHash),
  ]);

  if (!depResult.success || !depResult.data) {
    throw new Error(depResult.error || "Deposit proof generation failed.");
  }
  if (!balResult.success || !balResult.data) {
    throw new Error(balResult.error || "Balance proof generation failed.");
  }

  onProgress?.({ phase: "proof_ready", parallel });

  return {
    deposit: encodeProofFromSdk(depositTxHash, depTx.blockNumber, depResult.data),
    balance: encodeProofFromSdk(balanceTxHash, balTx.blockNumber, balResult.data),
  };
}
