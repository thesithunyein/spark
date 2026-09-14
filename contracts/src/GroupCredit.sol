// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AttestedStanding} from "./AttestedStanding.sol";

/**
 * @title GroupCredit
 * @notice A shared credit line whose size is bounded by the aggregate Attestcoin-verified
 *         payment history of its members, with vouching that amplifies evidence and can
 *         never replace it.
 *
 * ── Why a group, and why this is the growth mechanic ────────────────────────
 * A solo credit line is used alone, so it acquires users one at a time and only if they
 * already decided they want credit. A group is used by people who know each other, which
 * means every member is a distribution channel for the next one — and it is the shape
 * that has actually won this hackathon series: the previous season's Grand Prize was a
 * rotating savings circle delivered as a group app.
 *
 * The admission rule is the part that matters: you cannot join until at least one of your
 * payments is an Attestcoin-verified event. Membership is therefore evidence, and a group
 * cannot be padded with addresses that never transacted.
 *
 * ── The invariant that keeps this honest ────────────────────────────────────
 *   limit = min(base + boost, aggregateProven)
 *   base  = aggregateProven * GROUP_LTV_BPS / 10_000          (50%)
 *   boost = min(vouchedCredit, aggregateProven * MAX_VOUCH_BOOST_BPS / 10_000)
 *
 * Three consequences, each enforced rather than asserted:
 *   1. A group with no proven history has NO credit, however many vouches it collects.
 *      Vouching scales a line that evidence already justifies; it can never manufacture one.
 *   2. The line can never exceed the members' aggregate proven history. There is no path to
 *      a loan larger than the evidence behind it.
 *   3. A vouch is priced off the VOUCHER's own proven amount, so a member can only extend
 *      credit in proportion to what they have themselves proved. One wealthy member cannot
 *      underwrite an unlimited number of strangers.
 *
 * ── Scope ──────────────────────────────────────────────────────────────────
 * This is a shared line, not individual credit: `drawn` is group-level, and `repay` reduces
 * it from any member. Per-member exposure accounting is the next step and is not claimed
 * here. Written after the BUIDL CTC 2026 Fall submission deadline and labelled as such.
 */
contract GroupCredit {
    struct Group {
        address creator;
        uint32 maxMembers;
        uint32 memberCount;
        /// @notice Sum of members' attested payment volumes. Grows only via `syncMember`,
        ///         which reads a record that could only be issued behind a proof.
        uint256 aggregateProven;
        /// @notice Running sum of vouch credits, bounded by MAX_VOUCH_BOOST_BPS of the above.
        uint256 vouchedCredit;
        /// @notice Outstanding amount drawn against the shared line.
        uint256 drawn;
        bool open;
    }

    struct Membership {
        /// @notice This member's attested payment volume at last sync.
        uint256 proven;
        /// @notice Vouches received from other members.
        uint32 vouchesIn;
        bool active;
    }

    /// @notice Share of aggregate proven history a group may draw, in bps (50%).
    uint256 public constant GROUP_LTV_BPS = 5_000;
    /// @notice Ceiling on how much vouching can add, in bps of aggregate proven history.
    ///         Vouching moves the line from 50% to at most 70%; it cannot approach 100%.
    uint256 public constant MAX_VOUCH_BOOST_BPS = 2_000;
    /// @notice A vouch is worth this share of the VOUCHER's own proven volume, in bps (10%).
    uint256 public constant VOUCH_CREDIT_BPS = 1_000;
    /// @notice Attested payments required to join. One verified payment, not zero.
    uint32 public constant MIN_PAYMENTS_TO_JOIN = 1;
    /// @notice Proven volume required before a member may vouch for anyone (0.001 units).
    uint256 public constant MIN_PROVEN_TO_VOUCH = 1e15;
    /// @notice Sanity bound on group size, so a group is a group.
    uint32 public constant MAX_MEMBERS_LIMIT = 64;

    AttestedStanding public immutable standing;

    mapping(bytes32 => Group) internal _groups;
    mapping(bytes32 => mapping(address => Membership)) internal _members;
    /// @notice Vouch credit granted, keyed by group, voucher, and newcomer. Stored so the
    ///         contribution stays auditable after the fact instead of being a running total
    ///         nobody can decompose.
    mapping(bytes32 => mapping(address => mapping(address => uint256))) internal _vouchCredit;
    /// @notice One vouch per (group, voucher, newcomer) pair.
    mapping(bytes32 => mapping(address => mapping(address => bool))) internal _vouched;

    uint32 internal _nonce;

    event GroupCreated(bytes32 indexed groupId, address indexed creator, uint32 maxMembers);
    event MemberJoined(bytes32 indexed groupId, address indexed member, uint256 proven);
    event MemberSynced(bytes32 indexed groupId, address indexed member, uint256 proven, uint256 aggregateProven);
    event Vouched(bytes32 indexed groupId, address indexed voucher, address indexed newcomer, uint256 credit);
    event Drawn(bytes32 indexed groupId, address indexed member, uint256 amount, uint256 groupDrawn);
    event Repaid(bytes32 indexed groupId, address indexed payer, uint256 amount, uint256 groupDrawn);

    error ZeroAddress();
    error StandingHasNoCode(address standing);
    error BadMaxMembers(uint32 given);
    error NoSuchGroup(bytes32 groupId);
    error GroupNotOpen(bytes32 groupId);
    error AlreadyJoined(bytes32 groupId, address member);
    error NotAMember(bytes32 groupId, address member);
    error GroupFull(bytes32 groupId);
    error NotEnoughStanding(address member, uint32 payments);
    error NotEnoughProvenToVouch(address voucher, uint256 proven);
    error CannotVouchForSelf();
    error AlreadyVouched(bytes32 groupId, address voucher, address newcomer);
    error NewcomerAlreadyMember(bytes32 groupId, address newcomer);
    error ExceedsGroupLimit(uint256 requested, uint256 available);
    error NothingToSync(bytes32 groupId, address member);
    error ZeroAmount();

    constructor(address standing_) {
        if (standing_ == address(0)) revert ZeroAddress();
        // Pointing at a dead address would make the admission gate silently unfailable.
        if (standing_.code.length == 0) revert StandingHasNoCode(standing_);
        standing = AttestedStanding(standing_);
    }

    // ── creation ────────────────────────────────────────────────────────────────

    function createGroup(uint32 maxMembers) external returns (bytes32 groupId) {
        if (maxMembers == 0 || maxMembers > MAX_MEMBERS_LIMIT) revert BadMaxMembers(maxMembers);

        groupId = keccak256(abi.encodePacked(msg.sender, _nonce++, block.chainid));
        _groups[groupId] = Group({
            creator: msg.sender,
            maxMembers: maxMembers,
            memberCount: 0,
            aggregateProven: 0,
            vouchedCredit: 0,
            drawn: 0,
            open: true
        });

        emit GroupCreated(groupId, msg.sender, maxMembers);
    }

    // ── membership ──────────────────────────────────────────────────────────────

    /**
     * @notice Join a group. Requires a standing record with at least one verified payment.
     * @dev    The gate reads `payments`, not `score`, because CreditLine's score floor is
     *         650 even with zero attestations — so a score threshold would admit a wallet
     *         that proved nothing. One verified payment is the smallest real evidence.
     */
    function joinGroup(bytes32 groupId) external {
        Group storage g = _requireGroup(groupId);
        address m = msg.sender;

        if (!g.open) revert GroupNotOpen(groupId);
        if (_members[groupId][m].active) revert AlreadyJoined(groupId, m);
        if (g.memberCount >= g.maxMembers) revert GroupFull(groupId);

        AttestedStanding.Standing memory s = standing.standingOf(m);
        if (!s.issued || s.payments < MIN_PAYMENTS_TO_JOIN) {
            revert NotEnoughStanding(m, s.payments);
        }

        _members[groupId][m] = Membership({proven: s.volume, vouchesIn: 0, active: true});
        g.memberCount += 1;
        g.aggregateProven += s.volume;

        emit MemberJoined(groupId, m, s.volume);
    }

    /**
     * @notice Re-read a member's standing and update the group. Permissionless.
     * @dev    Anyone may call this, which is deliberate: nothing here can fabricate a
     *         number, because `AttestedStanding.refresh` will only issue against verified
     *         activity. A group's limit therefore tracks reality without anyone's
     *         cooperation.
     */
    function syncMember(bytes32 groupId, address member) external {
        Group storage g = _requireGroup(groupId);
        Membership storage ms = _members[groupId][member];
        if (!ms.active) revert NotAMember(groupId, member);

        AttestedStanding.Standing memory s = standing.standingOf(member);
        uint256 fresh = s.volume;
        if (fresh <= ms.proven) revert NothingToSync(groupId, member);

        uint256 delta = fresh - ms.proven;
        ms.proven = fresh;
        g.aggregateProven += delta;

        emit MemberSynced(groupId, member, fresh, g.aggregateProven);
    }

    // ── vouching ────────────────────────────────────────────────────────────────

    /**
     * @notice Vouch for a newcomer. The credit you extend is a share of YOUR OWN proven
     *         history, so standing is what underwrites, never the claim of a relationship.
     */
    function vouch(bytes32 groupId, address newcomer) external returns (uint256 credit) {
        Group storage g = _requireGroup(groupId);
        address voucher = msg.sender;

        if (newcomer == address(0)) revert ZeroAddress();
        if (newcomer == voucher) revert CannotVouchForSelf();

        Membership storage vms = _members[groupId][voucher];
        if (!vms.active) revert NotAMember(groupId, voucher);
        if (vms.proven < MIN_PROVEN_TO_VOUCH) {
            revert NotEnoughProvenToVouch(voucher, vms.proven);
        }
        if (_members[groupId][newcomer].active) revert NewcomerAlreadyMember(groupId, newcomer);
        if (_vouched[groupId][voucher][newcomer]) {
            revert AlreadyVouched(groupId, voucher, newcomer);
        }

        credit = (vms.proven * VOUCH_CREDIT_BPS) / 10_000;
        if (credit == 0) revert NotEnoughProvenToVouch(voucher, vms.proven);

        _vouched[groupId][voucher][newcomer] = true;
        _vouchCredit[groupId][voucher][newcomer] = credit;
        g.vouchedCredit += credit;

        emit Vouched(groupId, voucher, newcomer, credit);
    }

    // ── sizing and drawing ──────────────────────────────────────────────────────

    /// @notice The shared line: base from proven history, plus a bounded vouch boost, and
    ///         never more than the aggregate proven history itself.
    function groupLimit(bytes32 groupId) public view returns (uint256) {
        Group storage g = _groups[groupId];
        if (!g.open || g.aggregateProven == 0) return 0;

        uint256 base = (g.aggregateProven * GROUP_LTV_BPS) / 10_000;
        uint256 boostCap = (g.aggregateProven * MAX_VOUCH_BOOST_BPS) / 10_000;
        uint256 boost = g.vouchedCredit < boostCap ? g.vouchedCredit : boostCap;

        uint256 limit = base + boost;
        return limit > g.aggregateProven ? g.aggregateProven : limit;
    }

    function availableCredit(bytes32 groupId) external view returns (uint256) {
        uint256 limit = groupLimit(groupId);
        Group storage g = _groups[groupId];
        return limit > g.drawn ? limit - g.drawn : 0;
    }

    function draw(bytes32 groupId, uint256 amount) external {
        Group storage g = _requireGroup(groupId);
        if (!_members[groupId][msg.sender].active) revert NotAMember(groupId, msg.sender);
        // A dedicated error rather than ExceedsGroupLimit(0, 0), which would tell the caller
        // their available credit is zero when in fact they asked for nothing.
        if (amount == 0) revert ZeroAmount();

        uint256 limit = groupLimit(groupId);
        uint256 available = limit > g.drawn ? limit - g.drawn : 0;
        if (amount > available) revert ExceedsGroupLimit(amount, available);

        g.drawn += amount;
        emit Drawn(groupId, msg.sender, amount, g.drawn);
    }

    function repay(bytes32 groupId, uint256 amount) external {
        Group storage g = _requireGroup(groupId);
        if (!_members[groupId][msg.sender].active) revert NotAMember(groupId, msg.sender);
        if (amount > g.drawn) revert ExceedsGroupLimit(amount, g.drawn);

        g.drawn -= amount;
        emit Repaid(groupId, msg.sender, amount, g.drawn);
    }

    // ── reads ───────────────────────────────────────────────────────────────────

    function getGroup(bytes32 groupId) external view returns (Group memory) {
        return _groups[groupId];
    }

    function getMember(bytes32 groupId, address member) external view returns (Membership memory) {
        return _members[groupId][member];
    }

    function vouchCreditOf(bytes32 groupId, address voucher, address newcomer)
        external
        view
        returns (uint256)
    {
        return _vouchCredit[groupId][voucher][newcomer];
    }

    function _requireGroup(bytes32 groupId) internal view returns (Group storage g) {
        g = _groups[groupId];
        if (g.creator == address(0)) revert NoSuchGroup(groupId);
    }
}
