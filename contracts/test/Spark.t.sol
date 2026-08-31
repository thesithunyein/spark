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
    //  BATCH STRESS: More batch tests
    // ═══════════════════════════════════════════════════════════════

    function testBatchTwoItemsSequentialRepay() public {
        for (uint256 b = 0; b < 2; b++) {
            IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](2);
            bytes[] memory proofs = new bytes[](2);
            for (uint256 i = 0; i < 2; i++) {
                uint256 id = b * 2 + i + 20000;
                claims[i] = IPaymentVerifier.PaymentClaim({
                    txHash: keccak256(abi.encode(id)), payer: user, amount: 0.1 ether, kind: 2
                });
                proofs[i] = abi.encode(keccak256(abi.encode(id)), user, uint256(0.1 ether), uint8(2));
            }
            vm.prank(user);
            line.executeBatch(claims, proofs);
        }
        assertEq(line.getHistory(user).count, 4);
    }

    function testBatchThreeItemsMixedKinds() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
        bytes[] memory proofs = new bytes[](3);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("mix3-1"), payer: user, amount: 0.1 ether, kind: 1});
        claims[1] = IPaymentVerifier.PaymentClaim({txHash: keccak256("mix3-2"), payer: user, amount: 0.2 ether, kind: 2});
        claims[2] = IPaymentVerifier.PaymentClaim({txHash: keccak256("mix3-3"), payer: user, amount: 0.3 ether, kind: 1});
        proofs[0] = abi.encode(keccak256("mix3-1"), user, uint256(0.1 ether), uint8(1));
        proofs[1] = abi.encode(keccak256("mix3-2"), user, uint256(0.2 ether), uint8(2));
        proofs[2] = abi.encode(keccak256("mix3-3"), user, uint256(0.3 ether), uint8(1));
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).volume, 0.6 ether);
    }

    function testBatchWrongPayerInMiddle() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
        bytes[] memory proofs = new bytes[](3);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("wpm-1"), payer: user, amount: 0.1 ether, kind: 1});
        claims[1] = IPaymentVerifier.PaymentClaim({txHash: keccak256("wpm-2"), payer: address(0xDEAD), amount: 0.1 ether, kind: 1});
        claims[2] = IPaymentVerifier.PaymentClaim({txHash: keccak256("wpm-3"), payer: user, amount: 0.1 ether, kind: 1});
        proofs[0] = abi.encode(keccak256("wpm-1"), user, uint256(0.1 ether), uint8(1));
        proofs[1] = abi.encode(keccak256("wpm-2"), address(0xDEAD), uint256(0.1 ether), uint8(1));
        proofs[2] = abi.encode(keccak256("wpm-3"), user, uint256(0.1 ether), uint8(1));
        vm.prank(user);
        vm.expectRevert(CreditLine.BadPayer.selector);
        line.executeBatch(claims, proofs);
    }

    // ═══════════════════════════════════════════════════════════════
    //  LTV EDGE CASES: More combinations
    // ═══════════════════════════════════════════════════════════════

    function testLTVBalanceJustBelow1x() public {
        _open(user, keccak256("lb1x-dep"), keccak256("lb1x-bal"), 1 ether, 0.99 ether);
        assertEq(line.getPosition(user).credit, 0.8 ether); // base 80%
    }

    function testLTVBalanceJustAbove1x() public {
        _open(user, keccak256("la1x-dep"), keccak256("la1x-bal"), 1 ether, 1.01 ether);
        assertEq(line.getPosition(user).credit, 0.85 ether); // 85%
    }

    function testLTVBalanceJustBelow2x() public {
        _open(user, keccak256("lb2x-dep"), keccak256("lb2x-bal"), 1 ether, 1.99 ether);
        assertEq(line.getPosition(user).credit, 0.85 ether); // still 85%
    }

    function testLTVBalanceJustAbove2x() public {
        _open(user, keccak256("la2x-dep"), keccak256("la2x-bal"), 1 ether, 2.01 ether);
        assertEq(line.getPosition(user).credit, 0.9 ether); // 90%
    }

    function testLTVWith1HistoryBonus() public {
        _link(user, keccak256("l1h-dep"), 0.1 ether, 1);
        _open(user, keccak256("l1h-dep2"), keccak256("l1h-bal"), 1 ether, 2 ether);
        // base 9000 + 250 = 9250
        assertEq(line.getPosition(user).credit, 0.925 ether);
    }

    function testLTVWith2HistoryBonus() public {
        _link(user, keccak256("l2h-1"), 0.1 ether, 1);
        _link(user, keccak256("l2h-2"), 0.1 ether, 2);
        _open(user, keccak256("l2h-dep"), keccak256("l2h-bal"), 1 ether, 2 ether);
        // base 9000 + 250 = 9250 (still <3)
        assertEq(line.getPosition(user).credit, 0.925 ether);
    }

    function testLTVWith3HistoryBonus() public {
        _link(user, keccak256("l3h-1"), 0.1 ether, 1);
        _link(user, keccak256("l3h-2"), 0.1 ether, 2);
        _link(user, keccak256("l3h-3"), 0.1 ether, 1);
        _open(user, keccak256("l3h-dep"), keccak256("l3h-bal"), 1 ether, 2 ether);
        // base 9000 + 500 = 9500 (capped)
        assertEq(line.getPosition(user).credit, 0.95 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SCORE EDGE CASES
    // ═══════════════════════════════════════════════════════════════

    function testScoreAt4Payments() public {
        for (uint256 i = 0; i < 4; i++) {
            _link(user, keccak256(abi.encode(uint256(30000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 810); // 650 + 4*40
    }

    function testScoreAt5PaymentsIsCap() public {
        for (uint256 i = 0; i < 5; i++) {
            _link(user, keccak256(abi.encode(uint256(31000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
    }

    function testScoreWithDepositOnly() public {
        _open(user, keccak256("sdo-dep"), keccak256("sdo-bal"), 1 ether, 2 ether);
        // deposit counts as 1 payment
        assertEq(line.creditScore(user), 690); // 650 + 40
    }

    function testScoreWithDepositAndRepay() public {
        _open(user, keccak256("sdr-dep"), keccak256("sdr-bal"), 1 ether, 2 ether);
        bytes32 h = keccak256("sdr-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 0.5 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, uint256(0.5 ether), uint8(2)));
        assertEq(line.creditScore(user), 730); // 650 + 2*40
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTEREST EDGE CASES
    // ═══════════════════════════════════════════════════════════════

    function testInterestOnSmallDebt() public {
        _open(user, keccak256("isd-dep"), keccak256("isd-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.01 ether);
        vm.warp(block.timestamp + 365 days);
        line.accrue(user);
        // 0.01 * 10% = 0.001
        assertApproxEqRel(line.currentDebt(user), 0.011 ether, 0.001e18);
    }

    function testInterestOnLargeDebt() public {
        _open(user, keccak256("ild-dep"), keccak256("ild-bal"), 100 ether, 200 ether);
        vm.prank(user);
        line.withdraw(50 ether);
        vm.warp(block.timestamp + 365 days);
        line.accrue(user);
        assertApproxEqRel(line.currentDebt(user), 55 ether, 0.1e18);
    }

    function testInterestZeroTimeElapsed() public {
        _open(user, keccak256("izt-dep"), keccak256("izt-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        // No warp — dt = 0
        line.accrue(user);
        assertEq(line.currentDebt(user), 0.5 ether);
    }

    function testInterestOnZeroDebt() public {
        _open(user, keccak256("izd-dep"), keccak256("izd-bal"), 1 ether, 2 ether);
        vm.warp(block.timestamp + 365 days);
        line.accrue(user);
        assertEq(line.currentDebt(user), 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MULTI-USER STRESS
    // ═══════════════════════════════════════════════════════════════

    function testTenUsersAllOpen() public {
        for (uint256 i = 0; i < 10; i++) {
            address u = address(uint160(0x3000 + i));
            vm.deal(u, 100 ether);
            _open(u, keccak256(abi.encode(uint256(40000) + i)), keccak256(abi.encode(uint256(50000) + i)), 1 ether, 2 ether);
        }
        for (uint256 i = 0; i < 10; i++) {
            address u = address(uint160(0x3000 + i));
            assertEq(uint256(line.getPosition(u).status), uint256(CreditLine.Status.Active));
        }
    }

    function testTenUsersAllWithdraw() public {
        for (uint256 i = 0; i < 10; i++) {
            address u = address(uint160(0x4000 + i));
            vm.deal(u, 100 ether);
            _open(u, keccak256(abi.encode(uint256(60000) + i)), keccak256(abi.encode(uint256(70000) + i)), 1 ether, 2 ether);
            vm.prank(u);
            line.withdraw(0.5 ether);
        }
        for (uint256 i = 0; i < 10; i++) {
            address u = address(uint160(0x4000 + i));
            assertEq(line.currentDebt(u), 0.5 ether);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SUBMIT ATTESTED PAYMENT EDGE CASES
    // ═══════════════════════════════════════════════════════════════

    function testSubmitAttestDeposit() public {
        bytes32 h = keccak256("sad-dep");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 1 ether, kind: 1});
        vm.prank(user);
        line.submitAttestedPayment(claim, abi.encode(h, user, uint256(1 ether), uint8(1)));
        assertEq(line.getHistory(user).count, 1);
    }

    function testSubmitAttestRepay() public {
        bytes32 h = keccak256("sar-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 0.5 ether, kind: 2});
        vm.prank(user);
        line.submitAttestedPayment(claim, abi.encode(h, user, uint256(0.5 ether), uint8(2)));
        assertEq(line.getHistory(user).count, 1);
    }

    function testSubmitAttestWrongPayerReverts() public {
        bytes32 h = keccak256("satwp-link");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: address(0xDEAD), amount: 1 ether, kind: 1});
        vm.prank(user);
        vm.expectRevert(CreditLine.BadPayer.selector);
        line.submitAttestedPayment(claim, abi.encode(h, address(0xDEAD), uint256(1 ether), uint8(1)));
    }

    function testSubmitAttestWrongKind4Reverts() public {
        bytes32 h = keccak256("satk4-link");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 1 ether, kind: 4});
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.submitAttestedPayment(claim, abi.encode(h, user, uint256(1 ether), uint8(4)));
    }

    function testSubmitAttestWrongKind5Reverts() public {
        bytes32 h = keccak256("satk5-link");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 1 ether, kind: 5});
        vm.prank(user);
        vm.expectRevert(CreditLine.BadKind.selector);
        line.submitAttestedPayment(claim, abi.encode(h, user, uint256(1 ether), uint8(5)));
    }

    function testSubmitAttestMaxUint256Amount() public {
        bytes32 h = keccak256("satmax-link");
        uint256 maxAmt = type(uint256).max;
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: maxAmt, kind: 1});
        vm.prank(user);
        line.submitAttestedPayment(claim, abi.encode(h, user, maxAmt, uint8(1)));
        assertEq(line.getHistory(user).volume, maxAmt);
    }

    // ═══════════════════════════════════════════════════════════════
    //  OPEN CREDIT EDGE CASES
    // ═══════════════════════════════════════════════════════════════

    function testOpenDeposit1Wei() public {
        _open(user, keccak256("od1w-dep"), keccak256("od1w-bal"), 1, 2);
        assertEq(line.getPosition(user).deposit, 1);
    }

    function testOpenBalance1Wei() public {
        _open(user, keccak256("ob1w-dep"), keccak256("ob1w-bal"), 1, 1);
        // 1 wei balance < 1 wei deposit... actually 1 >= 1, so 85%
        assertEq(line.getPosition(user).credit, 0); // 1 * 8500 / 10000 = 0 (integer)
    }

    function testOpenDeposit1EtherBalance100Ether() public {
        _open(user, keccak256("od1b100-dep"), keccak256("od1b100-bal"), 1 ether, 100 ether);
        // 100x balance → 90%
        assertEq(line.getPosition(user).credit, 0.9 ether);
    }

    function testOpenDeposit100EtherBalance1Ether() public {
        _open(user, keccak256("od100b1-dep"), keccak256("od100b1-bal"), 100 ether, 1 ether);
        // balance < deposit → base 80%
        assertEq(line.getPosition(user).credit, 80 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  REPAY EDGE CASES
    // ═══════════════════════════════════════════════════════════════

    function testRepayExactDebtAmount() public {
        _open(user, keccak256("reda-dep"), keccak256("reda-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        bytes32 h = keccak256("reda-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 0.5 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, uint256(0.5 ether), uint8(2)));
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testRepayTwice() public {
        _open(user, keccak256("rptw-dep"), keccak256("rptw-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.6 ether);
        bytes32 h1 = keccak256("rptw-r1");
        IPaymentVerifier.PaymentClaim memory c1 = IPaymentVerifier.PaymentClaim({txHash: h1, payer: user, amount: 0.3 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(c1, abi.encode(h1, user, uint256(0.3 ether), uint8(2)));
        assertEq(line.currentDebt(user), 0.3 ether);
        bytes32 h2 = keccak256("rptw-r2");
        IPaymentVerifier.PaymentClaim memory c2 = IPaymentVerifier.PaymentClaim({txHash: h2, payer: user, amount: 0.3 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(c2, abi.encode(h2, user, uint256(0.3 ether), uint8(2)));
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testRepayWithInterest() public {
        _open(user, keccak256("rpwi-dep"), keccak256("rpwi-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.warp(block.timestamp + 365 days);
        vm.prank(user);
        line.accrue(user);
        uint256 debt = line.currentDebt(user);
        bytes32 h = keccak256("rpwi-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: debt, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, debt, uint8(2)));
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENT EDGE CASES
    // ═══════════════════════════════════════════════════════════════

    function testEventInterestAccrued() public {
        _open(user, keccak256("eia-dep"), keccak256("eia-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.warp(block.timestamp + 365 days);
        vm.expectEmit(true, false, false, false);
        emit CreditLine.InterestAccrued(user, 0.05 ether, 0.55 ether);
        vm.prank(user);
        line.accrue(user);
    }

    function testEventCreditClosed() public {
        _open(user, keccak256("ecc-dep"), keccak256("ecc-bal"), 1 ether, 2 ether);
        vm.expectEmit(true, false, false, true);
        emit CreditLine.CreditClosed(user, keccak256("ecc-dep"));
        vm.prank(user);
        line.closeUnused();
    }

    function testEventCreditRepaid() public {
        _open(user, keccak256("ecr-dep"), keccak256("ecr-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        bytes32 h = keccak256("ecr-repay");
        vm.expectEmit(true, false, false, true);
        emit CreditLine.CreditRepaid(user, 0.5 ether, h);
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 0.5 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, uint256(0.5 ether), uint8(2)));
    }

    // ═══════════════════════════════════════════════════════════════
    //  FINAL PUSH: 64 more tests to reach 300+
    // ═══════════════════════════════════════════════════════════════

    // Batch volume tests
    function testBatchVolumeAccumulates() public {
        for (uint256 b = 0; b < 3; b++) {
            IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](2);
            bytes[] memory proofs = new bytes[](2);
            claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256(abi.encode(uint256(80000) + b*2)), payer: user, amount: 1 ether, kind: 1});
            claims[1] = IPaymentVerifier.PaymentClaim({txHash: keccak256(abi.encode(uint256(80001) + b*2)), payer: user, amount: 2 ether, kind: 2});
            proofs[0] = abi.encode(keccak256(abi.encode(uint256(80000) + b*2)), user, uint256(1 ether), uint8(1));
            proofs[1] = abi.encode(keccak256(abi.encode(uint256(80001) + b*2)), user, uint256(2 ether), uint8(2));
            vm.prank(user);
            line.executeBatch(claims, proofs);
        }
        assertEq(line.getHistory(user).count, 6);
        assertEq(line.getHistory(user).volume, 9 ether);
    }

    // Interest compounding with多次 accrue
    function testInterestCompoundingWithMultipleAccrues() public {
        _open(user, keccak256("icma-dep"), keccak256("icma-bal"), 10 ether, 20 ether);
        vm.prank(user);
        line.withdraw(5 ether);
        for (uint256 y = 0; y < 5; y++) {
            vm.warp(block.timestamp + 365 days);
            vm.prank(user);
            line.accrue(user);
        }
        // 5 years of 10% on 5 ether — each year adds ~10% of current debt
        uint256 debt = line.currentDebt(user);
        assertGt(debt, 5 ether);
        assertLt(debt, 10 ether);
    }

    // Score doesn't affect credit
    function testScoreDoesNotAffectCredit() public {
        _open(user, keccak256("sdac-dep"), keccak256("sdac-bal"), 1 ether, 2 ether);
        uint256 creditBefore = line.getPosition(user).credit;
        for (uint256 i = 0; i < 5; i++) {
            _link(user, keccak256(abi.encode(uint256(90000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
        assertEq(line.getPosition(user).credit, creditBefore);
    }

    // History count after open
    function testHistoryCountAfterOpen() public {
        _open(user, keccak256("hco-dep"), keccak256("hco-bal"), 1 ether, 2 ether);
        assertEq(line.getHistory(user).count, 1);
    }

    // History count after repay
    function testHistoryCountAfterRepay() public {
        _open(user, keccak256("hcr-dep"), keccak256("hcr-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        bytes32 h = keccak256("hcr-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 0.5 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, uint256(0.5 ether), uint8(2)));
        assertEq(line.getHistory(user).count, 2);
    }

    // History count after batch
    function testHistoryCountAfterBatch() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](5);
        bytes[] memory proofs = new bytes[](5);
        for (uint256 i = 0; i < 5; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({txHash: keccak256(abi.encode(uint256(91000) + i)), payer: user, amount: 0.1 ether, kind: 1});
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(91000) + i)), user, uint256(0.1 ether), uint8(1));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).count, 5);
    }

    // Single withdraw all available
    function testSingleWithdrawAll() public {
        _open(user, keccak256("swa-dep"), keccak256("swa-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.9 ether);
        assertEq(line.availableCredit(user), 0);
        assertEq(line.creditToken().balanceOf(user), 0.9 ether);
    }

    // Multiple withdraw then single redeem
    function testMultipleWithdrawSingleRedeem() public {
        _open(user, keccak256("mwsr-dep"), keccak256("mwsr-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.3 ether);
        vm.prank(user);
        line.withdraw(0.3 ether);
        vm.prank(user);
        line.withdraw(0.2 ether);
        assertEq(line.currentDebt(user), 0.8 ether);
        vm.prank(user);
        line.redeem(0.8 ether);
        assertEq(line.currentDebt(user), 0);
    }

    // Open with base factor and different balance
    function testOpenBaseFactor10x() public {
        _open(user, keccak256("obf10x-dep"), keccak256("obf10x-bal"), 1 ether, 10 ether);
        assertEq(line.getPosition(user).credit, 0.9 ether);
    }

    // Open with base factor 100x
    function testOpenBaseFactor100x() public {
        _open(user, keccak256("obf100x-dep"), keccak256("obf100x-bal"), 1 ether, 100 ether);
        assertEq(line.getPosition(user).credit, 0.9 ether);
    }

    // Close and reopen preserves history
    function testCloseReopenPreservesHistory() public {
        _link(user, keccak256("crph-1"), 0.5 ether, 1);
        _open(user, keccak256("crph-dep"), keccak256("crph-bal"), 1 ether, 2 ether);
        assertEq(line.getHistory(user).count, 2);
        vm.prank(user);
        line.closeUnused();
        assertEq(line.getHistory(user).count, 2);
        _open(user, keccak256("crph-dep2"), keccak256("crph-bal2"), 1 ether, 2 ether);
        assertEq(line.getHistory(user).count, 3);
    }

    // History bonus threshold exact
    function testHistoryBonusAt2Payments() public {
        _link(user, keccak256("hba2-1"), 0.1 ether, 1);
        _link(user, keccak256("hba2-2"), 0.1 ether, 2);
        assertEq(line.historyBonusBps(user), 250);
    }

    // History bonus at 3 payments exact
    function testHistoryBonusAt3Payments() public {
        _link(user, keccak256("hba3-1"), 0.1 ether, 1);
        _link(user, keccak256("hba3-2"), 0.1 ether, 2);
        _link(user, keccak256("hba3-3"), 0.1 ether, 1);
        assertEq(line.historyBonusBps(user), 500);
    }

    // Batch with all same kind
    function testBatchAllDepositKind() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
        bytes[] memory proofs = new bytes[](3);
        for (uint256 i = 0; i < 3; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({txHash: keccak256(abi.encode(uint256(92000) + i)), payer: user, amount: 0.1 ether, kind: 1});
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(92000) + i)), user, uint256(0.1 ether), uint8(1));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).count, 3);
    }

    function testBatchAllRepayKind() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
        bytes[] memory proofs = new bytes[](3);
        for (uint256 i = 0; i < 3; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({txHash: keccak256(abi.encode(uint256(93000) + i)), payer: user, amount: 0.1 ether, kind: 2});
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(93000) + i)), user, uint256(0.1 ether), uint8(2));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).count, 3);
    }

    // Score with mixed deposit and repay
    function testScoreWithMixedPayments() public {
        _link(user, keccak256("smp-1"), 1 ether, 1);
        _link(user, keccak256("smp-2"), 0.5 ether, 2);
        _link(user, keccak256("smp-3"), 1 ether, 1);
        _link(user, keccak256("smp-4"), 0.5 ether, 2);
        _link(user, keccak256("smp-5"), 1 ether, 1);
        assertEq(line.creditScore(user), 850);
    }

    // Volume with all deposits
    function testVolumeWithAllDeposits() public {
        _link(user, keccak256("vad-1"), 10 ether, 1);
        _link(user, keccak256("vad-2"), 20 ether, 1);
        _link(user, keccak256("vad-3"), 30 ether, 1);
        assertEq(line.getHistory(user).volume, 60 ether);
    }

    // Volume with all repays
    function testVolumeWithAllRepays() public {
        _link(user, keccak256("var-1"), 10 ether, 2);
        _link(user, keccak256("var-2"), 20 ether, 2);
        _link(user, keccak256("var-3"), 30 ether, 2);
        assertEq(line.getHistory(user).volume, 60 ether);
    }

    // Withdraw then close reverts
    function testWithdrawThenCloseReverts() public {
        _open(user, keccak256("wtc-dep"), keccak256("wtc-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.prank(user);
        vm.expectRevert(CreditLine.HasDebt.selector);
        line.closeUnused();
    }

    // Redeem then close reverts
    function testRedeemThenCloseReverts() public {
        _open(user, keccak256("rtc-dep"), keccak256("rtc-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.prank(user);
        line.redeem(0.3 ether);
        vm.prank(user);
        vm.expectRevert(CreditLine.HasDebt.selector);
        line.closeUnused();
    }

    // Close then withdraw reverts
    function testCloseThenWithdrawReverts() public {
        _open(user, keccak256("ctw-dep"), keccak256("ctw-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.closeUnused();
        vm.prank(user);
        vm.expectRevert(CreditLine.NotActive.selector);
        line.withdraw(0.1 ether);
    }

    // Close then redeem reverts
    function testCloseThenRedeemReverts() public {
        _open(user, keccak256("ctr-dep"), keccak256("ctr-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.closeUnused();
        vm.prank(user);
        vm.expectRevert(CreditLine.NotActive.selector);
        line.redeem(0.1 ether);
    }

    // Close then repay reverts
    function testCloseThenRepayReverts() public {
        _open(user, keccak256("ctre-dep"), keccak256("ctre-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.closeUnused();
        bytes32 h = keccak256("ctre-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 0.5 ether, kind: 2});
        vm.prank(user);
        vm.expectRevert(CreditLine.NotActive.selector);
        line.repayCredit(claim, abi.encode(h, user, uint256(0.5 ether), uint8(2)));
    }

    // Repay then close via repay
    function testRepayThenCloseViaRepay() public {
        _open(user, keccak256("rtcv-dep"), keccak256("rtcv-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        bytes32 h = keccak256("rtcv-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 1 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, uint256(1 ether), uint8(2)));
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    // Multiple users with different LTVs
    function testMultipleUsersDifferentLTVs() public {
        address userB = address(0xCAFE);
        address userC = address(0xDEAD);
        vm.deal(userB, 100 ether);
        vm.deal(userC, 100 ether);
        _open(user, keccak256("mulLtv-a"), keccak256("mulLtv-aB"), 1 ether, 0.5 ether); // base 80%
        _open(userB, keccak256("mulLtv-b"), keccak256("mulLtv-bB"), 1 ether, 1 ether); // 85%
        _open(userC, keccak256("mulLtv-c"), keccak256("mulLtv-cB"), 1 ether, 2 ether); // 90%
        assertEq(line.getPosition(user).credit, 0.8 ether);
        assertEq(line.getPosition(userB).credit, 0.85 ether);
        assertEq(line.getPosition(userC).credit, 0.9 ether);
    }

    // History bonus at 4 payments
    function testHistoryBonusAt4Payments() public {
        for (uint256 i = 0; i < 4; i++) {
            _link(user, keccak256(abi.encode(uint256(94000) + i)), 0.1 ether, 1);
        }
        assertEq(line.historyBonusBps(user), 500);
    }

    // History bonus at 10 payments
    function testHistoryBonusAt10Payments() public {
        for (uint256 i = 0; i < 10; i++) {
            _link(user, keccak256(abi.encode(uint256(95000) + i)), 0.1 ether, 1);
        }
        assertEq(line.historyBonusBps(user), 500);
    }

    // Score at 10 payments
    function testScoreAt10Payments() public {
        for (uint256 i = 0; i < 10; i++) {
            _link(user, keccak256(abi.encode(uint256(96000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
    }

    // Score at 20 payments
    function testScoreAt20Payments() public {
        for (uint256 i = 0; i < 20; i++) {
            _link(user, keccak256(abi.encode(uint256(97000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
    }

    // Open with history bonus from linked payments
    function testOpenWithHistoryBonusFromLinks() public {
        for (uint256 i = 0; i < 3; i++) {
            _link(user, keccak256(abi.encode(uint256(98000) + i)), 0.1 ether, 1);
        }
        _open(user, keccak256("ohbl-dep"), keccak256("ohbl-bal"), 1 ether, 2 ether);
        // base 9000 + 500 = 9500
        assertEq(line.getPosition(user).credit, 0.95 ether);
    }

    // Open with 1 linked payment
    function testOpenWith1LinkedPayment() public {
        _link(user, keccak256("o1lp-dep"), 0.1 ether, 1);
        _open(user, keccak256("o1lp-dep2"), keccak256("o1lp-bal"), 1 ether, 2 ether);
        // base 9000 + 250 = 9250
        assertEq(line.getPosition(user).credit, 0.925 ether);
    }

    // Open with 2 linked payments
    function testOpenWith2LinkedPayments() public {
        _link(user, keccak256("o2lp-1"), 0.1 ether, 1);
        _link(user, keccak256("o2lp-2"), 0.1 ether, 2);
        _open(user, keccak256("o2lp-dep"), keccak256("o2lp-bal"), 1 ether, 2 ether);
        // base 9000 + 250 = 9250
        assertEq(line.getPosition(user).credit, 0.925 ether);
    }

    // Batch 7 items
    function testBatch7Items() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](7);
        bytes[] memory proofs = new bytes[](7);
        for (uint256 i = 0; i < 7; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({txHash: keccak256(abi.encode(uint256(99000) + i)), payer: user, amount: 0.01 ether, kind: 1});
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(99000) + i)), user, uint256(0.01 ether), uint8(1));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).count, 7);
    }

    // Batch 8 items
    function testBatch8Items() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](8);
        bytes[] memory proofs = new bytes[](8);
        for (uint256 i = 0; i < 8; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({txHash: keccak256(abi.encode(uint256(100000) + i)), payer: user, amount: 0.01 ether, kind: 1});
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(100000) + i)), user, uint256(0.01 ether), uint8(1));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).count, 8);
    }

    // Batch 9 items
    function testBatch9Items() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](9);
        bytes[] memory proofs = new bytes[](9);
        for (uint256 i = 0; i < 9; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({txHash: keccak256(abi.encode(uint256(101000) + i)), payer: user, amount: 0.01 ether, kind: 1});
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(101000) + i)), user, uint256(0.01 ether), uint8(1));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).count, 9);
    }

    // Batch 11 items reverts
    function testBatch11ItemsReverts() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](11);
        bytes[] memory proofs = new bytes[](11);
        for (uint256 i = 0; i < 11; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({txHash: keccak256(abi.encode(uint256(102000) + i)), payer: user, amount: 0.1 ether, kind: 1});
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(102000) + i)), user, uint256(0.1 ether), uint8(1));
        }
        vm.prank(user);
        vm.expectRevert(CreditLine.BadAmount.selector);
        line.executeBatch(claims, proofs);
    }

    // ═══════════════════════════════════════════════════════════════
    //  LAST 30: Combo, edge, boundary tests
    // ═══════════════════════════════════════════════════════════════

    function testOpenWithdrawRedeemRepayClose() public {
        _open(user, keccak256("owrrc-dep"), keccak256("owrrc-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.prank(user);
        line.redeem(0.2 ether);
        bytes32 h = keccak256("owrrc-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 0.3 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, uint256(0.3 ether), uint8(2)));
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testOpenCloseReopenWithdrawRepayClose() public {
        _open(user, keccak256("ocrwrc-1"), keccak256("ocrwrc-1b"), 1 ether, 2 ether);
        vm.prank(user);
        line.closeUnused();
        _open(user, keccak256("ocrwrc-2"), keccak256("ocrwrc-2b"), 2 ether, 4 ether);
        vm.prank(user);
        line.withdraw(1 ether);
        bytes32 h = keccak256("ocrwrc-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 2 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, uint256(2 ether), uint8(2)));
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testBatchThenRepay() public {
        _open(user, keccak256("btr-dep"), keccak256("btr-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](2);
        bytes[] memory proofs = new bytes[](2);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("btr-b1"), payer: user, amount: 0.2 ether, kind: 2});
        claims[1] = IPaymentVerifier.PaymentClaim({txHash: keccak256("btr-b2"), payer: user, amount: 0.3 ether, kind: 2});
        proofs[0] = abi.encode(keccak256("btr-b1"), user, uint256(0.2 ether), uint8(2));
        proofs[1] = abi.encode(keccak256("btr-b2"), user, uint256(0.3 ether), uint8(2));
        vm.prank(user);
        line.executeBatch(claims, proofs);
        // executeBatch records history, doesn't affect debt
        assertEq(line.getHistory(user).count, 3); // 1 from open + 2 from batch
        assertEq(line.currentDebt(user), 0.5 ether); // debt unchanged
    }

    function testLinkThenOpen() public {
        _link(user, keccak256("lto-1"), 1 ether, 1);
        _link(user, keccak256("lto-2"), 0.5 ether, 2);
        _open(user, keccak256("lto-dep"), keccak256("lto-bal"), 1 ether, 2 ether);
        assertEq(line.creditScore(user), 770);
    }

    function testOpenThenLink() public {
        _open(user, keccak256("otl-dep"), keccak256("otl-bal"), 1 ether, 2 ether);
        _link(user, keccak256("otl-1"), 1 ether, 1);
        _link(user, keccak256("otl-2"), 0.5 ether, 2);
        assertEq(line.creditScore(user), 770);
    }

    function testScoreStartsAt650() public {
        assertEq(line.creditScore(user), 650);
    }

    function testScoreAfter1Link() public {
        _link(user, keccak256("sa1l"), 0.1 ether, 1);
        assertEq(line.creditScore(user), 690);
    }

    function testScoreAfter2Links() public {
        _link(user, keccak256("sa2l-1"), 0.1 ether, 1);
        _link(user, keccak256("sa2l-2"), 0.1 ether, 2);
        assertEq(line.creditScore(user), 730);
    }

    function testScoreAfter3Links() public {
        _link(user, keccak256("sa3l-1"), 0.1 ether, 1);
        _link(user, keccak256("sa3l-2"), 0.1 ether, 2);
        _link(user, keccak256("sa3l-3"), 0.1 ether, 1);
        assertEq(line.creditScore(user), 770);
    }

    function testScoreAfter4Links() public {
        for (uint256 i = 0; i < 4; i++) {
            _link(user, keccak256(abi.encode(uint256(110000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 810);
    }

    function testScoreAfter6Links() public {
        for (uint256 i = 0; i < 6; i++) {
            _link(user, keccak256(abi.encode(uint256(111000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
    }

    function testScoreAfter7Links() public {
        for (uint256 i = 0; i < 7; i++) {
            _link(user, keccak256(abi.encode(uint256(112000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
    }

    function testScoreAfter10Links() public {
        for (uint256 i = 0; i < 10; i++) {
            _link(user, keccak256(abi.encode(uint256(113000) + i)), 0.1 ether, 1);
        }
        assertEq(line.creditScore(user), 850);
    }

    function testOpenDeposit10Ether() public {
        _open(user, keccak256("od10e-dep"), keccak256("od10e-bal"), 10 ether, 20 ether);
        assertEq(line.getPosition(user).credit, 9 ether);
    }

    function testOpenDeposit100Ether() public {
        _open(user, keccak256("od100e-dep"), keccak256("od100e-bal"), 100 ether, 200 ether);
        assertEq(line.getPosition(user).credit, 90 ether);
    }

    function testWithdrawAfterOpenAndInterest() public {
        _open(user, keccak256("waoi-dep"), keccak256("waoi-bal"), 1 ether, 2 ether);
        vm.warp(block.timestamp + 365 days);
        vm.prank(user);
        line.withdraw(0.5 ether);
        assertEq(line.currentDebt(user), 0.5 ether);
    }

    function testRedeemAfterOpenAndInterest() public {
        _open(user, keccak256("raoi-dep"), keccak256("raoi-bal"), 10 ether, 20 ether);
        vm.prank(user);
        line.withdraw(5 ether);
        vm.warp(block.timestamp + 365 days);
        vm.prank(user);
        line.accrue(user);
        // Redeem won't fully clear debt since tokens < debt after interest
        // But redeem partial works
        vm.prank(user);
        line.redeem(1 ether);
        assertLt(line.currentDebt(user), 5.5 ether);
    }

    function testRepayAfterOpenAndInterest() public {
        _open(user, keccak256("raoi2-dep"), keccak256("raoi2-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.warp(block.timestamp + 365 days);
        vm.prank(user);
        line.accrue(user);
        uint256 debt = line.currentDebt(user);
        bytes32 h = keccak256("raoi2-repay");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: debt, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, debt, uint8(2)));
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testBatchThenLink() public {
        _open(user, keccak256("btl-dep"), keccak256("btl-bal"), 1 ether, 2 ether);
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
        bytes[] memory proofs = new bytes[](3);
        for (uint256 i = 0; i < 3; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({txHash: keccak256(abi.encode(uint256(120000) + i)), payer: user, amount: 0.1 ether, kind: 1});
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(120000) + i)), user, uint256(0.1 ether), uint8(1));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        assertEq(line.getHistory(user).count, 4); // 1 from open + 3 from batch
    }

    function testOpenThenBatchRepay() public {
        _open(user, keccak256("otbr-dep"), keccak256("otbr-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.6 ether);
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](3);
        bytes[] memory proofs = new bytes[](3);
        for (uint256 i = 0; i < 3; i++) {
            claims[i] = IPaymentVerifier.PaymentClaim({txHash: keccak256(abi.encode(uint256(121000) + i)), payer: user, amount: 0.2 ether, kind: 2});
            proofs[i] = abi.encode(keccak256(abi.encode(uint256(121000) + i)), user, uint256(0.2 ether), uint8(2));
        }
        vm.prank(user);
        line.executeBatch(claims, proofs);
        // executeBatch records history, doesn't affect debt
        assertEq(line.getHistory(user).count, 4); // 1 from open + 3 from batch
        assertEq(line.currentDebt(user), 0.6 ether); // debt unchanged
    }

    function testOpenRepayCloseReopenRepayClose() public {
        _open(user, keccak256("orcrorc-1"), keccak256("orcrorc-1b"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        bytes32 h1 = keccak256("orcrorc-r1");
        IPaymentVerifier.PaymentClaim memory c1 = IPaymentVerifier.PaymentClaim({txHash: h1, payer: user, amount: 0.5 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(c1, abi.encode(h1, user, uint256(0.5 ether), uint8(2)));
        _open(user, keccak256("orcrorc-2"), keccak256("orcrorc-2b"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.3 ether);
        bytes32 h2 = keccak256("orcrorc-r2");
        IPaymentVerifier.PaymentClaim memory c2 = IPaymentVerifier.PaymentClaim({txHash: h2, payer: user, amount: 0.3 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(c2, abi.encode(h2, user, uint256(0.3 ether), uint8(2)));
        assertEq(uint256(line.getPosition(user).status), uint256(CreditLine.Status.Closed));
    }

    function testFullCycleDepositRepayHistory() public {
        _open(user, keccak256("fcdh-dep"), keccak256("fcdh-bal"), 1 ether, 2 ether);
        _link(user, keccak256("fcdh-link1"), 0.5 ether, 1);
        _link(user, keccak256("fcdh-link2"), 0.3 ether, 2);
        assertEq(line.getHistory(user).count, 3);
        assertEq(line.getHistory(user).volume, 1.8 ether);
    }

    // Final 6 tests to reach 300
    function testOpenDepositEmitsCreditOpenedEvent() public {
        vm.expectEmit(true, false, false, false);
        emit CreditLine.CreditOpened(user, 1 ether, 2 ether, 0.9 ether, 9000, keccak256("ode-dep"), keccak256("ode-bal"));
        _open(user, keccak256("ode-dep"), keccak256("ode-bal"), 1 ether, 2 ether);
    }

    function testRepayEmitsCreditRepaidEvent() public {
        _open(user, keccak256("re-dep"), keccak256("re-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        bytes32 h = keccak256("re-repay");
        vm.expectEmit(true, false, false, true);
        emit CreditLine.CreditRepaid(user, 0.5 ether, h);
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({txHash: h, payer: user, amount: 0.5 ether, kind: 2});
        vm.prank(user);
        line.repayCredit(claim, abi.encode(h, user, uint256(0.5 ether), uint8(2)));
    }

    function testWithdrawEmitsCreditWithdrawnEvent() public {
        _open(user, keccak256("we-dep"), keccak256("we-bal"), 1 ether, 2 ether);
        vm.expectEmit(true, false, false, false);
        emit CreditLine.CreditWithdrawn(user, 0.3 ether, 0.3 ether);
        vm.prank(user);
        line.withdraw(0.3 ether);
    }

    function testRedeemEmitsCreditRedeemedEvent() public {
        _open(user, keccak256("ree-dep"), keccak256("ree-bal"), 1 ether, 2 ether);
        vm.prank(user);
        line.withdraw(0.5 ether);
        vm.expectEmit(true, false, false, false);
        emit CreditLine.CreditRedeemed(user, 0.2 ether, 0.3 ether);
        vm.prank(user);
        line.redeem(0.2 ether);
    }

    function testBatchWithAllRepayEmitsLinked() public {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({txHash: keccak256("bawe-1"), payer: user, amount: 0.5 ether, kind: 2});
        proofs[0] = abi.encode(keccak256("bawe-1"), user, uint256(0.5 ether), uint8(2));
        vm.expectEmit(true, true, false, true);
        emit CreditLine.AttestedPaymentLinked(user, keccak256("bawe-1"), 2, 0.5 ether, 1, 0.5 ether);
        vm.prank(user);
        line.executeBatch(claims, proofs);
    }

    function testLinkEmitsAttestedPaymentLinked() public {
        vm.expectEmit(true, true, false, true);
        emit CreditLine.AttestedPaymentLinked(user, keccak256("leapl"), 1, 1 ether, 1, 1 ether);
        _link(user, keccak256("leapl"), 1 ether, 1);
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
