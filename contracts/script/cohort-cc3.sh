#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  Prepare and monitor a cohort of real users, in one command.
#
#  WHY THIS EXISTS
#  ---------------
#  User-based expansion is the first pillar the judges name, and it is the one gap
#  that no amount of engineering closes. Recruiting people by hand means one round
#  of "what is your address" per person, two chains of balances to check, and a
#  chance to send the wrong amount every time. This collapses that into a pass over
#  a list, so the only work left for a human is asking a human.
#
#  WHAT IT CANNOT DO, WHICH IS THE IMPORTANT PART
#  ----------------------------------------------
#  It cannot run the loop for anyone, and that is not a limitation of this script.
#  Every entry point in CreditLine checks `claim.payer == msg.sender` and reverts
#  BadPayer otherwise, and SepoliaPayment records `deposits[msg.sender]`, so the
#  borrower's own wallet must sign the deposit, the attestation, the open, the
#  withdraw and the repay. There is no relayer and no meta-transaction path in the
#  contracts. This script funds and reports; the person still has to click.
#
#  It also cannot skip the attestation wait. A proof cannot exist until the Sepolia
#  block carrying the event has been attested on Creditcoin, and the Aug 18 AMA
#  confirmed that lag is deliberate, so that re-orgs are settled before the chain
#  is built. Tell people about the wait in advance or they will assume it hung.
#
#  WHAT IT DOES
#    1. Preflight every address: Sepolia ETH, Sepolia nonce, CC3 CTC, CC3 nonce,
#       CreditLine history and position on BOTH generations.
#    2. Top up anything below the minimum, on both chains, sending the DELTA rather
#       than a flat amount, so re-running it never over-funds anyone.
#    3. Print a readiness table and a count of who is new, funded or already active.
#
#  A user's ADDRESS is all that is ever needed from them. Never a private key, and
#  never a seed phrase. An address is public; if a 66-character string arrives, that
#  is a private key and it should be deleted rather than used.
#
#  USAGE
#    export PRIVATE_KEY=0x...            # the FUNDER, not any user's key
#    bash script/cohort-cc3.sh                  # DRY RUN (default): reports only
#    DRY_RUN=0 bash script/cohort-cc3.sh        # sends whatever top-ups are needed
#
#  Addresses come from script/cohort.txt, one per line, `#` starting a comment. That file
#  is gitignored because it names real participants; copy cohort.txt.example to create it.
#  Only the template is tracked.
# ═════════════════════════════════════════════════════════════════════════════
set -uo pipefail

RPC_URL="${RPC_URL:-https://rpc.cc3-testnet.creditcoin.network}"
SEPOLIA_RPC="${SEPOLIA_RPC:-https://ethereum-sepolia-rpc.publicnode.com}"
DRY_RUN="${DRY_RUN:-1}"

# Both generations are read, because a user recruited today goes through the
# balance-sized path on generation 2 while the frozen demo flow lives on generation 1.
CREDIT_LINE_1="${CREDIT_LINE_1:-0x2C3585019B957b16459C409f34973b583267C742}"
CREDIT_LINE_2="${CREDIT_LINE_2:-0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682}"

# ── funding policy, in wei ───────────────────────────────────────────────────
# The minimum is what a user needs to ACT. The target is what they are topped up to.
# 0.05 CC3 CTC is roughly sixty Creditcoin transactions at the ~0.0008 CTC per
# transaction the deploy averaged, so nobody has to come back for gas mid-loop.
SEPOLIA_MIN_WEI="${SEPOLIA_MIN_WEI:-5000000000000000}"    # 0.005 ETH
SEPOLIA_TARGET_WEI="${SEPOLIA_TARGET_WEI:-20000000000000000}" # 0.02 ETH
CC3_MIN_WEI="${CC3_MIN_WEI:-20000000000000000}"           # 0.02 CTC
CC3_TARGET_WEI="${CC3_TARGET_WEI:-50000000000000000}"     # 0.05 CTC

SEND_GAS_LIMIT=30000
COHORT_FILE="${COHORT_FILE:-script/cohort.txt}"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }

# Full-precision wei is unreadable in a table, and this is a readiness check rather
# than an accounting ledger. Five decimals is enough to see "has gas" at a glance.
short() { awk -v v="${1:-0}" 'BEGIN{printf "%.5f", v/1e18}'; }

bold "Cohort preparation - $(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [ "$DRY_RUN" = "1" ]; then
  info "DRY RUN: balances are read, nothing is sent. Set DRY_RUN=0 to top anyone up."
else
  : "${PRIVATE_KEY:?PRIVATE_KEY must be set to the FUNDER key for DRY_RUN=0}"
  FUNDER=$(cast wallet address --private-key "$PRIVATE_KEY")
  info "funder:   $FUNDER"
  info "sepolia:  $(cast balance --rpc-url "$SEPOLIA_RPC" "$FUNDER" --ether) ETH"
  info "cc3:      $(cast balance --rpc-url "$RPC_URL" "$FUNDER" --ether) CTC"
fi

if [ ! -f "$COHORT_FILE" ]; then
  printf '\033[31mno cohort file at %s\033[0m\n' "$COHORT_FILE" >&2
  exit 1
fi

# Strip comments and blanks, keep only well-formed addresses. A malformed line is
# reported rather than silently skipped, because a typo'd address that is quietly
# dropped looks identical to a person who never started.
ADDRESSES=()
mapfile -t RAW < <(sed 's/#.*//' "$COHORT_FILE" | tr -d '\r' | tr -d ' ' | grep -v '^$')
for line in "${RAW[@]}"; do
  if [[ "$line" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    ADDRESSES+=("$line")
  elif [[ "$line" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
    printf '\033[31m  LINE REJECTED: that is 66 chars, so it is a PRIVATE KEY, not an address.\n  Delete it and tell the holder to treat the account as compromised.\033[0m\n' >&2
  else
    printf '\033[31m  LINE REJECTED: not a valid address: %s\033[0m\n' "$line" >&2
  fi
done

if [ "${#ADDRESSES[@]}" -eq 0 ]; then
  bold "No addresses to process."
  exit 0
fi

info "${#ADDRESSES[@]} address(es) in $COHORT_FILE"

# ── per-address state, collected so the table can be printed after any sends ──
ADDR_OUT=(); SEP_OUT=(); CC3_OUT=(); STATE_OUT=(); STAGE_OUT=(); ACTION_OUT=()

read_position_status() { # rpc, creditline, user -> status word (0 None, 1 Active, 2 Closed)
  cast call --rpc-url "$1" "$2" \
    "getPosition(address)(uint256,uint256,uint256,uint256,uint64,uint8,bytes32,bytes32,bytes32)" "$3" \
    2>/dev/null | sed -n '6p' | awk '{print $1}'
}

read_credit() { # rpc, creditline, user -> drawn credit in wei
  cast call --rpc-url "$1" "$2" \
    "getPosition(address)(uint256,uint256,uint256,uint256,uint64,uint8,bytes32,bytes32,bytes32)" "$3" \
    2>/dev/null | sed -n '3p' | awk '{print $1}'
}

bold "Reading every address on both chains"
for a in "${ADDRESSES[@]}"; do
  s_bal=$(cast balance --rpc-url "$SEPOLIA_RPC" "$a" 2>/dev/null || echo 0)
  c_bal=$(cast balance --rpc-url "$RPC_URL" "$a" 2>/dev/null || echo 0)
  s_nonce=$(cast nonce --rpc-url "$SEPOLIA_RPC" "$a" 2>/dev/null || echo 0)
  c_nonce=$(cast nonce --rpc-url "$RPC_URL" "$a" 2>/dev/null || echo 0)

  h1=$(cast call --rpc-url "$RPC_URL" "$CREDIT_LINE_1" "getHistory(address)(uint256,uint256)" "$a" 2>/dev/null | head -1 | awk '{print $1}')
  h1=${h1:-0}
  p1=$(read_position_status "$RPC_URL" "$CREDIT_LINE_1" "$a"); p1=${p1:-0}
  p2=$(read_position_status "$RPC_URL" "$CREDIT_LINE_2" "$a"); p2=${p2:-0}
  drawn1=$(read_credit "$RPC_URL" "$CREDIT_LINE_1" "$a"); drawn1=${drawn1:-0}
  drawn2=$(read_credit "$RPC_URL" "$CREDIT_LINE_2" "$a"); drawn2=${drawn2:-0}

  # Where this person actually is. "Activity" means a proven payment exists, which
  # is the only thing a judge will count and the only thing that cannot be claimed.
  # Status is a 3-valued enum, not a boolean: 0 None, 1 Active, 2 Closed. This used to
  # test `!= 0`, which labelled a CLOSED line "LINE OPEN" and made a finished loop look
  # like live exposure. The two are opposite facts about the same person, and this table
  # is what decides whether they get asked to run the loop again.
  if [ "$p1" = "1" ] || [ "$p2" = "1" ]; then
    stage="LINE ACTIVE"
  elif [ "$p1" = "2" ] || [ "$p2" = "2" ]; then
    stage="LINE CLOSED"
  elif [ "$h1" != "0" ]; then
    stage="HISTORY ($h1)"
  elif [ "$c_nonce" != "0" ] || [ "$s_nonce" != "0" ]; then
    stage="TOUCHED, NO PROOF"
  else
    stage="NEW (untouched)"
  fi

  action="none"
  # Top up the delta on each chain, independently.
  if [ "$s_bal" -lt "$SEPOLIA_MIN_WEI" ]; then
    need=$((SEPOLIA_TARGET_WEI - s_bal))
    if [ "$DRY_RUN" = "1" ]; then
      action="SEND $(short "$need") Sepolia"
    else
      if cast send --rpc-url "$SEPOLIA_RPC" --private-key "$PRIVATE_KEY" "$a" \
           --value "$need" --gas-limit "$SEND_GAS_LIMIT" >/dev/null 2>&1; then
        action="funded Sepolia"
        s_bal=$(cast balance --rpc-url "$SEPOLIA_RPC" "$a")
      else
        action="SEPOLIA SEND FAILED"
      fi
    fi
  fi
  if [ "$c_bal" -lt "$CC3_MIN_WEI" ]; then
    need=$((CC3_TARGET_WEI - c_bal))
    if [ "$DRY_RUN" = "1" ]; then
      action="$action; SEND $(short "$need") CTC"
    else
      # An explicit gas limit is required on CC3: eth_estimateGas fails on some calls
      # there, returning an empty revert while eth_call on the same call succeeds.
      if cast send --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" "$a" \
           --value "$need" --gas-limit "$SEND_GAS_LIMIT" >/dev/null 2>&1; then
        action="$action; funded CTC"
        c_bal=$(cast balance --rpc-url "$RPC_URL" "$a")
      else
        action="$action; CTC SEND FAILED"
      fi
    fi
  fi

  ADDR_OUT+=("$a")
  SEP_OUT+=("$(short "$s_bal")")
  CC3_OUT+=("$(short "$c_bal")")
  STATE_OUT+=("s:$s_nonce/c:$c_nonce hist:$h1 drawn:$((drawn1 + drawn2))")
  STAGE_OUT+=("$stage")
  ACTION_OUT+=("$action")
done

# ── report ───────────────────────────────────────────────────────────────────
bold "Readiness"
printf '  %-44s %-12s %-12s %-30s %-18s %s\n' "ADDRESS" "SEPOLIA" "CC3 CTC" "STATE" "STAGE" "ACTION"
printf '  %s\n' "$(printf '%.0s-' {1..140})"
for i in "${!ADDR_OUT[@]}"; do
  printf '  %-44s %-12s %-12s %-30s %-18s %s\n' \
    "${ADDR_OUT[$i]}" "${SEP_OUT[$i]}" "${CC3_OUT[$i]}" "${STATE_OUT[$i]}" "${STAGE_OUT[$i]}" "${ACTION_OUT[$i]}"
done

ready=0; fresh=0; active=0; finished=0; history=0
for i in "${!ADDR_OUT[@]}"; do
  case "${STAGE_OUT[$i]}" in
    "NEW (untouched)") fresh=$((fresh + 1)); ready=$((ready + 1)) ;;
    "LINE ACTIVE") active=$((active + 1)) ;;
    "LINE CLOSED") finished=$((finished + 1)) ;;
    HISTORY*) history=$((history + 1)) ;;
    *) ready=$((ready + 1)) ;;
  esac
done

bold "Summary"
info "ready to run the loop:  $ready"
info "genuinely new:          $fresh"
info "completed a full loop:  $finished"
info "line still active:      $active"
info "has history, no line:   $history"
info ""
info "Next step is human, not mechanical: send each person the link, and warn them"
info "about the attestation wait before they start, or they will read it as a hang."
info "Their address appears at spark.sithunyein.com/onchain once the loop completes."
