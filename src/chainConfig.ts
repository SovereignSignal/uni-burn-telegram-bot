import {
  type Address,
  type Chain,
} from "viem";
import {
  mainnet,
  arbitrum,
  base,
  optimism,
  celo,
  zora,
  worldchain,
  soneium,
  xLayer,
  unichain,
} from "viem/chains";

export interface ChainConfig {
  id: string;
  name: string;
  chainId: number;
  viemChain: Chain;
  alchemySlug: string;
  tokenAddress: Address;
  tokenDecimals: number;
  firepitAddress: Address;       // Ethereum: Firepit contract. L2s: Releaser contract (bridges UNI back to mainnet for burning)
  burnAddress: Address;          // 0xdead — direct burns
  explorerUrl: string;
  explorerName: string;
  deploymentBlock: bigint;
  blockTimeSeconds: number;
  maxBlocksPerQuery: bigint;
  enabled: boolean;
}

const DEAD_ADDRESS: Address = "0x000000000000000000000000000000000000dEaD";

// Contract addresses sourced from: https://github.com/Uniswap/protocol-fees
// UNI token addresses sourced from deployment scripts in the same repo

export const CHAIN_REGISTRY: Record<string, ChainConfig> = {
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    chainId: 1,
    viemChain: mainnet,
    alchemySlug: "eth-mainnet",
    tokenAddress: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    tokenDecimals: 18,
    firepitAddress: "0x0D5Cd355e2aBEB8fb1552F56c965B867346d6721",  // Releaser (Firepit)
    burnAddress: DEAD_ADDRESS,
    explorerUrl: "https://etherscan.io",
    explorerName: "Etherscan",
    deploymentBlock: 24028203n,  // Firepit deployed Dec 16, 2025
    blockTimeSeconds: 12,
    maxBlocksPerQuery: 9n,       // Alchemy free tier: 10 blocks inclusive
    enabled: true,
  },
  unichain: {
    id: "unichain",
    name: "Unichain",
    chainId: 130,
    viemChain: unichain,
    alchemySlug: "unichain-mainnet",
    tokenAddress: "0x8f187aA05619a017077f5308904739877ce9eA21",     // Native Bridge UNI
    tokenDecimals: 18,
    firepitAddress: "0xe0A780E9105aC10Ee304448224Eb4A2b11A77eeB",   // OptimismBridgedResourceFirepit (Releaser)
    burnAddress: DEAD_ADDRESS,
    explorerUrl: "https://uniscan.xyz",
    explorerName: "Uniscan",
    deploymentBlock: 1n,
    blockTimeSeconds: 2,
    maxBlocksPerQuery: 1000n,
    enabled: false,
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum",
    chainId: 42161,
    viemChain: arbitrum,
    alchemySlug: "arb-mainnet",
    tokenAddress: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",     // Bridged UNI on Arbitrum
    tokenDecimals: 18,
    firepitAddress: "0xB8018422bcE25D82E70cB98FdA96a4f502D89427",   // ArbitrumBridgedResourceFirepit (Releaser)
    burnAddress: DEAD_ADDRESS,
    explorerUrl: "https://arbiscan.io",
    explorerName: "Arbiscan",
    deploymentBlock: 1n,
    blockTimeSeconds: 0.25,
    maxBlocksPerQuery: 10000n,
    enabled: false,
  },
  base: {
    id: "base",
    name: "Base",
    chainId: 8453,
    viemChain: base,
    alchemySlug: "base-mainnet",
    tokenAddress: "0xc3De830EA07524a0761646a6a4e4be0e114a3C83",     // Bridged UNI on Base
    tokenDecimals: 18,
    firepitAddress: "0xFf77c0ED0b6b13A20446969107E5867abc46f53a",   // OptimismBridgedResourceFirepit (Releaser)
    burnAddress: DEAD_ADDRESS,
    explorerUrl: "https://basescan.org",
    explorerName: "Basescan",
    deploymentBlock: 1n,
    blockTimeSeconds: 2,
    maxBlocksPerQuery: 1000n,
    enabled: false,
  },
  optimism: {
    id: "optimism",
    name: "OP Mainnet",
    chainId: 10,
    viemChain: optimism,
    alchemySlug: "opt-mainnet",
    tokenAddress: "0x6fd9d7AD17242c41f7131d257212c54A0e816691",     // Bridged UNI on OP Mainnet
    tokenDecimals: 18,
    firepitAddress: "0x94460443Ca27FFC1baeCa61165fde18346C91AbD",   // OptimismBridgedResourceFirepit (Releaser)
    burnAddress: DEAD_ADDRESS,
    explorerUrl: "https://optimistic.etherscan.io",
    explorerName: "OP Etherscan",
    deploymentBlock: 1n,
    blockTimeSeconds: 2,
    maxBlocksPerQuery: 1000n,
    enabled: false,
  },

  // === Chains below have fee infrastructure deployed but UNI not yet bridged ===
  // Token addresses will be set once OptimismMintableERC20Factory creates the bridged UNI.
  // See: https://github.com/Uniswap/protocol-fees deployment scripts

  worldchain: {
    id: "worldchain",
    name: "World Chain",
    chainId: 480,
    viemChain: worldchain,
    alchemySlug: "worldchain-mainnet",
    tokenAddress: "0x0000000000000000000000000000000000000000",       // NOT YET DEPLOYED — awaiting bridge
    tokenDecimals: 18,
    firepitAddress: "0x455e844D286631566cF98D6cb2996149734618C6",   // Releaser
    burnAddress: DEAD_ADDRESS,
    explorerUrl: "https://worldscan.org",
    explorerName: "Worldscan",
    deploymentBlock: 1n,
    blockTimeSeconds: 2,
    maxBlocksPerQuery: 1000n,
    enabled: false,
  },
  celo: {
    id: "celo",
    name: "Celo",
    chainId: 42220,
    viemChain: celo,
    alchemySlug: "celo-mainnet",
    tokenAddress: "0x0000000000000000000000000000000000000000",       // NOT YET DEPLOYED — awaiting bridge
    tokenDecimals: 18,
    firepitAddress: "0x2758FbaA228D7d3c41dD139F47dab1a27bF9bc25",   // Releaser
    burnAddress: DEAD_ADDRESS,
    explorerUrl: "https://celoscan.io",
    explorerName: "Celoscan",
    deploymentBlock: 1n,
    blockTimeSeconds: 5,
    maxBlocksPerQuery: 1000n,
    enabled: false,
  },
  soneium: {
    id: "soneium",
    name: "Soneium",
    chainId: 1868,
    viemChain: soneium,
    alchemySlug: "soneium-mainnet",
    tokenAddress: "0x0000000000000000000000000000000000000000",       // NOT YET DEPLOYED — awaiting bridge
    tokenDecimals: 18,
    firepitAddress: "0xc9CC50A75cE2a5f88fa77B43e3b050480c731b6e",   // Releaser
    burnAddress: DEAD_ADDRESS,
    explorerUrl: "https://soneium.blockscout.com",
    explorerName: "Blockscout",
    deploymentBlock: 1n,
    blockTimeSeconds: 2,
    maxBlocksPerQuery: 1000n,
    enabled: false,
  },
  xlayer: {
    id: "xlayer",
    name: "X Layer",
    chainId: 196,
    viemChain: xLayer,
    alchemySlug: "xlayer-mainnet",
    tokenAddress: "0x0000000000000000000000000000000000000000",       // NOT YET DEPLOYED — awaiting bridge
    tokenDecimals: 18,
    firepitAddress: "0xe122E231cb52aea99690963Fd73E91e33E97468f",   // Releaser
    burnAddress: DEAD_ADDRESS,
    explorerUrl: "https://www.oklink.com/xlayer",
    explorerName: "OKLink",
    deploymentBlock: 1n,
    blockTimeSeconds: 2,
    maxBlocksPerQuery: 1000n,
    enabled: false,
  },
  zora: {
    id: "zora",
    name: "Zora",
    chainId: 7777777,
    viemChain: zora,
    alchemySlug: "zora-mainnet",
    tokenAddress: "0x0000000000000000000000000000000000000000",       // NOT YET DEPLOYED — awaiting bridge
    tokenDecimals: 18,
    firepitAddress: "0x2f98eD4D04e633169FbC941BFCc54E785853b143",   // Releaser
    burnAddress: DEAD_ADDRESS,
    explorerUrl: "https://explorer.zora.energy",
    explorerName: "Zora Explorer",
    deploymentBlock: 1n,
    blockTimeSeconds: 2,
    maxBlocksPerQuery: 1000n,
    enabled: false,
  },
};

export function getEnabledChains(enabledIds: string[]): ChainConfig[] {
  return enabledIds
    .map((id) => {
      const chain = CHAIN_REGISTRY[id];
      if (!chain) {
        console.warn(`[ChainConfig] Unknown chain: ${id}`);
        return null;
      }
      return chain;
    })
    .filter((c): c is ChainConfig => c !== null);
}

export function getChainConfig(id: string): ChainConfig | undefined {
  return CHAIN_REGISTRY[id];
}

export function getExplorerTxUrl(chain: ChainConfig, txHash: string): string {
  return `${chain.explorerUrl}/tx/${txHash}`;
}

export function getExplorerAddressUrl(chain: ChainConfig, address: string): string {
  return `${chain.explorerUrl}/address/${address}`;
}

export function getAlchemyRpcUrl(chain: ChainConfig, apiKey: string): string {
  return `https://${chain.alchemySlug}.g.alchemy.com/v2/${apiKey}`;
}
