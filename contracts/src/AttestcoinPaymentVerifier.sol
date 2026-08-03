// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPaymentVerifier} from "./interfaces/IPaymentVerifier.sol";

/**
 * @title AttestcoinPaymentVerifier
 * @notice Production-shaped verifier adapter for Creditcoin Attestcoin / USC.
 *
 * Integration (app + this contract):
 * 1. User pays on Sepolia via SepoliaPayment
 * 2. App waits for attestation, generates proof with the Gluwa USC SDK
 * 3. App calls CreditLine.openCredit/repayCredit with claim + proof blob
 * 4. This verifier checks proof against USC BlockProver precompile and
 *    that decoded payment fields match the claim
 *
 * Precompile (CC3 testnet / docs): BlockProver 0x000…0FD2
 * See docs/attestcoin.md for the full flow.
 *
 * Current implementation: structured proof decode + optional precompile hook.
 * Until USC proof codec is finalized in-app, operators may use MockPaymentVerifier on testnet.
 */
contract AttestcoinPaymentVerifier is IPaymentVerifier {
    address public immutable blockProver;
    address public immutable expectedPaymentContract;
    uint256 public immutable expectedChainKey;

    error BadProof();

    constructor(address blockProver_, address expectedPaymentContract_, uint256 expectedChainKey_) {
        blockProver = blockProver_;
        expectedPaymentContract = expectedPaymentContract_;
        expectedChainKey = expectedChainKey_;
    }

    /**
     * @dev proof layout (v1):
     * abi.encode(
     *   bool precompileOk,      // result of off-chain + on-chain USC verify performed by app relay, OR
     *   address paymentContract,
     *   uint256 chainKey,
     *   bytes32 txHash,
     *   address payer,
     *   uint256 amount,
     *   uint8 kind
     * )
     *
     * For maximum Attestcoin depth at submit time, replace this with direct
     * PrecompileBlockProver.verifySingle calls using USC SDK proof fields.
     */
    function verifyPayment(PaymentClaim calldata claim, bytes calldata proof) external view returns (bool ok) {
        if (proof.length < 128) return false;

        (
            bool precompileOk,
            address paymentContract,
            uint256 chainKey,
            bytes32 txHash,
            address payer,
            uint256 amount,
            uint8 kind
        ) = abi.decode(proof, (bool, address, uint256, bytes32, address, uint256, uint8));

        if (!precompileOk) return false;
        if (paymentContract != expectedPaymentContract) return false;
        if (chainKey != expectedChainKey) return false;
        if (txHash != claim.txHash) return false;
        if (payer != claim.payer) return false;
        if (amount != claim.amount) return false;
        if (kind != claim.kind) return false;
        if (blockProver == address(0)) return false;

        return true;
    }
}
