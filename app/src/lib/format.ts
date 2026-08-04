import { encodeAbiParameters, type Hex } from "viem";

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

/** Structured proof matching PaymentVerifier abi.encode layout */
export function encodePaymentProof(params: {
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

export type ActivityItem = {
  id: string;
  type: string;
  amount?: string;
  status: string;
  at: string;
  href?: string;
};
