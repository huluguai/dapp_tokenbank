"use client";

import {
  useChainId,
  useConfig,
  useReadContract,
  useSignTypedData,
  useWatchContractEvent,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { AppKitButton, useAppKitAccount } from "@reown/appkit/react";
import { useState } from "react";
import { formatUnits, parseSignature, verifyTypedData } from "viem";
import type { Address } from "viem";
import Link from "next/link";
import {
  NFTMARKET_ADDRESS,
  NFTMARKET_ABI,
  NFTMARKET_WHITELIST_SIGNER,
} from "@/contracts/nftmarket";
import { ERC20_ABI } from "@/contracts/erc20";
import {
  nftMarketPermit712Domain,
  permitBuy712Types,
} from "@/lib/nftmarketPermit712";

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

type ListedEvent = {
  type: "Listed";
  listingId: bigint;
  seller: string;
  nftContract: string;
  tokenId: bigint;
  priceInWei: bigint;
  txHash: string;
  timestamp: number;
};

type SoldEvent = {
  type: "Sold";
  listingId: bigint;
  buyer: string;
  seller: string;
  nftContract: string;
  tokenId: bigint;
  priceInWei: bigint;
  txHash: string;
  timestamp: number;
};

type UnlistedEvent = {
  type: "Unlisted";
  listingId: bigint;
  seller: string;
  txHash: string;
  timestamp: number;
};

type MarketEvent = ListedEvent | SoldEvent | UnlistedEvent;

export default function NftMarketPage() {
  const { address, isConnected } = useAppKitAccount();
  const chainId = useChainId();
  const config = useConfig();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const { signTypedDataAsync, isPending: isSignPending } = useSignTypedData();

  const [nftAddress, setNftAddress] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [price, setPrice] = useState("");

  const [queryListingId, setQueryListingId] = useState("");
  const [permitListingId, setPermitListingId] = useState("");
  const [permitAmount, setPermitAmount] = useState("");
  const [permitDeadline, setPermitDeadline] = useState("");
  const [permitSignature, setPermitSignature] = useState("");
  const [unlistId, setUnlistId] = useState("");

  const [signerBuyer, setSignerBuyer] = useState("");
  const [signerListingId, setSignerListingId] = useState("");
  const [signerDeadline, setSignerDeadline] = useState("");
  const [lastSignedSignature, setLastSignedSignature] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const [events, setEvents] = useState<MarketEvent[]>([]);

  // 读取支付代币地址
  const { data: paymentTokenAddress } = useReadContract({
    address: NFTMARKET_ADDRESS,
    abi: NFTMARKET_ABI,
    functionName: "token",
  });

  const { data: paymentTokenDecimals } = useReadContract({
    address: paymentTokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  const { data: paymentTokenSymbol } = useReadContract({
    address: paymentTokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: "symbol",
  });

  const { data: nextListingId } = useReadContract({
    address: NFTMARKET_ADDRESS,
    abi: NFTMARKET_ABI,
    functionName: "nextListingId",
  });

  const { data: whitelistSignerOnChain } = useReadContract({
    address: NFTMARKET_ADDRESS,
    abi: NFTMARKET_ABI,
    functionName: "whitelistSigner",
  });

  const {
    data: tokenAllowance,
    refetch: refetchAllowance,
  } = useReadContract({
    address: paymentTokenAddress as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: "allowance",
    args:
      address && paymentTokenAddress
        ? [address as Address, NFTMARKET_ADDRESS]
        : undefined,
    query: {
      enabled: Boolean(address && paymentTokenAddress),
    },
  });

  const {
    data: listingDetail,
    refetch: refetchListingDetail,
    isFetched: isListingFetched,
  } = useReadContract({
    address: NFTMARKET_ADDRESS,
    abi: NFTMARKET_ABI,
    functionName: "listings",
    args: queryListingId ? [BigInt(queryListingId)] : undefined,
  });

  const {
    data: listingPriceInTokenUnits,
    refetch: refetchListingPrice,
    isFetched: isPriceFetched,
  } = useReadContract({
    address: NFTMARKET_ADDRESS,
    abi: NFTMARKET_ABI,
    functionName: "getPriceInTokenUnits",
    args: queryListingId ? [BigInt(queryListingId)] : undefined,
  });

  const tokenDecimals = paymentTokenDecimals ?? 18;
  const tokenSymbol = (paymentTokenSymbol as string) ?? "TOKEN";

  const toUint = (value: string) => {
    const num = value.trim();
    if (!num) return BigInt(0);
    try {
      const bn = BigInt(num);
      return bn > BigInt(0) ? bn : BigInt(0);
    } catch {
      return BigInt(0);
    }
  };

  const handleList = async () => {
    if (!address) return;
    const nft = nftAddress.trim();
    if (!nft || !nft.startsWith("0x") || nft.length !== 42) return;
    const tid = toUint(tokenId);
    const p = toUint(price);
    if (tid <= BigInt(0) || p <= BigInt(0)) return;
    try {
      await writeContractAsync({
        address: NFTMARKET_ADDRESS,
        abi: NFTMARKET_ABI,
        functionName: "list",
        args: [nft as `0x${string}`, tid, p],
      });
      setTokenId("");
      setPrice("");
    } catch (e) {
      console.error(e);
    }
  };

  const expectedWhitelistSigner =
    (whitelistSignerOnChain as Address | undefined) ??
    (NFTMARKET_WHITELIST_SIGNER as Address);

  const isProjectSignerWallet =
    !!address &&
    address.toLowerCase() === expectedWhitelistSigner.toLowerCase();

  const handlePermitBuy = async () => {
    setActionError(null);
    if (!address || !paymentTokenAddress) return;
    const listingId = toUint(permitListingId);
    const amount = toUint(permitAmount);
    const deadlineStr = permitDeadline.trim();
    const sigHex = permitSignature.trim();
    if (listingId <= BigInt(0) || amount <= BigInt(0)) {
      setActionError("请填写有效的 Listing ID 与支付数量（原始 wei）。");
      return;
    }
    if (!deadlineStr || !sigHex) {
      setActionError("请填写 deadline（Unix 秒）与项目方签发的 0x 签名。");
      return;
    }
    let deadline: bigint;
    try {
      deadline = BigInt(deadlineStr);
    } catch {
      setActionError("deadline 须为十进制整数（Unix 时间戳，秒）。");
      return;
    }
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    if (deadline <= nowSec) {
      setActionError("签名已过期：deadline 必须大于当前时间。");
      return;
    }
    const domain = nftMarketPermit712Domain(chainId);
    const message = {
      buyer: address as Address,
      listingId,
      deadline,
    } as const;
    const signature = (
      sigHex.startsWith("0x") ? sigHex : `0x${sigHex}`
    ) as `0x${string}`;
    const validSig = verifyTypedData({
      address: expectedWhitelistSigner,
      domain,
      types: permitBuy712Types,
      primaryType: "PermitBuy",
      message,
      signature,
    });
    if (!validSig) {
      setActionError(
        "签名校验失败：请确认 buyer 为当前钱包地址，且 listingId、deadline 与项目方签名时一致，并由白名单签名者签发。",
      );
      return;
    }
    let r: `0x${string}`;
    let s: `0x${string}`;
    let vUint8: number;
    try {
      const parsed = parseSignature(signature);
      r = parsed.r;
      s = parsed.s;
      vUint8 = Number(
        parsed.v !== undefined
          ? parsed.v
          : BigInt(27 + (parsed.yParity ?? 0)),
      );
    } catch {
      setActionError("无法解析签名，请粘贴完整的 0x 聚合签名。");
      return;
    }
    try {
      const allowance = tokenAllowance ?? BigInt(0);
      if (allowance < amount) {
        const approveHash = await writeContractAsync({
          address: paymentTokenAddress as Address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [NFTMARKET_ADDRESS, amount],
        });
        await waitForTransactionReceipt(config, { hash: approveHash });
        await refetchAllowance();
      }
      await writeContractAsync({
        address: NFTMARKET_ADDRESS,
        abi: NFTMARKET_ABI,
        functionName: "permitBuy",
        args: [listingId, amount, deadline, vUint8, r, s],
      });
      setPermitAmount("");
      setPermitSignature("");
    } catch (e) {
      console.error(e);
      setActionError(
        e instanceof Error ? e.message : "交易失败，请查看控制台或钱包提示。",
      );
    }
  };

  const handleProjectSignPermit = async () => {
    setActionError(null);
    if (!address) return;
    const buyer = signerBuyer.trim() as Address;
    if (!buyer.startsWith("0x") || buyer.length !== 42) {
      setActionError("项目方签名：买家地址须为 0x 开头的 42 字符地址。");
      return;
    }
    const lid = toUint(signerListingId);
    const dStr = signerDeadline.trim();
    if (lid <= BigInt(0) || !dStr) {
      setActionError("项目方签名：请填写 listingId 与 deadline。");
      return;
    }
    let d: bigint;
    try {
      d = BigInt(dStr);
    } catch {
      setActionError("deadline 须为十进制整数。");
      return;
    }
    try {
      const domain = nftMarketPermit712Domain(chainId);
      const sig = await signTypedDataAsync({
        domain,
        types: permitBuy712Types,
        primaryType: "PermitBuy",
        message: {
          buyer,
          listingId: lid,
          deadline: d,
        },
      });
      setLastSignedSignature(sig);
    } catch (e) {
      console.error(e);
      setActionError(
        e instanceof Error ? e.message : "签名失败，请查看控制台。",
      );
    }
  };

  const copySignature = async () => {
    if (!lastSignedSignature) return;
    try {
      await navigator.clipboard.writeText(lastSignedSignature);
    } catch {
      setActionError("无法写入剪贴板，请手动复制签名。");
    }
  };

  const txBusy = isWritePending || isSignPending;

  const handleUnlist = async () => {
    if (!address) return;
    const id = toUint(unlistId);
    if (id <= BigInt(0)) return;
    try {
      await writeContractAsync({
        address: NFTMARKET_ADDRESS,
        abi: NFTMARKET_ABI,
        functionName: "unlist",
        args: [id],
      });
      setUnlistId("");
    } catch (e) {
      console.error(e);
    }
  };

  // 监听合约事件
  useWatchContractEvent({
    address: NFTMARKET_ADDRESS,
    abi: NFTMARKET_ABI,
    eventName: "Listed",
    onLogs(logs) {
      const now = Date.now();
      setEvents((prev) => {
        const next: MarketEvent[] = logs.map((log) => {
          const args = log.args as unknown as {
            listingId: bigint;
            seller: string;
            nftContract: string;
            tokenId: bigint;
            priceInWei: bigint;
          };
          return {
            type: "Listed",
            listingId: args.listingId,
            seller: args.seller,
            nftContract: args.nftContract,
            tokenId: args.tokenId,
            priceInWei: args.priceInWei,
            txHash: log.transactionHash ?? "",
            timestamp: now,
          };
        });
        return [...next, ...prev].slice(0, 50);
      });
    },
  });

  useWatchContractEvent({
    address: NFTMARKET_ADDRESS,
    abi: NFTMARKET_ABI,
    eventName: "Sold",
    onLogs(logs) {
      const now = Date.now();
      setEvents((prev) => {
        const next: MarketEvent[] = logs.map((log) => {
          const args = log.args as unknown as {
            listingId: bigint;
            buyer: string;
            seller: string;
            nftContract: string;
            tokenId: bigint;
            priceInWei: bigint;
          };
          return {
            type: "Sold",
            listingId: args.listingId,
            buyer: args.buyer,
            seller: args.seller,
            nftContract: args.nftContract,
            tokenId: args.tokenId,
            priceInWei: args.priceInWei,
            txHash: log.transactionHash ?? "",
            timestamp: now,
          };
        });
        return [...next, ...prev].slice(0, 50);
      });
    },
  });

  useWatchContractEvent({
    address: NFTMARKET_ADDRESS,
    abi: NFTMARKET_ABI,
    eventName: "Unlisted",
    onLogs(logs) {
      const now = Date.now();
      setEvents((prev) => {
        const next: MarketEvent[] = logs.map((log) => {
          const args = log.args as unknown as {
            listingId: bigint;
            seller: string;
          };
          return {
            type: "Unlisted",
            listingId: args.listingId,
            seller: args.seller,
            txHash: log.transactionHash ?? "",
            timestamp: now,
          };
        });
        return [...next, ...prev].slice(0, 50);
      });
    },
  });

  const renderEvent = (event: MarketEvent, idx: number) => {
    const time = new Date(event.timestamp).toLocaleTimeString();
    if (event.type === "Listed") {
      return (
        <div
          key={idx}
          className="rounded-lg border border-sol-mint/35 bg-sol-mint/10 p-3 text-sm"
        >
          <div className="flex justify-between">
            <span className="font-semibold text-sol-mint">Listed</span>
            <span className="text-xs text-sol-muted">{time}</span>
          </div>
          <div className="mt-1 space-y-1 text-xs text-sol-muted">
            <div>Listing ID: {event.listingId.toString()}</div>
            <div>Seller: {formatAddress(event.seller)}</div>
            <div>NFT: {formatAddress(event.nftContract)}</div>
            <div>Token ID: {event.tokenId.toString()}</div>
            <div>
              Price(raw): {event.priceInWei.toString()}
            </div>
          </div>
        </div>
      );
    }
    if (event.type === "Sold") {
      return (
        <div
          key={idx}
          className="rounded-lg border border-sol-purple/40 bg-sol-purple/10 p-3 text-sm"
        >
          <div className="flex justify-between">
            <span className="font-semibold text-violet-300">Sold</span>
            <span className="text-xs text-sol-muted">{time}</span>
          </div>
          <div className="mt-1 space-y-1 text-xs text-sol-muted">
            <div>Listing ID: {event.listingId.toString()}</div>
            <div>Buyer: {formatAddress(event.buyer)}</div>
            <div>Seller: {formatAddress(event.seller)}</div>
            <div>NFT: {formatAddress(event.nftContract)}</div>
            <div>Token ID: {event.tokenId.toString()}</div>
            <div>
              Price(raw): {event.priceInWei.toString()}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div
        key={idx}
        className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm"
      >
        <div className="flex justify-between">
          <span className="font-semibold text-rose-300">Unlisted</span>
          <span className="text-xs text-sol-muted">{time}</span>
        </div>
        <div className="mt-1 space-y-1 text-xs text-sol-muted">
          <div>Listing ID: {event.listingId.toString()}</div>
          <div>Seller: {formatAddress(event.seller)}</div>
        </div>
      </div>
    );
  };

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
            <h1 className="bg-gradient-to-r from-violet-300 via-sol-mint to-sol-purple bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              NFT Market
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {chainId && (
              <span className="rounded-full border border-sol-purple/35 bg-sol-purple/15 px-3 py-1 text-xs font-medium text-sol-mint/90">
                Chain ID: {chainId}
              </span>
            )}
            {isConnected && address && (
              <span className="hidden font-mono text-sm text-sol-muted sm:inline">
                {formatAddress(address)}
              </span>
            )}
            <AppKitButton />
          </div>
        </header>

        <div className="solana-panel space-y-8 p-8 shadow-xl">
          <div>
            <p className="mb-2 text-sm text-sol-muted">
              NFTMarket 合约地址:
            </p>
            <a
              href={`https://${chainId === 11155111 ? "sepolia." : ""}etherscan.io/address/${NFTMARKET_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-mono text-sm text-sol-mint hover:underline"
            >
              {NFTMARKET_ADDRESS}
            </a>
            {paymentTokenAddress && (
              <p className="mt-3 text-sm text-sol-muted">
                支付代币:{" "}
                <span className="font-mono text-teal-200">
                  {paymentTokenAddress as string}
                </span>{" "}
                ({tokenSymbol})
              </p>
            )}
            {nextListingId !== undefined && (
              <p className="mt-1 text-sm text-sol-muted">
                下一个 Listing ID:{" "}
                <span className="font-mono text-sol-ink">
                  {nextListingId.toString()}
                </span>
              </p>
            )}
            <p className="mt-2 text-sm text-sol-muted">
              白名单签名者（链上 whitelistSigner）:{" "}
              <span className="break-all font-mono text-amber-200/90">
                {whitelistSignerOnChain
                  ? (whitelistSignerOnChain as string)
                  : NFTMARKET_WHITELIST_SIGNER}
              </span>
            </p>
            <p className="mt-1 text-xs text-sol-muted/75">
              参考常量:{" "}
              <span className="font-mono">{NFTMARKET_WHITELIST_SIGNER}</span>
              。购买须使用项目方对该买家地址、listingId、deadline 的 EIP-712
              PermitBuy 签名。
            </p>
          </div>

          {isConnected ? (
            <>
              {actionError && (
                <div className="rounded-xl border border-rose-500/45 bg-rose-950/35 px-4 py-3 text-sm text-rose-100">
                  {actionError}
                </div>
              )}
              {/* 上架 NFT */}
              <section>
                <h2 className="mb-3 text-lg font-semibold text-sol-ink">上架 NFT</h2>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="NFT 合约地址"
                    value={nftAddress}
                    onChange={(e) => setNftAddress(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                  />
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Token ID (整数)"
                      value={tokenId}
                      onChange={(e) => setTokenId(e.target.value)}
                      className="flex-1 rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                    />
                    <input
                      type="text"
                      placeholder={`价格(原始单位, ${tokenSymbol})`}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="flex-1 rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                    />
                  </div>
                  <button
                    onClick={handleList}
                    disabled={
                      txBusy ||
                      !nftAddress ||
                      !tokenId ||
                      !price
                    }
                    className="mt-1 w-full rounded-xl bg-sol-mint px-6 py-3 font-semibold text-slate-950 shadow-[0_0_24px_-6px_rgba(20,241,149,0.45)] transition hover:brightness-110 disabled:opacity-50"
                  >
                    {txBusy ? "交易提交中..." : "上架 NFT"}
                  </button>
                  <p className="text-xs text-sol-muted/75">
                    注意：价格为原始整数单位（非小数），需确保您已为市场合约授权足够的支付代币。
                  </p>
                </div>
              </section>

              {/* 查询挂单 */}
              <section className="border-t border-white/10 pt-6">
                <h2 className="mb-3 text-lg font-semibold text-sol-ink">查询挂单</h2>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Listing ID"
                      value={queryListingId}
                      onChange={(e) => setQueryListingId(e.target.value)}
                      className="flex-1 rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-purple focus:outline-none focus:ring-2 focus:ring-sol-purple/30"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!queryListingId) return;
                        refetchListingDetail();
                        refetchListingPrice();
                      }}
                      className="rounded-xl border border-sol-purple/45 bg-sol-purple/25 px-6 py-3 font-semibold text-violet-100 shadow-[0_0_20px_-8px_rgba(153,69,255,0.45)] transition hover:bg-sol-purple/35"
                    >
                      刷新
                    </button>
                  </div>

                  {isListingFetched && listingDetail && (
                    <div className="solana-stat mt-2 space-y-1 p-4 text-sm">
                      <div>
                        卖家:{" "}
                        <span className="font-mono">
                          {listingDetail[0] as string}
                        </span>
                      </div>
                      <div>
                        NFT 合约:{" "}
                        <span className="font-mono">
                          {listingDetail[1] as string}
                        </span>
                      </div>
                      <div>
                        Token ID:{" "}
                        <span className="font-mono">
                          {listingDetail[2].toString()}
                        </span>
                      </div>
                      <div>
                        原始价格:{" "}
                        <span className="font-mono">
                          {listingDetail[3].toString()}
                        </span>
                      </div>
                      <div>
                        是否在售:{" "}
                        <span className="font-mono">
                          {listingDetail[4] ? "是" : "否"}
                        </span>
                      </div>
                    </div>
                  )}

                  {isPriceFetched && listingPriceInTokenUnits !== undefined && (
                    <p className="mt-1 text-xs text-sol-muted">
                      代币单位价格:{" "}
                      <span className="font-mono">
                        {formatUnits(
                          listingPriceInTokenUnits as bigint,
                          tokenDecimals,
                        )}{" "}
                        {tokenSymbol}
                      </span>
                    </p>
                  )}
                </div>
              </section>

              {/* 白名单购买 & 下架 */}
              <section className="grid grid-cols-1 gap-6 border-t border-white/10 pt-6 md:grid-cols-2">
                <div>
                  <h2 className="mb-3 text-lg font-semibold text-sol-ink">
                    白名单购买（permitBuy）
                  </h2>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Listing ID"
                      value={permitListingId}
                      onChange={(e) => setPermitListingId(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                    />
                    <input
                      type="text"
                      placeholder={`支付数量(原始 wei, ${tokenSymbol})`}
                      value={permitAmount}
                      onChange={(e) => setPermitAmount(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                    />
                    <input
                      type="text"
                      placeholder="deadline（Unix 秒，须未过期）"
                      value={permitDeadline}
                      onChange={(e) => setPermitDeadline(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                    />
                    <textarea
                      placeholder="项目方签发的 EIP-712 聚合签名（0x…）"
                      value={permitSignature}
                      onChange={(e) => setPermitSignature(e.target.value)}
                      rows={2}
                      className="min-h-[4rem] w-full resize-y rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-sol-mint focus:outline-none focus:ring-2 focus:ring-sol-mint/25"
                    />
                    {paymentTokenAddress && (
                      <p className="text-xs text-sol-muted">
                        当前授权市场合约额度（wei）:{" "}
                        <span className="font-mono">
                          {(tokenAllowance ?? BigInt(0)).toString()}
                        </span>
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handlePermitBuy}
                      disabled={
                        txBusy ||
                        !permitListingId ||
                        !permitAmount ||
                        !permitDeadline ||
                        !permitSignature.trim()
                      }
                      className="w-full rounded-xl bg-sol-mint px-6 py-3 font-semibold text-slate-950 shadow-[0_0_24px_-6px_rgba(20,241,149,0.45)] transition hover:brightness-110 disabled:opacity-50"
                    >
                      {txBusy ? "处理中..." : "授权（如需）并 permitBuy"}
                    </button>
                    <p className="text-xs text-sol-muted/75">
                      流程：若额度不足将先 approve 支付代币给市场合约，再调用
                      permitBuy。签名域为 NFTMarket / v1，类型 PermitBuy(buyer,
                      listingId, deadline)；buyer 必须为当前连接地址。
                    </p>
                  </div>

                  {isProjectSignerWallet && (
                    <div className="mt-6 space-y-3 rounded-xl border border-amber-400/35 bg-amber-500/10 p-4">
                      <h3 className="text-sm font-semibold text-amber-200">
                        项目方：签发 PermitBuy 签名
                      </h3>
                      <input
                        type="text"
                        placeholder="买家钱包地址 (0x…)"
                        value={signerBuyer}
                        onChange={(e) => setSignerBuyer(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs text-sol-ink placeholder:text-sol-muted/55 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Listing ID"
                          value={signerListingId}
                          onChange={(e) => setSignerListingId(e.target.value)}
                          className="flex-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs text-sol-ink placeholder:text-sol-muted/55 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                        />
                        <input
                          type="text"
                          placeholder="deadline (Unix 秒)"
                          value={signerDeadline}
                          onChange={(e) => setSignerDeadline(e.target.value)}
                          className="flex-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs text-sol-ink placeholder:text-sol-muted/55 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleProjectSignPermit}
                        disabled={
                          txBusy ||
                          !signerBuyer.trim() ||
                          !signerListingId ||
                          !signerDeadline.trim()
                        }
                        className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_0_20px_-6px_rgba(245,158,11,0.5)] transition hover:brightness-110 disabled:opacity-50"
                      >
                        {isSignPending ? "请在钱包中签名…" : "钱包签名 PermitBuy"}
                      </button>
                      {lastSignedSignature && (
                        <div className="space-y-2">
                          <textarea
                            readOnly
                            value={lastSignedSignature}
                            rows={2}
                            className="w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1 font-mono text-xs text-sol-muted"
                          />
                          <button
                            type="button"
                            onClick={copySignature}
                            className="text-xs text-amber-300 underline hover:text-amber-200"
                          >
                            复制签名发给买家
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="mb-3 text-lg font-semibold text-sol-ink">下架 NFT</h2>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Listing ID"
                      value={unlistId}
                      onChange={(e) => setUnlistId(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 font-mono text-sm text-sol-ink placeholder:text-sol-muted/55 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/25"
                    />
                    <button
                      onClick={handleUnlist}
                      disabled={txBusy || !unlistId}
                      className="w-full rounded-xl border border-rose-500/50 bg-rose-600/90 px-6 py-3 font-semibold text-white shadow-[0_0_20px_-6px_rgba(244,63,94,0.45)] transition hover:bg-rose-500 disabled:opacity-50"
                    >
                      {txBusy ? "下架中..." : "下架 NFT"}
                    </button>
                    <p className="text-xs text-sol-muted/75">
                      仅挂单的卖家可以下架对应 Listing。
                    </p>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <p className="rounded-xl border border-white/10 bg-black/25 p-6 text-center text-sol-muted">
              请先连接钱包以进行上架、购买和下架操作
            </p>
          )}

          {/* 实时事件流 */}
          <section className="border-t border-white/10 pt-6">
            <h2 className="mb-3 text-lg font-semibold text-sol-ink">合约事件</h2>
            {events.length === 0 ? (
              <p className="text-sm text-sol-muted">
                暂无事件。等待链上产生 Listed / Sold / Unlisted 事件后会自动更新。
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {events.map((e, idx) => renderEvent(e, idx))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

