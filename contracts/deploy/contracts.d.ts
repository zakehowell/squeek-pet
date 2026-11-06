// Types for contracts.js, which contracts/scripts/export.cjs writes (npm run export in contracts/).
import type { JsonFragment } from "ethers";

export type ContractName = "SqbToken" | "SqbMinter" | "WorldShop" | "SqkFaucet";

export declare const CONTRACTS: Record<ContractName, { abi: readonly JsonFragment[]; bytecode: string }>;
