// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPaymentVerifier
 * @notice Adapter over Attestcoin / USC verification.
 *         Production: wrap BlockProver precompile + tx decode.
 *         Tests: MockPaymentVerifier.
 */
interface IPaymentVerifier {
    struct PaymentClaim {
        bytes32 txHash;
        address payer;
        uint256 amount;
        uint8 kind; // 1 = deposit, 2 = repayment
    }

    /// @dev Must revert or return false if Attestcoin proof is invalid.
    function verifyPayment(PaymentClaim calldata claim, bytes calldata proof)
        external
        returns (bool ok);
}
