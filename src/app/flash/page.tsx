"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppKitButton, useAppKitAccount } from "@reown/appkit/react";
import {
  useChainId,
  useConfig,
  useReadContract,
  type Config,
} from "wagmi";
import {
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import {
  decodeEventLog,
  formatUnits,
  parseUnits,
  type Address,
  WaitForTransactionReceiptTimeoutError,
  zeroAddress,
} from "viem";
import {
  FLASH_ARBITRAGE_ABI,
  FLASH_ARBITRAGE_ADDRESS,
  FLASH_BLOCK_EXPLORER,
  FLASH_ERC20_ABI,
  FLASH_FACTORY_ABI,
  FLASH_FACTORY_A_ADDRESS,
  FLASH_FACTORY_B_ADDRESS,
  FLASH_PAIR_ABI,
  FLASH_PAIR_A_ADDRESS,
  FLASH_ROUTER_ABI,
  FLASH_ROUTER_A_ADDRESS,
  FLASH_ROUTER_B_ADDRESS,
  FLASH_SEPOLIA_CHAIN_ID,
  FLASH_TOKEN_A_ADDRESS,
  FLASH_TOKEN_B_ADDRESS,
  FLASH_WETH9_ADDRESS,
} from "@/contracts/flash";

const TX_RECEIPT_TIMEOUT_MS = 180_000;

const SLIPPAGE_BPS_OPTIONS = [50, 100, 200, 300, 500] as const;

function formatAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function addrEq(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function friendlyRevert(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message;
    if (/User rejected|user rejected/i.test(m)) return "用户取消了签名。";
    if (/MustBorrowTokenA/i.test(m)) return "合约校验：必须从 TokenA 侧借贷。";
    if (/InvalidSides/i.test(m)) return "合约校验：交易路径或池侧无效。";
    if (/NotFromFactoryPair/i.test(m)) return "合约校验：调用来源不是工厂认可的 Pair。";
    if (/SafeERC20FailedOperation/i.test(m))
      return "代币转账失败（流动性或授权路径异常）。";
    return m.length > 220 ? `${m.slice(0, 220)}…` : m;
  }
  return String(e);
}

function waitFlashReceipt(cfg: Config, hash: `0x${string}`) {
  return waitForTransactionReceipt(cfg, {
    hash,
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    timeout: TX_RECEIPT_TIMEOUT_MS,
  });
}

type FlashStartedParsed = {
  pairA: Address;
  borrowA: bigint;
  initiator: Address;
};

type FlashRepaidParsed = {
  pairA: Address;
  paidB: bigint;
  bSurplus: bigint;
};

/** 交易确认后用于展示的完整成功信息 */
type FlashSuccessDetail = {
  blockNumber: bigint;
  gasUsed?: bigint;
  started: FlashStartedParsed | null;
  repaid: FlashRepaidParsed | null;
  /** 未解析到事件时的说明 */
  parseNote: string | null;
};

function parseFlashReceiptLogs(
  logs: readonly {
    topics: readonly `0x${string}`[];
    data: `0x${string}`;
  }[],
): Pick<FlashSuccessDetail, "started" | "repaid" | "parseNote"> {
  let started: FlashStartedParsed | null = null;
  let repaid: FlashRepaidParsed | null = null;
  for (const log of logs) {
    try {
      const d = decodeEventLog({
        abi: FLASH_ARBITRAGE_ABI,
        data: log.data,
        topics: log.topics as unknown as [`0x${string}`, ...`0x${string}`[]],
      });
      if (d.eventName === "FlashStarted") {
        const { borrowA, initiator, pairA: p } = d.args as unknown as {
          pairA: Address;
          borrowA: bigint;
          initiator: Address;
        };
        started = { pairA: p, borrowA, initiator };
      }
      if (d.eventName === "FlashRepaid") {
        const { paidB, bSurplus, pairA: p } = d.args as unknown as {
          pairA: Address;
          paidB: bigint;
          bSurplus: bigint;
        };
        repaid = { pairA: p, paidB, bSurplus };
      }
    } catch {
      /* 非本合约事件 */
    }
  }
  const parseNote =
    started || repaid
      ? null
      : "本笔交易的收据里未解析到 FlashArbitrage 的 FlashStarted / FlashRepaid 事件。若合约地址或 ABI 无误，可到区块浏览器「Logs」页签核对原始日志。";
  return { started, repaid, parseNote };
}

export default function FlashPage() {
  const { address, isConnected } = useAppKitAccount();
  const chainId = useChainId();
  const wagmiConfig = useConfig();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isSepolia = chainId === FLASH_SEPOLIA_CHAIN_ID;

  const { data: chainTokenA } = useReadContract({
    address: FLASH_ARBITRAGE_ADDRESS,
    abi: FLASH_ARBITRAGE_ABI,
    functionName: "tokenA",
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: { enabled: isSepolia },
  });

  const { data: chainTokenB } = useReadContract({
    address: FLASH_ARBITRAGE_ADDRESS,
    abi: FLASH_ARBITRAGE_ABI,
    functionName: "tokenB",
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: { enabled: isSepolia },
  });

  const { data: chainFactoryA } = useReadContract({
    address: FLASH_ARBITRAGE_ADDRESS,
    abi: FLASH_ARBITRAGE_ABI,
    functionName: "factoryA",
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: { enabled: isSepolia },
  });

  const tokenA = (chainTokenA ?? FLASH_TOKEN_A_ADDRESS) as Address;
  const tokenB = (chainTokenB ?? FLASH_TOKEN_B_ADDRESS) as Address;
  const factoryA = (chainFactoryA ?? FLASH_FACTORY_A_ADDRESS) as Address;

  const configTokenMismatch =
    chainTokenA != null &&
    chainTokenB != null &&
    (!addrEq(chainTokenA, FLASH_TOKEN_A_ADDRESS) ||
      !addrEq(chainTokenB, FLASH_TOKEN_B_ADDRESS));

  const configFactoryMismatch =
    chainFactoryA != null && !addrEq(chainFactoryA, FLASH_FACTORY_A_ADDRESS);

  const { data: resolvedPair } = useReadContract({
    address: factoryA,
    abi: FLASH_FACTORY_ABI,
    functionName: "getPair",
    args: [tokenA, tokenB],
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: { enabled: isSepolia },
  });

  const pairOnChain =
    resolvedPair && resolvedPair !== zeroAddress ? resolvedPair : null;

  const pairMismatch =
    pairOnChain != null && !addrEq(pairOnChain, FLASH_PAIR_A_ADDRESS);

  const pairForReserves = pairOnChain ?? FLASH_PAIR_A_ADDRESS;

  const { data: token0 } = useReadContract({
    address: pairForReserves,
    abi: FLASH_PAIR_ABI,
    functionName: "token0",
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: { enabled: isSepolia },
  });

  const { data: token1 } = useReadContract({
    address: pairForReserves,
    abi: FLASH_PAIR_ABI,
    functionName: "token1",
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: { enabled: isSepolia },
  });

  const { data: reserves } = useReadContract({
    address: pairForReserves,
    abi: FLASH_PAIR_ABI,
    functionName: "getReserves",
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: { enabled: isSepolia },
  });

  const { data: decA } = useReadContract({
    address: tokenA,
    abi: FLASH_ERC20_ABI,
    functionName: "decimals",
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: { enabled: isSepolia },
  });

  const { data: decB } = useReadContract({
    address: tokenB,
    abi: FLASH_ERC20_ABI,
    functionName: "decimals",
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: { enabled: isSepolia },
  });

  const { data: symA } = useReadContract({
    address: tokenA,
    abi: FLASH_ERC20_ABI,
    functionName: "symbol",
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: { enabled: isSepolia },
  });

  const { data: symB } = useReadContract({
    address: tokenB,
    abi: FLASH_ERC20_ABI,
    functionName: "symbol",
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: { enabled: isSepolia },
  });

  const decimalsA = decA ?? 18;
  const decimalsB = decB ?? 18;

  const [borrowInput, setBorrowInput] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [deadlineSec, setDeadlineSec] = useState(600);

  const borrowWei = useMemo(() => {
    const t = borrowInput.trim();
    if (!t) return undefined;
    try {
      const v = parseUnits(t, decimalsA);
      return v > 0n ? v : undefined;
    } catch {
      return undefined;
    }
  }, [borrowInput, decimalsA]);

  const { data: amountsOut, error: quoteError } = useReadContract({
    address: FLASH_ROUTER_B_ADDRESS,
    abi: FLASH_ROUTER_ABI,
    functionName: "getAmountsOut",
    args:
      borrowWei !== undefined
        ? [borrowWei, [tokenA, tokenB]]
        : undefined,
    chainId: FLASH_SEPOLIA_CHAIN_ID,
    query: {
      enabled: isSepolia && borrowWei !== undefined,
    },
  });

  const expectedTokenBOut =
    amountsOut && amountsOut.length > 0
      ? amountsOut[amountsOut.length - 1]
      : undefined;

  const minTokenBOut =
    expectedTokenBOut !== undefined
      ? (expectedTokenBOut * BigInt(10_000 - slippageBps)) / 10_000n
      : undefined;

  const [simulateHint, setSimulateHint] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [txPhase, setTxPhase] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [successDetail, setSuccessDetail] = useState<FlashSuccessDetail | null>(
    null,
  );
  const [busySim, setBusySim] = useState(false);
  const [busyExec, setBusyExec] = useState(false);

  const poolReady = pairOnChain != null;
  const canAct =
    isSepolia &&
    isConnected &&
    address &&
    poolReady &&
    borrowWei !== undefined &&
    minTokenBOut !== undefined &&
    !quoteError;

  const handleSimulate = async () => {
    if (!address || !canAct || minTokenBOut === undefined || !pairOnChain)
      return;
    setBusySim(true);
    setSimulateHint(null);
    try {
      const dl =
        BigInt(Math.floor(Date.now() / 1000) + Math.max(60, deadlineSec));
      await simulateContract(wagmiConfig, {
        address: FLASH_ARBITRAGE_ADDRESS,
        abi: FLASH_ARBITRAGE_ABI,
        functionName: "executeFlash",
        args: [
          pairOnChain,
          borrowWei!,
          FLASH_ROUTER_B_ADDRESS,
          FLASH_ROUTER_A_ADDRESS,
          minTokenBOut,
          dl,
        ],
        account: address as Address,
        chainId: FLASH_SEPOLIA_CHAIN_ID,
      });
      setSimulateHint("模拟通过：当前参数下合约执行路径可用（仍以实际挖矿结果为准）。");
    } catch (e) {
      setSimulateHint(friendlyRevert(e));
    } finally {
      setBusySim(false);
    }
  };

  const handleExecute = async () => {
    if (!address || !canAct || minTokenBOut === undefined || !pairOnChain)
      return;
    setTxPhase("pending");
    setTxError(null);
    setTxHash(null);
    setSuccessDetail(null);
    setBusyExec(true);
    try {
      const hash = await writeContract(wagmiConfig, {
        address: FLASH_ARBITRAGE_ADDRESS,
        abi: FLASH_ARBITRAGE_ABI,
        functionName: "executeFlash",
        args: [
          pairOnChain,
          borrowWei!,
          FLASH_ROUTER_B_ADDRESS,
          FLASH_ROUTER_A_ADDRESS,
          minTokenBOut,
          BigInt(Math.floor(Date.now() / 1000) + Math.max(60, deadlineSec)),
        ],
        chainId: FLASH_SEPOLIA_CHAIN_ID,
      });
      setTxHash(hash);
      const receipt = await waitFlashReceipt(wagmiConfig, hash);
      if (receipt.status !== "success") {
        setTxPhase("error");
        setTxError("交易上链但未成功（status 非 success）。");
      } else {
        setTxPhase("success");
        const parsed = parseFlashReceiptLogs(receipt.logs);
        setSuccessDetail({
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          ...parsed,
        });
      }
    } catch (e) {
      setTxPhase("error");
      if (e instanceof WaitForTransactionReceiptTimeoutError) {
        setTxError(
          `等待收据超时（>${TX_RECEIPT_TIMEOUT_MS / 1000}s）。若交易已上链，可在浏览器中根据哈希查看。`,
        );
      } else {
        setTxError(friendlyRevert(e));
      }
    } finally {
      setBusyExec(false);
    }
  };

  const reserve0 = reserves?.[0];
  const reserve1 = reserves?.[1];

  const tokenAIs0 =
    token0 != null && token1 != null && addrEq(token0 as string, tokenA);
  const reserveA =
    reserve0 !== undefined && reserve1 !== undefined
      ? tokenAIs0
        ? reserve0
        : reserve1
      : undefined;
  const reserveB =
    reserve0 !== undefined && reserve1 !== undefined
      ? tokenAIs0
        ? reserve1
        : reserve0
      : undefined;

  return (
    <div className="solana-page">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="text-sm text-sol-muted transition hover:text-sol-mint"
          >
            ← 返回首页
          </Link>
          <AppKitButton />
        </div>

        <header className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80">
            FlashArbitrage · Sepolia
          </p>
          <h1 className="solana-title-gradient text-3xl font-bold tracking-tight md:text-4xl">
            闪电兑换
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-sol-muted md:text-base">
            在 Factory A 的 Pair 上闪电借出 TokenA，经 Router 路径套利后归还。
            无需对套利合约预先授权 TokenA。
          </p>
        </header>

        {mounted && !isSepolia && (
          <div
            className="solana-panel mb-6 border-amber-500/35 px-5 py-4 text-sm text-amber-100/95"
            role="status"
          >
            当前网络不是 Sepolia（{FLASH_SEPOLIA_CHAIN_ID}）。请在钱包中切换到
            Sepolia 后再使用本页。
          </div>
        )}

        {(configTokenMismatch || configFactoryMismatch) && isSepolia && (
          <div
            className="solana-panel mb-6 border-amber-500/35 px-5 py-4 text-sm text-amber-100/90"
            role="status"
          >
            提示：链上 FlashArbitrage 的 tokenA/tokenB/factoryA 与前端内置配置不一致，请核对部署地址。
          </div>
        )}

        <div className="grid gap-6">
          <section className="solana-panel p-6 md:p-8">
            <h2 className="text-lg font-semibold text-sol-mint">
              池与代币状态
            </h2>
            <div className="mt-4 grid gap-3 text-sm text-sol-muted md:grid-cols-2">
              <div className="solana-stat p-3">
                <p className="text-xs uppercase tracking-wider text-sol-muted/80">
                  Token A
                </p>
                <p className="mt-1 font-mono text-xs text-sol-ink">
                  {formatAddr(tokenA)}
                </p>
                <p className="mt-1 text-sol-ink">
                  {symA ?? "…"} · decimals {String(decimalsA)}
                </p>
              </div>
              <div className="solana-stat p-3">
                <p className="text-xs uppercase tracking-wider text-sol-muted/80">
                  Token B
                </p>
                <p className="mt-1 font-mono text-xs text-sol-ink">
                  {formatAddr(tokenB)}
                </p>
                <p className="mt-1 text-sol-ink">
                  {symB ?? "…"} · decimals {String(decimalsB)}
                </p>
              </div>
            </div>

            <div className="mt-4 solana-stat p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-violet-200/90">
                Pair（储备）
              </p>
              <p className="mt-2 font-mono text-xs text-sol-ink break-all">
                {pairForReserves}
              </p>
              {!poolReady && (
                <p className="mt-2 text-amber-200/90">
                  Factory A 上未解析到 tokenA/tokenB 交易对（getPair 为
                  0），无法执行闪电兑换。
                </p>
              )}
              {pairMismatch && (
                <p className="mt-2 text-amber-200/90">
                  链上 getPair 结果与配置的 pairA 地址不一致，执行时将使用链上地址。
                </p>
              )}
              {reserveA !== undefined && reserveB !== undefined && (
                <p className="mt-3 text-sol-muted">
                  储备：{formatUnits(reserveA, decimalsA)} {symA ?? "A"} ·{" "}
                  {formatUnits(reserveB, decimalsB)} {symB ?? "B"}
                </p>
              )}
            </div>
          </section>

          <section className="solana-panel p-6 md:p-8">
            <h2 className="text-lg font-semibold text-violet-300">
              执行参数
            </h2>
            <label className="mt-5 block text-sm text-sol-muted">
              借贷数量（{symA ?? "TokenA"}）
              <input
                type="text"
                inputMode="decimal"
                value={borrowInput}
                onChange={(e) => setBorrowInput(e.target.value)}
                placeholder="0.0"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sol-ink outline-none ring-sol-mint/30 focus:ring-2"
              />
            </label>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-sol-muted">
                  滑点（RouterB 最小 TokenB 产出）
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SLIPPAGE_BPS_OPTIONS.map((bps) => (
                    <button
                      key={bps}
                      type="button"
                      onClick={() => setSlippageBps(bps)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        slippageBps === bps
                          ? "bg-sol-mint/25 text-sol-mint ring-1 ring-sol-mint/50"
                          : "bg-white/5 text-sol-muted hover:bg-white/10"
                      }`}
                    >
                      {(bps / 100).toFixed(1)}%
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-sol-muted">
                  截止时间（自现在起秒数，最少 60）
                  <input
                    type="number"
                    min={60}
                    step={60}
                    value={deadlineSec}
                    onChange={(e) =>
                      setDeadlineSec(
                        Math.max(60, Number(e.target.value) || 600),
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 font-mono text-sm text-sol-ink outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 solana-stat space-y-2 p-4 text-sm">
              <p className="text-sol-muted">
                RouterB 参考报价（getAmountsOut）→ 预期{" "}
                <span className="font-medium text-sol-ink">
                  {expectedTokenBOut !== undefined
                    ? `${formatUnits(expectedTokenBOut, decimalsB)} ${symB ?? "B"}`
                    : borrowWei !== undefined
                      ? quoteError
                        ? "报价失败（可能无流动性或路径无效）"
                        : "计算中…"
                      : "请输入借贷数量"}
                </span>
              </p>
              <p className="text-sol-muted">
                minTokenBOut（已应用滑点）：
                <span className="ml-1 font-mono text-sol-mint">
                  {minTokenBOut !== undefined
                    ? formatUnits(minTokenBOut, decimalsB)
                    : "—"}
                </span>
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!canAct || busySim || busyExec}
                onClick={handleSimulate}
                className="rounded-xl border border-violet-400/40 bg-violet-500/15 px-5 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busySim ? "模拟中…" : "链上模拟"}
              </button>
              <button
                type="button"
                disabled={!canAct || busyExec || busySim}
                onClick={handleExecute}
                className="rounded-xl bg-gradient-to-r from-sol-mint/90 to-teal-400/85 px-6 py-2.5 text-sm font-bold text-sol-night shadow-[0_0_28px_-6px_rgba(20,241,149,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busyExec ? "交易处理中…" : "执行闪电兑换"}
              </button>
            </div>

            {!isConnected && mounted && (
              <p className="mt-4 text-sm text-sol-muted">
                请先连接钱包以模拟或发送交易。
              </p>
            )}

            {simulateHint && (
              <p
                className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                  simulateHint.startsWith("模拟通过")
                    ? "border-sol-mint/35 bg-sol-mint/10 text-teal-100"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-100/95"
                }`}
              >
                {simulateHint}
              </p>
            )}

            {txPhase === "pending" && (
              <p
                className="mt-4 rounded-lg border border-violet-400/25 bg-violet-500/10 px-4 py-3 text-sm text-violet-100/95"
                role="status"
              >
                {txHash ? (
                  <>
                    <span className="font-medium text-violet-200">
                      交易已广播，正在等待 Sepolia 确认…
                    </span>
                    <br />
                    <span className="text-sol-muted">
                      通常数秒至数十秒；若拥堵可能更久。可随时在浏览器中查看打包状态。
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-violet-200">
                      请在钱包中确认交易…
                    </span>
                    <br />
                    <span className="text-sol-muted">
                      签名通过后，将自动提交到链上并等待收据。
                    </span>
                  </>
                )}
              </p>
            )}

            {txHash && (
              <p className="mt-4 text-sm text-sol-muted">
                交易哈希：{" "}
                <a
                  href={`${FLASH_BLOCK_EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-sol-mint underline-offset-2 hover:underline"
                >
                  {txHash}
                </a>
                <span className="ml-2 text-xs text-sol-muted/80">
                  （在 Etherscan 打开）
                </span>
              </p>
            )}
            {txError && (
              <p className="mt-2 text-sm text-red-300/95">{txError}</p>
            )}

            {txPhase === "success" && successDetail && (
              <div
                className="mt-5 space-y-4 rounded-2xl border border-sol-mint/35 bg-gradient-to-b from-sol-mint/12 to-transparent px-5 py-5"
                role="status"
              >
                <div>
                  <p className="text-base font-semibold text-sol-mint">
                    闪电兑换已成功完成
                  </p>
                  <p className="mt-1 text-sm text-sol-muted">
                    交易已在 Sepolia 上<strong className="text-sol-ink/90">成功执行并确认</strong>
                    ，链上状态已更新。以下为便于核对的分步说明与事件数据。
                  </p>
                </div>

                <ul className="solana-stat space-y-2 p-4 text-sm text-sol-muted">
                  <li>
                    <span className="text-sol-ink/90">确认高度：</span>
                    区块{" "}
                    <span className="font-mono text-sol-mint">
                      #{successDetail.blockNumber.toString()}
                    </span>
                  </li>
                  {successDetail.gasUsed !== undefined && (
                    <li>
                      <span className="text-sol-ink/90">Gas 消耗：</span>
                      <span className="font-mono text-sol-ink/90">
                        {successDetail.gasUsed.toString()}
                      </span>
                      <span className="text-sol-muted">（单位：gas）</span>
                    </li>
                  )}
                </ul>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sol-muted/90">
                    链上流水（合约事件）
                  </p>

                  {successDetail.started && (
                    <div className="rounded-xl border border-white/8 bg-black/25 p-4 text-sm">
                      <p className="font-medium text-teal-200/95">
                        ① 闪电贷开始（FlashStarted）
                      </p>
                      <p className="mt-2 leading-relaxed text-sol-muted">
                        在 Pair{" "}
                        <span className="font-mono text-xs text-sol-ink/90">
                          {formatAddr(successDetail.started.pairA)}
                        </span>{" "}
                        上触发闪电借入，数量为{" "}
                        <strong className="text-sol-ink">
                          {formatUnits(
                            successDetail.started.borrowA,
                            decimalsA,
                          )}{" "}
                          {symA ?? "TokenA"}
                        </strong>
                        。发起方地址为{" "}
                        <span className="font-mono text-xs text-sol-ink/90">
                          {formatAddr(successDetail.started.initiator)}
                        </span>
                        {address &&
                        addrEq(successDetail.started.initiator, address) ? (
                          <span className="text-sol-mint">（与当前连接钱包一致）</span>
                        ) : address ? (
                          <span className="text-amber-200/90">
                            （与当前连接钱包不一致，请核对是否代发或多账户）
                          </span>
                        ) : null}
                        。
                      </p>
                    </div>
                  )}

                  {successDetail.repaid && (
                    <div className="rounded-xl border border-white/8 bg-black/25 p-4 text-sm">
                      <p className="font-medium text-violet-200/95">
                        ② 归还与闭环（FlashRepaid）
                      </p>
                      <p className="mt-2 leading-relaxed text-sol-muted">
                        为在同一笔交易内还清闪电贷，合约向 Pair 支付了{" "}
                        <strong className="text-sol-ink">
                          {formatUnits(
                            successDetail.repaid.paidB,
                            decimalsB,
                          )}{" "}
                          {symB ?? "TokenB"}
                        </strong>
                        （链上记录的应付 TokenB 量）。合约记录的 TokenB{" "}
                        <span className="text-sol-ink/90">盈余（bSurplus）</span>{" "}
                        为{" "}
                        <strong className="text-sol-mint">
                          {formatUnits(
                            successDetail.repaid.bSurplus,
                            decimalsB,
                          )}{" "}
                          {symB ?? "TokenB"}
                        </strong>
                        。
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-sol-muted/85">
                        说明：盈余按合约事件字段展示；若接近 0
                        表示本次路径下 TokenB 侧基本轧平。实际盈亏还取决于池子价差、手续费与滑点，建议结合浏览器交易详情综合判断。
                      </p>
                    </div>
                  )}

                  {successDetail.parseNote && (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
                      {successDetail.parseNote}
                    </p>
                  )}
                </div>

                <p className="text-xs text-sol-muted/80">
                  需要再次操作时，可修改上方借贷数量后重新执行；本页会保留上一笔哈希直至你发起新交易。
                </p>
              </div>
            )}
          </section>

          <section className="solana-panel p-6 md:p-8">
            <h2 className="text-lg font-semibold text-sol-muted">
              合约参考地址
            </h2>
            <ul className="mt-4 space-y-2 font-mono text-[11px] leading-relaxed text-sol-muted md:text-xs">
              <li>FlashArbitrage：{FLASH_ARBITRAGE_ADDRESS}</li>
              <li>Router A / B：{FLASH_ROUTER_A_ADDRESS} · {FLASH_ROUTER_B_ADDRESS}</li>
              <li>Factory A / B：{FLASH_FACTORY_A_ADDRESS} · {FLASH_FACTORY_B_ADDRESS}</li>
              <li>Pair A（配置）：{FLASH_PAIR_A_ADDRESS}</li>
              <li>WETH9：{FLASH_WETH9_ADDRESS}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
