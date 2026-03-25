import type { Abi } from "viem";
import MemeFactoryJson from "@/abi/MemeFactory.json";
import MemeTokenJson from "@/abi/MemeToken.json";

export const MEME_FACTORY_ADDRESS =
  "0xe59a723aB198aF185c970957386faf4e27cBAd63" as const;

/** 实现合约（文档 / 调试展示） */
export const MEME_TOKEN_IMPLEMENTATION =
  "0x8f628fcB6986aBDe79b0a1952d573c9364ae22E3" as const;

export const MEME_PROJECT_RECIPIENT =
  "0xfd8890Be36244f4270602B1F46717882c5ffDf47" as const;

export const MEME_FACTORY_ABI = MemeFactoryJson as Abi;
export const MEME_TOKEN_ABI = MemeTokenJson as Abi;
