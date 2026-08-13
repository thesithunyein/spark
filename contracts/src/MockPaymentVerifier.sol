// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPaymentVerifier} from "./interfaces/IPaymentVerifier.sol";

/**
 * @title MockPaymentVerifier
 * @notice Local / testnet stand-in until USC proof bytes are wired from the Spark app.
 *         Accepts proofs of the form abi.encode(claim) signed conceptually as "trusted demo".
 *         Production deploy should replace with AttestcoinPaymentVerifier wrapping USC precompile.
 */
contract MockPaymentVerifier is IPaymentVerifier {
    address public operator;
    bool public requireOperatorAck;

    error Unauthorized();

    constructor(address operator_, bool requireOperatorAck_) {
        operator = operator_;
        requireOperatorAck = requireOperatorAck_;
    }

    function setOperator(address operator_) external {
        if (msg.sender != operator) revert Unauthorized();
        operator = operator_;
    }

    /// @dev proof = abi.encode(claim.txHash, claim.payer, claim.amount, claim.kind)
    ///      When requireOperatorAck, operator must call `ack` first (see mapping).
    mapping(bytes32 => bool) public acked;

    function ack(bytes32 txHash) external {
        if (msg.sender != operator) revert Unauthorized();
        acked[txHash] = true;
    }

    function verifyPayment(PaymentClaim calldata claim, bytes calldata proof) external returns (bool ok) {
        if (requireOperatorAck && !acked[claim.txHash]) return false;
        if (proof.length == 0) return false;

        (bytes32 txHash, address payer, uint256 amount, uint8 kind) =
            abi.decode(proof, (bytes32, address, uint256, uint8));

        ok = txHash == claim.txHash && payer == claim.payer && amount == claim.amount && kind == claim.kind;
    }
}
