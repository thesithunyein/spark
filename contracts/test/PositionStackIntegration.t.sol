// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MainnetPositionRegistry} from "../src/MainnetPositionRegistry.sol";
import {MainnetTokenRegistry} from "../src/MainnetTokenRegistry.sol";
import {AttestedPriceFeed} from "../src/AttestedPriceFeed.sol";
import {PositionValuer} from "../src/PositionValuer.sol";
import {MainnetTopics} from "../src/MainnetTopics.sol";

/**
 * @notice End-to-end integration of the whole position stack, driven by REAL measured
 *         mainnet data rather than synthetic fixtures.
 *
 * This mirrors exactly what script/ProveMainnetPosition.s.sol broadcasts on-chain, so a
 * local pass means the deployment path is exercised before any gas is spent.
 *
 * The numbers below are not arbitrary. They were produced by app/scripts/position-scale.mjs
 * and are stored in docs/evidence/position-scale.json:
 *
 *   wallet            0x0Cc688BF78bDCC3C072903100B2b821cC8d7d666 (a real Aave v3 depositor)
 *   anchor block      25,962,220 - `balanceOf` returns 0 there. Re-verified by archive
 *                     eth_call at the time of writing, not assumed.
 *   ledger net        433.014008378577163575 aWETH, from 8,508 real Transfer logs
 *   attested balance  433.033874843288486772 aWETH, the real balanceOf at measurement
 *   residual          0.019866464711323197 aWETH = 0.4588 bps (interest)
 *   ETH/USD           250,877,010,000 at 8 decimals ($2,508.7701), block 25,960,602
 *
 * The assertion that matters: the residual that lands on-chain equals the residual that
 * was measured off-chain, and the resulting valuation matches to the wei.
 */
contract PositionStackIntegrationTest is Test {
    MainnetPositionRegistry internal registry;
    MainnetTokenRegistry internal tokens;
    AttestedPriceFeed internal feed;
    PositionValuer internal valuer;

    // ── real mainnet facts ──
    address internal constant BORROWER = 0x0Cc688BF78bDCC3C072903100B2b821cC8d7d666;
    address internal constant A_WETH = 0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant ETH_USD_AGGREGATOR = 0x7d4E742018fb52E48b08BE73d041C18B21de6Fb5;

    uint64 internal constant MAINNET = 3;
    uint64 internal constant ANCHOR_BLOCK = 25_962_220;
    // Verified against mainnet with archive eth_call: this is the block at which
    // aWETH.balanceOf(BORROWER) equals ATTESTED_BALANCE exactly.
    uint64 internal constant MEASURE_BLOCK = 25_970_521;
    uint64 internal constant PRICE_BLOCK = 25_960_602;

    int256 internal constant LEDGER_NET = 433_014_008_378_577_163_575;
    int256 internal constant ATTESTED_BALANCE = 433_033_874_843_288_486_772;
    int256 internal constant EXPECTED_RESIDUAL = 19_866_464_711_323_197;
    int256 internal constant ETH_USD_ANSWER = 250_877_010_000;
    uint256 internal constant PRICE_UPDATED_AT = 1_789_326_827;
    uint256 internal constant MAX_STALENESS = 86_400;

    /// @dev Off-chain measurement: 433.033874843288486772 * 2508.7701 / 1e18, 8dp.
    int256 internal constant EXPECTED_VALUE_USD8 = 108_638_243_749_398;

    function setUp() public {
        // fresh price, matching how the broadcast runs against a real chain clock
        vm.warp(PRICE_UPDATED_AT + 60);

        registry = new MainnetPositionRegistry(address(this), MAINNET, 1_000);
        tokens = new MainnetTokenRegistry(address(this), MAINNET);
        feed = new AttestedPriceFeed(address(this), MAINNET, MAX_STALENESS);
        valuer = new PositionValuer(address(registry), address(tokens), address(feed));
    }

    /// @dev The exact sequence script/ProveMainnetPosition.s.sol broadcasts.
    function _runFullFlow() internal {
        tokens.registerToken(
            A_WETH,
            18,
            MainnetTopics.PROTOCOL_AAVE_V3,
            MainnetTokenRegistry.TokenKind.Asset,
            WETH,
            MEASURE_BLOCK,
            MAINNET
        );

        registry.setZeroAnchor(
            BORROWER, A_WETH, ANCHOR_BLOCK, MAINNET, keccak256("anchor:scale:0Cc688BF")
        );

        MainnetPositionRegistry.LedgerEntry[] memory rows =
            new MainnetPositionRegistry.LedgerEntry[](1);
        rows[0] = MainnetPositionRegistry.LedgerEntry({
            account: BORROWER,
            token: A_WETH,
            delta: LEDGER_NET,
            sourceBlock: MEASURE_BLOCK,
            kind: MainnetPositionRegistry.LedgerKind.Mint,
            txHash: keccak256("ledger-aggregate:scale:0Cc688BF")
        });
        registry.ingestLedger(MAINNET, rows);

        registry.reconcile(
            BORROWER,
            A_WETH,
            ATTESTED_BALANCE,
            MEASURE_BLOCK,
            MAINNET,
            keccak256("balance-attestation:scale:0Cc688BF")
        );

        feed.submitAnswer(
            ETH_USD_AGGREGATOR,
            ETH_USD_ANSWER,
            8,
            PRICE_BLOCK,
            PRICE_UPDATED_AT,
            MAINNET,
            keccak256("chainlink:eth-usd:round-33590")
        );
    }

    // ═══════════════════════ the end-to-end proof ═══════════════════════

    /// @dev One test, the whole pipeline, real data, exact expected output.
    function test_EndToEnd_RealMainnetPosition() public {
        _runFullFlow();

        // the ledger is what the transfers say, untouched by reconciliation
        assertEq(registry.ledgerNet(BORROWER, A_WETH), LEDGER_NET);

        // the residual equals the measured interest, to the wei
        MainnetPositionRegistry.Position memory p = registry.positionOf(BORROWER, A_WETH);
        assertEq(p.interestResidual, EXPECTED_RESIDUAL);
        assertEq(p.anchorBlock, ANCHOR_BLOCK);
        assertEq(p.lastBlock, MEASURE_BLOCK);
        assertEq(p.entries, 1);
        assertTrue(p.anchored);

        // reconstructed position == the real attested balance, exactly
        assertEq(registry.netPosition(BORROWER, A_WETH), ATTESTED_BALANCE);
        assertEq(LEDGER_NET + EXPECTED_RESIDUAL, ATTESTED_BALANCE);

        // valuation matches the off-chain computation to the wei
        PositionValuer.Valuation memory v = valuer.valuationOf(BORROWER, A_WETH, ETH_USD_AGGREGATOR);
        assertEq(v.position, ATTESTED_BALANCE);
        assertEq(v.tokenDecimals, 18);
        assertEq(v.priceDecimals, 8);
        assertEq(v.price, ETH_USD_ANSWER);
        assertEq(v.valueUsd8, EXPECTED_VALUE_USD8);
    }

    /// @dev The headline the docs quote: about $1.086M of proven net worth, and the
    ///      ledger alone would have understated it by the interest term.
    function test_EndToEnd_ValueIsAboutOneMillionUsd() public {
        _runFullFlow();
        PositionValuer.Valuation memory v = valuer.valuationOf(BORROWER, A_WETH, ETH_USD_AGGREGATOR);
        assertEq(v.valueUsd8 / 1e8, 1_086_382); // whole dollars
        assertGt(v.valueUsd8 - (LEDGER_NET * ETH_USD_ANSWER) / 1e18, 0); // interest adds value
    }

    /// @dev Contrast: the naive Aave-event figure for this same wallet. It is larger than
    ///      the true balance, which is why the engine reads the token ledger instead.
    ///      Measured elsewhere at 66% error on a different wallet; here we assert the
    ///      general fact that an event-only sum is not what reconciliation accepts.
    function test_ReconcileRejectsTheWrongNumber() public {
        tokens.registerToken(
            A_WETH, 18, MainnetTopics.PROTOCOL_AAVE_V3,
            MainnetTokenRegistry.TokenKind.Asset, WETH, MEASURE_BLOCK, MAINNET
        );
        registry.setZeroAnchor(BORROWER, A_WETH, ANCHOR_BLOCK, MAINNET, keccak256("a"));

        MainnetPositionRegistry.LedgerEntry[] memory rows =
            new MainnetPositionRegistry.LedgerEntry[](1);
        rows[0] = MainnetPositionRegistry.LedgerEntry({
            account: BORROWER, token: A_WETH, delta: LEDGER_NET, sourceBlock: MEASURE_BLOCK,
            kind: MainnetPositionRegistry.LedgerKind.Mint, txHash: keccak256("t")
        });
        registry.ingestLedger(MAINNET, rows);

        // Claim a balance 10%+1 above the ledger. The cap is 10%, so this must revert:
        // the point is that the contract refuses to explain a large gap as "interest".
        int256 inflated = LEDGER_NET + (LEDGER_NET / 10) + 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                MainnetPositionRegistry.ExcessResidual.selector, inflated - LEDGER_NET, LEDGER_NET
            )
        );
        registry.reconcile(BORROWER, A_WETH, inflated, MEASURE_BLOCK, MAINNET, keccak256("bad"));
    }

    function test_AnchorIsRequiredBeforeAnyFlow() public {
        vm.expectRevert(MainnetPositionRegistry.AnchorMissing.selector);
        registry.reconcile(BORROWER, A_WETH, ATTESTED_BALANCE, MEASURE_BLOCK, MAINNET, keccak256("x"));
    }

    function test_ValueRevertsOnceThePriceGoesStale() public {
        _runFullFlow();
        vm.warp(PRICE_UPDATED_AT + MAX_STALENESS + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                AttestedPriceFeed.StalePrice.selector,
                ETH_USD_AGGREGATOR,
                MAX_STALENESS + 1,
                MAX_STALENESS
            )
        );
        valuer.valuationOf(BORROWER, A_WETH, ETH_USD_AGGREGATOR);
    }

    /// @dev The interest term keeps growing in reality: re-measured after the evidence
    ///      snapshot, the same wallet's balance had already risen again. That is exactly
    ///      why the residual is capped and re-attested rather than trusted forever.
    function test_GrowingInterestIsCappedAndReAttestable() public {
        _runFullFlow();

        // a later, larger attested balance: still inside the cap, so it updates
        int256 grown = ATTESTED_BALANCE + (LEDGER_NET / 1_000); // +0.1%
        int256 residual2 =
            registry.reconcile(BORROWER, A_WETH, grown, MEASURE_BLOCK + 1, MAINNET, keccak256("later"));
        assertEq(residual2, grown - LEDGER_NET);
        assertEq(registry.netPosition(BORROWER, A_WETH), grown);
    }
}
