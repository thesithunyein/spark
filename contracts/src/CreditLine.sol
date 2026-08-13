// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPaymentVerifier} from "./interfaces/IPaymentVerifier.sol";
import {SparkCredit} from "./SparkCredit.sol";

/**
 * @title CreditLine
 * @notice Spark credit positions on Creditcoin.
 *         Open and repay ONLY after Attestcoin-backed payment verification.
 *         Withdraw mints testnet sCREDIT to the user's wallet (no liquidity pool needed).
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
    SparkCredit public immutable creditToken;

    mapping(address => Position) public positions;
    mapping(bytes32 => bool) public usedTx;

    event CreditOpened(address indexed user, uint256 deposit, uint256 credit, bytes32 indexed txHash);
    event CreditWithdrawn(address indexed user, uint256 amount, uint256 debt);
    event CreditRepaid(address indexed user, uint256 amount, bytes32 indexed txHash);
    event CreditClosed(address indexed user, bytes32 indexed txHash);

    error ProofFailed();
    error TxAlreadyUsed();
    error BadPayer();
    error BadAmount();
    error BadKind();
    error NotActive();
    error AlreadyOpen();
    error HasDebt();
    error ExceedsAvailable();

    constructor(address verifier_, uint256 collateralFactorBps_) {
        require(verifier_ != address(0), "verifier");
        require(collateralFactorBps_ > 0 && collateralFactorBps_ <= 10_000, "factor");
        verifier = IPaymentVerifier(verifier_);
        collateralFactorBps = collateralFactorBps_;
        creditToken = new SparkCredit(address(this));
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

        // debt starts at 0 — user withdraws credit to their wallet when ready
        positions[msg.sender] = Position({
            deposit: claim.amount,
            debt: 0,
            credit: credit,
            status: Status.Active,
            openTxHash: claim.txHash,
            closeTxHash: bytes32(0)
        });

        emit CreditOpened(msg.sender, claim.amount, credit, claim.txHash);
    }

    /**
     * @notice Withdraw available credit to the caller's wallet as sCREDIT (testnet units).
     *         Increases debt. Free of pool funding — tokens are minted.
     */
    function withdraw(uint256 amount) external {
        Position storage pos = positions[msg.sender];
        if (pos.status != Status.Active) revert NotActive();
        if (amount == 0) revert BadAmount();

        uint256 available = pos.credit - pos.debt;
        if (amount > available) revert ExceedsAvailable();

        pos.debt += amount;
        creditToken.mint(msg.sender, amount);
        emit CreditWithdrawn(msg.sender, amount, pos.debt);
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

    /** Close an unused line (opened but never withdrawn). No Attestcoin repay needed. */
    function closeUnused() external {
        Position storage pos = positions[msg.sender];
        if (pos.status != Status.Active) revert NotActive();
        if (pos.debt != 0) revert HasDebt();
        pos.status = Status.Closed;
        pos.closeTxHash = pos.openTxHash;
        emit CreditClosed(msg.sender, pos.openTxHash);
    }

    function availableCredit(address user) external view returns (uint256) {
        Position memory pos = positions[user];
        if (pos.status != Status.Active) return 0;
        return pos.credit - pos.debt;
    }

    function getPosition(address user) external view returns (Position memory) {
        return positions[user];
    }
}
