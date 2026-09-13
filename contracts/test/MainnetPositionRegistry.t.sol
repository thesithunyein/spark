// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MainnetPositionRegistry} from "../src/MainnetPositionRegistry.sol";

/**
 * @notice Tests for the ledger-based position engine.
 *
 * These encode the two measured findings from Day 2
 * (docs/evidence/position-reconstruction.md) as executable regressions:
 *   - a peer-to-peer aToken transfer moves a position with no protocol event
 *   - the real borrower whose naive event sum was 66% wrong reconciles exactly
 *     once the transfer is included, with zero unexplained residual
 */
contract MainnetPositionRegistryTest is Test {
    MainnetPositionRegistry internal reg;

    uint64 internal constant MAINNET = 3; // chainKey 3 = Ethereum mainnet, attested on CC3
    uint64 internal constant ANCHOR = 25_592_380; // a provably-zero block from the Day 2 run

    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant A_WETH = 0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant BORROWER = 0xb05C9Ca8123B6bA84C767c4ee8f9Ae66b0733180;

    address internal other = address(0xAA11);

    // 10% cap on the unexplained interest term
    uint256 internal constant MAX_RESIDUAL_BPS = 1_000;

    function setUp() public {
        reg = new MainnetPositionRegistry(address(this), MAINNET, MAX_RESIDUAL_BPS);
    }

    // ─────────────────────────── helpers ───────────────────────────

    function _anchor(address account, address token) internal {
        reg.setZeroAnchor(account, token, ANCHOR, MAINNET, keccak256("anchor"));
    }

    function _row(address account, address token, int256 delta, uint64 blockNum, bytes32 txHash)
        internal
        pure
        returns (MainnetPositionRegistry.LedgerEntry memory)
    {
        return MainnetPositionRegistry.LedgerEntry({
            account: account,
            token: token,
            delta: delta,
            sourceBlock: blockNum,
            kind: delta > 0
                ? MainnetPositionRegistry.LedgerKind.Mint
                : MainnetPositionRegistry.LedgerKind.Burn,
            txHash: txHash
        });
    }

    function _one(MainnetPositionRegistry.LedgerEntry memory e)
        internal
        pure
        returns (MainnetPositionRegistry.LedgerEntry[] memory arr)
    {
        arr = new MainnetPositionRegistry.LedgerEntry[](1);
        arr[0] = e;
    }

    // ─────────────────────────── anchor ───────────────────────────

    function test_AnchorRequiredBeforeIngest() public {
        vm.expectRevert(MainnetPositionRegistry.AnchorMissing.selector);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 1 ether, ANCHOR + 1, keccak256("t1"))));
    }

    function test_AnchorRequiredBeforeReconcile() public {
        vm.expectRevert(MainnetPositionRegistry.AnchorMissing.selector);
        reg.reconcile(BORROWER, A_WETH, 1 ether, ANCHOR + 10, MAINNET, keccak256("ref"));
    }

    function test_SetZeroAnchor_RecordsAnchorAndZero() public {
        _anchor(BORROWER, A_WETH);
        assertTrue(reg.isAnchored(BORROWER, A_WETH));
        assertEq(reg.ledgerNet(BORROWER, A_WETH), 0);
        assertEq(reg.netPosition(BORROWER, A_WETH), 0);
    }

    function test_SetZeroAnchor_RejectsReanchor() public {
        _anchor(BORROWER, A_WETH);
        vm.expectRevert(MainnetPositionRegistry.AlreadyAnchored.selector);
        reg.setZeroAnchor(BORROWER, A_WETH, ANCHOR + 1, MAINNET, keccak256("again"));
    }

    function test_SetZeroAnchor_RejectsWrongChain() public {
        vm.expectRevert(
            abi.encodeWithSelector(MainnetPositionRegistry.BadChain.selector, uint64(1), MAINNET)
        );
        reg.setZeroAnchor(BORROWER, A_WETH, ANCHOR, 1, keccak256("anchor"));
    }

    function test_SetZeroAnchor_RejectsZeroAddress() public {
        vm.expectRevert(MainnetPositionRegistry.ZeroAddress.selector);
        reg.setZeroAnchor(address(0), A_WETH, ANCHOR, MAINNET, keccak256("anchor"));
    }

    // ─────────────────────────── ledger ───────────────────────────

    function test_IngestAccumulates() public {
        _anchor(BORROWER, A_WETH);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 5 ether, ANCHOR + 1, keccak256("a"))));
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, -2 ether, ANCHOR + 2, keccak256("b"))));
        assertEq(reg.ledgerNet(BORROWER, A_WETH), 3 ether);

        MainnetPositionRegistry.Position memory p = reg.positionOf(BORROWER, A_WETH);
        assertEq(p.entries, 2);
        assertEq(p.lastBlock, ANCHOR + 2);
    }

    /// @dev The anchor rule: a row at or below a proven-zero block must be rejected,
    ///      not ignored, or a gap in the feed would silently produce a wrong position.
    function test_IngestRejectsRowAtOrBeforeAnchor() public {
        _anchor(BORROWER, A_WETH);

        vm.expectRevert(
            abi.encodeWithSelector(
                MainnetPositionRegistry.BlockNotAfterAnchor.selector, ANCHOR, ANCHOR
            )
        );
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 1 ether, ANCHOR, keccak256("eq"))));

        vm.expectRevert(
            abi.encodeWithSelector(
                MainnetPositionRegistry.BlockNotAfterAnchor.selector, ANCHOR - 1, ANCHOR
            )
        );
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 1 ether, ANCHOR - 1, keccak256("lt"))));
    }

    function test_IngestRejectsStaleBlock() public {
        _anchor(BORROWER, A_WETH);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 1 ether, ANCHOR + 10, keccak256("a"))));

        vm.expectRevert(
            abi.encodeWithSelector(
                MainnetPositionRegistry.StaleBlock.selector, uint64(ANCHOR + 5), uint64(ANCHOR + 10)
            )
        );
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 1 ether, ANCHOR + 5, keccak256("b"))));
    }

    function test_IngestAllowsSameBlockMultipleRows() public {
        _anchor(BORROWER, A_WETH);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 1 ether, ANCHOR + 5, keccak256("a"))));
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 2 ether, ANCHOR + 5, keccak256("b"))));
        assertEq(reg.ledgerNet(BORROWER, A_WETH), 3 ether);
    }

    function test_IngestRejectsReplayedTx() public {
        _anchor(BORROWER, A_WETH);
        bytes32 h = keccak256("same-tx");
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 1 ether, ANCHOR + 1, h)));

        vm.expectRevert(abi.encodeWithSelector(MainnetPositionRegistry.ReplayTx.selector, h));
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 1 ether, ANCHOR + 2, h)));
    }

    function test_IngestRejectsZeroDeltaAndEmptyBatch() public {
        _anchor(BORROWER, A_WETH);

        vm.expectRevert(MainnetPositionRegistry.ZeroDelta.selector);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 0, ANCHOR + 1, keccak256("z"))));

        vm.expectRevert(MainnetPositionRegistry.EmptyBatch.selector);
        reg.ingestLedger(MAINNET, new MainnetPositionRegistry.LedgerEntry[](0));
    }

    function test_IngestRejectsWrongChain() public {
        _anchor(BORROWER, A_WETH);
        vm.expectRevert(
            abi.encodeWithSelector(MainnetPositionRegistry.BadChain.selector, uint64(1), MAINNET)
        );
        reg.ingestLedger(1, _one(_row(BORROWER, A_WETH, 1 ether, ANCHOR + 1, keccak256("t"))));
    }

    function test_IngestBatchAppliesAllRows() public {
        _anchor(BORROWER, A_WETH);
        MainnetPositionRegistry.LedgerEntry[] memory rows =
            new MainnetPositionRegistry.LedgerEntry[](3);
        rows[0] = _row(BORROWER, A_WETH, 4 ether, ANCHOR + 1, keccak256("r1"));
        rows[1] = _row(BORROWER, A_WETH, 3 ether, ANCHOR + 2, keccak256("r2"));
        rows[2] = _row(BORROWER, A_WETH, -1 ether, ANCHOR + 3, keccak256("r3"));
        reg.ingestLedger(MAINNET, rows);
        assertEq(reg.ledgerNet(BORROWER, A_WETH), 6 ether);
    }

    function test_TokensAndAccountsAreIndependent() public {
        _anchor(BORROWER, A_WETH);
        _anchor(BORROWER, USDC);
        _anchor(other, A_WETH);

        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 5 ether, ANCHOR + 1, keccak256("x1"))));
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, USDC, 40e6, ANCHOR + 1, keccak256("x2"))));
        reg.ingestLedger(MAINNET, _one(_row(other, A_WETH, 9 ether, ANCHOR + 1, keccak256("x3"))));

        assertEq(reg.ledgerNet(BORROWER, A_WETH), 5 ether);
        assertEq(reg.ledgerNet(BORROWER, USDC), 40e6);
        assertEq(reg.ledgerNet(other, A_WETH), 9 ether);
    }

    function test_netPositionZeroWhenUnanchored() public view {
        assertEq(reg.netPosition(BORROWER, A_WETH), 0);
        assertFalse(reg.isAnchored(BORROWER, A_WETH));
    }

    // ─────────────────────────── reconcile ───────────────────────────

    function test_ReconcileRecordsInterestResidual() public {
        _anchor(BORROWER, A_WETH);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 100 ether, ANCHOR + 1, keccak256("m"))));

        // 2 ether of accrued interest, inside the 10% cap
        vm.recordLogs();
        int256 residual =
            reg.reconcile(BORROWER, A_WETH, 102 ether, ANCHOR + 500, MAINNET, keccak256("st"));

        assertEq(residual, 2 ether);
        assertEq(reg.ledgerNet(BORROWER, A_WETH), 100 ether);
        assertEq(reg.netPosition(BORROWER, A_WETH), 102 ether);
    }

    function test_ReconcileRejectsNegativeResidual() public {
        _anchor(BORROWER, A_WETH);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 100 ether, ANCHOR + 1, keccak256("m"))));

        vm.expectRevert(
            abi.encodeWithSelector(
                MainnetPositionRegistry.NegativeResidual.selector, int256(90 ether), int256(100 ether)
            )
        );
        reg.reconcile(BORROWER, A_WETH, 90 ether, ANCHOR + 500, MAINNET, keccak256("st"));
    }

    /// @dev An over-large residual means the ledger is missing history. It must revert
    ///      rather than be reported, or a feed gap becomes a fake position.
    function test_ReconcileRejectsExcessResidual() public {
        _anchor(BORROWER, A_WETH);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 100 ether, ANCHOR + 1, keccak256("m"))));

        // 11 ether on a 100 ether ledger is 11%, over the 10% cap
        vm.expectRevert(
            abi.encodeWithSelector(
                MainnetPositionRegistry.ExcessResidual.selector, int256(11 ether), int256(100 ether)
            )
        );
        reg.reconcile(BORROWER, A_WETH, 111 ether, ANCHOR + 500, MAINNET, keccak256("st"));
    }

    function test_ReconcileAllowsExactlyAtCap() public {
        _anchor(BORROWER, A_WETH);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 100 ether, ANCHOR + 1, keccak256("m"))));
        int256 residual =
            reg.reconcile(BORROWER, A_WETH, 110 ether, ANCHOR + 500, MAINNET, keccak256("st"));
        assertEq(residual, 10 ether);
    }

    function test_ReconcileRejectsBeforeLedgerFrontier() public {
        _anchor(BORROWER, A_WETH);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 1 ether, ANCHOR + 100, keccak256("m"))));

        vm.expectRevert(
            abi.encodeWithSelector(
                MainnetPositionRegistry.AttestedBeforeLedger.selector,
                uint64(ANCHOR + 50),
                uint64(ANCHOR + 100)
            )
        );
        reg.reconcile(BORROWER, A_WETH, 1 ether, ANCHOR + 50, MAINNET, keccak256("st"));
    }

    function test_ReconcileRejectsWrongChain() public {
        _anchor(BORROWER, A_WETH);
        vm.expectRevert(
            abi.encodeWithSelector(MainnetPositionRegistry.BadChain.selector, uint64(2), MAINNET)
        );
        reg.reconcile(BORROWER, A_WETH, 0, ANCHOR + 1, 2, keccak256("st"));
    }

    // ─────────────────────────── access control ───────────────────────────

    function test_OnlyAttestorCanAct() public {
        vm.startPrank(other);

        vm.expectRevert(MainnetPositionRegistry.NotAttestor.selector);
        reg.setZeroAnchor(BORROWER, A_WETH, ANCHOR, MAINNET, keccak256("a"));

        vm.expectRevert(MainnetPositionRegistry.NotAttestor.selector);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 1 ether, ANCHOR + 1, keccak256("t"))));

        vm.expectRevert(MainnetPositionRegistry.NotAttestor.selector);
        reg.reconcile(BORROWER, A_WETH, 0, ANCHOR + 1, MAINNET, keccak256("r"));

        vm.expectRevert(MainnetPositionRegistry.NotAttestor.selector);
        reg.transferAttestor(other);

        vm.stopPrank();
    }

    function test_TransferAttestor() public {
        reg.transferAttestor(other);
        assertEq(reg.attestor(), other);

        vm.prank(other);
        reg.setZeroAnchor(BORROWER, A_WETH, ANCHOR, MAINNET, keccak256("a"));
        assertTrue(reg.isAnchored(BORROWER, A_WETH));
    }

    function test_TransferAttestorRejectsZero() public {
        vm.expectRevert(MainnetPositionRegistry.ZeroAddress.selector);
        reg.transferAttestor(address(0));
    }

    function test_ConstructorValidation() public {
        vm.expectRevert(MainnetPositionRegistry.ZeroAddress.selector);
        new MainnetPositionRegistry(address(0), MAINNET, MAX_RESIDUAL_BPS);

        vm.expectRevert(bytes("residual bps"));
        new MainnetPositionRegistry(address(this), MAINNET, 0);

        vm.expectRevert(bytes("residual bps"));
        new MainnetPositionRegistry(address(this), MAINNET, 10_001);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  REGRESSION: the Day 2 findings, as executable tests
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Finding 1: a peer-to-peer aToken transfer moves a position and emits no
    ///      Aave event. An engine that only counts protocol events cannot see it, so
    ///      the ledger must ingest TransferOut/TransferIn as first-class rows.
    function test_Regression_PeerToPeerTransferMovesPositionWithNoProtocolEvent() public {
        _anchor(BORROWER, A_WETH);

        // Only protocol events a naive indexer would see: a Supply (mint) ...
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, 10 ether, ANCHOR + 1, keccak256("supply"))));
        // ... and then a bare transfer out. No Withdraw ever happens.
        MainnetPositionRegistry.LedgerEntry memory outRow = MainnetPositionRegistry.LedgerEntry({
            account: BORROWER,
            token: A_WETH,
            delta: -6 ether,
            sourceBlock: ANCHOR + 2,
            kind: MainnetPositionRegistry.LedgerKind.TransferOut,
            txHash: keccak256("p2p-out")
        });
        reg.ingestLedger(MAINNET, _one(outRow));

        // The ledger sees 4 ether. A protocol-event-only view would still say 10 ether.
        assertEq(reg.ledgerNet(BORROWER, A_WETH), 4 ether);

        // And the attested balance confirms the ledger, not the event view.
        int256 residual = reg.reconcile(BORROWER, A_WETH, 4 ether, ANCHOR + 900, MAINNET, keccak256("st"));
        assertEq(residual, 0);
    }

    /// @dev Finding 2, using the REAL measured numbers from the Day 2 run on
    ///      0xb05c9ca8…: naive Supply - Withdraw said 97.389029 WETH, the true
    ///      aWETH balance was 32.324944, and a single 65.064085 peer-to-peer
    ///      transfer out explains the entire 66% gap with ZERO remaining residual.
    function test_Regression_RealMainnetNumbersReconcileExactly() public {
        _anchor(BORROWER, A_WETH);

        int256 supplyEvents = 97_389_029_000_000_000_000; // 97.389029 aWETH
        int256 p2pOut = 65_064_085_000_000_000_000; // 65.064085 aWETH
        int256 realBalance = 32_324_944_000_000_000_000; // 32.324944 aWETH

        // What a naive indexer reports: mint only (this wallet had zero Withdraws).
        int256 naive = supplyEvents;

        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, supplyEvents, ANCHOR + 1, keccak256("s"))));
        MainnetPositionRegistry.LedgerEntry memory outRow = MainnetPositionRegistry.LedgerEntry({
            account: BORROWER,
            token: A_WETH,
            delta: -p2pOut,
            sourceBlock: ANCHOR + 2,
            kind: MainnetPositionRegistry.LedgerKind.TransferOut,
            txHash: keccak256("p2p")
        });
        reg.ingestLedger(MAINNET, _one(outRow));

        // The naive figure is 66% too high.
        assertGt(naive - realBalance, 65 ether);

        // The ledger figure is exact, and reconciling leaves nothing unexplained.
        assertEq(reg.ledgerNet(BORROWER, A_WETH), realBalance);
        int256 residual = reg.reconcile(BORROWER, A_WETH, realBalance, ANCHOR + 900, MAINNET, keccak256("st"));
        assertEq(residual, 0);
        assertEq(reg.netPosition(BORROWER, A_WETH), realBalance);
    }

    // ─────────────────────────── fuzz ───────────────────────────

    function testFuzz_LedgerNetAccumulates(int96 a, int96 b) public {
        vm.assume(a != 0 && b != 0);
        int256 da = int256(a);
        int256 db = int256(b);
        // keep both rows strictly after the anchor and inside int256 by construction
        _anchor(BORROWER, A_WETH);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, da, ANCHOR + 1, keccak256("f1"))));
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, db, ANCHOR + 2, keccak256("f2"))));
        assertEq(reg.ledgerNet(BORROWER, A_WETH), da + db);
    }

    function testFuzz_ReconcileResidualIsExact(int96 minted, uint32 gap) public {
        int256 m = int256(minted);
        vm.assume(m > 1e18);
        uint256 cap = (uint256(m) * MAX_RESIDUAL_BPS) / 10_000;
        vm.assume(cap > 0);
        int256 interest = int256(uint256(cap) / 2); // strictly inside the cap

        _anchor(BORROWER, A_WETH);
        reg.ingestLedger(MAINNET, _one(_row(BORROWER, A_WETH, m, ANCHOR + 1, keccak256("m"))));
        int256 residual =
            reg.reconcile(BORROWER, A_WETH, m + interest, ANCHOR + 2 + uint64(gap), MAINNET, keccak256("st"));
        assertEq(residual, interest);
        assertEq(reg.netPosition(BORROWER, A_WETH), m + interest);
    }
}
