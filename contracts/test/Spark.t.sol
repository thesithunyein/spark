// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SepoliaPayment} from "../src/SepoliaPayment.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {MockPaymentVerifier} from "../src/MockPaymentVerifier.sol";
import {IPaymentVerifier} from "../src/interfaces/IPaymentVerifier.sol";

contract SparkTest is Test {
    SepoliaPayment payment;
    MockPaymentVerifier verifier;
    CreditLine line;
    address user = address(0xBEEF);

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
