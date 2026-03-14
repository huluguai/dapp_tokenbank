"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useConfig } from "wagmi";
import { useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { formatUnits } from "viem";
import { useState } from "react";
import {
  TOKENBANK_ADDRESS,
  TOKENBANK_ABI,
} from "@/contracts/tokenbank";
import { ERC20_ABI } from "@/contracts/erc20";

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function TokenBankPage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const config = useConfig();

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  // 读取 TokenBank 合约数据
  const { data: tokenAddress } = useReadContract({
    address: TOKENBANK_ADDRESS,
    abi: TOKENBANK_ABI,
    functionName: "token",
  });

  const { data: totalBalance, refetch: refetchTotal } = useReadContract({
    address: TOKENBANK_ADDRESS,
    abi: TOKENBANK_ABI,
    functionName: "getTotalBalance",
  });

  const { data: depositorsCount, refetch: refetchCount } = useReadContract({
    address: TOKENBANK_ADDRESS,
    abi: TOKENBANK_ABI,
    functionName: "getDepositorsCount",
  });

  const { data: userDeposit } = useReadContract({
    address: TOKENBANK_ADDRESS,
    abi: TOKENBANK_ABI,
    functionName: "getDepositBalance",
    args: address ? [address] : undefined,
  });

  // 读取 ERC20 Token 数据
  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  const { data: tokenSymbol } = useReadContract({
    address: tokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: "symbol",
  });

  const { data: userTokenBalance } = useReadContract({
    address: tokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const decimals = tokenDecimals ?? 18;

  // getDepositBalance/getTotalBalance 返回代币单位，需转换为 wei 再 formatUnits 显示
  const formatTokenUnits = (value: bigint | undefined) =>
    value !== undefined
      ? formatUnits(value * BigInt(10) ** BigInt(decimals), decimals)
      : "-";

  const { writeContractAsync, isPending: isWritePending } = useWriteContract();

  // MyToken 使用代币单位（1=1 token），非 wei。approve/deposit/withdraw 均传入 token 单位
  const toTokenUnits = (amount: string) => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return BigInt(0);
    return BigInt(Math.floor(num));
  };

  const handleApproveAndDeposit = async () => {
    if (!address || !depositAmount || !tokenAddress) return;
    const amountTokenUnits = toTokenUnits(depositAmount);
    if (amountTokenUnits <= BigInt(0)) return;

    try {
      const approveHash = await writeContractAsync({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [TOKENBANK_ADDRESS as `0x${string}`, amountTokenUnits],
      });
      await waitForTransactionReceipt(config, { hash: approveHash });
      await writeContractAsync({
        address: TOKENBANK_ADDRESS,
        abi: TOKENBANK_ABI,
        functionName: "deposit",
        args: [amountTokenUnits],
      });
      setDepositAmount("");
      refetchTotal();
      refetchCount();
    } catch (e) {
      console.error(e);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    const amountTokenUnits = toTokenUnits(withdrawAmount);
    if (amountTokenUnits <= BigInt(0)) return;
    try {
      await writeContractAsync({
        address: TOKENBANK_ADDRESS,
        abi: TOKENBANK_ABI,
        functionName: "withdraw",
        args: [amountTokenUnits],
      });
      setWithdrawAmount("");
      refetchTotal();
      refetchCount();
    } catch (e) {
      console.error(e);
    }
  };

  const symbol = (tokenSymbol as string) ?? "TOKEN";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-slate-400 transition hover:text-white"
            >
              ← 返回
            </a>
            <h1 className="text-3xl font-bold tracking-tight">
              TokenBank
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {chainId && (
              <span className="rounded-full bg-slate-700/60 px-3 py-1 text-sm">
                Chain ID: {chainId}
              </span>
            )}
            {isConnected ? (
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-slate-300">
                  {address && formatAddress(address)}
                </span>
                <button
                  onClick={() => disconnect()}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium transition hover:bg-rose-500"
                >
                  断开连接
                </button>
              </div>
            ) : (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                disabled={isPending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {isPending ? "连接中..." : "连接钱包"}
              </button>
            )}
          </div>
        </header>

        <div className="rounded-2xl border border-slate-600/50 bg-slate-800/40 p-8 shadow-xl backdrop-blur">
          <p className="mb-6 text-sm text-slate-400">
            合约地址:{" "}
            <a
              href={`https://${chainId === 11155111 ? "sepolia." : ""}etherscan.io/address/${TOKENBANK_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-emerald-400 hover:underline"
            >
              {formatAddress(TOKENBANK_ADDRESS)}
            </a>
          </p>

          {/* 全局统计 */}
          <div className="mb-8 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-700/50 p-4">
              <p className="text-sm text-slate-400">总存款</p>
              <p className="text-2xl font-bold">
                {formatTokenUnits(totalBalance)} {symbol}
              </p>
            </div>
            <div className="rounded-xl bg-slate-700/50 p-4">
              <p className="text-sm text-slate-400">存款人数</p>
              <p className="text-2xl font-bold">
                {depositorsCount !== undefined
                  ? depositorsCount.toString()
                  : "-"}
              </p>
            </div>
          </div>

          {isConnected && (
            <>
              {/* 用户余额 */}
              <div className="mb-8 rounded-xl bg-slate-700/50 p-4">
                <p className="text-sm text-slate-400">我的存款</p>
                <p className="text-xl font-bold">
                  {formatTokenUnits(userDeposit)} {symbol}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  钱包余额:{" "}
                  {userTokenBalance !== undefined
                    ? formatUnits(userTokenBalance, decimals)
                    : "-"}{" "}
                  {symbol}
                </p>
              </div>

              {/* 存款 */}
              <div className="mb-8">
                <h2 className="mb-3 text-lg font-semibold">存款</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`输入 ${symbol} 数量`}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-3 font-mono placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    onClick={handleApproveAndDeposit}
                    disabled={
                      !depositAmount ||
                      isWritePending ||
                      parseFloat(depositAmount) <= 0
                    }
                    className="rounded-lg bg-emerald-600 px-6 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isWritePending ? "处理中..." : "存款"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  存款需先授权 TokenBank 使用您的代币，再执行存款。MyToken 使用整数代币单位（如 1、2），小数部分会被舍去。
                </p>
              </div>

              {/* 取款 */}
              <div>
                <h2 className="mb-3 text-lg font-semibold">取款</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`输入 ${symbol} 数量`}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-3 font-mono placeholder-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                  <button
                    onClick={handleWithdraw}
                    disabled={
                      !withdrawAmount ||
                      isWritePending ||
                      parseFloat(withdrawAmount) <= 0
                    }
                    className="rounded-lg bg-rose-600 px-6 py-3 font-medium transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {isWritePending ? "取款中..." : "取款"}
                  </button>
                </div>
              </div>
            </>
          )}

          {!isConnected && (
            <p className="rounded-xl bg-slate-700/30 p-6 text-center text-slate-400">
              请先连接钱包以进行存款和取款操作
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
