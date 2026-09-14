// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestedStanding} from "../src/AttestedStanding.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {StandingGatedCheckout} from "../src/StandingGatedCheckout.sol";
import {MockPaymentVerifier} from "../src/MockPaymentVerifier.sol";
import {IPaymentVerifier} from "../src/interfaces/IPaymentVerifier.sol";

/// @dev A merchant that cannot receive value. Used to prove `settle` fails loudly rather
///      than marking an order paid while the money is gone.
contract RejectingReceiver {
    receive() external payable {
        revert("no thanks");
    }
}

/**
 * @title StandingGatedCheckoutTest
 * @notice Covers the portability claim being a demonstrated fact rather than an interface.
 *
 *         The property worth protecting is not that a checkout succeeds. It is that this
 *         contract's decisions are driven by a record it did not write, using a policy
 *         Spark does not control, and that every way of short-circuiting that dependency
 *         fails. So the negative tests here outnumber the positive ones deliberately.
 */
contract StandingGatedCheckoutTest is Test {
    MockPaymentVerifier verifier;
    CreditLine line;
    AttestedStanding standing;
    StandingGatedCheckout checkout;

    address merchant = address(0xA11CE);
    address merchant2 = address(0xB0B);
    address buyer = address(0xBEEF);
    address stranger = address(0xDEAD);

    uint128 constant PRICE = 1 ether;
    uint128 constant MAX_DEFERRED = 10 ether;
    uint16 constant ADVANCE_BPS = 2_000; // 20% of proven volume
    uint64 constant TERM = 30 days;

    function setUp() public {
        verifier = new MockPaymentVerifier(address(this), false);
        line = new CreditLine(address(verifier), 8000, 1000);
        standing = new AttestedStanding(address(line));
        checkout = new StandingGatedCheckout(address(standing));

        vm.deal(buyer, 1_000 ether);
        vm.deal(merchant, 0);
        vm.deal(merchant2, 0);

        _setPolicy(merchant, 650, 0, 1 days, TERM, MAX_DEFERRED, ADVANCE_BPS);
        _setPolicy(merchant2, 650, 0, 1 days, TERM, MAX_DEFERRED, ADVANCE_BPS);
    }

    /* ------------------------------------------------------------------ helpers */

    function _setPolicy(
        address who,
        uint16 minScore,
        uint32 minPayments,
        uint64 maxAge,
        uint64 term,
        uint128 maxDeferred,
        uint16 advanceBps
    ) internal {
        vm.prank(who);
        checkout.setPolicy(minScore, minPayments, maxAge, term, maxDeferred, advanceBps);
    }

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

    /// @dev Give `who` a standing record backed by real attested volume AND a checkable
    ///      evidence reference. The balance open supplies the reference; the linked payment
    ///      supplies the volume. The real product path does both.
    function _issue(address who, uint256 volume, uint256 salt) internal {
        _openFromBalance(who, 50 ether, salt);
        _link(who, volume, salt);
        standing.refresh(who);
        assertTrue(standing.standingOf(who).evidenceRef != bytes32(0));
    }

    function _list(address who, uint128 price) internal returns (uint256 id) {
        vm.prank(who);
        id = checkout.listItem(price);
    }

    /* -------------------------------------------------------------- constructor */

    function testRejectsZeroStandingAddress() public {
        vm.expectRevert(StandingGatedCheckout.ZeroAddress.selector);
        new StandingGatedCheckout(address(0));
    }

    function testRejectsAStandingAddressWithNoCode() public {
        // Pointed at an EOA, every eligibility check would return false and read as "nobody
        // qualifies" rather than "misconfigured".
        vm.expectRevert(StandingGatedCheckout.ZeroAddress.selector);
        new StandingGatedCheckout(stranger);
    }

    function testSecondConsumerReadsOnlyTheRegistryItWasGiven() public {
        // The dependency is real, not decorative: a second consumer wired to a DIFFERENT
        // registry (backed by an empty CreditLine) refuses a buyer the first one accepts.
        MockPaymentVerifier v2 = new MockPaymentVerifier(address(this), false);
        CreditLine empty = new CreditLine(address(v2), 8000, 1000);
        AttestedStanding emptyStanding = new AttestedStanding(address(empty));
        StandingGatedCheckout other = new StandingGatedCheckout(address(emptyStanding));

        _issue(buyer, 5 ether, 1);
        vm.prank(merchant);
        other.setPolicy(650, 0, 1 days, TERM, MAX_DEFERRED, ADVANCE_BPS);
        vm.prank(merchant);
        uint256 id = other.listItem(PRICE);

        (bool ok, uint128 limit) = checkout.canDefer(buyer, merchant, PRICE);
        assertTrue(ok);
        assertEq(limit, PRICE);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.NotEligible.selector, buyer));
        vm.prank(buyer);
        other.checkout(id);
    }

    /* ------------------------------------------------------------------- policy */

    function testPolicyIsNotSetByDefault() public {
        StandingGatedCheckout.Policy memory p = checkout.policyOf(stranger);
        assertFalse(p.set);
        assertEq(p.advanceBps, 0);
    }

    function testSetPolicyStoresIt() public {
        _setPolicy(merchant, 700, 3, 2 days, 7 days, 5 ether, 1_500);
        StandingGatedCheckout.Policy memory p = checkout.policyOf(merchant);
        assertTrue(p.set);
        assertEq(p.minScore, 700);
        assertEq(p.minPayments, 3);
        assertEq(p.maxAgeSeconds, 2 days);
        assertEq(p.termSeconds, 7 days);
        assertEq(p.maxDeferred, 5 ether);
        assertEq(p.advanceBps, 1_500);
    }

    function testSetPolicyEmits() public {
        vm.expectEmit(true, false, false, true);
        emit StandingGatedCheckout.PolicySet(merchant, 650, 0, 1 days, TERM, MAX_DEFERRED, ADVANCE_BPS);
        _setPolicy(merchant, 650, 0, 1 days, TERM, MAX_DEFERRED, ADVANCE_BPS);
    }

    function testRejectsAdvanceAboveTheCeiling() public {
        // 100% of proven volume is not underwriting, so the contract refuses it.
        vm.prank(merchant);
        vm.expectRevert(
            abi.encodeWithSelector(
                StandingGatedCheckout.AdvanceTooHigh.selector, 5_001, 5_000
            )
        );
        checkout.setPolicy(650, 0, 1 days, TERM, MAX_DEFERRED, 5_001);
    }

    function testAcceptsAdvanceExactlyAtTheCeiling() public {
        _setPolicy(merchant, 650, 0, 1 days, TERM, MAX_DEFERRED, 5_000);
        assertEq(checkout.policyOf(merchant).advanceBps, 5_000);
    }

    function testRejectsZeroDeferralCeiling() public {
        vm.prank(merchant);
        vm.expectRevert(StandingGatedCheckout.ZeroValue.selector);
        checkout.setPolicy(650, 0, 1 days, TERM, 0, ADVANCE_BPS);
    }

    function testRejectsZeroTerm() public {
        vm.prank(merchant);
        vm.expectRevert(StandingGatedCheckout.ZeroValue.selector);
        checkout.setPolicy(650, 0, 1 days, 0, MAX_DEFERRED, ADVANCE_BPS);
    }

    /* --------------------------------------------------------------------- item */

    function testListingRequiresAPolicy() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.NoPolicy.selector, stranger));
        checkout.listItem(PRICE);
    }

    function testListingRejectsZeroPrice() public {
        vm.prank(merchant);
        vm.expectRevert(StandingGatedCheckout.ZeroValue.selector);
        checkout.listItem(0);
    }

    function testListingIncrementsAndRecords() public {
        uint256 a = _list(merchant, 1 ether);
        uint256 b = _list(merchant, 2 ether);
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(checkout.itemCount(), 2);

        StandingGatedCheckout.Item memory it = checkout.itemOf(b);
        assertEq(it.merchant, merchant);
        assertEq(it.price, 2 ether);
        assertEq(it.buyer, address(0));
        assertFalse(it.sold);
    }

    function testListingEmits() public {
        vm.prank(merchant);
        vm.expectEmit(true, true, false, true);
        emit StandingGatedCheckout.ItemListed(1, merchant, PRICE);
        checkout.listItem(PRICE);
    }

    /* --------------------------------------------------- the dependency is load-bearing */

    function testCheckoutRefusesARecordWithNoEvidenceReference() public {
        // Reachable: `submitAttestMultiple` does not require an open position, so a wallet
        // can hold proven volume with no position transaction hash to point at. A merchant
        // that must be able to name the proof it relied on refuses that record.
        _link(buyer, 10 ether, 1);
        standing.refresh(buyer);
        assertEq(standing.standingOf(buyer).payments, 1);
        assertEq(standing.standingOf(buyer).evidenceRef, bytes32(0));

        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.NoEvidence.selector, buyer));
        checkout.checkout(id);

        (bool ok,) = checkout.canDefer(buyer, merchant, PRICE);
        assertFalse(ok);
    }

    function testCheckoutRefusesABuyerWithNoRecord() public {
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.NotEligible.selector, buyer));
        checkout.checkout(id);
        assertFalse(checkout.itemOf(id).sold);
    }

    function testCheckoutRefusesABuyerWhoseHistoryIsSelfReportedOnly() public {
        // The buyer exists on chain but has linked no attested payment, so no record can be
        // issued. Unverified activity must not buy credit here any more than in Spark.
        _openFromBalance(buyer, 100 ether, 9);
        standing.refresh(buyer);
        // A balance-only record exists (score 650) but carries zero proven volume, so the
        // merchant's advance against volume is zero and there is nothing to defer.
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        vm.expectRevert(StandingGatedCheckout.NothingToDefer.selector);
        checkout.checkout(id);
    }

    function testCheckoutRefusesWhenScoreBelowTheMerchantsThreshold() public {
        _setPolicy(merchant, 900, 0, 0, TERM, MAX_DEFERRED, ADVANCE_BPS);
        _issue(buyer, 5 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.NotEligible.selector, buyer));
        checkout.checkout(id);
    }

    function testCheckoutRefusesWhenPaymentsBelowTheMerchantsThreshold() public {
        _setPolicy(merchant, 650, 3, 0, TERM, MAX_DEFERRED, ADVANCE_BPS);
        _issue(buyer, 5 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.NotEligible.selector, buyer));
        checkout.checkout(id);
    }

    function testCheckoutRefusesAStaleRecord() public {
        _setPolicy(merchant, 650, 0, 1 hours, TERM, MAX_DEFERRED, ADVANCE_BPS);
        _issue(buyer, 5 ether, 1);
        uint256 id = _list(merchant, PRICE);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.NotEligible.selector, buyer));
        checkout.checkout(id);
    }

    function testAFresherRecordRestoresEligibility() public {
        _setPolicy(merchant, 650, 0, 1 hours, TERM, MAX_DEFERRED, ADVANCE_BPS);
        _issue(buyer, 5 ether, 1);
        uint256 id = _list(merchant, PRICE);

        vm.warp(block.timestamp + 2 hours);
        standing.refresh(buyer); // permissionless, so anyone can keep a record current
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);
        assertEq(checkout.orderOf(orderId).deferred, 1 ether);
    }

    /* ------------------------------------------------------------------- sizing */

    function testDeferralIsCappedByTheAdvanceAgainstProvenVolume() public {
        // 20% of 2 ether proven volume is 0.4 ether, and the item costs 1 ether, so the
        // merchant defers only what it can justify.
        _issue(buyer, 2 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);
        assertEq(checkout.orderOf(orderId).deferred, 0.4 ether);
    }

    function testDeferralIsCappedByPrice() public {
        // Proven volume allows far more than the item costs; the item still wins.
        _issue(buyer, 100 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);
        assertEq(checkout.orderOf(orderId).deferred, PRICE);
    }

    function testDeferralIsCappedByTheBuyersOutstandingRoom() public {
        // 20% of 100 ether is 20 ether, but the merchant's ceiling is MAX_DEFERRED.
        _issue(buyer, 100 ether, 1);
        uint256 first = _list(merchant, 10 ether);
        vm.prank(buyer);
        checkout.checkout(first);
        assertEq(checkout.outstanding(buyer, merchant), MAX_DEFERRED);

        // Room exhausted: the next order has nothing left to draw on.
        uint256 second = _list(merchant, PRICE);
        vm.prank(buyer);
        vm.expectRevert(StandingGatedCheckout.NothingToDefer.selector);
        checkout.checkout(second);
    }

    function testOutstandingRoomIsPerMerchantNotShared() public {
        // Merchant A consuming its ceiling must not consume merchant B's.
        _issue(buyer, 100 ether, 1);
        uint256 a = _list(merchant, 10 ether);
        vm.prank(buyer);
        checkout.checkout(a);

        uint256 b = _list(merchant2, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(b);
        assertEq(checkout.orderOf(orderId).deferred, PRICE);
        assertEq(checkout.outstanding(buyer, merchant), MAX_DEFERRED);
        assertEq(checkout.outstanding(buyer, merchant2), PRICE);
    }

    /* --------------------------------------------------------------- snapshotting */

    function testOrderSnapshotsTheEvidenceItWasDecidedOn() public {
        _issue(buyer, 10 ether, 1);
        AttestedStanding.Standing memory before = standing.standingOf(buyer);

        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);

        StandingGatedCheckout.Order memory o = checkout.orderOf(orderId);
        assertEq(o.evidenceRef, before.evidenceRef);
        assertEq(o.scoreAtDecision, before.score);
        assertEq(o.paymentsAtDecision, before.payments);
        assertTrue(o.evidenceRef != bytes32(0));
        assertEq(o.merchant, merchant);
        assertEq(o.buyer, buyer);
        assertEq(o.dueAt, uint64(block.timestamp) + TERM);
        assertFalse(o.closed);
    }

    function testALaterRecordChangeCannotRewriteAnExistingOrder() public {
        // The merchant agreed to terms on facts X; a subsequent refresh must not alter what
        // the merchant can show a counterparty it relied on.
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);

        StandingGatedCheckout.Order memory beforeSnap = checkout.orderOf(orderId);
        uint128 volumeBefore = standing.standingOf(buyer).volume;

        _link(buyer, 40 ether, 2);
        standing.refresh(buyer);

        StandingGatedCheckout.Order memory afterSnap = checkout.orderOf(orderId);
        assertEq(afterSnap.evidenceRef, beforeSnap.evidenceRef);
        assertEq(afterSnap.scoreAtDecision, beforeSnap.scoreAtDecision);
        assertEq(afterSnap.paymentsAtDecision, beforeSnap.paymentsAtDecision);
        // The record itself did move; only the snapshot is frozen.
        assertGt(standing.standingOf(buyer).volume, volumeBefore);
    }

    function testCheckoutEmitsTheDecision() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        AttestedStanding.Standing memory s = standing.standingOf(buyer);

        vm.expectEmit(true, true, true, true);
        emit StandingGatedCheckout.Deferred(
            1, id, buyer, PRICE, s.evidenceRef, s.score, s.payments, uint64(block.timestamp) + TERM
        );
        vm.prank(buyer);
        checkout.checkout(id);
    }

    function testCheckoutMarksTheItemSoldAndAssignsTheBuyer() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        checkout.checkout(id);

        StandingGatedCheckout.Item memory it = checkout.itemOf(id);
        assertTrue(it.sold);
        assertEq(it.buyer, buyer);
    }

    function testAnItemCanOnlyBeSoldOnce() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        checkout.checkout(id);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.ItemAlreadySold.selector, id));
        checkout.checkout(id);
    }

    function testCheckoutRejectsAnUnknownItem() public {
        _issue(buyer, 10 ether, 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.UnknownItem.selector, 99));
        checkout.checkout(99);
    }

    /* ------------------------------------------------------------------- settle */

    function testSettlePaysTheMerchantAndClearsTheRoom() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);

        vm.prank(buyer);
        checkout.settle{value: PRICE}(orderId);

        assertEq(merchant.balance, PRICE);
        assertEq(checkout.outstanding(buyer, merchant), 0);
        assertTrue(checkout.orderOf(orderId).closed);
    }

    function testSettleEmitsBothEvents() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);

        vm.expectEmit(true, true, false, true);
        emit StandingGatedCheckout.Settled(orderId, merchant, PRICE);
        vm.prank(buyer);
        checkout.settle{value: PRICE}(orderId);
    }

    function testSettleRejectsAnUnknownOrder() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.UnknownOrder.selector, 7));
        checkout.settle{value: PRICE}(7);
    }

    function testSettleRejectsTheWrongAmount() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(StandingGatedCheckout.WrongAmount.selector, PRICE, 0.5 ether)
        );
        checkout.settle{value: 0.5 ether}(orderId);
    }

    function testSettleRejectsAnUnderpaymentOfOneWei() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(StandingGatedCheckout.WrongAmount.selector, PRICE, PRICE - 1)
        );
        checkout.settle{value: PRICE - 1}(orderId);
    }

    function testSettleRejectsSomeoneOtherThanTheBuyer() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);

        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.NotBuyer.selector, stranger));
        checkout.settle{value: PRICE}(orderId);
    }

    function testSettleRejectsASecondPayment() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);
        vm.prank(buyer);
        checkout.settle{value: PRICE}(orderId);

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(StandingGatedCheckout.OrderAlreadyClosed.selector, orderId)
        );
        checkout.settle{value: PRICE}(orderId);
    }

    function testSettleFailsLoudlyWhenTheMerchantCannotReceive() public {
        // The order must not end up marked closed with the value stranded.
        RejectingReceiver badMerchant = new RejectingReceiver();
        vm.prank(address(badMerchant));
        checkout.setPolicy(650, 0, 1 days, TERM, MAX_DEFERRED, ADVANCE_BPS);
        vm.prank(address(badMerchant));
        uint256 id = checkout.listItem(PRICE);

        _issue(buyer, 10 ether, 1);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);

        vm.prank(buyer);
        vm.expectRevert(StandingGatedCheckout.TransferFailed.selector);
        checkout.settle{value: PRICE}(orderId);

        assertFalse(checkout.orderOf(orderId).closed);
        assertEq(checkout.outstanding(buyer, address(badMerchant)), PRICE);
    }

    /* ----------------------------------------------------------------- overdue */

    function testOverdueIsFalseBeforeTheDueDate() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);

        assertFalse(checkout.isOverdue(orderId));
        vm.warp(block.timestamp + TERM - 1);
        assertFalse(checkout.isOverdue(orderId));
    }

    function testOverdueBecomesTrueAfterTheDueDate() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);

        vm.warp(block.timestamp + TERM + 1);
        assertTrue(checkout.isOverdue(orderId));
    }

    function testASettledOrderIsNeverOverdue() public {
        _issue(buyer, 10 ether, 1);
        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);
        vm.prank(buyer);
        checkout.settle{value: PRICE}(orderId);

        vm.warp(block.timestamp + TERM + 1 days);
        assertFalse(checkout.isOverdue(orderId));
    }

    function testAnUnknownOrderIsNotOverdue() public {
        assertFalse(checkout.isOverdue(42));
    }

    /* -------------------------------------------------------------- pre-check view */

    function testCanDeferIsFalseWithoutAPolicy() public {
        _issue(buyer, 10 ether, 1);
        (bool ok, uint128 limit) = checkout.canDefer(buyer, stranger, PRICE);
        assertFalse(ok);
        assertEq(limit, 0);
    }

    function testCanDeferIsFalseForABuyerWithNoRecord() public {
        (bool ok, uint128 limit) = checkout.canDefer(buyer, merchant, PRICE);
        assertFalse(ok);
        assertEq(limit, 0);
    }

    function testCanDeferAgreesWithWhatCheckoutActuallyDoes() public {
        _issue(buyer, 2 ether, 1);
        uint256 id = _list(merchant, PRICE);

        (bool ok, uint128 limit) = checkout.canDefer(buyer, merchant, PRICE);
        assertTrue(ok);
        assertEq(limit, 0.4 ether);

        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);
        assertEq(checkout.orderOf(orderId).deferred, limit);
    }

    function testCanDeferShrinksAsRoomIsConsumed() public {
        _issue(buyer, 100 ether, 1);
        (bool ok,) = checkout.canDefer(buyer, merchant, 20 ether);
        assertTrue(ok);

        uint256 id = _list(merchant, 4 ether);
        vm.prank(buyer);
        checkout.checkout(id);

        (, uint128 limit) = checkout.canDefer(buyer, merchant, 20 ether);
        // 10 ether ceiling minus 4 ether already deferred.
        assertEq(limit, 6 ether);
    }

    function testCanDeferNeverExceedsTheItemsPrice() public {
        _issue(buyer, 100 ether, 1);
        (, uint128 limit) = checkout.canDefer(buyer, merchant, 0.25 ether);
        assertEq(limit, 0.25 ether);
    }

    /* -------------------------------------------------------- end-to-end lifecycle */

    function testFullLifecycle() public {
        // Prove standing, defer, settle, and confirm nothing is left outstanding.
        _issue(buyer, 5 ether, 1);
        assertEq(standing.standingOf(buyer).payments, 1);

        uint256 id = _list(merchant, 1 ether);
        vm.prank(buyer);
        uint256 orderId = checkout.checkout(id);

        uint128 deferred = checkout.orderOf(orderId).deferred;
        assertEq(deferred, 1 ether);
        assertEq(checkout.outstanding(buyer, merchant), 1 ether);

        vm.prank(buyer);
        checkout.settle{value: deferred}(orderId);

        assertEq(merchant.balance, 1 ether);
        assertEq(checkout.outstanding(buyer, merchant), 0);
        assertTrue(checkout.orderOf(orderId).closed);
        assertEq(checkout.orderCount(), 1);
    }

    function testStandingGrowsAndTheSameMerchantLendsMore() public {
        // Proven history is not a one-shot: more attested payments raise both the score and
        // the volume this merchant will advance against.
        _issue(buyer, 2 ether, 1);
        (, uint128 first) = checkout.canDefer(buyer, merchant, PRICE);
        assertEq(first, 0.4 ether);

        _link(buyer, 8 ether, 2);
        standing.refresh(buyer);
        (, uint128 second) = checkout.canDefer(buyer, merchant, PRICE);
        assertEq(second, PRICE);
        assertGt(second, first);
    }

    function testTwoBuyersAreGatedIndependently() public {
        _issue(buyer, 10 ether, 1);

        uint256 id = _list(merchant, PRICE);
        vm.prank(buyer);
        checkout.checkout(id);

        // A second buyer with no attested activity is refused by the same policy.
        uint256 second = _list(merchant, PRICE);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(StandingGatedCheckout.NotEligible.selector, stranger));
        checkout.checkout(second);
    }
}
