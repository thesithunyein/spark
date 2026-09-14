// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestedStanding} from "../src/AttestedStanding.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {MockPaymentVerifier} from "../src/MockPaymentVerifier.sol";
import {IPaymentVerifier} from "../src/interfaces/IPaymentVerifier.sol";

/**
 * @title AttestedStandingTest
 * @notice Covers the portability layer: a record that only exists behind verified evidence,
 *         that mirrors its authoritative source exactly, and that a consumer can gate on.
 *
 *         The property worth protecting is the first one. A registry that can be written to
 *         without evidence is a list of claims wearing the costume of a list of proofs, so
 *         the negative tests here matter more than the positive ones.
 */
contract AttestedStandingTest is Test {
    MockPaymentVerifier verifier;
    CreditLine line;
    AttestedStanding standing;

    address user = address(0xBEEF);
    address other = address(0xCAFE);
    address stranger = address(0xDEAD);

    function setUp() public {
        verifier = new MockPaymentVerifier(address(this), false);
        line = new CreditLine(address(verifier), 8000, 1000);
        standing = new AttestedStanding(address(line));
        vm.deal(user, 100 ether);
        vm.deal(other, 100 ether);
    }

    /* ------------------------------------------------------------------ helpers */

    function _link(address who, uint256 amount, uint256 salt) internal {
        IPaymentVerifier.PaymentClaim[] memory claims = new IPaymentVerifier.PaymentClaim[](1);
        bytes[] memory proofs = new bytes[](1);
        claims[0] = IPaymentVerifier.PaymentClaim({
            txHash: keccak256(abi.encodePacked("pay", salt, who)),
            payer: who,
            amount: amount,
            kind: 1
        });
        proofs[0] = abi.encode(claims[0].txHash, claims[0].payer, claims[0].amount, claims[0].kind);
        vm.prank(who);
        line.submitAttestMultiple(claims, proofs);
    }

    function _openFromBalance(address who, uint256 balance, uint256 salt) internal {
        IPaymentVerifier.PaymentClaim memory c = IPaymentVerifier.PaymentClaim({
            txHash: keccak256(abi.encodePacked("bal", salt, who)),
            payer: who,
            amount: balance,
            kind: 3
        });
        vm.prank(who);
        line.openCreditFromBalance(c, abi.encode(c.txHash, c.payer, c.amount, c.kind));
    }

    /* -------------------------------------------------------------- constructor */

    function testRejectsZeroAddress() public {
        vm.expectRevert(AttestedStanding.ZeroAddress.selector);
        new AttestedStanding(address(0));
    }

    function testRejectsAnAddressWithNoCode() public {
        // A registry pointed at an EOA would issue empty records that look authoritative.
        vm.expectRevert(abi.encodeWithSelector(AttestedStanding.CreditLineHasNoCode.selector, stranger));
        new AttestedStanding(stranger);
    }

    /* ---------------------------------------------------- evidence is required */

    function testRefreshRefusesAnAddressWithNoVerifiedActivity() public {
        vm.expectRevert(abi.encodeWithSelector(AttestedStanding.NotAttested.selector, stranger));
        standing.refresh(stranger);

        assertFalse(standing.standingOf(stranger).issued);
        assertEq(standing.recordCount(), 0);
    }

    function testRefreshRefusesZeroAddress() public {
        vm.expectRevert(AttestedStanding.ZeroAddress.selector);
        standing.refresh(address(0));
    }

    function testABalanceOnlyPositionIssuesARecordButNotPaymentStanding() public {
        // Opening from a balance proof is verified evidence, so a record is legitimate...
        _openFromBalance(user, 10 ether, 1);
        standing.refresh(user);

        AttestedStanding.Standing memory s = standing.standingOf(user);
        assertTrue(s.issued);
        assertEq(s.attestedBalance, 10 ether);
        // ...but it is not a payment, so it must not read as one. A consumer gating on
        // payments is properly refused here.
        assertEq(s.payments, 0);
        assertEq(s.volume, 0);
        assertEq(s.score, 650);
        assertFalse(standing.isEligible(user, 0, 1, 0));
    }

    /* ---------------------------------------------------------------- mirroring */

    function testMirrorsCreditLineExactly() public {
        _link(user, 1 ether, 1);
        _link(user, 2 ether, 2);
        _link(user, 3 ether, 3);

        standing.refresh(user);

        AttestedStanding.Standing memory s = standing.standingOf(user);
        assertEq(s.issued, true);
        assertEq(s.payments, 3);
        assertEq(s.volume, 6 ether);
        // 650 + 3 * 40.
        assertEq(s.score, 770);

        // Every number above must equal the source's own, or the mirror is a new claim.
        assertEq(line.creditScore(user), s.score);
        assertEq(line.getHistory(user).count, s.payments);
        assertEq(line.getHistory(user).volume, s.volume);
    }

    function testScoreIsCappedAtTheSourceCap() public {
        for (uint256 i = 0; i < 8; i++) {
            _link(user, 1 ether, 100 + i);
        }
        standing.refresh(user);

        // 650 + 8*40 = 970 uncapped; CreditLine caps at 850.
        assertEq(line.creditScore(user), 850);
        assertEq(standing.standingOf(user).score, 850);
    }

    function testEvidenceRefIsTheBalanceProofWhenAPositionExists() public {
        _openFromBalance(user, 10 ether, 7);

        standing.refresh(user);

        CreditLine.Position memory p = line.getPosition(user);
        assertEq(standing.standingOf(user).evidenceRef, p.balanceTxHash);
        assertTrue(standing.standingOf(user).evidenceRef != bytes32(0));
    }

    function testEvidenceRefFallsBackToTheOpeningProof() public {
        IPaymentVerifier.PaymentClaim memory dep = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("dep-open"),
            payer: user,
            amount: 1 ether,
            kind: 1
        });
        IPaymentVerifier.PaymentClaim memory bal = IPaymentVerifier.PaymentClaim({
            txHash: bytes32(0), // deliberately absent, so the fallback is the path taken
            payer: user,
            amount: 5 ether,
            kind: 3
        });
        vm.prank(user);
        line.openCredit(
            dep,
            abi.encode(dep.txHash, dep.payer, dep.amount, dep.kind),
            bal,
            abi.encode(bal.txHash, bal.payer, bal.amount, bal.kind)
        );

        standing.refresh(user);

        assertEq(standing.standingOf(user).evidenceRef, dep.txHash);
    }

    /* -------------------------------------------------------------- permissionless */

    function testAnyoneCanRefreshAndNobodyCanForge() public {
        _link(user, 1 ether, 1);

        // A third party may keep the record current, because the data does not come from
        // them — it comes from a contract that only records behind a proof.
        vm.prank(stranger);
        standing.refresh(user);

        assertEq(standing.standingOf(user).payments, 1);
        assertEq(standing.recordCount(), 1);
    }

    function testRecordCountIncrementsOncePerAddress() public {
        _link(user, 1 ether, 1);
        _link(other, 1 ether, 2);

        standing.refresh(user);
        standing.refresh(user);
        standing.refresh(other);

        assertEq(standing.recordCount(), 2);
    }

    function testRefreshingPicksUpNewPayments() public {
        _link(user, 1 ether, 1);
        standing.refresh(user);
        assertEq(standing.standingOf(user).payments, 1);

        _link(user, 1 ether, 2);
        standing.refresh(user);

        assertEq(standing.standingOf(user).payments, 2);
        assertEq(standing.standingOf(user).volume, 2 ether);
    }

    /* --------------------------------------------------------------- eligibility */

    function testEligibilityGatesOnScore() public {
        _link(user, 1 ether, 1);
        _link(user, 1 ether, 2);
        _link(user, 1 ether, 3);
        standing.refresh(user); // score 770

        assertTrue(standing.isEligible(user, 770, 0, 0));
        assertFalse(standing.isEligible(user, 771, 0, 0));
    }

    function testEligibilityGatesOnPayments() public {
        _link(user, 1 ether, 1);
        standing.refresh(user);

        assertTrue(standing.isEligible(user, 0, 1, 0));
        assertFalse(standing.isEligible(user, 0, 2, 0));
    }

    function testEligibilityRejectsAnUnissuedRecord() public {
        assertFalse(standing.isEligible(stranger, 0, 0, 0));
        // Even asking for nothing is refused, because there is no record to judge.
        assertFalse(standing.isEligible(stranger, 0, 0, type(uint64).max));
    }

    function testFreshnessWindow() public {
        _link(user, 1 ether, 1);
        standing.refresh(user);

        assertTrue(standing.isEligible(user, 0, 1, 3600));

        vm.warp(block.timestamp + 3_601);
        assertFalse(standing.isEligible(user, 0, 1, 3600));
        // Zero disables the freshness check rather than failing it.
        assertTrue(standing.isEligible(user, 0, 1, 0));
    }

    function testStandingAgeSentinelledWhenAbsent() public {
        assertEq(standing.standingAge(stranger), type(uint64).max);
    }

    function testStandingAgeGrowsWithTime() public {
        _link(user, 1 ether, 1);
        standing.refresh(user);
        assertEq(standing.standingAge(user), 0);

        vm.warp(block.timestamp + 120);
        assertEq(standing.standingAge(user), 120);
    }

    function testConstantsMatchTheSource() public view {
        assertEq(standing.SCORE_CAP(), 850);
        assertEq(standing.SCORE_CAP(), line.SCORE_CAP());
    }
}
