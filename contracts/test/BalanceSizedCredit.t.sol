// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {MockPaymentVerifier} from "../src/MockPaymentVerifier.sol";
import {IPaymentVerifier} from "../src/interfaces/IPaymentVerifier.sol";

/**
 * @title BalanceSizedCreditTest
 * @notice Covers openCreditFromBalance: the path that sizes a line from a proven balance
 *         instead of from a deposit.
 *
 *         The point of these tests is not only that the arithmetic is right, but that the
 *         two sizing models are genuinely different and stay separated. A deposit-backed
 *         line can never exceed the money the borrower already sent; a balance-backed line
 *         scales with proven wealth. Both now exist and must not interfere.
 */
contract BalanceSizedCreditTest is Test {
    MockPaymentVerifier verifier;
    CreditLine line;
    address user = address(0xBEEF);
    address other = address(0xCAFE);

    event CreditOpenedFromBalance(
        address indexed user,
        uint256 attestedBalance,
        uint256 credit,
        uint256 ltvBps,
        bytes32 indexed balanceTxHash
    );

    uint256 constant LTV_BPS = 2_000; // must equal CreditLine.BALANCE_LTV_BPS
    uint256 constant MIN_LINE = 1e14; // must equal CreditLine.MIN_BALANCE_LINE_WEI

    function setUp() public {
        verifier = new MockPaymentVerifier(address(this), false);
        // 80% base LTV on the deposit path, 10% APR.
        line = new CreditLine(address(verifier), 8000, 1000);
        vm.deal(user, 100 ether);
    }

    /* ------------------------------------------------------------------ helpers */

    function _balClaim(address who, bytes32 txHash, uint256 balance)
        internal
        pure
        returns (IPaymentVerifier.PaymentClaim memory)
    {
        return IPaymentVerifier.PaymentClaim({txHash: txHash, payer: who, amount: balance, kind: 3});
    }

    function _proof(IPaymentVerifier.PaymentClaim memory c) internal pure returns (bytes memory) {
        return abi.encode(c.txHash, c.payer, c.amount, c.kind);
    }

    function _openFromBalance(address who, bytes32 txHash, uint256 balance) internal {
        IPaymentVerifier.PaymentClaim memory c = _balClaim(who, txHash, balance);
        vm.prank(who);
        line.openCreditFromBalance(c, _proof(c));
    }

    /* ------------------------------------------------------------- happy path */

    function testOpensSizedByBalanceNotDeposit() public {
        _openFromBalance(user, keccak256("bal-open"), 10 ether);

        CreditLine.Position memory pos = line.getPosition(user);
        assertEq(uint256(pos.status), uint256(CreditLine.Status.Active));
        // 20% of 10 ETH.
        assertEq(pos.credit, 2 ether);
        assertEq(pos.attestedBalance, 10 ether);
        // No deposit was paid, and none is recorded.
        assertEq(pos.deposit, 0);
        assertEq(pos.debt, 0);
        assertEq(line.availableCredit(user), 2 ether);
    }

    function testSizesStrictlyLargerThanTheDepositPathForTheSameWealth() public {
        // Same borrower wealth, two different models.
        uint256 balance = 10 ether;
        uint256 deposit = 0.01 ether;

        _openFromBalance(user, keccak256("cmp-bal"), balance);
        uint256 balanceSized = line.getPosition(user).credit;

        // Reset and run the deposit-backed path with the same attested balance.
        line = new CreditLine(address(verifier), 8000, 1000);
        IPaymentVerifier.PaymentClaim memory dep =
            IPaymentVerifier.PaymentClaim({txHash: keccak256("cmp-dep"), payer: user, amount: deposit, kind: 1});
        IPaymentVerifier.PaymentClaim memory bal = _balClaim(user, keccak256("cmp-bal2"), balance);
        vm.prank(user);
        line.openCredit(dep, _proof(dep), bal, _proof(bal));
        uint256 depositSized = line.getPosition(user).credit;

        // A fresh wallet has no linked history, so the deposit path uses the 9000 bps base
        // tier (balance >= 2x deposit) and lends 0.009 ETH. The 9500 cap only arrives with
        // the +500 history bonus, which is why the demo wallet reads 9500 on chain.
        // The balance path lends 20% of 10 ETH.
        assertEq(depositSized, 0.009 ether);
        assertEq(balanceSized, 2 ether);
        assertGt(balanceSized, depositSized * 200);
    }

    function testRecordsTheOpeningProofAsBothHashes() public {
        bytes32 balTx = keccak256("bal-hashes");
        _openFromBalance(user, balTx, 10 ether);

        CreditLine.Position memory pos = line.getPosition(user);
        // Leaving openTxHash empty would make closeUnused emit a zero hash.
        assertEq(pos.openTxHash, balTx);
        assertEq(pos.balanceTxHash, balTx);
        assertEq(pos.closeTxHash, bytes32(0));
    }

    function testEmitsCreditOpenedFromBalance() public {
        bytes32 balTx = keccak256("bal-event");
        IPaymentVerifier.PaymentClaim memory c = _balClaim(user, balTx, 10 ether);

        vm.expectEmit(true, true, false, true);
        emit CreditOpenedFromBalance(user, 10 ether, 2 ether, LTV_BPS, balTx);

        vm.prank(user);
        line.openCreditFromBalance(c, _proof(c));
    }

    function testDoesNotTouchTheCreditScore() public {
        uint256 before = line.creditScore(user);
        assertEq(before, 650);

        _openFromBalance(user, keccak256("bal-score"), 10 ether);

        // A balance attestation is not a payment. Counting it would corrupt the one metric
        // that is supposed to mean proven payment behaviour.
        assertEq(line.creditScore(user), 650);
        assertEq(line.historyBonusBps(user), 0);
        assertEq(line.getHistory(user).count, 0);
        assertEq(line.getHistory(user).volume, 0);
    }

    function testWithdrawAndRedeemWorkOnABalanceLine() public {
        _openFromBalance(user, keccak256("bal-draw"), 10 ether);

        vm.prank(user);
        line.withdraw(1 ether);
        assertEq(line.creditToken().balanceOf(user), 1 ether);
        assertEq(line.currentDebt(user), 1 ether);
        assertEq(line.availableCredit(user), 1 ether);

        vm.prank(user);
        line.redeem(0.4 ether);
        assertEq(line.creditToken().balanceOf(user), 0.6 ether);
        assertEq(line.currentDebt(user), 0.6 ether);
    }

    function testRepayClosesABalanceLine() public {
        _openFromBalance(user, keccak256("bal-repay"), 10 ether);
        vm.prank(user);
        line.withdraw(0.25 ether);

        IPaymentVerifier.PaymentClaim memory rep =
            IPaymentVerifier.PaymentClaim({txHash: keccak256("bal-repay-src"), payer: user, amount: 0.25 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(rep, _proof(rep));

        CreditLine.Position memory pos = line.getPosition(user);
        assertEq(uint256(pos.status), uint256(CreditLine.Status.Closed));
        assertEq(pos.closeTxHash, rep.txHash);
    }

    function testCloseUnusedClosesABalanceLineWithAnEmptyHashlessProof() public {
        bytes32 balTx = keccak256("bal-close");
        _openFromBalance(user, balTx, 10 ether);

        vm.prank(user);
        line.closeUnused();

        CreditLine.Position memory pos = line.getPosition(user);
        assertEq(uint256(pos.status), uint256(CreditLine.Status.Closed));
        // Must be the real opening proof, not a zero hash.
        assertEq(pos.closeTxHash, balTx);
        assertTrue(pos.closeTxHash != bytes32(0));
    }

    function testInterestAccruesOnABalanceLine() public {
        _openFromBalance(user, keccak256("bal-int"), 10 ether);
        vm.prank(user);
        line.withdraw(2 ether);

        vm.warp(block.timestamp + 365 days);
        // 10% APR on 2 ETH after a year.
        assertApproxEqAbs(line.currentDebt(user), 2.2 ether, 0.01 ether);
    }

    /* ----------------------------------------------------------------- refusals */

    function testRejectsNonBalanceKinds() public {
        IPaymentVerifier.PaymentClaim memory c = _balClaim(user, keccak256("k1"), 10 ether);
        c.kind = 1;
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.openCreditFromBalance(c, _proof(c));

        c.kind = 2;
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.openCreditFromBalance(c, _proof(c));
    }

    function testRejectsClaimForAnotherPayer() public {
        IPaymentVerifier.PaymentClaim memory c = _balClaim(other, keccak256("payer"), 10 ether);
        vm.prank(user);
        vm.expectRevert(CreditLine.BadPayer.selector);
        line.openCreditFromBalance(c, _proof(c));
    }

    function testRejectsZeroBalance() public {
        IPaymentVerifier.PaymentClaim memory c = _balClaim(user, keccak256("zero"), 0);
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.openCreditFromBalance(c, _proof(c));
    }

    function testRejectsReusedProof() public {
        _openFromBalance(user, keccak256("reuse"), 10 ether);
        // Close it, then try to reuse the same balance proof for a fresh line.
        vm.prank(user);
        line.closeUnused();

        IPaymentVerifier.PaymentClaim memory c = _balClaim(user, keccak256("reuse"), 10 ether);
        vm.prank(user);
        vm.expectRevert(CreditLine.TxAlreadyUsed.selector);
        line.openCreditFromBalance(c, _proof(c));
    }

    function testRejectsFailedProof() public {
        IPaymentVerifier.PaymentClaim memory c = _balClaim(user, keccak256("bogus"), 10 ether);
        // Proof for a different amount must not be accepted.
        bytes memory wrong = abi.encode(c.txHash, c.payer, uint256(1 ether), c.kind);
        vm.prank(user);
        vm.expectRevert(CreditLine.ProofFailed.selector);
        line.openCreditFromBalance(c, wrong);
    }

    function testRejectsEmptyProof() public {
        IPaymentVerifier.PaymentClaim memory c = _balClaim(user, keccak256("empty"), 10 ether);
        vm.prank(user);
        vm.expectRevert(CreditLine.ProofFailed.selector);
        line.openCreditFromBalance(c, "");
    }

    function testRejectsSecondLineWhileOneIsActive() public {
        _openFromBalance(user, keccak256("first"), 10 ether);

        IPaymentVerifier.PaymentClaim memory c = _balClaim(user, keccak256("second"), 20 ether);
        vm.prank(user);
        vm.expectRevert(CreditLine.AlreadyOpen.selector);
        line.openCreditFromBalance(c, _proof(c));
    }

    function testRejectsLineBelowTheMinimum() public {
        // 0.0005 ETH proves a 0.0001 ETH line, which is exactly the floor.
        IPaymentVerifier.PaymentClaim memory atFloor = _balClaim(user, keccak256("floor"), 5e14);
        vm.prank(user);
        line.openCreditFromBalance(atFloor, _proof(atFloor));
        assertEq(line.getPosition(user).credit, MIN_LINE);

        // One wei of balance less must be refused rather than opening a dust line.
        line = new CreditLine(address(verifier), 8000, 1000);
        IPaymentVerifier.PaymentClaim memory below = _balClaim(user, keccak256("below"), 5e14 - 1);
        vm.prank(user);
        vm.expectRevert(CreditLine.CreditTooSmall.selector);
        line.openCreditFromBalance(below, _proof(below));
    }

    /* --------------------------------------------------- the two paths, separated */

    function testDepositPathCannotOpenWhileBalanceLineIsActive() public {
        _openFromBalance(user, keccak256("mix-bal"), 10 ether);

        IPaymentVerifier.PaymentClaim memory dep =
            IPaymentVerifier.PaymentClaim({txHash: keccak256("mix-dep"), payer: user, amount: 1 ether, kind: 1});
        IPaymentVerifier.PaymentClaim memory bal = _balClaim(user, keccak256("mix-bal2"), 10 ether);

        vm.prank(user);
        vm.expectRevert(CreditLine.AlreadyOpen.selector);
        line.openCredit(dep, _proof(dep), bal, _proof(bal));
    }

    function testBalancePathCannotOpenWhileDepositLineIsActive() public {
        IPaymentVerifier.PaymentClaim memory dep =
            IPaymentVerifier.PaymentClaim({txHash: keccak256("mix2-dep"), payer: user, amount: 1 ether, kind: 1});
        IPaymentVerifier.PaymentClaim memory bal = _balClaim(user, keccak256("mix2-bal"), 5 ether);
        vm.prank(user);
        line.openCredit(dep, _proof(dep), bal, _proof(bal));

        IPaymentVerifier.PaymentClaim memory c = _balClaim(user, keccak256("mix2-bal-2"), 10 ether);
        vm.prank(user);
        vm.expectRevert(CreditLine.AlreadyOpen.selector);
        line.openCreditFromBalance(c, _proof(c));
    }

    function testUsersDoNotShareState() public {
        _openFromBalance(user, keccak256("u-bal"), 10 ether);
        _openFromBalance(other, keccak256("o-bal"), 4 ether);

        assertEq(line.getPosition(user).credit, 2 ether);
        assertEq(line.getPosition(other).credit, 0.8 ether);
        assertEq(line.getPosition(other).attestedBalance, 4 ether);
    }

    function testPolicyConstantsAreWhatTheDocsSay() public view {
        assertEq(line.BALANCE_LTV_BPS(), 2_000);
        assertEq(line.MIN_BALANCE_LINE_WEI(), 1e14);
    }
}
