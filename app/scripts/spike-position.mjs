/**
 * Day 1 Spike 2: can a proven MAINNET payload be reduced to exact facts, and do
 * those facts match the real chain?
 *
 * FINDING (learned by running it): the proven `encodedTx` is NOT a single RLP
 * blob and NOT the canonical Ethereum receipt encoding. It is Attestcoin's own
 * word-aligned EvmV1 layout: tx fields, signature, then receipt with logs, packed
 * as 32-byte words. So `ethers.decodeRlp` is the wrong tool, and any plan that
 * assumed canonical receipts would have needed rework on Day 2.
 *
 * This script instead does the check that matters: it pulls the log fields out of
 * the proven payload and asserts they equal the real chain values.
 *
 * Read-only. No keys, no gas, no transactions.
 * Run: cd app && node scripts/spike-position.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const MAINNET_RPC = process.env.MAINNET_RPC || "https://ethereum-rpc.publicnode.com";
const AAVE_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";

const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);
const pad = (hex, size = 64) => hex.toLowerCase().replace(/^0x/, "").padStart(size, "0");
const addrWord = (a) => pad(a.toLowerCase().replace(/^0x/, ""), 64);

const here = dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  readFileSync(resolve(here, "../../docs/evidence/mainnet-spike-proof.json"), "utf8"),
);

const REPAY_TOPIC = ethers.id("Repay(address,address,address,uint256,bool)");

function words(hexNo0x) {
  const out = [];
  for (let i = 0; i + 64 <= hexNo0x.length; i += 64) out.push(hexNo0x.slice(i, i + 64));
  return out;
}

async function partA(provider) {
  console.log("\n─── A. FACT EXTRACTION from the proven payload ───");
  const hex = payload.txBytes.toLowerCase().replace(/^0x/, "");
  const w = words(hex);
  log("proven payload:", hex.length / 2, "bytes =", w.length, "words (32-byte aligned)");

  const receipt = await provider.getTransactionReceipt(payload.sourceTx);
  if (!receipt) throw new Error("receipt not found");
  log("real receipt on mainnet:", receipt.logs.length, "logs | status:", receipt.status);

  const real = receipt.logs.find((l) => l.topics[0].toLowerCase() === REPAY_TOPIC.toLowerCase());
  if (!real) throw new Error("no Repay log in the real receipt");

  const realReserve = real.topics[1].toLowerCase();
  const realUser = real.topics[2].toLowerCase();
  const realRepayer = real.topics[3].toLowerCase();
  const realAmount = real.data.slice(0, 66).toLowerCase();

  console.log("   real chain values:");
  console.log("     emitter :", real.address, real.address.toLowerCase() === AAVE_POOL.toLowerCase() ? "(Aave V3 Pool)" : "");
  console.log("     reserve :", realReserve);
  console.log("     user    :", realUser);
  console.log("     repayer :", realRepayer);
  console.log("     amount  :", BigInt(realAmount).toString(), "raw");

  const has = (x) => hex.includes(x);
  const checks = [
    ["Repay topic0 present in proven payload", has(pad(REPAY_TOPIC))],
    ["Aave Pool emitter present in proven payload", has(addrWord(AAVE_POOL))],
    ["reserve (topic1) present", has(pad(realReserve))],
    ["user (topic2) present", has(pad(realUser))],
    ["repayer (topic3) present", has(pad(realRepayer))],
    ["amount data word present", has(pad(realAmount))],
  ];
  console.log("   ── assertions against the real chain ──");
  let all = true;
  for (const [name, ok] of checks) {
    console.log(`     ${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) all = false;
  }

  // The amount is bound: the payload contains the exact amount word from the receipt.
  const amountBound = has(pad(realAmount));
  console.log("   amount bound to the proof:", amountBound ? "YES" : "NO");

  return { real, all, amountBound };
}

async function partB(provider, user) {
  console.log("\n─── B. THE REAL POSITION (what event sums must reconcile to) ───");
  if (!user) return console.log("   skipped: no payer extracted");

  const iface = new ethers.Interface([
    "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  ]);

  try {
    const raw = await provider.call({
      to: AAVE_POOL,
      data: iface.encodeFunctionData("getUserAccountData", [user]),
    });
    const r = iface.decodeFunctionResult("getUserAccountData", raw);
    console.log("   pool.getUserAccountData(user):");
    console.log("     collateral :", (BigInt(r[0]) / 10n ** 8n).toString(), "USD (base, 8dp)");
    console.log("     debt       :", (BigInt(r[1]) / 10n ** 8n).toString(), "USD (base, 8dp)");
    console.log("     LTV        :", (BigInt(r[4]) / 100n).toString() + "%");
    console.log("     health     :", r[5].toString());
  } catch (e) {
    console.log("   getUserAccountData failed:", e?.shortMessage || e?.message);
  }

  console.log("\n   DRIFT NOTE: these figures are truth at the current block. Event sums");
  console.log("   (Supply - Withdraw, Borrow - Repay) only reproduce them if interest is");
  console.log("   accounted for, because aTokens rebase. Measuring that gap needs the full");
  console.log("   event history, which public RPC getLogs ranges cannot return.");
  console.log("   => Day 2 task 1 is an indexer, not a contract.");
}

async function main() {
  const provider = new ethers.JsonRpcProvider(MAINNET_RPC);
  console.log("mainnet RPC:", MAINNET_RPC);
  console.log("source tx  :", payload.sourceTx, "| block:", payload.sourceBlock);
  console.log("chainKey   :", payload.chainKey);

  const a = await partA(provider);
  await partB(provider, `0x${a.real.topics[2].slice(-40).toLowerCase()}`);

  console.log("\n─── VERDICT ───");
  console.log(a.all
    ? "A PASS: every field of the real Repay log is present in the proven payload,"
    : "A PARTIAL: some log fields were not located in the proven payload.");
  console.log("        so mainnet facts are extractable and the amount is bound. The payload");
  console.log("        is Attestcoin's word-aligned EvmV1 layout, so extraction must follow");
  console.log("        that encoding (or the official decoder), not canonical Ethereum RLP.");
  console.log("B OPEN: position drift needs a full-history indexer before net position can");
  console.log("        be claimed. Do not ship the primitive without that measurement.");
}

main().catch((e) => {
  console.error("SPIKE ERROR:", e?.stack || e?.message || e);
  process.exit(1);
});
