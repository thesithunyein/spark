// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MainnetPositionRegistry
 * @notice Reconstructs a borrower's cross-chain position on Creditcoin from an
 *         attested Ethereum mainnet token ledger, and refuses to guess.
 *
 * ── Why this contract looks the way it does ─────────────────────────────────
 * Two things were measured on live Ethereum mainnet before this was written
 * (docs/evidence/position-reconstruction.md), and both change the design:
 *
 * 1. Aave's own events cannot reconstruct a position. On a real borrower,
 *    Sum(Supply) - Sum(Withdraw) overstated aWETH by 66% (97.389 vs 32.325) with
 *    ZERO Withdraw events, because aTokens are transferable and a wallet-to-wallet
 *    move emits no Aave event. So this engine ingests the TOKEN's Transfer ledger
 *    (mints, burns, and peer-to-peer moves), never protocol-specific events.
 *
 * 2. Interest cannot come from events at all. aToken balances rebase continuously.
 *    A ledger sum therefore always understates a live position, and the gap is not
 *    an error to be hidden but a quantity to be bounded and disclosed. So the only
 *    way to advance the position here is against an ATTESTED STATE BALANCE, and the
 *    difference between that balance and the ledger is stored as an explicit,
 *    capped `interestResidual`. There is no path in this contract that fabricates
 *    interest from a timestamp or a rate.
 *
 * ── The anchor rule ──────────────────────────────────────────────────────────
 * A ledger sum is meaningless without a starting point. `setZeroAnchor` fixes one
 * at a block where the balance is ATTESTED to be zero. Coverage from that block
 * forward is then complete by construction: anything earlier had already netted to
 * zero, so it cannot contribute to the current position. Ledger rows at or below
 * the anchor are rejected rather than silently ignored, so an incomplete or
 * mis-ordered feed fails loudly instead of producing a false position.
 *
 * ── Trust model ──────────────────────────────────────────────────────────────
 * A single `attestor` submits rows that are already verified by the Attestcoin
 * BlockProver (0x0FD2) and decoded by the official EvmV1 decoder. This contract
 * enforces the accounting invariants, monotonic ordering, replay protection, and
 * bounds; it does not re-verify proofs. Wiring the registry to call the precompile
 * directly is the next step, and is called out as such rather than implied.
 *
 * Decoder/chain facts this relies on (verified live, see docs/evidence):
 *   chainKey 3 = Ethereum mainnet, attested on CC3
 *   EvmV1Decoder: mainnet 0x9D094C9f…4B5C, testnet 0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f
 */
contract MainnetPositionRegistry {
    /// @notice How a ledger row moved the balance. Net effect is what matters; the
    ///         kind is recorded so a reviewer can see the composition.
    enum LedgerKind {
        Mint, // Transfer(0x0 -> account): Aave Supply, or Borrow on a debt token
        Burn, // Transfer(account -> 0x0): Withdraw, Repay, or liquidation
        TransferIn, // peer-to-peer receipt, invisible to protocol events
        TransferOut // peer-to-peer send, invisible to protocol events
    }

    struct Position {
        int256 ledgerNet; // sum of ledger rows since the anchor
        int256 interestResidual; // attested balance minus ledgerNet, bounded
        uint64 anchorBlock; // attested block where the balance was zero
        uint64 lastBlock; // highest ingested row block
        uint32 entries; // rows applied
        bool anchored;
    }

    struct LedgerEntry {
        address account;
        address token;
        int256 delta; // signed units, in token decimals
        uint64 sourceBlock;
        LedgerKind kind;
        bytes32 txHash;
    }

    /// @notice Cap on the interest residual, in bps of |ledgerNet|. A residual above
    ///         this means the ledger is missing history and the position is not
    ///         trustworthy, so it reverts instead of reporting a number.
    uint256 public immutable maxInterestBps;

    uint64 public immutable expectedChainKey;

    address public attestor;

    mapping(address => mapping(address => Position)) internal _positions;
    mapping(bytes32 => bool) public usedTx;

    event ZeroAnchorSet(
        address indexed account, address indexed token, uint64 sourceBlock, bytes32 attestationRef
    );
    event LedgerIngested(
        address indexed account,
        address indexed token,
        LedgerKind kind,
        int256 delta,
        int256 ledgerNet,
        uint64 sourceBlock
    );
    event Reconciled(
        address indexed account,
        address indexed token,
        int256 attestedBalance,
        int256 ledgerNet,
        int256 interestResidual,
        uint64 sourceBlock,
        bytes32 attestationRef
    );
    event AttestorTransferred(address indexed from, address indexed to);

    error NotAttestor();
    error BadChain(uint64 got, uint64 want);
    error ZeroAddress();
    error AnchorMissing();
    error AlreadyAnchored();
    error BlockNotAfterAnchor(uint64 sourceBlock, uint64 anchorBlock);
    error StaleBlock(uint64 sourceBlock, uint64 lastBlock);
    error ReplayTx(bytes32 txHash);
    error ZeroDelta();
    error AttestedBeforeLedger(uint64 sourceBlock, uint64 lastBlock);
    error NegativeResidual(int256 attested, int256 ledgerNet);
    error ExcessResidual(int256 residual, int256 ledgerNet);
    error EmptyBatch();

    modifier onlyAttestor() {
        if (msg.sender != attestor) revert NotAttestor();
        _;
    }

    constructor(address attestor_, uint64 expectedChainKey_, uint256 maxInterestBps_) {
        if (attestor_ == address(0)) revert ZeroAddress();
        require(maxInterestBps_ > 0 && maxInterestBps_ <= 10_000, "residual bps");
        attestor = attestor_;
        expectedChainKey = expectedChainKey_;
        maxInterestBps = maxInterestBps_;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ANCHOR — the only sound starting point for a ledger sum
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Fix the reconstruction start at a block where the balance is attested zero.
     * @dev    The attestation is the proof that the balance equals zero; this call only
     *         records it. Re-anchoring is rejected so history cannot be rewritten to
     *         hide a gap.
     */
    function setZeroAnchor(
        address account,
        address token,
        uint64 sourceBlock,
        uint64 chainKey,
        bytes32 attestationRef
    ) external onlyAttestor {
        if (chainKey != expectedChainKey) revert BadChain(chainKey, expectedChainKey);
        if (account == address(0) || token == address(0)) revert ZeroAddress();

        Position storage p = _positions[account][token];
        if (p.anchored) revert AlreadyAnchored();

        p.anchored = true;
        p.ledgerNet = 0;
        p.interestResidual = 0;
        p.anchorBlock = sourceBlock;
        p.lastBlock = sourceBlock;

        emit ZeroAnchorSet(account, token, sourceBlock, attestationRef);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  LEDGER — token transfers, not protocol events
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Apply attested token-ledger rows to the position.
     * @dev    Rejections are deliberate and each one corresponds to a way naive
     *         reconstruction goes wrong:
     *           - rows at or below the anchor: they are before a proven-zero point,
     *             so including them double counts history that already netted out
     *           - non-monotonic blocks: a feed that skips backwards has a gap
     *           - replayed txHash: the same proven transfer counted twice
     */
    function ingestLedger(uint64 chainKey, LedgerEntry[] calldata entries) external onlyAttestor {
        if (chainKey != expectedChainKey) revert BadChain(chainKey, expectedChainKey);
        if (entries.length == 0) revert EmptyBatch();

        for (uint256 i = 0; i < entries.length; i++) {
            LedgerEntry calldata e = entries[i];
            if (e.delta == 0) revert ZeroDelta();
            if (e.account == address(0) || e.token == address(0)) revert ZeroAddress();

            Position storage p = _positions[e.account][e.token];
            if (!p.anchored) revert AnchorMissing();
            if (e.sourceBlock <= p.anchorBlock) revert BlockNotAfterAnchor(e.sourceBlock, p.anchorBlock);
            if (e.sourceBlock < p.lastBlock) revert StaleBlock(e.sourceBlock, p.lastBlock);
            if (usedTx[e.txHash]) revert ReplayTx(e.txHash);

            usedTx[e.txHash] = true;
            p.ledgerNet += e.delta;
            p.lastBlock = e.sourceBlock;
            p.entries += 1;

            emit LedgerIngested(
                e.account, e.token, e.kind, e.delta, p.ledgerNet, e.sourceBlock
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  RECONCILE — interest can only come from attested state
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Reconcile the ledger against an attested balance, recording the gap as
     *         the bounded interest residual.
     * @dev    This is the only function that can move a position ahead of the ledger,
     *         and it can only do so because a proven state value says so. A residual
     *         larger than `maxInterestBps` of the ledger means the ledger is missing
     *         history, which reverts rather than reporting a laundered number.
     */
    function reconcile(
        address account,
        address token,
        int256 attestedBalance,
        uint64 sourceBlock,
        uint64 chainKey,
        bytes32 attestationRef
    ) external onlyAttestor returns (int256) {
        if (chainKey != expectedChainKey) revert BadChain(chainKey, expectedChainKey);

        Position storage p = _positions[account][token];
        if (!p.anchored) revert AnchorMissing();
        if (sourceBlock < p.lastBlock) revert AttestedBeforeLedger(sourceBlock, p.lastBlock);

        int256 residual = attestedBalance - p.ledgerNet;
        if (residual < 0) revert NegativeResidual(attestedBalance, p.ledgerNet);

        // Bound the unexplained part. |ledgerNet| * maxInterestBps / 10_000.
        int256 absNet = p.ledgerNet >= 0 ? p.ledgerNet : -p.ledgerNet;
        int256 cap = (absNet * int256(maxInterestBps)) / 10_000;
        if (residual > cap) revert ExcessResidual(residual, p.ledgerNet);

        p.interestResidual = residual;
        p.lastBlock = sourceBlock;

        emit Reconciled(account, token, attestedBalance, p.ledgerNet, residual, sourceBlock, attestationRef);
        return residual;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Ledger-only sum. Understates a live position by the interest residual.
    function ledgerNet(address account, address token) external view returns (int256) {
        return _positions[account][token].ledgerNet;
    }

    /**
     * @notice Reconstructed position: ledger plus the bounded, attested interest term.
     * @dev    Returns 0 when unanchored so a caller cannot mistake "no data" for a
     *         real position; check `isAnchored` before relying on the value.
     */
    function netPosition(address account, address token) external view returns (int256) {
        Position storage p = _positions[account][token];
        if (!p.anchored) return 0;
        return p.ledgerNet + p.interestResidual;
    }

    function positionOf(address account, address token) external view returns (Position memory) {
        return _positions[account][token];
    }

    function isAnchored(address account, address token) external view returns (bool) {
        return _positions[account][token].anchored;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ADMIN — minimal, no external dependency
    // ═══════════════════════════════════════════════════════════════════════

    function transferAttestor(address next) external onlyAttestor {
        if (next == address(0)) revert ZeroAddress();
        emit AttestorTransferred(attestor, next);
        attestor = next;
    }
}
