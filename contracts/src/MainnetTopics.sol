// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MainnetTopics
 * @notice Mainnet event topic hashes the engine understands, with an explicit record
 *         of which are confirmed against live chain data and which are not yet.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * Reading a log by the wrong topic0 does not fail. It returns an empty list, and the
 * indexer reports "no activity" with complete confidence. During development a
 * `Repay` topic was accidentally used while labelled `Supply`, and only a live probe
 * caught it. So topics are declared here once, computed from their canonical
 * signature rather than pasted as hex, and paired with a status so no constant can
 * quietly claim a verification it does not have.
 *
 * Status legend (all statuses come from scripts/protocol-topics.mjs, which fetches
 * real mainnet logs over a 10,000-block window and pairs every check with a negative
 * control that must return zero):
 *   CONFIRMED   - logs matching this topic were found on the named contract
 *   UNVERIFIED  - signature is canonical but no matching log was found in the window,
 *                 so it is NOT claimed to be working
 *
 * Hashes are `keccak256` of the signature string, so they are correct by
 * construction; the risk this file guards against is the *signature or the contract*
 * being wrong. A wrong topic0 returns an empty list rather than an error, so a
 * mistake here looks exactly like "this wallet had no activity".
 */
library MainnetTopics {
    // ── Aave V3 ────────────────────────────────────────────────────────────
    // CONFIRMED on 0x87870Bca…A4E2: 1845 Supply, 1925 Withdraw, 1197 Borrow, 953 Repay.
    bytes32 internal constant AAVE_SUPPLY = keccak256("Supply(address,address,address,uint256,uint16)");
    bytes32 internal constant AAVE_WITHDRAW = keccak256("Withdraw(address,address,address,uint256)");
    bytes32 internal constant AAVE_BORROW =
        keccak256("Borrow(address,address,address,uint256,uint8,uint256,uint16)");
    bytes32 internal constant AAVE_REPAY = keccak256("Repay(address,address,address,uint256,bool)");

    // ── ERC20 ──────────────────────────────────────────────────────────────
    // CONFIRMED on the aEthWETH token: 2486 transfers. The engine's core primitive.
    bytes32 internal constant ERC20_TRANSFER = keccak256("Transfer(address,address,uint256)");

    // ── Chainlink ──────────────────────────────────────────────────────────
    // CONFIRMED, but only against the AGGREGATOR, never the proxy.
    //
    // Measured: the ETH/USD proxy 0x5f4eC3Df…8419 emitted ZERO logs in 300 blocks,
    // while its aggregator 0x7d4E7420…6Fb5 emitted 36 AnswerUpdated logs in 10,000.
    // The proxy is the address everyone knows, so attesting it proves no price while
    // appearing to succeed. The aggregator can also be swapped by a proxy phase
    // change, so whichever aggregator was live at the source block must be the one
    // attested, and that must be recorded alongside the price.
    bytes32 internal constant CHAINLINK_ANSWER_UPDATED =
        keccak256("AnswerUpdated(int256,uint256,uint256)");

    // ── Compound V3 (Comet) ────────────────────────────────────────────────
    // CONFIRMED on cWETHv3 0xA17581A9…aE94, but on thin volume: 9 Supply, 1 Withdraw
    // in the window. Present, yet too rare here to treat as a strong parity signal.
    bytes32 internal constant COMET_SUPPLY = keccak256("Supply(address,address,uint256)");
    bytes32 internal constant COMET_WITHDRAW = keccak256("Withdraw(address,address,uint256)");

    // ── Morpho Blue ────────────────────────────────────────────────────────
    // SupplyCollateral CONFIRMED on 0xBBBBBbbB…FFCb: 320 logs.
    // WithdrawCollateral UNVERIFIED: zero matching logs in the window, so this
    // constant is declared from the interface but is not claimed to work.
    bytes32 internal constant MORPHO_SUPPLY_COLLATERAL =
        keccak256("SupplyCollateral(bytes32,address,address,uint256)");
    bytes32 internal constant MORPHO_WITHDRAW_COLLATERAL =
        keccak256("WithdrawCollateral(bytes32,address,address,uint256)");

    /// @notice Protocols this engine can currently speak to, by id.
    bytes32 internal constant PROTOCOL_AAVE_V3 = "aave-v3";
    bytes32 internal constant PROTOCOL_COMPOUND_V3 = "compound-v3";
    bytes32 internal constant PROTOCOL_MORPHO_BLUE = "morpho-blue";
}
