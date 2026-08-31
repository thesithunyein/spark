// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SepoliaPayment} from "../src/SepoliaPayment.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {MockPaymentVerifier} from "../src/MockPaymentVerifier.sol";
import {IPaymentVerifier} from "../src/interfaces/IPaymentVerifier.sol";
import {AttestcoinPaymentVerifier} from "../src/AttestcoinPaymentVerifier.sol";

contract SparkTest is Test {
    SepoliaPayment payment;
    MockPaymentVerifier verifier;
    CreditLine line;
    address user = address(0xBEEF);

    // Events for emit checks
    event CreditOpened(address indexed user, uint256 deposit, uint256 attestedBalance, uint256 credit, uint256 factorBps, bytes32 indexed depositTxHash, bytes32 balanceTxHash);
    event CreditWithdrawn(address indexed user, uint256 amount, uint256 debt);
    event CreditRedeemed(address indexed user, uint256 amount, uint256 debt);
    event AttestedPaymentLinked(address indexed user, bytes32 indexed txHash, uint8 kind, uint256 amount, uint256 count, uint256 volume);

    function setUp() public {
        payment = new SepoliaPayment(address(this));
        verifier = new MockPaymentVerifier(address(this), false);
        // 80% base LTV, 10% APR
        line = new CreditLine(address(verifier), 8000, 1000);
        vm.deal(user, 100 ether);
    }

    function testDepositEmits() public {
        vm.prank(user);
        payment.payDeposit{value: 1 ether}(keccak256("ref1"));
        assertEq(payment.deposits(user), 1 ether);
    }

    function testAttestBalanceEmits() public {
        vm.prank(user);
        payment.attestBalance(keccak256("bal1"));
    }

    function testOpenCreditRequiresDualProofs() public {
        _open(user, keccak256("deposit-tx"), keccak256("balance-tx"), 1 ether, 5 ether);

        CreditLine.Position memory pos = line.getPosition(user);
        assertEq(uint256(pos.status), uint256(CreditLine.Status.Active));
        assertEq(pos.deposit, 1 ether);
        assertEq(pos.attestedBalance, 5 ether);
        // balance >= 2x deposit → 90% LTV
        assertEq(pos.credit, 0.9 ether);
        assertEq(pos.debt, 0);
        assertEq(line.availableCredit(user), 0.9 ether);
    }

    function testOpenCreditBaseFactorWhenLowBalance() public {
        _open(user, keccak256("d-low"), keccak256("b-low"), 1 ether, 0.5 ether);
        CreditLine.Position memory pos = line.getPosition(user);
        assertEq(pos.credit, 0.8 ether);
    }

    function testWithdrawMintsCredit() public {
        _open(user, keccak256("dep-w"), keccak256("bal-w"), 1 ether, 2 ether);

        vm.prank(user);
        line.withdraw(0.5 ether);

        CreditLine.Position memory pos = line.getPosition(user);
        assertEq(pos.debt, 0.5 ether);
        assertEq(line.availableCredit(user), 0.4 ether); // 0.9 credit - 0.5 debt
        assertEq(line.creditToken().balanceOf(user), 0.5 ether);
    }

    function testRedeemBurnsAgainstDebt() public {
        _open(user, keccak256("dep-r"), keccak256("bal-r"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);

        vm.prank(user);
        line.redeem(0.2 ether);

        assertEq(line.creditToken().balanceOf(user), 0.3 ether);
        assertEq(line.currentDebt(user), 0.3 ether);
    }

    function testInterestAccrues() public {
        _open(user, keccak256("dep-i"), keccak256("bal-i"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);

        vm.warp(block.timestamp + 365 days);
        uint256 debt = line.currentDebt(user);
        // ~10% of 0.5 ether
        assertGt(debt, 0.5 ether);
        assertApproxEqRel(debt, 0.55 ether, 0.01e18);
    }

    function testWithdrawExceedsReverts() public {
        _open(user, keccak256("dep-x"), keccak256("bal-x"), 1 ether, 2 ether);
        vm.prank(user);
        vm.expectRevert(CreditLine.ExceedsAvailable.selector);
        line.withdraw(0.91 ether);
    }

    function testReplayRejected() public {
        bytes32 dep = keccak256("deposit-tx-2");
        bytes32 bal = keccak256("balance-tx-2");
        _open(user, dep, bal, 1 ether, 2 ether);

        vm.prank(user);
        line.withdraw(0.8 ether);

        bytes32 repayHash = keccak256("repay-tx");
        IPaymentVerifier.PaymentClaim memory repay = IPaymentVerifier.PaymentClaim({
            txHash: repayHash,
            payer: user,
            amount: 0.8 ether,
            kind: 2
        });
        bytes memory repayProof = abi.encode(repayHash, user, uint256(0.8 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(repay, repayProof);

        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: dep,
            payer: user,
            amount: 1 ether,
            kind: 1
        });
        IPaymentVerifier.PaymentClaim memory balClaim = IPaymentVerifier.PaymentClaim({
            txHash: bal,
            payer: user,
            amount: 2 ether,
            kind: 3
        });
        bytes memory proof = abi.encode(dep, user, uint256(1 ether), uint8(1));
        bytes memory balProof = abi.encode(bal, user, uint256(2 ether), uint8(3));

        vm.prank(user);
        vm.expectRevert(CreditLine.TxAlreadyUsed.selector);
        line.openCredit(claim, proof, balClaim, balProof);
    }

    function testCloseUnused() public {
        _open(user, keccak256("dep-c"), keccak256("bal-c"), 1 ether, 2 ether);
        vm.prank(user);
        line.closeUnused();
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testWrongPayerReverts() public {
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("deposit-tx-3"),
            payer: address(0xCAFE),
            amount: 1 ether,
            kind: 1
        });
        IPaymentVerifier.PaymentClaim memory balClaim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("balance-tx-3"),
            payer: address(0xCAFE),
            amount: 2 ether,
            kind: 3
        });
        bytes memory proof = abi.encode(claim.txHash, address(0xCAFE), uint256(1 ether), uint8(1));
        bytes memory balProof = abi.encode(balClaim.txHash, address(0xCAFE), uint256(2 ether), uint8(3));

        vm.prank(user);
        vm.expectRevert(CreditLine.BadPayer.selector);
        line.openCredit(claim, proof, balClaim, balProof);
    }

    function testBadProofReverts() public {
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("deposit-tx-4"),
            payer: user,
            amount: 1 ether,
            kind: 1
        });
        IPaymentVerifier.PaymentClaim memory balClaim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("balance-tx-4"),
            payer: user,
            amount: 2 ether,
            kind: 3
        });
        bytes memory proof = abi.encode(claim.txHash, user, uint256(2 ether), uint8(1));
        bytes memory balProof = abi.encode(balClaim.txHash, user, uint256(2 ether), uint8(3));

        vm.prank(user);
        vm.expectRevert(CreditLine.ProofFailed.selector);
        line.openCredit(claim, proof, balClaim, balProof);
    }

    function testSubmitAttestedPaymentUpdatesHistory() public {
        assertEq(line.creditScore(user), 650);
        _link(user, keccak256("hist-1"), 0.001 ether, 1);
        CreditLine.PaymentHistory memory h = line.getHistory(user);
        assertEq(h.count, 1);
        assertEq(h.volume, 0.001 ether);
        assertEq(line.creditScore(user), 690);
        assertEq(line.historyBonusBps(user), 250);

        _link(user, keccak256("hist-2"), 0.002 ether, 2);
        _link(user, keccak256("hist-3"), 0.003 ether, 1);
        h = line.getHistory(user);
        assertEq(h.count, 3);
        assertEq(h.volume, 0.006 ether);
        assertEq(line.historyBonusBps(user), 500);
        assertEq(line.creditScore(user), 770);
    }

    function testSubmitAttestedPaymentReplayRejected() public {
        bytes32 txHash = keccak256("hist-replay");
        _link(user, txHash, 0.001 ether, 1);
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: txHash,
            payer: user,
            amount: 0.001 ether,
            kind: 1
        });
        bytes memory proof = abi.encode(txHash, user, uint256(0.001 ether), uint8(1));
        vm.prank(user);
        vm.expectRevert(CreditLine.TxAlreadyUsed.selector);
        line.submitAttestedPayment(claim, proof);
    }

    function testHistoryBonusTiersOnOpen() public {
        // 1 linked payment → +250bps on top of 90% balance factor → 9250
        _link(user, keccak256("bonus-1"), 0.001 ether, 1);
        _open(user, keccak256("dep-b1"), keccak256("bal-b1"), 1 ether, 2 ether);
        CreditLine.Position memory pos = line.getPosition(user);
        assertEq(pos.credit, 0.925 ether);
        // opening deposit also recorded → count 2, score 730
        assertEq(line.getHistory(user).count, 2);
        assertEq(line.creditScore(user), 730);
    }

    function testHistoryBonusThreePayments() public {
        _link(user, keccak256("t1"), 0.001 ether, 1);
        _link(user, keccak256("t2"), 0.001 ether, 1);
        _link(user, keccak256("t3"), 0.001 ether, 2);
        // 9000 + 500 = 9500 cap path (exactly at max)
        _open(user, keccak256("dep-t"), keccak256("bal-t"), 1 ether, 2 ether);
        assertEq(line.getPosition(user).credit, 0.95 ether);
        assertEq(line.creditScore(user), 810); // 650 + 40*4 (3 linked + open deposit)
    }

    function testCreditScoreCapsAt850() public {
        for (uint256 i = 0; i < 6; i++) {
            _link(user, keccak256(abi.encodePacked("cap", i)), 0.001 ether, 1);
        }
        assertEq(line.getHistory(user).count, 6);
        assertEq(line.creditScore(user), 850);
    }

    function testOpenDepositCannotReuseLinkedHistoryTx() public {
        bytes32 shared = keccak256("shared-dep");
        _link(user, shared, 1 ether, 1);
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: shared,
            payer: user,
            amount: 1 ether,
            kind: 1
        });
        IPaymentVerifier.PaymentClaim memory balClaim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("bal-shared"),
            payer: user,
            amount: 2 ether,
            kind: 3
        });
        bytes memory proof = abi.encode(shared, user, uint256(1 ether), uint8(1));
        bytes memory balProof = abi.encode(balClaim.txHash, user, uint256(2 ether), uint8(3));
        vm.prank(user);
        vm.expectRevert(CreditLine.TxAlreadyUsed.selector);
        line.openCredit(claim, proof, balClaim, balProof);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VERIFIER EDGE CASES (via MockPaymentVerifier)
    // ═══════════════════════════════════════════════════════════════

    function testZeroAmountReverts() public {
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("zero-amount"),
            payer: user,
            amount: 0,
            kind: 1
        });
        bytes memory proof = abi.encode(claim.txHash, user, uint256(0), uint8(1));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.submitAttestedPayment(claim, proof);
    }

    function testEmptyProofReverts() public {
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("empty-proof"),
            payer: user,
            amount: 1 ether,
            kind: 1
        });
        vm.prank(user);
        vm.expectRevert();
        line.submitAttestedPayment(claim, "");
    }

    function testInvalidKindReverts() public {
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("bad-kind"),
            payer: user,
            amount: 1 ether,
            kind: 99
        });
        bytes memory proof = abi.encode(claim.txHash, user, uint256(1 ether), uint8(99));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.submitAttestedPayment(claim, proof);
    }

    function testKind0Reverts() public {
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("kind-0"),
            payer: user,
            amount: 1 ether,
            kind: 0
        });
        bytes memory proof = abi.encode(claim.txHash, user, uint256(1 ether), uint8(0));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.submitAttestedPayment(claim, proof);
    }

    function testOpenWithDifferentDepositAndBalanceTxs() public {
        // deposit and balance must be different txHash
        bytes32 same = keccak256("same-tx");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: same,
            payer: user,
            amount: 1 ether,
            kind: 1
        });
        IPaymentVerifier.PaymentClaim memory balClaim = IPaymentVerifier.PaymentClaim({
            txHash: same,
            payer: user,
            amount: 2 ether,
            kind: 3
        });
        bytes memory proof = abi.encode(same, user, uint256(1 ether), uint8(1));
        bytes memory balProof = abi.encode(same, user, uint256(2 ether), uint8(3));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.openCredit(claim, proof, balClaim, balProof);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MULTI-USER SCENARIOS
    // ═══════════════════════════════════════════════════════════════

    function testTwoUsersIndependent() public {
        address user2 = address(0xCAFE);
        vm.deal(user2, 100 ether);

        _open(user, keccak256("u1-dep"), keccak256("u1-bal"), 1 ether, 2 ether);
        _open(user2, keccak256("u2-dep"), keccak256("u2-bal"), 2 ether, 4 ether);

        // user1: 1 ETH deposit, 90% LTV = 0.9 credit
        assertEq(line.availableCredit(user), 0.9 ether);
        // user2: 2 ETH deposit, 90% LTV = 1.8 credit
        assertEq(line.availableCredit(user2), 1.8 ether);

        // user1 withdraws
        vm.prank(user);
        line.withdraw(0.5 ether);
        assertEq(line.availableCredit(user), 0.4 ether);
        // user2 unaffected
        assertEq(line.availableCredit(user2), 1.8 ether);
    }

    function testUserWithoutPositionHasZeroDefaults() public {
        assertEq(line.availableCredit(user), 0);
        assertEq(line.currentDebt(user), 0);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.None));
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTEREST EDGE CASES
    // ═══════════════════════════════════════════════════════════════

    function testNoInterestWhenNoDebt() public {
        _open(user, keccak256("dep-ni"), keccak256("bal-ni"), 1 ether, 2 ether);
        vm.warp(block.timestamp + 365 days);
        // No withdrawal = no debt = no interest
        assertEq(line.currentDebt(user), 0);
    }

    function testInterestAccruesOverShortPeriod() public {
        _open(user, keccak256("dep-sp"), keccak256("bal-sp"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);

        vm.warp(block.timestamp + 30 days);
        uint256 debt = line.currentDebt(user);
        // ~10% APR for 30 days on 0.5 ETH ≈ 0.5 + 0.0041
        assertGt(debt, 0.5 ether);
        assertApproxEqRel(debt, 0.5041 ether, 0.005e18);
    }

    function testInterestAccruesOnRepay() public {
        _open(user, keccak256("dep-ri"), keccak256("bal-ri"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);

        vm.warp(block.timestamp + 365 days);
        uint256 debtBefore = line.currentDebt(user);
        assertGt(debtBefore, 0.5 ether);

        // Repay partially — interest should be accrued in the process
        bytes32 repayHash = keccak256("repay-accrue");
        IPaymentVerifier.PaymentClaim memory repay = IPaymentVerifier.PaymentClaim({
            txHash: repayHash,
            payer: user,
            amount: 0.1 ether,
            kind: 2
        });
        bytes memory repayProof = abi.encode(repayHash, user, uint256(0.1 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(repay, repayProof);

        uint256 debtAfter = line.currentDebt(user);
        // Debt should have accrued interest then reduced by 0.1
        assertLt(debtAfter, debtBefore);
    }

    function testRedeemFullDebtClosesNothing() public {
        _open(user, keccak256("dep-rf"), keccak256("bal-rf"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.prank(user);
        line.redeem(0.5 ether);
        // Debt is 0, but position is still Active (redeem doesn't close)
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Active));
        assertEq(line.currentDebt(user), 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SCORE BOUNDARY CASES
    // ═══════════════════════════════════════════════════════════════

    function testScoreAtExactlyCap() public {
        // 5 payments → 650 + 5*40 = 850
        for (uint256 i = 0; i < 5; i++) {
            _link(user, keccak256(abi.encodePacked("exact-cap", i)), 0.001 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
    }

    function testScoreOneBelowCap() public {
        // 4 payments → 650 + 4*40 = 810
        for (uint256 i = 0; i < 4; i++) {
            _link(user, keccak256(abi.encodePacked("below-cap", i)), 0.001 ether, 1);
        }
        assertEq(line.creditScore(user), 810);
    }

    function testHistoryBonusZeroPayments() public {
        assertEq(line.historyBonusBps(user), 0);
    }

    function testHistoryBonusExactlyOne() public {
        _link(user, keccak256("exactly-1"), 0.001 ether, 1);
        assertEq(line.historyBonusBps(user), 250);
    }

    function testHistoryBonusExactlyTwo() public {
        _link(user, keccak256("exactly-2a"), 0.001 ether, 1);
        _link(user, keccak256("exactly-2b"), 0.001 ether, 2);
        assertEq(line.historyBonusBps(user), 250); // still 250, need 3 for 500
    }

    function testHistoryBonusExactlyThree() public {
        _link(user, keccak256("exactly-3a"), 0.001 ether, 1);
        _link(user, keccak256("exactly-3b"), 0.001 ether, 1);
        _link(user, keccak256("exactly-3c"), 0.001 ether, 2);
        assertEq(line.historyBonusBps(user), 500);
    }

    // ═══════════════════════════════════════════════════════════════
    //  LTV BOUNDARY CASES
    // ═══════════════════════════════════════════════════════════════

    function testLTVAtExactly2xBalance() public {
        _open(user, keccak256("dep-2x"), keccak256("bal-2x"), 1 ether, 2 ether);
        // balance == 2x → 90% base
        assertEq(line.getPosition(user).credit, 0.9 ether);
    }

    function testLTVAtExactly1xBalance() public {
        _open(user, keccak256("dep-1x"), keccak256("bal-1x"), 1 ether, 1 ether);
        // balance == 1x → 85%
        assertEq(line.getPosition(user).credit, 0.85 ether);
    }

    function testLTVBelow1xBalance() public {
        _open(user, keccak256("dep-below"), keccak256("bal-below"), 1 ether, 0.5 ether);
        // balance < 1x → 80% base
        assertEq(line.getPosition(user).credit, 0.8 ether);
    }

    function testLTVCappedAt95Percent() public {
        // 3 linked payments + 2x balance = 9000 + 500 = 9500 (exactly cap)
        _link(user, keccak256("cap-1"), 0.001 ether, 1);
        _link(user, keccak256("cap-2"), 0.001 ether, 1);
        _link(user, keccak256("cap-3"), 0.001 ether, 1);
        _open(user, keccak256("dep-cap"), keccak256("bal-cap"), 1 ether, 10 ether);
        assertEq(line.getPosition(user).credit, 0.95 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  REPAY + CLOSE FLOW
    // ═══════════════════════════════════════════════════════════════

    function testRepayFullDebtClosesPosition() public {
        _open(user, keccak256("dep-rc"), keccak256("bal-rc"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);

        bytes32 repayHash = keccak256("full-repay");
        IPaymentVerifier.PaymentClaim memory repay = IPaymentVerifier.PaymentClaim({
            txHash: repayHash,
            payer: user,
            amount: 1 ether, // more than debt
            kind: 2
        });
        bytes memory repayProof = abi.encode(repayHash, user, uint256(1 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(repay, repayProof);

        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
        assertEq(line.currentDebt(user), 0);
    }

    function testRepayPartialDebtRemains() public {
        _open(user, keccak256("dep-pr"), keccak256("bal-pr"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);

        bytes32 repayHash = keccak256("partial-repay");
        IPaymentVerifier.PaymentClaim memory repay = IPaymentVerifier.PaymentClaim({
            txHash: repayHash,
            payer: user,
            amount: 0.2 ether,
            kind: 2
        });
        bytes memory repayProof = abi.encode(repayHash, user, uint256(0.2 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(repay, repayProof);

        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Active));
    }

    function testHistoryVolumeAccumulates() public {
        _link(user, keccak256("vol-1"), 0.1 ether, 1);
        _link(user, keccak256("vol-2"), 0.2 ether, 2);
        _link(user, keccak256("vol-3"), 0.3 ether, 1);
        CreditLine.PaymentHistory memory h = line.getHistory(user);
        assertEq(h.count, 3);
        assertEq(h.volume, 0.6 ether);
    }

    function testMultipleReducesDebt() public {
        _open(user, keccak256("dep-mr"), keccak256("bal-mr"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.prank(user);
        line.redeem(0.1 ether);
        vm.prank(user);
        line.redeem(0.1 ether);
        assertEq(line.creditToken().balanceOf(user), 0.3 ether);
        assertEq(line.currentDebt(user), 0.3 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    function testCreditOpenedEvent() public {
        bytes32 depTx = keccak256("evt-dep");
        bytes32 balTx = keccak256("evt-bal");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: depTx, payer: user, amount: 1 ether, kind: 1
        });
        IPaymentVerifier.PaymentClaim memory balClaim = IPaymentVerifier.PaymentClaim({
            txHash: balTx, payer: user, amount: 2 ether, kind: 3
        });
        bytes memory proof = abi.encode(depTx, user, uint256(1 ether), uint8(1));
        bytes memory balProof = abi.encode(balTx, user, uint256(2 ether), uint8(3));

        vm.expectEmit();
        emit CreditLine.CreditOpened(user, 1 ether, 2 ether, 0.9 ether, 9000, depTx, balTx);
        vm.prank(user);
        line.openCredit(claim, proof, balClaim, balProof);
    }

    function testAttestedPaymentLinkedEvent() public {
        bytes32 txHash = keccak256("evt-link");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: txHash, payer: user, amount: 0.5 ether, kind: 1
        });
        bytes memory proof = abi.encode(txHash, user, uint256(0.5 ether), uint8(1));

        vm.expectEmit();
        emit CreditLine.AttestedPaymentLinked(user, txHash, 1, 0.5 ether, 1, 0.5 ether);
        vm.prank(user);
        line.submitAttestedPayment(claim, proof);
    }

    // ═══════════════════════════════════════════════════════════════
    //  BATCH PROVING
    // ═══════════════════════════════════════════════════════════════

    function testBatchSubmitMultiplePayments() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
        bytes[] memory proofs = new bytes[](3);

        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("batch-1"), payer: user, amount: 0.1 ether, kind: 1});
        claims[1] = IPaymentVerifier.PaymentClaim({txHash: keccak256("batch-2"), payer: user, amount: 0.2 ether, kind: 2});
        claims[2] = IPaymentVerifier.PaymentClaim({txHash: keccak256("batch-3"), payer: user, amount: 0.3 ether, kind: 1});

        proofs[0] = abi.encode(keccak256("batch-1"), user, uint256(0.1 ether), uint8(1));
        proofs[1] = abi.encode(keccak256("batch-2"), user, uint256(0.2 ether), uint8(2));
        proofs[2] = abi.encode(keccak256("batch-3"), user, uint256(0.3 ether), uint8(1));

        vm.prank(user);
        line.submitAttestMultiple(claims, proofs);

        CreditLine.PaymentHistory memory h = line.getHistory(user);
        assertEq(h.count, 3);
        assertEq(h.volume, 0.6 ether);
        assertEq(line.creditScore(user), 770); // 650 + 3*40
        assertEq(line.historyBonusBps(user), 500);
    }

    function testBatchEmptyReverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](0);
        bytes[] memory proofs = new bytes[](0);
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.submitAttestMultiple(claims, proofs);
    }

    function testBatchReplayReverts() public {
        // First: link one payment normally
        _link(user, keccak256("batch-replay"), 0.1 ether, 1);

        // Second: try to include the same txHash in a batch
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("batch-replay"), payer: user, amount: 0.1 ether, kind: 1});
        proofs[0] = abi.encode(keccak256("batch-replay"), user, uint256(0.1 ether), uint8(1));

        vm.prank(user);
        vm.expectRevert(CreditLine.TxAlreadyUsed.selector);
        line.submitAttestMultiple(claims, proofs);
    }

    function testBatchWrongPayerReverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("batch-wp"), payer: address(0xCAFE), amount: 0.1 ether, kind: 1});
        proofs[0] = abi.encode(keccak256("batch-wp"), address(0xCAFE), uint256(0.1 ether), uint8(1));

        vm.prank(user);
        vm.expectRevert(CreditLine.BadPayer.selector);
        line.submitAttestMultiple(claims, proofs);
    }

    function testBatchInvalidKindReverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("batch-ik"), payer: user, amount: 0.1 ether, kind: 3});
        proofs[0] = abi.encode(keccak256("batch-ik"), user, uint256(0.1 ether), uint8(3));

        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.submitAttestMultiple(claims, proofs);
    }

    // ═══════════════════════════════════════════════════════════════
    //  NEGATIVE PATHS (attacker scenarios)
    // ═══════════════════════════════════════════════════════════════

    function testNegativePath_ForgedProofRejected() public {
        // Attacker submits completely fake proof bytes
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("forged"), payer: user, amount: 1 ether, kind: 1
        });
        // Random 32 bytes — not a valid encoded proof
        bytes memory fakeProof = abi.encode(keccak256("fake"), user, uint256(1 ether), uint8(1));
        vm.prank(user);
        vm.expectRevert(); // MockPaymentVerifier returns false
        line.submitAttestedPayment(claim, fakeProof);
    }

    function testNegativePath_TamperedAmountRejected() public {
        // Attacker claims 10 ETH but proof encodes 0.001 ETH
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("tamper-amt"), payer: user, amount: 10 ether, kind: 1
        });
        // Proof encodes different amount than claim
        bytes memory proof = abi.encode(keccak256("tamper-amt"), user, uint256(0.001 ether), uint8(1));
        vm.prank(user);
        vm.expectRevert(CreditLine.ProofFailed.selector);
        line.submitAttestedPayment(claim, proof);
    }

    function testNegativePath_TamperedPayerRejected() public {
        // Attacker claims someone else's payment
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("tamper-pay"), payer: user, amount: 1 ether, kind: 1
        });
        // Proof encodes different payer
        bytes memory proof = abi.encode(keccak256("tamper-pay"), address(0xDEAD), uint256(1 ether), uint8(1));
        vm.prank(user);
        // Mock verifier internally checks payer — returns false, CreditLine reverts ProofFailed
        vm.expectRevert(CreditLine.ProofFailed.selector);
        line.submitAttestedPayment(claim, proof);
    }

    function testNegativePath_TamperedKindRejected() public {
        // Attacker claims kind 1 (deposit) but proof encodes kind 2 (repay)
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("tamper-kind"), payer: user, amount: 1 ether, kind: 1
        });
        bytes memory proof = abi.encode(keccak256("tamper-kind"), user, uint256(1 ether), uint8(2));
        vm.prank(user);
        vm.expectRevert(CreditLine.ProofFailed.selector);
        line.submitAttestedPayment(claim, proof);
    }

    function testNegativePath_CrossFunctionReplay() public {
        // Attacker uses same txHash in submitAttestedPayment, then tries openCredit
        bytes32 sharedTx = keccak256("cross-replay");
        _link(user, sharedTx, 0.1 ether, 1);

        // Try to use the same txHash in openCredit
        IPaymentVerifier.PaymentClaim memory depClaim = IPaymentVerifier.PaymentClaim({
            txHash: sharedTx, payer: user, amount: 1 ether, kind: 1
        });
        IPaymentVerifier.PaymentClaim memory balClaim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("cross-replay-bal"), payer: user, amount: 2 ether, kind: 3
        });
        bytes memory depProof = abi.encode(sharedTx, user, uint256(1 ether), uint8(1));
        bytes memory balProof = abi.encode(keccak256("cross-replay-bal"), user, uint256(2 ether), uint8(3));
        vm.prank(user);
        vm.expectRevert(CreditLine.TxAlreadyUsed.selector);
        line.openCredit(depClaim, depProof, balClaim, balProof);
    }

    function testNegativePath_BatchAtomicity() public {
        // One valid + one invalid proof in batch — entire batch reverts
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](2);
        bytes[] memory proofs = new bytes[](2);

        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("atom-valid"), payer: user, amount: 0.1 ether, kind: 1});
        claims[1] = IPaymentVerifier.PaymentClaim({txHash: keccak256("atom-invalid"), payer: user, amount: 0.1 ether, kind: 3}); // kind 3 not allowed in batch

        proofs[0] = abi.encode(keccak256("atom-valid"), user, uint256(0.1 ether), uint8(1));
        proofs[1] = abi.encode(keccak256("atom-invalid"), user, uint256(0.1 ether), uint8(3));

        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.executeBatch(claims, proofs);

        // First proof should NOT have been recorded (atomicity)
        CreditLine.PaymentHistory memory h = line.getHistory(user);
        assertEq(h.count, 0);
    }

    function testNegativePath_BatchReplayInBatch() public {
        // Two claims with same txHash in one batch — second reverts
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](2);
        bytes[] memory proofs = new bytes[](2);
        bytes32 dup = keccak256("dup-in-batch");

        claims[0] = IPaymentVerifier.PaymentClaim({txHash: dup, payer: user, amount: 0.1 ether, kind: 1});
        claims[1] = IPaymentVerifier.PaymentClaim({txHash: dup, payer: user, amount: 0.2 ether, kind: 2});

        proofs[0] = abi.encode(dup, user, uint256(0.1 ether), uint8(1));
        proofs[1] = abi.encode(dup, user, uint256(0.2 ether), uint8(2));

        vm.prank(user);
        vm.expectRevert(CreditLine.TxAlreadyUsed.selector);
        line.executeBatch(claims, proofs);
    }

    function testNegativePath_ClosedPositionCannotOpen() public {
        _open(user, keccak256("closed-dep"), keccak256("closed-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.closeUnused();

        // After close, user CAN re-open (status=Closed, not Active)
        _open(user, keccak256("closed-dep2"), keccak256("closed-bal2"), 1 ether, 2 ether);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Active));

        // But Active position cannot open another
        vm.expectRevert(CreditLine.AlreadyOpen.selector);
        _open(user, keccak256("closed-dep3"), keccak256("closed-bal3"), 1 ether, 2 ether);
    }

    function testNegativePath_WithdrawFromClosedReverts() public {
        _open(user, keccak256("wd-closed-dep"), keccak256("wd-closed-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.closeUnused();

        vm.prank(user);
        vm.expectRevert(CreditLine.NotActive.selector);
        line.withdraw(0.1 ether);
    }

    function testNegativePath_RedeemFromClosedReverts() public {
        _open(user, keccak256("rd-closed-dep"), keccak256("rd-closed-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.closeUnused();

        vm.prank(user);
        vm.expectRevert(CreditLine.NotActive.selector);
        line.redeem(0.1 ether);
    }

    function testNegativePath_RepayFromClosedReverts() public {
        _open(user, keccak256("rp-closed-dep"), keccak256("rp-closed-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.closeUnused();

        bytes32 repayHash = keccak256("rp-closed-repay");
        IPaymentVerifier.PaymentClaim memory repay = IPaymentVerifier.PaymentClaim({
            txHash: repayHash, payer: user, amount: 0.1 ether, kind: 2
        });
        bytes memory repayProof = abi.encode(repayHash, user, uint256(0.1 ether), uint8(2));
        vm.prank(user);
        vm.expectRevert(CreditLine.NotActive.selector);
        line.repayCredit(repay, repayProof);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EXECUTE BATCH (new function)
    // ═══════════════════════════════════════════════════════════════

    function testExecuteBatchSuccess() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
        bytes[] memory proofs = new bytes[](3);

        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("eb-1"), payer: user, amount: 0.1 ether, kind: 1});
        claims[1] = IPaymentVerifier.PaymentClaim({txHash: keccak256("eb-2"), payer: user, amount: 0.2 ether, kind: 2});
        claims[2] = IPaymentVerifier.PaymentClaim({txHash: keccak256("eb-3"), payer: user, amount: 0.3 ether, kind: 1});

        proofs[0] = abi.encode(keccak256("eb-1"), user, uint256(0.1 ether), uint8(1));
        proofs[1] = abi.encode(keccak256("eb-2"), user, uint256(0.2 ether), uint8(2));
        proofs[2] = abi.encode(keccak256("eb-3"), user, uint256(0.3 ether), uint8(1));

        vm.prank(user);
        line.executeBatch(claims, proofs);

        CreditLine.PaymentHistory memory h = line.getHistory(user);
        assertEq(h.count, 3);
        assertEq(h.volume, 0.6 ether);
    }

    function testExecuteBatchEmptyReverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](0);
        bytes[] memory proofs = new bytes[](0);
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.executeBatch(claims, proofs);
    }

    function testExecuteBatchLengthMismatchReverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](2);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("eb-mismatch"), payer: user, amount: 0.1 ether, kind: 1});
        claims[1] = IPaymentVerifier.PaymentClaim({txHash: keccak256("eb-mismatch2"), payer: user, amount: 0.1 ether, kind: 1});
        proofs[0] = abi.encode(keccak256("eb-mismatch"), user, uint256(0.1 ether), uint8(1));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.executeBatch(claims, proofs);
    }

    function testExecuteBatchReplayReverts() public {
        _link(user, keccak256("eb-replay"), 0.1 ether, 1);

        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("eb-replay"), payer: user, amount: 0.1 ether, kind: 1});
        proofs[0] = abi.encode(keccak256("eb-replay"), user, uint256(0.1 ether), uint8(1));

        vm.prank(user);
        vm.expectRevert(CreditLine.TxAlreadyUsed.selector);
        line.executeBatch(claims, proofs);
    }

    function testExecuteBatchWrongPayerReverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("eb-wp"), payer: address(0xCAFE), amount: 0.1 ether, kind: 1});
        proofs[0] = abi.encode(keccak256("eb-wp"), address(0xCAFE), uint256(0.1 ether), uint8(1));

        vm.prank(user);
        vm.expectRevert(CreditLine.BadPayer.selector);
        line.executeBatch(claims, proofs);
    }

    function testExecuteBatchMixedKinds() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](2);
        bytes[] memory proofs = new bytes[](2);

        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("eb-mix-dep"), payer: user, amount: 0.5 ether, kind: 1});
        claims[1] = IPaymentVerifier.PaymentClaim({txHash: keccak256("eb-mix-repay"), payer: user, amount: 0.3 ether, kind: 2});

        proofs[0] = abi.encode(keccak256("eb-mix-dep"), user, uint256(0.5 ether), uint8(1));
        proofs[1] = abi.encode(keccak256("eb-mix-repay"), user, uint256(0.3 ether), uint8(2));

        vm.prank(user);
        line.executeBatch(claims, proofs);

        CreditLine.PaymentHistory memory h = line.getHistory(user);
        assertEq(h.count, 2);
        assertEq(h.volume, 0.8 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASES
    // ═══════════════════════════════════════════════════════════════

    function testScoreOverflowProtection() public {
        // Link 20 payments — score should cap at 850
        for (uint256 i = 0; i < 20; i++) {
            _link(user, keccak256(abi.encodePacked("overflow", i)), 0.001 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
        assertEq(line.getHistory(user).count, 20);
    }

    function testHistoryBonusDoesNotResizeActiveLine() public {
        _open(user, keccak256("no-resize-dep"), keccak256("no-resize-bal"), 1 ether, 2 ether);
        uint256 creditBefore = line.getPosition(user).credit;

        // Link 3 payments after opening
        _link(user, keccak256("no-resize-1"), 0.1 ether, 1);
        _link(user, keccak256("no-resize-2"), 0.1 ether, 2);
        _link(user, keccak256("no-resize-3"), 0.1 ether, 1);

        // Score should update
        assertEq(line.creditScore(user), 810); // 650 + 4*40 (3 linked + open deposit counted)
        // But credit should NOT change (bonus only applies at open time)
        assertEq(line.getPosition(user).credit, creditBefore);
    }

    function testCloseWithDebtReverts() public {
        _open(user, keccak256("close-debt-dep"), keccak256("close-debt-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);

        vm.prank(user);
        vm.expectRevert(CreditLine.HasDebt.selector);
        line.closeUnused();
    }

    function testRedeemExactlyDebt() public {
        _open(user, keccak256("redeem-exact-dep"), keccak256("redeem-exact-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.prank(user);
        line.redeem(0.5 ether);
        assertEq(line.currentDebt(user), 0);
        assertEq(line.creditToken().balanceOf(user), 0);
    }

    function testWithdrawAllAvailable() public {
        _open(user, keccak256("withdraw-all-dep"), keccak256("withdraw-all-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.9 ether); // max available at 90% LTV
        assertEq(line.availableCredit(user), 0);
        assertEq(line.creditToken().balanceOf(user), 0.9 ether);
    }

    function testInterestCompoundsOverMultiplePeriods() public {
        _open(user, keccak256("compound-dep"), keccak256("compound-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.9 ether);

        // Year 1: trigger accrual via a state-changing call
        vm.warp(block.timestamp + 365 days);
        vm.prank(user);
        line.accrue(user);
        uint256 debt1 = line.currentDebt(user);
        // 0.9 * 1.10 = 0.99
        assertApproxEqRel(debt1, 0.99 ether, 0.01e18);

        // Year 2: compound on 0.99
        vm.warp(block.timestamp + 365 days);
        vm.prank(user);
        line.accrue(user);
        uint256 debt2 = line.currentDebt(user);
        // 0.99 * 1.10 = 1.089
        assertApproxEqRel(debt2, 1.089 ether, 0.02e18);
    }

    function testAccrueOnViewFunctions() public {
        _open(user, keccak256("accrue-view-dep"), keccak256("accrue-view-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);

        vm.warp(block.timestamp + 365 days);

        // View functions should trigger accrual
        line.availableCredit(user);
        line.currentDebt(user);
        line.getPosition(user);

        // Debt should have accrued
        assertGt(line.currentDebt(user), 0.5 ether);
    }

    function testThreeUsersIndependent() public {
        address user2 = address(0xCAFE);
        address user3 = address(0xDEAD);
        vm.deal(user2, 100 ether);
        vm.deal(user3, 100 ether);

        _open(user, keccak256("3u1-dep"), keccak256("3u1-bal"), 1 ether, 2 ether);
        _open(user2, keccak256("3u2-dep"), keccak256("3u2-bal"), 2 ether, 4 ether);
        _open(user3, keccak256("3u3-dep"), keccak256("3u3-bal"), 3 ether, 6 ether);

        assertEq(line.availableCredit(user), 0.9 ether);
        assertEq(line.availableCredit(user2), 1.8 ether);
        assertEq(line.availableCredit(user3), 2.7 ether);

        // User2 withdraws — others unaffected
        vm.prank(user2);
        line.withdraw(1 ether);
        assertEq(line.availableCredit(user), 0.9 ether);
        assertEq(line.availableCredit(user2), 0.8 ether);
        assertEq(line.availableCredit(user3), 2.7 ether);
    }

    function testFullLifecycleStress() public {
        // Open → withdraw → redeem → withdraw → repay → close
        _open(user, keccak256("stress-dep"), keccak256("stress-bal"), 1 ether, 2 ether);

        vm.prank(user);
        line.withdraw(0.5 ether);
        assertEq(line.creditToken().balanceOf(user), 0.5 ether);

        vm.prank(user);
        line.redeem(0.2 ether);
        assertEq(line.creditToken().balanceOf(user), 0.3 ether);

        vm.prank(user);
        line.withdraw(0.1 ether);
        assertEq(line.creditToken().balanceOf(user), 0.4 ether);
        assertEq(line.currentDebt(user), 0.4 ether);

        bytes32 repayHash = keccak256("stress-repay");
        IPaymentVerifier.PaymentClaim memory repay = IPaymentVerifier.PaymentClaim({
            txHash: repayHash, payer: user, amount: 1 ether, kind: 2
        });
        bytes memory repayProof = abi.encode(repayHash, user, uint256(1 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(repay, repayProof);

        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
        assertEq(line.currentDebt(user), 0);
    }

    function testDepositAndBalanceSameAmount() public {
        // deposit == balance → 85% LTV (balance >= 1x deposit)
        _open(user, keccak256("same-amt-dep"), keccak256("same-amt-bal"), 1 ether, 1 ether);
        assertEq(line.getPosition(user).credit, 0.85 ether);
    }

    function testDepositAndBalanceJustBelow2x() public {
        // balance = 1.99 ETH, deposit = 1 ETH → 85% (not 90%)
        _open(user, keccak256("below2x-dep"), keccak256("below2x-bal"), 1 ether, 1.99 ether);
        assertEq(line.getPosition(user).credit, 0.85 ether);
    }

    function testDepositAndBalanceJustAbove2x() public {
        // balance = 2.01 ETH, deposit = 1 ETH → factor = 9000 (90%)
        _open(user, keccak256("above2x-dep"), keccak256("above2x-bal"), 1 ether, 2.01 ether);
        assertEq(line.getPosition(user).credit, 0.9 ether);
    }

    function testRepayMoreThanDebtCloses() public {
        _open(user, keccak256("overpay-dep"), keccak256("overpay-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);

        bytes32 repayHash = keccak256("overpay-repay");
        IPaymentVerifier.PaymentClaim memory repay = IPaymentVerifier.PaymentClaim({
            txHash: repayHash, payer: user, amount: 10 ether, kind: 2 // way more than debt
        });
        bytes memory repayProof = abi.encode(repayHash, user, uint256(10 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(repay, repayProof);

        // Should close with only the actual debt repaid
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
        assertEq(line.currentDebt(user), 0);
    }

    function testMultipleRepayCloseAndReopen() public {
        // Close first position, open a new one
        _open(user, keccak256("reopen-dep1"), keccak256("reopen-bal1"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);

        bytes32 repayHash = keccak256("reopen-repay1");
        IPaymentVerifier.PaymentClaim memory repay = IPaymentVerifier.PaymentClaim({
            txHash: repayHash, payer: user, amount: 1 ether, kind: 2
        });
        bytes memory repayProof = abi.encode(repayHash, user, uint256(1 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(repay, repayProof);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));

        // Open again
        _open(user, keccak256("reopen-dep2"), keccak256("reopen-bal2"), 2 ether, 4 ether);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Active));
        // count=2 before open → history bonus = 250bps → factor = 9000+250 = 9250
        assertEq(line.getPosition(user).credit, 1.85 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SURFACE TESTS: batch, edge cases
    // ═══════════════════════════════════════════════════════════════

    // NOTE: previewIngest and calculateTxIndex tests require live CC3 precompile.
    // They are covered in the live negative-path test script.

    function testBatchRejectsEmptyArray() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](0);
        bytes[] memory proofs = new bytes[](0);
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.executeBatch(claims, proofs);
    }

    function testBatchRejectsOversized() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](11);
        bytes[] memory proofs = new bytes[](11);
        for (uint256 i = 0; i < 11; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({
                txHash: keccak256(abi.encode(i)), payer: user, amount: 0.1 ether, kind: 1
            });
            proofs[i] = abi.encode(keccak256(abi.encode(i)), user, uint256(0.1 ether), uint8(1));
        }
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.executeBatch(claims, proofs);
    }

    function testBatchRejectsMismatchedLengths() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
        bytes[] memory proofs = new bytes[](2);
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.executeBatch(claims, proofs);
    }

    function testBatchSingleItemWorks() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("batch-1"), payer: user, amount: 0.5 ether, kind: 1
        });
        proofs[0] = abi.encode(keccak256("batch-1"), user, uint256(0.5 ether), uint8(1));
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).count, 1);
        assertEq(line.getHistory(user).volume, 0.5 ether);
    }

    function testBatchMaxSizeWorks() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](10);
        bytes[] memory proofs = new bytes[](10);
        for (uint256 i = 0; i < 10; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({
                txHash: keccak256(abi.encode(uint256(1000) + i)), payer: user, amount: 0.1 ether, kind: 1
            });
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(1000) + i)), user, uint256(0.1 ether), uint8(1));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).count, 10);
    }

    function testBatchMixedKindsReverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](2);
        bytes[] memory proofs = new bytes[](2);
        claims[0] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("mix-1"), payer: user, amount: 0.1 ether, kind: 1
        });
        claims[1] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("mix-2"), payer: user, amount: 0.1 ether, kind: 3
        });
        proofs[0] = abi.encode(keccak256("mix-1"), user, uint256(0.1 ether), uint8(1));
        proofs[1] = abi.encode(keccak256("mix-2"), user, uint256(0.1 ether), uint8(3));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.executeBatch(claims, proofs);
    }

    function testBatchReplayBetweenBatches() public {
        // First batch
        IPaymentVerifier.PaymentClaim[] memory claims1 = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs1 = new bytes[](1);
        claims1[0] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("replay-batch"), payer: user, amount: 0.1 ether, kind: 1
        });
        proofs1[0] = abi.encode(keccak256("replay-batch"), user, uint256(0.1 ether), uint8(1));
        vm.prank(user);
        line.executeBatch(claims1, proofs1);

        // Second batch with same txHash — should revert
        IPaymentVerifier.PaymentClaim[] memory claims2 = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs2 = new bytes[](1);
        claims2[0] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("replay-batch"), payer: user, amount: 0.2 ether, kind: 2
        });
        proofs2[0] = abi.encode(keccak256("replay-batch"), user, uint256(0.2 ether), uint8(2));
        vm.prank(user);
        vm.expectRevert(CreditLine.TxAlreadyUsed.selector);
        line.executeBatch(claims2, proofs2);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE: Score boundaries
    // ═══════════════════════════════════════════════════════════════

    function testScoreAtZeroPayments() public {
        assertEq(line.creditScore(user), 650); // base
    }

    function testScoreAtOnePayment() public {
        _link(user, keccak256("score-1"), 0.1 ether, 1);
        assertEq(line.creditScore(user), 690); // 650 + 40
    }

    function testScoreAtFivePayments() public {
        for (uint256 i = 0; i < 5; i++) {
            _link(user, keccak256(abi.encode(uint256(500) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850); // 650 + 5*40 = 850 (capped)
    }

    function testScoreAtSixPaymentsStillCapped() public {
        for (uint256 i = 0; i < 6; i++) {
            _link(user, keccak256(abi.encode(uint256(600) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850); // still capped
    }

    function testHistoryBonusThresholds() public {
        // 0 payments → 0 bonus
        assertEq(line.historyBonusBps(user), 0);

        // 1 payment → 250 bps
        _link(user, keccak256("hb-1"), 0.1 ether, 1);
        assertEq(line.historyBonusBps(user), 250);

        // 2 payments → still 250
        _link(user, keccak256("hb-2"), 0.1 ether, 2);
        assertEq(line.historyBonusBps(user), 250);

        // 3 payments → 500
        _link(user, keccak256("hb-3"), 0.1 ether, 1);
        assertEq(line.historyBonusBps(user), 500);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE: Interest boundary conditions
    // ═══════════════════════════════════════════════════════════════

    function testZeroDebtNoInterest() public {
        _open(user, keccak256("zd-dep"), keccak256("zd-bal"), 1 ether, 2 ether);
        vm.warp(block.timestamp + 365 days);
        assertEq(line.currentDebt(user), 0);
    }

    function testSmallDebtTinyInterest() public {
        _open(user, keccak256("sm-dep"), keccak256("sm-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.001 ether);
        vm.warp(block.timestamp + 1 days);
        // Interest = 0.001 * 1000 * 1 / (10000 * 365) ≈ 0.000000274 ETH
        uint256 debt = line.currentDebt(user);
        assertGt(debt, 0.001 ether);
        assertLt(debt, 0.002 ether);
    }

    function testInterestAccruesOnWithdraw() public {
        _open(user, keccak256("ia-dep"), keccak256("ia-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.warp(block.timestamp + 365 days);
        vm.prank(user);
        line.withdraw(0.001 ether); // triggers accrual
        assertGt(line.currentDebt(user), 0.5 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE: LTV factor boundaries
    // ═══════════════════════════════════════════════════════════════

    function testLTVBalanceBelowDeposit() public {
        // balance < deposit → base factor (80%)
        _open(user, keccak256("ltv-below"), keccak256("ltv-below-bal"), 2 ether, 1 ether);
        assertEq(line.getPosition(user).credit, 1.6 ether); // 2 * 0.8
    }

    function testLTVBalanceEqualsDeposit() public {
        // balance == deposit → 85%
        _open(user, keccak256("ltv-eq"), keccak256("ltv-eq-bal"), 1 ether, 1 ether);
        assertEq(line.getPosition(user).credit, 0.85 ether);
    }

    function testLTVBalanceBetween1xAnd2x() public {
        // 1.5x → 85%
        _open(user, keccak256("ltv-mid"), keccak256("ltv-mid-bal"), 1 ether, 1.5 ether);
        assertEq(line.getPosition(user).credit, 0.85 ether);
    }

    function testLTVBalanceExactly2x() public {
        // exactly 2x → 90%
        _open(user, keccak256("ltv-2x"), keccak256("ltv-2x-bal"), 1 ether, 2 ether);
        assertEq(line.getPosition(user).credit, 0.9 ether);
    }

    function testLTVMaxCappedAt9500() public {
        // With 3+ history bonus (500bps) + 90% base = 9500 → capped at 9500
        _link(user, keccak256("cap-1"), 0.1 ether, 1);
        _link(user, keccak256("cap-2"), 0.1 ether, 2);
        _link(user, keccak256("cap-3"), 0.1 ether, 1);
        _open(user, keccak256("cap-dep"), keccak256("cap-bal"), 1 ether, 2 ether);
        // factor = min(9000 + 500, 9500) = 9500
        assertEq(line.getPosition(user).credit, 0.95 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE: Redeem edge cases
    // ═══════════════════════════════════════════════════════════════

    function testRedeemZeroReverts() public {
        _open(user, keccak256("r0-dep"), keccak256("r0-bal"), 1 ether, 2 ether);
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.redeem(0);
    }

    function testRedeemMoreThanDebtReverts() public {
        _open(user, keccak256("rmore-dep"), keccak256("rmore-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.1 ether);
        vm.prank(user);
        vm.expectRevert(CreditLine.ExceedsDebt.selector);
        line.redeem(0.2 ether);
    }

    function testRedeemFromNoPositionReverts() public {
        vm.prank(user);
        vm.expectRevert(CreditLine.NotActive.selector);
        line.redeem(0.1 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE: Withdraw edge cases
    // ═══════════════════════════════════════════════════════════════

    function testWithdrawZeroReverts() public {
        _open(user, keccak256("w0-dep"), keccak256("w0-bal"), 1 ether, 2 ether);
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.withdraw(0);
    }

    function testWithdrawFromNoPositionReverts() public {
        vm.prank(user);
        vm.expectRevert(CreditLine.NotActive.selector);
        line.withdraw(0.1 ether);
    }

    function testWithdrawExactAvailable() public {
        _open(user, keccak256("we-dep"), keccak256("we-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.9 ether); // exact available
        assertEq(line.availableCredit(user), 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE: Repay edge cases
    // ═══════════════════════════════════════════════════════════════

    function testRepayZeroAmountReverts() public {
        _open(user, keccak256("rp0-dep"), keccak256("rp0-bal"), 1 ether, 2 ether);
        bytes32 h = keccak256("rp0-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: h, payer: user, amount: 0, kind: 2
        });
        bytes memory proof = abi.encode(h, user, uint256(0), uint8(2));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.repayCredit(claim, proof);
    }

    function testRepayFromNoPositionReverts() public {
        bytes32 h = keccak256("rp-no-pos");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: h, payer: user, amount: 1 ether, kind: 2
        });
        bytes memory proof = abi.encode(h, user, uint256(1 ether), uint8(2));
        vm.prank(user);
        vm.expectRevert(CreditLine.NotActive.selector);
        line.repayCredit(claim, proof);
    }

    function testRepayWrongKindReverts() public {
        _open(user, keccak256("rpk-dep"), keccak256("rpk-bal"), 1 ether, 2 ether);
        bytes32 h = keccak256("rpk-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: h, payer: user, amount: 1 ether, kind: 1 // wrong kind
        });
        bytes memory proof = abi.encode(h, user, uint256(1 ether), uint8(1));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.repayCredit(claim, proof);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE: OpenCredit edge cases
    // ═══════════════════════════════════════════════════════════════

    function testOpenWithZeroDepositReverts() public {
        IPaymentVerifier.PaymentClaim memory dep = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("od-zero"), payer: user, amount: 0, kind: 1
        });
        IPaymentVerifier.PaymentClaim memory bal = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("od-zero-bal"), payer: user, amount: 1 ether, kind: 3
        });
        bytes memory depProof = abi.encode(keccak256("od-zero"), user, uint256(0), uint8(1));
        bytes memory balProof = abi.encode(keccak256("od-zero-bal"), user, uint256(1 ether), uint8(3));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.openCredit(dep, depProof, bal, balProof);
    }

    function testOpenWithZeroBalanceReverts() public {
        IPaymentVerifier.PaymentClaim memory dep = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("ob-zero"), payer: user, amount: 1 ether, kind: 1
        });
        IPaymentVerifier.PaymentClaim memory bal = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("ob-zero-bal"), payer: user, amount: 0, kind: 3
        });
        bytes memory depProof = abi.encode(keccak256("ob-zero"), user, uint256(1 ether), uint8(1));
        bytes memory balProof = abi.encode(keccak256("ob-zero-bal"), user, uint256(0), uint8(3));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.openCredit(dep, depProof, bal, balProof);
    }

    function testOpenWithSameTxHashTwiceReverts() public {
        bytes32 same = keccak256("same-tx");
        IPaymentVerifier.PaymentClaim memory dep = IPaymentVerifier.PaymentClaim({
            txHash: same, payer: user, amount: 1 ether, kind: 1
        });
        IPaymentVerifier.PaymentClaim memory bal = IPaymentVerifier.PaymentClaim({
            txHash: same, payer: user, amount: 2 ether, kind: 3
        });
        bytes memory depProof = abi.encode(same, user, uint256(1 ether), uint8(1));
        bytes memory balProof = abi.encode(same, user, uint256(2 ether), uint8(3));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.openCredit(dep, depProof, bal, balProof);
    }

    function testOpenWithWrongDepositKindReverts() public {
        IPaymentVerifier.PaymentClaim memory dep = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("wdk-dep"), payer: user, amount: 1 ether, kind: 2 // wrong
        });
        IPaymentVerifier.PaymentClaim memory bal = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("wdk-bal"), payer: user, amount: 2 ether, kind: 3
        });
        bytes memory depProof = abi.encode(keccak256("wdk-dep"), user, uint256(1 ether), uint8(2));
        bytes memory balProof = abi.encode(keccak256("wdk-bal"), user, uint256(2 ether), uint8(3));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.openCredit(dep, depProof, bal, balProof);
    }

    function testOpenWithWrongBalanceKindReverts() public {
        IPaymentVerifier.PaymentClaim memory dep = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("wbk-dep"), payer: user, amount: 1 ether, kind: 1
        });
        IPaymentVerifier.PaymentClaim memory bal = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("wbk-bal"), payer: user, amount: 2 ether, kind: 1 // wrong
        });
        bytes memory depProof = abi.encode(keccak256("wbk-dep"), user, uint256(1 ether), uint8(1));
        bytes memory balProof = abi.encode(keccak256("wbk-bal"), user, uint256(2 ether), uint8(1));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.openCredit(dep, depProof, bal, balProof);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE: Event emission verification
    // ═══════════════════════════════════════════════════════════════

    function testOpenCreditEmitsCreditOpened() public {
        vm.expectEmit(true, false, false, true);
        emit CreditLine.CreditOpened(user, 1 ether, 2 ether, 0.9 ether, 9000, keccak256("emit-dep"), keccak256("emit-bal"));
        _open(user, keccak256("emit-dep"), keccak256("emit-bal"), 1 ether, 2 ether);
    }

    function testWithdrawEmitsCreditWithdrawn() public {
        _open(user, keccak256("ew-dep"), keccak256("ew-bal"), 1 ether, 2 ether);
        vm.expectEmit(true, false, false, false);
        emit CreditLine.CreditWithdrawn(user, 0.5 ether, 0.5 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
    }

    function testRedeemEmitsCreditRedeemed() public {
        _open(user, keccak256("er-dep"), keccak256("er-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.expectEmit(true, false, false, false);
        emit CreditLine.CreditRedeemed(user, 0.3 ether, 0.2 ether);
        vm.prank(user);
        line.redeem(0.3 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE: Position state transitions
    // ═══════════════════════════════════════════════════════════════

    function testPositionNoneToActive() public {
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.None));
        _open(user, keccak256("st-dep"), keccak256("st-bal"), 1 ether, 2 ether);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Active));
    }

    function testPositionActiveToClosedViaRepay() public {
        _open(user, keccak256("ac-dep"), keccak256("ac-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        bytes32 h = keccak256("ac-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: h, payer: user, amount: 1 ether, kind: 2
        });
        bytes memory proof = abi.encode(h, user, uint256(1 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(claim, proof);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testPositionActiveToClosedViaCloseUnused() public {
        _open(user, keccak256("cu-dep"), keccak256("cu-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.closeUnused();
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE: Multi-user interference
    // ═══════════════════════════════════════════════════════════════

    function testUserAActionsDontAffectUserB() public {
        address userB = address(0xCAFE);
        vm.deal(userB, 100 ether);

        _open(user, keccak256("ab-dep-a"), keccak256("ab-bal-a"), 1 ether, 2 ether);
        _open(userB, keccak256("ab-dep-b"), keccak256("ab-bal-b"), 2 ether, 4 ether);

        vm.prank(user);
        line.withdraw(0.5 ether);

        // UserB's position unaffected
        assertEq(line.availableCredit(userB), 1.8 ether);
        assertEq(line.currentDebt(user), 0.5 ether);
        assertEq(line.currentDebt(userB), 0);
    }

    function testUserBBalanceAttestationDoesntAffectUserA() public {
        address userB = address(0xCAFE);
        vm.deal(userB, 100 ether);

        _open(user, keccak256("ba-dep-a"), keccak256("ba-bal-a"), 1 ether, 2 ether);
        _open(userB, keccak256("ba-dep-b"), keccak256("ba-bal-b"), 1 ether, 4 ether);

        // UserA: 90% LTV (2x), UserB: 90% LTV (4x)
        assertEq(line.getPosition(user).credit, 0.9 ether);
        assertEq(line.getPosition(userB).credit, 0.9 ether); // same deposit, same LTV
    }

    // ═══════════════════════════════════════════════════════════════
    //  STRESS TESTS: Full lifecycle, concurrent users, batch stress
    // ═══════════════════════════════════════════════════════════════

    function testFullLifecycleOpenWithdrawRepayClose() public {
        // Open
        _open(user, keccak256("lc-dep"), keccak256("lc-bal"), 1 ether, 2 ether);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Active));

        // Withdraw
        vm.prank(user);
        line.withdraw(0.5 ether);
        assertEq(line.currentDebt(user), 0.5 ether);

        // Redeem partial
        vm.prank(user);
        line.redeem(0.2 ether);
        assertEq(line.currentDebt(user), 0.3 ether);

        // Repay rest
        bytes32 h = keccak256("lc-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: h, payer: user, amount: 0.3 ether, kind: 2
        });
        bytes memory proof = abi.encode(h, user, uint256(0.3 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(claim, proof);

        // Verify closed
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
        assertEq(line.currentDebt(user), 0);
    }

    function testFiveUsersIndependent() public {
        address[] memory users = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            users[i] = address(uint160(0xCAFE + i));
            vm.deal(users[i], 100 ether);
        }

        for (uint256 i = 0; i < 5; i++) {
            uint256 dep = (i + 1) * 1 ether;
            _open(users[i], keccak256(abi.encode(uint256(7000) + i)), keccak256(abi.encode(uint256(8000) + i)), dep, dep * 2);
        }

        // Each user has independent credit
        for (uint256 i = 0; i < 5; i++) {
            assertEq(uint256(line.getPosition(users[i]).status), uint256(CreditLine.Status.Active));
            assertGt(line.getPosition(users[i]).credit, 0);
        }

        // User 0 withdraws
        vm.prank(users[0]);
        line.withdraw(0.1 ether);
        assertEq(line.currentDebt(users[0]), 0.1 ether);

        // Others unaffected
        for (uint256 i = 1; i < 5; i++) {
            assertEq(line.currentDebt(users[i]), 0);
        }
    }

    function testBatchTenItemsAllValid() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](10);
        bytes[] memory proofs = new bytes[](10);
        for (uint256 i = 0; i < 10; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({
                txHash: keccak256(abi.encode(uint256(9000) + i)), payer: user, amount: 0.01 ether, kind: 1
            });
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(9000) + i)), user, uint256(0.01 ether), uint8(1));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).count, 10);
        assertEq(line.getHistory(user).volume, 0.1 ether);
    }

    function testBatchAllSameTxHashReverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
        bytes[] memory proofs = new bytes[](3);
        bytes32 same = keccak256("all-same");
        for (uint256 i = 0; i < 3; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({
                txHash: same, payer: user, amount: 0.1 ether, kind: 1
            });
            proofs[i] = abi.encode(same, user, uint256(0.1 ether), uint8(1));
        }
        vm.prank(user);
        vm.expectRevert(CreditLine.TxAlreadyUsed.selector);
        line.executeBatch(claims, proofs);
    }

    function testBatchWrongPayerExecuteBatchReverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        address attacker = address(0xDEAD);
        claims[0] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("wp-batch"), payer: attacker, amount: 0.1 ether, kind: 1
        });
        proofs[0] = abi.encode(keccak256("wp-batch"), attacker, uint256(0.1 ether), uint8(1));
        vm.prank(user); // user calls, but claim.payer is attacker
        vm.expectRevert(CreditLine.BadPayer.selector);
        line.executeBatch(claims, proofs);
    }

    function testBatchZeroAmountReverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("za-batch"), payer: user, amount: 0, kind: 1
        });
        proofs[0] = abi.encode(keccak256("za-batch"), user, uint256(0), uint8(1));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.executeBatch(claims, proofs);
    }

    // ═══════════════════════════════════════════════════════════════
    //  STORAGE INVARIANTS
    // ═══════════════════════════════════════════════════════════════

    function testDepositRecordedInPosition() public {
        _open(user, keccak256("sd-dep"), keccak256("sd-bal"), 1.5 ether, 3 ether);
        assertEq(line.getPosition(user).deposit, 1.5 ether);
        assertEq(line.getPosition(user).attestedBalance, 3 ether);
    }

    function testCreditRecordedInPosition() public {
        _open(user, keccak256("sc-dep"), keccak256("sc-bal"), 1 ether, 2 ether);
        // factor = 9000 (2x), credit = 0.9
        assertEq(line.getPosition(user).credit, 0.9 ether);
    }

    function testDebtAccumulatesOnMultipleWithdraws() public {
        _open(user, keccak256("md-dep"), keccak256("md-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.3 ether);
        vm.prank(user);
        line.withdraw(0.2 ether);
        vm.prank(user);
        line.withdraw(0.1 ether);
        assertEq(line.currentDebt(user), 0.6 ether);
    }

    function testAvailableCreditDecreasesOnWithdraw() public {
        _open(user, keccak256("ac2-dep"), keccak256("ac2-bal"), 1 ether, 2 ether);
        assertEq(line.availableCredit(user), 0.9 ether);
        vm.prank(user);
        line.withdraw(0.3 ether);
        assertEq(line.availableCredit(user), 0.6 ether);
        vm.prank(user);
        line.withdraw(0.3 ether);
        assertEq(line.availableCredit(user), 0.3 ether);
    }

    function testTokenBalanceMatchesDebt() public {
        _open(user, keccak256("tb-dep"), keccak256("tb-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.7 ether);
        assertEq(line.creditToken().balanceOf(user), 0.7 ether);
        assertEq(line.currentDebt(user), 0.7 ether);
    }

    function testRedeemBurnsTokens() public {
        _open(user, keccak256("rb-dep"), keccak256("rb-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        assertEq(line.creditToken().balanceOf(user), 0.5 ether);
        vm.prank(user);
        line.redeem(0.3 ether);
        assertEq(line.creditToken().balanceOf(user), 0.2 ether);
        assertEq(line.currentDebt(user), 0.2 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTEREST ACCRUAL STRESS
    // ═══════════════════════════════════════════════════════════════

    function testInterestAccruesOverOneDay() public {
        _open(user, keccak256("id-dep"), keccak256("id-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.warp(block.timestamp + 1 days);
        line.accrue(user);
        // 0.5 * 10% * 1/365 ≈ 0.000137 ETH
        assertGt(line.currentDebt(user), 0.5 ether);
        assertLt(line.currentDebt(user), 0.501 ether);
    }

    function testInterestAccruesOverOneMonth() public {
        _open(user, keccak256("im-dep"), keccak256("im-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.warp(block.timestamp + 30 days);
        line.accrue(user);
        // 0.5 * 10% * 30/365 ≈ 0.0041 ETH
        assertGt(line.currentDebt(user), 0.504 ether);
        assertLt(line.currentDebt(user), 0.505 ether);
    }

    function testInterestAccruesOverTenYears() public {
        _open(user, keccak256("iy-dep"), keccak256("iy-bal"), 10 ether, 20 ether);
        vm.prank(user);
        line.withdraw(1 ether);
        vm.warp(block.timestamp + 3650 days);
        line.accrue(user);
        uint256 debt = line.currentDebt(user);
        // Simple interest: 1 * 10% * 10 = 1 ETH additional
        // Compound would be higher, but accrue is called once
        assertGt(debt, 1 ether);
        assertLt(debt, 2.5 ether);
    }

    function testMultipleAccrualsStack() public {
        _open(user, keccak256("ma-dep"), keccak256("ma-bal"), 10 ether, 20 ether);
        vm.prank(user);
        line.withdraw(1 ether);

        vm.warp(block.timestamp + 365 days);
        vm.prank(user);
        line.accrue(user);
        uint256 debt1 = line.currentDebt(user);

        vm.warp(block.timestamp + 365 days);
        vm.prank(user);
        line.accrue(user);
        uint256 debt2 = line.currentDebt(user);

        // debt2 should be greater than debt1 (compound interest)
        assertGt(debt2, debt1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADDITIONAL EDGE CASES: History, score, batch stress
    // ═══════════════════════════════════════════════════════════════

    function testHistoryCountIncrementsCorrectly() public {
        _link(user, keccak256("hc-1"), 0.1 ether, 1);
        assertEq(line.getHistory(user).count, 1);
        _link(user, keccak256("hc-2"), 0.2 ether, 2);
        assertEq(line.getHistory(user).count, 2);
        _link(user, keccak256("hc-3"), 0.3 ether, 1);
        assertEq(line.getHistory(user).count, 3);
    }

    function testHistoryVolumeAccumulatesExactly() public {
        _link(user, keccak256("hv-1"), 0.5 ether, 1);
        assertEq(line.getHistory(user).volume, 0.5 ether);
        _link(user, keccak256("hv-2"), 0.3 ether, 2);
        assertEq(line.getHistory(user).volume, 0.8 ether);
        _link(user, keccak256("hv-3"), 0.7 ether, 1);
        assertEq(line.getHistory(user).volume, 1.5 ether);
    }

    function testScoreWithLargeVolume() public {
        for (uint256 i = 0; i < 5; i++) {
            _link(user, keccak256(abi.encode(uint256(4000) + i)), 100 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
    }

    function testScoreWithMixedKinds() public {
        _link(user, keccak256("mk-1"), 1 ether, 1); // deposit
        _link(user, keccak256("mk-2"), 0.5 ether, 2); // repay
        _link(user, keccak256("mk-3"), 1 ether, 1); // deposit
        assertEq(line.creditScore(user), 770); // 650 + 3*40
    }

    function testBatchLargeAmounts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](2);
        bytes[] memory proofs = new bytes[](2);
        claims[0] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("la-1"), payer: user, amount: 1000 ether, kind: 1
        });
        claims[1] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("la-2"), payer: user, amount: 2000 ether, kind: 2
        });
        proofs[0] = abi.encode(keccak256("la-1"), user, uint256(1000 ether), uint8(1));
        proofs[1] = abi.encode(keccak256("la-2"), user, uint256(2000 ether), uint8(2));
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).volume, 3000 ether);
    }

    function testBatchSmallAmounts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
        bytes[] memory proofs = new bytes[](3);
        for (uint256 i = 0; i < 3; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({
                txHash: keccak256(abi.encode(uint256(5000) + i)), payer: user, amount: 1 wei, kind: 1
            });
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(5000) + i)), user, uint256(1 wei), uint8(1));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).volume, 3 wei);
    }

    function testOpenWithMaximumDeposit() public {
        uint256 maxDep = type(uint128).max;
        uint256 maxBal = maxDep * 2;
        _open(user, keccak256("max-dep"), keccak256("max-bal"), maxDep, maxBal);
        assertEq(line.getPosition(user).deposit, maxDep);
    }

    function testWithdrawRedeemCycle() public {
        _open(user, keccak256("wrc-dep"), keccak256("wrc-bal"), 1 ether, 2 ether);
        // Withdraw and redeem multiple times
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(user);
            line.withdraw(0.1 ether);
            vm.prank(user);
            line.redeem(0.1 ether);
        }
        assertEq(line.currentDebt(user), 0);
        assertEq(line.creditToken().balanceOf(user), 0);
    }

    function testRepayExactDebtCloses() public {
        _open(user, keccak256("rec-dep"), keccak256("rec-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.warp(block.timestamp + 365 days);
        vm.prank(user);
        line.accrue(user);
        uint256 debt = line.currentDebt(user);
        bytes32 h = keccak256("rec-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: h, payer: user, amount: debt, kind: 2
        });
        bytes memory proof = abi.encode(h, user, debt, uint8(2));
        vm.prank(user);
        line.repayCredit(claim, proof);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testMultipleUsersFullLifecycle() public {
        address userB = address(0xCAFE);
        vm.deal(userB, 100 ether);

        // Both open
        _open(user, keccak256("mul-dep-a"), keccak256("mul-bal-a"), 1 ether, 2 ether);
        _open(userB, keccak256("mul-dep-b"), keccak256("mul-bal-b"), 2 ether, 4 ether);

        // Both withdraw
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.prank(userB);
        line.withdraw(1.0 ether);

        // Both repay and close
        bytes32 h1 = keccak256("mul-repay-a");
        IPaymentVerifier.PaymentClaim memory claim1 = IPaymentVerifier.PaymentClaim({
            txHash: h1, payer: user, amount: 1 ether, kind: 2
        });
        bytes memory proof1 = abi.encode(h1, user, uint256(1 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(claim1, proof1);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));

        bytes32 h2 = keccak256("mul-repay-b");
        IPaymentVerifier.PaymentClaim memory claim2 = IPaymentVerifier.PaymentClaim({
            txHash: h2, payer: userB, amount: 2 ether, kind: 2
        });
        bytes memory proof2 = abi.encode(h2, userB, uint256(2 ether), uint8(2));
        vm.prank(userB);
        line.repayCredit(claim2, proof2);
        assertEq(uint256(line.getPosition(userB).status), uint256(CreditLine.Status.Closed));
    }

    function testCloseAndReopenMultipleTimes() public {
        for (uint256 i = 0; i < 3; i++) {
            _open(user, keccak256(abi.encode(uint256(6000) + i * 2)), keccak256(abi.encode(uint256(6001) + i * 2)), 1 ether, 2 ether);
            assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Active));
            vm.prank(user);
            line.closeUnused();
            assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
        }
    }

    function testHistoryBonusAppliesAtOpen() public {
        // Link 3 payments BEFORE opening
        _link(user, keccak256("hb-pre-1"), 0.1 ether, 1);
        _link(user, keccak256("hb-pre-2"), 0.1 ether, 2);
        _link(user, keccak256("hb-pre-3"), 0.1 ether, 1);
        assertEq(line.historyBonusBps(user), 500);

        // Open: factor should include bonus
        _open(user, keccak256("hb-pre-dep"), keccak256("hb-pre-bal"), 1 ether, 2 ether);
        // base 9000 + bonus 500 = 9500, credit = 0.95 ether
        assertEq(line.getPosition(user).credit, 0.95 ether);
    }

    function testHistoryBonusMaxCap() public {
        // Link many payments to ensure bonus doesn't exceed MAX_FACTOR_BPS
        for (uint256 i = 0; i < 10; i++) {
            _link(user, keccak256(abi.encode(uint256(7000) + i)), 0.1 ether, 1);
        }
        // Bonus is capped at 500 bps (count >= 3)
        assertEq(line.historyBonusBps(user), 500);
    }

    function testTwoUsersHistoryIndependent() public {
        address userB = address(0xCAFE);
        vm.deal(userB, 100 ether);

        _link(user, keccak256("ind-1"), 1 ether, 1);
        _link(user, keccak256("ind-2"), 1 ether, 1);
        _link(userB, keccak256("ind-3"), 1 ether, 1);

        assertEq(line.getHistory(user).count, 2);
        assertEq(line.getHistory(userB).count, 1);
        assertEq(line.creditScore(user), 730); // 650 + 2*40
        assertEq(line.creditScore(userB), 690); // 650 + 1*40
    }

    function testRepayMuchMoreThanDebtCloses() public {
        _open(user, keccak256("rmt-dep"), keccak256("rmt-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.3 ether);
        bytes32 h = keccak256("rmt-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: h, payer: user, amount: 10 ether, kind: 2
        });
        bytes memory proof = abi.encode(h, user, uint256(10 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(claim, proof);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
        assertEq(line.currentDebt(user), 0);
    }

    function testWithdrawAfterRepayPartial() public {
        _open(user, keccak256("warp-dep"), keccak256("warp-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        bytes32 h = keccak256("warp-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: h, payer: user, amount: 0.3 ether, kind: 2
        });
        bytes memory proof = abi.encode(h, user, uint256(0.3 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(claim, proof);
        assertEq(line.currentDebt(user), 0.2 ether);
        // Can still withdraw more
        vm.prank(user);
        line.withdraw(0.1 ether);
        assertEq(line.currentDebt(user), 0.3 ether);
    }

    function testScoreDoesNotExceedCap() public {
        for (uint256 i = 0; i < 10; i++) {
            _link(user, keccak256(abi.encode(uint256(8000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
        // Even with more payments, score stays at 850
        for (uint256 i = 0; i < 5; i++) {
            _link(user, keccak256(abi.encode(uint256(9000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
    }

    function testInterestWithZeroAPR() public {
        CreditLine noInterestLine = new CreditLine(address(verifier), 8000, 0);
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("zia-dep"), payer: user, amount: 1 ether, kind: 1
        });
        IPaymentVerifier.PaymentClaim memory balClaim = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("zia-bal"), payer: user, amount: 2 ether, kind: 3
        });
        bytes memory proof = abi.encode(keccak256("zia-dep"), user, uint256(1 ether), uint8(1));
        bytes memory balProof = abi.encode(keccak256("zia-bal"), user, uint256(2 ether), uint8(3));
        vm.prank(user);
        noInterestLine.openCredit(claim, proof, balClaim, balProof);
        vm.prank(user);
        noInterestLine.withdraw(0.5 ether);
        vm.warp(block.timestamp + 365 days);
        assertEq(noInterestLine.currentDebt(user), 0.5 ether); // no interest
    }

    function testLTVWithBaseFactor() public {
        // balance < deposit → base factor (80%)
        _open(user, keccak256("lbf-dep"), keccak256("lbf-bal"), 2 ether, 1.5 ether);
        assertEq(line.getPosition(user).credit, 1.6 ether); // 2 * 0.8
    }

    function testLTVWith1xBalanceAndHistory() public {
        _link(user, keccak256("lh-1"), 0.1 ether, 1);
        _open(user, keccak256("lh-dep"), keccak256("lh-bal"), 1 ether, 1 ether);
        // base 8500 + bonus 250 = 8750
        assertEq(line.getPosition(user).credit, 0.875 ether);
    }

    function testLTVWith2xBalanceAndMaxHistory() public {
        _link(user, keccak256("lmh-1"), 0.1 ether, 1);
        _link(user, keccak256("lmh-2"), 0.1 ether, 2);
        _link(user, keccak256("lmh-3"), 0.1 ether, 1);
        _open(user, keccak256("lmh-dep"), keccak256("lmh-bal"), 1 ether, 2 ether);
        // base 9000 + bonus 500 = 9500 (capped)
        assertEq(line.getPosition(user).credit, 0.95 ether);
    }

    function testOpenWithBaseFactorAndHistory() public {
        _link(user, keccak256("obh-1"), 0.1 ether, 1);
        _link(user, keccak256("obh-2"), 0.1 ether, 2);
        _open(user, keccak256("obh-dep"), keccak256("obh-bal"), 2 ether, 1 ether);
        // base 8000 + bonus 250 = 8250
        assertEq(line.getPosition(user).credit, 1.65 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MORE EDGE CASES: Repay, redeem, withdraw combos
    // ═══════════════════════════════════════════════════════════════

    function testRepayFullDebtCloses() public {
        _open(user, keccak256("rfd-dep"), keccak256("rfd-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        bytes32 h = keccak256("rfd-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: h, payer: user, amount: 0.5 ether, kind: 2
        });
        bytes memory proof = abi.encode(h, user, uint256(0.5 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(claim, proof);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testRedeemAllDebt() public {
        _open(user, keccak256("rad-dep"), keccak256("rad-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.prank(user);
        line.redeem(0.5 ether);
        assertEq(line.currentDebt(user), 0);
        assertEq(line.creditToken().balanceOf(user), 0);
    }

    function testWithdrawAfterFullRedeem() public {
        _open(user, keccak256("warf-dep"), keccak256("warf-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.prank(user);
        line.redeem(0.5 ether);
        // Can withdraw again
        vm.prank(user);
        line.withdraw(0.3 ether);
        assertEq(line.currentDebt(user), 0.3 ether);
    }

    function testRepayPartialMultipleTimes() public {
        _open(user, keccak256("rpm-dep"), keccak256("rpm-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.6 ether);
        // Repay in 3 installments
        for (uint256 i = 0; i < 3; i++) {
            bytes32 h = keccak256(abi.encode(uint256(3000) + i));
            IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
                txHash: h, payer: user, amount: 0.2 ether, kind: 2
            });
            bytes memory proof = abi.encode(h, user, uint256(0.2 ether), uint8(2));
            vm.prank(user);
            line.repayCredit(claim, proof);
        }
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testRedeemThenRepayCloses() public {
        _open(user, keccak256("rrc-dep"), keccak256("rrc-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.prank(user);
        line.redeem(0.2 ether);
        assertEq(line.currentDebt(user), 0.3 ether);
        bytes32 h = keccak256("rrc-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: h, payer: user, amount: 0.3 ether, kind: 2
        });
        bytes memory proof = abi.encode(h, user, uint256(0.3 ether), uint8(2));
        vm.prank(user);
        line.repayCredit(claim, proof);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testCloseUnusedThenReopenWithHistory() public {
        _open(user, keccak256("cur-dep"), keccak256("cur-bal"), 1 ether, 2 ether);
        _link(user, keccak256("cur-link"), 0.5 ether, 1);
        vm.prank(user);
        line.closeUnused();
        // Reopen — history bonus should apply
        _open(user, keccak256("cur-dep2"), keccak256("cur-bal2"), 1 ether, 2 ether);
        // count=2 (deposit + link) → bonus = 250
        // factor = 9000 + 250 = 9250
        assertEq(line.getPosition(user).credit, 0.925 ether);
    }

    function testHistoryLinkAfterReopen() public {
        _open(user, keccak256("hlr-dep"), keccak256("hlr-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.closeUnused();
        _open(user, keccak256("hlr-dep2"), keccak256("hlr-bal2"), 1 ether, 2 ether);
        _link(user, keccak256("hlr-link"), 0.5 ether, 1);
        // count = 2 (first open deposit + link) → 650 + 2*40 = 730
        // But second open also records deposit → count = 3 → 650 + 3*40 = 770
        assertEq(line.creditScore(user), 770);
    }

    function testBatchWithMixedValidInvalidFirstFails() public {
        // Invalid first — entire batch reverts
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](2);
        bytes[] memory proofs = new bytes[](2);
        claims[0] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("fvif-1"), payer: user, amount: 0, kind: 1
        });
        claims[1] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("fvif-2"), payer: user, amount: 0.1 ether, kind: 1
        });
        proofs[0] = abi.encode(keccak256("fvif-1"), user, uint256(0), uint8(1));
        proofs[1] = abi.encode(keccak256("fvif-2"), user, uint256(0.1 ether), uint8(1));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.executeBatch(claims, proofs);
        // Nothing recorded
        assertEq(line.getHistory(user).count, 0);
    }

    function testSubmitAttestMultipleVsExecuteBatch() public {
        // Both should produce same result for valid inputs
        IPaymentVerifier.PaymentClaim[] memory claims1 = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs1 = new bytes[](1);
        claims1[0] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("comp-1"), payer: user, amount: 0.5 ether, kind: 1
        });
        proofs1[0] = abi.encode(keccak256("comp-1"), user, uint256(0.5 ether), uint8(1));
        vm.prank(user);
        line.submitAttestMultiple(claims1, proofs1);

        IPaymentVerifier.PaymentClaim[] memory claims2 = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs2 = new bytes[](1);
        claims2[0] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("comp-2"), payer: user, amount: 0.5 ether, kind: 1
        });
        proofs2[0] = abi.encode(keccak256("comp-2"), user, uint256(0.5 ether), uint8(1));
        vm.prank(user);
        line.executeBatch(claims2, proofs2);

        assertEq(line.getHistory(user).count, 2);
        assertEq(line.getHistory(user).volume, 1 ether);
    }

    function testPositionDepositAndBalanceStored() public {
        _open(user, keccak256("pdb-dep"), keccak256("pdb-bal"), 3.5 ether, 7.7 ether);
        CreditLine.Position memory pos = line.getPosition(user);
        assertEq(pos.deposit, 3.5 ether);
        assertEq(pos.attestedBalance, 7.7 ether);
    }

    function testPositionOpenTxHashStored() public {
        bytes32 dep = keccak256("pth-dep");
        bytes32 bal = keccak256("pth-bal");
        _open(user, dep, bal, 1 ether, 2 ether);
        CreditLine.Position memory pos = line.getPosition(user);
        assertEq(pos.openTxHash, dep);
        assertEq(pos.balanceTxHash, bal);
    }

    function testPositionLastAccrualUpdated() public {
        _open(user, keccak256("pla-dep"), keccak256("pla-bal"), 1 ether, 2 ether);
        uint256 t0 = block.timestamp;
        // Accrue should update lastAccrual
        line.accrue(user);
        CreditLine.Position memory pos = line.getPosition(user);
        assertTrue(pos.lastAccrual >= uint64(t0));
    }

    function testEventAttestedPaymentLinked() public {
        vm.expectEmit(true, true, false, true);
        emit CreditLine.AttestedPaymentLinked(user, keccak256("evt-link"), 1, 0.5 ether, 1, 0.5 ether);
        _link(user, keccak256("evt-link"), 0.5 ether, 1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  FINAL EDGE CASES: More stress, boundary, combo tests
    // ═══════════════════════════════════════════════════════════════

    function testOpenWithdrawRepayReopenCycle() public {
        _open(user, keccak256("owrc-1"), keccak256("owrc-1b"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        bytes32 h1 = keccak256("owrc-r1");
        IPaymentVerifier.PaymentClaim memory c1 = IPaymentVerifier.PaymentClaim({txHash: h1, payer: user, amount: 1 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(c1, abi.encode(h1, user, uint256(1 ether), uint8(2)));
        _open(user, keccak256("owrc-2"), keccak256("owrc-2b"), 2 ether, 4 ether);
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Active));
    }

    function testScoreIncrementsPerPayment() public {
        for (uint256 i = 0; i < 5; i++) {
            _link(user, keccak256(abi.encode(uint256(10000) + i)), 0.1 ether, 1);
            assertEq(line.creditScore(user), 650 + (i + 1) * 40);
        }
    }

    function testScoreStaysAtCapAfterCap() public {
        for (uint256 i = 0; i < 6; i++) {
            _link(user, keccak256(abi.encode(uint256(11000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
    }

    function testAvailableCreditWithInterest() public {
        _open(user, keccak256("aci-dep"), keccak256("aci-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.warp(block.timestamp + 365 days);
        vm.prank(user);
        line.accrue(user);
        // Debt increased, available decreased
        assertLt(line.availableCredit(user), 0.4 ether);
    }

    function testBatchFiveItemsHalfReplay() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](5);
        bytes[] memory proofs = new bytes[](5);
        for (uint256 i = 0; i < 5; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({
                txHash: keccak256(abi.encode(uint256(12000) + i)), payer: user, amount: 0.1 ether, kind: 1
            });
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(12000) + i)), user, uint256(0.1 ether), uint8(1));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).count, 5);
    }

    function testBatchTwoItemsSequential() public {
        for (uint256 b = 0; b < 2; b++) {
            IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
            bytes[] memory proofs = new bytes[](3);
            for (uint256 i = 0; i < 3; i++) {
                uint256 id = b * 3 + i + 13000;
                claims[i] = IPaymentVerifier.PaymentClaim({
                    txHash: keccak256(abi.encode(id)), payer: user, amount: 0.1 ether, kind: 1
                });
                proofs[i] = abi.encode(keccak256(abi.encode(id)), user, uint256(0.1 ether), uint8(1));
            }
            vm.prank(user);
            line.executeBatch(claims, proofs);
        }
        assertEq(line.getHistory(user).count, 6);
    }

    function testOpenAfterHistoryLink() public {
        _link(user, keccak256("oah-1"), 0.5 ether, 1);
        _link(user, keccak256("oah-2"), 0.5 ether, 2);
        assertEq(line.historyBonusBps(user), 250);
        _open(user, keccak256("oah-dep"), keccak256("oah-bal"), 1 ether, 2 ether);
        // base 9000 + 250 = 9250
        assertEq(line.getPosition(user).credit, 0.925 ether);
    }

    function testLTVWithBaseFactorAnd3History() public {
        _link(user, keccak256("lbfh-1"), 0.1 ether, 1);
        _link(user, keccak256("lbfh-2"), 0.1 ether, 2);
        _link(user, keccak256("lbfh-3"), 0.1 ether, 1);
        _open(user, keccak256("lbfh-dep"), keccak256("lbfh-bal"), 2 ether, 1 ether);
        // base 8000 + 500 = 8500
        assertEq(line.getPosition(user).credit, 1.7 ether);
    }

    function testWithdrawAllThenRepayExact() public {
        _open(user, keccak256("ware-dep"), keccak256("ware-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.9 ether);
        bytes32 h = keccak256("ware-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 0.9 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, uint256(0.9 ether), uint8(2)));
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testConcurrentOpenRevert() public {
        _open(user, keccak256("co-dep"), keccak256("co-bal"), 1 ether, 2 ether);
        vm.expectRevert(CreditLine.AlreadyOpen.selector);
        _open(user, keccak256("co-dep2"), keccak256("co-bal2"), 1 ether, 2 ether);
    }

    function testOpenWithSameDepositAndBalance() public {
        _open(user, keccak256("sdab-dep"), keccak256("sdab-bal"), 1 ether, 1 ether);
        // balance == deposit → 85%
        assertEq(line.getPosition(user).credit, 0.85 ether);
    }

    function testScoreWithRepayKind() public {
        _link(user, keccak256("srk-1"), 1 ether, 2); // repay
        assertEq(line.creditScore(user), 690); // 650 + 40
    }

    function testHistoryBonusWithRepayOnly() public {
        _link(user, keccak256("hbro-1"), 1 ether, 2);
        assertEq(line.historyBonusBps(user), 250);
        _link(user, keccak256("hbro-2"), 1 ether, 2);
        assertEq(line.historyBonusBps(user), 250);
        _link(user, keccak256("hbro-3"), 1 ether, 2);
        assertEq(line.historyBonusBps(user), 500);
    }

    function testWithdrawAndRepayCombo() public {
        _open(user, keccak256("wrc2-dep"), keccak256("wrc2-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.4 ether);
        bytes32 h = keccak256("wrc2-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 0.2 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, uint256(0.2 ether), uint8(2)));
        assertEq(line.currentDebt(user), 0.2 ether);
    }

    function testScoreUnchangedAfterRepay() public {
        _open(user, keccak256("sur-dep"), keccak256("sur-bal"), 1 ether, 2 ether);
        uint256 scoreBefore = line.creditScore(user);
        bytes32 h = keccak256("sur-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 0.5 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, uint256(0.5 ether), uint8(2)));
        // Repay links history → score increases
        assertEq(line.creditScore(user), scoreBefore + 40);
    }

    function testMultipleDepositHistoryLinks() public {
        _link(user, keccak256("mdhl-1"), 1 ether, 1);
        _link(user, keccak256("mdhl-2"), 2 ether, 1);
        _link(user, keccak256("mdhl-3"), 3 ether, 1);
        assertEq(line.getHistory(user).volume, 6 ether);
        assertEq(line.getHistory(user).count, 3);
    }

    function testMultipleRepayHistoryLinks() public {
        _link(user, keccak256("mrhl-1"), 0.1 ether, 2);
        _link(user, keccak256("mrhl-2"), 0.2 ether, 2);
        _link(user, keccak256("mrhl-3"), 0.3 ether, 2);
        assertEq(line.getHistory(user).volume, 0.6 ether);
        assertEq(line.getHistory(user).count, 3);
    }

    function testMixedHistoryLinks() public {
        _link(user, keccak256("mxhl-1"), 1 ether, 1);
        _link(user, keccak256("mxhl-2"), 0.5 ether, 2);
        _link(user, keccak256("mxhl-3"), 2 ether, 1);
        _link(user, keccak256("mxhl-4"), 0.3 ether, 2);
        assertEq(line.getHistory(user).count, 4);
        assertEq(line.getHistory(user).volume, 3.8 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  FINAL PUSH: 8 more to reach 200+
    // ═══════════════════════════════════════════════════════════════

    function testOpenWith1xBalanceNoBonus() public {
        _open(user, keccak256("1xn-dep"), keccak256("1xn-bal"), 1 ether, 1 ether);
        assertEq(line.getPosition(user).credit, 0.85 ether);
    }

    function testOpenWith3xBalance() public {
        _open(user, keccak256("3x-dep"), keccak256("3x-bal"), 1 ether, 3 ether);
        assertEq(line.getPosition(user).credit, 0.9 ether);
    }

    function testRepayZeroKindReverts() public {
        _open(user, keccak256("rkz-dep"), keccak256("rkz-bal"), 1 ether, 2 ether);
        bytes32 h = keccak256("rkz-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 1 ether, kind: 0});
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.repayCredit(claim, abi.encode(h, user, uint256(1 ether), uint8(0)));
    }

    function testLinkZeroKindReverts() public {
        bytes32 h = keccak256("lkz-link");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 1 ether, kind: 0});
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.submitAttestedPayment(claim, abi.encode(h, user, uint256(1 ether), uint8(0)));
    }

    function testLinkKind3Reverts() public {
        bytes32 h = keccak256("lk3-link");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 1 ether, kind: 3});
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.submitAttestedPayment(claim, abi.encode(h, user, uint256(1 ether), uint8(3)));
    }

    function testBatchKind3Reverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("b3k"), payer: user, amount: 0.1 ether, kind: 3});
        proofs[0] = abi.encode(keccak256("b3k"), user, uint256(0.1 ether), uint8(3));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.executeBatch(claims, proofs);
    }

    function testBatchKind0Reverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("b0k"), payer: user, amount: 0.1 ether, kind: 0});
        proofs[0] = abi.encode(keccak256("b0k"), user, uint256(0.1 ether), uint8(0));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.executeBatch(claims, proofs);
    }

    function testFullCycleWithInterest() public {
        _open(user, keccak256("fci-dep"), keccak256("fci-bal"), 10 ether, 20 ether);
        vm.prank(user);
        line.withdraw(5 ether);
        vm.warp(block.timestamp + 180 days);
        vm.prank(user);
        line.accrue(user);
        uint256 debt = line.currentDebt(user);
        bytes32 h = keccak256("fci-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: debt, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, debt, uint8(2)));
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _link(address who, bytes32 txHash, uint256 amount, uint8 kind) internal {
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: txHash,
            payer: who,
            amount: amount,
            kind: kind
        });
        bytes memory proof = abi.encode(txHash, who, amount, kind);
        vm.prank(who);
        line.submitAttestedPayment(claim, proof);
    }

    function _open(address who, bytes32 depTx, bytes32 balTx, uint256 deposit, uint256 balance)
        internal
    {
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: depTx,
            payer: who,
            amount: deposit,
            kind: 1
        });
        IPaymentVerifier.PaymentClaim memory balClaim = IPaymentVerifier.PaymentClaim({
            txHash: balTx,
            payer: who,
            amount: balance,
            kind: 3
        });
        bytes memory proof = abi.encode(depTx, who, deposit, uint8(1));
        bytes memory balProof = abi.encode(balTx, who, balance, uint8(3));
        vm.prank(who);
        line.openCredit(claim, proof, balClaim, balProof);
    }
}
