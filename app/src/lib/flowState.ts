"use client";

import type { Hex } from "viem";

type PayFlowState = {
  txHash: Hex;
  amount: string;
  balanceTxHash?: Hex;
  attestedBalanceWei?: string;
  creditTx?: Hex;
  step: 2 | 3 | 4;
  updatedAt: number;
};

type RepayFlowState = {
  txHash: Hex;
  amount: string;
  creditTx?: Hex;
  step: 2 | 3 | 4;
  updatedAt: number;
};

const PAY_KEY = "spark.pay.flow.v1";
const REPAY_KEY = "spark.repay.flow.v1";
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T & { updatedAt?: number };
    if (!parsed?.updatedAt || Date.now() - parsed.updatedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadPayFlow(address: string): PayFlowState | null {
  const all = readJson<Record<string, PayFlowState>>(PAY_KEY);
  return all?.[address.toLowerCase()] ?? null;
}

export function savePayFlow(address: string, state: Omit<PayFlowState, "updatedAt">) {
  const all = readJson<Record<string, PayFlowState>>(PAY_KEY) ?? {};
  all[address.toLowerCase()] = { ...state, updatedAt: Date.now() };
  writeJson(PAY_KEY, all);
}

export function clearPayFlow(address: string) {
  const all = readJson<Record<string, PayFlowState>>(PAY_KEY);
  if (!all) return;
  delete all[address.toLowerCase()];
  writeJson(PAY_KEY, all);
}

export function loadRepayFlow(address: string): RepayFlowState | null {
  const all = readJson<Record<string, RepayFlowState>>(REPAY_KEY);
  return all?.[address.toLowerCase()] ?? null;
}

export function saveRepayFlow(address: string, state: Omit<RepayFlowState, "updatedAt">) {
  const all = readJson<Record<string, RepayFlowState>>(REPAY_KEY) ?? {};
  all[address.toLowerCase()] = { ...state, updatedAt: Date.now() };
  writeJson(REPAY_KEY, all);
}

export function clearRepayFlow(address: string) {
  const all = readJson<Record<string, RepayFlowState>>(REPAY_KEY);
  if (!all) return;
  delete all[address.toLowerCase()];
  writeJson(REPAY_KEY, all);
}
