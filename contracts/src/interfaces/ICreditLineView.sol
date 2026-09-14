// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ICreditLineView
 * @notice The read-only surface of CreditLine that downstream contracts consume.
 *
 * @dev    Deliberately a separate interface rather than importing CreditLine itself, so a
 *         consumer (AttestedStanding, GroupCredit, or anything a third party writes) can
 *         point at any CreditLine deployment, including a future generation, without
 *         inheriting its storage layout or its bytecode.
 *
 *         The structs mirror CreditLine's field order exactly, because that order is the
 *         ABI. `getPosition` returns CreditLine's `Position`, whose `status` field is that
 *         contract's `Status` enum; an enum with fewer than 256 values encodes as uint8, so
 *         declaring it uint8 here is the same tuple on the wire.
 */
interface ICreditLineView {
    struct Position {
        uint256 deposit;
        uint256 debt;
        uint256 credit;
        uint256 attestedBalance;
        uint64 lastAccrual;
        uint8 status; // CreditLine.Status: 0 None, 1 Active, 2 Closed
        bytes32 openTxHash;
        bytes32 balanceTxHash;
        bytes32 closeTxHash;
    }

    struct PaymentHistory {
        uint256 count;
        uint256 volume;
    }

    /// @notice 650 base + 40 per linked attested payment, capped at 850.
    function creditScore(address user) external view returns (uint256);

    /// @notice Attested payment count and volume, in the source asset's own units.
    function getHistory(address user) external view returns (PaymentHistory memory);

    function getPosition(address user) external view returns (Position memory);
}
