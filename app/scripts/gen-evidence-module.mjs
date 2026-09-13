#!/usr/bin/env node
/**
 * Generates src/lib/mainnetEvidence.ts from the evidence artifacts in docs/evidence/.
 *
 * Why generate rather than hand-write: the /bonus page renders numbers that must match
 * docs/evidence/*.json exactly. Copying them by hand invites silent drift, and a number
 * on a page that no longer matches its artifact is worse than no number at all.
 *
 * Run from app/:  node scripts/gen-evidence-module.mjs
 *
 * Sources (all produced from real Ethereum mainnet reads):
 *   docs/evidence/position-scale.json     8-wallet ledger reconciliation (Day 5)
 *   docs/evidence/position-drift.json     naive event-summing error measurement (Day 2)
 *   docs/evidence/protocol-topics.json    event-topic parity + negative controls (Day 4)
 *   docs/evidence/position-stack-e2e.txt  local end-to-end execution (Day 6)
 */

import { readFileSync, writeFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const readText = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const scale = read("../../docs/evidence/position-scale.json");
const drift = read("../../docs/evidence/position-drift.json");
const topics = read("../../docs/evidence/protocol-topics.json");
const e2eText = readText("../../docs/evidence/position-stack-e2e.txt");

/** Human-readable fixed-point from an integer string, at `decimals` precision. */
function fixed(intStr, decimals, maxFrac = 6) {
  const neg = intStr.startsWith("-");
  const digits = (neg ? intStr.slice(1) : intStr).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals > 0 ? digits.slice(digits.length - decimals) : "";
  const trimmed = frac.replace(/0+$/, "").slice(0, maxFrac);
  return `${neg ? "-" : ""}${whole}${trimmed ? `.${trimmed}` : ""}`;
}

// ---- Day 5: 8-wallet reconciliation ----------------------------------------
const wallets = scale.wallets.map((w) => ({
  wallet: w.wallet,
  short: `${w.wallet.slice(0, 6)}…${w.wallet.slice(-4)}`,
  anchorBlock: w.anchorBlock,
  blocksCovered: w.blocksCovered,
  balance: w.balance,
  balanceDisplay: fixed(w.balance, 18, 4),
  ledgerNet: w.ledgerNet,
  ledgerDisplay: fixed(w.ledgerNet, 18, 4),
  residual: w.residual,
  residualBps: w.residualBps,
  transferCount: w.transferCount,
  p2pMoved: w.p2pMoved,
  p2pDisplay: fixed(w.p2pMoved, 18, 4),
  hasP2p: BigInt(w.p2pMoved) !== 0n,
}));

// ---- Day 2: naive event summing vs reality ---------------------------------
const reserves = drift.reserves.map((r) => ({
  symbol: r.symbol,
  decimals: r.decimals,
  events: r.events,
  eventCount: Object.values(r.events).reduce((a, b) => a + b, 0),
  naiveSupplyDisplay: fixed(r.netSupplied, r.decimals, 4),
  realSupplyDisplay: fixed(r.realSupplied, r.decimals, 4),
  supplyDriftPct: r.supplyDriftPct,
  naiveDebtDisplay: fixed(r.netBorrowed, r.decimals, 4),
  realDebtDisplay: fixed(r.realDebt, r.decimals, 4),
  debtDriftPct: r.debtDriftPct,
}));

const weth = reserves.find((r) => r.symbol === "WETH");

// ---- Day 6: local end-to-end execution -------------------------------------
const num = (re) => {
  const m = e2eText.match(re);
  return m ? m[1].trim() : null;
};
// Match each tuple whole, anchored on its own label. Fishing for single fields with loose
// patterns silently picked up the anchor block from a different tuple during development.
const valuerTuple = e2eText.match(
  /valuationOf\(borrower, aWETH[^\n]*\)[\s\S]*?\(0x[0-9a-fA-F]{40},\s*(\d+)\s*\[[^\]]+\],\s*(\d+),\s*(\d+)\s*\[[^\]]+\],\s*(\d+),\s*(\d+)\s*\[[^\]]+\],\s*(\d+)/,
);
const positionTuple = e2eText.match(
  /positionOf\(borrower, aWETH\)[\s\S]*?\((\d+)\s*\[[^\]]+\],\s*(\d+)\s*\[[^\]]+\],\s*(\d+)\s*\[[^\]]+\],\s*(\d+)\s*\[[^\]]+\],\s*(\d+),\s*(true|false)\)/,
);
if (!valuerTuple) throw new Error("could not parse the valuation tuple from position-stack-e2e.txt");
if (!positionTuple) throw new Error("could not parse the position tuple from position-stack-e2e.txt");

const e2e = {
  chain: "local anvil 31337",
  ledgerNet: num(/ledgerNet\(borrower, aWETH\) \.+ (\d+)/),
  netPosition: num(/netPosition\(borrower, aWETH\) \.+ (\d+)/),
  tokenDecimals: valuerTuple[2],
  priceDecimals: valuerTuple[4],
  price: valuerTuple[3],
  valueUsd8: valuerTuple[5],
  positionBlock: valuerTuple[6],
  interestResidual: positionTuple[2],
  anchorBlock: positionTuple[3],
  lastLedgerBlock: positionTuple[4],
  transactions: num(/transactions: (\d+)/),
  gasTotal: num(/gasUsed total: ([\d,]+)/),
  // The block the attested balance was actually read at, and the value it returned. These two
  // must agree, and MEASURE_BLOCK in the deploy script must equal the first.
  measureBlock: num(/the attested balance, read at block ([\d,]+)/),
  attestedAtMeasureBlock: num(/the attested balance, read at block [\d,]+ \(MEASURE_BLOCK\)\s*\n\s*(\d+)/),
  zeroAnchorAtAnchorBlock: num(/anchor is genuinely zero[^\n]*block [\d,]+\s*\n\s*(\d+)/),
};

// Display strings go through the same helper the wallet rows use, so the page cannot
// show two different roundings of the same quantity.
const e2eDisplay = {
  ledgerDisplay: e2e.ledgerNet ? fixed(e2e.ledgerNet, 18, 4) : null,
  netPositionDisplay: e2e.netPosition ? fixed(e2e.netPosition, 18, 4) : null,
  priceDisplay: e2e.price ? `$${(Number(BigInt(e2e.price)) / 1e8).toLocaleString("en-US")}` : null,
  valueUsdDisplay: e2e.valueUsd8 ? `$${Number(BigInt(e2e.valueUsd8) / 100_000_000n).toLocaleString("en-US")}` : null,
  gasDisplay: e2e.gasTotal ? Number(e2e.gasTotal.replace(/,/g, "")).toLocaleString("en-US") : null,
  measuredBalanceDisplay: e2e.attestedAtMeasureBlock ? fixed(e2e.attestedAtMeasureBlock, 18, 4) : null,
};

// ---- Day 4: topic parity ----------------------------------------------------
const confirmedTopics = topics.topics.filter((t) => t.confirmed);
const topicRows = topics.topics.map((t) => ({
  name: t.name,
  contract: t.contract,
  signature: t.signature,
  topic0: t.topic0,
  logsInWindow: t.logsInWindow,
  confirmed: t.confirmed,
}));
const negativeControls = topics.negativeControls.map((c) => ({
  name: c.name,
  signature: c.signature,
  logsInWindow: c.logsInWindow,
  correct: c.correct,
}));

// ---- Shape the module -------------------------------------------------------
const out = {
  generatedFrom: {
    scale: "docs/evidence/position-scale.json",
    drift: "docs/evidence/position-drift.json",
    topics: "docs/evidence/protocol-topics.json",
    e2e: "docs/evidence/position-stack-e2e.txt",
  },
  capturedAt: scale.capturedAt,
  scale: {
    rpc: scale.rpc,
    latestBlock: scale.params.latestBlock,
    chunk: scale.params.chunk,
    rpcCallsUsed: scale.rpcCallsUsed,
    assetSymbol: scale.asset.symbol,
    aToken: scale.asset.aToken,
    method: scale.method,
    skipped: scale.skipped,
    summary: scale.summary,
    wallets,
  },
  drift: {
    wallet: drift.wallet,
    short: `${drift.wallet.slice(0, 6)}…${drift.wallet.slice(-4)}`,
    pool: drift.pool,
    totalEvents: drift.totalEvents,
    poolTotals: drift.poolTotals,
    reserves,
    weth,
  },
  topics: {
    window: topics.window,
    rpc: topics.rpc,
    chainlink: topics.chainlink,
    note: topics.note,
    confirmedCount: confirmedTopics.length,
    totalCount: topics.topics.length,
    rows: topicRows,
    negativeControls,
  },
  e2e: { ...e2e, ...e2eDisplay },
};

const header = `// AUTO-GENERATED. Do not edit by hand.
//
// Regenerate with:  cd app && node scripts/gen-evidence-module.mjs
//
// Every value below is copied verbatim from the artifacts in docs/evidence/, which were
// produced from real Ethereum mainnet reads. Edit the artifact and regenerate; do not
// hand-tune a number here.

`;

writeFileSync(
  new URL("../src/lib/mainnetEvidence.ts", import.meta.url),
  `${header}export const EVIDENCE = ${JSON.stringify(out, null, 2)} as const;\n`,
);

const n = (v) => `${v} wallets`;
console.log(`wrote src/lib/mainnetEvidence.ts`);
console.log(`  scale:   ${n(wallets.length)}  within10bps=${scale.summary.ledgerWithin10Bps}  maxResidualBps=${scale.summary.largestResidualBps}`);
console.log(`  drift:   ${reserves.length} reserves, WETH naive-vs-real ${weth.naiveSupplyDisplay} vs ${weth.realSupplyDisplay} (${weth.supplyDriftPct})`);
console.log(`  topics:  ${confirmedTopics.length}/${topics.topics.length} confirmed, ${negativeControls.length} negative controls`);
console.log(`  e2e:     gasTotal=${e2e.gasTotal}`);
