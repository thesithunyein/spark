// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PositionValuer} from "./PositionValuer.sol";

/**
 * @title PositionSizedCredit
 * @notice Sizes a credit limit from a net position that was reconstructed from proven
 *         mainnet events and priced with a proven mainnet price event.
 *
 * ── Where this sits ─────────────────────────────────────────────────────────
 * PositionValuer deliberately stops short of policy: it reports a signed net worth and
 * refuses to clamp a negative. This is the layer above it, and its whole job is to be
 * explicit about policy. Before this contract, Spark proved a position and then did
 * nothing useful with it, which made the depth ornamental.
 *
 * ── The honesty this contract has to carry ──────────────────────────────────
 * A proven position is VERIFIED DATA, NOT SEIZABLE COLLATERAL. Spark can read an Aave
 * position on Ethereum mainnet and cannot liquidate it from Creditcoin. So the limit
 * here is unsecured credit extended against a verified underwriting signal, not a loan
 * against pledged collateral, and MAX_LTV_BPS is deliberately far below the 80 to 95
 * percent the deposit-backed flow uses. Conflating the two would be the single most
 * misleading thing this codebase could do.
 *
 * ── Failure is explicit, not silent ─────────────────────────────────────────
 * Every reason a limit is zero is returned as a status code rather than being flattened
 * into "0". A zero limit because the position is unanchored, because net worth is
 * negative, and because the borrower is simply too small are three different facts, and
 * a UI that cannot tell them apart will tell the user the wrong one.
 */
contract PositionSizedCredit {
    /// @dev Basis points denominator.
    uint256 public constant BPS = 10_000;
    /// @dev Hard ceiling on policy LTV, whatever the owner sets. 50% is a judgement about
    ///      the difference between verified data and collateral, not a market rate.
    uint256 public constant MAX_LTV_BPS = 5_000;

    enum Status {
        Eligible, // a usable limit was computed
        Unanchored, // no proven-zero anchor, so the position is not reconstructable
        NegativeNetWorth, // proven liabilities exceed proven assets
        BelowFloor, // net worth is real but under the minimum line size
        PolicyRejected // the policy itself is unusable
    }

    struct Decision {
        int256 netWorthUsd8; // signed, 8-decimal USD
        uint256 limitUsd8; // never negative; zero is a result, not an error
        Status status;
    }

    PositionValuer public immutable valuer;
    address public owner;

    /// @notice Share of proven net worth extended as credit, in bps.
    uint256 public ltvBps;
    /// @notice Minimum proven net worth for a line to exist at all.
    int256 public minNetWorthUsd8;
    /// @notice Absolute ceiling per account, regardless of net worth.
    uint256 public maxCreditUsd8;

    event PolicySet(uint256 ltvBps, int256 minNetWorthUsd8, uint256 maxCreditUsd8);
    event OwnerTransferred(address indexed from, address indexed to);

    error NotOwner(address caller);
    error ZeroAddress();
    error LtvTooHigh(uint256 ltvBps, uint256 max);
    error LengthMismatch(uint256 tokens, uint256 feeds);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    constructor(
        address valuer_,
        address owner_,
        uint256 ltvBps_,
        int256 minNetWorthUsd8_,
        uint256 maxCreditUsd8_
    ) {
        if (valuer_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (ltvBps_ > MAX_LTV_BPS) revert LtvTooHigh(ltvBps_, MAX_LTV_BPS);
        valuer = PositionValuer(valuer_);
        owner = owner_;
        ltvBps = ltvBps_;
        minNetWorthUsd8 = minNetWorthUsd8_;
        maxCreditUsd8 = maxCreditUsd8_;
        emit PolicySet(ltvBps_, minNetWorthUsd8_, maxCreditUsd8_);
    }

    /// @notice Update policy. Bounded by MAX_LTV_BPS so a mistake cannot silently
    ///         transform unsecured lending into something that looks collateralised.
    function setPolicy(uint256 ltvBps_, int256 minNetWorthUsd8_, uint256 maxCreditUsd8_)
        external
        onlyOwner
    {
        if (ltvBps_ > MAX_LTV_BPS) revert LtvTooHigh(ltvBps_, MAX_LTV_BPS);
        ltvBps = ltvBps_;
        minNetWorthUsd8 = minNetWorthUsd8_;
        maxCreditUsd8 = maxCreditUsd8_;
        emit PolicySet(ltvBps_, minNetWorthUsd8_, maxCreditUsd8_);
    }

    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        emit OwnerTransferred(owner, to);
        owner = to;
    }

    /**
     * @notice Size a credit limit for `account` across a set of proven positions.
     * @dev    Reverts rather than returning zero when a price is stale or a token is
     *         unregistered, because those are broken inputs, not small borrowers.
     */
    function limitFor(address account, address[] calldata tokens, address[] calldata feeds)
        external
        view
        returns (Decision memory d)
    {
        if (tokens.length != feeds.length) revert LengthMismatch(tokens.length, feeds.length);
        if (tokens.length == 0) {
            return Decision({netWorthUsd8: 0, limitUsd8: 0, status: Status.BelowFloor});
        }

        // An anchored position is a precondition, not a detail: without one the ledger
        // covers an unknown range and the sum means nothing.
        for (uint256 i = 0; i < tokens.length; i++) {
            d.netWorthUsd8 += valuer.valuationOf(account, tokens[i], feeds[i]).valueUsd8;
            if (!valuer.positionRegistry().isAnchored(account, tokens[i])) {
                return Decision({netWorthUsd8: d.netWorthUsd8, limitUsd8: 0, status: Status.Unanchored});
            }
        }

        // A negative net worth is a finding about the borrower. It must not be clamped
        // into a zero limit that looks like "too small".
        if (d.netWorthUsd8 <= 0) {
            return Decision({netWorthUsd8: d.netWorthUsd8, limitUsd8: 0, status: Status.NegativeNetWorth});
        }
        if (d.netWorthUsd8 < minNetWorthUsd8) {
            return Decision({netWorthUsd8: d.netWorthUsd8, limitUsd8: 0, status: Status.BelowFloor});
        }
        if (ltvBps == 0 || maxCreditUsd8 == 0) {
            return Decision({netWorthUsd8: d.netWorthUsd8, limitUsd8: 0, status: Status.PolicyRejected});
        }

        uint256 limit = (uint256(d.netWorthUsd8) * ltvBps) / BPS;
        if (limit > maxCreditUsd8) limit = maxCreditUsd8;

        // A policy so small that the limit rounds to zero is a policy failure, not an
        // eligible borrower, and must not be reported as Eligible with a zero limit.
        if (limit == 0) {
            return Decision({netWorthUsd8: d.netWorthUsd8, limitUsd8: 0, status: Status.PolicyRejected});
        }

        return Decision({netWorthUsd8: d.netWorthUsd8, limitUsd8: limit, status: Status.Eligible});
    }

    /// @notice Convenience view for callers that only need the number.
    function creditLimitUsd8(address account, address[] calldata tokens, address[] calldata feeds)
        external
        view
        returns (uint256)
    {
        return this.limitFor(account, tokens, feeds).limitUsd8;
    }
}
