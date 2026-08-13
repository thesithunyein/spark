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

/**
 * Wait for Attestcoin attestation, then build an on-chain USC proof blob
 * for AttestcoinPaymentVerifier / BlockProver.
 */
export async function buildAttestcoinProof(
  txHash: Hex,
  onPhase?: (phase: AttestcoinPhase, meta?: Partial<AttestcoinProofMeta>) => void,
): Promise<BuildAttestcoinProofResult> {
  const proverUrl =
    config.proverUrl || "https://proof-gen-api.cc3-testnet.creditcoin.network";
  const sepoliaRpc = config.sepoliaRpc || "https://ethereum-sepolia-rpc.publicnode.com";

  onPhase?.("finding_tx");
  const source = new JsonRpcProvider(sepoliaRpc);
  const tx = await source.getTransaction(txHash);
  if (!tx?.blockNumber) {
    throw new Error("Payment transaction not found on Sepolia yet. Wait a few seconds and retry.");
  }

  const builder = new proofProvider.service.ProofBuilder(SEPOLIA_CHAIN_KEY, proverUrl, 30_000);

  // Attestation can take several minutes on testnet.
  onPhase?.("waiting_attestation", { blockNumber: tx.blockNumber, txHash });
  await builder.waitUntilHeightAttested(SEPOLIA_CHAIN_KEY, tx.blockNumber, 10_000, 900_000, 3_000);
  onPhase?.("attested", { blockNumber: tx.blockNumber, txHash });

  onPhase?.("building_proof", { blockNumber: tx.blockNumber, txHash });
  const result = await builder.getProof(txHash);
  if (!result.success || !result.data) {
    throw new Error(result.error || "Attestcoin proof generation failed.");
  }

  const data = result.data;
  const siblingHashes = data.merkleProof.siblings.map((s) => s.hash as Hex);
  const siblingIsLeft = data.merkleProof.siblings.map((s) => s.isLeft);

  const meta: AttestcoinProofMeta = {
    chainKey: Number(data.chainKey),
    headerNumber: Number(data.headerNumber),
    txHash: (data.txHash || txHash) as Hex,
    root: data.merkleProof.root as Hex,
    blockNumber: tx.blockNumber,
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

  onPhase?.("proof_ready", meta);
  return { proof, meta };
}
