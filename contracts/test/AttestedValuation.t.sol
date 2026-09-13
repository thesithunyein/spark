// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MainnetPositionRegistry} from "../src/MainnetPositionRegistry.sol";
import {MainnetTokenRegistry} from "../src/MainnetTokenRegistry.sol";
import {AttestedPriceFeed} from "../src/AttestedPriceFeed.sol";
import {PositionValuer} from "../src/PositionValuer.sol";
import {MainnetTopics} from "../src/MainnetTopics.sol";

/**
 * @notice Tests for attested pricing, token metadata, and USD valuation.
 *
 * The topic-parity block at the end pins every declared topic0 against the value that
 * was actually confirmed against live mainnet logs by scripts/protocol-topics.mjs. A
 * wrong topic0 returns an empty list instead of an error, so this is the only thing
 * standing between a typo and an indexer that silently reports "no activity".
 */
contract AttestedValuationTest is Test {
    MainnetPositionRegistry internal posReg;
    MainnetTokenRegistry internal tokReg;
    AttestedPriceFeed internal feed;
    PositionValuer internal valuer;

    uint64 internal constant MAINNET = 3;
    uint256 internal constant MAX_STALENESS = 3_600; // 1 hour

    // mainnet token addresses, used here purely as identifiers
    address internal constant A_WETH = 0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8;
    address internal constant V_DEBT_WETH = 0x0b925Ed3632cfC27493afbdec26DC8C2bd146C73;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    address internal constant ETH_USD = address(0xFEE1);
    address internal constant USDC_USD = address(0xFEE2);

    address internal constant BORROWER = 0xb05C9Ca8123B6bA84C767c4ee8f9Ae66b0733180;
    address internal other = address(0xAA11);

    uint64 internal anchorBlock = 25_592_380;
    uint64 internal priceBlock = 25_970_000;

    function setUp() public {
        posReg = new MainnetPositionRegistry(address(this), MAINNET, 1_000);
        tokReg = new MainnetTokenRegistry(address(this), MAINNET);
        feed = new AttestedPriceFeed(address(this), MAINNET, MAX_STALENESS);
        valuer = new PositionValuer(address(posReg), address(tokReg), address(feed));

        tokReg.registerToken(A_WETH, 18, MainnetTopics.PROTOCOL_AAVE_V3, MainnetTokenRegistry.TokenKind.Asset, WETH, 25_970_000, MAINNET);
        tokReg.registerToken(V_DEBT_WETH, 18, MainnetTopics.PROTOCOL_AAVE_V3, MainnetTokenRegistry.TokenKind.Liability, WETH, 25_970_000, MAINNET);
        tokReg.registerToken(USDC, 6, MainnetTopics.PROTOCOL_AAVE_V3, MainnetTokenRegistry.TokenKind.Asset, address(0), 25_970_000, MAINNET);
    }

    // ─────────────────────────── helpers ───────────────────────────

    function _price(address feedAddr, int256 answer, uint8 decimals) internal {
        priceBlock += 1;
        feed.submitAnswer(feedAddr, answer, decimals, priceBlock, block.timestamp, MAINNET, keccak256(abi.encode("p", feedAddr, priceBlock)));
    }

    function _position(address account, address token, int256 amount) internal {
        posReg.setZeroAnchor(account, token, anchorBlock, MAINNET, keccak256(abi.encode("anchor", account, token)));
        MainnetPositionRegistry.LedgerEntry[] memory rows = new MainnetPositionRegistry.LedgerEntry[](1);
        rows[0] = MainnetPositionRegistry.LedgerEntry({
            account: account,
            token: token,
            delta: amount,
            sourceBlock: anchorBlock + 1,
            kind: amount > 0 ? MainnetPositionRegistry.LedgerKind.Mint : MainnetPositionRegistry.LedgerKind.Burn,
            txHash: keccak256(abi.encode("tx", account, token))
        });
        posReg.ingestLedger(MAINNET, rows);
    }

    // ═══════════════════════ AttestedPriceFeed ═══════════════════════

    function test_SubmitAnswerStores() public {
        _price(ETH_USD, 4_000e8, 8);
        AttestedPriceFeed.PriceData memory p = feed.priceOf(ETH_USD);
        assertEq(p.answer, 4_000e8);
        assertEq(p.decimals, 8);
        assertTrue(p.set);
        assertEq(p.sourceBlock, priceBlock);

        (int256 answer, uint8 dec) = feed.latestPrice(ETH_USD);
        assertEq(answer, 4_000e8);
        assertEq(dec, 8);
    }

    function test_SubmitRejectsWrongChain() public {
        vm.expectRevert(
            abi.encodeWithSelector(AttestedPriceFeed.BadChain.selector, uint64(1), MAINNET)
        );
        feed.submitAnswer(ETH_USD, 1, 8, priceBlock + 1, block.timestamp, 1, keccak256("x"));
    }

    /// @dev A non-positive Chainlink answer is a fault signal, never collateral.
    function test_SubmitRejectsNonPositiveAnswer() public {
        vm.expectRevert(abi.encodeWithSelector(AttestedPriceFeed.BadAnswer.selector, int256(0)));
        feed.submitAnswer(ETH_USD, 0, 8, priceBlock + 1, block.timestamp, MAINNET, keccak256("z"));

        vm.expectRevert(abi.encodeWithSelector(AttestedPriceFeed.BadAnswer.selector, int256(-1)));
        feed.submitAnswer(ETH_USD, -1, 8, priceBlock + 2, block.timestamp, MAINNET, keccak256("n"));
    }

    function test_SubmitRejectsBadDecimals() public {
        vm.expectRevert(abi.encodeWithSelector(AttestedPriceFeed.BadDecimals.selector, uint8(19)));
        feed.submitAnswer(ETH_USD, 1, 19, priceBlock + 1, block.timestamp, MAINNET, keccak256("d"));
    }

    function test_SubmitRejectsReplayedAttestation() public {
        bytes32 ref = keccak256("once");
        feed.submitAnswer(ETH_USD, 4_000e8, 8, priceBlock + 1, block.timestamp, MAINNET, ref);

        vm.expectRevert(abi.encodeWithSelector(AttestedPriceFeed.ReplayAttestation.selector, ref));
        feed.submitAnswer(ETH_USD, 4_100e8, 8, priceBlock + 2, block.timestamp, MAINNET, ref);
    }

    /// @dev A reordered or replayed attestation must not move a price backwards to a
    ///      more convenient value.
    function test_SubmitRejectsNonMonotonicBlock() public {
        _price(ETH_USD, 4_000e8, 8);

        vm.expectRevert(
            abi.encodeWithSelector(
                AttestedPriceFeed.StaleBlock.selector, priceBlock, priceBlock
            )
        );
        feed.submitAnswer(ETH_USD, 9_999e8, 8, priceBlock, block.timestamp, MAINNET, keccak256("same"));

        vm.expectRevert(
            abi.encodeWithSelector(
                AttestedPriceFeed.StaleBlock.selector, priceBlock - 1, priceBlock
            )
        );
        feed.submitAnswer(ETH_USD, 9_999e8, 8, priceBlock - 1, block.timestamp, MAINNET, keccak256("older"));
    }

    function test_LatestPriceRevertsWhenUnset() public {
        vm.expectRevert(abi.encodeWithSelector(AttestedPriceFeed.PriceNotSet.selector, USDC_USD));
        feed.latestPrice(USDC_USD);
    }

    function test_LatestPriceRevertsWhenStale() public {
        _price(ETH_USD, 4_000e8, 8);
        vm.warp(block.timestamp + MAX_STALENESS + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                AttestedPriceFeed.StalePrice.selector, ETH_USD, MAX_STALENESS + 1, MAX_STALENESS
            )
        );
        feed.latestPrice(ETH_USD);
    }

    function test_LatestPriceFreshAtBoundary() public {
        _price(ETH_USD, 4_000e8, 8);
        vm.warp(block.timestamp + MAX_STALENESS); // exactly at the bound, still fresh
        (int256 answer,) = feed.latestPrice(ETH_USD);
        assertEq(answer, 4_000e8);
    }

    function test_FeedOnlyAttestor() public {
        vm.startPrank(other);
        vm.expectRevert(AttestedPriceFeed.NotAttestor.selector);
        feed.submitAnswer(ETH_USD, 1, 8, priceBlock + 1, block.timestamp, MAINNET, keccak256("x"));
        vm.expectRevert(AttestedPriceFeed.NotAttestor.selector);
        feed.transferAttestor(other);
        vm.stopPrank();
    }

    function test_FeedConstructorValidation() public {
        vm.expectRevert(AttestedPriceFeed.ZeroAddress.selector);
        new AttestedPriceFeed(address(0), MAINNET, MAX_STALENESS);

        vm.expectRevert(AttestedPriceFeed.InvalidStaleness.selector);
        new AttestedPriceFeed(address(this), MAINNET, 0);
    }

    // ═══════════════════════ MainnetTokenRegistry ═══════════════════════

    function test_RegisterTokenStores() public {
        MainnetTokenRegistry.TokenMeta memory m = tokReg.metaOf(A_WETH);
        assertEq(m.decimals, 18);
        assertEq(m.protocol, MainnetTopics.PROTOCOL_AAVE_V3);
        assertEq(uint256(m.kind), uint256(MainnetTokenRegistry.TokenKind.Asset));
        assertEq(m.underlying, WETH);
        assertTrue(m.set);
    }

    function test_DecimalsAndSignOf() public view {
        assertEq(tokReg.decimalsOf(A_WETH), 18);
        assertEq(tokReg.decimalsOf(USDC), 6);
        assertEq(int256(tokReg.signOf(A_WETH)), int256(1)); // asset
        assertEq(int256(tokReg.signOf(V_DEBT_WETH)), int256(-1)); // liability
    }

    /// @dev Silently changing decimals would re-scale every position already derived.
    function test_RegisterRejectsDuplicate() public {
        vm.expectRevert(
            abi.encodeWithSelector(MainnetTokenRegistry.AlreadyRegistered.selector, A_WETH)
        );
        tokReg.registerToken(A_WETH, 8, MainnetTopics.PROTOCOL_AAVE_V3, MainnetTokenRegistry.TokenKind.Asset, WETH, 1, MAINNET);
    }

    function test_RegisterValidation() public {
        vm.expectRevert(
            abi.encodeWithSelector(MainnetTokenRegistry.BadChain.selector, uint64(9), MAINNET)
        );
        tokReg.registerToken(other, 18, "x", MainnetTokenRegistry.TokenKind.Asset, address(0), 1, 9);

        vm.expectRevert(MainnetTokenRegistry.ZeroAddress.selector);
        tokReg.registerToken(address(0), 18, "x", MainnetTokenRegistry.TokenKind.Asset, address(0), 1, MAINNET);

        vm.expectRevert(
            abi.encodeWithSelector(MainnetTokenRegistry.BadDecimals.selector, uint8(19))
        );
        tokReg.registerToken(other, 19, "x", MainnetTokenRegistry.TokenKind.Asset, address(0), 1, MAINNET);
    }

    /// @dev Reverts rather than defaulting to 18, which is how a 6-decimal token ends
    ///      up valued a trillion times too high.
    function test_UnregisteredTokenReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(MainnetTokenRegistry.TokenNotRegistered.selector, other)
        );
        tokReg.decimalsOf(other);

        vm.expectRevert(
            abi.encodeWithSelector(MainnetTokenRegistry.TokenNotRegistered.selector, other)
        );
        tokReg.signOf(other);
    }

    function test_TokensOfProtocol() public view {
        address[] memory aave = tokReg.tokensOf(MainnetTopics.PROTOCOL_AAVE_V3);
        assertEq(aave.length, 3);
        assertEq(tokReg.tokensOf(MainnetTopics.PROTOCOL_MORPHO_BLUE).length, 0);
    }

    function test_TokenRegistryOnlyAttestor() public {
        vm.prank(other);
        vm.expectRevert(MainnetTokenRegistry.NotAttestor.selector);
        tokReg.registerToken(other, 18, "x", MainnetTokenRegistry.TokenKind.Asset, address(0), 1, MAINNET);
    }

    // ═══════════════════════ PositionValuer ═══════════════════════

    /// @dev 32.324944 aWETH at $4,000 is $129,299.776, in 8-decimal base units.
    function test_ValueOfWethPosition() public {
        _price(ETH_USD, 4_000e8, 8);
        _position(BORROWER, A_WETH, 32_324_944_000_000_000_000);

        PositionValuer.Valuation memory v = valuer.valuationOf(BORROWER, A_WETH, ETH_USD);
        assertEq(v.position, 32_324_944_000_000_000_000);
        assertEq(v.valueUsd8, 12_929_977_600_000);
        assertEq(v.tokenDecimals, 18);
        assertEq(v.priceDecimals, 8);
    }

    /// @dev The 6-decimal case, which is where hardcoding 18 goes wrong.
    function test_ValueOfUsdcPosition() public {
        _price(USDC_USD, 100_000_000, 8); // $1.00000000
        _position(BORROWER, USDC, 40_015_000_000); // 40,015.00 USDC

        PositionValuer.Valuation memory v = valuer.valuationOf(BORROWER, USDC, USDC_USD);
        assertEq(v.tokenDecimals, 6);
        assertEq(v.valueUsd8, 4_001_500_000_000);
    }

    /// @dev A liability token contributes negatively: the number is what you owe.
    function test_ValueOfLiabilityIsNegative() public {
        _price(ETH_USD, 4_000e8, 8);
        _position(BORROWER, V_DEBT_WETH, 10_000_000_000_000_000_000); // 10 WETH of debt

        PositionValuer.Valuation memory v = valuer.valuationOf(BORROWER, V_DEBT_WETH, ETH_USD);
        assertEq(v.position, -10_000_000_000_000_000_000);
        assertEq(v.valueUsd8, -4_000_000_000_000); // -$40,000
    }

    /// @dev The headline: net worth is assets minus liabilities, not gross holdings.
    function test_NetWorthNetsAssetsAgainstLiabilities() public {
        _price(ETH_USD, 4_000e8, 8);
        _position(BORROWER, A_WETH, 32_324_944_000_000_000_000);
        _position(BORROWER, V_DEBT_WETH, 10_000_000_000_000_000_000);

        address[] memory tokens = new address[](2);
        address[] memory feeds = new address[](2);
        tokens[0] = A_WETH;
        feeds[0] = ETH_USD;
        tokens[1] = V_DEBT_WETH;
        feeds[1] = ETH_USD;

        (int256 netUsd8, PositionValuer.Valuation[] memory parts) = valuer.netWorthUsd(BORROWER, tokens, feeds);
        assertEq(netUsd8, 12_929_977_600_000 - 4_000_000_000_000);
        assertEq(parts.length, 2);
        assertEq(parts[1].valueUsd8, -4_000_000_000_000);
    }

    function test_UnanchoredPositionValuesZero() public {
        _price(ETH_USD, 4_000e8, 8);
        PositionValuer.Valuation memory v = valuer.valuationOf(BORROWER, A_WETH, ETH_USD);
        assertEq(v.position, 0);
        assertEq(v.valueUsd8, 0);
        assertFalse(posReg.isAnchored(BORROWER, A_WETH));
    }

    function test_ValueRevertsOnStalePrice() public {
        _price(ETH_USD, 4_000e8, 8);
        _position(BORROWER, A_WETH, 1e18);
        vm.warp(block.timestamp + MAX_STALENESS + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                AttestedPriceFeed.StalePrice.selector, ETH_USD, MAX_STALENESS + 1, MAX_STALENESS
            )
        );
        valuer.valuationOf(BORROWER, A_WETH, ETH_USD);
    }

    function test_ValueRevertsOnUnregisteredToken() public {
        _price(ETH_USD, 4_000e8, 8);
        vm.expectRevert(
            abi.encodeWithSelector(MainnetTokenRegistry.TokenNotRegistered.selector, other)
        );
        valuer.valuationOf(BORROWER, other, ETH_USD);
    }

    function test_NetWorthRevertsOnLengthMismatch() public {
        address[] memory tokens = new address[](2);
        address[] memory feeds = new address[](1);
        vm.expectRevert(abi.encodeWithSelector(PositionValuer.LengthMismatch.selector, uint256(2), uint256(1)));
        valuer.netWorthUsd(BORROWER, tokens, feeds);
    }

    function test_ValuerConstructorRejectsZeroAddresses() public {
        vm.expectRevert(PositionValuer.ZeroAddress.selector);
        new PositionValuer(address(0), address(tokReg), address(feed));

        vm.expectRevert(PositionValuer.ZeroAddress.selector);
        new PositionValuer(address(posReg), address(0), address(feed));

        vm.expectRevert(PositionValuer.ZeroAddress.selector);
        new PositionValuer(address(posReg), address(tokReg), address(0));
    }

    // ═══════════════════════ topic parity ═══════════════════════
    // Every hash below was confirmed against live mainnet logs by
    // scripts/protocol-topics.mjs. Pinning them here means a signature edit that
    // silently changes a topic fails the build instead of returning zero logs.

    function test_TopicParity_AaveV3() public pure {
        assertEq(MainnetTopics.AAVE_SUPPLY, 0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61);
        assertEq(MainnetTopics.AAVE_WITHDRAW, 0x3115d1449a7b732c986cba18244e897a450f61e1bb8d589cd2e69e6c8924f9f7);
        assertEq(MainnetTopics.AAVE_BORROW, 0xb3d084820fb1a9decffb176436bd02558d15fac9b0ddfed8c465bc7359d7dce0);
        assertEq(MainnetTopics.AAVE_REPAY, 0xa534c8dbe71f871f9f3530e97a74601fea17b426cae02e1c5aee42c96c784051);
    }

    function test_TopicParity_TransferAndChainlink() public pure {
        assertEq(MainnetTopics.ERC20_TRANSFER, 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef);
        assertEq(
            MainnetTopics.CHAINLINK_ANSWER_UPDATED,
            0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f
        );
    }

    function test_TopicParity_CoverageProtocols() public pure {
        assertEq(MainnetTopics.COMET_SUPPLY, 0xd1cf3d156d5f8f0d50f6c122ed609cec09d35c9b9fb3fff6ea0959134dae424e);
        assertEq(MainnetTopics.COMET_WITHDRAW, 0x9b1bfa7fa9ee420a16e124f794c35ac9f90472acc99140eb2f6447c714cad8eb);
        assertEq(
            MainnetTopics.MORPHO_SUPPLY_COLLATERAL,
            0xa3b9472a1399e17e123f3c2e6586c23e504184d504de59cdaa2b375e880c6184
        );
        // Declared from the interface but NOT confirmed on-chain: zero logs in the
        // verification window. The hash is correct by derivation; do not read this as
        // evidence the event is wired up.
        assertEq(
            MainnetTopics.MORPHO_WITHDRAW_COLLATERAL,
            0x4399bc0ae3be973108148592005d45363dc56a16b0f4a208aecc66c79b0660af
        );
    }

    /// @dev The negative controls in the parity script only mean something if the wrong
    ///      signature really hashes differently. This asserts the discriminations hold.
    function test_TopicParity_WrongSignaturesDiffer() public pure {
        // Aave's 5-arg Supply vs a 4-arg Supply used as a negative control.
        assertTrue(
            MainnetTopics.AAVE_SUPPLY != keccak256("Supply(address,address,address,uint256)")
        );
        // Aave's Supply vs Comet's Supply: different events, must not collide.
        assertTrue(MainnetTopics.AAVE_SUPPLY != MainnetTopics.COMET_SUPPLY);
    }
}
