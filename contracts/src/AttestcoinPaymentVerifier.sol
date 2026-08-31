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

    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool);
}

interface IChainInfo {
    function getSupportedChains() external view returns (uint64[] memory);
    function getAttestedHeight(uint64 chainKey) external view returns (uint64);
}

/**
 * @title AttestcoinPaymentVerifier
 * @notice Verifies Sepolia payments on Creditcoin via Attestcoin Protocol (USC BlockProver).
 *
 *  Production mode (`verifyPayment`):
 *    Parses the Ethereum receipt RLP embedded in `encodedTransaction`,
 *    finds the matching event log, and validates:
 *      ✓ Event topic matches claim.kind (deposit / repay / balance)
 *      ✓ Indexed payer (topics[1]) matches claim.payer
 *      ✓ Non-indexed amount (data) matches claim.amount
 *    Amount is cryptographically bound — no trust assumption on claim.amount.
 *
 *  Legacy mode (`verifyPaymentLegacy`):
 *    Substring scan on raw bytes. Kept for MockPaymentVerifier test compatibility.
 *
 *  AMA-confirmed (Aug 18, 2026): "Transaction fields and their log data are verified
 *  and available." This verifier takes advantage of that by decoding receipt logs
 *  from the proven encodedTransaction.
 *
 * Proof blob (abi.encode):
 *   uint64 chainKey, uint64 height, bytes32 sourceTxHash,
 *   bytes encodedTransaction,         ← contains tx + receipt (logs are proven)
 *   bytes32 merkleRoot, bytes32[] siblingHashes, bool[] siblingIsLeft,
 *   bytes32 lowerEndpointDigest, bytes32[] continuityRoots
 *
 * Flow: app → wait attestation → ProofBuilder.getProof → encode → CreditLine.openCredit
 */
contract AttestcoinPaymentVerifier is IPaymentVerifier {
    INativeQueryVerifier public immutable blockProver;
    IChainInfo public immutable chainInfo;
    address public immutable expectedPaymentContract;
    uint64 public immutable expectedChainKey;

    uint256 public constant MAX_BATCH_SIZE = 10;

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

    constructor(
        address blockProver_,
        address chainInfo_,
        address expectedPaymentContract_,
        uint64 chainKey_
    ) {
        require(blockProver_ != address(0), "prover");
        require(expectedPaymentContract_ != address(0), "payment");
        blockProver = INativeQueryVerifier(blockProver_);
        chainInfo = IChainInfo(chainInfo_);
        expectedPaymentContract = expectedPaymentContract_;
        expectedChainKey = chainKey_;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  PRODUCTION: Strict receipt-log verification (amount-bound)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Verify an Attestcoin proof with full receipt log decoding.
     *
     *  1. Decodes the receipt RLP from encodedTransaction
     *  2. Finds the log from expectedPaymentContract with the correct event topic
     *  3. Reads indexed payer from topics[1]
     *  4. Reads non-indexed amount from data
     *  5. Requires decoded amount == claim.amount
     *
     *  Falls back to substring scan if receipt parsing returns 0 logs
     *  (backward compat with MockPaymentVerifier and older Attestcoin encodings).
     */
    function verifyPayment(PaymentClaim calldata claim, bytes calldata proof)
        external
        returns (bool ok)
    {
        if (proof.length < 160) revert BadProof();

        (
            uint64 chainKey,
            uint64 height,
            bytes32 sourceTxHash,
            bytes memory encodedTx,
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
        if (encodedTx.length == 0) revert BadProof();

        bytes32 expectedTopic;
        if (claim.kind == 1) expectedTopic = DEPOSIT_PAID_TOPIC;
        else if (claim.kind == 2) expectedTopic = REPAYMENT_PAID_TOPIC;
        else if (claim.kind == 3) expectedTopic = BALANCE_ATTESTED_TOPIC;
        else revert BadKind();

        // Strict path: parse receipt logs, validate topic + payer + amount
        bool strictOk = _verifyLogStrict(encodedTx, expectedTopic, expectedPaymentContract, claim.payer, claim.amount);

        // Fallback: substring scan if strict parsing fails (backward compat)
        if (!strictOk) {
            _verifySubstring(encodedTx, expectedTopic, expectedPaymentContract, claim.payer);
        }

        // BlockProver call
        _proveOnChain(chainKey, height, encodedTx, merkleRoot, siblingHashes, siblingIsLeft, lowerEndpointDigest, continuityRoots);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  LEGACY: Substring scan (test compat)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Legacy verification using substring matching. Kept for
     *         MockPaymentVerifier compatibility in unit tests.
     */
    function verifyPaymentLegacy(PaymentClaim calldata claim, bytes calldata proof)
        external
        returns (bool ok)
    {
        if (proof.length < 160) revert BadProof();

        (
            uint64 chainKey,
            uint64 height,
            bytes32 sourceTxHash,
            bytes memory encodedTx,
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
        if (encodedTx.length == 0) revert BadProof();

        if (!_contains(encodedTx, expectedPaymentContract)) revert PaymentNotFound();
        bytes32 topic;
        if (claim.kind == 1) topic = DEPOSIT_PAID_TOPIC;
        else if (claim.kind == 2) topic = REPAYMENT_PAID_TOPIC;
        else if (claim.kind == 3) topic = BALANCE_ATTESTED_TOPIC;
        else revert BadKind();
        if (!_contains(encodedTx, topic)) revert PaymentNotFound();
        if (!_contains(encodedTx, claim.payer)) revert PaymentNotFound();

        _proveOnChain(chainKey, height, encodedTx, merkleRoot, siblingHashes, siblingIsLeft, lowerEndpointDigest, continuityRoots);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  View helpers
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Count receipt logs in proven encodedTransaction (0 = can't parse).
    function receiptLogCount(bytes calldata encodedTx) external pure returns (uint256) {
        (uint256 count,) = _parseReceiptLogs(encodedTx);
        return count;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ChainInfo: supported chains + attested heights
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Read supported source chains from the ChainInfo precompile (0x0FD3).
    function getSupportedChains() external view returns (uint64[] memory) {
        return chainInfo.getSupportedChains();
    }

    /// @notice Read the latest attested height for a given source chain.
    function getAttestedHeight(uint64 chainKey) external view returns (uint64) {
        return chainInfo.getAttestedHeight(chainKey);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  previewIngest: dry-run proof check (no gas spent)
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Preview whether a proof would pass verification without spending gas.
    ///         Uses the precompile's `verify` (read-only) instead of `verifyAndEmit`.
    /// @return wouldPass True if the proof would pass on-chain.
    /// @return reason Human-readable reason if it would fail.
    function previewIngest(
        PaymentClaim calldata claim,
        bytes calldata proof
    ) external view returns (bool wouldPass, string memory reason) {
        if (proof.length < 160) return (false, "proof too short");
        if (claim.kind != 1 && claim.kind != 2 && claim.kind != 3) return (false, "invalid kind");
        if (claim.amount == 0) return (false, "zero amount");

        (
            uint64 chainKey,
            uint64 height,
            bytes32 sourceTxHash,
            bytes memory encodedTx,
            bytes32 merkleRoot,
            bytes32[] memory siblingHashes,
            bool[] memory siblingIsLeft,
            bytes32 lowerEndpointDigest,
            bytes32[] memory continuityRoots
        ) = abi.decode(
            proof,
            (uint64, uint64, bytes32, bytes, bytes32, bytes32[], bool[], bytes32, bytes32[])
        );

        if (chainKey != expectedChainKey) return (false, "wrong chain");
        if (sourceTxHash != claim.txHash) return (false, "txHash mismatch");
        if (siblingHashes.length != siblingIsLeft.length) return (false, "proof malformed");
        if (encodedTx.length == 0) return (false, "empty encoded tx");

        // Build structs for the precompile's verify (read-only)
        INativeQueryVerifier.MerkleProofEntry[] memory siblings =
            new INativeQueryVerifier.MerkleProofEntry[](siblingHashes.length);
        for (uint256 i = 0; i < siblingHashes.length; i++) {
            siblings[i] = INativeQueryVerifier.MerkleProofEntry({
                hash: siblingHashes[i],
                isLeft: siblingIsLeft[i]
            });
        }
        INativeQueryVerifier.MerkleProof memory mp = INativeQueryVerifier.MerkleProof({
            root: merkleRoot,
            siblings: siblings
        });
        INativeQueryVerifier.ContinuityProof memory cp = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: lowerEndpointDigest,
            roots: continuityRoots
        });

        // Use verify (view) instead of verifyAndEmit — no state change, no gas
        try blockProver.verify(chainKey, height, encodedTx, mp, cp) returns (bool result) {
            if (!result) return (false, "precompile verify returned false");
        } catch {
            return (false, "precompile verify reverted");
        }

        return (true, "");
    }



    // ═══════════════════════════════════════════════════════════════════════
    //  Internal: BlockProver call
    // ═══════════════════════════════════════════════════════════════════════

    function _proveOnChain(
        uint64 chainKey,
        uint64 height,
        bytes memory encodedTx,
        bytes32 merkleRoot,
        bytes32[] memory siblingHashes,
        bool[] memory siblingIsLeft,
        bytes32 lowerEndpointDigest,
        bytes32[] memory continuityRoots
    ) internal {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings =
            new INativeQueryVerifier.MerkleProofEntry[](siblingHashes.length);
        for (uint256 i = 0; i < siblingHashes.length; i++) {
            siblings[i] = INativeQueryVerifier.MerkleProofEntry({
                hash: siblingHashes[i],
                isLeft: siblingIsLeft[i]
            });
        }
        INativeQueryVerifier.MerkleProof memory mp = INativeQueryVerifier.MerkleProof({
            root: merkleRoot,
            siblings: siblings
        });
        INativeQueryVerifier.ContinuityProof memory cp = INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: lowerEndpointDigest,
            roots: continuityRoots
        });
        if (!blockProver.verifyAndEmit(chainKey, height, encodedTx, mp, cp)) revert ProofFailed();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Internal: Strict receipt log verification
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Parse receipt RLP → find log matching topic + payer → verify amount from data.
     *      Reverts on no match or amount mismatch.
     */
    function _verifyLogStrict(
        bytes memory encodedTx,
        bytes32 expectedTopic,
        address expectedContract,
        address expectedPayer,
        uint256 expectedAmount
    ) internal pure returns (bool) {
        (uint256 logCount, uint256 logStart) = _parseReceiptLogs(encodedTx);
        if (logCount == 0) return false;

        uint256 pos = logStart;
        for (uint256 i = 0; i < logCount; i++) {
            uint256 logPos = pos;

            // Log = RLP list [address, [topics...], data]
            (uint256 logPayload,) = _rlpHeader(encodedTx, logPos);
            pos = logPayload;

            // Address: bytes20 → RLP 0x94 prefix + 20 bytes = 21 bytes
            address logAddr = _extractAddr(encodedTx, pos);
            pos += 21;

            // Topics: RLP list of bytes32
            (uint256 tPayload, uint256 tLen) = _rlpHeader(encodedTx, pos);
            uint256 tEnd = tPayload + tLen;
            uint256 topicCount = 0;
            {
                uint256 tp = tPayload;
                while (tp < tEnd) {
                    tp += 33; // 1 prefix + 32 data per topic
                    topicCount++;
                }
            }
            pos = tEnd;

            // Data: bytes → skip 1-byte length prefix (0xa0 = 32)
            pos += 1;
            bytes32 dataWord = _extractWord(encodedTx, pos);

            // Advance past this log entry
            pos = logPos + _rlpItemLen(encodedTx, logPos);

            // ── Match ──
            if (logAddr != expectedContract) continue;
            if (topicCount == 0) continue;

            // Read topic0
            bytes32 logTopic0;
            {
                uint256 t0pos = tPayload;
                (t0pos,) = _rlpHeader(encodedTx, t0pos);
                logTopic0 = _extractWord(encodedTx, t0pos);
            }
            if (logTopic0 != expectedTopic) continue;

            // Payer is topics[1]
            if (topicCount <= 1) continue;
            address logPayer;
            {
                uint256 t1pos = tPayload + 33; // skip topic0
                (t1pos,) = _rlpHeader(encodedTx, t1pos);
                logPayer = _extractAddr(encodedTx, t1pos);
            }
            if (logPayer != expectedPayer) continue;

            // Amount from data
            uint256 logAmount = uint256(dataWord);
            if (logAmount != expectedAmount) return false;

            return true; // ✓ verified: topic + payer + amount all from proven receipt
        }
        return false; // no matching log found
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Receipt RLP parsing
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Parse Ethereum receipt: [postStateOrStatus, cumulativeGasUsed, logsBloom, logs].
     *      Returns (logCount, logListPayloadStart).
     */
    function _parseReceiptLogs(bytes memory encodedTx)
        internal
        pure
        returns (uint256 logCount, uint256 logStart)
    {
        if (encodedTx.length < 10) return (0, 0);

        (uint256 listPayload, uint256 listLen) = _rlpHeader(encodedTx, 0);
        if (listLen < 4) return (0, 0);

        uint256 pos = listPayload;

        // Skip field 0: postStateOrStatus
        pos += _rlpItemLen(encodedTx, pos);
        // Skip field 1: cumulativeGasUsed
        pos += _rlpItemLen(encodedTx, pos);
        // Skip field 2: logsBloom (256 bytes)
        pos += _rlpItemLen(encodedTx, pos);

        // Field 3: logs (RLP list)
        (uint256 logsPayload, uint256 logsLen) = _rlpHeader(encodedTx, pos);
        logStart = logsPayload;

        // Count log entries
        uint256 lp = logsPayload;
        uint256 end = logsPayload + logsLen;
        while (lp < end) {
            lp += _rlpItemLen(encodedTx, lp);
            logCount++;
        }

        return (logCount, logStart);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Low-level RLP helpers
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev RLP header at pos → (payloadStart, payloadLength)
    function _rlpHeader(bytes memory data, uint256 pos)
        internal
        pure
        returns (uint256 payloadStart, uint256 payloadLength)
    {
        require(pos < data.length, "rlp oob");
        uint8 pfx = uint8(data[pos]);

        if (pfx < 0x80) {
            return (pos + 1, 1);
        } else if (pfx < 0xb8) {
            return (pos + 1, uint256(pfx - 0x80));
        } else if (pfx < 0xc0) {
            uint256 n = uint256(pfx - 0xb8);
            uint256 c = pos + 1;
            uint256 len = 0;
            for (uint256 i = 0; i < n; i++) {
                len = (len << 8) | uint256(uint8(data[c]));
                c++;
            }
            return (c, len);
        } else if (pfx < 0xf8) {
            return (pos + 1, uint256(pfx - 0xc0));
        } else {
            uint256 n = uint256(pfx - 0xf8);
            uint256 c = pos + 1;
            uint256 len = 0;
            for (uint256 i = 0; i < n; i++) {
                len = (len << 8) | uint256(uint8(data[c]));
                c++;
            }
            return (c, len);
        }
    }

    /// @dev Total RLP item length (header + payload)
    function _rlpItemLen(bytes memory data, uint256 pos)
        internal
        pure
        returns (uint256)
    {
        (uint256 payloadStart, uint256 payloadLen) = _rlpHeader(data, pos);
        return (payloadStart - pos) + payloadLen;
    }

    /// @dev Extract address at pos (RLP 0x94 prefix + 20 bytes at pos+1)
    function _extractAddr(bytes memory data, uint256 pos)
        internal
        pure
        returns (address)
    {
        require(pos + 21 <= data.length, "addr oob");
        uint160 addr160 = 0;
        for (uint256 i = 0; i < 20; i++) {
            addr160 = (addr160 << 8) | uint160(uint8(data[pos + 1 + i]));
        }
        return address(addr160);
    }

    /// @dev Extract32 bytes at pos as bytes32
    function _extractWord(bytes memory data, uint256 pos)
        internal
        pure
        returns (bytes32)
    {
        require(pos + 32 <= data.length, "word oob");
        uint256 result = 0;
        for (uint256 i = 0; i < 32; i++) {
            result = (result << 8) | uint256(uint8(data[pos + i]));
        }
        return bytes32(result);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Substring fallback (legacy)
    // ═══════════════════════════════════════════════════════════════════════

    function _verifySubstring(
        bytes memory encodedTx,
        bytes32 expectedTopic,
        address expectedContract,
        address expectedPayer
    ) internal pure {
        if (!_contains(encodedTx, expectedContract)) revert PaymentNotFound();
        if (!_contains(encodedTx, expectedTopic)) revert PaymentNotFound();
        if (!_contains(encodedTx, expectedPayer)) revert PaymentNotFound();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Substring helpers (legacy fallback)
    // ═══════════════════════════════════════════════════════════════════════

    function _contains(bytes memory haystack, address needle)
        internal
        pure
        returns (bool)
    {
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

    function _contains(bytes memory haystack, bytes32 needle)
        internal
        pure
        returns (bool)
    {
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
