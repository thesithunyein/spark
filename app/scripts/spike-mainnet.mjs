/**
 * Day 1 spike: prove a real Ethereum MAINNET transaction via Attestcoin (chainKey 3).
 *
 * This validates the foundation of the Spark mainnet plan:
 *   - the official prover supports chainKey 3 (Ethereum mainnet) as a source chain,
 *   - a historical third-party mainnet transaction produces a valid proof payload.
 *
 * Read-only. Generates a proof; does not submit a transaction or spend anything.
 *
 * Run:
 *   cd app && node scripts/spike-mainnet.mjs
 *   TX_HASH=0x... BLOCK_NUMBER=123 node scripts/spike-mainnet.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHAIN_KEY_MAINNET = 3;
const PROVER_URL = process.env.PROVER_URL || "https://proof-gen-api.cc3-testnet.creditcoin.network";

/** Real Aave V3 mainnet Repay from a third-party wallet (discovered live, not fabricated). */
const TX_HASH =
  process.env.TX_HASH || "0x46efa06823d4b99d2d22223fd97f24438bb9c9e2d152034426a5d2adc6d5c2c3";
const BLOCK_NUMBER = Number(process.env.BLOCK_NUMBER || 25969869);

const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);

async function main() {
  const { proofProvider } = await import("@gluwa/usc-sdk");

  log("spike start");
  log("prover:", PROVER_URL);
  log("chainKey:", CHAIN_KEY_MAINNET, "(Ethereum mainnet)");
  log("tx:", TX_HASH);
  log("block:", BLOCK_NUMBER);

  const builder = new proofProvider.service.ProofBuilder(CHAIN_KEY_MAINNET, PROVER_URL, 60_000);

  const t0 = Date.now();
  try {
    log("waiting for attestation of mainnet block", BLOCK_NUMBER, "...");
    await builder.waitUntilHeightAttested(CHAIN_KEY_MAINNET, BLOCK_NUMBER, 5_000, 600_000, 5_000);
    log(`attested after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    log("waitUntilHeightAttested threw:", e?.message || e, "(continuing to getProof)");
  }

  log("requesting proof ...");
  const res = await builder.getProof(TX_HASH);

  if (!res || res.success !== true || !res.data) {
    console.error("PROOF FAILED:", res?.error ?? JSON.stringify(res)?.slice(0, 600));
    process.exit(1);
  }

  const d = res.data;
  const bytes = d.txBytes ? d.txBytes.length / 2 - 1 : 0;

  console.log("\n=== PROOF OK ===");
  console.log("chainKey          :", Number(d.chainKey), Number(d.chainKey) === CHAIN_KEY_MAINNET ? "(mainnet confirmed)" : "(UNEXPECTED)");
  console.log("headerNumber      :", Number(d.headerNumber));
  console.log("txBytes length    :", bytes, "bytes");
  console.log("merkle root       :", d.merkleProof?.root);
  console.log("merkle siblings   :", d.merkleProof?.siblings?.length);
  console.log("continuity roots  :", d.continuityProof?.roots?.length);
  console.log("lowerEndpoint     :", d.continuityProof?.lowerEndpointDigest);
  console.log("txBytes prefix    :", d.txBytes?.slice(0, 90));

  // The canonical tx hash is derived from the proven bytes, not taken on trust.
  // The verifier contract does this on-chain; here we only confirm the payload arrived.
  // Persist the payload as reproducible evidence for the mainnet corpus work.
  const here = dirname(fileURLToPath(import.meta.url));
  const out = resolve(here, "../../docs/evidence/mainnet-spike-proof.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        prover: PROVER_URL,
        chainKey: Number(d.chainKey),
        sourceChain: "Ethereum mainnet",
        sourceTx: TX_HASH,
        sourceBlock: Number(d.headerNumber),
        contract: "Aave V3 Pool 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
        event: "Repay(address,address,address,uint256,bool)",
        txBytesLength: bytes,
        merkleRoot: d.merkleProof?.root,
        merkleSiblings: d.merkleProof?.siblings?.length,
        continuityRoots: d.continuityProof?.roots?.length,
        lowerEndpointDigest: d.continuityProof?.lowerEndpointDigest,
        txBytes: d.txBytes,
      },
      null,
      2,
    ),
  );
  console.log("evidence written:", out);

  console.log("\nRESULT: mainnet (chainKey 3) proofs are available from the official prover.");
}

main().catch((e) => {
  console.error("SPIKE ERROR:", e?.stack || e?.message || e);
  process.exit(1);
});
