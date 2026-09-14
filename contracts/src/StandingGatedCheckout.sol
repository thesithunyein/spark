// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AttestedStanding} from "./AttestedStanding.sol";

/**
 * @title StandingGatedCheckout
 * @notice A SECOND application that consumes AttestedStanding. Not a lending product, and
 *         not owned or operated by Spark.
 *
 * ── Why this contract exists ────────────────────────────────────────────────
 * `AttestedStanding` publishes a portable record and an `isEligible` predicate, and until
 * this file existed, nothing called either. Portability was therefore an interface claim
 * rather than a demonstrated fact, which is the same gap as a contract that is deployed
 * and unused.
 *
 * This is the counterexample. A merchant lists an item at a price, a buyer defers payment,
 * and the decision to allow it is made by reading a record this contract did not create,
 * from a protocol it is not part of, using a policy Spark does not control. If
 * `AttestedStanding` were removed, this contract would stop working — which is the test of
 * whether a dependency is real.
 *
 * ── The design choices that make it a genuine second consumer ───────────────
 *   - The policy is the MERCHANT's, set per merchant. Spark's own LTV rules are irrelevant
 *     here; the point is that a third party applies its own thresholds to verified facts.
 *   - The deferral ceiling comes from `standing.volume` scaled by the merchant's own
 *     advance rate, capped absolutely, and capped again by the buyer's outstanding total.
 *   - The decision is SNAPSHOTTED alongside the Attestcoin evidence reference, so a later
 *     registry refresh cannot rewrite history. A merchant should be able to show a
 *     counterparty exactly what proof it relied on.
 *   - The evidence reference is REQUIRED to be non-zero. `AttestedStanding` derives it from
 *     the borrower's position transaction hashes, so a wallet that linked attested payments
 *     without ever opening a line has proven volume but no checkable reference. Refusing
 *     that case is deliberate: a merchant that must be able to point at a proof should not
 *     accept a snapshot of zeros, and a loud failure is better than a decorative one. This
 *     is reachable in the protocol, because `submitAttestMultiple` does not require an open
 *     position.
 *
 * ── What it honestly does not do ────────────────────────────────────────────
 * It holds no collateral and has no enforcement, exactly like the protocol it reads from.
 * An unpaid order stays unpaid. `isOverdue` reports the fact rather than pretending to fix
 * it, and the reason is in docs/UNIT_ECONOMICS.md: there is nothing to seize.
 */
contract StandingGatedCheckout {
    /// @dev Basis points denominator.
    uint256 public constant BPS = 10_000;
    /// @dev Ceiling on advance rate, so a merchant cannot set 100% of proven volume and
    ///      call it underwriting. 50% is a judgement, not a market rate.
    uint16 public constant MAX_ADVANCE_BPS = 5_000;

    AttestedStanding public immutable standing;

    struct Policy {
        uint16 minScore;
        uint32 minPayments;
        uint64 maxAgeSeconds; // 0 disables the freshness check
        uint64 termSeconds; // how long the buyer has to settle
        uint128 maxDeferred; // absolute ceiling per buyer, in wei
        uint16 advanceBps; // share of proven volume this merchant will defer
        bool set;
    }

    struct Item {
        address merchant;
        uint128 price;
        address buyer;
        bool sold;
    }

    struct Order {
        address merchant;
        address buyer;
        uint128 deferred;
        uint64 dueAt;
        bytes32 evidenceRef; // the Attestcoin proof the decision rested on
        uint16 scoreAtDecision;
        uint32 paymentsAtDecision;
        bool closed;
    }

    mapping(address => Policy) internal _policies;
    mapping(uint256 => Item) internal _items;
    mapping(uint256 => Order) internal _orders;
    /// @notice Deferred-but-unsettled amount, keyed by buyer AND merchant. Per merchant
    ///         rather than per buyer because a merchant's ceiling is that merchant's risk
    ///         appetite; sharing one pot would let another merchant consume it.
    mapping(address => mapping(address => uint128)) public outstanding;

    uint256 public itemCount;
    uint256 public orderCount;

    event PolicySet(
        address indexed merchant,
        uint16 minScore,
        uint32 minPayments,
        uint64 maxAgeSeconds,
        uint64 termSeconds,
        uint128 maxDeferred,
        uint16 advanceBps
    );
    event ItemListed(uint256 indexed itemId, address indexed merchant, uint128 price);
    event Deferred(
        uint256 indexed orderId,
        uint256 indexed itemId,
        address indexed buyer,
        uint128 deferred,
        bytes32 evidenceRef,
        uint16 scoreAtDecision,
        uint32 paymentsAtDecision,
        uint64 dueAt
    );
    event Settled(uint256 indexed orderId, address indexed merchant, uint128 amount);
    event MerchantPaid(uint256 indexed orderId, address indexed merchant, uint128 amount);

    error ZeroAddress();
    error NoPolicy(address merchant);
    error UnknownItem(uint256 itemId);
    error ItemAlreadySold(uint256 itemId);
    error NotEligible(address buyer);
    error NoEvidence(address buyer);
    error NothingToDefer();
    error UnknownOrder(uint256 orderId);
    error OrderAlreadyClosed(uint256 orderId);
    error NotBuyer(address caller);
    error WrongAmount(uint128 expected, uint256 sent);
    error AdvanceTooHigh(uint16 advanceBps, uint16 max);
    error ZeroValue();
    error TransferFailed();

    constructor(address standing_) {
        if (standing_ == address(0)) revert ZeroAddress();
        // Pointing at a dead address would make every eligibility check return false and
        // look like "no borrower qualifies" rather than "misconfigured".
        if (standing_.code.length == 0) revert ZeroAddress();
        standing = AttestedStanding(standing_);
    }

    /* ------------------------------------------------------------------ merchant */

    /// @notice Set the merchant's own underwriting policy. Caller becomes a merchant.
    function setPolicy(
        uint16 minScore,
        uint32 minPayments,
        uint64 maxAgeSeconds,
        uint64 termSeconds,
        uint128 maxDeferred,
        uint16 advanceBps
    ) external {
        if (advanceBps > MAX_ADVANCE_BPS) revert AdvanceTooHigh(advanceBps, MAX_ADVANCE_BPS);
        if (maxDeferred == 0 || termSeconds == 0) revert ZeroValue();

        _policies[msg.sender] = Policy({
            minScore: minScore,
            minPayments: minPayments,
            maxAgeSeconds: maxAgeSeconds,
            termSeconds: termSeconds,
            maxDeferred: maxDeferred,
            advanceBps: advanceBps,
            set: true
        });

        emit PolicySet(
            msg.sender, minScore, minPayments, maxAgeSeconds, termSeconds, maxDeferred, advanceBps
        );
    }

    function policyOf(address merchant) external view returns (Policy memory) {
        return _policies[merchant];
    }

    /* ---------------------------------------------------------------------- item */

    /// @notice List an item at a price, payable later by an eligible buyer.
    function listItem(uint128 price) external returns (uint256 itemId) {
        if (!_policies[msg.sender].set) revert NoPolicy(msg.sender);
        if (price == 0) revert ZeroValue();

        itemId = ++itemCount;
        _items[itemId] = Item({merchant: msg.sender, price: price, buyer: address(0), sold: false});
        emit ItemListed(itemId, msg.sender, price);
    }

    function itemOf(uint256 itemId) external view returns (Item memory) {
        return _items[itemId];
    }

    /* ------------------------------------------------------------------ checkout */

    /**
     * @notice Defer payment for an item, gated on a standing record this contract did not
     *         create. The deferral is the smallest of the price, the merchant's own advance
     *         against proven volume, and the room left under the buyer's outstanding cap.
     */
    function checkout(uint256 itemId) external returns (uint256 orderId) {
        Item storage item = _items[itemId];
        if (item.merchant == address(0)) revert UnknownItem(itemId);
        if (item.sold) revert ItemAlreadySold(itemId);

        Policy memory p = _policies[item.merchant];

        // The one line that proves the dependency: the merchant's thresholds, applied to a
        // record produced by AttestedStanding from Attestcoin proofs, in a contract that has
        // no idea who Spark is.
        if (!standing.isEligible(msg.sender, p.minScore, p.minPayments, p.maxAgeSeconds)) {
            revert NotEligible(msg.sender);
        }

        AttestedStanding.Standing memory s = standing.standingOf(msg.sender);
        if (!s.issued) revert NotEligible(msg.sender);
        // A snapshot without a reference is a snapshot a merchant cannot defend, so a
        // proven-but-unreferenced record is refused rather than recorded as zeros.
        if (s.evidenceRef == bytes32(0)) revert NoEvidence(msg.sender);

        uint256 fromVolume = (uint256(s.volume) * p.advanceBps) / BPS;
        uint128 seen = outstanding[msg.sender][item.merchant];
        uint256 room = p.maxDeferred > seen ? p.maxDeferred - seen : 0;

        uint256 deferral = item.price;
        if (deferral > fromVolume) deferral = fromVolume;
        if (deferral > room) deferral = room;
        if (deferral == 0) revert NothingToDefer();

        item.sold = true;
        item.buyer = msg.sender;

        orderId = ++orderCount;
        uint64 dueAt = uint64(block.timestamp) + p.termSeconds;
        _orders[orderId] = Order({
            merchant: item.merchant,
            buyer: msg.sender,
            deferred: uint128(deferral),
            dueAt: dueAt,
            evidenceRef: s.evidenceRef,
            scoreAtDecision: s.score,
            paymentsAtDecision: s.payments,
            closed: false
        });

        outstanding[msg.sender][item.merchant] += uint128(deferral);

        emit Deferred(
            orderId,
            itemId,
            msg.sender,
            uint128(deferral),
            s.evidenceRef,
            s.score,
            s.payments,
            dueAt
        );
    }

    /* ------------------------------------------------------------------- settle */

    /// @notice The buyer settles an order by paying the deferred amount, forwarded to the
    ///         merchant in the same transaction.
    function settle(uint256 orderId) external payable {
        Order storage o = _orders[orderId];
        if (o.buyer == address(0)) revert UnknownOrder(orderId);
        if (o.closed) revert OrderAlreadyClosed(orderId);
        if (msg.sender != o.buyer) revert NotBuyer(msg.sender);
        if (msg.value != o.deferred) revert WrongAmount(o.deferred, msg.value);

        o.closed = true;
        outstanding[o.buyer][o.merchant] -= o.deferred;

        emit Settled(orderId, o.merchant, o.deferred);
        (bool ok,) = o.merchant.call{value: o.deferred}("");
        if (!ok) revert TransferFailed();
        emit MerchantPaid(orderId, o.merchant, o.deferred);
    }

    function orderOf(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    /// @notice Reports lateness. Deliberately does not manufacture a consequence, because
    ///         this contract holds no collateral and cannot take any. Stated rather than
    ///         implied: a merchant reading this should know the limit is real.
    function isOverdue(uint256 orderId) external view returns (bool) {
        Order memory o = _orders[orderId];
        if (o.buyer == address(0) || o.closed) return false;
        return block.timestamp > o.dueAt;
    }

    /// @notice The predicate a merchant UI would call before showing a "pay later" button.
    function canDefer(
        address buyer,
        address merchant,
        uint128 price
    ) external view returns (bool ok, uint128 limit) {
        Policy memory p = _policies[merchant];
        if (!p.set) return (false, 0);
        if (!standing.isEligible(buyer, p.minScore, p.minPayments, p.maxAgeSeconds)) {
            return (false, 0);
        }
        AttestedStanding.Standing memory s = standing.standingOf(buyer);
        if (s.evidenceRef == bytes32(0)) return (false, 0);
        uint256 fromVolume = (uint256(s.volume) * p.advanceBps) / BPS;
        uint128 seen = outstanding[buyer][merchant];
        uint256 room = p.maxDeferred > seen ? p.maxDeferred - seen : 0;
        uint256 capped = fromVolume < room ? fromVolume : room;
        if (capped > price) capped = price;
        return (capped > 0, uint128(capped));
    }
}
