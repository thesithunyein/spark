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
