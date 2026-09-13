// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MainnetPositionRegistry} from "../src/MainnetPositionRegistry.sol";
import {MainnetTokenRegistry} from "../src/MainnetTokenRegistry.sol";
import {AttestedPriceFeed} from "../src/AttestedPriceFeed.sol";
import {PositionValuer} from "../src/PositionValuer.sol";
import {MainnetTopics} from "../src/MainnetTopics.sol";

/**
 * @title ProveMainnetPosition
 * @notice Deploys the position stack and proves ONE real Ethereum mainnet position
 *         on-chain, end to end, in a single broadcast.
 *
 * ── Run against CC3 testnet (needs a funded key; ~6 transactions of gas) ──────
 *   export PRIVATE_KEY=0x...
 *   forge script script/ProveMainnetPosition.s.sol:ProveMainnetPosition \
 *     --rpc-url $CREDITCOIN_RPC --broadcast
 *
 * The flow, in order, each step a separate transaction:
 *   1. deploy MainnetPositionRegistry, MainnetTokenRegistry, AttestedPriceFeed, PositionValuer
 *   2. register aEthWETH as an asset with 18 decimals (attested, because decimals()
 *      cannot be called on a mainnet token from Creditcoin)
 *   3. setZeroAnchor at a block where balanceOf is PROVABLY zero
 *   4. ingestLedger the real token Transfer ledger
 *   5. reconcile against the real attested balance, recording the interest residual
 *   6. submitAnswer with the real Chainlink ETH/USD answer
 *   7. read back the reconstructed net worth
 *
 * ── Every input is a measured mainnet fact (docs/evidence/*.json) ─────────────
 *   borrower          a real Aave v3 depositor, found by scanning mainnet
 *   anchor block      25,962,220 - `balanceOf` returns 0 there, archive-verified
 *   ledger net        433.014008378577163575 aWETH, summed from 8,508 real Transfer logs
 *   attested balance  433.033874843288486772 aWETH, the real balanceOf at measurement
 *   price             the real Chainlink ETH/USD answer and the block it was emitted in
 *
 * ── Fidelity note, stated rather than glossed ────────────────────────────────
 * The ledger is submitted as ONE aggregated row, because the real position consists of
 * 8,508 transfers and cannot fit in a single transaction. Per-row ingestion with replay
 * protection is what MainnetPositionRegistry supports, and what the off-chain indexer in
 * `app/scripts` produces; the aggregate is used here so the on-chain proof is affordable.
 * Full per-row provenance: docs/evidence/position-scale.json.
 *
 * ── Two honest caveats ──────────────────────────────────────────────────────
 *  a) The zero-balance anchor is submitted as an assertion by the attestor, not as a
 *     BlockProver proof. Spark has no state-proof path yet; that is the next step for
 *     this contract and is not implied to exist. The anchor value itself was verified
 *     out of band by archive `eth_call` and reproduces today.
 *  b) `valuationOf` enforces price freshness against the CURRENT block timestamp, so a run
 *     much later than the answer's updatedAt will revert with StalePrice. For a live run,
 *     refresh PRICE_* from the aggregator first (app/scripts fetches these).
 */
contract ProveMainnetPosition is Script {
    // ── real mainnet facts, all measured ──
    address internal constant BORROWER = 0x0Cc688BF78bDCC3C072903100B2b821cC8d7d666;
    address internal constant A_WETH = 0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    /// @dev AnswerUpdated lives on the aggregator, NOT the ETH/USD proxy, which emits nothing.
    address internal constant ETH_USD_AGGREGATOR = 0x7d4E742018fb52E48b08BE73d041C18B21de6Fb5;

    uint64 internal constant ANCHOR_BLOCK = 25_962_220; // balanceOf == 0 here, archive-verified
    int256 internal constant LEDGER_NET = 433_014_008_378_577_163_575;
    int256 internal constant ATTESTED_BALANCE = 433_033_874_843_288_486_772;
    // Block 25,970,521 is where aWETH.balanceOf(borrower) actually equals ATTESTED_BALANCE:
    // reading that exact block returns 433033874843288486772, and the neighbouring blocks
    // 25,970,520 and 25,970,425 return smaller values as interest accrues. This constant
    // previously read 25,970,424, which is the ledger's last row block, not the block the
    // balance was measured at. The contract trusts the attestor for this pairing, so nothing
    // on chain was wrong, but the provenance claim was. Verified with archive eth_call.
    uint64 internal constant MEASURE_BLOCK = 25_970_521;
    uint64 internal constant PRICE_BLOCK = 25_960_602; // block of the real AnswerUpdated tx
    int256 internal constant ETH_USD_ANSWER = 250_877_010_000; // 8dp => $2,508.7701
    uint8 internal constant ETH_USD_DECIMALS = 8;
    uint256 internal constant PRICE_UPDATED_AT = 1_789_326_827;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        uint64 chainKey = uint64(vm.envOr("CHAIN_KEY", uint256(3))); // 3 = Ethereum mainnet
        uint256 maxResidualBps = vm.envOr("MAX_RESIDUAL_BPS", uint256(1_000));
        uint256 maxStaleness = vm.envOr("MAX_STALENESS", uint256(86_400));

        vm.startBroadcast(pk);

        // 1. deploy the stack
        MainnetPositionRegistry registry =
            new MainnetPositionRegistry(deployer, chainKey, maxResidualBps);
        MainnetTokenRegistry tokens = new MainnetTokenRegistry(deployer, chainKey);
        AttestedPriceFeed feed = new AttestedPriceFeed(deployer, chainKey, maxStaleness);
        PositionValuer valuer =
            new PositionValuer(address(registry), address(tokens), address(feed));

        // 2. attested token metadata
        tokens.registerToken(
            A_WETH,
            18,
            MainnetTopics.PROTOCOL_AAVE_V3,
            MainnetTokenRegistry.TokenKind.Asset,
            WETH,
            MEASURE_BLOCK,
            chainKey
        );

        // 3. anchor at a provably-zero balance
        registry.setZeroAnchor(
            BORROWER, A_WETH, ANCHOR_BLOCK, chainKey, keccak256("anchor:scale:0Cc688BF")
        );

        // 4. ingest the real token ledger
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
        registry.ingestLedger(chainKey, rows);

        // 5. reconcile against attested state, recording interest
        int256 residual = registry.reconcile(
            BORROWER,
            A_WETH,
            ATTESTED_BALANCE,
            MEASURE_BLOCK,
            chainKey,
            keccak256("balance-attestation:scale:0Cc688BF")
        );

        // 6. proved Chainlink price
        feed.submitAnswer(
            ETH_USD_AGGREGATOR,
            ETH_USD_ANSWER,
            ETH_USD_DECIMALS,
            PRICE_BLOCK,
            PRICE_UPDATED_AT,
            chainKey,
            keccak256("chainlink:eth-usd:round-33590")
        );

        // 7. read back the reconstructed net worth
        PositionValuer.Valuation memory v = valuer.valuationOf(BORROWER, A_WETH, ETH_USD_AGGREGATOR);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=========== POSITION STACK ===========");
        console2.log("MainnetPositionRegistry", address(registry));
        console2.log("MainnetTokenRegistry   ", address(tokens));
        console2.log("AttestedPriceFeed      ", address(feed));
        console2.log("PositionValuer         ", address(valuer));
        console2.log("");
        console2.log("=========== PROVED POSITION ==========");
        console2.log("borrower         ", BORROWER);
        console2.log("zero anchor block", uint256(ANCHOR_BLOCK));
        console2.log("ledger net       ", uint256(LEDGER_NET));
        console2.log("interest residual", uint256(residual));
        console2.log("net position     ", uint256(v.position));
        console2.log("price (8dp)      ", uint256(v.price));
        console2.log("NET WORTH USD 8dp", uint256(v.valueUsd8));
        console2.log("  = $", uint256(v.valueUsd8) / 1e8);
        console2.log("=====================================");
    }
}
