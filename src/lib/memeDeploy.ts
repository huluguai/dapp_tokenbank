import {
  type Address,
  type TransactionReceipt,
  decodeEventLog,
} from "viem";
import { readContract } from "viem/actions";
import type { Config } from "wagmi";
import { getPublicClient } from "wagmi/actions";
import {
  MEME_FACTORY_ABI,
  MEME_FACTORY_ADDRESS,
  MEME_TOKEN_ABI,
} from "@/contracts/meme";

/**
 * 从 deployMeme 交易收据中解析新部署的 MemeToken 代理地址：
 * 匹配 MemeToken `Initialized(uint64)`，并用 `FACTORY` 等于本厂地址过滤误报。
 */
export async function parseMemeTokenFromDeployReceipt(
  wagmiConfig: Config,
  receipt: TransactionReceipt,
): Promise<Address> {
  const client = getPublicClient(wagmiConfig);
  if (!client) {
    throw new Error("无法获取公共客户端，请检查 wagmi 配置与网络。");
  }

  const candidates: Address[] = [];

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: MEME_TOKEN_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "Initialized") {
        candidates.push(log.address as Address);
      }
    } catch {
      continue;
    }
  }

  const matches: Address[] = [];
  for (const addr of candidates) {
    try {
      const factory = await readContract(client, {
        address: addr,
        abi: MEME_TOKEN_ABI,
        functionName: "FACTORY",
      });
      if (
        typeof factory === "string" &&
        factory.toLowerCase() === MEME_FACTORY_ADDRESS.toLowerCase()
      ) {
        matches.push(addr);
      }
    } catch {
      continue;
    }
  }

  const token =
    matches.length > 0 ? matches[matches.length - 1] : undefined;

  if (!token) {
    throw new Error(
      "收据中未找到符合条件的 MemeToken Initialized 日志（已用 FACTORY 地址校验）。请确认交易已成功且由当前工厂部署。",
    );
  }

  const ok = await readContract(client, {
    address: MEME_FACTORY_ADDRESS,
    abi: MEME_FACTORY_ABI,
    functionName: "isMeme",
    args: [token],
  });

  if (!ok) {
    throw new Error(
      "解析到的代币地址未通过工厂 isMeme 校验，已中止写入列表。",
    );
  }

  return token;
}
