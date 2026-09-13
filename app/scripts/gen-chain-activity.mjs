#!/usr/bin/env node
/**
 * Generates src/lib/chainActivity.ts from the DEPLOYED contracts, by reading their
 * public event logs off the block explorers. Nothing here is hand-typed: every block,
 * amount and transaction hash in the generated module came off the chain, and every
 * row carries a link a reader can follow to verify it.
 *
 * Why a generated snapshot instead of a live browser read: Spark's history is spread
 * across two chains and several hundred thousand blocks, and public RPCs cap
 * eth_getLogs ranges well below that. An indexer would be the live answer; a
 * deterministic snapshot that states its own block height is the honest one here.
 *
 * Usage: node scripts/gen-chain-activity.mjs
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "lib", "chainActivity.ts");

const SOURCES = [
  {
    key: "cc3-creditline",
    chain: "creditcoin",
    contract: "CreditLine",
    role: "production",
    address: "0x2C3585019B957b16459C409f34973b583267C742",
    explorer: "https://creditcoin-testnet.blockscout.com",
  },
  {
    key: "cc3-creditline-legacy",
    chain: "creditcoin",
    contract: "CreditLine",
    role: "legacy",
    address: "0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319",
    explorer: "https://creditcoin-testnet.blockscout.com",
  },
  {
    key: "sepolia-payment",
    chain: "sepolia",
    contract: "SepoliaPayment",
    role: "production",
    address: "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
    explorer: "https://eth-sepolia.blockscout.com",
  },
  {
    key: "sepolia-payment-legacy",
    chain: "sepolia",
    contract: "SepoliaPayment",
    role: "legacy",
    address: "0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9",
    explorer: "https://eth-sepolia.blockscout.com",
  },
];

const STATS = {
  creditcoin: "https://creditcoin-testnet.blockscout.com/api/v2/stats",
  sepolia: "https://eth-sepolia.blockscout.com/api/v2/stats",
};

/* ------------------------------------------------------------------ formatting */

/**
 * 18-decimal base unit -> ETH string.
 *
 * The rule that matters: never round a nonzero value down to a false zero, and never
 * emit a bare "0.". A fixed decimal cut does exactly that for dust amounts, which are
 * common here because interest accrues per block, so for anything under 1 ETH this keeps
 * the digits that actually carry information.
 */
function eth(wei) {
  const v = BigInt(wei);
  if (v === 0n) return "0";
  const whole = v / 10n ** 18n;
  const fracFull = (v % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");

  if (whole > 0n) {
    const frac = fracFull.slice(0, 8).replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole.toString();
  }

  // Sub-1 ETH. `firstSig` is always below 18, so the slice below always contains at
  // least one significant digit and the result can never collapse to "0.".
  const firstSig = fracFull.search(/[1-9]/);
  const keep = Math.min(18, firstSig + 4);
  return `0.${fracFull.slice(0, keep).replace(/0+$/, "")}`;
}

const bps = (v) => `${(Number(v) / 100).toFixed(2)}%`;
const short = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;

const KIND = { 1: "deposit", 2: "repayment", 3: "balance" };

/**
 * Turns a decoded log into the fields a reader wants, plus a one-line summary.
 * Unknown events are kept rather than dropped, so nothing on chain is hidden.
 */
function interpret(contract, event, p) {
  if (contract === "CreditLine") {
    switch (event) {
      case "CreditOpened":
        return {
          headline: `Credit opened for ${eth(p.deposit)} ETH deposit`,
          fields: [
            ["Deposit", `${eth(p.deposit)} ETH`],
            ["Credit unlocked", `${eth(p.credit)} ETH`],
            ["Attested balance", `${eth(p.attestedBalance)} ETH`],
            ["LTV factor", bps(p.factorBps)],
            ["Deposit proof tx", short(p.depositTxHash)],
            ["Balance proof tx", short(p.balanceTxHash)],
          ],
        };
      case "AttestedPaymentLinked":
        return {
          headline: `${KIND[p.kind] ?? `kind ${p.kind}`} linked, payment #${p.count}`,
          fields: [
            ["Kind", KIND[p.kind] ?? p.kind],
            ["Amount", `${eth(p.amount)} ETH`],
            ["History count", p.count],
            ["History volume", `${eth(p.volume)} ETH`],
            ["Source tx", short(p.txHash)],
          ],
        };
      case "CreditWithdrawn":
        return {
          headline: `Drew ${eth(p.amount)} ETH of credit`,
          fields: [
            ["Amount", `${eth(p.amount)} ETH`],
            ["Debt after", `${eth(p.debt)} ETH`],
          ],
        };
      case "CreditRedeemed":
        return {
          headline: `Redeemed ${eth(p.amount)} sCREDIT against debt`,
          fields: [
            ["Amount", `${eth(p.amount)} sCREDIT`],
            ["Debt after", `${eth(p.debt)} ETH`],
          ],
        };
      case "InterestAccrued":
        return {
          headline: `Interest accrued, debt now ${eth(p.debt)} ETH`,
          fields: [
            ["Interest", `${eth(p.interest)} ETH`],
            ["Debt after", `${eth(p.debt)} ETH`],
          ],
        };
      case "CreditRepaid":
        return {
          headline: `Repayment credited ${eth(p.amount)} ETH`,
          fields: [
            ["Amount", `${eth(p.amount)} ETH`],
            ["Source tx", short(p.txHash)],
          ],
        };
      case "CreditClosed":
        return {
          headline: "Credit line closed",
          fields: [["Closing proof tx", short(p.txHash)]],
        };
      default:
        return { headline: event, fields: Object.entries(p).map(([k, v]) => [k, String(v)]) };
    }
  }

  switch (event) {
    case "DepositPaid":
      return {
        headline: `Deposit paid on Sepolia, ${eth(p.amount)} ETH`,
        fields: [
          ["Amount", `${eth(p.amount)} ETH`],
          ["Reference", short(p.ref)],
        ],
      };
    case "RepaymentPaid":
      return {
        headline: `Repayment paid on Sepolia, ${eth(p.amount)} ETH`,
        fields: [
          ["Amount", `${eth(p.amount)} ETH`],
          ["Reference", short(p.ref)],
        ],
      };
    case "BalanceAttested":
      return {
        headline: `Balance attested, ${eth(p.ethBalance)} ETH`,
        fields: [
          ["Attested balance", `${eth(p.ethBalance)} ETH`],
          ["Reference", short(p.ref)],
        ],
      };
    default:
      return { headline: event, fields: Object.entries(p).map(([k, v]) => [k, String(v)]) };
  }
}

/* ---------------------------------------------------------------------- fetching */

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function fetchLogs(source) {
  const url = `${source.explorer}/api/v2/addresses/${source.address}/logs`;
  const body = await getJson(url);
  const items = body.items ?? [];
  if (body.next_page_params) {
    // Silent truncation would understate the record, which is the one thing this
    // page must never do. Fail loudly instead.
    throw new Error(`${source.key} has more logs than one page; pagination needed`);
  }
  return items;
}

function normalize(source, it) {
  const event = (it.decoded?.method_call ?? "").split("(")[0];
  const p = {};
  for (const param of it.decoded?.parameters ?? []) p[param.name] = param.value;

  if (!event) {
    throw new Error(`${source.key} block ${it.block_number}: undecoded log, refusing to guess`);
  }

  const { headline, fields } = interpret(source.contract, event, p);

  return {
    chain: source.chain,
    role: source.role,
    contract: source.contract,
    contractAddress: source.address,
    event,
    headline,
    fields,
    // Decoded parameters kept verbatim so volumes are summed from the chain's own
    // integers rather than from rounded display strings.
    raw: p,
    // The indexed actor, when the event names one. Kept so the record states who
    // acted instead of only how much moved.
    actor: (p.user ?? p.payer ?? "").toLowerCase(),
    block: Number(it.block_number),
    logIndex: Number(it.index ?? 0),
    timestamp: (it.block_timestamp ?? "").replace(".000000Z", "Z"),
    txHash: it.transaction_hash,
    explorerUrl: `${source.explorer}/tx/${it.transaction_hash}`,
  };
}

/* ----------------------------------------------------------------------- summary */

function summarize(events) {
  const count = (e) => events.filter((x) => x.event === e).length;
  const opened = count("CreditOpened");
  const closed = count("CreditClosed");

  const sumRaw = (event, field) =>
    events
      .filter((e) => e.event === event && e.raw[field] != null)
      .reduce((a, e) => a + BigInt(e.raw[field]), 0n);

  // Distinct wallets observed as the indexed actor. Computed from the chain's own
  // indexed field rather than asserted, because this is the pillar the project is
  // weakest on and an inflated number here would be the one lie on the page.
  const actors = new Set(events.map((e) => e.actor).filter(Boolean));

  return {
    totalEvents: events.length,
    linesOpened: opened,
    linesClosed: closed,
    linesActive: opened - closed,
    paymentsLinked: count("AttestedPaymentLinked"),
    depositsPaid: count("DepositPaid"),
    repaymentsPaid: count("RepaymentPaid"),
    balancesAttested: count("BalanceAttested"),
    distinctActors: actors.size,
    depositVolumeEth: eth(sumRaw("DepositPaid", "amount")),
    repayVolumeEth: eth(sumRaw("RepaymentPaid", "amount")),
    creditDrawnEth: eth(sumRaw("CreditWithdrawn", "amount")),
  };
}

/* -------------------------------------------------------------------------- main */

async function main() {
  const [cc3Stats, sepStats] = await Promise.all([
    getJson(STATS.creditcoin),
    getJson(STATS.sepolia),
  ]);

  const events = [];
  for (const source of SOURCES) {
    const items = await fetchLogs(source);
    for (const it of items) events.push(normalize(source, it));
  }

  events.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);

  const summary = summarize(events);

  const chain = {
    generatedAt: new Date().toISOString(),
    asOf: {
      creditcoinBlock: Number(cc3Stats.total_blocks),
      sepoliaBlock: Number(sepStats.total_blocks),
    },
    sources: SOURCES.map(({ key, chain: c, contract, role, address, explorer }) => ({
      key,
      chain: c,
      contract,
      role,
      address,
      explorer,
    })),
    summary,
    events,
  };

  const file = `// GENERATED FILE. Do not edit by hand.
//
// Every value below was read off the block explorers by scripts/gen-chain-activity.mjs.
// To refresh: npm run gen:activity
//
// Snapshot taken at Creditcoin testnet block ${chain.asOf.creditcoinBlock} and Sepolia
// block ${chain.asOf.sepoliaBlock}.

export type ChainEvent = {
  chain: "creditcoin" | "sepolia";
  role: "production" | "legacy";
  contract: string;
  contractAddress: string;
  event: string;
  headline: string;
  fields: [string, string][];
  raw: Record<string, string>;
  actor: string;
  block: number;
  logIndex: number;
  timestamp: string;
  txHash: string;
  explorerUrl: string;
};

export type ChainSource = {
  key: string;
  chain: "creditcoin" | "sepolia";
  contract: string;
  role: "production" | "legacy";
  address: string;
  explorer: string;
};

export const chainActivity = ${JSON.stringify(chain, null, 2)} as const satisfies {
  generatedAt: string;
  asOf: { creditcoinBlock: number; sepoliaBlock: number };
  sources: ChainSource[];
  summary: {
    totalEvents: number;
    linesOpened: number;
    linesClosed: number;
    linesActive: number;
    paymentsLinked: number;
    depositsPaid: number;
    repaymentsPaid: number;
    balancesAttested: number;
    distinctActors: number;
    depositVolumeEth: string;
    repayVolumeEth: string;
    creditDrawnEth: string;
  };
  events: ChainEvent[];
};
`;

  writeFileSync(OUT, file, "utf8");

  console.log(`wrote ${OUT}`);
  console.log(`  as of:   cc3 block ${chain.asOf.creditcoinBlock}, sepolia block ${chain.asOf.sepoliaBlock}`);
  console.log(`  events:  ${summary.totalEvents}`);
  console.log(`  opened:  ${summary.linesOpened}  closed: ${summary.linesClosed}  active: ${summary.linesActive}`);
  console.log(`  linked:  ${summary.paymentsLinked} attested payments`);
  console.log(`  drawn:   ${summary.creditDrawnEth} ETH of credit`);
  console.log(`  actors:  ${summary.distinctActors} distinct indexed wallets`);
  console.log(`  sepolia: ${summary.depositsPaid} deposits (${summary.depositVolumeEth} ETH), ${summary.repaymentsPaid} repayments (${summary.repayVolumeEth} ETH), ${summary.balancesAttested} balance attestations`);
}

main().catch((err) => {
  console.error(`gen-chain-activity failed: ${err.message}`);
  process.exit(1);
});
