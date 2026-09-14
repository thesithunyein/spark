// GENERATED FILE. Do not edit by hand.
//
// Every value below was read off the block explorers by scripts/gen-chain-activity.mjs.
// To refresh: npm run gen:activity
//
// Snapshot taken at Creditcoin testnet block 5486550 and Sepolia
// block 11702704.

export type ChainEvent = {
  chain: "creditcoin" | "sepolia";
  role: "production" | "legacy" | "generation-2";
  contract: string;
  contractAddress: string;
  event: string;
  headline: string;
  fields: [string, string][];
  raw: Record<string, string>;
  actor: string;
  block: number;
  logIndex: number;
  timestamp: string;
  txHash: string;
  explorerUrl: string;
};

export type ChainSource = {
  key: string;
  chain: "creditcoin" | "sepolia";
  contract: string;
  role: "production" | "legacy" | "generation-2";
  address: string;
  explorer: string;
};

export const chainActivity = {
  "generatedAt": "2026-09-14T12:52:35.749Z",
  "asOf": {
    "creditcoinBlock": 5486550,
    "sepoliaBlock": 11702704
  },
  "sources": [
    {
      "key": "cc3-creditline",
      "chain": "creditcoin",
      "contract": "CreditLine",
      "role": "production",
      "address": "0x2C3585019B957b16459C409f34973b583267C742",
      "explorer": "https://creditcoin-testnet.blockscout.com"
    },
    {
      "key": "cc3-creditline-gen2",
      "chain": "creditcoin",
      "contract": "CreditLine",
      "role": "generation-2",
      "address": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "explorer": "https://creditcoin-testnet.blockscout.com"
    },
    {
      "key": "cc3-creditline-legacy",
      "chain": "creditcoin",
      "contract": "CreditLine",
      "role": "legacy",
      "address": "0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319",
      "explorer": "https://creditcoin-testnet.blockscout.com"
    },
    {
      "key": "sepolia-payment",
      "chain": "sepolia",
      "contract": "SepoliaPayment",
      "role": "production",
      "address": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "explorer": "https://eth-sepolia.blockscout.com"
    },
    {
      "key": "sepolia-payment-legacy",
      "chain": "sepolia",
      "contract": "SepoliaPayment",
      "role": "legacy",
      "address": "0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9",
      "explorer": "https://eth-sepolia.blockscout.com"
    }
  ],
  "summary": {
    "totalEvents": 66,
    "linesOpened": 6,
    "linesOpenedFromBalance": 2,
    "linesClosed": 4,
    "linesActive": 2,
    "paymentsLinked": 9,
    "depositsPaid": 6,
    "repaymentsPaid": 8,
    "balancesAttested": 11,
    "distinctActors": 3,
    "depositVolumeEth": "0.06",
    "repayVolumeEth": "0.01278",
    "creditDrawnEth": "0.02528"
  },
  "funnel": {
    "stages": [
      {
        "key": "paid",
        "label": "Paid a deposit on Sepolia",
        "wallets": 1,
        "entered": 1,
        "dropped": 0
      },
      {
        "key": "attested",
        "label": "Had a balance attested",
        "wallets": 3,
        "entered": 2,
        "dropped": 0
      },
      {
        "key": "opened",
        "label": "Opened a credit line on Creditcoin",
        "wallets": 3,
        "entered": 0,
        "dropped": 0
      },
      {
        "key": "drawn",
        "label": "Drew against it",
        "wallets": 3,
        "entered": 0,
        "dropped": 0
      },
      {
        "key": "repaid",
        "label": "Had a repayment proven",
        "wallets": 3,
        "entered": 0,
        "dropped": 0
      },
      {
        "key": "closed",
        "label": "Closed the line",
        "wallets": 3,
        "entered": 0,
        "dropped": 0
      }
    ],
    "distinctWallets": 3,
    "openedWithoutDeposit": 2
  },
  "events": [
    {
      "chain": "creditcoin",
      "role": "legacy",
      "contract": "CreditLine",
      "contractAddress": "0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319",
      "event": "CreditOpened",
      "headline": "Credit opened for 0.01 ETH deposit",
      "fields": [
        [
          "Deposit",
          "0.01 ETH"
        ],
        [
          "Credit unlocked",
          "0.009 ETH"
        ],
        [
          "Attested balance",
          "0.4012 ETH"
        ],
        [
          "LTV factor",
          "90.00%"
        ],
        [
          "Deposit proof tx",
          "0xb471327d…102a32"
        ],
        [
          "Balance proof tx",
          "0x348e01cc…c6ac14"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "deposit": "10000000000000000",
        "attestedBalance": "401296729092390983",
        "credit": "9000000000000000",
        "factorBps": "9000",
        "depositTxHash": "0xb471327dce9635c1f9b0f598e61150d1bece5633b67f095d9d2de74bdf102a32",
        "balanceTxHash": "0x348e01ccc0ea1622594d4143a9ba7a376c7252c16cf963553d6473a476c6ac14"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5301779,
      "logIndex": 2,
      "timestamp": "2026-08-13T09:30:00Z",
      "txHash": "0xce6052d891efa79047a08dbb1b40182901b7f701b9356d919a92d116d31ede4d",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xce6052d891efa79047a08dbb1b40182901b7f701b9356d919a92d116d31ede4d"
    },
    {
      "chain": "creditcoin",
      "role": "legacy",
      "contract": "CreditLine",
      "contractAddress": "0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319",
      "event": "CreditWithdrawn",
      "headline": "Drew 0.004 ETH of credit",
      "fields": [
        [
          "Amount",
          "0.004 ETH"
        ],
        [
          "Debt after",
          "0.004 ETH"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "4000000000000000",
        "debt": "4000000000000000"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5302254,
      "logIndex": 1,
      "timestamp": "2026-08-13T11:28:45Z",
      "txHash": "0x76c3677d5b7fae10360cda92dc384068d8dbc90526a85103238f840e018abb8c",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x76c3677d5b7fae10360cda92dc384068d8dbc90526a85103238f840e018abb8c"
    },
    {
      "chain": "creditcoin",
      "role": "legacy",
      "contract": "CreditLine",
      "contractAddress": "0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319",
      "event": "InterestAccrued",
      "headline": "Interest accrued, debt now 0.004 ETH",
      "fields": [
        [
          "Interest",
          "0.000000003424 ETH"
        ],
        [
          "Debt after",
          "0.004 ETH"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "interest": "3424657534",
        "debt": "4000003424657534"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5302272,
      "logIndex": 0,
      "timestamp": "2026-08-13T11:33:15Z",
      "txHash": "0x403fc8a6076328de97e256defb7316a77dc752bfda4dedb13bd3f740f27b58ca",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x403fc8a6076328de97e256defb7316a77dc752bfda4dedb13bd3f740f27b58ca"
    },
    {
      "chain": "creditcoin",
      "role": "legacy",
      "contract": "CreditLine",
      "contractAddress": "0x1Ba750b08dC4C06B993DfDedE45d22cbD540D319",
      "event": "CreditRedeemed",
      "headline": "Redeemed 0.002 sCREDIT against debt",
      "fields": [
        [
          "Amount",
          "0.002 sCREDIT"
        ],
        [
          "Debt after",
          "0.002 ETH"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "2000000000000000",
        "debt": "2000003424657534"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5302272,
      "logIndex": 2,
      "timestamp": "2026-08-13T11:33:15Z",
      "txHash": "0x403fc8a6076328de97e256defb7316a77dc752bfda4dedb13bd3f740f27b58ca",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x403fc8a6076328de97e256defb7316a77dc752bfda4dedb13bd3f740f27b58ca"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "AttestedPaymentLinked",
      "headline": "deposit linked, payment #1",
      "fields": [
        [
          "Kind",
          "deposit"
        ],
        [
          "Amount",
          "0.01 ETH"
        ],
        [
          "History count",
          "1"
        ],
        [
          "History volume",
          "0.01 ETH"
        ],
        [
          "Source tx",
          "0x98d4ae75…d3123e"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "txHash": "0x98d4ae75eae37ae6741c095d924286c1f7b435e24a8eec50c820f70b7bd3123e",
        "kind": "1",
        "amount": "10000000000000000",
        "count": "1",
        "volume": "10000000000000000"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5302556,
      "logIndex": 2,
      "timestamp": "2026-08-13T12:44:15Z",
      "txHash": "0xe5ec5506ccdc54851e6c08674b2649d7efa1033220ef768dcc0583f1bf1da9c1",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xe5ec5506ccdc54851e6c08674b2649d7efa1033220ef768dcc0583f1bf1da9c1"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditOpened",
      "headline": "Credit opened for 0.01 ETH deposit",
      "fields": [
        [
          "Deposit",
          "0.01 ETH"
        ],
        [
          "Credit unlocked",
          "0.009 ETH"
        ],
        [
          "Attested balance",
          "0.3889 ETH"
        ],
        [
          "LTV factor",
          "90.00%"
        ],
        [
          "Deposit proof tx",
          "0x98d4ae75…d3123e"
        ],
        [
          "Balance proof tx",
          "0xd67960a4…71a6c2"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "deposit": "10000000000000000",
        "attestedBalance": "388999980944433088",
        "credit": "9000000000000000",
        "factorBps": "9000",
        "depositTxHash": "0x98d4ae75eae37ae6741c095d924286c1f7b435e24a8eec50c820f70b7bd3123e",
        "balanceTxHash": "0xd67960a4c1b0d95667f34374294c3c759e514148fd029870e0431e29d871a6c2"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5302556,
      "logIndex": 3,
      "timestamp": "2026-08-13T12:44:15Z",
      "txHash": "0xe5ec5506ccdc54851e6c08674b2649d7efa1033220ef768dcc0583f1bf1da9c1",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xe5ec5506ccdc54851e6c08674b2649d7efa1033220ef768dcc0583f1bf1da9c1"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditWithdrawn",
      "headline": "Drew 0.004 ETH of credit",
      "fields": [
        [
          "Amount",
          "0.004 ETH"
        ],
        [
          "Debt after",
          "0.004 ETH"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "4000000000000000",
        "debt": "4000000000000000"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5302715,
      "logIndex": 1,
      "timestamp": "2026-08-13T13:24:00Z",
      "txHash": "0xbf411c5aeba0dc7b4105b4fdc992ca09b22bb289aa008ee58690d6c575601f3d",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xbf411c5aeba0dc7b4105b4fdc992ca09b22bb289aa008ee58690d6c575601f3d"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "InterestAccrued",
      "headline": "Interest accrued, debt now 0.004 ETH",
      "fields": [
        [
          "Interest",
          "0.000000002283 ETH"
        ],
        [
          "Debt after",
          "0.004 ETH"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "interest": "2283105022",
        "debt": "4000002283105022"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5302727,
      "logIndex": 0,
      "timestamp": "2026-08-13T13:27:00Z",
      "txHash": "0x48980365b9366b32b608f5945f16744c69cb1d31b091c0f0bc94120d8d8cfb01",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x48980365b9366b32b608f5945f16744c69cb1d31b091c0f0bc94120d8d8cfb01"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditRedeemed",
      "headline": "Redeemed 0.004 sCREDIT against debt",
      "fields": [
        [
          "Amount",
          "0.004 sCREDIT"
        ],
        [
          "Debt after",
          "0.000000002283 ETH"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "4000000000000000",
        "debt": "2283105022"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5302727,
      "logIndex": 2,
      "timestamp": "2026-08-13T13:27:00Z",
      "txHash": "0x48980365b9366b32b608f5945f16744c69cb1d31b091c0f0bc94120d8d8cfb01",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x48980365b9366b32b608f5945f16744c69cb1d31b091c0f0bc94120d8d8cfb01"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "InterestAccrued",
      "headline": "Interest accrued, debt now 0.000000002283 ETH",
      "fields": [
        [
          "Interest",
          "0.000000000000113 ETH"
        ],
        [
          "Debt after",
          "0.000000002283 ETH"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "interest": "113047",
        "debt": "2283218069"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5303767,
      "logIndex": 1,
      "timestamp": "2026-08-13T17:47:15Z",
      "txHash": "0xe7313fefc01b8e2c0d86fc789f5479c3c5c94cd29abc8fc5a53bcfc6fd669f15",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xe7313fefc01b8e2c0d86fc789f5479c3c5c94cd29abc8fc5a53bcfc6fd669f15"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "AttestedPaymentLinked",
      "headline": "repayment linked, payment #2",
      "fields": [
        [
          "Kind",
          "repayment"
        ],
        [
          "Amount",
          "0.000000002283 ETH"
        ],
        [
          "History count",
          "2"
        ],
        [
          "History volume",
          "0.01 ETH"
        ],
        [
          "Source tx",
          "0x58617171…84251b"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "txHash": "0x58617171ded6d4ed3810d7851e9f820ec6da25334cc096912b7b9b98bd84251b",
        "kind": "2",
        "amount": "2283212205",
        "count": "2",
        "volume": "10000002283212205"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5303767,
      "logIndex": 3,
      "timestamp": "2026-08-13T17:47:15Z",
      "txHash": "0xe7313fefc01b8e2c0d86fc789f5479c3c5c94cd29abc8fc5a53bcfc6fd669f15",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xe7313fefc01b8e2c0d86fc789f5479c3c5c94cd29abc8fc5a53bcfc6fd669f15"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditRepaid",
      "headline": "Repayment credited 0.000000002283 ETH",
      "fields": [
        [
          "Amount",
          "0.000000002283 ETH"
        ],
        [
          "Source tx",
          "0x58617171…84251b"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "2283212205",
        "txHash": "0x58617171ded6d4ed3810d7851e9f820ec6da25334cc096912b7b9b98bd84251b"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5303767,
      "logIndex": 4,
      "timestamp": "2026-08-13T17:47:15Z",
      "txHash": "0xe7313fefc01b8e2c0d86fc789f5479c3c5c94cd29abc8fc5a53bcfc6fd669f15",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xe7313fefc01b8e2c0d86fc789f5479c3c5c94cd29abc8fc5a53bcfc6fd669f15"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "AttestedPaymentLinked",
      "headline": "repayment linked, payment #3",
      "fields": [
        [
          "Kind",
          "repayment"
        ],
        [
          "Amount",
          "0.001 ETH"
        ],
        [
          "History count",
          "3"
        ],
        [
          "History volume",
          "0.011 ETH"
        ],
        [
          "Source tx",
          "0x5fa5d7a2…229785"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "txHash": "0x5fa5d7a22da9fbefd4cf0a6190f9ee342967637f470c53fd4adf3e2431229785",
        "kind": "2",
        "amount": "1000000000000000",
        "count": "3",
        "volume": "11000002283212205"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5303896,
      "logIndex": 1,
      "timestamp": "2026-08-13T18:19:30Z",
      "txHash": "0x5092e5165c0fedaf85b53a8c20b9710d4b60a97b3ccaa3e815ec5fda42c18eb4",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x5092e5165c0fedaf85b53a8c20b9710d4b60a97b3ccaa3e815ec5fda42c18eb4"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditRepaid",
      "headline": "Repayment credited 0.000000000000005864 ETH",
      "fields": [
        [
          "Amount",
          "0.000000000000005864 ETH"
        ],
        [
          "Source tx",
          "0x5fa5d7a2…229785"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "5864",
        "txHash": "0x5fa5d7a22da9fbefd4cf0a6190f9ee342967637f470c53fd4adf3e2431229785"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5303896,
      "logIndex": 2,
      "timestamp": "2026-08-13T18:19:30Z",
      "txHash": "0x5092e5165c0fedaf85b53a8c20b9710d4b60a97b3ccaa3e815ec5fda42c18eb4",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x5092e5165c0fedaf85b53a8c20b9710d4b60a97b3ccaa3e815ec5fda42c18eb4"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditClosed",
      "headline": "Credit line closed",
      "fields": [
        [
          "Closing proof tx",
          "0x5fa5d7a2…229785"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "txHash": "0x5fa5d7a22da9fbefd4cf0a6190f9ee342967637f470c53fd4adf3e2431229785"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5303896,
      "logIndex": 3,
      "timestamp": "2026-08-13T18:19:30Z",
      "txHash": "0x5092e5165c0fedaf85b53a8c20b9710d4b60a97b3ccaa3e815ec5fda42c18eb4",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x5092e5165c0fedaf85b53a8c20b9710d4b60a97b3ccaa3e815ec5fda42c18eb4"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "AttestedPaymentLinked",
      "headline": "deposit linked, payment #4",
      "fields": [
        [
          "Kind",
          "deposit"
        ],
        [
          "Amount",
          "0.01 ETH"
        ],
        [
          "History count",
          "4"
        ],
        [
          "History volume",
          "0.021 ETH"
        ],
        [
          "Source tx",
          "0x290a9f9b…7d53cf"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "txHash": "0x290a9f9b41037c06cd8f4a92e3dc480299b1a80fc539a91f801a2a7a8f7d53cf",
        "kind": "1",
        "amount": "10000000000000000",
        "count": "4",
        "volume": "21000002283212205"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5307071,
      "logIndex": 2,
      "timestamp": "2026-08-14T07:34:30Z",
      "txHash": "0xbbec27e622b18d21bdedb24fabc072041aa0fe3ad7419b952a1e2b8754bba618",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xbbec27e622b18d21bdedb24fabc072041aa0fe3ad7419b952a1e2b8754bba618"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditOpened",
      "headline": "Credit opened for 0.01 ETH deposit",
      "fields": [
        [
          "Deposit",
          "0.01 ETH"
        ],
        [
          "Credit unlocked",
          "0.0095 ETH"
        ],
        [
          "Attested balance",
          "0.3572 ETH"
        ],
        [
          "LTV factor",
          "95.00%"
        ],
        [
          "Deposit proof tx",
          "0x290a9f9b…7d53cf"
        ],
        [
          "Balance proof tx",
          "0x349083bf…cb04cc"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "deposit": "10000000000000000",
        "attestedBalance": "357220226814735133",
        "credit": "9500000000000000",
        "factorBps": "9500",
        "depositTxHash": "0x290a9f9b41037c06cd8f4a92e3dc480299b1a80fc539a91f801a2a7a8f7d53cf",
        "balanceTxHash": "0x349083bfb06051f7b67c062d078ccc3c1ea97ee78528a2a97db68c07c7cb04cc"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5307071,
      "logIndex": 3,
      "timestamp": "2026-08-14T07:34:30Z",
      "txHash": "0xbbec27e622b18d21bdedb24fabc072041aa0fe3ad7419b952a1e2b8754bba618",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xbbec27e622b18d21bdedb24fabc072041aa0fe3ad7419b952a1e2b8754bba618"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditWithdrawn",
      "headline": "Drew 0.0095 ETH of credit",
      "fields": [
        [
          "Amount",
          "0.0095 ETH"
        ],
        [
          "Debt after",
          "0.0095 ETH"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "9500000000000000",
        "debt": "9500000000000000"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5307077,
      "logIndex": 8,
      "timestamp": "2026-08-14T07:36:00Z",
      "txHash": "0x3bc160b1a2a1e3c0b1e5065387f15c0383fcad9f2c0566b8653a41fddf232789",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x3bc160b1a2a1e3c0b1e5065387f15c0383fcad9f2c0566b8653a41fddf232789"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "InterestAccrued",
      "headline": "Interest accrued, debt now 0.0095 ETH",
      "fields": [
        [
          "Interest",
          "0.0000000004518 ETH"
        ],
        [
          "Debt after",
          "0.0095 ETH"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "interest": "451864535",
        "debt": "9500000451864535"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5307078,
      "logIndex": 6,
      "timestamp": "2026-08-14T07:36:15Z",
      "txHash": "0x9177c4107aae3189926653fb7e9c8c2d24b9770c75b40cb56fb72574f081d34d",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x9177c4107aae3189926653fb7e9c8c2d24b9770c75b40cb56fb72574f081d34d"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditRedeemed",
      "headline": "Redeemed 0.0095 sCREDIT against debt",
      "fields": [
        [
          "Amount",
          "0.0095 sCREDIT"
        ],
        [
          "Debt after",
          "0.0000000004518 ETH"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "9500000000000000",
        "debt": "451864535"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5307078,
      "logIndex": 8,
      "timestamp": "2026-08-14T07:36:15Z",
      "txHash": "0x9177c4107aae3189926653fb7e9c8c2d24b9770c75b40cb56fb72574f081d34d",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x9177c4107aae3189926653fb7e9c8c2d24b9770c75b40cb56fb72574f081d34d"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "InterestAccrued",
      "headline": "Interest accrued, debt now 0.0000000004518 ETH",
      "fields": [
        [
          "Interest",
          "0.000000000000000945 ETH"
        ],
        [
          "Debt after",
          "0.0000000004518 ETH"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "interest": "945",
        "debt": "451865480"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5307122,
      "logIndex": 0,
      "timestamp": "2026-08-14T07:47:15Z",
      "txHash": "0x5fc0b4fb25496306c451ef46a1dfad0a2eab775f558b2b6820b3e1a2e723e122",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x5fc0b4fb25496306c451ef46a1dfad0a2eab775f558b2b6820b3e1a2e723e122"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "AttestedPaymentLinked",
      "headline": "repayment linked, payment #5",
      "fields": [
        [
          "Kind",
          "repayment"
        ],
        [
          "Amount",
          "0.001 ETH"
        ],
        [
          "History count",
          "5"
        ],
        [
          "History volume",
          "0.022 ETH"
        ],
        [
          "Source tx",
          "0xf3825f7f…a0ebe6"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "txHash": "0xf3825f7f73461d9ca54ad6c3183521a85a7dcddee8b7a12dd9f820c40aa0ebe6",
        "kind": "2",
        "amount": "1000000000000000",
        "count": "5",
        "volume": "22000002283212205"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5307122,
      "logIndex": 2,
      "timestamp": "2026-08-14T07:47:15Z",
      "txHash": "0x5fc0b4fb25496306c451ef46a1dfad0a2eab775f558b2b6820b3e1a2e723e122",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x5fc0b4fb25496306c451ef46a1dfad0a2eab775f558b2b6820b3e1a2e723e122"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditRepaid",
      "headline": "Repayment credited 0.0000000004518 ETH",
      "fields": [
        [
          "Amount",
          "0.0000000004518 ETH"
        ],
        [
          "Source tx",
          "0xf3825f7f…a0ebe6"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "451865480",
        "txHash": "0xf3825f7f73461d9ca54ad6c3183521a85a7dcddee8b7a12dd9f820c40aa0ebe6"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5307122,
      "logIndex": 3,
      "timestamp": "2026-08-14T07:47:15Z",
      "txHash": "0x5fc0b4fb25496306c451ef46a1dfad0a2eab775f558b2b6820b3e1a2e723e122",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x5fc0b4fb25496306c451ef46a1dfad0a2eab775f558b2b6820b3e1a2e723e122"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditClosed",
      "headline": "Credit line closed",
      "fields": [
        [
          "Closing proof tx",
          "0xf3825f7f…a0ebe6"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "txHash": "0xf3825f7f73461d9ca54ad6c3183521a85a7dcddee8b7a12dd9f820c40aa0ebe6"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5307122,
      "logIndex": 4,
      "timestamp": "2026-08-14T07:47:15Z",
      "txHash": "0x5fc0b4fb25496306c451ef46a1dfad0a2eab775f558b2b6820b3e1a2e723e122",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x5fc0b4fb25496306c451ef46a1dfad0a2eab775f558b2b6820b3e1a2e723e122"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "AttestedPaymentLinked",
      "headline": "deposit linked, payment #6",
      "fields": [
        [
          "Kind",
          "deposit"
        ],
        [
          "Amount",
          "0.01 ETH"
        ],
        [
          "History count",
          "6"
        ],
        [
          "History volume",
          "0.032 ETH"
        ],
        [
          "Source tx",
          "0x7c8a3348…12718e"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "txHash": "0x7c8a334898268640b64f11f2cfde20268debf4083a3a638184a05f547112718e",
        "kind": "1",
        "amount": "10000000000000000",
        "count": "6",
        "volume": "32000002283212205"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5359588,
      "logIndex": 2,
      "timestamp": "2026-08-23T10:43:00Z",
      "txHash": "0x3a70c28fd7e6374cfe0ba56681c1c7293aa16a5dff6168a826d2c9149381776f",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x3a70c28fd7e6374cfe0ba56681c1c7293aa16a5dff6168a826d2c9149381776f"
    },
    {
      "chain": "creditcoin",
      "role": "production",
      "contract": "CreditLine",
      "contractAddress": "0x2C3585019B957b16459C409f34973b583267C742",
      "event": "CreditOpened",
      "headline": "Credit opened for 0.01 ETH deposit",
      "fields": [
        [
          "Deposit",
          "0.01 ETH"
        ],
        [
          "Credit unlocked",
          "0.0095 ETH"
        ],
        [
          "Attested balance",
          "0.3459 ETH"
        ],
        [
          "LTV factor",
          "95.00%"
        ],
        [
          "Deposit proof tx",
          "0x7c8a3348…12718e"
        ],
        [
          "Balance proof tx",
          "0x38d82855…a271e1"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "deposit": "10000000000000000",
        "attestedBalance": "345950022358269609",
        "credit": "9500000000000000",
        "factorBps": "9500",
        "depositTxHash": "0x7c8a334898268640b64f11f2cfde20268debf4083a3a638184a05f547112718e",
        "balanceTxHash": "0x38d82855a67a8a2051378833eb1d6aee62306d4c696392c5539aedf49ba271e1"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 5359588,
      "logIndex": 3,
      "timestamp": "2026-08-23T10:43:00Z",
      "txHash": "0x3a70c28fd7e6374cfe0ba56681c1c7293aa16a5dff6168a826d2c9149381776f",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x3a70c28fd7e6374cfe0ba56681c1c7293aa16a5dff6168a826d2c9149381776f"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "CreditOpenedFromBalance",
      "headline": "Credit opened from a proven balance, no deposit, 0.00398 ETH line",
      "fields": [
        [
          "Attested balance",
          "0.0199 ETH"
        ],
        [
          "Credit unlocked",
          "0.00398 ETH"
        ],
        [
          "Policy LTV",
          "20.00%"
        ],
        [
          "Deposit",
          "0 ETH, none required"
        ],
        [
          "Balance proof tx",
          "0x0a360e92…cf5d34"
        ]
      ],
      "raw": {
        "user": "0x75507D3f46bd3df69A314be70D972838B24FCAE7",
        "attestedBalance": "19904691533442134",
        "credit": "3980938306688426",
        "ltvBps": "2000",
        "balanceTxHash": "0x0a360e92412bd42ba97350101c46ca44bf9ad7b71ffa45c2cf3f773fb8cf5d34"
      },
      "actor": "0x75507d3f46bd3df69a314be70d972838b24fcae7",
      "block": 5485461,
      "logIndex": 1,
      "timestamp": "2026-09-14T08:10:00Z",
      "txHash": "0x404393fc98e2b1d41a72b8a562feff3e6a82cdea5f68a7bf1fc91bb41c64d3b5",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x404393fc98e2b1d41a72b8a562feff3e6a82cdea5f68a7bf1fc91bb41c64d3b5"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "CreditWithdrawn",
      "headline": "Drew 0.00398 ETH of credit",
      "fields": [
        [
          "Amount",
          "0.00398 ETH"
        ],
        [
          "Debt after",
          "0.00398 ETH"
        ]
      ],
      "raw": {
        "user": "0x75507D3f46bd3df69A314be70D972838B24FCAE7",
        "amount": "3980000000000000",
        "debt": "3980000000000000"
      },
      "actor": "0x75507d3f46bd3df69a314be70d972838b24fcae7",
      "block": 5485639,
      "logIndex": 1,
      "timestamp": "2026-09-14T08:54:30Z",
      "txHash": "0xf160ffd264afd6ebf6d0d31ecf2558701d6751a77a446925a818215629bf2b74",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xf160ffd264afd6ebf6d0d31ecf2558701d6751a77a446925a818215629bf2b74"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "InterestAccrued",
      "headline": "Interest accrued, debt now 0.00398 ETH",
      "fields": [
        [
          "Interest",
          "0.0000001097 ETH"
        ],
        [
          "Debt after",
          "0.00398 ETH"
        ]
      ],
      "raw": {
        "user": "0x75507D3f46bd3df69A314be70D972838B24FCAE7",
        "interest": "109798325722",
        "debt": "3980109798325722"
      },
      "actor": "0x75507d3f46bd3df69a314be70d972838b24fcae7",
      "block": 5486217,
      "logIndex": 0,
      "timestamp": "2026-09-14T11:19:30Z",
      "txHash": "0xa165a57f0ff7a19b064eaf0dd3e1753b36644487ecd3ccb3a0400dee725d3da6",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xa165a57f0ff7a19b064eaf0dd3e1753b36644487ecd3ccb3a0400dee725d3da6"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "AttestedPaymentLinked",
      "headline": "repayment linked, payment #1",
      "fields": [
        [
          "Kind",
          "repayment"
        ],
        [
          "Amount",
          "0.003981 ETH"
        ],
        [
          "History count",
          "1"
        ],
        [
          "History volume",
          "0.003981 ETH"
        ],
        [
          "Source tx",
          "0xf8870b20…1fdce0"
        ]
      ],
      "raw": {
        "user": "0x75507D3f46bd3df69A314be70D972838B24FCAE7",
        "txHash": "0xf8870b20d6303b9fc73defccb8cc8a6b0e0944db6bff75b9cf2ce2969f1fdce0",
        "kind": "2",
        "amount": "3981000000000000",
        "count": "1",
        "volume": "3981000000000000"
      },
      "actor": "0x75507d3f46bd3df69a314be70d972838b24fcae7",
      "block": 5486217,
      "logIndex": 2,
      "timestamp": "2026-09-14T11:19:30Z",
      "txHash": "0xa165a57f0ff7a19b064eaf0dd3e1753b36644487ecd3ccb3a0400dee725d3da6",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xa165a57f0ff7a19b064eaf0dd3e1753b36644487ecd3ccb3a0400dee725d3da6"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "CreditRepaid",
      "headline": "Repayment credited 0.00398 ETH",
      "fields": [
        [
          "Amount",
          "0.00398 ETH"
        ],
        [
          "Source tx",
          "0xf8870b20…1fdce0"
        ]
      ],
      "raw": {
        "user": "0x75507D3f46bd3df69A314be70D972838B24FCAE7",
        "amount": "3980109798325722",
        "txHash": "0xf8870b20d6303b9fc73defccb8cc8a6b0e0944db6bff75b9cf2ce2969f1fdce0"
      },
      "actor": "0x75507d3f46bd3df69a314be70d972838b24fcae7",
      "block": 5486217,
      "logIndex": 3,
      "timestamp": "2026-09-14T11:19:30Z",
      "txHash": "0xa165a57f0ff7a19b064eaf0dd3e1753b36644487ecd3ccb3a0400dee725d3da6",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xa165a57f0ff7a19b064eaf0dd3e1753b36644487ecd3ccb3a0400dee725d3da6"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "CreditClosed",
      "headline": "Credit line closed",
      "fields": [
        [
          "Closing proof tx",
          "0xf8870b20…1fdce0"
        ]
      ],
      "raw": {
        "user": "0x75507D3f46bd3df69A314be70D972838B24FCAE7",
        "txHash": "0xf8870b20d6303b9fc73defccb8cc8a6b0e0944db6bff75b9cf2ce2969f1fdce0"
      },
      "actor": "0x75507d3f46bd3df69a314be70d972838b24fcae7",
      "block": 5486217,
      "logIndex": 4,
      "timestamp": "2026-09-14T11:19:30Z",
      "txHash": "0xa165a57f0ff7a19b064eaf0dd3e1753b36644487ecd3ccb3a0400dee725d3da6",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0xa165a57f0ff7a19b064eaf0dd3e1753b36644487ecd3ccb3a0400dee725d3da6"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "CreditOpenedFromBalance",
      "headline": "Credit opened from a proven balance, no deposit, 0.003981 ETH line",
      "fields": [
        [
          "Attested balance",
          "0.0199 ETH"
        ],
        [
          "Credit unlocked",
          "0.003981 ETH"
        ],
        [
          "Policy LTV",
          "20.00%"
        ],
        [
          "Deposit",
          "0 ETH, none required"
        ],
        [
          "Balance proof tx",
          "0x666e5479…daf248"
        ]
      ],
      "raw": {
        "user": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "attestedBalance": "19906155846592028",
        "credit": "3981231169318405",
        "ltvBps": "2000",
        "balanceTxHash": "0x666e5479a5996ffb29126dc0e47d62a96cccbc19c0efa676412502c8f1daf248"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 5486453,
      "logIndex": 7,
      "timestamp": "2026-09-14T12:18:45Z",
      "txHash": "0x229d053f6be25fa9566e2e0bf9e42649dc1d69a3db74b2b93f320469e29931f7",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x229d053f6be25fa9566e2e0bf9e42649dc1d69a3db74b2b93f320469e29931f7"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "CreditWithdrawn",
      "headline": "Drew 0.0038 ETH of credit",
      "fields": [
        [
          "Amount",
          "0.0038 ETH"
        ],
        [
          "Debt after",
          "0.0038 ETH"
        ]
      ],
      "raw": {
        "user": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "amount": "3800000000000000",
        "debt": "3800000000000000"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 5486461,
      "logIndex": 2,
      "timestamp": "2026-09-14T12:20:45Z",
      "txHash": "0x543afada0d09b8eee3a37d21f508aaaaea5b1f9c4a2c07c817b3a77bc29f3483",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x543afada0d09b8eee3a37d21f508aaaaea5b1f9c4a2c07c817b3a77bc29f3483"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "InterestAccrued",
      "headline": "Interest accrued, debt now 0.0038 ETH",
      "fields": [
        [
          "Interest",
          "0.000000006326 ETH"
        ],
        [
          "Debt after",
          "0.0038 ETH"
        ]
      ],
      "raw": {
        "user": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "interest": "6326103500",
        "debt": "3800006326103500"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 5486496,
      "logIndex": 0,
      "timestamp": "2026-09-14T12:29:30Z",
      "txHash": "0x9446fe3c0fbeaf203e40aadf515fb410f7c72647af3719f6c40f58068890d36f",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x9446fe3c0fbeaf203e40aadf515fb410f7c72647af3719f6c40f58068890d36f"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "AttestedPaymentLinked",
      "headline": "repayment linked, payment #1",
      "fields": [
        [
          "Kind",
          "repayment"
        ],
        [
          "Amount",
          "0.0038 ETH"
        ],
        [
          "History count",
          "1"
        ],
        [
          "History volume",
          "0.0038 ETH"
        ],
        [
          "Source tx",
          "0xfe7e2af6…2400e6"
        ]
      ],
      "raw": {
        "user": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "txHash": "0xfe7e2af6276bef562a71467ed27e55730529d25d2f01a0e7871b9adc302400e6",
        "kind": "2",
        "amount": "3800000000000000",
        "count": "1",
        "volume": "3800000000000000"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 5486496,
      "logIndex": 2,
      "timestamp": "2026-09-14T12:29:30Z",
      "txHash": "0x9446fe3c0fbeaf203e40aadf515fb410f7c72647af3719f6c40f58068890d36f",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x9446fe3c0fbeaf203e40aadf515fb410f7c72647af3719f6c40f58068890d36f"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "CreditRepaid",
      "headline": "Repayment credited 0.0038 ETH",
      "fields": [
        [
          "Amount",
          "0.0038 ETH"
        ],
        [
          "Source tx",
          "0xfe7e2af6…2400e6"
        ]
      ],
      "raw": {
        "user": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "amount": "3800000000000000",
        "txHash": "0xfe7e2af6276bef562a71467ed27e55730529d25d2f01a0e7871b9adc302400e6"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 5486496,
      "logIndex": 3,
      "timestamp": "2026-09-14T12:29:30Z",
      "txHash": "0x9446fe3c0fbeaf203e40aadf515fb410f7c72647af3719f6c40f58068890d36f",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x9446fe3c0fbeaf203e40aadf515fb410f7c72647af3719f6c40f58068890d36f"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "InterestAccrued",
      "headline": "Interest accrued, debt now 0.000000006326 ETH",
      "fields": [
        [
          "Interest",
          "0.00000000000001835 ETH"
        ],
        [
          "Debt after",
          "0.000000006326 ETH"
        ]
      ],
      "raw": {
        "user": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "interest": "18354",
        "debt": "6326121854"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 5486557,
      "logIndex": 0,
      "timestamp": "2026-09-14T12:44:45Z",
      "txHash": "0x87487800e4c7e7691cf52527334a6cf9e790234db2d1f89a28d0f9f7f17cc43d",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x87487800e4c7e7691cf52527334a6cf9e790234db2d1f89a28d0f9f7f17cc43d"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "AttestedPaymentLinked",
      "headline": "repayment linked, payment #2",
      "fields": [
        [
          "Kind",
          "repayment"
        ],
        [
          "Amount",
          "0.001 ETH"
        ],
        [
          "History count",
          "2"
        ],
        [
          "History volume",
          "0.0048 ETH"
        ],
        [
          "Source tx",
          "0x8ef8cf5e…277f96"
        ]
      ],
      "raw": {
        "user": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "txHash": "0x8ef8cf5e0aacff1117d14be06deb9f3ca60951a97b04e395837e6d08c6277f96",
        "kind": "2",
        "amount": "1000000000000000",
        "count": "2",
        "volume": "4800000000000000"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 5486557,
      "logIndex": 2,
      "timestamp": "2026-09-14T12:44:45Z",
      "txHash": "0x87487800e4c7e7691cf52527334a6cf9e790234db2d1f89a28d0f9f7f17cc43d",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x87487800e4c7e7691cf52527334a6cf9e790234db2d1f89a28d0f9f7f17cc43d"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "CreditRepaid",
      "headline": "Repayment credited 0.000000006326 ETH",
      "fields": [
        [
          "Amount",
          "0.000000006326 ETH"
        ],
        [
          "Source tx",
          "0x8ef8cf5e…277f96"
        ]
      ],
      "raw": {
        "user": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "amount": "6326121854",
        "txHash": "0x8ef8cf5e0aacff1117d14be06deb9f3ca60951a97b04e395837e6d08c6277f96"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 5486557,
      "logIndex": 3,
      "timestamp": "2026-09-14T12:44:45Z",
      "txHash": "0x87487800e4c7e7691cf52527334a6cf9e790234db2d1f89a28d0f9f7f17cc43d",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x87487800e4c7e7691cf52527334a6cf9e790234db2d1f89a28d0f9f7f17cc43d"
    },
    {
      "chain": "creditcoin",
      "role": "generation-2",
      "contract": "CreditLine",
      "contractAddress": "0xD8cd1d29024aB86ACed6aA01b38612fb32ef2682",
      "event": "CreditClosed",
      "headline": "Credit line closed",
      "fields": [
        [
          "Closing proof tx",
          "0x8ef8cf5e…277f96"
        ]
      ],
      "raw": {
        "user": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "txHash": "0x8ef8cf5e0aacff1117d14be06deb9f3ca60951a97b04e395837e6d08c6277f96"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 5486557,
      "logIndex": 4,
      "timestamp": "2026-09-14T12:44:45Z",
      "txHash": "0x87487800e4c7e7691cf52527334a6cf9e790234db2d1f89a28d0f9f7f17cc43d",
      "explorerUrl": "https://creditcoin-testnet.blockscout.com/tx/0x87487800e4c7e7691cf52527334a6cf9e790234db2d1f89a28d0f9f7f17cc43d"
    },
    {
      "chain": "sepolia",
      "role": "legacy",
      "contract": "SepoliaPayment",
      "contractAddress": "0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9",
      "event": "DepositPaid",
      "headline": "Deposit paid on Sepolia, 0.01 ETH",
      "fields": [
        [
          "Amount",
          "0.01 ETH"
        ],
        [
          "Reference",
          "0x53c0fa2f…4db58a"
        ]
      ],
      "raw": {
        "payer": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "10000000000000000",
        "ref": "0x53c0fa2f20edd97498cd6cce37775e76c0ae0306bfcda5791e26724f424db58a"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11479268,
      "logIndex": 4,
      "timestamp": "2026-08-13T09:18:00Z",
      "txHash": "0xb471327dce9635c1f9b0f598e61150d1bece5633b67f095d9d2de74bdf102a32",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0xb471327dce9635c1f9b0f598e61150d1bece5633b67f095d9d2de74bdf102a32"
    },
    {
      "chain": "sepolia",
      "role": "legacy",
      "contract": "SepoliaPayment",
      "contractAddress": "0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9",
      "event": "BalanceAttested",
      "headline": "Balance attested, 0.4012 ETH",
      "fields": [
        [
          "Attested balance",
          "0.4012 ETH"
        ],
        [
          "Reference",
          "0xa950b2a8…865c32"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "ethBalance": "401296729092390983",
        "ref": "0xa950b2a8279dc1792611e65f6e9c71c02fae3f6138e09a1b6bd3fab5cd865c32"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11479274,
      "logIndex": 39,
      "timestamp": "2026-08-13T09:19:12Z",
      "txHash": "0x348e01ccc0ea1622594d4143a9ba7a376c7252c16cf963553d6473a476c6ac14",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x348e01ccc0ea1622594d4143a9ba7a376c7252c16cf963553d6473a476c6ac14"
    },
    {
      "chain": "sepolia",
      "role": "legacy",
      "contract": "SepoliaPayment",
      "contractAddress": "0x4B137F56A0b5A8633D079d2d6b34d6aC5CdD22E9",
      "event": "RepaymentPaid",
      "headline": "Repayment paid on Sepolia, 0.002 ETH",
      "fields": [
        [
          "Amount",
          "0.002 ETH"
        ],
        [
          "Reference",
          "0x883a7051…b7c049"
        ]
      ],
      "raw": {
        "payer": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "2000000000000000",
        "ref": "0x883a70510f08c1e7f42c8d89db731b1de569f163b7f2a691434e6b13b9b7c049"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11479995,
      "logIndex": 55,
      "timestamp": "2026-08-13T11:47:48Z",
      "txHash": "0x342d63695b0f55224087da60e2aa0549dc8970915a6fabcb6bc48c5185d2a82f",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x342d63695b0f55224087da60e2aa0549dc8970915a6fabcb6bc48c5185d2a82f"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "DepositPaid",
      "headline": "Deposit paid on Sepolia, 0.01 ETH",
      "fields": [
        [
          "Amount",
          "0.01 ETH"
        ],
        [
          "Reference",
          "0x6714232a…7c3f46"
        ]
      ],
      "raw": {
        "payer": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "10000000000000000",
        "ref": "0x6714232a5b9a3cbec53ef5aef3c5a5fe8b5ac424360679ca7618ecc9e17c3f46"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11480227,
      "logIndex": 19,
      "timestamp": "2026-08-13T12:35:24Z",
      "txHash": "0x98d4ae75eae37ae6741c095d924286c1f7b435e24a8eec50c820f70b7bd3123e",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x98d4ae75eae37ae6741c095d924286c1f7b435e24a8eec50c820f70b7bd3123e"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "BalanceAttested",
      "headline": "Balance attested, 0.3889 ETH",
      "fields": [
        [
          "Attested balance",
          "0.3889 ETH"
        ],
        [
          "Reference",
          "0x809e9093…29959c"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "ethBalance": "388999980944433088",
        "ref": "0x809e90932a51038bc2d9ecb89731b1442b21cf6610ede19ba971113d6d29959c"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11480228,
      "logIndex": 55,
      "timestamp": "2026-08-13T12:35:36Z",
      "txHash": "0xd67960a4c1b0d95667f34374294c3c759e514148fd029870e0431e29d871a6c2",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0xd67960a4c1b0d95667f34374294c3c759e514148fd029870e0431e29d871a6c2"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "DepositPaid",
      "headline": "Deposit paid on Sepolia, 0.01 ETH",
      "fields": [
        [
          "Amount",
          "0.01 ETH"
        ],
        [
          "Reference",
          "0x28a6bb56…4d66ae"
        ]
      ],
      "raw": {
        "payer": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "10000000000000000",
        "ref": "0x28a6bb56d768c3b257932a32d5b57e6e724cfa08ba530d3b2c5c24110b4d66ae"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11480342,
      "logIndex": 72,
      "timestamp": "2026-08-13T12:59:12Z",
      "txHash": "0xded37409f23ca814554a61ea90d4fe769a161390b63ce228a59860885c1b3515",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0xded37409f23ca814554a61ea90d4fe769a161390b63ce228a59860885c1b3515"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "BalanceAttested",
      "headline": "Balance attested, 0.3788 ETH",
      "fields": [
        [
          "Attested balance",
          "0.3788 ETH"
        ],
        [
          "Reference",
          "0x15768d01…e9c40f"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "ethBalance": "378870076917969603",
        "ref": "0x15768d01aa57aae740b41cfa14eb60019ac3739a2d1dd8ae40f1206a9de9c40f"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11480344,
      "logIndex": 40,
      "timestamp": "2026-08-13T12:59:36Z",
      "txHash": "0x3342bf074eaa6fe8f4502515fa5a861529df86d6fa62781b1173dd53a821cebf",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x3342bf074eaa6fe8f4502515fa5a861529df86d6fa62781b1173dd53a821cebf"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "RepaymentPaid",
      "headline": "Repayment paid on Sepolia, 0.000000002283 ETH",
      "fields": [
        [
          "Amount",
          "0.000000002283 ETH"
        ],
        [
          "Reference",
          "0xab555f0c…66a413"
        ]
      ],
      "raw": {
        "payer": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "2283199282",
        "ref": "0xab555f0c0574d4d4ce4bd40f96f364f21d6e6d82564f7293e6d9115c4366a413"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11481533,
      "logIndex": 62,
      "timestamp": "2026-08-13T17:04:36Z",
      "txHash": "0xe4d45242b8cc29b21010e8951b837c3bcd0ab21da21854f01309f1f62aad6882",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0xe4d45242b8cc29b21010e8951b837c3bcd0ab21da21854f01309f1f62aad6882"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "RepaymentPaid",
      "headline": "Repayment paid on Sepolia, 0.000000002283 ETH",
      "fields": [
        [
          "Amount",
          "0.000000002283 ETH"
        ],
        [
          "Reference",
          "0xf888b64e…29a854"
        ]
      ],
      "raw": {
        "payer": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "2283212205",
        "ref": "0xf888b64e10d174d39d8550728a9acfad67fc0acb22969c6ef98de0a5cf29a854"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11481674,
      "logIndex": 32,
      "timestamp": "2026-08-13T17:34:12Z",
      "txHash": "0x58617171ded6d4ed3810d7851e9f820ec6da25334cc096912b7b9b98bd84251b",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x58617171ded6d4ed3810d7851e9f820ec6da25334cc096912b7b9b98bd84251b"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "RepaymentPaid",
      "headline": "Repayment paid on Sepolia, 0.001 ETH",
      "fields": [
        [
          "Amount",
          "0.001 ETH"
        ],
        [
          "Reference",
          "0x8df3333e…448fbd"
        ]
      ],
      "raw": {
        "payer": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "1000000000000000",
        "ref": "0x8df3333e32d15f47a4f42ec64524d619b81fa39aea866da7e9e7f0962d448fbd"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11481802,
      "logIndex": 34,
      "timestamp": "2026-08-13T18:00:24Z",
      "txHash": "0x5fa5d7a22da9fbefd4cf0a6190f9ee342967637f470c53fd4adf3e2431229785",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x5fa5d7a22da9fbefd4cf0a6190f9ee342967637f470c53fd4adf3e2431229785"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "DepositPaid",
      "headline": "Deposit paid on Sepolia, 0.01 ETH",
      "fields": [
        [
          "Amount",
          "0.01 ETH"
        ],
        [
          "Reference",
          "0xe36d76b7…e05d16"
        ]
      ],
      "raw": {
        "payer": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "10000000000000000",
        "ref": "0xe36d76b7e93a98aeb649c3deb0587992edf20abf3eb58e8d8c5638fca0e05d16"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11481907,
      "logIndex": 1,
      "timestamp": "2026-08-13T18:21:36Z",
      "txHash": "0x92b69ef354f20abc72c35e15fd2e134db09abfb3b1c9b9a7928e554b8712796a",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x92b69ef354f20abc72c35e15fd2e134db09abfb3b1c9b9a7928e554b8712796a"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "BalanceAttested",
      "headline": "Balance attested, 0.3674 ETH",
      "fields": [
        [
          "Attested balance",
          "0.3674 ETH"
        ],
        [
          "Reference",
          "0x139716ff…e5bcb9"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "ethBalance": "367473221625774671",
        "ref": "0x139716ff0e13e9a03321ad0ec39ed69cb260ba3c83e1c6f1776cb2b733e5bcb9"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11481909,
      "logIndex": 129,
      "timestamp": "2026-08-13T18:22:00Z",
      "txHash": "0xf123c337d0a9725b47a600309653f4d5d60e4159e8eaa4b19dec6e352cb7500b",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0xf123c337d0a9725b47a600309653f4d5d60e4159e8eaa4b19dec6e352cb7500b"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "DepositPaid",
      "headline": "Deposit paid on Sepolia, 0.01 ETH",
      "fields": [
        [
          "Amount",
          "0.01 ETH"
        ],
        [
          "Reference",
          "0xc991b148…fc2cdc"
        ]
      ],
      "raw": {
        "payer": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "10000000000000000",
        "ref": "0xc991b148ffddaa727e572371f2c5e418699f69ee5801f6cef2c9cad91cfc2cdc"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11485520,
      "logIndex": 60,
      "timestamp": "2026-08-14T06:46:36Z",
      "txHash": "0x290a9f9b41037c06cd8f4a92e3dc480299b1a80fc539a91f801a2a7a8f7d53cf",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x290a9f9b41037c06cd8f4a92e3dc480299b1a80fc539a91f801a2a7a8f7d53cf"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "BalanceAttested",
      "headline": "Balance attested, 0.3573 ETH",
      "fields": [
        [
          "Attested balance",
          "0.3573 ETH"
        ],
        [
          "Reference",
          "0x1506ac71…3d8e82"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "ethBalance": "357339774372295915",
        "ref": "0x1506ac71225b901fa5801a7f5a25072479b21289ed71079532390384a83d8e82"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11485520,
      "logIndex": 62,
      "timestamp": "2026-08-14T06:46:36Z",
      "txHash": "0x750021b566672c792c5635dfed66ebab7600c752ed18ea07dcbd35bc1e9f8660",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x750021b566672c792c5635dfed66ebab7600c752ed18ea07dcbd35bc1e9f8660"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "BalanceAttested",
      "headline": "Balance attested, 0.3572 ETH",
      "fields": [
        [
          "Attested balance",
          "0.3572 ETH"
        ],
        [
          "Reference",
          "0xa95db180…851a94"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "ethBalance": "357280691712021844",
        "ref": "0xa95db18042aeff21c030939558ba89146c990d5807edb7dc318beea318851a94"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11485637,
      "logIndex": 224,
      "timestamp": "2026-08-14T07:10:12Z",
      "txHash": "0xb984199df4259510b95900c1eb9acf774758378b1da3836957a5d96dea8798d0",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0xb984199df4259510b95900c1eb9acf774758378b1da3836957a5d96dea8798d0"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "BalanceAttested",
      "headline": "Balance attested, 0.3572 ETH",
      "fields": [
        [
          "Attested balance",
          "0.3572 ETH"
        ],
        [
          "Reference",
          "0x3d0c9a5c…68436a"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "ethBalance": "357220226814735133",
        "ref": "0x3d0c9a5cc105840326c2b2a673c2fd94e893fd6bc00d4f2c6192ea8f7268436a"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11485711,
      "logIndex": 32,
      "timestamp": "2026-08-14T07:25:12Z",
      "txHash": "0x349083bfb06051f7b67c062d078ccc3c1ea97ee78528a2a97db68c07c7cb04cc",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x349083bfb06051f7b67c062d078ccc3c1ea97ee78528a2a97db68c07c7cb04cc"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "RepaymentPaid",
      "headline": "Repayment paid on Sepolia, 0.001 ETH",
      "fields": [
        [
          "Amount",
          "0.001 ETH"
        ],
        [
          "Reference",
          "0x3cfbb643…557047"
        ]
      ],
      "raw": {
        "payer": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "1000000000000000",
        "ref": "0x3cfbb643c1edab9ba84dfc398cde3ab2d5b044714319402d5c64a8adde557047"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11485778,
      "logIndex": 38,
      "timestamp": "2026-08-14T07:39:00Z",
      "txHash": "0xf3825f7f73461d9ca54ad6c3183521a85a7dcddee8b7a12dd9f820c40aa0ebe6",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0xf3825f7f73461d9ca54ad6c3183521a85a7dcddee8b7a12dd9f820c40aa0ebe6"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "BalanceAttested",
      "headline": "Balance attested, 0.356 ETH",
      "fields": [
        [
          "Attested balance",
          "0.356 ETH"
        ],
        [
          "Reference",
          "0xc0894a2f…211573"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "ethBalance": "356086870754894383",
        "ref": "0xc0894a2f487b5150654a7f20077eab6e6ea109779bfab316720bcbe098211573"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11495351,
      "logIndex": 108,
      "timestamp": "2026-08-15T16:31:36Z",
      "txHash": "0xd90a27d9080671161014326c56319d4adb90c8ca9f4cee83b33e85778864818c",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0xd90a27d9080671161014326c56319d4adb90c8ca9f4cee83b33e85778864818c"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "DepositPaid",
      "headline": "Deposit paid on Sepolia, 0.01 ETH",
      "fields": [
        [
          "Amount",
          "0.01 ETH"
        ],
        [
          "Reference",
          "0x950555db…7c0b7a"
        ]
      ],
      "raw": {
        "payer": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "amount": "10000000000000000",
        "ref": "0x950555dbdfce1aa6f07023b65d03315ca6a6386c189f4f16e8f3c555aa7c0b7a"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11549459,
      "logIndex": 30,
      "timestamp": "2026-08-23T10:33:00Z",
      "txHash": "0x7c8a334898268640b64f11f2cfde20268debf4083a3a638184a05f547112718e",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x7c8a334898268640b64f11f2cfde20268debf4083a3a638184a05f547112718e"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "BalanceAttested",
      "headline": "Balance attested, 0.3459 ETH",
      "fields": [
        [
          "Attested balance",
          "0.3459 ETH"
        ],
        [
          "Reference",
          "0xd456918a…3c2313"
        ]
      ],
      "raw": {
        "user": "0x7A35f63F81357DaDE2cff8f5699b935786Aa9Da2",
        "ethBalance": "345950022358269609",
        "ref": "0xd456918a9793140c8ab6189656c023d043c5ac2bd385e5905fb53ced853c2313"
      },
      "actor": "0x7a35f63f81357dade2cff8f5699b935786aa9da2",
      "block": 11549461,
      "logIndex": 121,
      "timestamp": "2026-08-23T10:33:24Z",
      "txHash": "0x38d82855a67a8a2051378833eb1d6aee62306d4c696392c5539aedf49ba271e1",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x38d82855a67a8a2051378833eb1d6aee62306d4c696392c5539aedf49ba271e1"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "BalanceAttested",
      "headline": "Balance attested, 0.0199 ETH",
      "fields": [
        [
          "Attested balance",
          "0.0199 ETH"
        ],
        [
          "Reference",
          "0x67cfce8a…537b87"
        ]
      ],
      "raw": {
        "user": "0x75507D3f46bd3df69A314be70D972838B24FCAE7",
        "ethBalance": "19904691533442134",
        "ref": "0x67cfce8a178da239e405c5a3111861b2217b9c28c254e05dcc22835bf1537b87"
      },
      "actor": "0x75507d3f46bd3df69a314be70d972838b24fcae7",
      "block": 11701597,
      "logIndex": 2,
      "timestamp": "2026-09-14T08:01:00Z",
      "txHash": "0x0a360e92412bd42ba97350101c46ca44bf9ad7b71ffa45c2cf3f773fb8cf5d34",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x0a360e92412bd42ba97350101c46ca44bf9ad7b71ffa45c2cf3f773fb8cf5d34"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "RepaymentPaid",
      "headline": "Repayment paid on Sepolia, 0.003981 ETH",
      "fields": [
        [
          "Amount",
          "0.003981 ETH"
        ],
        [
          "Reference",
          "0xc9f56252…7c3fc4"
        ]
      ],
      "raw": {
        "payer": "0x75507D3f46bd3df69A314be70D972838B24FCAE7",
        "amount": "3981000000000000",
        "ref": "0xc9f56252de6601542eeb9e5c710732797bb20f78ce8206c16babe338117c3fc4"
      },
      "actor": "0x75507d3f46bd3df69a314be70d972838b24fcae7",
      "block": 11702505,
      "logIndex": 37,
      "timestamp": "2026-09-14T11:08:24Z",
      "txHash": "0xf8870b20d6303b9fc73defccb8cc8a6b0e0944db6bff75b9cf2ce2969f1fdce0",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0xf8870b20d6303b9fc73defccb8cc8a6b0e0944db6bff75b9cf2ce2969f1fdce0"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "BalanceAttested",
      "headline": "Balance attested, 0.0199 ETH",
      "fields": [
        [
          "Attested balance",
          "0.0199 ETH"
        ],
        [
          "Reference",
          "0xcd2ac40f…379d54"
        ]
      ],
      "raw": {
        "user": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "ethBalance": "19906155846592028",
        "ref": "0xcd2ac40f2f54dc4d075775914c694676fe81c2bb9c13d8ff1449ffe993379d54"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 11702809,
      "logIndex": 25,
      "timestamp": "2026-09-14T12:10:36Z",
      "txHash": "0x666e5479a5996ffb29126dc0e47d62a96cccbc19c0efa676412502c8f1daf248",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x666e5479a5996ffb29126dc0e47d62a96cccbc19c0efa676412502c8f1daf248"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "RepaymentPaid",
      "headline": "Repayment paid on Sepolia, 0.0038 ETH",
      "fields": [
        [
          "Amount",
          "0.0038 ETH"
        ],
        [
          "Reference",
          "0x2379c145…f157a3"
        ]
      ],
      "raw": {
        "payer": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "amount": "3800000000000000",
        "ref": "0x2379c145acb03103959762546964d692191ea03230acedf726ab5d348df157a3"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 11702860,
      "logIndex": 64,
      "timestamp": "2026-09-14T12:21:24Z",
      "txHash": "0xfe7e2af6276bef562a71467ed27e55730529d25d2f01a0e7871b9adc302400e6",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0xfe7e2af6276bef562a71467ed27e55730529d25d2f01a0e7871b9adc302400e6"
    },
    {
      "chain": "sepolia",
      "role": "production",
      "contract": "SepoliaPayment",
      "contractAddress": "0x63F0c69cf9F8b53E8eDD141d07fF2eEd2237ccc4",
      "event": "RepaymentPaid",
      "headline": "Repayment paid on Sepolia, 0.001 ETH",
      "fields": [
        [
          "Amount",
          "0.001 ETH"
        ],
        [
          "Reference",
          "0xa58b4141…c5585a"
        ]
      ],
      "raw": {
        "payer": "0x4271A2cc0756aD5ffb7c6f1A79574158871fADdb",
        "amount": "1000000000000000",
        "ref": "0xa58b414167e92a7e6736677bd257b22a3b373967262d98454db9cafb5ec5585a"
      },
      "actor": "0x4271a2cc0756ad5ffb7c6f1a79574158871faddb",
      "block": 11702928,
      "logIndex": 5,
      "timestamp": "2026-09-14T12:35:48Z",
      "txHash": "0x8ef8cf5e0aacff1117d14be06deb9f3ca60951a97b04e395837e6d08c6277f96",
      "explorerUrl": "https://eth-sepolia.blockscout.com/tx/0x8ef8cf5e0aacff1117d14be06deb9f3ca60951a97b04e395837e6d08c6277f96"
    }
  ]
} as const satisfies {
  generatedAt: string;
  asOf: { creditcoinBlock: number; sepoliaBlock: number };
  sources: ChainSource[];
  summary: {
    totalEvents: number;
    linesOpened: number;
    linesOpenedFromBalance: number;
    linesClosed: number;
    linesActive: number;
    paymentsLinked: number;
    depositsPaid: number;
    repaymentsPaid: number;
    balancesAttested: number;
    distinctActors: number;
    depositVolumeEth: string;
    repayVolumeEth: string;
    creditDrawnEth: string;
  };
  funnel: {
    stages: {
      key: string;
      label: string;
      wallets: number;
      entered: number;
      dropped: number;
    }[];
    distinctWallets: number;
    openedWithoutDeposit: number;
  };
  events: ChainEvent[];
};
