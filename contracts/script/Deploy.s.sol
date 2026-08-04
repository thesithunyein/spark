// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SepoliaPayment} from "../src/SepoliaPayment.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {MockPaymentVerifier} from "../src/MockPaymentVerifier.sol";
import {AttestcoinPaymentVerifier} from "../src/AttestcoinPaymentVerifier.sol";

contract DeploySpark is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envOr("TREASURY", address(this));
        bool useMock = vm.envOr("USE_MOCK_VERIFIER", true);
        address paymentOnSepolia = vm.envOr("PAYMENT_ADDRESS", address(0));

        vm.startBroadcast(pk);

        address verifier;
        if (useMock) {
            MockPaymentVerifier mock = new MockPaymentVerifier(msg.sender, false);
            verifier = address(mock);
            console2.log("MockPaymentVerifier", verifier);
        } else {
            address blockProver = vm.envAddress("BLOCK_PROVER");
            uint64 chainKey = uint64(vm.envUint("CHAIN_KEY"));
            AttestcoinPaymentVerifier v =
                new AttestcoinPaymentVerifier(blockProver, paymentOnSepolia, chainKey);
            verifier = address(v);
            console2.log("AttestcoinPaymentVerifier", verifier);
        }

        // Deploy payment on Sepolia in a separate broadcast with SEPOLIA_RPC
        // Here we deploy CreditLine for Creditcoin.
        CreditLine line = new CreditLine(verifier, 8000);
        console2.log("CreditLine", address(line));

        vm.stopBroadcast();
    }

    function deployPayment() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY");
        vm.startBroadcast(pk);
        SepoliaPayment payment = new SepoliaPayment(treasury);
        console2.log("SepoliaPayment", address(payment));
        vm.stopBroadcast();
    }
}
