// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICreditLineView} from "./interfaces/ICreditLineView.sol";

/**
 * @title AttestedStanding
 * @notice A borrower's proven standing, made portable.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 * Spark's proven history lives inside `CreditLine`, which means it is only reachable by
 * asking that one contract, in that one deployment, on this chain. A second application
 * that wants to extend credit to the same borrower has no way to see what Spark already
 * verified, so it starts from zero — and the borrower proves the same facts again, or
 * gives up and stays locked out. That is the whole failure the product exists to fix,
 * reproduced one level up.
 *
 * This contract is the answer to that: a single normalized record, readable by anyone,
 * whose contents came from Attestcoin proofs and whose `evidenceRef` is an actual
 * on-chain transaction hash so a consumer can go and check the claim instead of believing
 * this contract's arithmetic.
 *
 * ── What "portable" honestly means here ─────────────────────────────────────
 * Portable across APPLICATIONS ON CREDITCOIN. Not across chains: taking a verified
 * decision back out to another chain requires Attestcoin writability, which the Aug 18
 * AMA placed out of scope for this hackathon ("Writability is currently in the final
 * phase of development"). Claiming cross-chain portability would be a claim about a
 * feature that does not exist, so this file claims the version that does.
 *
 * ── Trust model ────────────────────────────────────────────────────────────
 * `refresh` is PERMISSIONLESS and pulls from `CreditLine`, so anyone can keep a record
 * current and nobody can forge one: the data comes from a contract that will only record
 * an entry behind an Attestcoin proof, and `evidenceRef` is that proof's transaction
 * hash. There is no `setStanding`, no owner, and no administrative write. If the
 * underlying CreditLine is wrong, this contract is wrong in exactly the same way, which
 * is the correct failure mode for a mirror — and the reason the evidence reference is
 * carried alongside the numbers rather than instead of them.
 *
 * A record cannot be created at all for an address with no verified activity, so this
 * registry is a list of evidence rather than a list of claims.
 */
contract AttestedStanding {
    struct Standing {
        /// @notice CreditLine's score: 650 base + 40 per attested payment, capped at 850.
        uint16 score;
        /// @notice Attested payments linked. The gate other contracts read.
        uint32 payments;
        /// @notice Attested payment volume, in the source asset's own units.
        uint128 volume;
        /// @notice Last attested balance, the solvency half of an open.
        uint128 attestedBalance;
        /// @notice When this record was last refreshed from CreditLine.
        uint64 issuedAt;
        /// @notice Attestcoin-proven transaction hash the record was derived from.
        bytes32 evidenceRef;
        /// @notice False until the first successful refresh.
        bool issued;
    }

    ICreditLineView public immutable creditLine;

    /// @notice Mirrors CreditLine.SCORE_CAP. Read from the source at refresh time, so this
    ///         constant is only used for the eligibility helper's bounds, never to invent a
    ///         score.
    uint16 public constant SCORE_CAP = 850;

    mapping(address => Standing) internal _standings;

    /// @notice Distinct addresses that hold a record. Cheap to keep, and it makes the size
    ///         of the registry checkable without iterating a mapping that cannot be
    ///         iterated.
    uint32 public recordCount;

    event StandingIssued(
        address indexed borrower,
        uint16 score,
        uint32 payments,
        uint256 volume,
        uint256 attestedBalance,
        bytes32 evidenceRef,
        uint64 issuedAt
    );

    error ZeroAddress();
    error CreditLineHasNoCode(address creditLine);
    error NotAttested(address borrower);

    constructor(address creditLine_) {
        if (creditLine_ == address(0)) revert ZeroAddress();
        // A registry pointed at a dead address would issue empty records that look
        // authoritative, which is worse than reverting here once.
        if (creditLine_.code.length == 0) revert CreditLineHasNoCode(creditLine_);
        creditLine = ICreditLineView(creditLine_);
    }

    /**
     * @notice Snapshot a borrower's verified standing. Permissionless.
     * @dev    Reverts when the address has no Attestcoin-verified activity. That is the
     *         property that stops this from becoming a list of unbacked claims: a caller
     *         can refresh an existing record or a genuinely-attested one, and nothing else.
     */
    function refresh(address borrower) external returns (Standing memory s) {
        if (borrower == address(0)) revert ZeroAddress();

        ICreditLineView.PaymentHistory memory h = creditLine.getHistory(borrower);
        ICreditLineView.Position memory p = creditLine.getPosition(borrower);
        uint256 score = creditLine.creditScore(borrower);

        // Evidence means the borrower has linked at least one attested payment, or holds a
        // position whose opening was proven. Either way an Attestcoin proof exists.
        if (h.count == 0 && p.openTxHash == bytes32(0) && p.balanceTxHash == bytes32(0)) {
            revert NotAttested(borrower);
        }

        // Prefer the most recent proven reference available: the balance proof is the
        // second of the dual proofs on an open, so it is the stronger of the two.
        bytes32 ref_ = p.balanceTxHash;
        if (ref_ == bytes32(0)) ref_ = p.openTxHash;
        if (ref_ == bytes32(0)) ref_ = p.closeTxHash;

        bool first = !_standings[borrower].issued;
        if (first) recordCount += 1;

        // Clamp before narrowing, and do not rely on CreditLine's cap staying at 850: a
        // source that returned a larger number would otherwise truncate silently.
        uint256 capped = score > SCORE_CAP ? SCORE_CAP : score;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint16 boundedScore = uint16(capped); // safe: capped <= SCORE_CAP (850) < 2**16

        s = Standing({
            score: boundedScore,
            payments: uint32(h.count),
            volume: uint128(h.volume),
            attestedBalance: uint128(p.attestedBalance),
            issuedAt: uint64(block.timestamp),
            evidenceRef: ref_,
            issued: true
        });
        _standings[borrower] = s;

        emit StandingIssued(
            borrower, s.score, s.payments, h.volume, p.attestedBalance, ref_, s.issuedAt
        );
    }

    /// @notice The stored record, zero-valued when none has been issued.
    function standingOf(address borrower) external view returns (Standing memory) {
        return _standings[borrower];
    }

    /**
     * @notice The predicate a consumer contract actually calls.
     * @param  minScore       Required score. CreditLine's floor is 650, so 0 means "any".
     * @param  minPayments    Required attested payments. This is the gate that cannot be
     *                        faked, because each payment is a verified source-chain event.
     * @param  maxAgeSeconds  Reject records older than this. 0 disables the freshness check.
     */
    function isEligible(
        address borrower,
        uint16 minScore,
        uint32 minPayments,
        uint64 maxAgeSeconds
    ) external view returns (bool) {
        Standing memory s = _standings[borrower];
        if (!s.issued) return false;
        if (s.score < minScore) return false;
        if (s.payments < minPayments) return false;
        // A stale record is not a safety property, it is a policy window measured in hours
        // or days. A validator's few seconds of drift on block.timestamp cannot move a
        // decision across such a boundary in any way that matters, so this is a deliberate
        // accept rather than an oversight.
        // forge-lint: disable-next-line(block-timestamp)
        if (maxAgeSeconds != 0 && block.timestamp > uint256(s.issuedAt) + maxAgeSeconds) {
            return false;
        }
        return true;
    }

    /// @notice Age of a record in seconds, or type(uint64).max when none exists, so a
    ///         caller cannot mistake "no record" for "fresh record".
    function standingAge(address borrower) external view returns (uint64) {
        Standing memory s = _standings[borrower];
        if (!s.issued) return type(uint64).max;
        return uint64(block.timestamp) - s.issuedAt;
    }
}
