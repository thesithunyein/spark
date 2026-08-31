// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPaymentVerifier} from "./interfaces/IPaymentVerifier.sol";
import {SparkCredit} from "./SparkCredit.sol";

/**
 * @title CreditLine
 * @notice Spark credit on Creditcoin.
 *         Open requires TWO Attestcoin proofs:
 *           1) Sepolia deposit payment
 *           2) Sepolia ETH balance attestation (sizes LTV)
 *         Attested payment history (deposit/repay) adds an LTV bonus and a credit score —
 *         no oracle; only BlockProver-verified Sepolia facts.
 *         Debt accrues interest. Redeem burns sCREDIT against debt.
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

    struct PaymentHistory {
        uint256 count;
        uint256 volume;
    }

    IPaymentVerifier public immutable verifier;
    /// @notice Base LTV in bps when attested Sepolia balance < deposit (e.g. 8000 = 80%).
    uint256 public immutable collateralFactorBps;
    /// @notice Simple APR in bps on outstanding debt (e.g. 1000 = 10%/year).
    uint256 public immutable interestPerYearBps;
    SparkCredit public immutable creditToken;

    uint256 public constant HISTORY_BONUS_1_BPS = 250; // ≥1 attested payment
    uint256 public constant HISTORY_BONUS_3_BPS = 500; // ≥3 attested payments
    uint256 public constant MAX_FACTOR_BPS = 9_500;
    uint256 public constant SCORE_BASE = 650;
    uint256 public constant SCORE_PER_PAYMENT = 40;
    uint256 public constant SCORE_CAP = 850;

    mapping(address => Position) public positions;
    mapping(address => PaymentHistory) public history;
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
    event AttestedPaymentLinked(
        address indexed user,
        bytes32 indexed txHash,
        uint8 kind,
        uint256 amount,
        uint256 count,
        uint256 volume
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
     * @notice Link a past Sepolia deposit/repay into on-chain payment history via Attestcoin.
     *         Kinds 1 (deposit) and 2 (repayment) only. Does not open credit by itself.
     *         Use separate txs from the openCredit deposit (shared usedTx map).
     */
    function submitAttestedPayment(IPaymentVerifier.PaymentClaim calldata claim, bytes calldata proof)
        external
    {
        if (claim.kind != 1 && claim.kind != 2) revert BadKind();
        if (claim.payer != msg.sender) revert BadPayer();
        if (claim.amount == 0) revert BadAmount();
        if (usedTx[claim.txHash]) revert TxAlreadyUsed();

        bool ok = verifier.verifyPayment(claim, proof);
        if (!ok) revert ProofFailed();

        usedTx[claim.txHash] = true;
        _recordHistory(msg.sender, claim.amount, claim.txHash, claim.kind);
    }

    /**
     * @notice Link multiple past Sepolia payments in one transaction.
     *         Batch version of submitAttestedPayment — all claims share one verifier call
     *         and a single continuity proof. All must pass or the whole batch reverts.
     *         Atomically: if any claim fails, nothing is written.
     */
    function submitAttestMultiple(
        IPaymentVerifier.PaymentClaim[] calldata claims,
        bytes[] calldata proofs
    ) external {
        if (claims.length == 0) revert BadAmount();
        if (claims.length != proofs.length) revert BadAmount();

        for (uint256 i = 0; i < claims.length; i++) {
            if (claims[i].kind != 1 && claims[i].kind != 2) revert BadKind();
            if (claims[i].payer != msg.sender) revert BadPayer();
            if (claims[i].amount == 0) revert BadAmount();
            if (usedTx[claims[i].txHash]) revert TxAlreadyUsed();

            bool ok = verifier.verifyPayment(claims[i], proofs[i]);
            if (!ok) revert ProofFailed();

            usedTx[claims[i].txHash] = true;
            _recordHistory(msg.sender, claims[i].amount, claims[i].txHash, claims[i].kind);
        }
    }

    /**
     * @notice Open a line after proving (1) deposit payment and (2) Sepolia ETH balance.
     *         Attested balance raises LTV: >=2x deposit → 90%, >=1x → 85%, else base factor.
     *         Linked payment history adds +250bps (≥1) or +500bps (≥3), capped at 95%.
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

        uint256 factorBps = _factorFor(depositClaim.amount, balanceClaim.amount, msg.sender);
        uint256 credit = (depositClaim.amount * factorBps) / 10_000;

        // Opening deposit itself becomes part of attested payment history.
        _recordHistory(msg.sender, depositClaim.amount, depositClaim.txHash, 1);

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
        _recordHistory(msg.sender, claim.amount, claim.txHash, 2);

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

    function getHistory(address user) external view returns (PaymentHistory memory) {
        return history[user];
    }

    /// @notice Attested-payment credit score: 650 base + 40 per linked payment, capped at 850.
    function creditScore(address user) external view returns (uint256) {
        uint256 score = SCORE_BASE + history[user].count * SCORE_PER_PAYMENT;
        if (score > SCORE_CAP) return SCORE_CAP;
        return score;
    }

    function historyBonusBps(address user) public view returns (uint256) {
        uint256 count = history[user].count;
        if (count >= 3) return HISTORY_BONUS_3_BPS;
        if (count >= 1) return HISTORY_BONUS_1_BPS;
        return 0;
    }

    function _recordHistory(address user, uint256 amount, bytes32 txHash, uint8 kind) internal {
        PaymentHistory storage h = history[user];
        h.count += 1;
        h.volume += amount;
        emit AttestedPaymentLinked(user, txHash, kind, amount, h.count, h.volume);
    }

    function _factorFor(uint256 deposit, uint256 attestedBalance, address user)
        internal
        view
        returns (uint256)
    {
        uint256 base;
        if (attestedBalance >= deposit * 2) base = 9_000;
        else if (attestedBalance >= deposit) base = 8_500;
        else base = collateralFactorBps;

        uint256 withBonus = base + historyBonusBps(user);
        if (withBonus > MAX_FACTOR_BPS) return MAX_FACTOR_BPS;
        return withBonus;
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
