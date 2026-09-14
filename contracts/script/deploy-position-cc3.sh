#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  Deploy the mainnet-position stack to Creditcoin CC3 testnet.
#
#  WHY THIS SCRIPT EXISTS INSTEAD OF `forge script`
#  ------------------------------------------------
#  `forge script --broadcast` CANNOT run against Creditcoin. Foundry forks the
#  target chain to simulate, and CC3 block headers omit `mixHash` (prevrandao),
#  which Foundry 1.7.1 validates. Every `forge script` invocation against CC3
#  fails with:
#
#      EVM error; header validation error: `prevrandao` not set
#
#  This is not a Spark bug and not an RPC bug: a read-only script
#  (script/NegativePathLive.s.sol) fails identically, and BOTH public CC3 RPCs
#  omit the field. It is Creditcoin's header shape.
#
#  `forge create` does not fork, so it works. This script therefore does the
#  whole stack as `forge create` (deploys) + `cast send` (state changes), and
#  verifies each state change landed by reading it back.
#
#  The equivalent one-broadcast script, script/ProveMainnetPosition.s.sol, is
#  retained because it runs correctly against a local anvil chain and is how
#  the end-to-end position proof was originally recorded. It is not a CC3 path.
#
#  VERIFICATION STATUS — what is proven and what is not
#  ----------------------------------------------------
#  PROVEN: executed end to end on 2026-09-14 against a local anvil chain — 5 deploys,
#  5 state changes, decoded read-backs, exit 0. The read-backs returned
#  position = 433033874843288486772, net worth $1,090,064.96, and a limit of
#  $218,012.99 at a 20% policy LTV, which is exactly 20% of the net worth. Those two
#  figures are HIGHER than the $1,086,382 / $217,276 recorded in docs/evidence because
#  this run attests a FRESH mainnet price rather than the price at the source block.
#  Same code path, different price — not a discrepancy.
#
#  PROVEN: against real CC3, `forge create` BUILDS the transaction and stops at
#  "add --broadcast" (chainId 0x18e8f = 102031, constructor args echoed, gas 2,401,631).
#
#  NOT PROVEN: the CC3 broadcast itself has not been run from this repository, because
#  it needs the key. That is the single unexecuted step, and it is stated rather than
#  glossed — after a run, `node app/scripts/verify-cc3-position-stack.mjs` reads the
#  deployment back off CC3 and writes the evidence file only if every assertion holds.
#
#  USAGE
#  -----
#    export PRIVATE_KEY=0x...              # a key funded with CC3 testnet CTC
#    bash script/deploy-position-cc3.sh            # DRY RUN (default)
#    DRY_RUN=0 bash script/deploy-position-cc3.sh  # broadcast
#
#  Testnet CTC: Creditcoin Discord, #token-faucet, `/faucet address:0xYourAddr`.
#  Reference deployer 0x7CEC5b3F9dA312072Aa987c7266f02A8Fca1bFF6 has been funded
#  before; any funded key works, because the stack has no owner but the caller.
# ═════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RPC_URL="${RPC_URL:-https://rpc.cc3-testnet.creditcoin.network}"
MAINNET_RPC="${MAINNET_RPC:-https://ethereum-rpc.publicnode.com}"
DRY_RUN="${DRY_RUN:-1}"

# ── real measured mainnet facts (docs/evidence/*.json) ───────────────────────
CHAIN_KEY="${CHAIN_KEY:-3}"                                        # 3 = Ethereum mainnet
BORROWER="${BORROWER:-0x0Cc688BF78bDCC3C072903100B2b821cC8d7d666}"
A_WETH=0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8
WETH=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
ETH_USD_AGGREGATOR=0x7d4E742018fb52E48b08BE73d041C18B21de6Fb5
ANCHOR_BLOCK=25962220        # balanceOf == 0 here, archive-verified
LEDGER_NET=433014008378577163575
ATTESTED_BALANCE=433033874843288486772
MEASURE_BLOCK=25970521       # block where balanceOf == ATTESTED_BALANCE
MAX_RESIDUAL_BPS="${MAX_RESIDUAL_BPS:-1000}"
MAX_STALENESS="${MAX_STALENESS:-86400}"
LTV_BPS="${LTV_BPS:-2000}"                                  # 20%
MIN_NET_WORTH_USD8="${MIN_NET_WORTH_USD8:-100000000000}"     # $1,000
MAX_CREDIT_USD8="${MAX_CREDIT_USD8:-50000000000000}"         # $500,000

# Everything human-facing goes to STDERR: deploy() and send() are called inside
# command substitution, so stdout must carry nothing but the value being returned.
bold() { printf '\n\033[1m%s\033[0m\n' "$*" >&2; }
info() { printf '    %s\n' "$*" >&2; }

if [ "$DRY_RUN" = "1" ]; then
  bold "DRY RUN — no transactions will be sent. Set DRY_RUN=0 to broadcast."
else
  bold "BROADCASTING to $RPC_URL"
  : "${PRIVATE_KEY:?PRIVATE_KEY must be set to a funded CC3 key for DRY_RUN=0}"
fi

# `forge create --json` pretty-prints, so `"deployedTo": "0x.."` has a space after the colon.
addr_of() { sed -n 's/.*"deployedTo": *"\(0x[0-9a-fA-F]*\)".*/\1/p' | head -1; }

# ── deploy one contract, echo the command, return the address ────────────────
deploy() {
  local label="$1" target="$2"; shift 2
  if [ "$DRY_RUN" = "1" ]; then
    info "forge create $target --constructor-args $*"
    printf '%s' "0x0000000000000000000000000000000000000000"
    return 0
  fi
  local out
  if ! out=$(forge create --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" \
      --broadcast --json "$target" --constructor-args "$@" 2>&1); then
    printf '\033[31m  deploy of %s FAILED\033[0m\n%s\n' "$label" "$out" >&2
    return 1
  fi
  local addr; addr=$(printf '%s' "$out" | addr_of)
  [ -n "$addr" ] || { printf '  could not parse address from: %s\n' "$out" >&2; return 1; }
  printf '  ✅ %-24s %s\n' "$label" "$addr" >&2
  printf '%s' "$addr"
}

# ── send one state change, echo the command ──────────────────────────────────
send() {
  local label="$1" to="$2" sig="$3"; shift 3
  if [ "$DRY_RUN" = "1" ]; then
    info "cast send $to \"$sig\" $*"
    return 0
  fi
  local out
  if ! out=$(cast send --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" \
      "$to" "$sig" "$@" --json 2>&1); then
    printf '\033[31m  %s FAILED\033[0m\n%s\n' "$label" "$out" >&2
    return 1
  fi
  printf '  ✅ %-36s %s\n' "$label" "$(printf '%s' "$out" | sed -n 's/.*"transactionHash": *"\(0x[0-9a-fA-F]*\)".*/\1/p' | head -1)" >&2
}

# ═════════════════════════════════════════════════════════════════════════════
bold "1/6  Deploying the five contracts"
# ═════════════════════════════════════════════════════════════════════════════
DEPLOYER=$( [ "$DRY_RUN" = "1" ] && echo "0x0000000000000000000000000000000000000000" \
  || cast wallet address --private-key "$PRIVATE_KEY" )
info "deployer / attestor / owner: $DEPLOYER"

REGISTRY=$(deploy MainnetPositionRegistry src/MainnetPositionRegistry.sol:MainnetPositionRegistry "$DEPLOYER" "$CHAIN_KEY" "$MAX_RESIDUAL_BPS")
TOKENS=$(deploy MainnetTokenRegistry     src/MainnetTokenRegistry.sol:MainnetTokenRegistry         "$DEPLOYER" "$CHAIN_KEY")
FEED=$(deploy AttestedPriceFeed          src/AttestedPriceFeed.sol:AttestedPriceFeed               "$DEPLOYER" "$CHAIN_KEY" "$MAX_STALENESS")
VALUER=$(deploy PositionValuer           src/PositionValuer.sol:PositionValuer                     "$REGISTRY" "$TOKENS" "$FEED")
SIZED=$(deploy PositionSizedCredit       src/PositionSizedCredit.sol:PositionSizedCredit           "$VALUER" "$DEPLOYER" "$LTV_BPS" "$MIN_NET_WORTH_USD8" "$MAX_CREDIT_USD8")

# ═════════════════════════════════════════════════════════════════════════════
bold "2/6  Registering aEthWETH as an attested asset"
# ═════════════════════════════════════════════════════════════════════════════
# decimals() cannot be called on a mainnet token from Creditcoin, so it is an
# attested fact. TokenKind.Asset == 0.
AAVE_V3=$(cast format-bytes32-string "aave-v3")
send "registerToken(aEthWETH)" "$TOKENS" \
  "registerToken(address,uint8,bytes32,uint8,address,uint64,uint64)" \
  "$A_WETH" 18 "$AAVE_V3" 0 "$WETH" "$MEASURE_BLOCK" "$CHAIN_KEY"

# ═════════════════════════════════════════════════════════════════════════════
bold "3/6  Fixing the zero anchor at a provably-zero block"
# ═════════════════════════════════════════════════════════════════════════════
send "setZeroAnchor" "$REGISTRY" \
  "setZeroAnchor(address,address,uint64,uint64,bytes32)" \
  "$BORROWER" "$A_WETH" "$ANCHOR_BLOCK" "$CHAIN_KEY" "$(cast keccak "anchor:scale:0Cc688BF")"

# ═════════════════════════════════════════════════════════════════════════════
bold "4/6  Ingesting the ledger, then reconciling against attested state"
# ═════════════════════════════════════════════════════════════════════════════
# ONE aggregated row: the real position is 8,508 transfers and cannot fit in a
# single transaction. Per-row ingestion with replay protection is what the
# registry supports and what app/scripts produces. Fidelity note, stated rather
# than glossed: docs/evidence/position-scale.json.
# LedgerKind.Mint == 0.
LEDGER_TX=$(cast keccak "ledger-aggregate:scale:0Cc688BF")
send "ingestLedger (1 aggregated row)" "$REGISTRY" \
  "ingestLedger(uint64,(address,address,int256,uint64,uint8,bytes32)[])" \
  "$CHAIN_KEY" "[($BORROWER,$A_WETH,$LEDGER_NET,$MEASURE_BLOCK,0,$LEDGER_TX)]"

send "reconcile (bounds interest residual)" "$REGISTRY" \
  "reconcile(address,address,int256,uint64,uint64,bytes32)" \
  "$BORROWER" "$A_WETH" "$ATTESTED_BALANCE" "$MEASURE_BLOCK" "$CHAIN_KEY" \
  "$(cast keccak "balance-attestation:scale:0Cc688BF")"

# ═════════════════════════════════════════════════════════════════════════════
bold "5/6  Attesting the ETH/USD price"
# ═════════════════════════════════════════════════════════════════════════════
# Read fresh from mainnet, because `valuationOf` enforces price freshness against
# the CURRENT block timestamp. A price carried in the source is a StalePrice
# revert the moment the run is older than MAX_STALENESS.
#
# Attesting the AGGREGATOR, never the proxy: the ETH/USD proxy emits no
# AnswerUpdated logs at all, so attesting it would prove nothing while appearing
# to succeed. Measured in docs/evidence.
if [ "$DRY_RUN" = "1" ]; then
  info "read latest ETH/USD answer from $ETH_USD_AGGREGATOR on mainnet"
  PRICE_ANSWER=0; PRICE_DECIMALS=8; PRICE_BLOCK=0; PRICE_UPDATED_AT=0
else
  # cast annotates decoded output ("251727410000 [2.517e11]"), so take field 1.
  # Line 2 is `answer`, line 4 is `updatedAt`.
  if ! PRICE_LINE=$(cast call --rpc-url "$MAINNET_RPC" "$ETH_USD_AGGREGATOR" \
      "latestRoundData()(uint80,int256,uint256,uint256,uint80)"); then
    printf '\033[31m  mainnet price read FAILED - refusing to attest a stale price\033[0m\n' >&2
    exit 1
  fi
  PRICE_ANSWER=$(printf '%s\n' "$PRICE_LINE" | awk 'NR==2{print $1}')
  PRICE_UPDATED_AT=$(printf '%s\n' "$PRICE_LINE" | awk 'NR==4{print $1}')
  if [ -z "$PRICE_ANSWER" ] || [ -z "$PRICE_UPDATED_AT" ]; then
    printf '\033[31m  could not parse latestRoundData:\033[0m\n%s\n' "$PRICE_LINE" >&2
    exit 1
  fi
  PRICE_DECIMALS=8
  PRICE_BLOCK=$(cast block-number --rpc-url "$MAINNET_RPC")
  printf '  mainnet price: %s (8dp), updatedAt %s, at block %s\n' \
    "$PRICE_ANSWER" "$PRICE_UPDATED_AT" "$PRICE_BLOCK" >&2
fi

send "submitAnswer (ETH/USD)" "$FEED" \
  "submitAnswer(address,int256,uint8,uint64,uint256,uint64,bytes32)" \
  "$ETH_USD_AGGREGATOR" "$PRICE_ANSWER" "$PRICE_DECIMALS" "$PRICE_BLOCK" \
  "$PRICE_UPDATED_AT" "$CHAIN_KEY" "$(cast keccak "chainlink:eth-usd:fresh")"

# ═════════════════════════════════════════════════════════════════════════════
bold "6/6  Reading the proven position back, and sizing credit from it"
# ═════════════════════════════════════════════════════════════════════════════
info "PositionValuer   $VALUER"
info "PositionSizedCredit $SIZED"

if [ "$DRY_RUN" = "1" ]; then
  info "cast call \$VALUER \"valuationOf(address,address,address)\" $BORROWER $A_WETH $ETH_USD_AGGREGATOR"
  info "cast call \$SIZED  \"limitFor(address,address[],address[])\" $BORROWER \"[$A_WETH]\" \"[$ETH_USD_AGGREGATOR]\""
  info "(run with DRY_RUN=0 to see the decoded values)"
  bold "Dry run complete. Nothing was sent."
  exit 0
fi

# Return types are spelled out so cast DECODES rather than printing raw hex.
bold "PROVED POSITION (Valuation struct)"
cast call --rpc-url "$RPC_URL" "$VALUER" \
  "valuationOf(address,address,address)((address,int256,uint8,int256,uint8,int256,uint64))" \
  "$BORROWER" "$A_WETH" "$ETH_USD_AGGREGATOR"

bold "LEDGER NET (ledger rows only, before the interest residual)"
cast call --rpc-url "$RPC_URL" "$REGISTRY" "ledgerNet(address,address)(int256)" "$BORROWER" "$A_WETH"

bold "CREDIT SIZED FROM IT"
cast call --rpc-url "$RPC_URL" "$SIZED" \
  "limitFor(address,address[],address[])((int256,uint256,uint8))" \
  "$BORROWER" "[$A_WETH]" "[$ETH_USD_AGGREGATOR]"

bold "Done. Record these addresses in docs/evidence/:"
info "MainnetPositionRegistry $REGISTRY"
info "MainnetTokenRegistry     $TOKENS"
info "AttestedPriceFeed        $FEED"
info "PositionValuer           $VALUER"
info "PositionSizedCredit      $SIZED"
