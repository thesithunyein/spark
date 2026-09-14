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
