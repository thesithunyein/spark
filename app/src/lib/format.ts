import { encodeAbiParameters, parseEther, type Hex } from "viem";

export type PaymentKind = 1 | 2;

export function statusLabel(status: number) {
  if (status === 1) return "Active";
  if (status === 2) return "Closed";
  return "None";
}

export function formatEth(wei: bigint, digits = 4) {
  const n = Number(wei) / 1e18;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function shortHash(h: string) {
  if (!h || h.length < 12) return h;
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

/** Mock / structured proof matching MockPaymentVerifier abi.encode layout */
export function encodeMockProof(params: {
  txHash: Hex;
  payer: `0x${string}`;
  amountWei: bigint;
  kind: PaymentKind;
}): Hex {
  return encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint8" },
    ],
    [params.txHash, params.payer, params.amountWei, params.kind],
  );
}

export function defaultDemoAmount() {
  return parseEther("0.01");
}

export type ActivityItem = {
  id: string;
  type: "Deposit" | "Repayment" | "Credit opened" | "Credit closed";
  amount?: string;
  status: "Pending" | "Confirming" | "Confirmed" | "Completed";
  at: string;
  href?: string;
};
