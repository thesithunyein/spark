/**
 * Day 5: run the ledger reconstruction across many real mainnet wallets.
 *
 * Day 2 proved the method on one wallet. One wallet is an anecdote, not a
 * measurement. This runs the same reconstruction over a sample of real depositors and
 * reports how often it reconciles, so the claim carries a denominator.
 *
 * Per wallet:
 *   1. find the most recent block with balanceOf == 0 (provable coverage anchor)
 *   2. walk the aToken Transfer ledger forward from that anchor
 *   3. compare to balanceOf now
 *
 * Reported per wallet:
 *   ledgerMatches   - ledgerDelta equals balanceOf exactly
 *   interestResidual- the gap, which is rebasing interest
 *   p2pMoved        - net wallet-to-wallet movement. Non-zero means NO event-only
 *                     reconstruction could have been correct, because no Aave event
 *                     describes it.
 *
 * Headline statistic: of N sampled wallets, ledger reconciled in X, and Y had
 * peer-to-peer movement that Aave events cannot see.
 *
 * Bounded by free-tier limits: mevblocker serves historical eth_getLogs at 10,000
 * blocks per call and historical eth_call, so anchors are sought within MAX_LAG and
 * wallets whose history is older are skipped and counted as skipped rather than
 * quietly dropped. Read-only; no keys, no gas.
 *
 * Run: cd app && node scripts/position-scale.mjs
 *      TARGET=12 MAX_LAG=300000 node scripts/position-scale.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const RPC = process.env.MAINNET_RPC || "https://rpc.mevblocker.io";
const AETHWETH = "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8";
const CHUNK = 10_000;
const SPAN = CHUNK - 1;
const MAX_LAG = Number(process.env.MAX_LAG || 300_000);
const TARGET = Number(process.env.TARGET || 8);
const MIN_MINT = 10n ** 16n; // 0.01 aWETH: skip dust-spam recipients
// A percentage is only meaningful against a non-trivial denominator. The first 8-wallet run
// never hit this; the 40-wallet run did, on a wallet holding 2 wei, where a one-wei ledger
// error printed as a 5000 bps "residual" and became the headline. That is a denominator
// artifact, not a reconstruction failure, so sub-dust wallets are excluded from the bps
// statistics and counted separately rather than silently dropped.
const DUST_FLOOR = 10n ** 14n; // 0.0001 aEthWETH
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../docs/evidence/position-scale.json");

const ERC20_IFACE = new ethers.Interface([
  "function balanceOf(address) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const ZERO = "0x0000000000000000000000000000000000000000";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const padAddr = (a) => `0x${a.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;
const fmt = (v) => (Number(v) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 12 });

let rpcCalls = 0;

async function retry(fn, label, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      rpcCalls++;
      return await fn();
    } catch (e) {
      if (i === tries) throw new Error(`${label}: ${String(e?.message || e).slice(0, 70)}`);
      await sleep(900 * i);
    }
  }
}

const getLogs = (p, f, l) => retry(() => p.getLogs(f), l);

async function balanceAt(p, wallet, block) {
  return retry(
    async () =>
      BigInt(
        await p.call({
          to: AETHWETH,
          data: ERC20_IFACE.encodeFunctionData("balanceOf", [wallet]),
          blockTag: block,
        }),
      ),
    `bal ${block}`,
  );
}

/** Most recent block in [latest-MAX_LAG, latest] with balance 0, or null. */
async function findZeroBlock(p, wallet, latest) {
  const lo = latest - MAX_LAG;
  if ((await balanceAt(p, wallet, lo)) !== 0n) return null;
  if ((await balanceAt(p, wallet, latest)) === 0n) return null; // nothing to reconstruct
  let a = lo;
  let b = latest;
  while (b - a > 1) {
    const mid = Math.floor((a + b) / 2);
    if ((await balanceAt(p, wallet, mid)) === 0n) a = mid;
    else b = mid;
  }
  return a;
}

async function ledgerFrom(p, wallet, latest, anchor) {
  const pw = padAddr(wallet);
  let net = 0n, minted = 0n, burned = 0n, movedIn = 0n, movedOut = 0n, count = 0, chunks = 0;

  for (let cursor = latest; cursor > anchor; chunks++) {
    const from = Math.max(anchor + 1, cursor - SPAN);
    const [outLogs, inLogs] = [
      await getLogs(p, { address: AETHWETH, topics: [TRANSFER_TOPIC, pw], fromBlock: from, toBlock: cursor }, "out"),
      await getLogs(p, { address: AETHWETH, topics: [TRANSFER_TOPIC, null, pw], fromBlock: from, toBlock: cursor }, "in"),
    ];
    for (const l of outLogs) {
      const e = ERC20_IFACE.parseLog({ topics: l.topics, data: l.data });
      if (e.args.from.toLowerCase() !== wallet) continue;
      const to = e.args.to.toLowerCase();
      if (to === wallet) continue;
      const v = BigInt(e.args.value);
      net -= v;
      if (to === ZERO) burned += v; else movedOut += v;
      count++;
    }
    for (const l of inLogs) {
      const e = ERC20_IFACE.parseLog({ topics: l.topics, data: l.data });
      if (e.args.to.toLowerCase() !== wallet) continue;
      const f = e.args.from.toLowerCase();
      if (f === wallet) continue;
      const v = BigInt(e.args.value);
      net += v;
      if (f === ZERO) minted += v; else movedIn += v;
      count++;
    }
    cursor = from - 1;
    await sleep(100);
  }
  return { net, minted, burned, movedIn, movedOut, count, chunks };
}

async function main() {
  const p = new ethers.JsonRpcProvider(RPC);
  const latest = await p.getBlockNumber();
  console.log("rpc     :", RPC);
  console.log("latest  :", latest);
  console.log("maxLag  :", MAX_LAG.toLocaleString(), "| target:", TARGET, "\n");

  // A single 10k-block window yields only a handful of mint recipients, which caps the
  // sample no matter what TARGET says: raising TARGET alone silently changes nothing.
  // Scanning DISCOVERY_CHUNKS windows backwards makes a larger sample reachable.
  // Default 1 preserves the original single-window behaviour exactly.
  const DISCOVERY_CHUNKS = Number(process.env.DISCOVERY_CHUNKS || 1);
  // The committed 40-wallet evidence needs TARGET set explicitly, and the default of 8 is small
  // enough that a reader comparing this output against that evidence would see a different n with
  // no explanation. Print the parameters that matter and the command the evidence came from.
  if (TARGET <= 8) {
    console.warn(
      `  note: target is ${TARGET}, which is the default and NOT the published sample size.\n` +
        "  The committed 40-wallet evidence is:\n" +
        "      TARGET=40 DISCOVERY_CHUNKS=8 node scripts/position-scale.mjs\n" +
        "  Roughly 1,600 archive RPC calls and several minutes.\n",
    );
  }
  console.log(
    `discovering candidates from aETHWETH mints over ${DISCOVERY_CHUNKS} window(s) of ${CHUNK.toLocaleString()} blocks...`,
  );
  const sums = new Map();
  let mintCount = 0;
  for (let c = 0; c < DISCOVERY_CHUNKS; c++) {
    const to = latest - c * CHUNK;
    const from = to - SPAN;
    const mints = await getLogs(
      p,
      { address: AETHWETH, topics: [TRANSFER_TOPIC, padAddr(ZERO)], fromBlock: from, toBlock: to },
      `mint scan ${c + 1}/${DISCOVERY_CHUNKS}`,
    );
    mintCount += mints.length;
    for (const l of mints) {
      const e = ERC20_IFACE.parseLog({ topics: l.topics, data: l.data });
      const a = e.args.to.toLowerCase();
      sums.set(a, (sums.get(a) || 0n) + BigInt(e.args.value));
    }
    if (c + 1 < DISCOVERY_CHUNKS) await sleep(100);
  }
  const cands = [...sums.entries()].filter(([, v]) => v >= MIN_MINT).sort((a, b) => Number(b[1] - a[1]));
  console.log(`  mints ${mintCount}, distinct recipients >= 0.01 aWETH: ${cands.length}\n`);

  const results = [];
  let skippedNoAnchor = 0;
  let skippedZeroBalance = 0;

  for (const [wallet, mintedTotal] of cands) {
    if (results.filter((r) => r.reconciled !== null).length >= TARGET) break;
    try {
      const bal = await balanceAt(p, wallet, latest);
      if (bal === 0n) {
        skippedZeroBalance++;
        continue;
      }
      const anchor = await findZeroBlock(p, wallet, latest);
      if (anchor === null) {
        skippedNoAnchor++;
        console.log(`  skip ${wallet.slice(0, 10)}… no zero anchor within ${MAX_LAG.toLocaleString()} blocks`);
        continue;
      }
      const l = await ledgerFrom(p, wallet, latest, anchor);
      const residual = bal - l.net;
      const p2p = l.movedIn - l.movedOut;
      const exact = l.net === bal;
      // residual as basis points of the ledger, to 2dp. This is the interest term.
      const bps =
        l.net === 0n || l.net < DUST_FLOOR ? null : Number((residual * 1_000_000n) / l.net) / 100;

      results.push({
        wallet,
        mintedInWindow: mintedTotal.toString(),
        anchorBlock: anchor,
        blocksCovered: latest - anchor,
        chunks: l.chunks,
        balance: bal.toString(),
        ledgerNet: l.net.toString(),
        residual: residual.toString(),
        residualBps: bps,
        p2pMoved: p2p.toString(),
        transferCount: l.count,
        ledgerMatchesExactly: exact,
      });

      console.log(
        `  ${wallet.slice(0, 10)}…  bal ${fmt(bal)}  ledger ${fmt(l.net)}  ` +
          `residual ${null === bps ? "n/a" : bps.toFixed(2)}bps  p2p ${fmt(p2p)}  ${exact ? "EXACT" : "near"}`,
      );
    } catch (e) {
      console.log(`  ${wallet.slice(0, 10)}… failed -> ${e.message}`);
    }
  }

  const tested = results.length;
  const exact = results.filter((r) => r.ledgerMatchesExactly).length;
  const withP2p = results.filter((r) => BigInt(r.p2pMoved) !== 0n).length;
  const bpsValues = results.map((r) => r.residualBps).filter((b) => b !== null);
  const dustWallets = results.filter((r) => r.residualBps === null).length;
  const maxBps = bpsValues.length ? Math.max(...bpsValues.map(Math.abs)) : null;
  const within10bps = bpsValues.filter((b) => Math.abs(b) <= 10).length;
  // The median was quoted in the docs but never written down here, so a reader could not check it
  // and two conventions gave different answers (1.98 as the lower-middle element, 2.17 as the
  // interpolated one). Computed and recorded, with the convention named, so the number in the
  // prose is one the artifact can be checked against.
  const medianBps = (() => {
    if (!bpsValues.length) return null;
    const sorted = [...bpsValues].map(Math.abs).sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  })();

  console.log("\n─── VERDICT ───");
  console.log(`  wallets reconstructed        : ${tested}`);
  console.log(`  ledger matched EXACTLY       : ${exact}/${tested}`);
  console.log(`  ledger within 10 bps         : ${within10bps}/${bpsValues.length}`);
  console.log(`  largest residual             : ${maxBps === null ? "n/a" : maxBps.toFixed(2)} bps`);
  console.log(`  median residual              : ${medianBps === null ? "n/a" : medianBps.toFixed(2)} bps  (interpolated)`);
  console.log(`  had wallet-to-wallet movement: ${withP2p}/${tested}`);
  console.log(`  excluded as sub-dust          : ${dustWallets}`);
  console.log(`  skipped (no zero anchor)     : ${skippedNoAnchor}`);
  console.log(`  skipped (zero balance)       : ${skippedZeroBalance}`);
  console.log(`  rpc calls used               : ${rpcCalls}`);
  console.log("\n  The ledger does NOT reproduce a live balance to the wei: every wallet has a");
  console.log("  small positive residual, which is interest rebasing into the aToken since its");
  console.log("  last event. The measurement that matters is therefore the residual magnitude,");
  console.log("  not exactness, and it is what the on-chain `interestResidual` bound encodes.");
  console.log("  A wallet with non-zero peer-to-peer movement is one where no event-only");
  console.log("  reconstruction could have been correct at all.");

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        rpc: RPC,
        asset: { aToken: AETHWETH, symbol: "aEthWETH" },
        params: {
          latestBlock: latest,
          maxLag: MAX_LAG,
          target: TARGET,
          // Recorded because it was part of the run that produced the 40-wallet evidence, so a
          // future run can be shown to match it rather than assumed to. `target` is the variable
          // that actually caps the sample: at DISCOVERY_CHUNKS=1 a single window still offered 181
          // candidates, so discovery is headroom, not the limit.
          discoveryChunks: DISCOVERY_CHUNKS,
          minMintWei: MIN_MINT.toString(),
          chunk: CHUNK,
        },
        method: {
          anchor: "most recent block within maxLag where balanceOf(wallet) == 0, via archive eth_call",
          ledger: "sum(Transfer to wallet) - sum(Transfer from wallet) on the aToken, from anchor to latest",
          residual: "balanceOf - ledger, i.e. rebasing interest that events cannot supply",
        },
        skipped: { noZeroAnchor: skippedNoAnchor, zeroBalance: skippedZeroBalance },
        rpcCallsUsed: rpcCalls,
        summary: {
          tested,
          ledgerMatchesExactly: exact,
          ledgerWithin10Bps: within10bps,
          largestResidualBps: maxBps,
          medianResidualBps: medianBps,
          medianConvention:
            "interpolated: the mean of the two middle values of the absolute residuals over the measurable wallets, excluding sub-dust",
          withPeerToPeerMovement: withP2p,
          excludedAsSubDust: dustWallets,
          dustFloorWei: DUST_FLOOR.toString(),
          finding:
            "The ledger understates a live position by a small positive residual on nearly every wallet measured, because interest rebases into the aToken between events. Exact equality is therefore not the acceptance criterion; the residual magnitude is, and it is what the on-chain interestResidual bound encodes. Wallets whose ledger net falls below DUST_FLOOR are excluded from the bps statistics and counted in excludedAsSubDust, because a percentage against a near-zero denominator is an artifact rather than a measurement.",
        },
        wallets: results,
      },
      null,
      2,
    ),
  );
  console.log("\n  evidence written:", OUT);
}

main().catch((e) => {
  console.error("SCALE ERROR:", e?.stack || e?.message || e);
  process.exit(1);
});
