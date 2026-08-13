// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPaymentVerifier} from "./interfaces/IPaymentVerifier.sol";
import {SparkCredit} from "./SparkCredit.sol";

/**
 * @title CreditLine
 * @notice Spark credit on Creditcoin.
 *         Open requires TWO Attestcoin proofs:
 *           1) Sepolia deposit payment
 *           2) Sepolia ETH balance attestation (second data type — sizes LTV)
 *         Debt accrues interest. Redeem burns sCREDIT against debt (local unwind).
 *         Full close still requires attested Sepolia repayment when debt remains.
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
        uint256 attestedBalance;
        uint64 lastAccrual;
        Status status;
        bytes32 openTxHash;
        bytes32 balanceTxHash;
        bytes32 closeTxHash;
    }

    IPaymentVerifier public immutable verifier;
    /// @notice Base LTV in bps when attested Sepolia balance < deposit (e.g. 8000 = 80%).
    uint256 public immutable collateralFactorBps;
    /// @notice Simple APR in bps on outstanding debt (e.g. 1000 = 10%/year).
    uint256 public immutable interestPerYearBps;
    SparkCredit public immutable creditToken;

    mapping(address => Position) public positions;
    mapping(bytes32 => bool) public usedTx;

    event CreditOpened(
        address indexed user,
        uint256 deposit,
        uint256 attestedBalance,
        uint256 credit,
        uint256 factorBps,
        bytes32 indexed depositTxHash,
        bytes32 balanceTxHash
    );
    event CreditWithdrawn(address indexed user, uint256 amount, uint256 debt);
    event CreditRedeemed(address indexed user, uint256 amount, uint256 debt);
    event InterestAccrued(address indexed user, uint256 interest, uint256 debt);
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
    error ExceedsDebt();

    constructor(address verifier_, uint256 collateralFactorBps_, uint256 interestPerYearBps_) {
        require(verifier_ != address(0), "verifier");
        require(collateralFactorBps_ > 0 && collateralFactorBps_ <= 10_000, "factor");
        require(interestPerYearBps_ <= 5_000, "interest");
        verifier = IPaymentVerifier(verifier_);
        collateralFactorBps = collateralFactorBps_;
        interestPerYearBps = interestPerYearBps_;
        creditToken = new SparkCredit(address(this));
    }

    /**
     * @notice Open a line after proving (1) deposit payment and (2) Sepolia ETH balance.
     *         Attested balance raises LTV: >=2x deposit → 90%, >=1x → 85%, else base factor.
     */
    function openCredit(
        IPaymentVerifier.PaymentClaim calldata depositClaim,
        bytes calldata depositProof,
        IPaymentVerifier.PaymentClaim calldata balanceClaim,
        bytes calldata balanceProof
    ) external {
        if (depositClaim.kind != 1) revert BadKind();
        if (balanceClaim.kind != 3) revert BadKind();
        if (depositClaim.payer != msg.sender || balanceClaim.payer != msg.sender) revert BadPayer();
        if (depositClaim.amount == 0 || balanceClaim.amount == 0) revert BadAmount();
        if (usedTx[depositClaim.txHash] || usedTx[balanceClaim.txHash]) revert TxAlreadyUsed();
        if (depositClaim.txHash == balanceClaim.txHash) revert BadAmount();
        if (positions[msg.sender].status == Status.Active) revert AlreadyOpen();

        bool depOk = verifier.verifyPayment(depositClaim, depositProof);
        if (!depOk) revert ProofFailed();
        bool balOk = verifier.verifyPayment(balanceClaim, balanceProof);
        if (!balOk) revert ProofFailed();

        usedTx[depositClaim.txHash] = true;
        usedTx[balanceClaim.txHash] = true;

        uint256 factorBps = _factorFor(depositClaim.amount, balanceClaim.amount);
        uint256 credit = (depositClaim.amount * factorBps) / 10_000;

        positions[msg.sender] = Position({
            deposit: depositClaim.amount,
            debt: 0,
            credit: credit,
            attestedBalance: balanceClaim.amount,
            lastAccrual: uint64(block.timestamp),
            status: Status.Active,
            openTxHash: depositClaim.txHash,
            balanceTxHash: balanceClaim.txHash,
            closeTxHash: bytes32(0)
        });

        emit CreditOpened(
            msg.sender,
            depositClaim.amount,
            balanceClaim.amount,
            credit,
            factorBps,
            depositClaim.txHash,
            balanceClaim.txHash
        );
    }

    function withdraw(uint256 amount) external {
        Position storage pos = positions[msg.sender];
        if (pos.status != Status.Active) revert NotActive();
        if (amount == 0) revert BadAmount();
        _accrue(pos, msg.sender);

        uint256 available = pos.credit - pos.debt;
        if (amount > available) revert ExceedsAvailable();

        pos.debt += amount;
        creditToken.mint(msg.sender, amount);
        emit CreditWithdrawn(msg.sender, amount, pos.debt);
    }

    /**
     * @notice Burn sCREDIT to reduce debt (local redemption / unwind of mint).
     *         Interest still accrues on remaining debt — attested Sepolia repay closes the loop.
     */
    function redeem(uint256 amount) external {
        Position storage pos = positions[msg.sender];
        if (pos.status != Status.Active) revert NotActive();
        if (amount == 0) revert BadAmount();
        _accrue(pos, msg.sender);
        if (amount > pos.debt) revert ExceedsDebt();

        creditToken.burn(msg.sender, amount);
        pos.debt -= amount;
        emit CreditRedeemed(msg.sender, amount, pos.debt);
    }

    function repayCredit(IPaymentVerifier.PaymentClaim calldata claim, bytes calldata proof) external {
        if (claim.kind != 2) revert BadKind();
        if (claim.payer != msg.sender) revert BadPayer();
        if (claim.amount == 0) revert BadAmount();
        if (usedTx[claim.txHash]) revert TxAlreadyUsed();

        Position storage pos = positions[msg.sender];
        if (pos.status != Status.Active) revert NotActive();
        _accrue(pos, msg.sender);

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

    function closeUnused() external {
        Position storage pos = positions[msg.sender];
        if (pos.status != Status.Active) revert NotActive();
        _accrue(pos, msg.sender);
        if (pos.debt != 0) revert HasDebt();
        pos.status = Status.Closed;
        pos.closeTxHash = pos.openTxHash;
        emit CreditClosed(msg.sender, pos.openTxHash);
    }

    function accrue(address user) external {
        Position storage pos = positions[user];
        if (pos.status != Status.Active) revert NotActive();
        _accrue(pos, user);
    }

    function availableCredit(address user) external view returns (uint256) {
        Position memory pos = positions[user];
        if (pos.status != Status.Active) return 0;
        uint256 debt = _debtWithInterest(pos);
        if (debt >= pos.credit) return 0;
        return pos.credit - debt;
    }

    function currentDebt(address user) external view returns (uint256) {
        Position memory pos = positions[user];
        if (pos.status != Status.Active) return 0;
        return _debtWithInterest(pos);
    }

    function getPosition(address user) external view returns (Position memory) {
        Position memory pos = positions[user];
        if (pos.status == Status.Active) {
            pos.debt = _debtWithInterest(pos);
        }
        return pos;
    }

    function _factorFor(uint256 deposit, uint256 attestedBalance) internal view returns (uint256) {
        if (attestedBalance >= deposit * 2) return 9_000;
        if (attestedBalance >= deposit) return 8_500;
        return collateralFactorBps;
    }

    function _accrue(Position storage pos, address user) internal {
        if (pos.debt == 0 || interestPerYearBps == 0) {
            pos.lastAccrual = uint64(block.timestamp);
            return;
        }
        uint256 dt = block.timestamp - uint256(pos.lastAccrual);
        if (dt == 0) return;
        uint256 interest = (pos.debt * interestPerYearBps * dt) / (10_000 * 365 days);
        if (interest > 0) {
            pos.debt += interest;
            emit InterestAccrued(user, interest, pos.debt);
        }
        pos.lastAccrual = uint64(block.timestamp);
    }

    function _debtWithInterest(Position memory pos) internal view returns (uint256) {
        if (pos.debt == 0 || interestPerYearBps == 0) return pos.debt;
        uint256 dt = block.timestamp - uint256(pos.lastAccrual);
        if (dt == 0) return pos.debt;
        uint256 interest = (pos.debt * interestPerYearBps * dt) / (10_000 * 365 days);
        return pos.debt + interest;
    }
}
