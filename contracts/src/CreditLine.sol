// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPaymentVerifier} from "./interfaces/IPaymentVerifier.sol";

/**
 * @title CreditLine
 * @notice Spark credit positions on Creditcoin.
 *         Open and repay ONLY after Attestcoin-backed payment verification.
 */
contract CreditLine {
    enum Status {
        None,
        Active,
        Closed
    }

    struct Position {
        uint256 deposit;
        uint256 debt;
        uint256 credit;
        Status status;
        bytes32 openTxHash;
        bytes32 closeTxHash;
    }

    IPaymentVerifier public immutable verifier;
    uint256 public immutable collateralFactorBps; // e.g. 8000 = 80% credit vs deposit

    mapping(address => Position) public positions;
    mapping(bytes32 => bool) public usedTx;

    event CreditOpened(address indexed user, uint256 deposit, uint256 credit, bytes32 indexed txHash);
    event CreditRepaid(address indexed user, uint256 amount, bytes32 indexed txHash);
    event CreditClosed(address indexed user, bytes32 indexed txHash);

    error ProofFailed();
    error TxAlreadyUsed();
    error BadPayer();
    error BadAmount();
    error BadKind();
    error NotActive();
    error AlreadyOpen();

    constructor(address verifier_, uint256 collateralFactorBps_) {
        require(verifier_ != address(0), "verifier");
        require(collateralFactorBps_ > 0 && collateralFactorBps_ <= 10_000, "factor");
        verifier = IPaymentVerifier(verifier_);
        collateralFactorBps = collateralFactorBps_;
    }

    function openCredit(IPaymentVerifier.PaymentClaim calldata claim, bytes calldata proof) external {
        if (claim.kind != 1) revert BadKind();
        if (claim.payer != msg.sender) revert BadPayer();
        if (claim.amount == 0) revert BadAmount();
        if (usedTx[claim.txHash]) revert TxAlreadyUsed();
        if (positions[msg.sender].status == Status.Active) revert AlreadyOpen();

        bool ok = verifier.verifyPayment(claim, proof);
        if (!ok) revert ProofFailed();

        usedTx[claim.txHash] = true;
        uint256 credit = (claim.amount * collateralFactorBps) / 10_000;

        positions[msg.sender] = Position({
            deposit: claim.amount,
            debt: credit,
            credit: credit,
            status: Status.Active,
            openTxHash: claim.txHash,
            closeTxHash: bytes32(0)
        });

        emit CreditOpened(msg.sender, claim.amount, credit, claim.txHash);
    }

    function repayCredit(IPaymentVerifier.PaymentClaim calldata claim, bytes calldata proof) external {
        if (claim.kind != 2) revert BadKind();
        if (claim.payer != msg.sender) revert BadPayer();
        if (claim.amount == 0) revert BadAmount();
        if (usedTx[claim.txHash]) revert TxAlreadyUsed();

        Position storage pos = positions[msg.sender];
        if (pos.status != Status.Active) revert NotActive();

        bool ok = verifier.verifyPayment(claim, proof);
        if (!ok) revert ProofFailed();

        usedTx[claim.txHash] = true;

        uint256 pay = claim.amount > pos.debt ? pos.debt : claim.amount;
        pos.debt -= pay;

        emit CreditRepaid(msg.sender, pay, claim.txHash);

        if (pos.debt == 0) {
            pos.status = Status.Closed;
            pos.closeTxHash = claim.txHash;
            emit CreditClosed(msg.sender, claim.txHash);
        }
    }

    function getPosition(address user) external view returns (Position memory) {
        return positions[user];
    }
}
