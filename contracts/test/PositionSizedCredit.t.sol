// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MainnetPositionRegistry} from "../src/MainnetPositionRegistry.sol";
import {MainnetTokenRegistry} from "../src/MainnetTokenRegistry.sol";
import {AttestedPriceFeed} from "../src/AttestedPriceFeed.sol";
import {PositionValuer} from "../src/PositionValuer.sol";
import {PositionSizedCredit} from "../src/PositionSizedCredit.sol";
import {MainnetTopics} from "../src/MainnetTopics.sol";

/**
 * @notice Tests for the layer that converts a proven position into a credit limit.
 *
 * The numbers are the REAL measured ones, so if the position stack ever starts reporting
 * a different net worth, these tests fail rather than quietly resizing everybody's credit.
 *
 * The tests that matter most are the ones asserting that different reasons for a zero
 * limit stay distinguishable. Flattening "unanchored", "net debt" and "too small" into a
 * single zero is the failure mode this contract exists to avoid, and it is easy to
 * reintroduce without noticing.
 */
contract PositionSizedCreditTest is Test {
    MainnetPositionRegistry internal registry;
    MainnetTokenRegistry internal tokens;
    AttestedPriceFeed internal feed;
    PositionValuer internal valuer;
    PositionSizedCredit internal credit;

    address internal constant BORROWER = 0x0Cc688BF78bDCC3C072903100B2b821cC8d7d666;
    address internal constant OTHER = 0x1170b8ce6e19C23c716385521A88E30D5BaEA37C;
    address internal constant A_WETH = 0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8;
    address internal constant V_DEBT_WETH = 0x0b925Ed3632cfC27493afbdec26DC8C2bd146C73;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant ETH_USD_AGGREGATOR = 0x7d4E742018fb52E48b08BE73d041C18B21de6Fb5;

    uint64 internal constant MAINNET = 3;
    uint64 internal constant ANCHOR_BLOCK = 25_962_220;
    uint64 internal constant MEASURE_BLOCK = 25_970_521;
    uint64 internal constant PRICE_BLOCK = 25_960_602;

    int256 internal constant LEDGER_NET = 433_014_008_378_577_163_575;
    int256 internal constant ATTESTED_BALANCE = 433_033_874_843_288_486_772;
    int256 internal constant ETH_USD_ANSWER = 250_877_010_000;
    uint256 internal constant PRICE_UPDATED_AT = 1_789_326_827;
    uint256 internal constant MAX_STALENESS = 86_400;

    /// @dev Measured off-chain: the real position is worth this many 8-decimal USD.
    int256 internal constant REAL_NET_WORTH_USD8 = 108_638_243_749_398;

    uint256 internal constant LTV_BPS = 2_000; // 20% of proven net worth
    int256 internal constant FLOOR_USD8 = 1_000e8; // $1,000
    uint256 internal constant CAP_USD8 = 500_000e8; // $500,000

    function setUp() public {
        vm.warp(PRICE_UPDATED_AT + 60);
        registry = new MainnetPositionRegistry(address(this), MAINNET, 1_000);
        tokens = new MainnetTokenRegistry(address(this), MAINNET);
        feed = new AttestedPriceFeed(address(this), MAINNET, MAX_STALENESS);
        valuer = new PositionValuer(address(registry), address(tokens), address(feed));
        credit = new PositionSizedCredit(address(valuer), address(this), LTV_BPS, FLOOR_USD8, CAP_USD8);
    }

    // ─────────────────────────── helpers ───────────────────────────

    function _registerTokens() internal {
        tokens.registerToken(A_WETH, 18, MainnetTopics.PROTOCOL_AAVE_V3, MainnetTokenRegistry.TokenKind.Asset, WETH, MEASURE_BLOCK, MAINNET);
        tokens.registerToken(V_DEBT_WETH, 18, MainnetTopics.PROTOCOL_AAVE_V3, MainnetTokenRegistry.TokenKind.Liability, WETH, MEASURE_BLOCK, MAINNET);
    }

    /// @dev The exact sequence the broadcast runs, with the real measured values.
    function _realPosition() internal {
        _registerTokens();

        registry.setZeroAnchor(BORROWER, A_WETH, ANCHOR_BLOCK, MAINNET, keccak256("anchor:scale:0Cc688BF"));

        MainnetPositionRegistry.LedgerEntry[] memory rows = new MainnetPositionRegistry.LedgerEntry[](1);
        rows[0] = MainnetPositionRegistry.LedgerEntry({
            account: BORROWER,
            token: A_WETH,
            delta: LEDGER_NET,
            sourceBlock: MEASURE_BLOCK,
            kind: MainnetPositionRegistry.LedgerKind.Mint,
            txHash: keccak256("ledger-aggregate:scale:0Cc688BF")
        });
        registry.ingestLedger(MAINNET, rows);

        registry.reconcile(BORROWER, A_WETH, ATTESTED_BALANCE, MEASURE_BLOCK, MAINNET, keccak256("balance-attestation:scale:0Cc688BF"));

        feed.submitAnswer(ETH_USD_AGGREGATOR, ETH_USD_ANSWER, 8, PRICE_BLOCK, PRICE_UPDATED_AT, MAINNET, keccak256("chainlink:eth-usd:round-33590"));
    }

    /// @dev Anchor and fund an account without reconciling, so the position is exactly the ledger.
    function _positionOnly(address account, address token, int256 amount) internal {
        registry.setZeroAnchor(account, token, ANCHOR_BLOCK, MAINNET, keccak256(abi.encode("anchor", account, token)));
        MainnetPositionRegistry.LedgerEntry[] memory rows = new MainnetPositionRegistry.LedgerEntry[](1);
        rows[0] = MainnetPositionRegistry.LedgerEntry({
            account: account,
            token: token,
            delta: amount,
            sourceBlock: MEASURE_BLOCK,
            kind: amount > 0 ? MainnetPositionRegistry.LedgerKind.Mint : MainnetPositionRegistry.LedgerKind.Burn,
            txHash: keccak256(abi.encode("tx", account, token))
        });
        registry.ingestLedger(MAINNET, rows);
    }

    function _one(address token) internal pure returns (address[] memory a) {
        a = new address[](1);
        a[0] = token;
    }

    function _oneFeed() internal pure returns (address[] memory a) {
        a = new address[](1);
        a[0] = ETH_USD_AGGREGATOR;
    }

    // ═══════════════ the real position produces a real limit ═══════════════

    function test_RealPositionYieldsEligibleLimit() public {
        _realPosition();
        PositionSizedCredit.Decision memory d = credit.limitFor(BORROWER, _one(A_WETH), _oneFeed());

        assertEq(d.netWorthUsd8, REAL_NET_WORTH_USD8);
        assertEq(uint256(d.status), uint256(PositionSizedCredit.Status.Eligible));
        // 108638243749398 * 2000 / 10000, integer division
        assertEq(d.limitUsd8, 21_727_648_749_879);
    }

    /// @dev The limit must never exceed the proven net worth, at any policy setting.
    function test_LimitNeverExceedsProvenNetWorth() public {
        _realPosition();
        credit.setPolicy(PositionSizedCredit(address(credit)).MAX_LTV_BPS(), FLOOR_USD8, type(uint256).max);
        PositionSizedCredit.Decision memory d = credit.limitFor(BORROWER, _one(A_WETH), _oneFeed());
        assertEq(uint256(d.limitUsd8), uint256(REAL_NET_WORTH_USD8) / 2);
        assertLt(uint256(d.limitUsd8), uint256(REAL_NET_WORTH_USD8));
    }

    function test_LimitScalesWithLtv() public {
        _realPosition();
        credit.setPolicy(1_000, FLOOR_USD8, CAP_USD8);
        PositionSizedCredit.Decision memory a = credit.limitFor(BORROWER, _one(A_WETH), _oneFeed());
        credit.setPolicy(4_000, FLOOR_USD8, CAP_USD8);
        PositionSizedCredit.Decision memory b = credit.limitFor(BORROWER, _one(A_WETH), _oneFeed());

        // Not exactly 4x: integer division truncates, so allow a few wei of slack rather
        // than asserting a property the arithmetic cannot have.
        assertApproxEqAbs(b.limitUsd8, a.limitUsd8 * 4, 10);
        assertGt(b.limitUsd8, a.limitUsd8);
        assertEq(uint256(b.status), uint256(PositionSizedCredit.Status.Eligible));
    }

    function test_CapApplies() public {
        _realPosition();
        credit.setPolicy(4_000, FLOOR_USD8, 1_000e8); // $1,000 cap, well under 40% of net worth
        PositionSizedCredit.Decision memory d = credit.limitFor(BORROWER, _one(A_WETH), _oneFeed());
        assertEq(d.limitUsd8, 1_000e8);
        assertEq(uint256(d.status), uint256(PositionSizedCredit.Status.Eligible));
    }

    function test_CreditLimitUsd8MatchesDecision() public {
        _realPosition();
        uint256 direct = credit.creditLimitUsd8(BORROWER, _one(A_WETH), _oneFeed());
        PositionSizedCredit.Decision memory d = credit.limitFor(BORROWER, _one(A_WETH), _oneFeed());
        assertEq(direct, d.limitUsd8);
    }

    // ═══════════════ each zero-limit reason stays distinguishable ═══════════════

    function test_UnanchoredIsReportedNotSilentlyZero() public {
        _registerTokens();
        feed.submitAnswer(ETH_USD_AGGREGATOR, ETH_USD_ANSWER, 8, PRICE_BLOCK, PRICE_UPDATED_AT, MAINNET, keccak256("p"));

        PositionSizedCredit.Decision memory d = credit.limitFor(BORROWER, _one(A_WETH), _oneFeed());
        assertEq(d.limitUsd8, 0);
        assertEq(uint256(d.status), uint256(PositionSizedCredit.Status.Unanchored));
    }

    function test_NegativeNetWorthIsReportedNotSilentlyZero() public {
        _registerTokens();
        _positionOnly(BORROWER, A_WETH, 10 ether);
        _positionOnly(BORROWER, V_DEBT_WETH, 100 ether); // debt exceeds assets
        feed.submitAnswer(ETH_USD_AGGREGATOR, ETH_USD_ANSWER, 8, PRICE_BLOCK, PRICE_UPDATED_AT, MAINNET, keccak256("p"));

        address[] memory t = new address[](2);
        t[0] = A_WETH;
        t[1] = V_DEBT_WETH;
        address[] memory f = new address[](2);
        f[0] = ETH_USD_AGGREGATOR;
        f[1] = ETH_USD_AGGREGATOR;

        PositionSizedCredit.Decision memory d = credit.limitFor(BORROWER, t, f);
        assertEq(d.limitUsd8, 0);
        assertLt(d.netWorthUsd8, 0); // the negative is reported, not clamped
        assertEq(uint256(d.status), uint256(PositionSizedCredit.Status.NegativeNetWorth));
    }

    function test_LiabilitySubtractsFromAsset() public {
        _registerTokens();
        _positionOnly(BORROWER, A_WETH, 10 ether);
        _positionOnly(BORROWER, V_DEBT_WETH, 4 ether);
        feed.submitAnswer(ETH_USD_AGGREGATOR, 2_000e8, 8, PRICE_BLOCK, PRICE_UPDATED_AT, MAINNET, keccak256("p"));

        address[] memory t = new address[](2);
        t[0] = A_WETH;
        t[1] = V_DEBT_WETH;
        address[] memory f = new address[](2);
        f[0] = ETH_USD_AGGREGATOR;
        f[1] = ETH_USD_AGGREGATOR;

        PositionSizedCredit.Decision memory d = credit.limitFor(BORROWER, t, f);
        // 10 - 4 = 6 ETH at $2,000 = $12,000
        assertEq(d.netWorthUsd8, 12_000e8);
        assertEq(uint256(d.status), uint256(PositionSizedCredit.Status.Eligible));
    }

    function test_BelowFloorIsDistinctFromNegative() public {
        _registerTokens();
        _positionOnly(BORROWER, A_WETH, 1e15); // dust
        feed.submitAnswer(ETH_USD_AGGREGATOR, 2_000e8, 8, PRICE_BLOCK, PRICE_UPDATED_AT, MAINNET, keccak256("p"));

        PositionSizedCredit.Decision memory d = credit.limitFor(BORROWER, _one(A_WETH), _oneFeed());
        assertEq(d.limitUsd8, 0);
        assertGt(d.netWorthUsd8, 0); // positive, just small
        assertEq(uint256(d.status), uint256(PositionSizedCredit.Status.BelowFloor));
    }

    function test_ZeroLtvIsPolicyRejected() public {
        _realPosition();
        credit.setPolicy(0, FLOOR_USD8, CAP_USD8);
        PositionSizedCredit.Decision memory d = credit.limitFor(BORROWER, _one(A_WETH), _oneFeed());
        assertEq(uint256(d.status), uint256(PositionSizedCredit.Status.PolicyRejected));
    }

    /// @dev A policy so small that the multiplication truncates to zero is a broken policy,
    ///      not an eligible borrower, and must not be reported as Eligible.
    function test_DustLimitIsPolicyRejectedNotEligible() public {
        _registerTokens();
        // 25 gwei of aWETH at $2,000 prices to $0.00005, which is above a zero floor but
        // below one basis point in 8-decimal USD, so the policy multiplication truncates.
        _positionOnly(BORROWER, A_WETH, 25e9);
        feed.submitAnswer(ETH_USD_AGGREGATOR, 2_000e8, 8, PRICE_BLOCK, PRICE_UPDATED_AT, MAINNET, keccak256("p"));
        credit.setPolicy(1, 0, CAP_USD8);

        PositionSizedCredit.Decision memory d = credit.limitFor(BORROWER, _one(A_WETH), _oneFeed());
        assertEq(d.netWorthUsd8, 5_000); // a real, positive net worth
        assertEq(d.limitUsd8, 0);
        assertEq(uint256(d.status), uint256(PositionSizedCredit.Status.PolicyRejected));
    }

    function test_EmptyTokenSetIsNotEligible() public {
        PositionSizedCredit.Decision memory d =
            credit.limitFor(BORROWER, new address[](0), new address[](0));
        assertEq(d.limitUsd8, 0);
        assertEq(uint256(d.status), uint256(PositionSizedCredit.Status.BelowFloor));
    }

    /// @dev An unanchored account must be reported as such even when another account on the
    ///      same token is perfectly anchored: anchors are per account and token.
    function test_AnchorIsPerAccount() public {
        _realPosition();
        PositionSizedCredit.Decision memory d = credit.limitFor(OTHER, _one(A_WETH), _oneFeed());
        assertEq(d.limitUsd8, 0);
        assertEq(uint256(d.status), uint256(PositionSizedCredit.Status.Unanchored));
    }

    // ═══════════════ broken inputs revert rather than reporting zero ═══════════════

    function test_StalePriceReverts() public {
        _realPosition();
        vm.warp(PRICE_UPDATED_AT + MAX_STALENESS + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                AttestedPriceFeed.StalePrice.selector, ETH_USD_AGGREGATOR, MAX_STALENESS + 1, MAX_STALENESS
            )
        );
        credit.limitFor(BORROWER, _one(A_WETH), _oneFeed());
    }

    function test_UnregisteredTokenReverts() public {
        _realPosition();
        // Genuinely not registered: _registerTokens registers A_WETH and V_DEBT_WETH, so
        // using either of those here would silently register them and pass for the wrong reason.
        address unregistered = address(0xDEADBEEF);
        vm.expectRevert(
            abi.encodeWithSelector(MainnetTokenRegistry.TokenNotRegistered.selector, unregistered)
        );
        credit.limitFor(BORROWER, _one(unregistered), _oneFeed());
    }

    function test_LengthMismatchReverts() public {
        _realPosition();
        vm.expectRevert(abi.encodeWithSelector(PositionSizedCredit.LengthMismatch.selector, 1, 2));
        credit.limitFor(BORROWER, _one(A_WETH), new address[](2));
    }

    // ═══════════════ policy administration ═══════════════

    function test_SetPolicyRejectsLtvAboveMax() public {
        vm.expectRevert(
            abi.encodeWithSelector(PositionSizedCredit.LtvTooHigh.selector, 5_001, 5_000)
        );
        credit.setPolicy(5_001, FLOOR_USD8, CAP_USD8);
    }

    function test_ConstructorRejectsLtvAboveMax() public {
        vm.expectRevert(abi.encodeWithSelector(PositionSizedCredit.LtvTooHigh.selector, 9_000, 5_000));
        new PositionSizedCredit(address(valuer), address(this), 9_000, FLOOR_USD8, CAP_USD8);
    }

    function test_ConstructorRejectsZeroAddresses() public {
        vm.expectRevert(PositionSizedCredit.ZeroAddress.selector);
        new PositionSizedCredit(address(0), address(this), LTV_BPS, FLOOR_USD8, CAP_USD8);
        vm.expectRevert(PositionSizedCredit.ZeroAddress.selector);
        new PositionSizedCredit(address(valuer), address(0), LTV_BPS, FLOOR_USD8, CAP_USD8);
    }

    function test_SetPolicyOnlyOwner() public {
        vm.prank(OTHER);
        vm.expectRevert(abi.encodeWithSelector(PositionSizedCredit.NotOwner.selector, OTHER));
        credit.setPolicy(1_000, FLOOR_USD8, CAP_USD8);
    }

    function test_SetPolicyEmits() public {
        vm.expectEmit(false, false, false, true);
        emit PositionSizedCredit.PolicySet(3_000, 5_000e8, 250_000e8);
        credit.setPolicy(3_000, 5_000e8, 250_000e8);
    }

    function test_TransferOwnershipOnlyOwnerAndEmits() public {
        vm.prank(OTHER);
        vm.expectRevert(abi.encodeWithSelector(PositionSizedCredit.NotOwner.selector, OTHER));
        credit.transferOwnership(OTHER);

        vm.expectEmit(true, true, false, true);
        emit PositionSizedCredit.OwnerTransferred(address(this), OTHER);
        credit.transferOwnership(OTHER);
        assertEq(credit.owner(), OTHER);

        vm.expectRevert(PositionSizedCredit.ZeroAddress.selector);
        vm.prank(OTHER);
        credit.transferOwnership(address(0));
    }

    /// @dev Newly transferred owner can act, and the old one no longer can.
    function test_OwnershipActuallyMovesAuthority() public {
        credit.transferOwnership(OTHER);
        vm.prank(OTHER);
        credit.setPolicy(1_500, FLOOR_USD8, CAP_USD8);
        assertEq(credit.ltvBps(), 1_500);

        vm.expectRevert(abi.encodeWithSelector(PositionSizedCredit.NotOwner.selector, address(this)));
        credit.setPolicy(1_000, FLOOR_USD8, CAP_USD8);
    }
}
