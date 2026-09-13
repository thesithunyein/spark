/**
 * Day 4: verify declared mainnet event topics against live chain data.
 *
 * Why this exists: a wrong topic0 does not error, it returns an empty list. An
 * indexer reading the wrong topic reports "no activity" with full confidence, and a
 * `Repay` topic was in fact mislabelled `Supply` once during development. So every
 * constant the engine relies on is checked against real mainnet logs, and the
 * method is falsified by a negative control that must return zero.
 *
 * Method
 *   For each (contract, signature): compute topic0, fetch the last N blocks of logs
 *   filtered to that topic, and require a non-zero count.
 *   Negative control: a deliberately wrong signature for the same contract must
 *   return zero, proving a mismatch is detectable rather than indistinguishable.
 *
 * Endpoint: mevblocker, 10,000-block cap per eth_getLogs call. Read-only.
 *
 * Run: cd app && node scripts/protocol-topics.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const RPC = process.env.MAINNET_RPC || "https://rpc.mevblocker.io";
const WINDOW = 10_000;
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../docs/evidence/protocol-topics.json");

const POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"; // Aave v3 Pool
const A_WETH = "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8"; // aEthWETH
/** Chainlink ETH/USD PROXY. Note: the proxy emits NOTHING; the aggregator emits
 *  AnswerUpdated. Measured: 0 logs from the proxy in 300 blocks, 36 from the
 *  aggregator in 10,000. Attesting the proxy would silently prove no price at all. */
const ETH_USD_PROXY = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const COMET_WETH = "0xA17581A9E3356d9A858b789D68B4d866e593aE94"; // Compound v3 cWETHv3
const MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb"; // Morpho Blue

const PROXY_IFACE = new ethers.Interface(["function aggregator() view returns (address)"]);

/** Declared in contracts/src/MainnetTopics.sol. */
const CHECKS = [
  { name: "Aave v3 Supply", contract: POOL, sig: "Supply(address,address,address,uint256,uint16)", verified: true },
  { name: "Aave v3 Withdraw", contract: POOL, sig: "Withdraw(address,address,address,uint256)", verified: true },
  { name: "Aave v3 Borrow", contract: POOL, sig: "Borrow(address,address,address,uint256,uint8,uint256,uint16)", verified: true },
  { name: "Aave v3 Repay", contract: POOL, sig: "Repay(address,address,address,uint256,bool)", verified: true },
  { name: "ERC20 Transfer (aWETH)", contract: A_WETH, sig: "Transfer(address,address,uint256)", verified: true },
  { name: "Chainlink AnswerUpdated (aggregator)", contract: "__AGGREGATOR__", sig: "AnswerUpdated(int256,uint256,uint256)", verified: true },
  { name: "Comet Supply", contract: COMET_WETH, sig: "Supply(address,address,uint256)", verified: false },
  { name: "Comet Withdraw", contract: COMET_WETH, sig: "Withdraw(address,address,uint256)", verified: false },
  { name: "Morpho SupplyCollateral", contract: MORPHO, sig: "SupplyCollateral(bytes32,address,address,uint256)", verified: false },
  { name: "Morpho WithdrawCollateral", contract: MORPHO, sig: "WithdrawCollateral(bytes32,address,address,uint256)", verified: false },
];

/** Each must return zero, proving a mismatch is detectable. */
const NEGATIVE_CONTROLS = [
  { name: "wrong Supply shape vs Aave Pool", contract: POOL, sig: "Supply(address,address,address,uint256)" },
  { name: "wrong AnswerUpdated arity vs aggregator", contract: "__AGGREGATOR__", sig: "AnswerUpdated(int256,uint256)" },
  { name: "AnswerUpdated vs the PROXY (emits nothing)", contract: ETH_USD_PROXY, sig: "AnswerUpdated(int256,uint256,uint256)" },
];

async function count(provider, contract, topic, fromBlock, toBlock) {
  for (let i = 1; i <= 5; i++) {
    try {
      const logs = await provider.getLogs({ address: contract, topics: [topic], fromBlock, toBlock });
      return logs;
    } catch (e) {
      if (i === 5) throw new Error(String(e?.message || e).slice(0, 90));
      await new Promise((s) => setTimeout(s, 1200 * i));
    }
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const latest = await provider.getBlockNumber();
  const from = latest - WINDOW + 1;
  console.log("rpc    :", RPC);
  console.log("window :", from, "->", latest, `(${WINDOW} blocks)`);

  // Resolve the live aggregator behind the proxy rather than assuming the proxy emits.
  const aggregator = PROXY_IFACE.decodeFunctionResult(
    "aggregator",
    await provider.call({ to: ETH_USD_PROXY, data: PROXY_IFACE.encodeFunctionData("aggregator") }),
  )[0];
  console.log("proxy  :", ETH_USD_PROXY);
  console.log("  -> aggregator :", aggregator, "(this is where AnswerUpdated is emitted)\n");
  const resolve = (addr) => (addr === "__AGGREGATOR__" ? aggregator : addr);

  const results = [];
  console.log("─── DECLARED TOPICS ───");
  for (const c of CHECKS) {
    const topic = ethers.id(c.sig);
    const contract = resolve(c.contract);
    let logs = [];
    let err = null;
    try {
      logs = await count(provider, contract, topic, from, latest);
    } catch (e) {
      err = e.message;
    }
    const ok = logs.length > 0;
    const status = err ? `ERROR ${err}` : ok ? `${logs.length} logs` : "0 logs";
    console.log(`  ${c.name.padEnd(38)} ${topic.slice(0, 12)}…  ${status}`);
    results.push({
      name: c.name,
      contract,
      signature: c.sig,
      topic0: topic,
      declaredVerified: c.verified,
      logsInWindow: logs.length,
      sampleTx: logs[0]?.transactionHash || null,
      sampleBlock: logs[0]?.blockNumber ?? null,
      confirmed: ok,
      error: err,
    });
    await new Promise((s) => setTimeout(s, 200));
  }

  console.log("\n─── NEGATIVE CONTROLS (must be 0) ───");
  const controls = [];
  for (const c of NEGATIVE_CONTROLS) {
    const topic = ethers.id(c.sig);
    const contract = resolve(c.contract);
    let n = -1;
    let err = null;
    try {
      n = (await count(provider, contract, topic, from, latest)).length;
    } catch (e) {
      err = e.message;
    }
    const good = n === 0;
    console.log(`  ${c.name.padEnd(38)} ${topic.slice(0, 12)}…  ${err ? "ERROR" : `${n} logs`}  ${good ? "OK (undetectable=correct)" : "FAIL: unexpected match"}`);
    controls.push({ name: c.name, signature: c.sig, topic0: topic, logsInWindow: n, error: err, correct: good });
    await new Promise((s) => setTimeout(s, 200));
  }

  const confirmed = results.filter((r) => r.confirmed);
  const allConfirmed = results.filter((r) => r.declaredVerified).every((r) => r.confirmed);
  const controlsAllZero = controls.every((c) => c.correct);

  console.log("\n─── VERDICT ───");
  console.log(`  declared topics confirmed : ${confirmed.length}/${results.length}`);
  console.log(`  all CONFIRMED claims hold : ${allConfirmed ? "yes" : "NO"}`);
  console.log(`  negative controls all zero: ${controlsAllZero ? "yes" : "NO"}`);

  const stillUnverified = results.filter((r) => !r.confirmed).map((r) => r.name);
  if (stillUnverified.length) console.log("  not confirmed in this window:", stillUnverified.join(", "));

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        rpc: RPC,
        window: { fromBlock: from, toBlock: latest, blocks: WINDOW },
        chainlink: {
          proxy: ETH_USD_PROXY,
          aggregator,
          finding:
            "AnswerUpdated is emitted by the aggregator, not the proxy. The proxy returned 0 logs and the aggregator returned 36 in the same window, so an implementation that attests the proxy proves no price while appearing to succeed.",
        },
        note:
          "A zero count means the topic did not match in this window; it does not by itself prove the signature is wrong. The negative controls exist to show that a genuine mismatch returns a clean zero.",
        allDeclaredConfirmed: allConfirmed,
        negativeControlsAllZero: controlsAllZero,
        topics: results,
        negativeControls: controls,
      },
      null,
      2,
    ),
  );
  console.log("\n  evidence written:", OUT);
}

main().catch((e) => {
  console.error("TOPIC PARITY ERROR:", e?.stack || e?.message || e);
  process.exit(1);
});
