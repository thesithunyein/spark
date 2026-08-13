// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SepoliaPayment} from "../src/SepoliaPayment.sol";
import {AttestcoinPaymentVerifier} from "../src/AttestcoinPaymentVerifier.sol";
import {CreditLine} from "../src/CreditLine.sol";

/**
 * @dev Deploy Spark stack for BUIDL CTC Fall 2026.
 *      Sepolia: forge script script/Deploy.s.sol:DeploySepolia --rpc-url $SEPOLIA_RPC --broadcast
 *      Creditcoin: forge script script/Deploy.s.sol:DeployCreditcoin --rpc-url $CC_RPC --broadcast
 *      Set PAYMENT_ADDRESS when deploying Creditcoin contracts.
 */
contract DeploySepolia is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address treasury = vm.addr(pk);
        vm.startBroadcast(pk);
        SepoliaPayment payment = new SepoliaPayment(treasury);
        console2.log("SepoliaPayment", address(payment));
        vm.stopBroadcast();
    }
}

contract DeployCreditcoin is Script {
    address constant BLOCK_PROVER = 0x0000000000000000000000000000000000000FD2;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address payment = vm.envAddress("PAYMENT_ADDRESS");
        uint64 chainKey = uint64(vm.envOr("CHAIN_KEY", uint256(1)));
        vm.startBroadcast(pk);
        AttestcoinPaymentVerifier verifier =
            new AttestcoinPaymentVerifier(BLOCK_PROVER, payment, chainKey);
        // 80% base LTV, 10% APR
        CreditLine line = new CreditLine(address(verifier), 8000, 1000);
        console2.log("AttestcoinPaymentVerifier", address(verifier));
        console2.log("CreditLine", address(line));
        console2.log("SparkCredit", address(line.creditToken()));
        vm.stopBroadcast();
    }
}
