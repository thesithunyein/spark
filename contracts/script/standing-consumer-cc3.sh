#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  Demonstrate portable standing END TO END on Creditcoin CC3.
#
#  This closes the last claim in the product that was still only an interface:
#  "a verified record follows the borrower to a second application". Until this
#  script ran, `AttestedStanding` published a record that nothing consumed, so
#  portability was architecture rather than a demonstrated fact.
#
#  WHAT IT SHIPS
#    1. AttestedStanding (over GENERATION 1)   the registry, anchored to the live,
#                                              video-recorded generation
#    2. StandingGatedCheckout                  a merchant that is NOT Spark and
#                                              applies its OWN policy
#    3. refresh(deployer)                      issues a record from real Attestcoin
#                                              evidence already on chain
#    4. setPolicy / listItem / checkout        defers payment against that record
#    5. settle                                 pays the merchant and clears the room
#
#  WHY GENERATION 1 AND NOT GENERATION 2
#    9 contracts were deployed to CC3 after the submission deadline, and the
#    registry in that batch points at generation-2 CreditLine, which is clean:
#    `getHistory(deployer)` returns (0, 0), so `refresh` correctly reverts with
#    NotAttested. A registry over GENERATION 1 has real evidence available today,
#    because generation 1 is the deployment the demo video and the frozen
#    submission describe, and it holds 6 attested payments and a dual-proof open
#    for the deployer. Anchoring the demonstration to it is both cheaper (no new
#    Sepolia deposit) and more faithful to what was entered.
#
#    This is the registry's design working as intended, not a workaround:
#    `ICreditLineView` exists so a registry can point at ANY CreditLine
#    deployment, including a future generation, without inheriting its storage.
#
#  WHY NOT `forge script`
#    Same reason as deploy-all-cc3.sh: `forge script --broadcast` cannot run
#    against Creditcoin because CC3 headers omit `mixHash` (prevrandao) and
#    Foundry validates it. `forge create` does not fork, so it works.
#
#  USAGE
#    export PRIVATE_KEY=0x...                    # funded with CC3 testnet CTC
#    bash script/standing-consumer-cc3.sh            # DRY RUN (default)
#    DRY_RUN=0 bash script/standing-consumer-cc3.sh  # broadcast
#
#  Everything below is read back from the chain, not asserted from intent.
# ═════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RPC_URL="${RPC_URL:-https://rpc.cc3-testnet.creditcoin.network}"
DRY_RUN="${DRY_RUN:-1}"
VERIFY="${VERIFY:-1}"

# ── WHY EVERY `cast send` CARRIES AN EXPLICIT GAS LIMIT ──────────────────────
# CC3's `eth_estimateGas` fails on calls that write storage, returning an empty revert:
#
#     VM Exception while processing transaction: revert, data: "0x"
#
# while the identical call succeeds through `eth_call`. That is the same block-header
# shape that stops `forge script --broadcast` (CC3 omits `mixHash`/prevrandao), surfacing
# in the estimation path instead. Supplying the limit explicitly bypasses estimation, and
# the transaction executes normally. 1.5M is comfortably above every call this script
# makes; the largest, `setPolicy`, is a single struct write.
GAS_LIMIT="${GAS_LIMIT:-1500000}"

# ── RESUMABILITY ─────────────────────────────────────────────────────────────
# Passing an existing address skips the deploy for that contract, so a run that fails
# part-way can be continued instead of redeploying and orphaning a good registry.
STANDING="${STANDING:-}"
CHECKOUT="${CHECKOUT:-}"

# The LIVE generation: the one the demo video, the deck and the DoraHacks entry describe.
GEN1_CREDIT_LINE="${GEN1_CREDIT_LINE:-0x2C3585019B957b16459C409f34973b583267C742}"
ZERO=0x0000000000000000000000000000000000000000

# ── the merchant's OWN policy. Spark's LTV rules are deliberately irrelevant here: the
#    point of this contract is that a third party applies its own thresholds to facts it
#    did not verify itself. ────────────────────────────────────────────────────────────
MIN_SCORE="${MIN_SCORE:-650}"       # generation-1 floor
MIN_PAYMENTS="${MIN_PAYMENTS:-3}"   # stricter than Spark's own gate, on purpose
MAX_AGE_SECONDS="${MAX_AGE_SECONDS:-2592000}" # 30 days, so the demo stays readable
TERM_SECONDS="${TERM_SECONDS:-2592000}"       # 30 days to settle
MAX_DEFERRED_WEI="${MAX_DEFERRED_WEI:-50000000000000000}" # 0.05 ETH ceiling per merchant
ADVANCE_BPS="${ADVANCE_BPS:-2000}"  # 20% of proven volume, matching the position policy
ITEM_PRICE_WEI="${ITEM_PRICE_WEI:-10000000000000000}" # 0.01 ETH item

bold() { printf '\n\033[1m%s\033[0m\n' "$*" >&2; }
info() { printf '    %s\n' "$*" >&2; }

if [ "$DRY_RUN" = "1" ]; then
  bold "DRY RUN - no transactions will be sent. Set DRY_RUN=0 to broadcast."
else
  bold "BROADCASTING to $RPC_URL"
  : "${PRIVATE_KEY:?PRIVATE_KEY must be set to a funded CC3 key for DRY_RUN=0}"
fi

addr_of() { sed -n 's/.*"deployedTo": *"\(0x[0-9a-fA-F]*\)".*/\1/p' | head -1; }
txid_of() { sed -n 's/.*"transactionHash": *"\(0x[0-9a-fA-F]*\)".*/\1/p' | head -1; }

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
  printf '  ✅ %-28s %s\n' "$label" "$addr" >&2
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
      "$to" "$sig" "$@" --gas-limit "$GAS_LIMIT" --json 2>&1); then
    printf '\033[31m  %s FAILED\033[0m\n%s\n' "$label" "$(printf '%s' "$out" | tail -3)" >&2
    return 1
  fi
  printf '  ✅ %-40s %s\n' "$label" "$(printf '%s' "$out" | txid_of)" >&2
}

verify() {
  local label="$1" addr="$2" target="$3"; shift 3
  [ "$VERIFY" = "1" ] || return 0
  [ "$DRY_RUN" = "1" ] && return 0
  local args; args=$(cast abi-encode "constructor(address)" "$@")
  local out
  if out=$(forge verify-contract --rpc-url "$RPC_URL" --verifier blockscout \
      --verifier-url "$BLOCKSCOUT" --constructor-args "$args" "$addr" "$target" 2>&1); then
    printf '  ✅ %-28s verified\n' "$label" >&2
  else
    printf '  ⚠️  %-28s verification submitted/failed: %s\n' "$label" "$(printf '%s' "$out" | tail -2 | tr '\n' ' ')" >&2
  fi
}

BLOCKSCOUT="${BLOCKSCOUT:-https://creditcoin-testnet.blockscout.com/api}"

# ═════════════════════════════════════════════════════════════════════════════
bold "0/5  Preflight"
# ═════════════════════════════════════════════════════════════════════════════
if [ "$DRY_RUN" = "1" ]; then
  DEPLOYER=$ZERO
  info "registry over: $GEN1_CREDIT_LINE"
else
  DEPLOYER=$(cast wallet address --private-key "$PRIVATE_KEY")
  BAL=$(cast balance --rpc-url "$RPC_URL" "$DEPLOYER" --ether)
  info "deployer: $DEPLOYER"
  info "balance:  $BAL CTC"
  # Generation 1 must actually hold evidence, otherwise refresh will revert with
  # NotAttested and the demonstration is meaningless. Checked, not assumed.
  HC=$(cast call --rpc-url "$RPC_URL" "$GEN1_CREDIT_LINE" "getHistory(address)(uint256,uint256)" "$DEPLOYER" | head -1)
  info "generation-1 attested payments for the deployer: $HC"
  if [ "$HC" = "0" ]; then
    printf '\033[31m  no attested history on generation 1 - a record cannot be issued\033[0m\n' >&2
    exit 1
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
bold "1/5  Deploy the registry over the LIVE generation"
# ═════════════════════════════════════════════════════════════════════════════
if [ -n "$STANDING" ]; then
  info "reusing registry $STANDING"
else
  STANDING=$(deploy "AttestedStanding (gen-1)" src/AttestedStanding.sol:AttestedStanding "$GEN1_CREDIT_LINE")
  verify "AttestedStanding (gen-1)" "$STANDING" src/AttestedStanding.sol:AttestedStanding "$GEN1_CREDIT_LINE"
fi

# ═════════════════════════════════════════════════════════════════════════════
bold "2/5  Deploy the second consumer"
# ═════════════════════════════════════════════════════════════════════════════
if [ -n "$CHECKOUT" ]; then
  info "reusing checkout  $CHECKOUT"
else
  CHECKOUT=$(deploy "StandingGatedCheckout" src/StandingGatedCheckout.sol:StandingGatedCheckout "$STANDING")
  verify "StandingGatedCheckout" "$CHECKOUT" src/StandingGatedCheckout.sol:StandingGatedCheckout "$STANDING"
fi

# ═════════════════════════════════════════════════════════════════════════════
bold "3/5  Issue a standing record from existing Attestcoin evidence"
# ═════════════════════════════════════════════════════════════════════════════
# Permissionless: anyone can keep a record current. Nobody can forge one, because the data
# comes from a contract that only records an entry behind an Attestcoin proof.
send "refresh(deployer)" "$CHECKOUT" "refresh(address)" "$DEPLOYER"

if [ "$DRY_RUN" = "0" ]; then
  info "recordCount: $(cast call --rpc-url "$RPC_URL" "$STANDING" "recordCount()(uint32)")"
  info "standing read-back:"
  cast call --rpc-url "$RPC_URL" "$STANDING" \
    "standingOf(address)(uint16,uint32,uint128,uint128,uint64,bytes32,bool)" "$DEPLOYER" >&2
fi

# ═════════════════════════════════════════════════════════════════════════════
bold "4/5  The merchant applies its own policy"
# ═════════════════════════════════════════════════════════════════════════════
send "setPolicy" "$CHECKOUT" "setPolicy(uint16,uint32,uint64,uint64,uint128,uint16)" \
  "$MIN_SCORE" "$MIN_PAYMENTS" "$MAX_AGE_SECONDS" "$TERM_SECONDS" "$MAX_DEFERRED_WEI" "$ADVANCE_BPS"

ITEM_ID=1
send "listItem(0.01 ETH)" "$CHECKOUT" "listItem(uint128)" "$ITEM_PRICE_WEI"

if [ "$DRY_RUN" = "0" ]; then
  info "canDefer(buyer, merchant, price) ->"
  cast call --rpc-url "$RPC_URL" "$CHECKOUT" "canDefer(address,address,uint128)(bool,uint128)" \
    "$DEPLOYER" "$DEPLOYER" "$ITEM_PRICE_WEI" >&2
fi

send "checkout(item 1)" "$CHECKOUT" "checkout(uint256)" "$ITEM_ID"

# ═════════════════════════════════════════════════════════════════════════════
bold "5/5  Settle the deferred order"
# ═════════════════════════════════════════════════════════════════════════════
ORDER_ID=1
if [ "$DRY_RUN" = "1" ]; then
  info "cast send $CHECKOUT \"settle(uint256)\" $ORDER_ID --value <deferral>"
  DEFERRED="<deferral>"
else
  # Read the deferral back rather than assuming it: the number is the merchant's policy
  # applied to the borrower's proven volume, and the whole point is that it is derived.
  DEFERRED=$(cast call --rpc-url "$RPC_URL" "$CHECKOUT" \
    "orderOf(uint256)(address,address,uint128,uint64,bytes32,uint16,uint32,bool)" "$ORDER_ID" \
    | sed -n '3p' | awk '{print $1}')
  info "deferred (read from the order): $DEFERRED wei"
  MERCHANT_BEFORE=$(cast balance --rpc-url "$RPC_URL" "$DEPLOYER")
  send "settle(order 1)" "$CHECKOUT" "settle(uint256)" "$ORDER_ID" --value "$DEFERRED"
  MERCHANT_AFTER=$(cast balance --rpc-url "$RPC_URL" "$DEPLOYER")
  info "merchant delta: $((MERCHANT_AFTER - MERCHANT_BEFORE)) wei (negative: the buyer also paid gas)"
fi

# ═════════════════════════════════════════════════════════════════════════════
bold "RESULT - read back from CC3"
# ═════════════════════════════════════════════════════════════════════════════
cat >&2 <<EOF

  AttestedStanding (gen-1)  $STANDING
  StandingGatedCheckout     $CHECKOUT

  recordCount                      $( [ "$DRY_RUN" = 0 ] && cast call --rpc-url "$RPC_URL" "$STANDING" "recordCount()(uint32)" || echo "(dry run)" )
  orderCount                       $( [ "$DRY_RUN" = 0 ] && cast call --rpc-url "$RPC_URL" "$CHECKOUT" "orderCount()(uint256)" || echo "(dry run)" )
  outstanding[buyer][merchant]     $( [ "$DRY_RUN" = 0 ] && cast call --rpc-url "$RPC_URL" "$CHECKOUT" "outstanding(address,address)(uint128)" "$DEPLOYER" "$DEPLOYER" || echo "(dry run)" )
  isOverdue(order 1)               $( [ "$DRY_RUN" = 0 ] && cast call --rpc-url "$RPC_URL" "$CHECKOUT" "isOverdue(uint256)(bool)" 1 || echo "(dry run)" )
  standing age                     $( [ "$DRY_RUN" = 0 ] && cast call --rpc-url "$RPC_URL" "$STANDING" "standingAge(address)(uint64)" "$DEPLOYER" || echo "(dry run)" )

  Blockscout:
    https://creditcoin-testnet.blockscout.com/address/$STANDING
    https://creditcoin-testnet.blockscout.com/address/$CHECKOUT
EOF
