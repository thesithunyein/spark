#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  Deploy EVERYTHING to Creditcoin CC3 testnet, in dependency order.
#
#  One command, one key. Replaces the sequence of four partial deploys.
#
#  WHAT IT SHIPS
#    1. CreditLine (generation 2)     sizing a line from an attested balance, no deposit
#    2. AttestedStanding             portable standing, evidence-anchored, no owner
#    3. GroupCredit                  attested group credit with vouching
#    4. Position stack (5 contracts) proven mainnet net worth -> credit limit
#
#  WHY NOT `forge script`
#  ----------------------
#  `forge script --broadcast` CANNOT run against Creditcoin. Foundry forks the target
#  chain to simulate, and CC3 block headers omit `mixHash` (prevrandao), which Foundry
#  1.7.1 validates. Every invocation fails with:
#
#      EVM error; header validation error: `prevrandao` not set
#
#  Confirmed against both public CC3 RPCs and against a read-only script, so it is
#  Creditcoin's header shape rather than a Spark or node problem. `forge create` does not
#  fork, so it works, and this script is built from it.
#
#  VERIFICATION STATUS
#  -------------------
#  Executed end to end against a local anvil chain: 9 deploys, 5 state changes, decoded
#  read-backs, exit 0. Against real CC3, `forge create` was verified to BUILD the
#  generation-2 transaction and stop at "add --broadcast" (chainId 0x18e8f, gas 2,401,631).
#  The CC3 broadcast itself has not been run from this repository because it needs the key.
#  That is the one unexecuted step, stated rather than glossed.
#
#  USAGE
#  -----
#    export PRIVATE_KEY=0x...              # funded with CC3 testnet CTC
#    bash script/deploy-all-cc3.sh            # DRY RUN (default): prints every command
#    DRY_RUN=0 bash script/deploy-all-cc3.sh  # broadcast
#
#  Testnet CTC: Creditcoin Discord, #token-faucet, `/faucet address:0xYourAddr`.
# ═════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RPC_URL="${RPC_URL:-https://rpc.cc3-testnet.creditcoin.network}"
MAINNET_RPC="${MAINNET_RPC:-https://ethereum-rpc.publicnode.com}"
DRY_RUN="${DRY_RUN:-1}"

# The already-deployed AttestcoinPaymentVerifier on CC3. Generation 2 REUSES it rather
# than minting a duplicate, so both generations share one verified verifier.
VERIFIER_ADDRESS="${VERIFIER_ADDRESS:-0xF13205Bdf48A3159d4A46309C639930aE8faC130}"
ZERO=0x0000000000000000000000000000000000000000

# ── generation-2 CreditLine policy ───────────────────────────────────────────
COLLATERAL_FACTOR_BPS="${COLLATERAL_FACTOR_BPS:-8000}"
INTEREST_PER_YEAR_BPS="${INTEREST_PER_YEAR_BPS:-1000}"

# ── real measured mainnet facts (docs/evidence/*.json) ───────────────────────
CHAIN_KEY="${CHAIN_KEY:-3}" # 3 = Ethereum mainnet
BORROWER="${BORROWER:-0x0Cc688BF78bDCC3C072903100B2b821cC8d7d666}"
A_WETH=0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8
WETH=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
ETH_USD_AGGREGATOR=0x7d4E742018fb52E48b08BE73d041C18B21de6Fb5
ANCHOR_BLOCK=25962220    # balanceOf == 0 here, archive-verified
LEDGER_NET=433014008378577163575
ATTESTED_BALANCE=433033874843288486772
MEASURE_BLOCK=25970521   # block where balanceOf == ATTESTED_BALANCE
MAX_RESIDUAL_BPS="${MAX_RESIDUAL_BPS:-1000}"
MAX_STALENESS="${MAX_STALENESS:-86400}"
LTV_BPS="${LTV_BPS:-2000}"
MIN_NET_WORTH_USD8="${MIN_NET_WORTH_USD8:-100000000000}"
MAX_CREDIT_USD8="${MAX_CREDIT_USD8:-50000000000000}"

# Human-facing output goes to STDERR: deploy() and send() are called inside command
# substitution, so stdout must carry nothing but the value being returned.
bold() { printf '\n\033[1m%s\033[0m\n' "$*" >&2; }
info() { printf '    %s\n' "$*" >&2; }

if [ "$DRY_RUN" = "1" ]; then
  bold "DRY RUN - no transactions will be sent. Set DRY_RUN=0 to broadcast."
else
  bold "BROADCASTING to $RPC_URL"
  : "${PRIVATE_KEY:?PRIVATE_KEY must be set to a funded CC3 key for DRY_RUN=0}"
fi

# `forge create --json` pretty-prints, so `"deployedTo": "0x.."` has a space after the colon.
addr_of() { sed -n 's/.*"deployedTo": *"\(0x[0-9a-fA-F]*\)".*/\1/p' | head -1; }

deploy() {
  local label="$1" target="$2"; shift 2
  if [ "$DRY_RUN" = "1" ]; then
    info "forge create $target --constructor-args $*"
    printf '%s' "$ZERO"
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
  printf '  ✅ %-26s %s\n' "$label" "$addr" >&2
  printf '%s' "$addr"
}

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
  printf '  ✅ %-38s %s\n' "$label" \
    "$(printf '%s' "$out" | sed -n 's/.*"transactionHash": *"\(0x[0-9a-fA-F]*\)".*/\1/p' | head -1)" >&2
}

# ═════════════════════════════════════════════════════════════════════════════
bold "0/6  Preflight"
# ═════════════════════════════════════════════════════════════════════════════
if [ "$DRY_RUN" = "1" ]; then
  DEPLOYER=$ZERO
  info "deployer: (dry run — not derived, all addresses below are placeholders)"
  info "verifier: $VERIFIER_ADDRESS"
else
  DEPLOYER=$(cast wallet address --private-key "$PRIVATE_KEY")
  info "deployer / attestor / owner: $DEPLOYER"
  info "balance: $(cast balance --rpc-url "$RPC_URL" "$DEPLOYER" --ether) CTC"

  # A dead verifier would make generation 2 permanently unopenable while looking like a
  # successful deploy, so refuse before spending anything.
  VCODE=$(cast code --rpc-url "$RPC_URL" "$VERIFIER_ADDRESS")
  if [ "${#VCODE}" -le 2 ]; then
    printf '\033[31m  VERIFIER_ADDRESS %s has no code on %s — refusing to deploy against it\033[0m\n' \
      "$VERIFIER_ADDRESS" "$RPC_URL" >&2
    exit 1
  fi
  info "verifier has code: yes"
fi

# ═════════════════════════════════════════════════════════════════════════════
bold "1/6  CreditLine generation 2 (reuses the deployed verifier)"
# ═════════════════════════════════════════════════════════════════════════════
CREDIT_LINE=$(deploy "CreditLine (gen 2)" src/CreditLine.sol:CreditLine \
  "$VERIFIER_ADDRESS" "$COLLATERAL_FACTOR_BPS" "$INTEREST_PER_YEAR_BPS")

# ═════════════════════════════════════════════════════════════════════════════
bold "2/6  AttestedStanding (portable standing over generation 2)"
# ═════════════════════════════════════════════════════════════════════════════
STANDING=$(deploy "AttestedStanding" src/AttestedStanding.sol:AttestedStanding "$CREDIT_LINE")

# ═════════════════════════════════════════════════════════════════════════════
bold "3/6  GroupCredit (group line + vouching over the standing registry)"
# ═════════════════════════════════════════════════════════════════════════════
GROUP=$(deploy "GroupCredit" src/GroupCredit.sol:GroupCredit "$STANDING")

# ═════════════════════════════════════════════════════════════════════════════
bold "4/6  Position stack (proven mainnet net worth)"
# ═════════════════════════════════════════════════════════════════════════════
REGISTRY=$(deploy MainnetPositionRegistry src/MainnetPositionRegistry.sol:MainnetPositionRegistry \
  "$DEPLOYER" "$CHAIN_KEY" "$MAX_RESIDUAL_BPS")
TOKENS=$(deploy MainnetTokenRegistry src/MainnetTokenRegistry.sol:MainnetTokenRegistry \
  "$DEPLOYER" "$CHAIN_KEY")
FEED=$(deploy AttestedPriceFeed src/AttestedPriceFeed.sol:AttestedPriceFeed \
  "$DEPLOYER" "$CHAIN_KEY" "$MAX_STALENESS")
VALUER=$(deploy PositionValuer src/PositionValuer.sol:PositionValuer \
  "$REGISTRY" "$TOKENS" "$FEED")
SIZED=$(deploy PositionSizedCredit src/PositionSizedCredit.sol:PositionSizedCredit \
  "$VALUER" "$DEPLOYER" "$LTV_BPS" "$MIN_NET_WORTH_USD8" "$MAX_CREDIT_USD8")

# ═════════════════════════════════════════════════════════════════════════════
bold "5/6  Position stack: register the asset, anchor, ledger, reconcile"
# ═════════════════════════════════════════════════════════════════════════════
# decimals() cannot be called on a mainnet token from Creditcoin, so it is an attested
# fact. TokenKind.Asset == 0. One aggregated ledger row, because the real position is
# 8,508 transfers and cannot fit in a transaction: docs/evidence/position-scale.json.
send "registerToken(aEthWETH)" "$TOKENS" \
  "registerToken(address,uint8,bytes32,uint8,address,uint64,uint64)" \
  "$A_WETH" 18 "$(cast format-bytes32-string "aave-v3")" 0 "$WETH" "$MEASURE_BLOCK" "$CHAIN_KEY"

send "setZeroAnchor" "$REGISTRY" \
  "setZeroAnchor(address,address,uint64,uint64,bytes32)" \
  "$BORROWER" "$A_WETH" "$ANCHOR_BLOCK" "$CHAIN_KEY" "$(cast keccak "anchor:scale:0Cc688BF")"

send "ingestLedger (1 aggregated row)" "$REGISTRY" \
  "ingestLedger(uint64,(address,address,int256,uint64,uint8,bytes32)[])" \
  "$CHAIN_KEY" \
  "[($BORROWER,$A_WETH,$LEDGER_NET,$MEASURE_BLOCK,0,$(cast keccak "ledger-aggregate:scale:0Cc688BF"))]"

send "reconcile (bounds interest residual)" "$REGISTRY" \
  "reconcile(address,address,int256,uint64,uint64,bytes32)" \
  "$BORROWER" "$A_WETH" "$ATTESTED_BALANCE" "$MEASURE_BLOCK" "$CHAIN_KEY" \
  "$(cast keccak "balance-attestation:scale:0Cc688BF")"

# ═════════════════════════════════════════════════════════════════════════════
bold "6/6  Attest the ETH/USD price, then read the whole thing back"
# ═════════════════════════════════════════════════════════════════════════════
# Read FRESH from mainnet: `valuationOf` enforces freshness against the CURRENT block
# timestamp, so a price carried in the source becomes a StalePrice revert the moment the
# run is older than MAX_STALENESS. The AGGREGATOR is attested, never the proxy — the proxy
# emits no AnswerUpdated logs at all, so attesting it would prove nothing while appearing
# to succeed (measured: docs/evidence).
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
  info "mainnet price: $PRICE_ANSWER (8dp), updatedAt $PRICE_UPDATED_AT, at block $PRICE_BLOCK"
fi

send "submitAnswer (ETH/USD)" "$FEED" \
  "submitAnswer(address,int256,uint8,uint64,uint256,uint64,bytes32)" \
  "$ETH_USD_AGGREGATOR" "$PRICE_ANSWER" "$PRICE_DECIMALS" "$PRICE_BLOCK" \
  "$PRICE_UPDATED_AT" "$CHAIN_KEY" "$(cast keccak "chainlink:eth-usd:fresh")"

if [ "$DRY_RUN" = "1" ]; then
  bold "Dry run complete. Nothing was sent."
  info "Address placeholders above are all $ZERO; real values appear on a live run."
  exit 0
fi

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

bold "STANDING REGISTRY (empty until someone has a verified record)"
cast call --rpc-url "$RPC_URL" "$STANDING" "recordCount()(uint32)"

bold "═══════════ RECORD THESE IN docs/addresses.md ═══════════"
info "CreditLine gen 2        $CREDIT_LINE"
info "AttestedStanding        $STANDING"
info "GroupCredit             $GROUP"
info "MainnetPositionRegistry $REGISTRY"
info "MainnetTokenRegistry    $TOKENS"
info "AttestedPriceFeed       $FEED"
info "PositionValuer          $VALUER"
info "PositionSizedCredit     $SIZED"
info "AttestcoinPaymentVerifier (reused)  $VERIFIER_ADDRESS"
