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
        line = new CreditLine(address(verifier), 8000);
        vm.deal(user, 100 ether);
    }

    function testDepositEmits() public {
        vm.prank(user);
        payment.payDeposit{value: 1 ether}(keccak256("ref1"));
        assertEq(payment.deposits(user), 1 ether);
    }

    function testOpenCreditRequiresValidProof() public {
        bytes32 txHash = keccak256("deposit-tx");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: txHash,
            payer: user,
            amount: 1 ether,
            kind: 1
        });
        bytes memory proof = abi.encode(txHash, user, uint256(1 ether), uint8(1));

        vm.prank(user);
        line.openCredit(claim, proof);

        CreditLine.Position memory pos = line.getPosition(user);
        assertEq(uint256(pos.status), uint256(CreditLine.Status.Active));
        assertEq(pos.deposit, 1 ether);
        assertEq(pos.credit, 0.8 ether);
        assertEq(pos.debt, 0.8 ether);
    }

    function testReplayRejected() public {
        bytes32 txHash = keccak256("deposit-tx-2");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: txHash,
            payer: user,
            amount: 1 ether,
            kind: 1
        });
        bytes memory proof = abi.encode(txHash, user, uint256(1 ether), uint8(1));

        vm.prank(user);
        line.openCredit(claim, proof);

        // close via repay first so we can try reuse — actually AlreadyOpen; use new user path
        // Attempt same txHash from same user after close
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

        vm.prank(user);
        vm.expectRevert(CreditLine.TxAlreadyUsed.selector);
        line.openCredit(claim, proof);
    }

    function testWrongPayerReverts() public {
        bytes32 txHash = keccak256("deposit-tx-3");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: txHash,
            payer: address(0xCAFE),
            amount: 1 ether,
            kind: 1
        });
        bytes memory proof = abi.encode(txHash, address(0xCAFE), uint256(1 ether), uint8(1));

        vm.prank(user);
        vm.expectRevert(CreditLine.BadPayer.selector);
        line.openCredit(claim, proof);
    }

    function testBadProofReverts() public {
        bytes32 txHash = keccak256("deposit-tx-4");
        IPaymentVerifier.PaymentClaim memory claim = IPaymentVerifier.PaymentClaim({
            txHash: txHash,
            payer: user,
            amount: 1 ether,
            kind: 1
        });
        bytes memory proof = abi.encode(txHash, user, uint256(2 ether), uint8(1)); // amount mismatch

        vm.prank(user);
        vm.expectRevert(CreditLine.ProofFailed.selector);
        line.openCredit(claim, proof);
    }
}
