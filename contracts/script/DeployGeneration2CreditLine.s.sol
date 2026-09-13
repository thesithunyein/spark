// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CreditLine} from "../src/CreditLine.sol";

/**
 * @dev Deploy generation 2 of CreditLine: the one that can size a line from an attested
 *      balance with no deposit (openCreditFromBalance).
 *
 *      Deliberately deploys ONLY CreditLine and reuses the verifier that is already deployed
 *      and already verified on Blockscout. `DeployCreditcoin` would mint a second
 *      AttestcoinPaymentVerifier with identical code, which would leave two contracts making
 *      the same claim and make the verified one ambiguous.
 *
 *      What is NOT preserved by this script: CreditLine's constructor creates a fresh
 *      SparkCredit token, so generation 2 has its own sCREDIT address and starts with an
 *      empty record. Both consequences are handled in docs/DEPLOY_CC3.md, not here.
 *
 *      Creditcoin testnet:
 *        VERIFIER_ADDRESS=0x... forge script script/DeployGeneration2CreditLine.s.sol:DeployGeneration2CreditLine \
 *          --rpc-url https://rpc.cc3-testnet.creditcoin.network --broadcast
 */
contract DeployGeneration2CreditLine is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        // Same policy as generation 1: 80% base LTV on the deposit path, 10% APR.
        // The balance path's 20% policy LTV lives in CreditLine.BALANCE_LTV_BPS.
        uint256 collateralFactorBps = vm.envOr("COLLATERAL_FACTOR_BPS", uint256(8000));
        uint256 interestPerYearBps = vm.envOr("INTEREST_PER_YEAR_BPS", uint256(1000));

        // Printed before anything is broadcast, so the derived address can be checked against
        // the funded deployer before any gas is spent. This script never prints the key.
        console2.log("deployer", vm.addr(pk));
        console2.log("reusing verifier", verifier);

        require(verifier != address(0), "VERIFIER_ADDRESS not set");
        require(verifier.code.length > 0, "VERIFIER_ADDRESS has no code on this chain");

        vm.startBroadcast(pk);
        CreditLine line = new CreditLine(verifier, collateralFactorBps, interestPerYearBps);
        vm.stopBroadcast();

        console2.log("CreditLine (generation 2)", address(line));
        console2.log("SparkCredit (new token)", address(line.creditToken()));
        console2.log("BALANCE_LTV_BPS", line.BALANCE_LTV_BPS());
        console2.log("MIN_BALANCE_LINE_WEI", line.MIN_BALANCE_LINE_WEI());
        console2.log("");
        console2.log("Next: set NEXT_PUBLIC_CREDITLINE_ADDRESS and NEXT_PUBLIC_CREDIT_TOKEN_ADDRESS");
        console2.log("to the two addresses above, keep generation 1 as the legacy line, and");
        console2.log("follow the generation-2 checklist in docs/DEPLOY_CC3.md.");
    }
}
