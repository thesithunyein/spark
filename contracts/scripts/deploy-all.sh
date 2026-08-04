#!/usr/bin/env bash
# Deploy Spark contracts then print addresses for env.
# Usage (from contracts/): source .env && ./scripts/deploy-all.sh
set -euo pipefail

: "${PRIVATE_KEY:?}"
: "${TREASURY:?}"
SEPOLIA_RPC="${SEPOLIA_RPC:-https://ethereum-sepolia-rpc.publicnode.com}"
CREDITCOIN_RPC="${CREDITCOIN_RPC:-https://rpc.cc3-testnet.creditcoin.network}"

echo "==> SepoliaPayment"
PAY_OUT=$(forge script script/Deploy.s.sol:DeploySpark --sig "deployPayment()" \
  --rpc-url "$SEPOLIA_RPC" --broadcast -vvv)
echo "$PAY_OUT"
PAYMENT=$(echo "$PAY_OUT" | sed -n 's/.*SepoliaPayment[[:space:]]*\(0x[a-fA-F0-9]*\).*/\1/p' | tail -1)

echo "==> CreditLine + MockVerifier"
CC_OUT=$(USE_MOCK_VERIFIER=true forge script script/Deploy.s.sol:DeploySpark \
  --rpc-url "$CREDITCOIN_RPC" --broadcast -vvv)
echo "$CC_OUT"
VERIFIER=$(echo "$CC_OUT" | sed -n 's/.*MockPaymentVerifier[[:space:]]*\(0x[a-fA-F0-9]*\).*/\1/p' | tail -1)
CREDITLINE=$(echo "$CC_OUT" | sed -n 's/.*CreditLine[[:space:]]*\(0x[a-fA-F0-9]*\).*/\1/p' | tail -1)

echo ""
echo "PAYMENT_ADDRESS=$PAYMENT"
echo "VERIFIER_ADDRESS=$VERIFIER"
echo "CREDITLINE_ADDRESS=$CREDITLINE"
