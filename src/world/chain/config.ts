import { isAddress, type Hex } from "./codec";

// Where Squeek Pet World's contracts live. The page around the World (the
// site's /world/ page) passes this in once the project owner has deployed
// them; without it the World stays the read-only game it was.

export const SEPOLIA_CHAIN_ID = 11155111;

/** What wallets need to add Sepolia when they don't know it yet (EIP-3085). */
export const SEPOLIA_PARAMS = {
  chainId: "0xaa36a7",
  chainName: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
} as const;

export interface ChainConfig {
  chainId: number;
  /** A public JSON-RPC endpoint for reads; the page's CSP must allow it. */
  rpcUrl: string;
  explorer: string;
  /** Official Squeekchain contracts. */
  core: Hex;
  sqk: Hex;
  /** Squeek Pet World's own contracts. */
  sqb: Hex;
  minter: Hex;
  shop: Hex;
  /** The testnet SQK faucet, if one was deployed. */
  faucet: Hex | null;
}

const lower = (value: string) => value.toLowerCase() as Hex;

/** A checked copy of `value`, or null if it isn't a complete deployment. */
export function readChainConfig(value: unknown): ChainConfig | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const chainId = Number(v.chainId ?? SEPOLIA_CHAIN_ID);
  if (chainId !== SEPOLIA_CHAIN_ID) return null;
  // HTTPS, or a node on this computer for development (contracts/scripts/local-world.cjs).
  const rpcUrl = typeof v.rpcUrl === "string" && /^(https:\/\/[^\s]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[^\s]*)?)$/.test(v.rpcUrl) ? v.rpcUrl : null;
  const explorer = typeof v.explorer === "string" && /^https:\/\/[^\s]+$/.test(v.explorer) ? v.explorer.replace(/\/$/, "") : "https://sepolia.etherscan.io";
  const required = ["core", "sqk", "sqb", "minter", "shop"] as const;
  if (!rpcUrl || required.some((key) => !isAddress(v[key]))) return null;
  if (v.faucet != null && !isAddress(v.faucet)) return null;
  return {
    chainId,
    rpcUrl,
    explorer,
    core: lower(v.core as string),
    sqk: lower(v.sqk as string),
    sqb: lower(v.sqb as string),
    minter: lower(v.minter as string),
    shop: lower(v.shop as string),
    faucet: v.faucet ? lower(v.faucet as string) : null,
  };
}

export const txUrl = (config: ChainConfig, hash: string) => `${config.explorer}/tx/${hash}`;
export const addressUrl = (config: ChainConfig, address: string) => `${config.explorer}/address/${address}`;
export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
