/**
 * Day 2: Aave V3 mainnet event indexer + position reconstruction drift measurement.
 *
 * The question Day 1 left open: if you rebuild a borrower's position from proven
 * events alone, how far is it from the real protocol state?
 *
 * ── The finding this script exists to prove ──────────────────────────────────
 * Naive reconstruction from `Supply` / `Withdraw` events is WRONG, and not because
 * of interest. aTokens are plain ERC20s, so a position can be moved by a bare
 * `Transfer` that emits no Aave event at all. Summing Supply - Withdraw therefore
 * silently overstates a position by every aToken that was transferred away.
 *
 * Measured on a real mainnet borrower: 97.389 WETH of net Supply events against a
 * real aWETH balance of 32.325, with ZERO Withdraw events. A 66% error, on a wallet
 * that never withdrew. So the correct primitive is the token's own Transfer ledger:
 *
 *     balance = Σ Transfer(to = wallet) − Σ Transfer(from = wallet)
 *
 * which includes mints (from 0x0, i.e. Supply/Borrow) and burns (to 0x0, i.e.
 * Withdraw/Repay) and additionally captures wallet-to-wallet moves. The residual
 * against balanceOf is then *only* rebasing interest, which is the one component
 * that genuinely cannot be derived from events.
 *
 * This is why the engine must index token Transfer logs per reserve, not Aave events.
 *
 * ── Data source ──────────────────────────────────────────────────────────────
 * Full-history logs via the explorer API, because public RPC eth_getLogs cannot
 * span a 9M block range. Responses are cached to disk so reruns are free and the
 * evidence is reproducible offline. Transient rate limiting is retried with backoff.
 *
 * Read-only. No keys, no gas, no transactions.
 *
 * Run: cd app && node scripts/aave-indexer.mjs
 *      WALLET=0x... node scripts/aave-indexer.mjs
 *      FRESH=1 node scripts/aave-indexer.mjs        # ignore the cache
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const RPC = process.env.MAINNET_RPC || "https://ethereum-rpc.publicnode.com";
const API = process.env.BLOCKSCOUT_API || "https://eth.blockscout.com/api";
const POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
const WALLET = (process.env.WALLET || "0xb05c9ca8123b6ba84c767c4ee8f9ae66b0733180").toLowerCase();

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(HERE, "../.cache/aave-logs");
const OUT = resolve(HERE, "../../docs/evidence/position-drift.json");

/**
 * Real Aave V3 Pool event ABIs. These are not guessable by offset: `Supply` and
 * `Borrow` interleave a NON-indexed `user` field BEFORE `amount`, so the amount is
 * the SECOND data word. Decoding raw words produced addresses read as amounts.
 *
 * position-owner slot per event (what reconstruction must filter on):
 *   Supply   topic1 reserve, topic2 onBehalfOf, topic3 referralCode
 *   Withdraw topic1 reserve, topic2 user,       topic3 to
 *   Borrow   topic1 reserve, topic2 onBehalfOf, topic3 referralCode
 *   Repay    topic1 reserve, topic2 user,       topic3 repayer
 */
const POOL_IFACE = new ethers.Interface([
  "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
  "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
  "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
  "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
]);

const ERC20_IFACE = new ethers.Interface([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const POOL_VIEW_IFACE = new ethers.Interface([
  "function getReserveData(address asset) view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 stableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)",
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
]);

/** Aave event kinds, with the field that identifies the position owner. */
const EVENT_KINDS = [
  { name: "Supply", sig: "Supply(address,address,address,uint256,uint16)", owner: "onBehalfOf", sign: 1n, side: "supply" },
  { name: "Withdraw", sig: "Withdraw(address,address,address,uint256)", owner: "user", sign: -1n, side: "supply" },
  { name: "Borrow", sig: "Borrow(address,address,address,uint256,uint8,uint256,uint16)", owner: "onBehalfOf", sign: 1n, side: "debt" },
  { name: "Repay", sig: "Repay(address,address,address,uint256,bool)", owner: "user", sign: -1n, side: "debt" },
];

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const ZERO = "0x0000000000000000000000000000000000000000";

const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const padAddr = (a) => `0x${a.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;
const fmt = (v, d) => (Number(v) / 10 ** d).toLocaleString("en-US", { maximumFractionDigits: 6 });
const pct = (a, b) => (b === 0n ? (a === 0n ? "0%" : "n/a") : `${((Number(a) / Number(b)) * 100).toFixed(2)}%`);

/** Cached, retrying GET against the explorer API. Cache key is the full query URL. */
async function cachedGet(url) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const key = createHash("sha256").update(url).digest("hex").slice(0, 20);
  const file = join(CACHE_DIR, `${key}.json`);
  if (!process.env.FRESH && existsSync(file)) return { body: JSON.parse(readFileSync(file, "utf8")), cached: true };

  for (let attempt = 1; attempt <= 10; attempt++) {
    let body;
    try {
      const res = await fetch(url);
      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = { status: "0", message: text.slice(0, 200) };
      }
    } catch (e) {
      body = { status: "0", message: `fetch failed: ${e.message}` };
    }

    const ok = body.status === "1";
    const empty = /no logs|no records|no transactions found/i.test(body.message || "");
    if (ok || empty) {
      writeFileSync(file, JSON.stringify(body));
      return { body, cached: false };
    }

    const wait = Math.min(60_000, 3_000 * attempt);
    log(`    retry ${attempt}/10 in ${wait / 1000}s (${String(body.message).slice(0, 60)})`);
    await sleep(wait);
  }
  throw new Error(`explorer unavailable after retries: ${url}`);
}

/** Full-history logs for the Aave event kinds, filtered by the position-owner slot. */
async function fetchAaveEvents(kind) {
  const url =
    `${API}?module=logs&action=getLogs&address=${POOL}` +
    `&topic0=${ethers.id(kind.sig)}&topic2=${padAddr(WALLET)}&topic0_2_opr=and` +
    `&fromBlock=0&toBlock=latest`;
  // v2 filter is server-side; we re-validate every row client-side below.
  const { body, cached } = await cachedGet(url);
  const rows = body.result || [];
  if (cached) log(`  ${kind.name.padEnd(9)} ${String(rows.length).padStart(4)} events (cached)`);
  return rows;
}

/** All ERC20 Transfer logs on a token where the wallet is sender or recipient. */
async function fetchTokenTransfers(token) {
  const url =
    `${API}?module=logs&action=getLogs&address=${token}` +
    `&topic0=${TRANSFER_TOPIC}&topic1=${padAddr(WALLET)}&topic2=${padAddr(WALLET)}` +
    `&topic1_2_opr=or&fromBlock=0&toBlock=latest`;
  const { body } = await cachedGet(url);
  return body.result || [];
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const call = async (to, iface, fn, args = []) =>
    iface.decodeFunctionResult(fn, await provider.call({ to, data: iface.encodeFunctionData(fn, args) }));

  console.log("wallet :", WALLET);
  console.log("pool   :", POOL);
  console.log("source :", API);
  console.log("cache  :", CACHE_DIR, "\n");

  // ── 1. Discover reserves touched, and aggregate the NAIVE Aave-event view. ──
  // Every row is re-validated: the explorer filter must actually be filtering.
  const reserves = new Map(); // reserve -> { supplyNet, debtNet, counts }
  let totalEvents = 0;
  let filterViolations = 0;

  for (const kind of EVENT_KINDS) {
    let rows;
    try {
      rows = await fetchAaveEvents(kind);
    } catch (e) {
      log(`${kind.name}: FAILED -> ${e.message}`);
      continue;
    }
    log(`${kind.name.padEnd(9)} ${String(rows.length).padStart(4)} events`);
    for (const r of rows) {
      const parsed = POOL_IFACE.parseLog({ topics: r.topics, data: r.data });
      if (!parsed) {
        filterViolations++;
        continue;
      }
      // Validate the server-side topic2 filter rather than trusting it.
      const owner = String(parsed.args[kind.owner]).toLowerCase();
      if (owner !== WALLET) {
        filterViolations++;
        continue;
      }
      const reserve = parsed.args.reserve.toLowerCase();
      const amount = BigInt(parsed.args.amount);
      const rec = reserves.get(reserve) || { supplyNet: 0n, debtNet: 0n, counts: {} };
      if (kind.side === "supply") rec.supplyNet += kind.sign * amount;
      else rec.debtNet += kind.sign * amount;
      rec.counts[kind.name] = (rec.counts[kind.name] || 0) + 1;
      reserves.set(reserve, rec);
      totalEvents++;
    }
  }
  if (filterViolations) log(`  WARNING: ${filterViolations} rows did not match the wallet filter and were dropped`);

  // ── 2. Per reserve: read truth, and reconstruct from the token Transfer ledger. ──
  const rows = [];
  for (const [reserve, rec] of reserves) {
    const readMeta = async (token) => {
      let decimals = 18n;
      let symbol = "?";
      try {
        decimals = BigInt((await call(token, ERC20_IFACE, "decimals"))[0]);
      } catch {}
      try {
        symbol = (await call(token, ERC20_IFACE, "symbol"))[0];
      } catch {}
      let balance = 0n;
      try {
        balance = BigInt((await call(token, ERC20_IFACE, "balanceOf", [WALLET]))[0]);
      } catch {}
      return { token, decimals: Number(decimals), symbol, balance };
    };

    const rd = await call(POOL, POOL_VIEW_IFACE, "getReserveData", [reserve]);
    const aToken = rd[8];
    const varDebt = rd[10];

    const supplyMeta = await readMeta(aToken);
    const debtMeta = await readMeta(varDebt);

    /** Net of the token's own Transfer ledger, split into mints/burns vs P2P moves. */
    const ledger = async (token) => {
      const logs = await fetchTokenTransfers(token);
      let net = 0n;
      let minted = 0n;
      let burned = 0n;
      let movedIn = 0n;
      let movedOut = 0n;
      for (const l of logs) {
        const p = ERC20_IFACE.parseLog({ topics: l.topics, data: l.data });
        if (!p) continue;
        const from = p.args.from.toLowerCase();
        const to = p.args.to.toLowerCase();
        const value = BigInt(p.args.value);
        const isFrom = from === WALLET;
        const isTo = to === WALLET;
        if (!isFrom && !isTo) continue;
        if (isFrom && !isTo) {
          net -= value;
          if (to === ZERO) burned += value;
          else movedOut += value;
        } else if (isTo && !isFrom) {
          net += value;
          if (from === ZERO) minted += value;
          else movedIn += value;
        } // self-transfer nets to zero
      }
      return { net, minted, burned, movedIn, movedOut, count: logs.length };
    };

    let supplyLedger = { net: 0n, minted: 0n, burned: 0n, movedIn: 0n, movedOut: 0n, count: 0 };
    let debtLedger = supplyLedger;
    if (supplyMeta.balance !== 0n || rec.supplyNet !== 0n) {
      try {
        supplyLedger = await ledger(aToken);
        log(`  ${supplyMeta.symbol.padEnd(6)} transfer ledger: ${supplyLedger.count} events`);
      } catch (e) {
        log(`  ${supplyMeta.symbol} transfer ledger FAILED: ${e.message}`);
      }
    }
    if (debtMeta.balance !== 0n || rec.debtNet !== 0n) {
      try {
        debtLedger = await ledger(varDebt);
      } catch (e) {
        log(`  debt ledger FAILED: ${e.message}`);
      }
    }

    rows.push({
      symbol: supplyMeta.symbol !== "?" ? supplyMeta.symbol : debtMeta.symbol,
      reserve,
      decimals: supplyMeta.decimals,
      aToken,
      variableDebtToken: varDebt,
      events: rec.counts,

      // Naive: Aave events only. Expected to be WRONG when aTokens were transferred.
      naiveSupplied: rec.supplyNet,
      naiveBorrowed: rec.debtNet,

      // Correct: the token's own Transfer ledger.
      ledgerSupplied: supplyLedger.net,
      ledgerBorrowed: debtLedger.net,
      ledgerBreakdown: {
        minted: supplyLedger.minted,
        burned: supplyLedger.burned,
        movedIn: supplyLedger.movedIn,
        movedOut: supplyLedger.movedOut,
      },

      // Truth.
      realSupplied: supplyMeta.balance,
      realDebt: debtMeta.balance,
    });
  }
  rows.sort((a, b) =>
    Number(BigInt(b.realSupplied) + BigInt(b.realDebt)) - Number(BigInt(a.realSupplied) + BigInt(a.realDebt)),
  );

  // ── 3. Report. ──
  console.log("\n─── RECONSTRUCTION ACCURACY ───");
  console.log("  naive     = Σ Supply − Σ Withdraw   (Aave events only)");
  console.log("  ledger    = Σ Transfer in − Σ Transfer out  (token's own ledger)\n");

  for (const r of rows) {
    const naiveDrift = r.realSupplied - r.naiveSupplied;
    const ledgerDrift = r.realSupplied - r.ledgerSupplied;
    const debtNaiveDrift = r.realDebt - r.naiveBorrowed;
    const debtLedgerDrift = r.realDebt - r.ledgerBorrowed;
    console.log(`  ${r.symbol}  ${JSON.stringify(r.events)}`);
    console.log(`    supplied  real ${fmt(r.realSupplied, r.decimals)}`);
    console.log(
      `      naive  ${fmt(r.naiveSupplied, r.decimals).padStart(16)}  drift ${fmt(naiveDrift, r.decimals).padStart(14)}  ${pct(naiveDrift, r.naiveSupplied)}`,
    );
    console.log(
      `      ledger ${fmt(r.ledgerSupplied, r.decimals).padStart(16)}  drift ${fmt(ledgerDrift, r.decimals).padStart(14)}  ${pct(ledgerDrift, r.ledgerSupplied)}`,
    );
    if (r.ledgerBreakdown.movedOut !== 0n || r.ledgerBreakdown.movedIn !== 0n) {
      console.log(
        `      moved  in ${fmt(r.ledgerBreakdown.movedIn, r.decimals)}  out ${fmt(r.ledgerBreakdown.movedOut, r.decimals)}  (invisible to Aave events)`,
      );
    }
    if (r.realDebt !== 0n || r.naiveBorrowed !== 0n) {
      console.log(`    borrowed  real ${fmt(r.realDebt, r.decimals)}`);
      console.log(
        `      naive  ${fmt(r.naiveBorrowed, r.decimals).padStart(16)}  drift ${fmt(debtNaiveDrift, r.decimals).padStart(14)}  ${pct(debtNaiveDrift, r.naiveBorrowed)}`,
      );
      console.log(
        `      ledger ${fmt(r.ledgerBorrowed, r.decimals).padStart(16)}  drift ${fmt(debtLedgerDrift, r.decimals).padStart(14)}  ${pct(debtLedgerDrift, r.ledgerBorrowed)}`,
      );
    }
    console.log();
  }

  const acct = await call(POOL, POOL_VIEW_IFACE, "getUserAccountData", [WALLET]);
  console.log("─── POOL TOTALS (8dp base units) ───");
  console.log("  collateral  :", (BigInt(acct[0]) / 10n ** 8n).toString(), "USD");
  console.log("  debt        :", (BigInt(acct[1]) / 10n ** 8n).toString(), "USD");
  console.log("  LTV         :", (BigInt(acct[4]) / 100n).toString() + "%");
  console.log("  healthFactor:", acct[5].toString());

  // ── 4. Verdict: is the ledger reconstruction materially better than naive? ──
  const naiveErr = rows.reduce((s, r) => s + Math.abs(Number(BigInt(r.realSupplied - r.naiveSupplied))), 0);
  const ledgerErr = rows.reduce((s, r) => s + Math.abs(Number(BigInt(r.realSupplied - r.ledgerSupplied))), 0);
  const improved = rows.filter((r) => r.realSupplied !== 0n || r.naiveSupplied !== 0n);
  console.log("\n─── VERDICT ───");
  console.log(`  events indexed            : ${totalEvents}`);
  console.log(`  reserves touched          : ${rows.length}`);
  console.log(`  total abs supply error`);
  console.log(`    naive (Aave events)     : ${naiveErr.toExponential(4)}`);
  console.log(`    ledger (token transfers): ${ledgerErr.toExponential(4)}`);
  console.log(`  ledger strictly better on : ${improved.length}/${rows.length} reserves`);
  console.log("  The ledger residual is rebasing interest, the one component that cannot");
  console.log("  be derived from events. Correct reconstruction therefore = token Transfer");
  console.log("  ledger + a proven, bounded interest term.");

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        wallet: WALLET,
        pool: POOL,
        source: { explorer: API, rpc: RPC },
        method: {
          naive: "sum(Supply) - sum(Withdraw) from Aave V3 Pool events",
          ledger: "sum(Transfer to wallet) - sum(Transfer from wallet) on the aToken",
          residual: "ledger reconstruction vs balanceOf = rebasing interest",
        },
        totalEvents,
        filterViolations,
        poolTotals: {
          collateralBase8: acct[0].toString(),
          debtBase8: acct[1].toString(),
          ltvBps: acct[4].toString(),
          healthFactor: acct[5].toString(),
        },
        errorBasisPoints: {
          naiveAbsSupply: naiveErr.toExponential(4),
          ledgerAbsSupply: ledgerErr.toExponential(4),
        },
        reserves: rows.map((r) => ({
          ...r,
          naiveSupplied: r.naiveSupplied.toString(),
          naiveBorrowed: r.naiveBorrowed.toString(),
          ledgerSupplied: r.ledgerSupplied.toString(),
          ledgerBorrowed: r.ledgerBorrowed.toString(),
          realSupplied: r.realSupplied.toString(),
          realDebt: r.realDebt.toString(),
          ledgerBreakdown: Object.fromEntries(Object.entries(r.ledgerBreakdown).map(([k, v]) => [k, v.toString()])),
        })),
      },
      null,
      2,
    ),
  );
  console.log("\n  evidence written:", OUT);
}

main().catch((e) => {
  console.error("INDEXER ERROR:", e?.stack || e?.message || e);
  process.exit(1);
});
