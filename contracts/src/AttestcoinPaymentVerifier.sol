// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPaymentVerifier} from "./interfaces/IPaymentVerifier.sol";

/**
 * @title INativeQueryVerifier
 * @notice Creditcoin BlockProver precompile (Attestcoin / USC) at 0x…0FD2
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
}

/**
 * @title AttestcoinPaymentVerifier
 * @notice Verifies Sepolia payments on Creditcoin via Attestcoin Protocol (USC BlockProver).
 *
 * Proof blob (abi.encode):
 *   uint64 chainKey,
 *   uint64 height,
 *   bytes32 sourceTxHash,
 *   bytes encodedTransaction,
 *   bytes32 merkleRoot,
 *   bytes32[] siblingHashes,
 *   bool[] siblingIsLeft,
 *   bytes32 lowerEndpointDigest,
 *   bytes32[] continuityRoots
 *
 * Flow: app waits for attestation → ProofBuilder.getProof → encode → CreditLine.openCredit/repayCredit
 */
contract AttestcoinPaymentVerifier is IPaymentVerifier {
    INativeQueryVerifier public immutable blockProver;
    address public immutable expectedPaymentContract;
    uint64 public immutable expectedChainKey;

    bytes32 public constant DEPOSIT_PAID_TOPIC =
        keccak256("DepositPaid(address,uint256,bytes32)");
    bytes32 public constant REPAYMENT_PAID_TOPIC =
        keccak256("RepaymentPaid(address,uint256,bytes32)");
    bytes32 public constant BALANCE_ATTESTED_TOPIC =
        keccak256("BalanceAttested(address,uint256,bytes32)");

    error BadProof();
    error ProofFailed();
    error BadChain();
    error BadTxHash();
    error PaymentNotFound();
    error BadKind();

    constructor(address blockProver_, address expectedPaymentContract_, uint64 chainKey_) {
        require(blockProver_ != address(0), "prover");
        require(expectedPaymentContract_ != address(0), "payment");
        blockProver = INativeQueryVerifier(blockProver_);
        expectedPaymentContract = expectedPaymentContract_;
        expectedChainKey = chainKey_;
    }

    function verifyPayment(PaymentClaim calldata claim, bytes calldata proof) external returns (bool ok) {
        if (proof.length < 160) revert BadProof();

        (
            uint64 chainKey,
            uint64 height,
            bytes32 sourceTxHash,
            bytes memory encodedTransaction,
            bytes32 merkleRoot,
            bytes32[] memory siblingHashes,
            bool[] memory siblingIsLeft,
            bytes32 lowerEndpointDigest,
            bytes32[] memory continuityRoots
        ) = abi.decode(
            proof,
            (uint64, uint64, bytes32, bytes, bytes32, bytes32[], bool[], bytes32, bytes32[])
        );

        if (chainKey != expectedChainKey) revert BadChain();
        if (sourceTxHash != claim.txHash) revert BadTxHash();
        if (siblingHashes.length != siblingIsLeft.length) revert BadProof();
        if (encodedTransaction.length == 0) revert BadProof();

        // Payment contract must appear in the proven transaction payload.
        if (!_containsAddress(encodedTransaction, expectedPaymentContract)) revert PaymentNotFound();

        // Event topic by attested data type:
        //   1 = deposit payment, 2 = repayment, 3 = on-chain ETH balance
        bytes32 topic;
        if (claim.kind == 1) topic = DEPOSIT_PAID_TOPIC;
        else if (claim.kind == 2) topic = REPAYMENT_PAID_TOPIC;
        else if (claim.kind == 3) topic = BALANCE_ATTESTED_TOPIC;
        else revert BadKind();
        if (!_containsBytes32(encodedTransaction, topic)) revert PaymentNotFound();
        if (!_containsAddress(encodedTransaction, claim.payer)) revert PaymentNotFound();

        INativeQueryVerifier.MerkleProofEntry[] memory siblings =
            new INativeQueryVerifier.MerkleProofEntry[](siblingHashes.length);
        for (uint256 i = 0; i < siblingHashes.length; i++) {
            siblings[i] = INativeQueryVerifier.MerkleProofEntry({
                hash: siblingHashes[i],
                isLeft: siblingIsLeft[i]
            });
        }

        INativeQueryVerifier.MerkleProof memory merkleProof = INativeQueryVerifier.MerkleProof({
            root: merkleRoot,
            siblings: siblings
        });
        INativeQueryVerifier.ContinuityProof memory continuityProof = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: lowerEndpointDigest,
            roots: continuityRoots
        });

        bool verified = blockProver.verifyAndEmit(
            chainKey,
            height,
            encodedTransaction,
            merkleProof,
            continuityProof
        );
        if (!verified) revert ProofFailed();

        return true;
    }

    function _containsAddress(bytes memory haystack, address needle) internal pure returns (bool) {
        bytes20 n = bytes20(needle);
        if (haystack.length < 20) return false;
        for (uint256 i = 0; i <= haystack.length - 20; i++) {
            bool match_ = true;
            for (uint256 j = 0; j < 20; j++) {
                if (haystack[i + j] != n[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }

    function _containsBytes32(bytes memory haystack, bytes32 needle) internal pure returns (bool) {
        if (haystack.length < 32) return false;
        for (uint256 i = 0; i <= haystack.length - 32; i++) {
            bool match_ = true;
            for (uint256 j = 0; j < 32; j++) {
                if (haystack[i + j] != needle[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }
}
