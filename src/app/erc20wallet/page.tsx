"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useAccount, useChainId, useReadContract, useConnect, useDisconnect } from "wagmi";

import { ERC20_ABI } from "@/contracts/erc20";
import { INDEXED_TOKEN_ADDRESS } from "@/contracts/indexedToken";
import { useAuth } from "@/components/auth-provider";
import { fetchTransfers, type TransferItem } from "@/lib/backend";

function formatAddress(addr: string) {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatAmount(amount: string, decimals: number) {
  try {
    return formatUnits(BigInt(amount), decimals);
  } catch {
    return amount;
  }
}

function TxLink({ chainId, txHash }: { chainId: number; txHash: string }) {
  const isSepolia = chainId === 11155111;
  const host = isSepolia ? "https://sepolia.etherscan.io" : "https://etherscan.io";
  return (
    <a
      href={`${host}/tx/${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-emerald-300 hover:underline break-all"
      title={txHash}
    >
      {formatAddress(txHash)}
    </a>
  );
}

export default function Erc20WalletPage() {
  const chainId = useChainId();
  const { address, status } = useAccount();
  const isConnected = status === "connected";
  const { connect, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();

  const { jwt, isLoggingIn, error: authError, login, logout } = useAuth();

  const { data: tokenName } = useReadContract({
    address: INDEXED_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "name",
  });
  const { data: tokenSymbol } = useReadContract({
    address: INDEXED_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "symbol",
  });
  const { data: tokenDecimals } = useReadContract({
    address: INDEXED_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "decimals",
  });
  const { data: balance } = useReadContract({
    address: INDEXED_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const decimals = Number(tokenDecimals ?? 18);
  const symbol = (tokenSymbol as string) ?? "TOKEN";
  const name = (tokenName as string) ?? "ERC20";

  const transfersQuery = useInfiniteQuery({
    queryKey: ["transfers", jwt],
    enabled: Boolean(jwt),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      return fetchTransfers({ jwt: jwt!, limit: 50, cursor: pageParam });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items: TransferItem[] = useMemo(() => {
    const pages = transfersQuery.data?.pages ?? [];
    return pages.flatMap((p) => p.items);
  }, [transfersQuery.data]);

  const isAuthed = Boolean(jwt);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <header className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-slate-400 transition hover:text-white">
              ← 返回
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">ERC20 钱包</h1>
          </div>
          <div className="flex items-center gap-3">
            {chainId ? (
              <span className="rounded-full bg-slate-700/60 px-3 py-1 text-sm">
                Chain ID: {chainId}
              </span>
            ) : null}
            {isConnected ? (
              <>
                {address ? (
                  <span className="hidden font-mono text-sm text-slate-300 sm:inline">
                    {formatAddress(address)}
                  </span>
                ) : null}
                <button
                  onClick={() => {
                    logout();
                    disconnect();
                  }}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium transition hover:bg-rose-500"
                >
                  断开连接
                </button>
              </>
            ) : (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                disabled={isConnectPending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {isConnectPending ? "连接中..." : "连接钱包"}
              </button>
            )}
          </div>
        </header>

        <div className="rounded-2xl border border-slate-600/50 bg-slate-800/40 p-8 shadow-xl backdrop-blur space-y-8">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-slate-700/50 p-4 md:col-span-2">
              <p className="text-sm text-slate-400">Token</p>
              <p className="mt-1 text-xl font-semibold">
                {name} <span className="text-slate-300">({symbol})</span>
              </p>
              <p className="mt-2 text-sm text-slate-400">
                合约地址:{" "}
                <a
                  href="https://sepolia.etherscan.io/address/0x0b18F517d8e66b3bd6fB799d44A0ebee473Df20C"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-emerald-300 hover:underline break-all"
                >
                  {INDEXED_TOKEN_ADDRESS}
                </a>
              </p>
              <p className="mt-1 text-sm text-slate-400">
                decimals: <span className="font-mono">{decimals}</span>
              </p>
            </div>
            <div className="rounded-xl bg-slate-700/50 p-4">
              <p className="text-sm text-slate-400">余额</p>
              <p className="mt-2 text-2xl font-bold">
                {balance !== undefined && address
                  ? `${formatUnits(balance as bigint, decimals)} ${symbol}`
                  : "-"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                余额读取自链上 `balanceOf`。
              </p>
            </div>
          </section>

          <section className="border-t border-slate-700/60 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">SIWE 登录</h2>
                <p className="mt-1 text-sm text-slate-400">
                  登录后才能查询你的转账记录（后端按登录地址过滤）。
                </p>
              </div>
              <div className="flex items-center gap-3">
                {isAuthed ? (
                  <>
                    <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm text-emerald-200 border border-emerald-500/30">
                      已登录
                    </span>
                    <button
                      onClick={() => logout()}
                      className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium transition hover:bg-slate-600"
                    >
                      退出登录
                    </button>
                  </>
                ) : (
                  <button
                    onClick={async () => {
                      if (!address) return;
                      await login({ address });
                    }}
                    disabled={!isConnected || !address || isLoggingIn}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium transition hover:bg-sky-500 disabled:opacity-50"
                  >
                    {isLoggingIn ? "登录中..." : "SIWE 登录"}
                  </button>
                )}
              </div>
            </div>

            {!isConnected ? (
              <p className="mt-4 rounded-xl bg-slate-700/30 p-4 text-sm text-slate-400">
                请先连接钱包，再进行 SIWE 登录。
              </p>
            ) : null}

            {authError ? (
              <p className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/40 p-4 text-sm text-rose-200">
                {authError}
              </p>
            ) : null}
          </section>

          <section className="border-t border-slate-700/60 pt-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">转账记录</h2>
                <p className="mt-1 text-sm text-slate-400">
                  按 blockNumber/logIndex 倒序分页（cursor 透传）。
                </p>
              </div>
              <button
                onClick={() => transfersQuery.refetch()}
                disabled={!isAuthed || transfersQuery.isFetching}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium transition hover:bg-slate-600 disabled:opacity-50"
              >
                {transfersQuery.isFetching ? "刷新中..." : "刷新"}
              </button>
            </div>

            {!isAuthed ? (
              <p className="mt-4 rounded-xl bg-slate-700/30 p-4 text-sm text-slate-400">
                请先完成 SIWE 登录。
              </p>
            ) : transfersQuery.isLoading ? (
              <p className="mt-4 text-sm text-slate-400">加载中...</p>
            ) : transfersQuery.isError ? (
              <p className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/40 p-4 text-sm text-rose-200">
                {(transfersQuery.error as Error).message}
              </p>
            ) : items.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">暂无转账记录。</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700/60">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-900/60 text-slate-300">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">区块</th>
                      <th className="px-4 py-3 text-left font-semibold">Tx</th>
                      <th className="px-4 py-3 text-left font-semibold">From</th>
                      <th className="px-4 py-3 text-left font-semibold">To</th>
                      <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {items.map((it, idx) => (
                      <tr key={`${it.txHash}-${it.logIndex}-${idx}`} className="bg-slate-800/30">
                        <td className="px-4 py-3 font-mono text-slate-200">
                          {it.blockNumber}
                          <span className="text-slate-500">#{it.logIndex}</span>
                        </td>
                        <td className="px-4 py-3">
                          <TxLink chainId={chainId} txHash={it.txHash} />
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">
                          {formatAddress(it.from)}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">
                          {formatAddress(it.to)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-100">
                          {formatAmount(it.amount, decimals)} {symbol}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isAuthed && transfersQuery.hasNextPage ? (
              <div className="mt-4">
                <button
                  onClick={() => transfersQuery.fetchNextPage()}
                  disabled={transfersQuery.isFetchingNextPage}
                  className="w-full rounded-lg bg-emerald-600 px-6 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {transfersQuery.isFetchingNextPage ? "加载中..." : "加载更多"}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

