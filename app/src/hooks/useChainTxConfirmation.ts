"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient, useWaitForTransactionReceipt } from "wagmi";
import type { Hex } from "viem";

/** Wait for a tx receipt on a specific chain (wagmi + direct RPC fallback). */
export function useChainTxConfirmation(chainId: number) {
  const client = usePublicClient({ chainId });
  const [hash, setHash] = useState<Hex | undefined>();
  const [confirmed, setConfirmed] = useState(false);

  const { isSuccess, isError } = useWaitForTransactionReceipt({
    hash,
    chainId,
    confirmations: 1,
    pollingInterval: 2_000,
    query: { enabled: Boolean(hash) && !confirmed },
  });

  const tryConfirm = useCallback(
    async (h: Hex) => {
      if (!client) return false;
      try {
        const receipt = await client.getTransactionReceipt({ hash: h });
        if (receipt.status === "success") {
          setConfirmed(true);
          return true;
        }
        if (receipt.status === "reverted") return false;
      } catch {
        /* not mined yet */
      }
      return false;
    },
    [client],
  );

  const track = useCallback(
    (h: Hex) => {
      setHash(h);
      setConfirmed(false);
      void tryConfirm(h);
    },
    [tryConfirm],
  );

  const reset = useCallback(() => {
    setHash(undefined);
    setConfirmed(false);
  }, []);

  useEffect(() => {
    if (isSuccess && hash) setConfirmed(true);
  }, [isSuccess, hash]);

  useEffect(() => {
    if (!hash || confirmed || !client) return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < 30 && !cancelled; i++) {
        if (await tryConfirm(hash)) return;
        await new Promise((r) => setTimeout(r, 2_000));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hash, confirmed, client, tryConfirm]);

  return { hash, confirmed, track, reset, confirmError: isError };
}
