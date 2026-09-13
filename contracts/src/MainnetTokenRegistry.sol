// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MainnetTokenRegistry
 * @notice Attested metadata for mainnet tokens, so a position can be scaled and valued
 *         on Creditcoin.
 *
 * ── Why this has to exist on-chain ──────────────────────────────────────────
 * A token like aWETH lives on Ethereum mainnet. Its `decimals()` cannot be called
 * from Creditcoin, and hardcoding 18 into valuation logic is how a 6-decimal USDC
 * position ends up valued a trillion times too high. So decimals, the protocol it
 * belongs to, and whether it is an asset or a liability are all recorded here as
 * attested facts.
 *
 * ── Coverage ────────────────────────────────────────────────────────────────
 * Registering by `protocol` id keeps the engine protocol-agnostic: Aave v3 aTokens
 * and debt tokens, Compound v3 Comet collateral and borrow tokens, and Morpho Blue
 * positions all reduce to the same two questions this contract answers:
 *
 *   1. how many decimals does the unit have?
 *   2. is holding it an asset (positive) or a liability (negative)?
 *
 * Adding a protocol is a registration call, not a contract rewrite.
 */
contract MainnetTokenRegistry {
    enum TokenKind {
        Asset, // aToken, cToken collateral: holding it is a claim
        Liability // variable debt token, borrow share: holding it is an obligation
    }

    struct TokenMeta {
        uint8 decimals;
        bytes32 protocol; // e.g. "aave-v3", "compound-v3", "morpho-blue"
        TokenKind kind;
        address underlying; // mainnet underlying, or address(0) if n/a
        uint64 sourceBlock; // mainnet block the metadata was attested at
        bool set;
    }

    uint64 public immutable expectedChainKey;
    address public attestor;

    mapping(address => TokenMeta) internal _tokens;
    mapping(bytes32 => address[]) internal _byProtocol;

    event TokenRegistered(
        address indexed token,
        bytes32 indexed protocol,
        address underlying,
        uint8 decimals,
        TokenKind kind,
        uint64 sourceBlock
    );
    event AttestorTransferred(address indexed from, address indexed to);

    error NotAttestor();
    error ZeroAddress();
    error BadChain(uint64 got, uint64 want);
    error BadDecimals(uint8 decimals);
    error AlreadyRegistered(address token);
    error TokenNotRegistered(address token);

    modifier onlyAttestor() {
        if (msg.sender != attestor) revert NotAttestor();
        _;
    }

    constructor(address attestor_, uint64 expectedChainKey_) {
        if (attestor_ == address(0)) revert ZeroAddress();
        attestor = attestor_;
        expectedChainKey = expectedChainKey_;
    }

    /**
     * @notice Register attested metadata for a mainnet token.
     * @dev    Re-registration is rejected rather than overwritten: silently changing a
     *         token's decimals would re-scale every position already derived from it.
     */
    function registerToken(
        address token,
        uint8 decimals,
        bytes32 protocol,
        TokenKind kind,
        address underlying,
        uint64 sourceBlock,
        uint64 chainKey
    ) external onlyAttestor {
        if (chainKey != expectedChainKey) revert BadChain(chainKey, expectedChainKey);
        if (token == address(0)) revert ZeroAddress();
        if (decimals > 18) revert BadDecimals(decimals);
        if (_tokens[token].set) revert AlreadyRegistered(token);

        _tokens[token] = TokenMeta({
            decimals: decimals,
            protocol: protocol,
            kind: kind,
            underlying: underlying,
            sourceBlock: sourceBlock,
            set: true
        });
        _byProtocol[protocol].push(token);

        emit TokenRegistered(token, protocol, underlying, decimals, kind, sourceBlock);
    }

    function metaOf(address token) external view returns (TokenMeta memory) {
        return _tokens[token];
    }

    function isRegistered(address token) external view returns (bool) {
        return _tokens[token].set;
    }

    /// @notice Decimals for a registered token; reverts rather than defaulting to 18.
    function decimalsOf(address token) external view returns (uint8) {
        TokenMeta storage m = _tokens[token];
        if (!m.set) revert TokenNotRegistered(token);
        return m.decimals;
    }

    /// @notice +1 for an asset, -1 for a liability. The sign a position must carry.
    function signOf(address token) external view returns (int8) {
        TokenMeta storage m = _tokens[token];
        if (!m.set) revert TokenNotRegistered(token);
        return m.kind == TokenKind.Asset ? int8(1) : int8(-1);
    }

    function tokensOf(bytes32 protocol) external view returns (address[] memory) {
        return _byProtocol[protocol];
    }

    function transferAttestor(address next) external onlyAttestor {
        if (next == address(0)) revert ZeroAddress();
        emit AttestorTransferred(attestor, next);
        attestor = next;
    }
}
