import type { Abi } from "viem";
import flashArbitrageJson from "@/abis/FlashArbitrage.json";
import uniswapV2RouterJson from "@/abis/UniswapV2Router02.min.json";
import uniswapV2FactoryJson from "@/abis/UniswapV2Factory.min.json";
import uniswapV2PairJson from "@/abis/UniswapV2Pair.min.json";
import erc20Json from "@/abis/ERC20.min.json";

/** Sepolia 测试网部署（与用户提供的测试合约一致） */
export const FLASH_SEPOLIA_CHAIN_ID = 11155111 as const;

export const FLASH_ARBITRAGE_ADDRESS =
  "0xA113c18936d6a69e16Dd5E1465d70941FeE685C1" as const;

export const FLASH_WETH9_ADDRESS =
  "0x5744F6c8B066586cC81f79a57F99C0E5bfFDBB80" as const;

export const FLASH_FACTORY_A_ADDRESS =
  "0xA992946db59DB076AD2923813201e520b2954eFd" as const;

export const FLASH_FACTORY_B_ADDRESS =
  "0xC72C23f02965767146D136281B7198b993e5b29b" as const;

export const FLASH_ROUTER_A_ADDRESS =
  "0x0a9166CD91887C82470F9Bf84cdA2847874f74aB" as const;

export const FLASH_ROUTER_B_ADDRESS =
  "0xf0e6b664320EFa0c58214D1711d505286F8d0B40" as const;

export const FLASH_TOKEN_A_ADDRESS =
  "0xEdf9aE07B14bf73AD3bE3016a59de16A6c4369E7" as const;

export const FLASH_TOKEN_B_ADDRESS =
  "0x6F8f3c1672ff6Dd62EfF801C4662a41fCE2490c3" as const;

export const FLASH_PAIR_A_ADDRESS =
  "0x0ef706287fa6b83752deA17fa6106bdf08208706" as const;

export const FLASH_ARBITRAGE_ABI = flashArbitrageJson as Abi;
export const FLASH_ROUTER_ABI = uniswapV2RouterJson as Abi;
export const FLASH_FACTORY_ABI = uniswapV2FactoryJson as Abi;
export const FLASH_PAIR_ABI = uniswapV2PairJson as Abi;
export const FLASH_ERC20_ABI = erc20Json as Abi;

export const FLASH_BLOCK_EXPLORER = "https://sepolia.etherscan.io";
