import { parseAbi } from "viem";

/**
 * Generation-2 / CEIP stack, deployed to Creditcoin CC3 testnet after the submission
 * deadline.
 *
 * ── Why these live in their own module ──────────────────────────────────────
 * The frozen submission (deck, DoraHacks text, demo video) describes generation 1 at
 * `0x2C35...C742`, and the live app still points there through NEXT_PUBLIC_CREDITLINE_ADDRESS.
 * So generation 2 is kept separate rather than swapped into `config`, which keeps the
 * recorded flow intact while still letting a reviewer read the new stack live.
 *
 * ── What generation 2 adds ──────────────────────────────────────────────────
 * `openCreditFromBalance` sizes a line from an attested balance with no deposit.
 * Verified on chain: selector 9a689526 is present in the generation-2 bytecode and
 * absent from generation 1. The /bonus page reads that check live rather than asserting it.
 *
 * Deployer: 0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2 (testnet only).
 */

export const GEN2_DEPLOYED_AT = "2026-09-14";

export const GEN2 = {
  /** Generation 2 CreditLine. Balance-sized, no deposit path. */
  creditLine: "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
  /** Portable standing: a proof-anchored record any protocol can read. */
  attestedStanding: "0x8Cc493C539767788eB5a89fe55a7b47FF46D3383",
  /** Group credit with vouching, capped at the members' aggregate proved history. */
  groupCredit: "0x4accC2C22B0D497FBB9274DF310Fd89CCd0b11Ff",
  /** Proven-zero anchors and the mainnet aToken ledger. */
  positionRegistry: "0x8c718d733Eb3149d25A9aA0cc1487FA6eCFcE0Dd",
  /** Attested mainnet token metadata; `decimals()` cannot be called from Creditcoin. */
  tokenRegistry: "0x5B35f79C5aDFbB765dfFB522857a0c6C5a0d1E9f",
  /** Prices from proven Chainlink AnswerUpdated events. */
  priceFeed: "0xFE16ea120848D75caCbc69BfCee8cb32ec7916c2",
  /** Net worth in 8-decimal USD. Refuses to clamp a negative. */
  valuer: "0x95847A47248BA848Fc1Bd43bB8C1F733A4845282",
  /** Policy layer: turns proven net worth into a limit, with explicit status codes. */
  positionSizedCredit: "0xD19E758C30bD97fe1CFA4d023a4016f2741e9A04",
  /** Reused from generation 1 rather than redeployed, so both share one verifier. */
  verifier: "0xF13205Bdf48A3159d4A46309C639930aE8faC130",
} as const;

/** Generation 1, still what the live product and the demo video use. */
export const GEN1_CREDIT_LINE = "0x2C3585019B957b16459C409f34973b583267C742";

/**
 * Portable standing, demonstrated end to end on CC3.
 *
 * ── What this pair proves ───────────────────────────────────────────────────
 * `AttestedStanding` (deployed in the generation-2 batch) published a portable record and
 * an `isEligible` predicate, and nothing called either, so portability was an interface
 * claim. `StandingGatedCheckout` is the counterexample: a merchant product that is not
 * Spark, applying its own policy to a record it did not create.
 *
 * ── Why the registry is anchored to GENERATION 1 ────────────────────────────
 * The registry in the generation-2 batch points at generation-2 CreditLine, which is
 * clean: `getHistory(deployer)` returns (0, 0), so `refresh` correctly reverts with
 * `NotAttested`. Generation 1 holds real evidence today (6 attested payments, a dual-proof
 * open), and it is the deployment the demo video and the frozen submission describe, so
 * anchoring the demonstration to it needs no new Sepolia deposit and is closer to what was
 * entered. `ICreditLineView` exists precisely so a registry can point at any generation.
 *
 * Deployer and borrower are the same testnet account, which is why this demonstrates the
 * mechanism rather than a market. That limit is stated on the page, not hidden.
 */
export const PORTABILITY = {
  /** Registry over generation 1. Permissionless refresh, no owner, no admin write. */
  registry: "0x88ea1190e5dbC1e8Cb0406Bc868B4db4ad57FbEa",
  /** The second consumer: a merchant that is not Spark. */
  checkout: "0x199A3E0e797A01C5909fE52a8C0c66ed83f2cA11",
  /** The generation the record was derived from, so the evidence is checkable. */
  anchoredTo: "0x2C3585019B957b16459C409f34973b583267C742",
  /**
   * Borrower and merchant. Both are the testnet deployer, so this shows the mechanism
   * works rather than that two parties used it. Named plainly for that reason.
   */
  account: "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
  /** The merchant's policy, as set on chain. The merchant chose these, not Spark. */
  policy: {
    minScore: 650,
    minPayments: 3,
    maxAgeSeconds: 2_592_000, // 30 days
    termSeconds: 2_592_000, // 30 days to settle
    maxDeferredWei: 50_000_000_000_000_000n, // 0.05 ETH ceiling per merchant
    advanceBps: 2_000, // 20% of proven volume
  },
  /** The item the merchant listed. */
  itemPriceWei: 10_000_000_000_000_000n, // 0.01 ETH
  deployedAt: "2026-09-14",
} as const;

/**
 * Registry ABI. `Standing` is (score, payments, volume, attestedBalance, issuedAt,
 * evidenceRef, issued) — field ORDER is the ABI, so it is spelled out here.
 */
export const STANDING_ABI = parseAbi([
  "function recordCount() view returns (uint32)",
  "function creditLine() view returns (address)",
  "function standingOf(address borrower) view returns ((uint16 score, uint32 payments, uint128 volume, uint128 attestedBalance, uint64 issuedAt, bytes32 evidenceRef, bool issued))",
  "function standingAge(address borrower) view returns (uint64)",
  "function isEligible(address borrower, uint16 minScore, uint32 minPayments, uint64 maxAgeSeconds) view returns (bool)",
]);

/**
 * Consumer ABI. `Policy` is (minScore, minPayments, maxAgeSeconds, termSeconds,
 * maxDeferred, advanceBps, set); `Order` is (merchant, buyer, deferred, dueAt,
 * evidenceRef, scoreAtDecision, paymentsAtDecision, closed).
 */
export const CHECKOUT_ABI = parseAbi([
  "function orderCount() view returns (uint256)",
  "function itemCount() view returns (uint256)",
  "function policyOf(address merchant) view returns ((uint16 minScore, uint32 minPayments, uint64 maxAgeSeconds, uint64 termSeconds, uint128 maxDeferred, uint16 advanceBps, bool set))",
  "function itemOf(uint256 itemId) view returns ((address merchant, uint128 price, address buyer, bool sold))",
  "function orderOf(uint256 orderId) view returns ((address merchant, address buyer, uint128 deferred, uint64 dueAt, bytes32 evidenceRef, uint16 scoreAtDecision, uint32 paymentsAtDecision, bool closed))",
  "function outstanding(address buyer, address merchant) view returns (uint128)",
  "function isOverdue(uint256 orderId) view returns (bool)",
  "function canDefer(address buyer, address merchant, uint128 price) view returns (bool ok, uint128 limit)",
]);

/**
 * The underwriting subject registered at deploy time: a real Aave V3 position on
 * Ethereum mainnet, not a fixture. These are the exact inputs the deploy used.
 */
export const GEN2_SUBJECT = {
  /** The borrower whose mainnet position was reconstructed. */
  borrower: "0x0Cc688BF78bDCC3C072903100B2b821cC8d7d666",
  /** aEthWETH, the position token. */
  aEthWETH: "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
  /** Chainlink ETH/USD aggregator; the proxy emits nothing, which is a documented finding. */
  ethUsdAggregator: "0x7d4E742018fb52E48b08BE73d041C18B21de6Fb5",
} as const;

/**
 * Function selectors used for the live bytecode check on /bonus.
 *
 * Generation 2 exists precisely because `openCreditFromBalance` was missing from the
 * deployed generation 1. Checking the selector against real bytecode is the difference
 * between claiming that and proving it.
 */
export const SELECTORS = {
  openCreditFromBalance: "9a689526",
  openCredit: "45d5032f",
} as const;

/**
 * Generation-2 CreditLine ABI, written as signatures rather than as an object tree.
 *
 * Kept here instead of in `abi.ts` so the generation-2 surface is self-contained: the
 * frozen app talks to generation 1 through `abi.ts`, and this is the only place that talks
 * to generation 2. The signatures sit next to a comment naming the struct they mirror,
 * because the field ORDER is the part that silently goes wrong.
 *
 * `Position` is (deposit, debt, credit, attestedBalance, lastAccrual, status, openTxHash,
 * balanceTxHash, closeTxHash), and `PaymentClaim` is (txHash, payer, amount, kind).
 */
export const GEN2_CREDIT_LINE_ABI = parseAbi([
  "function openCreditFromBalance((bytes32 txHash, address payer, uint256 amount, uint8 kind) balanceClaim, bytes balanceProof)",
  "function getPosition(address user) view returns ((uint256 deposit, uint256 debt, uint256 credit, uint256 attestedBalance, uint64 lastAccrual, uint8 status, bytes32 openTxHash, bytes32 balanceTxHash, bytes32 closeTxHash))",
  "function BALANCE_LTV_BPS() view returns (uint256)",
  "function MIN_BALANCE_LINE_WEI() view returns (uint256)",
  "event CreditOpenedFromBalance(address indexed user, uint256 attestedBalance, uint256 credit, uint256 ltvBps, bytes32 txHash)",
]);
