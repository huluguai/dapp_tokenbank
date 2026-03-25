"use client";

import { useEffect, useMemo, useState } from "react";
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
      className="break-all font-mono text-sol-mint hover:underline"
      title={txHash}
    >
      {formatAddress(txHash)}
    </a>
  );
}

export default function Erc20WalletPage() {
  const chainId = useChainId();
  /** wagmi chainId 在 SSR 与首帧客户端常不一致，挂载后再展示真实值，避免 hydration mismatch */
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

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
    <div className="solana-page">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <header className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-sol-muted transition hover:text-sol-mint"
            >
              ← 返回
            </Link>
            <h1 className="bg-gradient-to-r from-sol-mint to-sol-purple bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              ERC20 钱包
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-sol-purple/35 bg-sol-purple/15 px-3 py-1 text-xs font-medium text-sol-mint/90">
              Chain ID:{" "}
              {hasMounted && chainId != null ? chainId : "—"}
            </span>
            {isConnected ? (
              <>
                {address ? (
                  <span className="hidden font-mono text-sm text-sol-muted sm:inline">
                    {formatAddress(address)}
                  </span>
                ) : null}
                <button
                  onClick={() => {
                    logout();
                    disconnect();
                  }}
                  className="rounded-xl border border-rose-500/45 bg-rose-950/45 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-900/55"
                >
                  断开连接
                </button>
              </>
            ) : (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                disabled={isConnectPending}
                className="rounded-xl bg-sol-mint px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_0_24px_-4px_rgba(20,241,149,0.45)] transition hover:brightness-110 disabled:opacity-50"
              >
                {isConnectPending ? "连接中..." : "连接钱包"}
              </button>
            )}
          </div>
        </header>

        <div className="solana-panel space-y-8 p-8 shadow-xl">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="solana-stat p-4 md:col-span-2">
              <p className="text-sm text-sol-muted">Token</p>
              <p className="mt-1 text-xl font-semibold text-sol-ink">
                {name} <span className="text-sol-muted">({symbol})</span>
              </p>
              <p className="mt-2 text-sm text-sol-muted">
                合约地址:{" "}
                <a
                  href="https://sepolia.etherscan.io/address/0x0b18F517d8e66b3bd6fB799d44A0ebee473Df20C"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-mono text-sol-mint hover:underline"
                >
                  {INDEXED_TOKEN_ADDRESS}
                </a>
              </p>
              <p className="mt-1 text-sm text-sol-muted">
                decimals: <span className="font-mono text-sol-ink">{decimals}</span>
              </p>
            </div>
            <div className="solana-stat p-4">
              <p className="text-sm text-sol-muted">余额</p>
              <p className="mt-2 text-2xl font-bold text-sol-ink">
                {balance !== undefined && address
                  ? `${formatUnits(balance as bigint, decimals)} ${symbol}`
                  : "-"}
              </p>
              <p className="mt-1 text-xs text-sol-muted/80">
                余额读取自链上 `balanceOf`。
              </p>
            </div>
          </section>

          <section className="border-t border-white/10 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-sol-ink">SIWE 登录</h2>
                <p className="mt-1 text-sm text-sol-muted">
                  登录后才能查询你的转账记录（后端按登录地址过滤）。
                </p>
              </div>
              <div className="flex items-center gap-3">
                {isAuthed ? (
                  <>
                    <span className="rounded-full border border-sol-mint/35 bg-sol-mint/12 px-3 py-1 text-sm text-teal-100">
                      已登录
                    </span>
                    <button
                      onClick={() => logout()}
                      className="rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm font-medium text-sol-ink transition hover:bg-white/10"
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
                    className="rounded-xl border border-sol-purple/45 bg-sol-purple/25 px-4 py-2 text-sm font-semibold text-violet-100 shadow-[0_0_18px_-6px_rgba(153,69,255,0.45)] transition hover:bg-sol-purple/35 disabled:opacity-50"
                  >
                    {isLoggingIn ? "登录中..." : "SIWE 登录"}
                  </button>
                )}
              </div>
            </div>

            {!isConnected ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-sol-muted">
                请先连接钱包，再进行 SIWE 登录。
              </p>
            ) : null}

            {authError ? (
              <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/35 p-4 text-sm text-rose-100">
                {authError}
              </p>
            ) : null}
          </section>

          <section className="border-t border-white/10 pt-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-sol-ink">转账记录</h2>
                <p className="mt-1 text-sm text-sol-muted">
                  按 blockNumber/logIndex 倒序分页（cursor 透传）。
                </p>
              </div>
              <button
                onClick={() => transfersQuery.refetch()}
                disabled={!isAuthed || transfersQuery.isFetching}
                className="rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm font-medium text-sol-ink transition hover:bg-white/10 disabled:opacity-50"
              >
                {transfersQuery.isFetching ? "刷新中..." : "刷新"}
              </button>
            </div>

            {!isAuthed ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-sol-muted">
                请先完成 SIWE 登录。
              </p>
            ) : transfersQuery.isLoading ? (
              <p className="mt-4 text-sm text-sol-muted">加载中...</p>
            ) : transfersQuery.isError ? (
              <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/35 p-4 text-sm text-rose-100">
                {(transfersQuery.error as Error).message}
              </p>
            ) : items.length === 0 ? (
              <p className="mt-4 text-sm text-sol-muted">暂无转账记录。</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-black/40 text-sol-muted">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-sol-ink">区块</th>
                      <th className="px-4 py-3 text-left font-semibold text-sol-ink">Tx</th>
                      <th className="px-4 py-3 text-left font-semibold text-sol-ink">From</th>
                      <th className="px-4 py-3 text-left font-semibold text-sol-ink">To</th>
                      <th className="px-4 py-3 text-right font-semibold text-sol-ink">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {items.map((it, idx) => (
                      <tr key={`${it.txHash}-${it.logIndex}-${idx}`} className="bg-black/15">
                        <td className="px-4 py-3 font-mono text-sol-ink">
                          {it.blockNumber}
                          <span className="text-sol-muted">#{it.logIndex}</span>
                        </td>
                        <td className="px-4 py-3">
                          <TxLink chainId={chainId} txHash={it.txHash} />
                        </td>
                        <td className="px-4 py-3 font-mono text-sol-muted">
                          {formatAddress(it.from)}
                        </td>
                        <td className="px-4 py-3 font-mono text-sol-muted">
                          {formatAddress(it.to)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sol-ink">
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
                  className="w-full rounded-xl bg-sol-mint px-6 py-3 font-semibold text-slate-950 shadow-[0_0_24px_-6px_rgba(20,241,149,0.45)] transition hover:brightness-110 disabled:opacity-50"
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

