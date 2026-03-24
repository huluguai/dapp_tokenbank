"use client";

import Link from "next/link";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useConfig,
  useSignTypedData,
} from "wagmi";
import { useReadContract, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { formatUnits, parseSignature, parseUnits } from "viem";
import { useEffect, useState } from "react";
import {
  TOKENBANK_ADDRESS,
  TOKENBANK_ABI,
} from "@/contracts/tokenbank";
import { ERC20_ABI } from "@/contracts/erc20";
import {
  buildPermit2TransferFromMessage,
  permit2AddressForChain,
  permit2Eip712Domain,
  permit2SignatureTransferTypes,
  pickUnusedPermit2SignatureNonce,
} from "@/lib/tokenbankPermit2";

/** OpenZeppelin ERC20Permit 默认 EIP-712 version */
const EIP712_DOMAIN_VERSION = "1" as const;

const DEPOSIT_WITH_PERMIT2_GAS = BigInt(800_000);

const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function tryParsePositiveUnits(
  amount: string,
  decimals: number,
): bigint | null {
  const trimmed = amount.trim();
  if (!trimmed) return null;
  try {
    const v = parseUnits(trimmed, decimals);
    return v > BigInt(0) ? v : null;
  } catch {
    return null;
  }
}

export default function TokenBankPage() {
  const { address, status } = useAccount();
  const isConnected = status === "connected";
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const config = useConfig();

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  /** 避免 wagmi chainId 在 SSR 与首帧客户端不一致导致 hydration mismatch */
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

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

  const { data: userDeposit, refetch: refetchUserDeposit } = useReadContract({
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

  const { data: tokenName } = useReadContract({
    address: tokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: "name",
  });

  const { data: userTokenBalance, refetch: refetchUserToken } =
    useReadContract({
      address: tokenAddress as `0x${string}` | undefined,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: address ? [address] : undefined,
    });

  const decimals = tokenDecimals ?? 18;

  const formatBankTokenAmount = (value: bigint | undefined) =>
    value !== undefined ? formatUnits(value, decimals) : "-";

  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const { signTypedDataAsync, isPending: isSignPending } = useSignTypedData();

  const depositValue = tryParsePositiveUnits(depositAmount, decimals);
  const withdrawValue = tryParsePositiveUnits(withdrawAmount, decimals);

  const refetchAfterTx = async () => {
    await refetchTotal();
    await refetchCount();
    await refetchUserDeposit();
    await refetchUserToken();
  };

  const handleApproveAndDeposit = async () => {
    if (!address || !tokenAddress || depositValue === null) return;

    try {
      const approveHash = await writeContractAsync({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [TOKENBANK_ADDRESS as `0x${string}`, depositValue],
      });
      await waitForTransactionReceipt(config, { hash: approveHash });
      await writeContractAsync({
        address: TOKENBANK_ADDRESS,
        abi: TOKENBANK_ABI,
        functionName: "deposit",
        args: [depositValue],
      });
      setDepositAmount("");
      await refetchAfterTx();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePermitDeposit = async () => {
    if (
      !address ||
      !tokenAddress ||
      depositValue === null ||
      typeof tokenName !== "string" ||
      !tokenName
    )
      return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    try {
      const nonce = await readContract(config, {
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "nonces",
        args: [address],
      });

      const signature = await signTypedDataAsync({
        domain: {
          name: tokenName,
          version: EIP712_DOMAIN_VERSION,
          chainId,
          verifyingContract: tokenAddress as `0x${string}`,
        },
        types: permitTypes,
        primaryType: "Permit",
        message: {
          owner: address,
          spender: TOKENBANK_ADDRESS,
          value: depositValue,
          nonce,
          deadline,
        },
      });

      const { r, s, v, yParity } = parseSignature(signature);
      const vUint8 = Number(
        v !== undefined ? v : BigInt(27 + (yParity ?? 0)),
      ) as number;

      const permitHash = await writeContractAsync({
        address: TOKENBANK_ADDRESS,
        abi: TOKENBANK_ABI,
        functionName: "permitDeposit",
        args: [address, depositValue, deadline, vUint8, r, s],
      });
      await waitForTransactionReceipt(config, { hash: permitHash });
      setDepositAmount("");
      await refetchAfterTx();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePermit2Deposit = async () => {
    if (!address || !tokenAddress || depositValue === null) return;

    const permit2 = permit2AddressForChain(chainId);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    try {
      const nonce = await pickUnusedPermit2SignatureNonce(
        config,
        permit2,
        address,
      );

      const message = buildPermit2TransferFromMessage({
        token: tokenAddress as `0x${string}`,
        amount: depositValue,
        nonce,
        deadline,
      });

      const signature = await signTypedDataAsync({
        domain: permit2Eip712Domain(chainId, permit2),
        types: permit2SignatureTransferTypes,
        primaryType: "PermitTransferFrom",
        message,
      });

      const hash = await writeContractAsync({
        address: TOKENBANK_ADDRESS,
        abi: TOKENBANK_ABI,
        functionName: "depositWithPermit2",
        args: [
          depositValue,
          {
            permitted: message.permitted,
            nonce: message.nonce,
            deadline: message.deadline,
          },
          signature,
        ],
        gas: DEPOSIT_WITH_PERMIT2_GAS,
      });
      await waitForTransactionReceipt(config, { hash });
      setDepositAmount("");
      await refetchAfterTx();
    } catch (e) {
      console.error(e);
    }
  };

  const handleWithdraw = async () => {
    if (withdrawValue === null) return;
    try {
      await writeContractAsync({
        address: TOKENBANK_ADDRESS,
        abi: TOKENBANK_ABI,
        functionName: "withdraw",
        args: [withdrawValue],
      });
      setWithdrawAmount("");
      await refetchAfterTx();
    } catch (e) {
      console.error(e);
    }
  };

  const symbol = (tokenSymbol as string) ?? "TOKEN";
  const txBusy = isWritePending || isSignPending;

  const etherscanHost = hasMounted
    ? chainId === 11155111
      ? "sepolia.etherscan.io"
      : "etherscan.io"
    : "etherscan.io";

  return (
    <div className="solana-page">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-sol-muted transition hover:text-sol-mint"
            >
              ← 返回
            </Link>
            <h1 className="bg-gradient-to-r from-sol-mint via-teal-200 to-sol-purple bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              TokenBank
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-sol-purple/35 bg-sol-purple/15 px-3 py-1 text-xs font-medium text-sol-mint/90">
              Chain ID: {hasMounted && chainId ? chainId : "—"}
            </span>
            {isConnected ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm text-sol-muted">
                  {address && formatAddress(address)}
                </span>
                <button
                  onClick={() => disconnect()}
                  className="rounded-xl border border-rose-500/45 bg-rose-950/45 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-900/55"
                >
                  断开连接
                </button>
              </div>
            ) : (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                disabled={isPending}
                className="rounded-xl bg-sol-mint px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_0_24px_-4px_rgba(20,241,149,0.45)] transition hover:brightness-110 disabled:opacity-50"
              >
                {isPending ? "连接中..." : "连接钱包"}
              </button>
            )}
          </div>
        </header>

        <div className="solana-panel p-8 shadow-xl">
          <p className="mb-6 text-sm text-sol-muted">
            合约地址:{" "}
            <a
              href={`https://${etherscanHost}/address/${TOKENBANK_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sol-mint hover:underline"
            >
              {formatAddress(TOKENBANK_ADDRESS)}
            </a>
          </p>

          {/* 全局统计 */}
          <div className="mb-8 grid grid-cols-2 gap-4">
            <div className="solana-stat p-4">
              <p className="text-sm text-sol-muted">总存款</p>
              <p className="text-2xl font-bold text-sol-ink">
                {formatBankTokenAmount(totalBalance)} {symbol}
              </p>
            </div>
            <div className="solana-stat p-4">
              <p className="text-sm text-sol-muted">存款人数</p>
              <p className="text-2xl font-bold text-sol-ink">
                {depositorsCount !== undefined
                  ? depositorsCount.toString()
                  : "-"}
              </p>
            </div>
          </div>

          {isConnected && (
            <>
              {/* 用户余额 */}
              <div className="mb-8 solana-stat p-4">
                <p className="text-sm text-sol-muted">我的存款</p>
                <p className="text-xl font-bold text-sol-ink">
                  {formatBankTokenAmount(userDeposit)} {symbol}
                </p>
                <p className="mt-1 text-sm text-sol-muted">
                  钱包余额:{" "}
                  {userTokenBalance !== undefined
                    ? formatUnits(userTokenBalance, decimals)
                    : "-"}{" "}
                  {symbol}
                </p>
              </div>

              {/* 存款 */}
              <div className="mb-8">
                <h2 className="mb-3 text-lg font-semibold text-sol-ink">存款</h2>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder={`输入 ${symbol} 数量（支持小数）`}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleApproveAndDeposit}
                      disabled={depositValue === null || txBusy}
                      className="rounded-xl bg-sol-mint px-6 py-3 font-semibold text-slate-950 shadow-[0_0_20px_-4px_rgba(20,241,149,0.4)] transition hover:brightness-110 disabled:opacity-50"
                    >
                      {txBusy ? "处理中..." : "授权并存款"}
                    </button>
                    <button
                      onClick={handlePermitDeposit}
                      disabled={
                        depositValue === null ||
                        txBusy ||
                        typeof tokenName !== "string" ||
                        !tokenName
                      }
                      className="rounded-xl border border-sol-mint/45 bg-sol-mint/10 px-6 py-3 font-medium text-teal-100 transition hover:bg-sol-mint/18 disabled:opacity-50"
                    >
                      {txBusy ? "处理中..." : "Permit 存款"}
                    </button>
                    <button
                      onClick={handlePermit2Deposit}
                      disabled={depositValue === null || txBusy}
                      className="rounded-xl border border-sol-purple/45 bg-sol-purple/15 px-6 py-3 font-medium text-violet-100 transition hover:bg-sol-purple/25 disabled:opacity-50"
                    >
                      {txBusy ? "处理中..." : "Permit2 存款"}
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-sol-muted/80">
                  「授权并存款」需两笔链上交易（approve + deposit）。「Permit
                  存款」先通过 EIP-2612
                  在钱包中签名授权，再一笔交易调用 permitDeposit。「Permit2
                  存款」先对链上 Permit2 合约做 EIP-712（PermitTransferFrom）
                  签名，再一笔交易调用 depositWithPermit2，无需对 TokenBank
                  做 ERC20 approve。标准 ERC20 下 Permit2 从用户扣款仍需用户对
                  Permit2 具备代币 allowance（若从未授权过 Permit2，请先对代币
                  approve(Permit2) 或使用「授权并存款」一次完成额度）。数量按代币{" "}
                  {decimals} 位小数解析。
                </p>
              </div>

              {/* 取款 */}
              <div>
                <h2 className="mb-3 text-lg font-semibold text-sol-ink">取款</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`输入 ${symbol} 数量（支持小数）`}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="flex-1 rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sol-ink placeholder:text-sol-muted/55 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/25"
                  />
                  <button
                    onClick={handleWithdraw}
                    disabled={withdrawValue === null || txBusy}
                    className="rounded-xl border border-rose-500/50 bg-rose-600/90 px-6 py-3 font-semibold text-white shadow-[0_0_20px_-6px_rgba(244,63,94,0.45)] transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    {txBusy ? "取款中..." : "取款"}
                  </button>
                </div>
              </div>
            </>
          )}

          {!isConnected && (
            <p className="rounded-xl border border-white/10 bg-black/25 p-6 text-center text-sol-muted">
              请先连接钱包以进行存款和取款操作
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
