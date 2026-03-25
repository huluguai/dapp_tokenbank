import {
  createWalletClient,
  custom,
  type Address,
  type Chain,
  type EIP1193Provider,
} from "viem";

type MinimalEip1193 = Pick<EIP1193Provider, "request">;

/**
 * 使用 AppKit 返回的 EIP-1193 provider 构造 Viem WalletClient，
 * 绕过 wagmi 在部分连接方式下 connector 缺少 getChainId 的问题。
 */
export function createWalletClientFromAppKit(
  provider: MinimalEip1193,
  args: { account: Address; chain: Chain },
) {
  return createWalletClient({
    account: args.account,
    chain: args.chain,
    transport: custom(provider),
  });
}
