// AUTO-GENERATED. Do not edit by hand.
//
// Regenerate with:  cd app && node scripts/gen-evidence-module.mjs
//
// Every value below is copied verbatim from the artifacts in docs/evidence/, which were
// produced from real Ethereum mainnet reads. Edit the artifact and regenerate; do not
// hand-tune a number here.

export const EVIDENCE = {
  "generatedFrom": {
    "scale": "docs/evidence/position-scale.json",
    "drift": "docs/evidence/position-drift.json",
    "topics": "docs/evidence/protocol-topics.json",
    "e2e": "docs/evidence/position-stack-e2e.txt"
  },
  "capturedAt": "2026-09-13T19:13:26.441Z",
  "scale": {
    "rpc": "https://rpc.mevblocker.io",
    "latestBlock": 25970521,
    "chunk": 10000,
    "rpcCallsUsed": 295,
    "assetSymbol": "aEthWETH",
    "aToken": "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
    "method": {
      "anchor": "most recent block within maxLag where balanceOf(wallet) == 0, via archive eth_call",
      "ledger": "sum(Transfer to wallet) - sum(Transfer from wallet) on the aToken, from anchor to latest",
      "residual": "balanceOf - ledger, i.e. rebasing interest that events cannot supply"
    },
    "skipped": {
      "noZeroAnchor": 23,
      "zeroBalance": 6
    },
    "summary": {
      "tested": 8,
      "ledgerMatchesExactly": 0,
      "ledgerWithin10Bps": 8,
      "largestResidualBps": 0.51,
      "withPeerToPeerMovement": 1,
      "finding": "The ledger understates a live position by a small positive residual on every wallet measured, because interest rebases into the aToken between events. Exact equality is therefore not the acceptance criterion; the residual magnitude is, and it is what the on-chain interestResidual bound encodes."
    },
    "wallets": [
      {
        "wallet": "0xc79b6416bd17446f930d32a7b78cf60d35a12be7",
        "short": "0xc79b…2be7",
        "anchorBlock": 25965907,
        "blocksCovered": 4614,
        "balance": "2163071600194188204912",
        "balanceDisplay": "2163.0716",
        "ledgerNet": "2163016571080238220746",
        "ledgerDisplay": "2163.0165",
        "residual": "55029113949984166",
        "residualBps": 0.25,
        "transferCount": 1,
        "p2pMoved": "0",
        "p2pDisplay": "0",
        "hasP2p": false
      },
      {
        "wallet": "0x800f859490d9f0652a83027f832f55a5a13d955f",
        "short": "0x800f…955f",
        "anchorBlock": 25961145,
        "blocksCovered": 9376,
        "balance": "602631072122434123647",
        "balanceDisplay": "602.6310",
        "ledgerNet": "602600157606450062413",
        "ledgerDisplay": "602.6001",
        "residual": "30914515984061234",
        "residualBps": 0.51,
        "transferCount": 2,
        "p2pMoved": "0",
        "p2pDisplay": "0",
        "hasP2p": false
      },
      {
        "wallet": "0x0cc688bf78bdcc3c072903100b2b821cc8d7d666",
        "short": "0x0cc6…d666",
        "anchorBlock": 25962220,
        "blocksCovered": 8301,
        "balance": "433033874843288486772",
        "balanceDisplay": "433.0338",
        "ledgerNet": "433014008378577163575",
        "ledgerDisplay": "433.0140",
        "residual": "19866464711323197",
        "residualBps": 0.45,
        "transferCount": 1,
        "p2pMoved": "0",
        "p2pDisplay": "0",
        "hasP2p": false
      },
      {
        "wallet": "0x921772c54f47c3eda7c6c726b4ab5ef2c94c6867",
        "short": "0x9217…6867",
        "anchorBlock": 25963305,
        "blocksCovered": 7216,
        "balance": "177000949039421616693",
        "balanceDisplay": "177.0009",
        "ledgerNet": "176994696463913821604",
        "ledgerDisplay": "176.9946",
        "residual": "6252575507795089",
        "residualBps": 0.35,
        "transferCount": 4,
        "p2pMoved": "0",
        "p2pDisplay": "0",
        "hasP2p": false
      },
      {
        "wallet": "0x903fd6b5142ee05b0db58f0f998502f69804caae",
        "short": "0x903f…caae",
        "anchorBlock": 25852998,
        "blocksCovered": 117523,
        "balance": "122002003860369164385",
        "balanceDisplay": "122.0020",
        "ledgerNet": "122000066902165719990",
        "ledgerDisplay": "122.0000",
        "residual": "1936958203444395",
        "residualBps": 0.15,
        "transferCount": 20,
        "p2pMoved": "-288490053027774722816",
        "p2pDisplay": "-288.4900",
        "hasP2p": true
      },
      {
        "wallet": "0x47200b9bf1cd27163d9eea0ab76337c6781731f3",
        "short": "0x4720…31f3",
        "anchorBlock": 25963262,
        "blocksCovered": 7259,
        "balance": "45001804319487647760",
        "balanceDisplay": "45.0018",
        "ledgerNet": "44999999999999999998",
        "ledgerDisplay": "44.9999",
        "residual": "1804319487647762",
        "residualBps": 0.4,
        "transferCount": 1,
        "p2pMoved": "0",
        "p2pDisplay": "0",
        "hasP2p": false
      },
      {
        "wallet": "0x1170b8ce6e19c23c716385521a88e30d5baea37c",
        "short": "0x1170…a37c",
        "anchorBlock": 25962338,
        "blocksCovered": 8183,
        "balance": "35001582777551762353",
        "balanceDisplay": "35.0015",
        "ledgerNet": "34999999999999999999",
        "ledgerDisplay": "34.9999",
        "residual": "1582777551762354",
        "residualBps": 0.45,
        "transferCount": 1,
        "p2pMoved": "0",
        "p2pDisplay": "0",
        "hasP2p": false
      },
      {
        "wallet": "0x25f46456383a5038e93aae660647e7f2afe6ee51",
        "short": "0x25f4…ee51",
        "anchorBlock": 25795097,
        "blocksCovered": 175424,
        "balance": "274777435297244704833",
        "balanceDisplay": "274.7774",
        "ledgerNet": "274774871592611734757",
        "ledgerDisplay": "274.7748",
        "residual": "2563704632970076",
        "residualBps": 0.09,
        "transferCount": 10,
        "p2pMoved": "0",
        "p2pDisplay": "0",
        "hasP2p": false
      }
    ]
  },
  "drift": {
    "wallet": "0xb05c9ca8123b6ba84c767c4ee8f9ae66b0733180",
    "short": "0xb05c…3180",
    "pool": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    "totalEvents": 311,
    "poolTotals": {
      "collateralBase8": "11638413560066",
      "debtBase8": "5422810630263",
      "ltvBps": "7882",
      "healthFactor": "1748710769793674146"
    },
    "reserves": [
      {
        "symbol": "WETH",
        "decimals": 18,
        "events": {
          "Supply": 84
        },
        "eventCount": 84,
        "naiveSupplyDisplay": "97.3890",
        "realSupplyDisplay": "32.3249",
        "supplyDriftPct": "-66.8084%",
        "naiveDebtDisplay": "0",
        "realDebtDisplay": "0",
        "debtDriftPct": "0%"
      },
      {
        "symbol": "USDC",
        "decimals": 6,
        "events": {
          "Supply": 39,
          "Withdraw": 23,
          "Borrow": 70
        },
        "eventCount": 132,
        "naiveSupplyDisplay": "49617.4284",
        "realSupplyDisplay": "35001.5261",
        "supplyDriftPct": "-29.4572%",
        "naiveDebtDisplay": "191450",
        "realDebtDisplay": "20015.6266",
        "debtDriftPct": "-89.5452%"
      },
      {
        "symbol": "WBTC",
        "decimals": 8,
        "events": {
          "Supply": 4,
          "Withdraw": 2,
          "Borrow": 11
        },
        "eventCount": 17,
        "naiveSupplyDisplay": "0.1916",
        "realSupplyDisplay": "0.0051",
        "supplyDriftPct": "-97.3342%",
        "naiveDebtDisplay": "0.984",
        "realDebtDisplay": "0.4423",
        "debtDriftPct": "-55.0435%"
      },
      {
        "symbol": "LINK",
        "decimals": 18,
        "events": {
          "Supply": 46,
          "Withdraw": 16
        },
        "eventCount": 62,
        "naiveSupplyDisplay": "-0.0664",
        "realSupplyDisplay": "0",
        "supplyDriftPct": "-100.0000%",
        "naiveDebtDisplay": "0",
        "realDebtDisplay": "0",
        "debtDriftPct": "0%"
      },
      {
        "symbol": "USDT",
        "decimals": 6,
        "events": {
          "Borrow": 16
        },
        "eventCount": 16,
        "naiveSupplyDisplay": "0",
        "realSupplyDisplay": "0",
        "supplyDriftPct": "0%",
        "naiveDebtDisplay": "33300",
        "realDebtDisplay": "0",
        "debtDriftPct": "-100.0000%"
      }
    ],
    "weth": {
      "symbol": "WETH",
      "decimals": 18,
      "events": {
        "Supply": 84
      },
      "eventCount": 84,
      "naiveSupplyDisplay": "97.3890",
      "realSupplyDisplay": "32.3249",
      "supplyDriftPct": "-66.8084%",
      "naiveDebtDisplay": "0",
      "realDebtDisplay": "0",
      "debtDriftPct": "0%"
    }
  },
  "topics": {
    "window": {
      "fromBlock": 25960492,
      "toBlock": 25970491,
      "blocks": 10000
    },
    "rpc": "https://rpc.mevblocker.io",
    "chainlink": {
      "proxy": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      "aggregator": "0x7d4E742018fb52E48b08BE73d041C18B21de6Fb5",
      "finding": "AnswerUpdated is emitted by the aggregator, not the proxy. The proxy returned 0 logs and the aggregator returned 36 in the same window, so an implementation that attests the proxy proves no price while appearing to succeed."
    },
    "note": "A zero count means the topic did not match in this window; it does not by itself prove the signature is wrong. The negative controls exist to show that a genuine mismatch returns a clean zero.",
    "confirmedCount": 9,
    "totalCount": 10,
    "rows": [
      {
        "name": "Aave v3 Supply",
        "contract": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
        "signature": "Supply(address,address,address,uint256,uint16)",
        "topic0": "0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61",
        "logsInWindow": 1845,
        "confirmed": true
      },
      {
        "name": "Aave v3 Withdraw",
        "contract": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
        "signature": "Withdraw(address,address,address,uint256)",
        "topic0": "0x3115d1449a7b732c986cba18244e897a450f61e1bb8d589cd2e69e6c8924f9f7",
        "logsInWindow": 1927,
        "confirmed": true
      },
      {
        "name": "Aave v3 Borrow",
        "contract": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
        "signature": "Borrow(address,address,address,uint256,uint8,uint256,uint16)",
        "topic0": "0xb3d084820fb1a9decffb176436bd02558d15fac9b0ddfed8c465bc7359d7dce0",
        "logsInWindow": 1197,
        "confirmed": true
      },
      {
        "name": "Aave v3 Repay",
        "contract": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
        "signature": "Repay(address,address,address,uint256,bool)",
        "topic0": "0xa534c8dbe71f871f9f3530e97a74601fea17b426cae02e1c5aee42c96c784051",
        "logsInWindow": 953,
        "confirmed": true
      },
      {
        "name": "ERC20 Transfer (aWETH)",
        "contract": "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
        "signature": "Transfer(address,address,uint256)",
        "topic0": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "logsInWindow": 2486,
        "confirmed": true
      },
      {
        "name": "Chainlink AnswerUpdated (aggregator)",
        "contract": "0x7d4E742018fb52E48b08BE73d041C18B21de6Fb5",
        "signature": "AnswerUpdated(int256,uint256,uint256)",
        "topic0": "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f",
        "logsInWindow": 36,
        "confirmed": true
      },
      {
        "name": "Comet Supply",
        "contract": "0xA17581A9E3356d9A858b789D68B4d866e593aE94",
        "signature": "Supply(address,address,uint256)",
        "topic0": "0xd1cf3d156d5f8f0d50f6c122ed609cec09d35c9b9fb3fff6ea0959134dae424e",
        "logsInWindow": 9,
        "confirmed": true
      },
      {
        "name": "Comet Withdraw",
        "contract": "0xA17581A9E3356d9A858b789D68B4d866e593aE94",
        "signature": "Withdraw(address,address,uint256)",
        "topic0": "0x9b1bfa7fa9ee420a16e124f794c35ac9f90472acc99140eb2f6447c714cad8eb",
        "logsInWindow": 1,
        "confirmed": true
      },
      {
        "name": "Morpho SupplyCollateral",
        "contract": "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
        "signature": "SupplyCollateral(bytes32,address,address,uint256)",
        "topic0": "0xa3b9472a1399e17e123f3c2e6586c23e504184d504de59cdaa2b375e880c6184",
        "logsInWindow": 320,
        "confirmed": true
      },
      {
        "name": "Morpho WithdrawCollateral",
        "contract": "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
        "signature": "WithdrawCollateral(bytes32,address,address,uint256)",
        "topic0": "0x4399bc0ae3be973108148592005d45363dc56a16b0f4a208aecc66c79b0660af",
        "logsInWindow": 0,
        "confirmed": false
      }
    ],
    "negativeControls": [
      {
        "name": "wrong Supply shape vs Aave Pool",
        "signature": "Supply(address,address,address,uint256)",
        "logsInWindow": 0,
        "correct": true
      },
      {
        "name": "wrong AnswerUpdated arity vs aggregator",
        "signature": "AnswerUpdated(int256,uint256)",
        "logsInWindow": 0,
        "correct": true
      },
      {
        "name": "AnswerUpdated vs the PROXY (emits nothing)",
        "signature": "AnswerUpdated(int256,uint256,uint256)",
        "logsInWindow": 0,
        "correct": true
      }
    ]
  },
  "e2e": {
    "chain": "local anvil 31337",
    "ledgerNet": "433014008378577163575",
    "netPosition": "433033874843288486772",
    "tokenDecimals": "18",
    "priceDecimals": "8",
    "price": "250877010000",
    "valueUsd8": "108638243749398",
    "positionBlock": "25970521",
    "interestResidual": "19866464711323197",
    "anchorBlock": "25962220",
    "lastLedgerBlock": "25970521",
    "transactions": "10",
    "gasTotal": "3572773",
    "measureBlock": "25,970,521",
    "attestedAtMeasureBlock": "433033874843288486772",
    "zeroAnchorAtAnchorBlock": "0",
    "creditNetWorthUsd8": "108638243749398",
    "creditLimitUsd8": "21727648749879",
    "creditStatus": "0",
    "ltvBps": "2000",
    "ledgerDisplay": "433.0140",
    "netPositionDisplay": "433.0338",
    "priceDisplay": "$2,508.77",
    "valueUsdDisplay": "$1,086,382",
    "gasDisplay": "3,572,773",
    "measuredBalanceDisplay": "433.0338",
    "creditLimitDisplay": "$217,276",
    "ltvDisplay": "20.00%"
  }
} as const;
