"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppKitButton, useAppKitAccount } from "@reown/appkit/react";
import {
  useBalance,
  useChainId,
  useConfig,
  useReadContract,
  type Config,
} from "wagmi";
import {
  readContract,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import {
  formatEther,
  formatUnits,
  InsufficientFundsError,
  parseEther,
  WaitForTransactionReceiptTimeoutError,
  type Address,
} from "viem";
import {
  MEME_FACTORY_ABI,
  MEME_FACTORY_ADDRESS,
  MEME_PROJECT_RECIPIENT,
  MEME_TOKEN_ABI,
  MEME_TOKEN_IMPLEMENTATION,
} from "@/contracts/meme";
import { parseMemeTokenFromDeployReceipt } from "@/lib/memeDeploy";

const SEPOLIA_CHAIN_ID = 11155111;

/** 铸造前预留的原生 ETH（Gas），避免仅按 price 判断导致链上仍报余额不足 */
const MINT_NATIVE_GAS_BUFFER_WEI = parseEther("0.001");

function isInsufficientFundsLike(e: unknown): boolean {
  if (e instanceof InsufficientFundsError) return true;
  const m = e instanceof Error ? e.message : String(e);
  return /insufficient funds|exceeds the balance|Total cost.*exceeds/i.test(m);
}

function mintInsufficientFundsMessage(costWei: bigint, nativeWei: bigint) {
  return (
    `Sepolia ETH 不足：铸造需向工厂支付 ${formatEther(costWei)} ETH（msg.value = (perMint × price) ÷ 10^decimals），并需额外 ETH 支付 Gas。` +
    ` 当前钱包原生余额约 ${formatEther(nativeWei)} ETH。` +
    ` 可从水龙头领取测试币，或部署新币时使用更低的单价。`
  );
}

/** 与 MemeFactory.mintMeme 一致：`(perMint * price) / 10**decimals` */
function mintMemeCostWei(perMint: bigint, price: bigint, decimals: number): bigint {
  if (decimals < 0 || decimals > 255) return BigInt(0);
  return (perMint * price) / BigInt(10) ** BigInt(decimals);
}

/**
 * wagmi 的 waitForTransactionReceipt 对未传入的 timeout 默认写成 0 再交给 viem；
 * viem 在 timeout 为假值时不启超时定时器，会无限轮询，界面一直停在「交易处理中」。
 */
const MEME_TX_RECEIPT_TIMEOUT_MS = 180_000;

function waitMemeTxReceipt(wagmiConfig: Config, hash: `0x${string}`) {
  return waitForTransactionReceipt(wagmiConfig, {
    hash,
    chainId: SEPOLIA_CHAIN_ID,
    timeout: MEME_TX_RECEIPT_TIMEOUT_MS,
  });
}

/** Meme 工厂部署在 Sepolia，区块浏览器固定为该网，避免 SSR/客户端 chainId 不一致导致链接 hydration 差异 */
const MEME_BLOCK_EXPLORER = "https://sepolia.etherscan.io";

function lsKey(chainId: number) {
  return `memeDeployedTokens:${chainId}`;
}

type StoredMeme = {
  address: Address;
  symbol: string;
  savedAt: number;
};

function loadStored(chainId: number): StoredMeme[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(lsKey(chainId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredMeme[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStored(chainId: number, list: StoredMeme[]) {
  localStorage.setItem(lsKey(chainId), JSON.stringify(list));
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function isAddress(s: string): s is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function toPositiveBigIntStr(value: string, label: string): bigint {
  const t = value.trim();
  if (!t) throw new Error(`请填写 ${label}。`);
  let n: bigint;
  try {
    n = BigInt(t);
  } catch {
    throw new Error(`${label} 须为无符号整数。`);
  }
  if (n <= BigInt(0)) {
    throw new Error(`${label} 必须大于 0。`);
  }
  return n;
}

function LocalMemeRow({
  tokenAddress,
  savedSymbol,
  onPick,
  viewerAddress,
  balanceReadEnabled,
}: {
  tokenAddress: Address;
  savedSymbol: string;
  onPick: () => void;
  /** 当前连接钱包；有地址时才读 balanceOf */
  viewerAddress?: Address;
  /** 与页面一致：仅在挂载且目标链为 Sepolia 时读余额，避免错误链上的无效 RPC */
  balanceReadEnabled: boolean;
}) {
  const { data: chainSymbol } = useReadContract({
    address: tokenAddress,
    abi: MEME_TOKEN_ABI,
    functionName: "symbol",
  });
  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress,
    abi: MEME_TOKEN_ABI,
    functionName: "decimals",
  });
  const { data: totalSupply } = useReadContract({
    address: tokenAddress,
    abi: MEME_TOKEN_ABI,
    functionName: "totalSupply",
  });
  const { data: maxSupply } = useReadContract({
    address: tokenAddress,
    abi: MEME_TOKEN_ABI,
    functionName: "maxSupply",
  });
  const viewerOk =
    Boolean(viewerAddress && isAddress(viewerAddress)) && balanceReadEnabled;
  const { data: myBalance } = useReadContract({
    address: tokenAddress,
    abi: MEME_TOKEN_ABI,
    functionName: "balanceOf",
    args: viewerAddress && isAddress(viewerAddress) ? [viewerAddress] : undefined,
    query: { enabled: viewerOk },
  });

  const sym = (chainSymbol as string | undefined) ?? savedSymbol;
  const total = (totalSupply as bigint | undefined) ?? BigInt(0);
  const max = (maxSupply as bigint | undefined) ?? BigInt(0);
  const pct =
    max > BigInt(0)
      ? Number((total * BigInt(10000)) / max) / 100
      : 0;
  const decRaw = tokenDecimals;
  const decNum =
    decRaw === undefined
      ? undefined
      : typeof decRaw === "bigint"
        ? Number(decRaw)
        : Number(decRaw as number);
  const bal = myBalance as bigint | undefined;
  const formattedBalance =
    viewerOk &&
    bal !== undefined &&
    decNum !== undefined &&
    Number.isInteger(decNum) &&
    decNum >= 0 &&
    decNum <= 255
      ? formatUnits(bal, decNum)
      : null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="font-semibold text-sol-mint">{sym}</div>
        <div className="font-mono text-xs text-sol-muted">
          {tokenAddress}
        </div>
        {viewerOk && bal !== undefined && (
          <div className="text-xs text-teal-100/95">
            我的余额:{" "}
            <span className="font-mono font-medium">
              {formattedBalance ?? bal.toString()}
            </span>
            {formattedBalance !== null && (
              <span className="text-sol-muted"> {sym}</span>
            )}
            {formattedBalance !== null && (
              <span className="block font-mono text-[0.7rem] text-sol-muted/85">
                最小单位: {bal.toString()}
              </span>
            )}
          </div>
        )}
        <div className="text-xs text-sol-muted">
          铸造进度: {total.toString()} / {max.toString()}（{pct.toFixed(1)}%）
        </div>
        {max > BigInt(0) && (
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-sol-mint/80 transition-all"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onPick}
        className="shrink-0 rounded-lg border border-sol-purple/45 bg-sol-purple/20 px-4 py-2 text-xs font-semibold text-violet-100 transition hover:bg-sol-purple/30"
      >
        设为铸造目标
      </button>
    </div>
  );
}

export default function MemePage() {
  const { address, isConnected } = useAppKitAccount();
  const chainId = useChainId();
  const config = useConfig();
  const [txPending, setTxPending] = useState(false);
  /** wagmi chainId 在 SSR 与首帧客户端常不一致，仅挂载后再依链渲染/启读，避免 hydration mismatch */
  const [hasMounted, setHasMounted] = useState(false);

  const [symbol, setSymbol] = useState("");
  const [totalSupplyStr, setTotalSupplyStr] = useState("");
  const [perMintStr, setPerMintStr] = useState("");
  const [priceEth, setPriceEth] = useState("");

  const [mintTokenAddr, setMintTokenAddr] = useState("");
  const [stored, setStored] = useState<StoredMeme[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    setStored(loadStored(chainId));
  }, [chainId]);

  const mintTarget = useMemo(() => {
    const t = mintTokenAddr.trim();
    return isAddress(t) ? t : undefined;
  }, [mintTokenAddr]);

  const { data: projectRecipient } = useReadContract({
    address: MEME_FACTORY_ADDRESS,
    abi: MEME_FACTORY_ABI,
    functionName: "projectRecipient",
    query: { enabled: hasMounted && isSepolia },
  });

  const { data: isMeme, refetch: refetchIsMeme } = useReadContract({
    address: MEME_FACTORY_ADDRESS,
    abi: MEME_FACTORY_ABI,
    functionName: "isMeme",
    args: mintTarget ? [mintTarget] : undefined,
    query: { enabled: Boolean(hasMounted && isSepolia && mintTarget) },
  });

  const tokenReadEnabled = Boolean(
    hasMounted && isSepolia && mintTarget && isMeme === true,
  );

  const { data: tokenPrice, refetch: refetchPrice } = useReadContract({
    address: mintTarget,
    abi: MEME_TOKEN_ABI,
    functionName: "price",
    query: { enabled: tokenReadEnabled },
  });

  const { data: tokenDecimals, refetch: refetchDecimals } = useReadContract({
    address: mintTarget,
    abi: MEME_TOKEN_ABI,
    functionName: "decimals",
    query: { enabled: tokenReadEnabled },
  });

  const { data: perMint, refetch: refetchPerMint } = useReadContract({
    address: mintTarget,
    abi: MEME_TOKEN_ABI,
    functionName: "perMint",
    query: { enabled: tokenReadEnabled },
  });

  const { data: maxSupply, refetch: refetchMax } = useReadContract({
    address: mintTarget,
    abi: MEME_TOKEN_ABI,
    functionName: "maxSupply",
    query: { enabled: tokenReadEnabled },
  });

  const { data: totalOnChain, refetch: refetchTotal } = useReadContract({
    address: mintTarget,
    abi: MEME_TOKEN_ABI,
    functionName: "totalSupply",
    query: { enabled: tokenReadEnabled },
  });

  const { data: userBalance, refetch: refetchBalance } = useReadContract({
    address: mintTarget,
    abi: MEME_TOKEN_ABI,
    functionName: "balanceOf",
    args: address && isAddress(address) ? [address as Address] : undefined,
    query: {
      enabled: Boolean(tokenReadEnabled && address && isAddress(address)),
    },
  });

  const { data: nativeBalance, refetch: refetchNativeBalance } = useBalance({
    address: address && isAddress(address) ? (address as Address) : undefined,
    chainId: SEPOLIA_CHAIN_ID,
    query: {
      enabled: Boolean(hasMounted && isSepolia && address && isAddress(address)),
    },
  });

  const tokenStatsReady =
    tokenReadEnabled &&
    tokenPrice !== undefined &&
    perMint !== undefined &&
    maxSupply !== undefined &&
    totalOnChain !== undefined &&
    tokenDecimals !== undefined;

  const mintCostWei = useMemo(() => {
    if (
      tokenPrice === undefined ||
      perMint === undefined ||
      tokenDecimals === undefined
    ) {
      return undefined;
    }
    const dec =
      typeof tokenDecimals === "bigint"
        ? Number(tokenDecimals)
        : Number(tokenDecimals as number);
    if (!Number.isInteger(dec) || dec < 0 || dec > 255) return undefined;
    return mintMemeCostWei(perMint as bigint, tokenPrice as bigint, dec);
  }, [perMint, tokenDecimals, tokenPrice]);

  const remainingMints =
    tokenStatsReady && (perMint as bigint) > BigInt(0)
      ? (() => {
          const diff =
            (maxSupply as bigint) - (totalOnChain as bigint);
          if (diff <= BigInt(0)) return 0;
          return Number(diff / (perMint as bigint));
        })()
      : null;

  const refreshMintReads = useCallback(async () => {
    await Promise.all([
      refetchIsMeme(),
      refetchPrice(),
      refetchDecimals(),
      refetchPerMint(),
      refetchMax(),
      refetchTotal(),
      refetchBalance(),
      refetchNativeBalance(),
    ]);
  }, [
    refetchBalance,
    refetchDecimals,
    refetchIsMeme,
    refetchMax,
    refetchNativeBalance,
    refetchPerMint,
    refetchPrice,
    refetchTotal,
  ]);

  const appendStored = (entry: StoredMeme) => {
    setStored((prev) => {
      const dedup = prev.filter(
        (p) => p.address.toLowerCase() !== entry.address.toLowerCase(),
      );
      const next = [entry, ...dedup];
      saveStored(chainId, next);
      return next;
    });
  };

  const handleDeploy = async () => {
    setActionError(null);
    setStatusMsg(null);
    if (!isSepolia) {
      setActionError("请切换到 Sepolia（Chain ID 11155111）后再部署。");
      return;
    }
    if (!address) {
      setActionError("请先连接钱包。");
      return;
    }
    const sym = symbol.trim();
    if (!sym) {
      setActionError("请填写代币符号。");
      return;
    }
    let ts: bigint;
    let pm: bigint;
    let priceWei: bigint;
    try {
      ts = toPositiveBigIntStr(totalSupplyStr, "maxSupply / 总供应量");
      pm = toPositiveBigIntStr(perMintStr, "每次铸造数量 perMint");
      priceWei = parseEther(priceEth.trim() || "0");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "参数无效。");
      return;
    }
    if (priceWei <= BigInt(0)) {
      setActionError("单价须为大于 0 的 ETH 数量。");
      return;
    }
    if (!address || !isAddress(address)) {
      setActionError("无法获取钱包地址，请重新连接后重试。");
      return;
    }
    try {
      setTxPending(true);
      setStatusMsg("正在提交 deployMeme…");
      const { request: deployRequest } = await simulateContract(config, {
        address: MEME_FACTORY_ADDRESS,
        abi: MEME_FACTORY_ABI,
        functionName: "deployMeme",
        args: [sym, ts, pm, priceWei],
        account: address as Address,
        chainId: SEPOLIA_CHAIN_ID,
      });
      const hash = await writeContract(config, deployRequest);
      setStatusMsg("等待交易确认…");
      const receipt = await waitMemeTxReceipt(config, hash);
      if (receipt.status !== "success") {
        throw new Error("交易未成功（status 非 success）。");
      }
      const tokenAddr = await parseMemeTokenFromDeployReceipt(
        config,
        receipt,
      );
      appendStored({
        address: tokenAddr,
        symbol: sym,
        savedAt: Date.now(),
      });
      setMintTokenAddr(tokenAddr);
      setStatusMsg(`部署成功，代币地址: ${tokenAddr}`);
      setSymbol("");
      setTotalSupplyStr("");
      setPerMintStr("");
      setPriceEth("");
    } catch (e) {
      console.error(e);
      setStatusMsg(null);
      if (e instanceof WaitForTransactionReceiptTimeoutError) {
        setActionError(
          `等待交易确认超时（${MEME_TX_RECEIPT_TIMEOUT_MS / 1000}s）。` +
            "请在浏览器查看交易哈希是否已上链，或稍后重试 / 更换 RPC。",
        );
      } else {
        setActionError(
          e instanceof Error
            ? e.message
            : "部署失败，请查看控制台或钱包提示。",
        );
      }
    } finally {
      setTxPending(false);
    }
  };

  const handleMint = async () => {
    setActionError(null);
    setStatusMsg(null);
    if (!isSepolia) {
      setActionError("请切换到 Sepolia 后再铸造。");
      return;
    }
    if (!address) {
      setActionError("请先连接钱包。");
      return;
    }
    if (!mintTarget) {
      setActionError("请填写有效的 Meme 代币合约地址（0x + 40 位十六进制）。");
      return;
    }
    if (isMeme !== true) {
      setActionError("该地址未通过工厂 isMeme 校验，无法铸造。");
      return;
    }
    if (
      remainingMints !== null &&
      remainingMints !== undefined &&
      remainingMints < 1
    ) {
      setActionError("已达到 maxSupply，无法再铸。");
      return;
    }
    if (!address || !isAddress(address)) {
      setActionError("无法获取钱包地址，请重新连接后重试。");
      return;
    }
    /** 与工厂 mintMeme 公式一致，链上同步读取避免缓存错位 */
    let value: bigint;
    try {
      const [p, pm, dec] = await Promise.all([
        readContract(config, {
          address: mintTarget,
          abi: MEME_TOKEN_ABI,
          functionName: "price",
          chainId: SEPOLIA_CHAIN_ID,
        }),
        readContract(config, {
          address: mintTarget,
          abi: MEME_TOKEN_ABI,
          functionName: "perMint",
          chainId: SEPOLIA_CHAIN_ID,
        }),
        readContract(config, {
          address: mintTarget,
          abi: MEME_TOKEN_ABI,
          functionName: "decimals",
          chainId: SEPOLIA_CHAIN_ID,
        }),
      ]);
      const decNum =
        typeof dec === "bigint" ? Number(dec) : Number(dec as number);
      if (!Number.isInteger(decNum) || decNum < 0 || decNum > 255) {
        setActionError("链上 decimals 无效，无法计算应付金额。");
        return;
      }
      value = mintMemeCostWei(pm as bigint, p as bigint, decNum);
    } catch {
      setActionError("无法读取链上 price / perMint / decimals，请确认代币地址。");
      return;
    }
    if (value <= BigInt(0)) {
      setActionError(
        "计算应付金额为 0：请确认 perMint、price、decimals 有效（工厂要求 msg.value = (perMint × price) ÷ 10^decimals）。",
      );
      return;
    }
    const nativeWei = nativeBalance?.value;
    if (
      nativeWei !== undefined &&
      nativeWei < value + MINT_NATIVE_GAS_BUFFER_WEI
    ) {
      setActionError(mintInsufficientFundsMessage(value, nativeWei));
      return;
    }
    try {
      setTxPending(true);
      setStatusMsg("正在提交 mintMeme…");
      const { request: mintRequest } = await simulateContract(config, {
        address: MEME_FACTORY_ADDRESS,
        abi: MEME_FACTORY_ABI,
        functionName: "mintMeme",
        args: [mintTarget],
        value,
        account: address as Address,
        chainId: SEPOLIA_CHAIN_ID,
      });
      const mintHash = await writeContract(config, {
        ...mintRequest,
        value,
      });
      setStatusMsg("等待铸造交易确认…");
      await waitMemeTxReceipt(config, mintHash);
      await refreshMintReads();
      setStatusMsg("铸造已确认。余额与总供应量已刷新。");
    } catch (e) {
      console.error(e);
      setStatusMsg(null);
      if (e instanceof WaitForTransactionReceiptTimeoutError) {
        setActionError(
          `等待交易确认超时（${MEME_TX_RECEIPT_TIMEOUT_MS / 1000}s）。` +
            "请在区块浏览器查看该笔交易是否 pending，或稍后刷新页面重试。",
        );
      } else if (isInsufficientFundsLike(e)) {
        const nw = nativeBalance?.value;
        setActionError(
          nw !== undefined
            ? mintInsufficientFundsMessage(value, nw)
            : `Sepolia ETH 不足：铸造需支付 ${formatEther(value)} ETH（链上 price）及 Gas。请充值或减少部署时设定的单价。`,
        );
      } else if (
        e instanceof Error &&
        /MemeFactory:\s*wrong payment|wrong payment/i.test(e.message)
      ) {
        setActionError(
          `工厂拒绝付款（wrong payment）：msg.value 须严格等于 (perMint × price) ÷ 10^decimals（本次计算 wei: ${value.toString()}，约 ${formatEther(value)} ETH）。` +
            " 请刷新页面或切换代币后重试；若仍失败请对照工厂合约与链上读数。",
        );
      } else {
        setActionError(
          e instanceof Error ? e.message : "铸造失败，请查看控制台或钱包。",
        );
      }
    } finally {
      setTxPending(false);
    }
  };

  const mintEthTooLow =
    tokenStatsReady &&
    mintCostWei !== undefined &&
    mintCostWei > BigInt(0) &&
    nativeBalance?.value !== undefined &&
    mintCostWei + MINT_NATIVE_GAS_BUFFER_WEI > nativeBalance.value;

  const mintBlocked =
    !mintTarget ||
    isMeme !== true ||
    mintCostWei === undefined ||
    mintCostWei <= BigInt(0) ||
    (remainingMints !== null && remainingMints < 1) ||
    mintEthTooLow;

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
            <h1 className="bg-gradient-to-r from-teal-300 via-sol-mint to-violet-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Meme 发射台
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-sol-purple/35 bg-sol-purple/15 px-3 py-1 text-xs font-medium text-sol-mint/90">
              Chain ID: {hasMounted && chainId != null ? chainId : "—"}
            </span>
            {isConnected && address && (
              <span className="hidden font-mono text-sm text-sol-muted sm:inline">
                {formatAddress(address)}
              </span>
            )}
            <AppKitButton />
          </div>
        </header>

        {hasMounted && !isSepolia && (
          <div className="mb-6 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
            当前网络不是 Sepolia（11155111）。AppKit 已配置 Sepolia，请在钱包中切换到
            Sepolia 后再操作工厂合约。
          </div>
        )}

        <div className="solana-panel space-y-8 p-8 shadow-xl">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-sol-ink">协议信息</h2>
            <p className="text-sm text-sol-muted">
              工厂合约（MemeFactory）与项目方费用地址。铸造时支付的 ETH 由合约按规则拆分，其中约
              1% 流向项目接收地址（以链上合约逻辑为准）。
            </p>
            <div className="space-y-2 text-sm text-sol-muted">
              <div>
                工厂:{" "}
                <a
                  href={`${MEME_BLOCK_EXPLORER}/address/${MEME_FACTORY_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-mono text-sol-mint hover:underline"
                >
                  {MEME_FACTORY_ADDRESS}
                </a>
              </div>
              <div>
                实现（参考）:{" "}
                <span className="break-all font-mono text-sol-muted/90">
                  {MEME_TOKEN_IMPLEMENTATION}
                </span>
              </div>
              <div>
                常量 projectRecipient:{" "}
                <span className="break-all font-mono text-teal-200/90">
                  {MEME_PROJECT_RECIPIENT}
                </span>
              </div>
              {hasMounted &&
                projectRecipient != null &&
                typeof projectRecipient === "string" && (
                <div>
                  链上 projectRecipient:{" "}
                  <span className="break-all font-mono text-teal-200">
                    {projectRecipient}
                  </span>
                </div>
              )}
            </div>
          </section>

          {actionError && (
            <div className="rounded-xl border border-rose-500/45 bg-rose-950/35 px-4 py-3 text-sm text-rose-100">
              {actionError}
            </div>
          )}
          {statusMsg && (
            <div className="rounded-xl border border-sol-mint/35 bg-sol-mint/10 px-4 py-3 text-sm text-sol-ink">
              {statusMsg}
            </div>
          )}

          {isConnected ? (
            <>
              <section className="border-t border-white/10 pt-8">
                <h2 className="mb-3 text-lg font-semibold text-sol-ink">
                  发射 Meme
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="符号 symbol（如 PEPE）"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                  />
                  <input
                    type="text"
                    placeholder="maxSupply / 总供应量（整数）"
                    value={totalSupplyStr}
                    onChange={(e) => setTotalSupplyStr(e.target.value)}
                    className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                  />
                  <input
                    type="text"
                    placeholder="每铸 perMint（整数）"
                    value={perMintStr}
                    onChange={(e) => setPerMintStr(e.target.value)}
                    className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                  />
                  <input
                    type="text"
                    placeholder="单价（ETH，如 0.001）"
                    value={priceEth}
                    onChange={(e) => setPriceEth(e.target.value)}
                    className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleDeploy}
                  disabled={
                    txPending ||
                    !hasMounted ||
                    !isSepolia ||
                    !symbol.trim() ||
                    !totalSupplyStr.trim() ||
                    !perMintStr.trim() ||
                    !priceEth.trim()
                  }
                  className="mt-4 w-full rounded-xl bg-sol-mint px-6 py-3 font-semibold text-slate-950 shadow-[0_0_24px_-6px_rgba(20,241,149,0.45)] transition hover:brightness-110 disabled:opacity-50"
                >
                  {txPending ? "交易处理中…" : "部署 Meme 代币"}
                </button>
                <p className="mt-2 text-xs text-sol-muted/75">
                  部署成功后，前端会从交易收据中解析 MemeToken 的{" "}
                  <code className="text-sol-muted">Initialized</code>{" "}
                  事件并结合工厂校验，将地址写入本地列表（按链 ID 隔离）。
                </p>
              </section>

              <section className="border-t border-white/10 pt-8">
                <h2 className="mb-3 text-lg font-semibold text-sol-ink">
                  本地已部署列表
                </h2>
                <p className="mb-3 text-xs text-sol-muted">
                  在 Sepolia 且已连接钱包时，每条会显示当前地址在该 Meme 代币下的链上余额。
                </p>
                {stored.length === 0 ? (
                  <p className="text-sm text-sol-muted">
                    暂无记录。在此浏览器部署成功后，会自动出现在此列表。
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stored.map((item) => (
                      <LocalMemeRow
                        key={item.address}
                        tokenAddress={item.address}
                        savedSymbol={item.symbol}
                        onPick={() => setMintTokenAddr(item.address)}
                        viewerAddress={
                          address && isAddress(address)
                            ? (address as Address)
                            : undefined
                        }
                        balanceReadEnabled={
                          Boolean(hasMounted && isSepolia && isConnected)
                        }
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="border-t border-white/10 pt-8">
                <h2 className="mb-3 text-lg font-semibold text-sol-ink">
                  按地址铸造
                </h2>
                <input
                  type="text"
                  placeholder="Meme 代币合约地址 0x…"
                  value={mintTokenAddr}
                  onChange={(e) => setMintTokenAddr(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                />

                {hasMounted && mintTarget && isMeme === false && (
                  <p className="mt-2 text-sm text-rose-300">
                    工厂 isMeme 返回 false，请确认地址。
                  </p>
                )}

                {tokenReadEnabled && !tokenStatsReady && (
                  <p className="mt-4 text-sm text-sol-muted">
                    正在读取代币参数…
                  </p>
                )}
                {tokenStatsReady && (
                  <div className="solana-stat mt-4 space-y-2 p-4 text-sm">
                    <div>
                      单价 price（整币口径，wei/最小单位）:{" "}
                      <span className="font-mono">
                        {formatEther(tokenPrice as bigint)} ETH
                      </span>
                    </div>
                    <div>
                      decimals:{" "}
                      <span className="font-mono">
                        {String(tokenDecimals)}
                      </span>
                    </div>
                    <div>
                      每铸 perMint:{" "}
                      <span className="font-mono">
                        {(perMint as bigint).toString()}
                      </span>
                    </div>
                    {mintCostWei !== undefined && mintCostWei > BigInt(0) && (
                      <div className="font-medium text-violet-200/95">
                        单次铸造应付 msg.value:{" "}
                        <span className="font-mono">
                          {formatEther(mintCostWei)} ETH
                        </span>
                        <span className="ml-1 text-xs font-normal text-sol-muted">
                          （(perMint × price) ÷ 10^decimals）
                        </span>
                      </div>
                    )}
                    <div>
                      总供应进度:{" "}
                      <span className="font-mono">
                        {(totalOnChain as bigint).toString()} /{" "}
                        {(maxSupply as bigint).toString()}
                      </span>
                    </div>
                    {remainingMints !== null && (
                      <div>
                        剩余可铸次数（整次）:{" "}
                        <span className="font-mono">{remainingMints}</span>
                      </div>
                    )}
                    {address && userBalance !== undefined && (
                      <div className="space-y-0.5">
                        <div>
                          当前钱包代币余额:{" "}
                          <span className="font-mono font-medium text-teal-100/95">
                            {(() => {
                              const ub = userBalance as bigint;
                              if (tokenDecimals === undefined) return ub.toString();
                              const d =
                                typeof tokenDecimals === "bigint"
                                  ? Number(tokenDecimals)
                                  : Number(tokenDecimals);
                              if (!Number.isInteger(d) || d < 0 || d > 255)
                                return ub.toString();
                              return formatUnits(ub, d);
                            })()}
                          </span>
                        </div>
                        {tokenDecimals !== undefined && (
                          <div className="font-mono text-[0.7rem] text-sol-muted">
                            最小单位: {(userBalance as bigint).toString()}
                          </div>
                        )}
                      </div>
                    )}
                    {nativeBalance?.value !== undefined && (
                      <div>
                        钱包 Sepolia ETH（支付应付额 + Gas）:{" "}
                        <span className="font-mono">
                          {formatEther(nativeBalance.value)} ETH
                        </span>
                      </div>
                    )}
                    {mintEthTooLow && mintCostWei !== undefined && (
                      <p className="text-amber-200/95">
                        当前原生 ETH 不足以支付应付金额{" "}
                        {formatEther(mintCostWei)} ETH 与约{" "}
                        {formatEther(MINT_NATIVE_GAS_BUFFER_WEI)} ETH
                        的 Gas 预留，铸造已禁用。
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleMint}
                  disabled={
                    txPending || !hasMounted || !isSepolia || mintBlocked
                  }
                  className="mt-4 w-full rounded-xl border border-violet-500/50 bg-violet-600/85 px-6 py-3 font-semibold text-white shadow-[0_0_24px_-6px_rgba(139,92,246,0.45)] transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {txPending
                    ? "交易处理中…"
                    : "mintMeme（支付 (perMint×price)÷10^decimals）"}
                </button>
                <p className="mt-2 text-xs text-sol-muted/75">
                  工厂要求{" "}
                  <code className="text-sol-muted/90">msg.value</code> 严格等于{" "}
                  <code className="text-sol-muted/90">
                    (perMint × price) ÷ 10^decimals
                  </code>
                  ，与「展示用 ETH」的 price 单位一致时请按公式计算；多付少付均会 revert。
                </p>
              </section>
            </>
          ) : (
            <p className="rounded-xl border border-white/10 bg-black/25 p-6 text-center text-sol-muted">
              请先连接钱包以部署与铸造。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
