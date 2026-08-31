#!/bin/bash
# Negative-path tests against the real BlockProver precompile on CC3 testnet
# Uses cast call (eth_call) — zero gas, zero CTC, zero cost
# Run: bash run-negative-paths.sh

RPC="https://rpc.cc3-testnet.creditcoin.network"
PRECOMPILE="0x0000000000000000000000000000000000000FD2"

echo "============================================="
echo "  Spark - Live Negative-Path Tests (CC3)"
echo "  Using eth_call — zero cost"
echo "============================================="
echo ""

PASS=0
FAIL=0

# Test 1: Forged merkle root
echo -n "[1] Forged merkle root... "
RESULT=$(cast call $PRECOMPILE "verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))" \
    1 100 0xff \
    "($PRECOMPILE,())" \
    "(0x0000000000000000000000000000000000000000000000000000000000000001,())" \
    --rpc-url $RPC 2>&1)
if echo "$RESULT" | grep -qi "error\|revert\|false"; then
    echo "REJECTED (expected)"
    PASS=$((PASS+1))
else
    echo "UNEXPECTED: $RESULT"
    FAIL=$((FAIL+1))
fi

# Test 2: Wrong chain key (99)
echo -n "[2] Wrong chain key (99)... "
RESULT=$(cast call $PRECOMPILE "verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))" \
    99 100 0xff \
    "(0x0000000000000000000000000000000000000000000000000000000000000001,())" \
    "(0x0000000000000000000000000000000000000000000000000000000000000002,())" \
    --rpc-url $RPC 2>&1)
if echo "$RESULT" | grep -qi "error\|revert\|false"; then
    echo "REJECTED (expected)"
    PASS=$((PASS+1))
else
    echo "UNEXPECTED: $RESULT"
    FAIL=$((FAIL+1))
fi

# Test 3: Zero height
echo -n "[3] Zero height... "
RESULT=$(cast call $PRECOMPILE "verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))" \
    1 0 0xff \
    "(0x0000000000000000000000000000000000000000000000000000000000000001,())" \
    "(0x0000000000000000000000000000000000000000000000000000000000000002,())" \
    --rpc-url $RPC 2>&1)
if echo "$RESULT" | grep -qi "error\|revert\|false"; then
    echo "REJECTED (expected)"
    PASS=$((PASS+1))
else
    echo "UNEXPECTED: $RESULT"
    FAIL=$((FAIL+1))
fi

# Test 4: Empty encoded transaction
echo -n "[4] Empty encoded transaction... "
RESULT=$(cast call $PRECOMPILE "verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))" \
    1 100 0x \
    "(0x0000000000000000000000000000000000000000000000000000000000000001,())" \
    "(0x0000000000000000000000000000000000000000000000000000000000000002,())" \
    --rpc-url $RPC 2>&1)
if echo "$RESULT" | grep -qi "error\|revert\|false"; then
    echo "REJECTED (expected)"
    PASS=$((PASS+1))
else
    echo "UNEXPECTED: $RESULT"
    FAIL=$((FAIL+1))
fi

# Test 5: Mismatched sibling lengths
echo -n "[5] Mismatched sibling lengths... "
RESULT=$(cast call $PRECOMPILE "verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))" \
    1 100 0xff \
    "(0x0000000000000000000000000000000000000000000000000000000000000001,[(0x0000000000000000000000000000000000000000000000000000000000000003,true)])" \
    "(0x0000000000000000000000000000000000000000000000000000000000000002,())" \
    --rpc-url $RPC 2>&1)
if echo "$RESULT" | grep -qi "error\|revert\|false"; then
    echo "REJECTED (expected)"
    PASS=$((PASS+1))
else
    echo "UNEXPECTED: $RESULT"
    FAIL=$((FAIL+1))
fi

echo ""# Test 6: Very large chain key
    echo -n "[6] Very large chain key (9999)... "
    RESULT=$(cast call $PRECOMPILE "verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))" \
        9999 100 0xff \
        "(0x0000000000000000000000000000000000000000000000000000000000000001,())" \
        "(0x0000000000000000000000000000000000000000000000000000000000000002,())" \
        --rpc-url $RPC 2>&1)
    if echo "$RESULT" | grep -qi "error\|revert\|false"; then
        echo "REJECTED (expected)"
        PASS=$((PASS+1))
    else
        echo "UNEXPECTED: $RESULT"
        FAIL=$((FAIL+1))
    fi

    # Test 7: Max uint64 height
    echo -n "[7] Max uint64 height... "
    RESULT=$(cast call $PRECOMPILE "verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))" \
        1 18446744073709551615 0xff \
        "(0x0000000000000000000000000000000000000000000000000000000000000001,())" \
        "(0x0000000000000000000000000000000000000000000000000000000000000002,())" \
        --rpc-url $RPC 2>&1)
    if echo "$RESULT" | grep -qi "error\|revert\|false"; then
        echo "REJECTED (expected)"
        PASS=$((PASS+1))
    else
        echo "UNEXPECTED: $RESULT"
        FAIL=$((FAIL+1))
    fi

    # Test 8: Random bytes as proof
    echo -n "[8] Random bytes as proof... "
    RESULT=$(cast call $PRECOMPILE "verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))" \
        1 100 0xdeadbeef \
        "(0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef,[(0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef,false)])" \
        "(0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef,[0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef])" \
        --rpc-url $RPC 2>&1)
    if echo "$RESULT" | grep -qi "error\|revert\|false"; then
        echo "REJECTED (expected)"
        PASS=$((PASS+1))
    else
        echo "UNEXPECTED: $RESULT"
        FAIL=$((FAIL+1))
    fi

    echo ""
    echo "============================================="
    echo "  Results: $PASS rejected, $FAIL unexpected"
    echo "============================================="
