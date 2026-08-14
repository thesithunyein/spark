/** Map wallet / RPC errors to short, user-facing copy. */
export function friendlyError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Something went wrong";
  const msg = raw.toLowerCase();

  if (
    msg.includes("user rejected") ||
    msg.includes("rejected the request") ||
    msg.includes("denied transaction") ||
    msg.includes("4001") ||
    msg.includes("action_rejected")
  ) {
    return "You cancelled the wallet request.";
  }

  if (msg.includes("insufficient funds") || msg.includes("insufficient balance")) {
    if (msg.includes("creditcoin") || msg.includes("102031")) {
      return "Not enough CTC for gas on Creditcoin. Use the Discord faucet, then retry.";
    }
    return "Not enough funds for gas + value. Get Sepolia ETH (or CTC on Creditcoin) and retry.";
  }

  if (msg.includes("wrong network") || msg.includes("chain mismatch") || msg.includes("unrecognized chain")) {
    return "Wrong network. Switch to Sepolia to pay, or Creditcoin to open credit.";
  }

  if (
    msg.includes("does not match the target chain") ||
    msg.includes("current chain of the wallet")
  ) {
    return "Wallet is on the wrong network. Approve switching to Creditcoin testnet in MetaMask, then click Retry verify.";
  }

  if (
    msg.includes("unsupported chain") ||
    (msg.includes("chain id") && msg.includes("support")) ||
    msg.includes("selected network is not supported")
  ) {
    return "This wallet doesn’t support Sepolia or Creditcoin testnet. Use MetaMask.";
  }

  if (msg.includes("switch") && msg.includes("chain")) {
    return "Please approve the network switch in your wallet.";
  }

  if (msg.includes("connector not found") || msg.includes("no provider") || msg.includes("provider not found")) {
    return "No wallet found. Install the MetaMask browser extension.";
  }

  if (
    msg.includes("timeout") &&
    (msg.includes("attest") || msg.includes("height") || msg.includes("wait"))
  ) {
    return "Still verifying. Tap Retry — don't pay again.";
  }

  if (
    msg.includes("rpc timeout") ||
    msg.includes("timeout") ||
    msg.includes("block range") ||
    msg.includes("query returned more than") ||
    msg.includes("too many results")
  ) {
    return "Sepolia RPC timed out scanning payment history. Wait a moment and scan again.";
  }

  if (
    msg.includes("contract not deployed") ||
    msg.includes("contract code is empty") ||
    msg.includes("address is not a contract") ||
    msg.includes("payment contract not configured") ||
    msg.includes("creditline not configured")
  ) {
    return "Contracts are not configured yet.";
  }

  if (msg.includes("already used") || msg.includes("usedtx")) {
    return "This Sepolia payment was already used on Creditcoin.";
  }

  if (msg.includes("active credit") || msg.includes("already open")) {
    return "You already have an active credit line.";
  }

  if (msg.includes("reverted") && msg.includes("proof")) {
    return "Proof failed on-chain. Tap Retry.";
  }

  // Strip viem noise / keep first useful sentence
  const clean = raw
    .replace(/Details:[\s\S]*/i, "")
    .replace(/Version:[\s\S]*/i, "")
    .replace(/Docs:[\s\S]*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length > 160) return `${clean.slice(0, 157)}…`;
  return clean || "Transaction failed. Try again.";
}
