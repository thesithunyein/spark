// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestcoinPaymentVerifier} from "../src/AttestcoinPaymentVerifier.sol";
import {IPaymentVerifier} from "../src/interfaces/IPaymentVerifier.sol";

/// @notice Minimal BlockProver stand-in that accepts every proof. The point of
///         these tests is the RLP decode + amount binding, not the precompile.
contract AcceptingBlockProver {
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
        uint64,
        uint64,
        bytes calldata,
        MerkleProof calldata,
        ContinuityProof calldata
    ) external pure returns (bool) {
        return true;
    }

    function verify(
        uint64,
        uint64,
        bytes calldata,
        MerkleProof calldata,
        ContinuityProof calldata
    ) external view returns (bool) {
        return true;
    }

    function calculateTxIndex(bytes32, MerkleProof calldata, ContinuityProof calldata)
        external
        view
        returns (uint256)
    {
        return 0;
    }
}

contract VerifierStrictTest is Test {
    AttestcoinPaymentVerifier verifier;
    address payer = address(0xBEEF);
    bytes32 txHash = keccak256("real-tx");

    // DepositPaid(address indexed payer, uint256 amount, bytes32 indexed ref)
    bytes32 constant DEPOSIT_TOPIC = keccak256("DepositPaid(address,uint256,bytes32)");

    function setUp() public {
        AcceptingBlockProver prover = new AcceptingBlockProver();
        verifier = new AttestcoinPaymentVerifier(
            address(prover),
            address(0), // chainInfo unused in these tests
            address(0xC0FFEE), // expectedPaymentContract
            1 // chainKey Sepolia
        );
    }

    // ── RLP helpers ──────────────────────────────────────────────────────

    function _toBytes(uint256 v) internal pure returns (bytes memory) {
        if (v < 0x100) return abi.encodePacked(uint8(v));
        if (v < 0x10000) return abi.encodePacked(uint8(v >> 8), uint8(v & 0xff));
        if (v < 0x1000000) {
            return abi.encodePacked(uint8(v >> 16), uint8((v >> 8) & 0xff), uint8(v & 0xff));
        }
        return abi.encodePacked(
            uint8(v >> 24), uint8((v >> 16) & 0xff), uint8((v >> 8) & 0xff), uint8(v & 0xff)
        );
    }

    function _rlpItem(bytes memory payload) internal pure returns (bytes memory) {
        if (payload.length == 1 && uint8(payload[0]) < 0x80) return payload;
        if (payload.length <= 55) {
            return bytes.concat(bytes1(uint8(0x80) + uint8(payload.length)), payload);
        }
        bytes memory lenBytes = _toBytes(payload.length);
        return bytes.concat(bytes1(uint8(0xb7) + uint8(lenBytes.length)), lenBytes, payload);
    }

    function _rlpList(bytes memory payload) internal pure returns (bytes memory) {
        if (payload.length <= 55) {
            return bytes.concat(bytes1(uint8(0xc0) + uint8(payload.length)), payload);
        }
        bytes memory lenBytes = _toBytes(payload.length);
        return bytes.concat(bytes1(uint8(0xf7) + uint8(lenBytes.length)), lenBytes, payload);
    }

    /// @dev Build a Sepolia receipt with a DepositPaid log from `payer` for `amount`.
    function _receiptWithDeposit(address sender, uint256 amount, bytes32 ref)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 topic0 = DEPOSIT_TOPIC;
        bytes32 topic1 = bytes32(uint256(uint160(sender))); // indexed payer, low 20 bytes
        bytes32 topic2 = ref;

        bytes memory addr = _rlpItem(abi.encodePacked(bytes20(address(0xC0FFEE))));
        bytes memory topics = _rlpList(
            bytes.concat(
                _rlpItem(abi.encodePacked(topic0)),
                _rlpItem(abi.encodePacked(topic1)),
                _rlpItem(abi.encodePacked(topic2))
            )
        );
        bytes memory data = _rlpItem(abi.encodePacked(amount)); // non-indexed amount
        bytes memory log = _rlpList(bytes.concat(addr, topics, data));
        bytes memory logs = _rlpList(log);

        bytes memory bloom = new bytes(256);
        bytes memory receipt = _rlpList(
            bytes.concat(
                bytes1(0x01), // postStateOrStatus = success (0x01)
                bytes1(0x80), // cumulativeGasUsed = 0
                _rlpItem(bloom), // logsBloom 256 bytes
                logs
            )
        );
        return receipt;
    }

    function _encodeProof(bytes memory receipt) internal view returns (bytes memory) {
        return abi.encode(
            uint64(1), // chainKey
            uint64(1000), // height
            txHash, // sourceTxHash
            receipt, // encodedTx
            bytes32(uint256(1)), // merkleRoot
            new bytes32[](0), // siblingHashes
            new bool[](0), // siblingIsLeft
            bytes32(uint256(2)), // lowerEndpointDigest
            new bytes32[](0) // continuityRoots
        );
    }

    // ── Tests ────────────────────────────────────────────────────────────

    function testStrictPathParsesReceiptLogs() public view {
        bytes memory receipt = _receiptWithDeposit(payer, 1 ether, keccak256("r1"));
        uint256 count = verifier.receiptLogCount(receipt);
        assertEq(count, 1, "should parse exactly one log from a real-shaped receipt");
    }

    function testStrictPathAcceptsMatchingAmount() public {
        bytes memory receipt = _receiptWithDeposit(payer, 1 ether, keccak256("r1"));
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: txHash,
            payer: payer,
            amount: 1 ether,
            kind: 1
        });
        bool ok = verifier.verifyPayment(claim, _encodeProof(receipt));
        assertTrue(ok, "matching amount should verify through the strict path");
    }

    function testStrictPathRevertsOnAmountMismatch() public {
        // Pay 1 ETH, claim 10 ETH — the wash-lending attack.
        bytes memory receipt = _receiptWithDeposit(payer, 1 ether, keccak256("r2"));
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: txHash,
            payer: payer,
            amount: 10 ether,
            kind: 1
        });
        vm.expectRevert(AttestcoinPaymentVerifier.BadAmount.selector);
        verifier.verifyPayment(claim, _encodeProof(receipt));
    }

    function testStrictPathRejectsWrongPayer() public {
        bytes memory receipt = _receiptWithDeposit(payer, 1 ether, keccak256("r3"));
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: txHash,
            payer: address(0xDEAD),
            amount: 1 ether,
            kind: 1
        });
        vm.expectRevert(AttestcoinPaymentVerifier.PaymentNotFound.selector);
        verifier.verifyPayment(claim, _encodeProof(receipt));
    }

    function testStrictPathParsesLongFormBloom() public view {
        // 256-byte bloom forces long-form RLP (0xb9) — the previously broken branch.
        bytes memory receipt = _receiptWithDeposit(payer, 0.5 ether, keccak256("r4"));
        uint256 count = verifier.receiptLogCount(receipt);
        assertEq(count, 1, "long-form bloom must still parse to one log");
    }

    function testStrictPathMultipleLogsFindsCorrectOne() public {
        // Two logs: an unrelated Transfer + the DepositPaid. Parser must find the right one.
        bytes32 topic0 = DEPOSIT_TOPIC;
        bytes32 topic1 = bytes32(uint256(uint160(payer)));
        bytes32 topic2 = keccak256("r5");

        bytes memory unrelated = _rlpList(
            bytes.concat(
                _rlpItem(abi.encodePacked(bytes20(address(0xAAAA)))), // different contract
                _rlpList(bytes.concat(_rlpItem(abi.encodePacked(keccak256("Transfer(address,address,uint256)"))))),
                _rlpItem(abi.encodePacked(uint256(99)))
            )
        );
        bytes memory deposit = _rlpList(
            bytes.concat(
                _rlpItem(abi.encodePacked(bytes20(address(0xC0FFEE)))),
                _rlpList(
                    bytes.concat(
                        _rlpItem(abi.encodePacked(topic0)),
                        _rlpItem(abi.encodePacked(topic1)),
                        _rlpItem(abi.encodePacked(topic2))
                    )
                ),
                _rlpItem(abi.encodePacked(uint256(2 ether)))
            )
        );
        bytes memory logs = _rlpList(bytes.concat(unrelated, deposit));

        bytes memory bloom = new bytes(256);
        bytes memory receipt = _rlpList(
            bytes.concat(
                bytes1(0x01),
                bytes1(0x80),
                _rlpItem(bloom),
                logs
            )
        );

        assertEq(verifier.receiptLogCount(receipt), 2, "two logs parsed");

        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: txHash,
            payer: payer,
            amount: 2 ether,
            kind: 1
        });
        bool ok = verifier.verifyPayment(claim, _encodeProof(receipt));
        assertTrue(ok, "should skip unrelated log and verify the DepositPaid log");
    }
}