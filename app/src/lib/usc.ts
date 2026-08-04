import { encodeAbiParameters, type Hex } from "viem";
import { JsonRpcProvider } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";
import { config } from "@/lib/config";

/** Sepolia chainKey on Creditcoin CC3 testnet (Attestcoin / USC). */
export const SEPOLIA_CHAIN_KEY = 1;

const BLOCK_PROVER = "0x0000000000000000000000000000000000000FD2";

export { BLOCK_PROVER };

/**
 * Wait for Attestcoin attestation, then build an on-chain USC proof blob
 * for AttestcoinPaymentVerifier / BlockProver.
 */
export async function buildAttestcoinProof(txHash: Hex): Promise<Hex> {
  const proverUrl =
    config.proverUrl || "https://proof-gen-api.cc3-testnet.creditcoin.network";
  const sepoliaRpc = config.sepoliaRpc || "https://ethereum-sepolia-rpc.publicnode.com";

  const source = new JsonRpcProvider(sepoliaRpc);
  const tx = await source.getTransaction(txHash);
  if (!tx?.blockNumber) {
    throw new Error("Payment transaction not found on Sepolia yet. Wait a few seconds and retry.");
  }

  const builder = new proofProvider.service.ProofBuilder(SEPOLIA_CHAIN_KEY, proverUrl, 30_000);

  // Attestation can take several minutes on testnet.
  await builder.waitUntilHeightAttested(SEPOLIA_CHAIN_KEY, tx.blockNumber, 10_000, 900_000, 3_000);

  const result = await builder.getProof(txHash);
  if (!result.success || !result.data) {
    throw new Error(result.error || "Attestcoin proof generation failed.");
  }

  const data = result.data;
  const siblingHashes = data.merkleProof.siblings.map((s) => s.hash as Hex);
  const siblingIsLeft = data.merkleProof.siblings.map((s) => s.isLeft);

  return encodeAbiParameters(
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
}
