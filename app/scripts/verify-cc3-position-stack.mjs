#!/usr/bin/env node
/**
 * Verifies a CC3 deployment of the position stack and writes the evidence artifact.
 *
 * This exists because "it ran locally" and "it is deployed" are different claims, and the
 * gap between them is exactly where a submission gets doubted. It reads the broadcast
 * artifact from the CC3 run, re-reads every value straight off CC3, asserts the values
 * match the real Ethereum mainnet facts the engine was built from, and only then writes
 * docs/evidence/cc3-position-stack.md. If any value disagrees the artifact is not written.
 *
 * ABIs come from the compiler output rather than being hand-written here: a hand-written
 * ABI that drifts from the contract fails in confusing ways, and that is not a bug worth
 * shipping twice.
 *
 * Run from app/ after a broadcast:  node scripts/verify-cc3-position-stack.mjs
 *
 * Env overrides exist so the success path can be rehearsed against a local chain:
 *   CC3_RPC_URL, EXPECTED_CHAIN_ID, EXPLORER_URL, BROADCAST_PATH, DRY_RUN
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ethers } from "ethers";

const CC3_RPC = process.env.CC3_RPC_URL || "https://rpc.cc3-testnet.creditcoin.network";
const CHAIN_ID = Number(process.env.EXPECTED_CHAIN_ID || 102031);
const EXPLORER = process.env.EXPLORER_URL || "https://creditcoin-testnet.blockscout.com";
const REPO_ROOT = new URL("../../", import.meta.url);

const BROADCAST = process.env.BROADCAST_PATH
  ? new URL(process.env.BROADCAST_PATH, REPO_ROOT)
  : new URL(`contracts/broadcast/ProveMainnetPosition.s.sol/${CHAIN_ID}/run-latest.json`, REPO_ROOT);

// A dry run prints the verdict without writing docs/evidence, so a rehearsal can never be
// mistaken for a real CC3 deployment.
const DRY_RUN = Boolean(process.env.DRY_RUN);

// Real mainnet facts from docs/evidence/position-scale.json. These are assertions, not
// parameters: the deployment is only valid if the chain reproduces them.
const EXPECTED = {
  borrower: "0x0Cc688BF78bDCC3C072903100B2b821cC8d7d666",
  aToken: "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
  feed: process.env.ETH_USD_AGGREGATOR || "0x7d4E742018fb52E48b08BE73d041C18B21de6Fb5",
  ledgerNet: 433014008378577163575n,
  attestedBalance: 433033874843288486772n,
  interestResidual: 19866464711323197n,
  anchorBlock: 25962220n,
  tokenDecimals: 18n,
  sign: 1n,
  entries: 1n,
};

const CONTRACTS = [
  "MainnetPositionRegistry",
  "MainnetTokenRegistry",
  "AttestedPriceFeed",
  "PositionValuer",
];

function fail(msg, details) {
  console.error(`\nFAIL: ${msg}`);
  if (details) for (const d of details) console.error(`  ${d}`);
  process.exit(1);
}

/** ABI straight from the compiler artifact, so it cannot drift from the source. */
function abiOf(name) {
  const p = new URL(`contracts/out/${name}.sol/${name}.json`, REPO_ROOT);
  if (!existsSync(p)) {
    fail(
      `no compiler artifact for ${name}`,
      [`expected ${p.pathname.replace(REPO_ROOT.pathname, "")}`, "run: cd contracts && forge build"],
    );
  }
  return JSON.parse(readFileSync(p, "utf8")).abi;
}

function deployedAddresses() {
  if (!existsSync(BROADCAST)) return null;
  const art = JSON.parse(readFileSync(BROADCAST, "utf8"));
  const out = {};
  for (const tx of art.transactions || []) {
    if (tx.contractName && tx.contractAddress) out[tx.contractName] = tx.contractAddress;
  }
  return out;
}

const addr = deployedAddresses();
if (!addr) {
  console.log("No broadcast artifact found at:");
  console.log(`  ${BROADCAST.pathname.replace(REPO_ROOT.pathname, "")}`);
  console.log("\nThe stack has not been broadcast to this chain yet, so there is nothing to verify.");
  console.log("See docs/DEPLOY_CC3.md. Nothing was written.");
  process.exit(0);
}

for (const name of CONTRACTS) {
  if (!addr[name]) fail(`broadcast artifact has no address for ${name}`);
}

// No network pinned on the provider: pinning makes ethers throw its own NETWORK_ERROR before
// this script's message can explain what actually went wrong.
const provider = new ethers.JsonRpcProvider(CC3_RPC);
let net;
try {
  net = await provider.getNetwork();
} catch (e) {
  fail(`could not read a chain id from ${CC3_RPC}`, [e.shortMessage || e.message]);
}
if (Number(net.chainId) !== CHAIN_ID) {
  fail(
    `RPC reported chain id ${net.chainId}, expected ${CHAIN_ID}`,
    ["point CC3_RPC_URL at the intended chain, or set EXPECTED_CHAIN_ID for a rehearsal"],
  );
}

const registry = new ethers.Contract(addr.MainnetPositionRegistry, abiOf("MainnetPositionRegistry"), provider);
const tokens = new ethers.Contract(addr.MainnetTokenRegistry, abiOf("MainnetTokenRegistry"), provider);
const valuer = new ethers.Contract(addr.PositionValuer, abiOf("PositionValuer"), provider);

const { borrower, aToken, feed } = EXPECTED;

// Index access on Result objects, deliberately. Named getters on returned tuples came back
// as a bound function during testing, which BigInt() then rejected. Indices are unambiguous
// and the order matches each struct in the source.
let reads;
try {
  reads = await Promise.all([
    registry.ledgerNet(borrower, aToken),
    registry.netPosition(borrower, aToken),
    registry.isAnchored(borrower, aToken),
    registry.positionOf(borrower, aToken),
    tokens.decimalsOf(aToken),
    tokens.signOf(aToken),
    tokens.isRegistered(aToken),
    valuer.valuationOf(borrower, aToken, feed),
  ]);
} catch (e) {
  fail(
    `a read against ${CC3_RPC} failed, so nothing was verified`,
    [e.shortMessage || e.message],
  );
}
const [ledgerNet, netPosition, anchored, rawPos, decimals, sign, registered, rawVal] = reads;

/**
 * ethers treats a single struct output two different ways depending on whether it is named:
 * positionOf declares an unnamed tuple and ethers flattens it to the top level (6 elements),
 * while valuationOf declares `returns (Valuation memory v)` and ethers keeps it nested (1
 * element holding 7). Both shapes appear here, so normalize to the struct's own array.
 *
 * Related trap, hit while building this: naming the function `valueOf` made
 * `valuer.valueOf(...)` resolve to `Object.prototype.valueOf`, which silently returned the
 * Contract object instead of making the call. It was renamed to `valuationOf` in the
 * contract rather than worked around here.
 */
function structOf(result, expectedLength) {
  const first = result[0];
  if (result.length === 1 && first && typeof first === "object" && first.length === expectedLength) {
    return first;
  }
  return result;
}

const pos = structOf(rawPos, 6);
const val = structOf(rawVal, 7);

const checks = [];
const check = (label, actual, expected) => {
  const ok = BigInt(actual) === BigInt(expected);
  checks.push({ label, actual: actual.toString(), expected: expected.toString(), ok });
};

check("registry.ledgerNet", ledgerNet, EXPECTED.ledgerNet);
check("registry.netPosition", netPosition, EXPECTED.attestedBalance);
check("positionOf.ledgerNet", pos[0], EXPECTED.ledgerNet);
check("positionOf.interestResidual", pos[1], EXPECTED.interestResidual);
check("positionOf.anchorBlock", pos[2], EXPECTED.anchorBlock);
check("positionOf.entries", pos[4], EXPECTED.entries);
check("tokenRegistry.decimalsOf", decimals, EXPECTED.tokenDecimals);
check("tokenRegistry.signOf", sign, EXPECTED.sign);
check("valuer.valuationOf.position", val[1], EXPECTED.attestedBalance);
check("valuer.valuationOf.tokenDecimals", val[2], EXPECTED.tokenDecimals);
check("valuer.valuationOf.priceDecimals", val[4], 8n);

if (!anchored) fail("isAnchored returned false: the deployment is not anchored");
if (!pos[5]) fail("positionOf.anchored returned false");
if (!registered) fail("tokenRegistry.isRegistered returned false for the aToken");
if (String(val[0]).toLowerCase() !== aToken.toLowerCase()) {
  fail(`valuer.valuationOf returned token ${val[0]}, expected ${aToken}`);
}

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  fail(
    "the deployment does not reproduce the mainnet facts it was built from",
    failed.map((c) => `${c.label}: got ${c.actual}, expected ${c.expected}`),
  );
}

const valueUsd = Number(val[5]) / 1e8;
const price = Number(val[3]) / 10 ** Number(val[4]);

const md = `# Deployed position stack, independently verified

Generated by \`app/scripts/verify-cc3-position-stack.mjs\` at ${new Date().toISOString()}.

Every value below was read back from chain with a fresh call. The script refuses to write this
file if any value disagrees with the mainnet facts the engine was built from, so the existence
of this file is the claim, not the prose in it.

## Deployed

| Contract | Address |
|---|---|
${CONTRACTS.map((n) => `| ${n} | [\`${addr[n]}\`](${EXPLORER}/address/${addr[n]}) |`).join("\n")}

Network: chain id ${CHAIN_ID}.
Broadcast artifact: \`contracts/broadcast/ProveMainnetPosition.s.sol/${CHAIN_ID}/run-latest.json\`.

## Proved position, read off chain

| Field | Value |
|---|---|
| Account | \`${borrower}\` |
| Attested token | \`${aToken}\` |
| Zero anchor block (mainnet) | ${pos[2]} |
| Ledger net | ${ethers.formatUnits(pos[0], 18)} aEthWETH |
| Interest residual | ${ethers.formatUnits(pos[1], 18)} aEthWETH |
| Reconciled position | ${ethers.formatUnits(netPosition, 18)} aEthWETH |
| Ledger rows applied | ${pos[4]} |
| Anchored | ${pos[5]} |

## Valuation, read off chain

| Field | Value |
|---|---|
| Attested ETH/USD | $${price.toLocaleString("en-US", { maximumFractionDigits: 2 })} |
| Price decimals | ${val[4]} |
| Net worth | **$${valueUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}** |
| Position block | ${val[6]} |

## Assertions

${checks.map((c) => `- ${c.ok ? "PASS" : "FAIL"} \`${c.label}\` = ${c.actual}`).join("\n")}
- PASS \`registry.isAnchored\` = ${anchored}
- PASS \`tokenRegistry.isRegistered\` = ${registered}

Reproduce:

\`\`\`bash
cd app && node scripts/verify-cc3-position-stack.mjs
\`\`\`
`;

if (!DRY_RUN) {
  writeFileSync(new URL("../../docs/evidence/cc3-position-stack.md", import.meta.url), md);
}

console.log(
  DRY_RUN
    ? "DRY RUN: all assertions passed. Nothing written."
    : "Verified against chain. Wrote docs/evidence/cc3-position-stack.md",
);
console.log("");
for (const n of CONTRACTS) console.log(`  ${n.padEnd(24)} ${addr[n]}`);
console.log("");
console.log(`  net position   ${ethers.formatUnits(netPosition, 18)} aEthWETH`);
console.log(`  net worth      $${valueUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
console.log(`  assertions     ${checks.length + 2}/${checks.length + 2} passed`);
