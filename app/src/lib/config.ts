export const config = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  demoBanner: process.env.NEXT_PUBLIC_DEMO_BANNER !== "false",
  sepoliaRpc: process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "",
  creditcoinRpc: process.env.NEXT_PUBLIC_CREDITCOIN_RPC ?? "",
  paymentChainId: Number(process.env.NEXT_PUBLIC_CHAIN_PAYMENT_ID ?? 11155111),
  creditChainId: Number(process.env.NEXT_PUBLIC_CHAIN_CREDIT_ID ?? 102031),
  paymentAddress: (process.env.NEXT_PUBLIC_PAYMENT_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
  creditLineAddress: (process.env.NEXT_PUBLIC_CREDITLINE_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
  verifierAddress: (process.env.NEXT_PUBLIC_VERIFIER_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
  proverUrl: process.env.NEXT_PUBLIC_PROVER_URL ?? "",
  explorerSepolia: process.env.NEXT_PUBLIC_EXPLORER_SEPOLIA ?? "https://sepolia.etherscan.io",
  explorerCreditcoin:
    process.env.NEXT_PUBLIC_EXPLORER_CREDITCOIN ?? "https://creditcoin-testnet.blockscout.com",
  walletConnectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID ?? "",
};

export function isConfigured() {
  return (
    config.paymentAddress !== "0x0000000000000000000000000000000000000000" &&
    config.creditLineAddress !== "0x0000000000000000000000000000000000000000"
  );
}
