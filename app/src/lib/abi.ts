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
] as const;

export const creditLineAbi = [
  {
    type: "function",
    name: "openCredit",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "claim",
        type: "tuple",
        components: [
          { name: "txHash", type: "bytes32" },
          { name: "payer", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "kind", type: "uint8" },
        ],
      },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repayCredit",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "claim",
        type: "tuple",
        components: [
          { name: "txHash", type: "bytes32" },
          { name: "payer", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "kind", type: "uint8" },
        ],
      },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
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
          { name: "status", type: "uint8" },
          { name: "openTxHash", type: "bytes32" },
          { name: "closeTxHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "CreditOpened",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "deposit", type: "uint256", indexed: false },
      { name: "credit", type: "uint256", indexed: false },
      { name: "txHash", type: "bytes32", indexed: true },
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
    name: "CreditClosed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "txHash", type: "bytes32", indexed: true },
    ],
  },
] as const;
