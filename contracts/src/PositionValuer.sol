// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MainnetPositionRegistry} from "./MainnetPositionRegistry.sol";
import {MainnetTokenRegistry} from "./MainnetTokenRegistry.sol";
import {AttestedPriceFeed} from "./AttestedPriceFeed.sol";

/**
 * @title PositionValuer
 * @notice Turns reconstructed mainnet positions into net worth in USD, using only
 *         attested quantities: the ledger-reconstructed position, the attested token
 *         decimals, and a proven Chainlink price.
 *
 * ── The claim this contract makes possible ──────────────────────────────────
 * "Credit sized against a net position reconstructed from proven mainnet events and
 *  priced with proven mainnet price events. No oracle operator, no self-report, and
 *  no scoring rule a wash loop can farm."
 *
 * ── Why every input is attested rather than read ────────────────────────────
 *   - position: from MainnetPositionRegistry (token ledger + proven-zero anchor)
 *   - decimals:  from MainnetTokenRegistry, because the token lives on mainnet and
 *                `decimals()` cannot be called from Creditcoin
 *   - price:     from AttestedPriceFeed, because an operator-supplied price would
 *                reinstate the trusted party the design removes
 *
 * ── Sign convention ─────────────────────────────────────────────────────────
 * A liability token (variable debt) contributes negatively, so a portfolio nets to
 * a single signed number: what the borrower is actually worth, not what they hold.
 * Negative output is a real result, meaning net debt exceeds net assets.
 *
 * ── What this deliberately does not do ──────────────────────────────────────
 * It does not decide credit limits, and it does not smooth or floor a negative net
 * worth. LTV policy belongs above this layer; hiding a negative here would hide the
 * one number that matters most.
 */
contract PositionValuer {
    /// @dev Aave reports base-currency amounts in 8 decimals, so net worth is
    ///      expressed the same way to stay comparable with `getUserAccountData`.
    uint256 public constant BASE_DECIMALS = 8;
    /// @dev Guard against absurd scale factors from a mis-registered token.
    uint256 public constant MAX_EXPONENT = 36;

    MainnetPositionRegistry public immutable positionRegistry;
    MainnetTokenRegistry public immutable tokenRegistry;
    AttestedPriceFeed public immutable priceFeed;

    struct Valuation {
        address token;
        int256 position; // token units, signed by kind (liability negative)
        uint8 tokenDecimals;
        int256 price; // feed answer
        uint8 priceDecimals;
        int256 valueUsd8; // 8-decimal USD
        uint64 positionBlock; // last block the position was reconciled at
    }

    event ValuerDeployed(
        address positionRegistry, address tokenRegistry, address priceFeed
    );

    error ZeroAddress();
    error LengthMismatch(uint256 tokens, uint256 feeds);
    error ExponentTooLarge(uint256 exponent);

    constructor(address positionRegistry_, address tokenRegistry_, address priceFeed_) {
        if (positionRegistry_ == address(0) || tokenRegistry_ == address(0) || priceFeed_ == address(0)) {
            revert ZeroAddress();
        }
        positionRegistry = MainnetPositionRegistry(positionRegistry_);
        tokenRegistry = MainnetTokenRegistry(tokenRegistry_);
        priceFeed = AttestedPriceFeed(priceFeed_);
        emit ValuerDeployed(positionRegistry_, tokenRegistry_, priceFeed_);
    }

    /**
     * @notice Value one token position.
     * @dev    Reverts on a stale or unset price, on an unregistered token, and on an
     *         out-of-range scale factor, because every one of those is a way to
     *         report a confident but wrong net worth.
     * @dev    Deliberately NOT named `valueOf`. That name collides with
     *         `Object.prototype.valueOf` in JavaScript, so in ethers v6 the call
     *         `valuer.valueOf(...)` resolves to the Contract object's own method and
     *         silently returns the contract instead of performing the call. Found by
     *         running the verification script, not by reading the Solidity.
     */
    function valuationOf(address account, address token, address feed)
        public
        view
        returns (Valuation memory v)
    {
        (int256 price, uint8 priceDecimals) = priceFeed.latestPrice(feed);
        uint8 tokenDecimals = tokenRegistry.decimalsOf(token);
        int8 sign = tokenRegistry.signOf(token);

        MainnetPositionRegistry.Position memory p = positionRegistry.positionOf(account, token);
        int256 signedPosition = p.anchored ? (p.ledgerNet + p.interestResidual) * int256(sign) : int256(0);

        v = Valuation({
            token: token,
            position: signedPosition,
            tokenDecimals: tokenDecimals,
            price: price,
            priceDecimals: priceDecimals,
            valueUsd8: _scaleToUsd8(signedPosition, price, tokenDecimals, priceDecimals),
            positionBlock: p.lastBlock
        });
    }

    /**
     * @notice Net worth across a set of positions. Liabilities subtract.
     * @dev    Returns a negative number when net debt exceeds net assets. That is a
     *         finding, not an error, and must not be clamped by the caller.
     */
    function netWorthUsd(address account, address[] calldata tokens, address[] calldata feeds)
        external
        view
        returns (int256 netUsd8, Valuation[] memory parts)
    {
        if (tokens.length != feeds.length) revert LengthMismatch(tokens.length, feeds.length);
        parts = new Valuation[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            parts[i] = valuationOf(account, tokens[i], feeds[i]);
            netUsd8 += parts[i].valueUsd8;
        }
    }

    /// @dev value = position * price, rescaled from (tokenDecimals + priceDecimals)
    ///      down to BASE_DECIMALS, truncating toward zero.
    function _scaleToUsd8(int256 position, int256 price, uint8 tokenDecimals, uint8 priceDecimals)
        internal
        pure
        returns (int256)
    {
        if (position == 0) return 0;
        int256 combined = int256(uint256(tokenDecimals) + uint256(priceDecimals));
        int256 base = int256(BASE_DECIMALS);

        if (combined >= base) {
            uint256 scaleDown = uint256(combined - base);
            if (scaleDown > MAX_EXPONENT) revert ExponentTooLarge(scaleDown);
            return (position * price) / int256(10 ** scaleDown);
        }
        uint256 scaleUp = uint256(base - combined);
        if (scaleUp > MAX_EXPONENT) revert ExponentTooLarge(scaleUp);
        return position * price * int256(10 ** scaleUp);
    }
}
