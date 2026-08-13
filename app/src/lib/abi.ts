export const sepoliaPaymentAbi = [
  {
    type: "function",
    name: "payDeposit",
    stateMutability: "payable",
    inputs: [{ name: "ref", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "payRepayment",
    stateMutability: "payable",
    inputs: [{ name: "ref", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "attestBalance",
    stateMutability: "nonpayable",
    inputs: [{ name: "ref", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "deposits",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "DepositPaid",
    inputs: [
      { name: "payer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "ref", type: "bytes32", indexed: true },
    ],
  },
  {
    type: "event",
    name: "RepaymentPaid",
    inputs: [
      { name: "payer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "ref", type: "bytes32", indexed: true },
    ],
  },
  {
    type: "event",
    name: "BalanceAttested",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "ethBalance", type: "uint256", indexed: false },
      { name: "ref", type: "bytes32", indexed: true },
    ],
  },
] as const;

const paymentClaimComponents = [
  { name: "txHash", type: "bytes32" },
  { name: "payer", type: "address" },
  { name: "amount", type: "uint256" },
  { name: "kind", type: "uint8" },
] as const;

export const creditLineAbi = [
  {
    type: "function",
    name: "openCredit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "depositClaim", type: "tuple", components: paymentClaimComponents },
      { name: "depositProof", type: "bytes" },
      { name: "balanceClaim", type: "tuple", components: paymentClaimComponents },
      { name: "balanceProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repayCredit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claim", type: "tuple", components: paymentClaimComponents },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submitAttestedPayment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claim", type: "tuple", components: paymentClaimComponents },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getHistory",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "count", type: "uint256" },
          { name: "volume", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "creditScore",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "historyBonusBps",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "usedTx",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "deposit", type: "uint256" },
          { name: "debt", type: "uint256" },
          { name: "credit", type: "uint256" },
          { name: "attestedBalance", type: "uint256" },
          { name: "lastAccrual", type: "uint64" },
          { name: "status", type: "uint8" },
          { name: "openTxHash", type: "bytes32" },
          { name: "balanceTxHash", type: "bytes32" },
          { name: "closeTxHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "availableCredit",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "currentDebt",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "closeUnused",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "creditToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "interestPerYearBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "CreditOpened",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "deposit", type: "uint256", indexed: false },
      { name: "attestedBalance", type: "uint256", indexed: false },
      { name: "credit", type: "uint256", indexed: false },
      { name: "factorBps", type: "uint256", indexed: false },
      { name: "depositTxHash", type: "bytes32", indexed: true },
      { name: "balanceTxHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreditRepaid",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "txHash", type: "bytes32", indexed: true },
    ],
  },
  {
    type: "event",
    name: "CreditWithdrawn",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "debt", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreditRedeemed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "debt", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreditClosed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "txHash", type: "bytes32", indexed: true },
    ],
  },
] as const;

export const sparkCreditAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;
