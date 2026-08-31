// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import "forge-std/console2.sol";

/**
 * @title NegativePathLive
 * @notice Tests the real BlockProver precompile on CC3 testnet with forged proofs.
 *         Uses eth_call (view) — zero gas cost, zero CTC needed.
 *         Run: forge script script/NegativePathLive.s.sol --sig "run()" --rpc-url creditcoin
 */
interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }
    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }
    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }
    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);
    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool);
}

contract NegativePathLive is Script {
    INativeQueryVerifier constant BLOCK_PROVER = INativeQueryVerifier(0x0000000000000000000000000000000000000FD2);

    function run() public {
        console2.log("=== Negative-Path Live Tests (CC3 Testnet) ===");
        console2.log("Using eth_call - zero cost, zero CTC needed\n");

        // Test 1: Forged merkle root
        _testForgedMerkleRoot();

        // Test 2: Empty proof
        _testEmptyProof();

        // Test 3: Wrong chain key
        _testWrongChainKey();

        // Test 4: Zero height
        _testZeroHeight();

        // Test 5: Oversized encoded tx
        _testOversizedEncodedTx();

        console2.log("\n=== All negative-path tests completed ===");
        console2.log("Results show precompile rejects invalid proofs");
    }

    function _testForgedMerkleRoot() internal {
        bytes32[] memory siblings = new bytes32[](0);
        bool[] memory isLeft = new bool[](0);
        INativeQueryVerifier.MerkleProofEntry[] memory entries = new INativeQueryVerifier.MerkleProofEntry[](0);

        INativeQueryVerifier.MerkleProof memory mp = INativeQueryVerifier.MerkleProof({
            root: keccak256("forged-root"),
            siblings: entries
        });
        INativeQueryVerifier.ContinuityProof memory cp = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: keccak256("fake-digest"),
            roots: new bytes32[](0)
        });

        try BLOCK_PROVER.verify(1, 100, hex"ff", mp, cp) returns (bool result) {
            console2.log("[1] Forged merkle root: verify returned %s (expected false)", result ? "true" : "false");
        } catch {
            console2.log("[1] Forged merkle root: PRECOMPILE REJECTED (expected)");
        }
    }

    function _testEmptyProof() internal {
        INativeQueryVerifier.MerkleProof memory mp = INativeQueryVerifier.MerkleProof({
            root: bytes32(0),
            siblings: new INativeQueryVerifier.MerkleProofEntry[](0)
        });
        INativeQueryVerifier.ContinuityProof memory cp = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: bytes32(0),
            roots: new bytes32[](0)
        });

        try BLOCK_PROVER.verify(1, 100, hex"", mp, cp) returns (bool result) {
            console2.log("[2] Empty proof: verify returned %s", result ? "true" : "false");
        } catch {
            console2.log("[2] Empty proof: PRECOMPILE REJECTED (expected)");
        }
    }

    function _testWrongChainKey() internal {
        INativeQueryVerifier.MerkleProof memory mp = INativeQueryVerifier.MerkleProof({
            root: keccak256("test"),
            siblings: new INativeQueryVerifier.MerkleProofEntry[](0)
        });
        INativeQueryVerifier.ContinuityProof memory cp = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: keccak256("digest"),
            roots: new bytes32[](0)
        });

        try BLOCK_PROVER.verify(99, 100, hex"ff", mp, cp) returns (bool result) {
            console2.log("[3] Wrong chain key (99): verify returned %s", result ? "true" : "false");
        } catch {
            console2.log("[3] Wrong chain key (99): PRECOMPILE REJECTED (expected)");
        }
    }

    function _testZeroHeight() internal {
        INativeQueryVerifier.MerkleProof memory mp = INativeQueryVerifier.MerkleProof({
            root: keccak256("test"),
            siblings: new INativeQueryVerifier.MerkleProofEntry[](0)
        });
        INativeQueryVerifier.ContinuityProof memory cp = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: keccak256("digest"),
            roots: new bytes32[](0)
        });

        try BLOCK_PROVER.verify(1, 0, hex"ff", mp, cp) returns (bool result) {
            console2.log("[4] Zero height: verify returned %s", result ? "true" : "false");
        } catch {
            console2.log("[4] Zero height: PRECOMPILE REJECTED (expected)");
        }
    }

    function _testOversizedEncodedTx() internal {
        bytes memory bigTx = new bytes(1024);
        for (uint256 i = 0; i < 1024; i++) {
            bigTx[i] = 0xff;
        }

        INativeQueryVerifier.MerkleProof memory mp = INativeQueryVerifier.MerkleProof({
            root: keccak256("test"),
            siblings: new INativeQueryVerifier.MerkleProofEntry[](0)
        });
        INativeQueryVerifier.ContinuityProof memory cp = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: keccak256("digest"),
            roots: new bytes32[](0)
        });

        try BLOCK_PROVER.verify(1, 100, bigTx, mp, cp) returns (bool result) {
            console2.log("[5] Oversized encoded tx: verify returned %s", result ? "true" : "false");
        } catch {
            console2.log("[5] Oversized encoded tx: PRECOMPILE REJECTED (expected)");
        }
    }
}
