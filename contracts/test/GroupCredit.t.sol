// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestedStanding} from "../src/AttestedStanding.sol";
import {GroupCredit} from "../src/GroupCredit.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {MockPaymentVerifier} from "../src/MockPaymentVerifier.sol";
import {IPaymentVerifier} from "../src/interfaces/IPaymentVerifier.sol";

/**
 * @title GroupCreditTest
 * @notice Covers attested group credit: admission behind a verified payment, vouching that
 *         is priced off the voucher's own proven history, and the invariant that a group's
 *         line can never exceed the aggregate history its members actually proved.
 *
 *         The invariant tests are the point. A group product that can be talked into a line
 *         larger than its evidence is worse than no group product, because it fails in
 *         exactly the way decentralised credit is criticised for.
 */
contract GroupCreditTest is Test {
    MockPaymentVerifier verifier;
    CreditLine line;
    AttestedStanding standing;
    GroupCredit group;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA401);
    address dave = address(0xDA7E);
    address mallory = address(0x4A11);

    function setUp() public {
        verifier = new MockPaymentVerifier(address(this), false);
        line = new CreditLine(address(verifier), 8000, 1000);
        standing = new AttestedStanding(address(line));
        group = new GroupCredit(address(standing));

        address[4] memory people = [alice, bob, carol, dave];
        for (uint256 i = 0; i < people.length; i++) {
            vm.deal(people[i], 100 ether);
        }
    }

    /* ------------------------------------------------------------------ helpers */

    function _pay(address who, uint256 amount, uint256 salt) internal {
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

    /// @dev Full path to standing: prove a payment, then refresh the portable record.
    function _attest(address who, uint256 amount, uint256 salt) internal {
        _pay(who, amount, salt);
        standing.refresh(who);
    }

    function _newGroup(uint32 maxMembers) internal returns (bytes32 gid) {
        gid = group.createGroup(maxMembers);
    }

    /* -------------------------------------------------------------- group basics */

    function testCreateGroupValidatesSize() public {
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.BadMaxMembers.selector, 0));
        group.createGroup(0);

        vm.expectRevert(abi.encodeWithSelector(GroupCredit.BadMaxMembers.selector, 65));
        group.createGroup(65);

        bytes32 gid = group.createGroup(64);
        assertEq(group.getGroup(gid).creator, address(this));
        assertEq(group.getGroup(gid).maxMembers, 64);
    }

    function testUnknownGroupCannotBeActedOn() public {
        // getGroup is a mapping read and returns zeros for an unknown id, which is normal.
        // What matters is that every state-changing path refuses, so a zeroed read can
        // never be followed by a write that treats it as real.
        bytes32 nope = keccak256("nope");

        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NoSuchGroup.selector, nope));
        group.joinGroup(nope);

        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NoSuchGroup.selector, nope));
        group.draw(nope, 1);

        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NoSuchGroup.selector, nope));
        group.repay(nope, 1);

        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NoSuchGroup.selector, nope));
        group.vouch(nope, bob);

        // And it has no credit, so a zeroed read is inert rather than dangerous.
        assertEq(group.groupLimit(nope), 0);
    }

    function testAnEmptyGroupHasNoCreditAtAll() public {
        bytes32 gid = _newGroup(4);

        assertEq(group.groupLimit(gid), 0);
        assertEq(group.availableCredit(gid), 0);
    }

    function testCreatorGetsNoCreditUntilTheyJoin() public {
        // The creator has no special standing. Joining is the only door, and joining
        // requires a verified payment.
        bytes32 gid = _newGroup(4);

        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NotAMember.selector, gid, address(this)));
        group.draw(gid, 1);
    }

    /* ------------------------------------------------------------- admission gate */

    function testJoiningRequiresAVerifiedPayment() public {
        bytes32 gid = _newGroup(4);

        // No payment proved, no standing record, no membership.
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NotEnoughStanding.selector, bob, 0));
        group.joinGroup(gid);

        _attest(bob, 1 ether, 1);

        vm.prank(bob);
        group.joinGroup(gid);
        assertTrue(group.getMember(gid, bob).active);
        assertEq(group.getGroup(gid).memberCount, 1);
    }

    function testABalanceOnlyWalletCannotJoin() public {
        // A proven balance is real evidence, but it is not a payment, and membership is a
        // claim about payment behaviour.
        IPaymentVerifier.PaymentClaim memory c = IPaymentVerifier.PaymentClaim({
            txHash: keccak256("bal-join"),
            payer: bob,
            amount: 10 ether,
            kind: 3
        });
        vm.prank(bob);
        line.openCreditFromBalance(c, abi.encode(c.txHash, c.payer, c.amount, c.kind));
        standing.refresh(bob);

        bytes32 gid = _newGroup(4);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NotEnoughStanding.selector, bob, 0));
        group.joinGroup(gid);
    }

    function testCannotJoinTwice() public {
        bytes32 gid = _newGroup(4);
        _attest(bob, 1 ether, 1);

        vm.prank(bob);
        group.joinGroup(gid);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.AlreadyJoined.selector, gid, bob));
        group.joinGroup(gid);
    }

    function testGroupSizeIsEnforced() public {
        bytes32 gid = _newGroup(2);
        _attest(bob, 1 ether, 1);
        _attest(carol, 1 ether, 2);
        _attest(dave, 1 ether, 3);

        vm.prank(bob);
        group.joinGroup(gid);
        vm.prank(carol);
        group.joinGroup(gid);

        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.GroupFull.selector, gid));
        group.joinGroup(gid);
    }

    /* --------------------------------------------------------------------- sizing */

    function testLimitIsHalfOfAggregateProven() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 4 ether, 1);

        vm.prank(alice);
        group.joinGroup(gid);

        assertEq(group.getGroup(gid).aggregateProven, 4 ether);
        // 50% of 4 ETH.
        assertEq(group.groupLimit(gid), 2 ether);
    }

    function testLimitGrowsWithEveryMemberWhoActuallyProves() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 2 ether, 1);
        _attest(bob, 3 ether, 2);

        vm.prank(alice);
        group.joinGroup(gid);
        vm.prank(bob);
        group.joinGroup(gid);

        assertEq(group.getGroup(gid).aggregateProven, 5 ether);
        assertEq(group.groupLimit(gid), 2.5 ether);
    }

    function testSyncPicksUpNewPaymentsAndGrowsTheLine() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 1 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);
        assertEq(group.groupLimit(gid), 0.5 ether);

        // Prove more, refresh the record, then sync the group. Order matters and is tested
        // again below: syncing before refreshing sees the stale number.
        _attest(alice, 1 ether, 2);
        group.syncMember(gid, alice);

        assertEq(group.getMember(gid, alice).proven, 2 ether);
        assertEq(group.getGroup(gid).aggregateProven, 2 ether);
        assertEq(group.groupLimit(gid), 1 ether);
    }

    function testSyncWithoutNewEvidenceIsRefused() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 1 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NothingToSync.selector, gid, alice));
        group.syncMember(gid, alice);
    }

    function testSyncRequiresMembership() public {
        bytes32 gid = _newGroup(4);
        _attest(bob, 1 ether, 1);

        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NotAMember.selector, gid, bob));
        group.syncMember(gid, bob);
    }

    /* ------------------------------------------------------------------- vouching */

    function testVouchExtendsAShareOfTheVouchersOwnHistory() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 10 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        vm.prank(alice);
        uint256 credit = group.vouch(gid, bob);

        // 10% of alice's own 10 ETH.
        assertEq(credit, 1 ether);
        assertEq(group.vouchCreditOf(gid, alice, bob), 1 ether);
        assertEq(group.getGroup(gid).vouchedCredit, 1 ether);
        // base 5 ETH + boost 1 ETH.
        assertEq(group.groupLimit(gid), 6 ether);
    }

    function testCannotVouchForYourself() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 10 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        vm.prank(alice);
        vm.expectRevert(GroupCredit.CannotVouchForSelf.selector);
        group.vouch(gid, alice);
    }

    function testCannotVouchWithoutProvenHistory() public {
        bytes32 gid = _newGroup(4);
        // Bob has a verified payment large enough to join, but is not yet a member, so he
        // cannot vouch for anyone.
        _attest(bob, 1 ether, 1);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NotAMember.selector, gid, bob));
        group.vouch(gid, carol);
    }

    function testAMemberBelowTheVouchFloorIsRefused() public {
        bytes32 gid = _newGroup(4);
        // 0.0005 ETH of history is above zero but below MIN_PROVEN_TO_VOUCH (0.001).
        _attest(alice, 5e14, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NotEnoughProvenToVouch.selector, alice, 5e14));
        group.vouch(gid, bob);
    }

    function testCannotVouchTwiceForTheSameNewcomer() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 10 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        vm.prank(alice);
        group.vouch(gid, bob);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.AlreadyVouched.selector, gid, alice, bob));
        group.vouch(gid, bob);
    }

    function testCannotVouchForAnExistingMember() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 10 ether, 1);
        _attest(bob, 1 ether, 2);
        vm.prank(alice);
        group.joinGroup(gid);
        vm.prank(bob);
        group.joinGroup(gid);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NewcomerAlreadyMember.selector, gid, bob));
        group.vouch(gid, bob);
    }

    /* ------------------------------------------------- the invariant, under pressure */

    function testVouchBoostIsCappedAtThePolicyCeiling() public {
        bytes32 gid = _newGroup(8);
        _attest(alice, 100 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        // Four vouches, each worth 10 ETH, so 40 ETH of vouch credit against a 20 ETH cap.
        vm.startPrank(alice);
        group.vouch(gid, bob);
        group.vouch(gid, carol);
        group.vouch(gid, dave);
        group.vouch(gid, address(0xF00D));
        vm.stopPrank();

        assertEq(group.getGroup(gid).vouchedCredit, 40 ether);
        // base 50 ETH + boost capped at 20 ETH, not 40.
        assertEq(group.groupLimit(gid), 70 ether);
    }

    function testLimitNeverExceedsAggregateProven() public {
        bytes32 gid = _newGroup(8);
        _attest(alice, 100 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        vm.startPrank(alice);
        for (uint256 i = 0; i < 20; i++) {
            // Safe: 0x5000 + i is at most 0x5013, far inside uint160.
            // forge-lint: disable-next-line(unsafe-typecast)
            group.vouch(gid, address(uint160(0x5000 + i)));
        }
        vm.stopPrank();

        uint256 limit = group.groupLimit(gid);
        assertEq(limit, 70 ether);
        assertLe(limit, group.getGroup(gid).aggregateProven);
    }

    function testVouchingCannotCreateCreditFromNothing() public {
        // The strongest form of the invariant: with no proven history anywhere, no amount
        // of vouching produces a line. It cannot even be attempted, because vouching itself
        // requires proven history — the two rules together close the loophole.
        bytes32 gid = _newGroup(4);
        assertEq(group.groupLimit(gid), 0);

        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NotAMember.selector, gid, mallory));
        group.vouch(gid, bob);

        assertEq(group.groupLimit(gid), 0);
    }

    function testVouchIsPricedOffTheVoucherNotTheNewcomer() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 10 ether, 1);
        // Bob's own history is irrelevant to the credit alice extends on his behalf.
        _attest(bob, 0.002 ether, 2);
        vm.prank(alice);
        group.joinGroup(gid);

        vm.prank(alice);
        uint256 credit = group.vouch(gid, bob);

        assertEq(credit, 1 ether); // 10% of ALICE's 10 ETH, not of bob's dust
    }

    /* ------------------------------------------------------------------- drawing */

    function testDrawIsBoundedByTheSharedLine() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 4 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        vm.prank(alice);
        group.draw(gid, 1 ether);
        assertEq(group.getGroup(gid).drawn, 1 ether);
        assertEq(group.availableCredit(gid), 1 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.ExceedsGroupLimit.selector, 3 ether, 1 ether));
        group.draw(gid, 3 ether);
    }

    function testNonMembersCannotDrawOrRepay() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 4 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NotAMember.selector, gid, bob));
        group.draw(gid, 1 ether);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.NotAMember.selector, gid, bob));
        group.repay(gid, 1 ether);
    }

    function testZeroDrawIsRefused() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 4 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        vm.prank(alice);
        vm.expectRevert(GroupCredit.ZeroAmount.selector);
        group.draw(gid, 0);
    }

    function testRepayReducesTheSharedDrawnAmount() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 4 ether, 1);
        _attest(bob, 4 ether, 2);
        vm.prank(alice);
        group.joinGroup(gid);
        vm.prank(bob);
        group.joinGroup(gid);

        vm.prank(alice);
        group.draw(gid, 2 ether);
        // A shared line: any member may reduce it.
        vm.prank(bob);
        group.repay(gid, 1 ether);

        assertEq(group.getGroup(gid).drawn, 1 ether);
        assertEq(group.availableCredit(gid), 3 ether); // limit 4 ETH - drawn 1 ETH
    }

    function testCannotRepayMoreThanWasDrawn() public {
        bytes32 gid = _newGroup(4);
        _attest(alice, 4 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        vm.prank(alice);
        group.draw(gid, 1 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.ExceedsGroupLimit.selector, 2 ether, 1 ether));
        group.repay(gid, 2 ether);
    }

    function testJoiningRaisedTheLineOnlyBecauseAProvenPaymentArrived() public {
        // End to end: one wallet proves one payment, and that single verified fact is the
        // entire reason the group has any credit at all.
        bytes32 gid = _newGroup(4);
        assertEq(group.groupLimit(gid), 0);

        _attest(alice, 3 ether, 1);
        vm.prank(alice);
        group.joinGroup(gid);

        assertGt(group.groupLimit(gid), 0);
        assertEq(group.groupLimit(gid), 1.5 ether);
    }

    function testConstructorRejectsAnAddressWithNoCode() public {
        vm.expectRevert(abi.encodeWithSelector(GroupCredit.StandingHasNoCode.selector, bob));
        new GroupCredit(bob);
    }

    function testPolicyConstantsAreWhatTheDocsSay() public view {
        assertEq(group.GROUP_LTV_BPS(), 5_000);
        assertEq(group.MAX_VOUCH_BOOST_BPS(), 2_000);
        assertEq(group.VOUCH_CREDIT_BPS(), 1_000);
        assertEq(group.MIN_PAYMENTS_TO_JOIN(), 1);
        assertEq(group.MIN_PROVEN_TO_VOUCH(), 1e15);
    }
}
