// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AttestedPriceFeed
 * @notice Prices on Creditcoin that come from proven mainnet Chainlink events, so a
 *         position can be valued without trusting a price operator.
 *
 * ── Why prove prices instead of calling an oracle ───────────────────────────
 * The whole point of the position engine is that no middleman asserts facts. A
 * position valued with an operator-supplied price reintroduces exactly the trusted
 * party the design removes, and it is the natural way to silently inflate a
 * borrower's collateral. So the price here is a `Chainlink AnswerUpdated` event that
 * was proven through the same BlockProver (0x0FD2) as everything else:
 *
 *     event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)
 *     topic0 = keccak256("AnswerUpdated(int256,uint256,uint256)")
 *
 * ── Rules this contract enforces ────────────────────────────────────────────
 *   - answer must be positive: a zero or negative Chainlink answer is a fault
 *     signal, never a price, and must not become collateral
 *   - sourceBlock must strictly increase per feed: a replayed or reordered
 *     attestation cannot move a price backwards to a more convenient value
 *   - each attestationRef is single-use, so the same proof cannot be submitted twice
 *   - staleness is a read-time concern, enforced by `latestPrice` against
 *     `maxStaleness`, because validity depends on when you ask
 *
 * As in MainnetPositionRegistry, the attestor is trusted to submit already-verified
 * values; this contract owns the invariants, not the proof verification.
 */
contract AttestedPriceFeed {
    struct PriceData {
        int256 answer;
        uint8 decimals; // Chainlink feed decimals, e.g. 8 for ETH/USD
        uint64 sourceBlock; // mainnet block the AnswerUpdated was emitted in
        uint256 updatedAt; // the event's own updatedAt timestamp
        bytes32 attestationRef;
        bool set;
    }

    /// @dev Chainlink's canonical answer-update event. Declared here so the expected
    ///      topic is auditable rather than buried in an off-chain script.
    bytes32 public constant CHAINLINK_ANSWER_UPDATED_TOPIC =
        keccak256("AnswerUpdated(int256,uint256,uint256)");

    uint64 public immutable expectedChainKey;
    /// @notice Default freshness bound in seconds; reads revert past this.
    uint256 public immutable maxStaleness;

    address public attestor;

    mapping(address => PriceData) internal _prices;
    mapping(bytes32 => bool) public usedAttestation;

    event AnswerSubmitted(
        address indexed feed,
        int256 answer,
        uint8 decimals,
        uint64 sourceBlock,
        uint256 updatedAt,
        bytes32 attestationRef
    );
    event AttestorTransferred(address indexed from, address indexed to);

    error NotAttestor();
    error ZeroAddress();
    error BadChain(uint64 got, uint64 want);
    error BadAnswer(int256 answer);
    error BadDecimals(uint8 decimals);
    error StaleBlock(uint64 sourceBlock, uint64 lastBlock);
    error ReplayAttestation(bytes32 attestationRef);
    error PriceNotSet(address feed);
    error StalePrice(address feed, uint256 age, uint256 maxStaleness);
    error InvalidStaleness();

    modifier onlyAttestor() {
        if (msg.sender != attestor) revert NotAttestor();
        _;
    }

    constructor(address attestor_, uint64 expectedChainKey_, uint256 maxStaleness_) {
        if (attestor_ == address(0)) revert ZeroAddress();
        if (maxStaleness_ == 0) revert InvalidStaleness();
        attestor = attestor_;
        expectedChainKey = expectedChainKey_;
        maxStaleness = maxStaleness_;
    }

    /**
     * @notice Record a proven Chainlink answer.
     * @dev    Ordering and replay rules are what stop a compromised or buggy feed
     *         from rewriting history to a friendlier price.
     */
    function submitAnswer(
        address feed,
        int256 answer,
        uint8 decimals,
        uint64 sourceBlock,
        uint256 updatedAt,
        uint64 chainKey,
        bytes32 attestationRef
    ) external onlyAttestor {
        if (chainKey != expectedChainKey) revert BadChain(chainKey, expectedChainKey);
        if (feed == address(0)) revert ZeroAddress();
        if (answer <= 0) revert BadAnswer(answer);
        if (decimals > 18) revert BadDecimals(decimals);

        PriceData storage p = _prices[feed];
        if (p.set && sourceBlock <= p.sourceBlock) revert StaleBlock(sourceBlock, p.sourceBlock);
        if (usedAttestation[attestationRef]) revert ReplayAttestation(attestationRef);

        usedAttestation[attestationRef] = true;
        p.answer = answer;
        p.decimals = decimals;
        p.sourceBlock = sourceBlock;
        p.updatedAt = updatedAt;
        p.attestationRef = attestationRef;
        p.set = true;

        emit AnswerSubmitted(feed, answer, decimals, sourceBlock, updatedAt, attestationRef);
    }

    /// @notice Raw stored data, including freshness, without reverting.
    function priceOf(address feed) external view returns (PriceData memory) {
        return _prices[feed];
    }

    /// @notice Fresh price, reverting when unset or older than the staleness bound.
    function latestPrice(address feed) external view returns (int256 answer, uint8 decimals) {
        PriceData storage p = _prices[feed];
        if (!p.set) revert PriceNotSet(feed);
        uint256 age = block.timestamp > p.updatedAt ? block.timestamp - p.updatedAt : 0;
        if (age > maxStaleness) revert StalePrice(feed, age, maxStaleness);
        return (p.answer, p.decimals);
    }

    function transferAttestor(address next) external onlyAttestor {
        if (next == address(0)) revert ZeroAddress();
        emit AttestorTransferred(attestor, next);
        attestor = next;
    }
}
