// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPaymentVerifier
 * @notice Adapter over Attestcoin / USC verification.
 *         kind: 1 = deposit, 2 = repayment, 3 = Sepolia ETH balance attestation
 */
interface IPaymentVerifier {
    struct PaymentClaim {
        bytes32 txHash;
        address payer;
        uint256 amount;
        uint8 kind; // 1 = deposit, 2 = repayment, 3 = balance
    }

    /// @dev Must revert or return false if Attestcoin proof is invalid.
    function verifyPayment(PaymentClaim calldata claim, bytes calldata proof)
        external
        returns (bool ok);
}
