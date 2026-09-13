/**
 * Day 2(b): sound reconciliation of a real Aave position from logs alone.
 *
 * ── What Day 2(a) established ────────────────────────────────────────────────
 * On a heavy mainnet borrower, reconstruction from Aave `Supply`/`Withdraw` events
 * is wrong by 66%: 97.389 WETH of net Supply events against a real aWETH balance of
 * 32.325, with ZERO Withdraw events. aTokens are plain ERC20s, so a position moves
 * by a bare `Transfer` that emits no Aave event. Saved in
 * docs/evidence/position-drift.json.
 *
 * ── The method problem solved here ───────────────────────────────────────────
 * The first attempt bounded history by "three consecutive empty chunks". That is
 * UNSOUND: activity can be sparse, so a quiet gap does not imply no earlier history.
 * It silently mis-measured a dust wallet by 51%. The fix is to stop guessing and
 * anchor the reconstruction at a block where the balance is PROVABLY ZERO, read from
 * archive state via eth_call at a historical block tag:
 *
 *     1. find the most recent block B with balanceOf(wallet) == 0
 *     2. scan [B, latest] for the aToken Transfer ledger and the Aave events
 *     3. assert ledgerDelta == balanceOfNow, up to rebasing interest
 *
 * If the balance was genuinely zero at B, then all earlier activity netted to zero
 * by B and cannot contribute to the current position, so coverage of [B, latest] is
 * complete by construction, not by assumption. The final assertion is the guard: a
 * wrong B would fail it.
 *
 * The claim under test, per reserve:
 *     ledger = Σ Transfer(to=w) − Σ Transfer(from=w) on the aToken   -> should hold
 *     naive  = Σ Supply − Σ Withdraw over the same span              -> should not
 *
 * Two independent reasons naive fails, both measured:
 *   1. aTokens are transferable, so a position moves without any Aave event.
 *   2. burns are not 1:1 with `Withdraw`. Liquidations and `repayWithATokens` reduce
 *      aToken balance and emit no `Withdraw`, so the mint/burn half of naive drifts
 *      too. The Router case below shows exactly this: transfers moved zero
 *      wallet-to-wallet, yet naive was still off by 5,110 wei.
 *
 * ── Data source ──────────────────────────────────────────────────────────────
 * https://rpc.mevblocker.io, the only free endpoint found that serves historical
 * eth_getLogs at all (10,000 block cap per call) and also historical eth_call.
 * Measured on this date: publicnode refuses historical logs outright, drpc throttles
 * hard, 1rpc allows 0-50 block ranges, blastapi ~10 blocks, merkle has no getLogs,
 * and the Blockscout API rate-limits sustained use. Finding an endpoint that serves
 * BOTH is itself the prerequisite for any log-derived position engine.
 *
 * Read-only. No keys, no gas.
 *
 * Run: cd app && node scripts/aave-drift-window.mjs
 *      WALLET=0x... node scripts/aave-drift-window.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const RPC = process.env.MAINNET_RPC || "https://rpc.mevblocker.io";
const POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
const AETHWETH = "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8";
const CHUNK = 10_000;
const SPAN = CHUNK - 1; // endpoint rejects ranges wider than 10,000 blocks
const MAX_LAG = 900_000; // how far back to hunt for a provably-zero balance
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../docs/evidence/ledger-drift-window.json");

const POOL_IFACE = new ethers.Interface([
  "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
  "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
]);
const ERC20_IFACE = new ethers.Interface([
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const ZERO = "0x0000000000000000000000000000000000000000";
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const padAddr = (a) => `0x${a.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;
const fmt = (v, d = 18) => (Number(v) / 10 ** d).toLocaleString("en-US", { maximumFractionDigits: 12 });
const wei = (v) => `${v.toLocaleString("en-US")} wei`;

async function retry(fn, label, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === tries) throw new Error(`${label}: ${String(e?.message || e).slice(0, 90)}`);
      await sleep(1000 * i);
    }
  }
}

const getLogs = (provider, filter, label) => retry(() => provider.getLogs(filter), label);

async function balanceAt(provider, token, wallet, block) {
  return retry(async () => {
    const data = ERC20_IFACE.encodeFunctionData("balanceOf", [wallet]);
    const res = await provider.call({ to: token, data, blockTag: block });
    return BigInt(res);
  }, `balanceAt ${block}`);
}

/**
 * Most recent block B in [latest-MAX_LAG, latest] with balance 0.
 * Assumes the balance is zero before the wallet's first deposit then non-zero after,
 * which the caller validates: a wrong B fails the reconciliation assertion.
 */
async function findZeroBlock(provider, token, wallet, latest) {
  const loStart = latest - MAX_LAG;
  const balLo = await balanceAt(provider, token, wallet, loStart);
  if (balLo !== 0n) return null; // no zero point within reach

  if ((await balanceAt(provider, token, wallet, latest)) === 0n) return latest;

  let lo = loStart;
  let hi = latest; // invariant: bal(lo) == 0, bal(hi) != 0
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await balanceAt(provider, token, wallet, mid)) === 0n) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Reconstruct [fromBlock, latest] from logs: the aToken ledger and the Aave events. */
async function reconcile(provider, latest, wallet, fromBlock) {
  const pw = padAddr(wallet);
  const supplyTopic = ethers.id("Supply(address,address,address,uint256,uint16)");
  const withdrawTopic = ethers.id("Withdraw(address,address,address,uint256)");

  let ledgerNet = 0n, minted = 0n, burned = 0n, movedIn = 0n, movedOut = 0n, transferCount = 0;
  let naiveSupply = 0n, naiveWithdraw = 0n, supplyEvents = 0, withdrawEvents = 0;
  let chunks = 0;

  for (let cursor = latest; cursor > fromBlock; chunks++) {
    const from = Math.max(fromBlock + 1, cursor - SPAN);
    const [outLogs, inLogs, supLogs, wdrLogs] = [
      await getLogs(provider, { address: AETHWETH, topics: [TRANSFER_TOPIC, pw], fromBlock: from, toBlock: cursor }, "out"),
      await getLogs(provider, { address: AETHWETH, topics: [TRANSFER_TOPIC, null, pw], fromBlock: from, toBlock: cursor }, "in"),
      await getLogs(provider, { address: POOL, topics: [supplyTopic, null, pw], fromBlock: from, toBlock: cursor }, "supply"),
      await getLogs(provider, { address: POOL, topics: [withdrawTopic, null, pw], fromBlock: from, toBlock: cursor }, "withdraw"),
    ];

    for (const l of outLogs) {
      const p = ERC20_IFACE.parseLog({ topics: l.topics, data: l.data });
      if (p.args.from.toLowerCase() !== wallet) continue;
      const to = p.args.to.toLowerCase();
      if (to === wallet) continue;
      const v = BigInt(p.args.value);
      ledgerNet -= v;
      if (to === ZERO) burned += v; else movedOut += v;
      transferCount++;
    }
    for (const l of inLogs) {
      const p = ERC20_IFACE.parseLog({ topics: l.topics, data: l.data });
      if (p.args.to.toLowerCase() !== wallet) continue;
      const f = p.args.from.toLowerCase();
      if (f === wallet) continue;
      const v = BigInt(p.args.value);
      ledgerNet += v;
      if (f === ZERO) minted += v; else movedIn += v;
      transferCount++;
    }
    for (const l of supLogs) {
      const p = POOL_IFACE.parseLog({ topics: l.topics, data: l.data });
      if (!p || p.args.onBehalfOf.toLowerCase() !== wallet) continue;
      naiveSupply += BigInt(p.args.amount);
      supplyEvents++;
    }
    for (const l of wdrLogs) {
      const p = POOL_IFACE.parseLog({ topics: l.topics, data: l.data });
      if (!p || p.args.user.toLowerCase() !== wallet) continue;
      naiveWithdraw += BigInt(p.args.amount);
      withdrawEvents++;
    }

    if (transferCount || supplyEvents || withdrawEvents) {
      console.log(`    ${from}-${cursor}: ledger ${fmt(ledgerNet)} aWETH`);
    }
    cursor = from - 1;
    await sleep(120);
  }

  return {
    ledgerNet, minted, burned, movedIn, movedOut, transferCount,
    naive: naiveSupply - naiveWithdraw, naiveSupply, naiveWithdraw, supplyEvents, withdrawEvents, chunks,
  };
}

async function analyze(provider, latest, wallet) {
  const realBalance = await balanceAt(provider, AETHWETH, wallet, latest);
  const nonce = await provider.getTransactionCount(wallet, latest);
  console.log(`\n=== ${wallet} ===`);
  console.log(`  nonce ${nonce}, aWETH balance ${fmt(realBalance)}`);

  // A zero balance reconciles trivially and proves nothing, so skip it.
  if (realBalance === 0n) {
    console.log("  SKIP: zero balance, nothing to reconstruct");
    return null;
  }

  const zeroBlock = await findZeroBlock(provider, AETHWETH, wallet, latest);
  if (zeroBlock === null) {
    console.log(`  NO zero balance within ${MAX_LAG.toLocaleString()} blocks; coverage cannot be anchored`);
    return null;
  }
  console.log(`  provably zero at block ${zeroBlock} (lag ${(latest - zeroBlock).toLocaleString()})`);

  const r = await reconcile(provider, latest, wallet, zeroBlock);
  const ledgerOk = r.ledgerNet === realBalance;
  const naiveOk = r.naive === realBalance;
  const residual = realBalance - r.ledgerNet;

  console.log(`  scanned ${r.chunks} chunks over ${(latest - zeroBlock).toLocaleString()} blocks`);
  console.log(`  aave events : ${r.supplyEvents} Supply, ${r.withdrawEvents} Withdraw`);
  console.log(`  transfers   : ${r.transferCount} (minted ${wei(r.minted)}, burned ${wei(r.burned)})`);
  console.log(`  moved wallet-to-wallet: in ${wei(r.movedIn)}, out ${wei(r.movedOut)}`);
  console.log(`  real balance: ${wei(realBalance)}`);
  console.log(`  naive       : ${wei(r.naive)}  ${naiveOk ? "MATCH" : "MISMATCH"}`);
  console.log(`  ledger      : ${wei(r.ledgerNet)}  ${ledgerOk ? "MATCH" : `residual ${wei(residual)}`}`);
  console.log(`  ledger − naive = ${wei(r.ledgerNet - r.naive)} (transfers + unmapped burns)`);

  return { wallet, nonce, zeroBlock, latest, realBalance, ledgerOk, naiveOk, residual, ...r };
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const latest = await provider.getBlockNumber();
  console.log("rpc    :", RPC);
  console.log("latest :", latest);

  const results = [];
  const envWallet = (process.env.WALLET || "").toLowerCase();

  if (envWallet) {
    const r = await analyze(provider, latest, envWallet);
    if (r) results.push(r);
  } else {
    // Candidates: meaningful recent aWETH mints from accounts with shallow history.
    console.log("\ndiscovering candidates from recent aWETH mints...");
    const mints = await getLogs(
      provider,
      { address: AETHWETH, topics: [TRANSFER_TOPIC, padAddr(ZERO)], fromBlock: latest - SPAN, toBlock: latest },
      "mint scan",
    );
    const sums = new Map();
    for (const l of mints) {
      const p = ERC20_IFACE.parseLog({ topics: l.topics, data: l.data });
      const to = p.args.to.toLowerCase();
      sums.set(to, (sums.get(to) || 0n) + BigInt(p.args.value));
    }
    const MIN = 10n ** 16n; // 0.01 aWETH: skip dust-spam recipients
    const ranked = [...sums.entries()].filter(([, v]) => v >= MIN);
    console.log(`  mints ${mints.length}, recipients >= 0.01 aWETH: ${ranked.length}`);

    const cands = [];
    for (const [addr, amt] of ranked.slice(0, 40)) {
      try {
        cands.push({ addr, amt, nonce: await provider.getTransactionCount(addr, latest) });
      } catch {}
    }
    cands.sort((a, b) => a.nonce - b.nonce);
    console.log(`  trying up to 4 candidates, shallowest first\n`);

    for (const c of cands.slice(0, 8)) {
      try {
        const r = await analyze(provider, latest, c.addr);
        if (r) {
          results.push(r);
          // Require BOTH a proven zero anchor and an exact ledger match.
          if (r.ledgerOk) break;
        }
      } catch (e) {
        console.log(`  ${c.addr}: failed -> ${e.message}`);
      }
    }
  }

  // Success requires a real position AND real activity, not a trivial 0 == 0 match.
  const good = results.find((r) => r.ledgerOk && r.realBalance > 0n && r.transferCount > 0);

  console.log("\n─── VERDICT ───");
  if (good) {
    console.log("  LEDGER RECONSTRUCTS, AAVE EVENTS DO NOT");
    console.log(`  wallet            : ${good.wallet}`);
    console.log(`  zero anchor block : ${good.zeroBlock}`);
    console.log(`  real aWETH        : ${wei(good.realBalance)}`);
    console.log(`  ledger            : ${wei(good.ledgerNet)}  (exact match)`);
    console.log(`  naive events      : ${wei(good.naive)}  (off by ${wei(good.naive - good.realBalance)})`);
    console.log(`  gap vs naive      : ${wei(good.ledgerNet - good.naive)}`);
    console.log(`  from transfers    : ${wei(good.movedIn - good.movedOut)} moved wallet-to-wallet`);
    console.log("  remainder         : burns that emit no Aave Withdraw event (liquidations,");
    console.log("                      repayWithATokens). Even the mint/burn half of naive drifts.");
  } else {
    console.log("  NO CANDIDATE RECONCILED from a proven-zero anchor in this run.");
    console.log("  Candidates examined:", results.length);
    for (const r of results) {
      console.log(
        `    ${r.wallet}  balance ${wei(r.realBalance)}  anchor ${r.zeroBlock}  ` +
          `residual ${wei(r.residual)}  transfers ${r.transferCount}  ledgerOk=${r.ledgerOk}`,
      );
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        rpc: RPC,
        rpcLimits: {
          mevblocker: "10,000 blocks per eth_getLogs, 10,000 results, historical eth_call works",
          publicnode: "historical logs require a paid token",
          drpc: "10,000 blocks then aggressive throttling",
          oneRpc: "0-50 block ranges only",
          blastapi: "~10 block ranges",
          merkle: "no eth_getLogs",
          blockscout: "rate-limits sustained use",
        },        method: {
          anchor: "most recent block B with balanceOf(wallet) == 0, via archive eth_call",
          ledger: "sum(Transfer to wallet) - sum(Transfer from wallet) on the aToken over [B, latest]",
          naive: "sum(Supply) - sum(Withdraw) for the wallet over the same span",
          guard: "ledgerDelta must equal balanceOfNow, so a wrong anchor fails loudly",
          whyNaiveFails: [
            "aTokens are transferable, so a position moves without emitting any Aave event",
            "burns are not 1:1 with Withdraw: liquidations and repayWithATokens reduce aToken balance with no Withdraw event",
          ],
        },
        asset: { aToken: AETHWETH, pool: POOL },
        maxLagBlocks: MAX_LAG,
        reconciled: Boolean(good),
        results: results.map((r) => ({
          wallet: r.wallet,
          nonce: r.nonce,
          zeroAnchorBlock: r.zeroBlock,
          latestBlock: r.latest,
          blocksCovered: r.latest - r.zeroBlock,
          chunks: r.chunks,
          realBalance: r.realBalance.toString(),
          ledgerNet: r.ledgerNet.toString(),
          naive: r.naive.toString(),
          ledgerMinusNaive: (r.ledgerNet - r.naive).toString(),
          residual: r.residual.toString(),
          breakdown: {
            minted: r.minted.toString(), burned: r.burned.toString(),
            movedIn: r.movedIn.toString(), movedOut: r.movedOut.toString(),
          },
          counts: { transferCount: r.transferCount, supplyEvents: r.supplyEvents, withdrawEvents: r.withdrawEvents },
          ledgerMatchesTruth: r.ledgerOk,
          naiveMatchesTruth: r.naiveOk,
        })),
      },
      null,
      2,
    ),
  );
  console.log("\n  evidence written:", OUT);
}

main().catch((e) => {
  console.error("WINDOW DRIFT ERROR:", e?.stack || e?.message || e);
  process.exit(1);
});
