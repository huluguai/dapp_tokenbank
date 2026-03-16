"use client";

import { useChainId, useReadContract, useWatchContractEvent, useWriteContract } from "wagmi";
import { AppKitButton, useAppKitAccount } from "@reown/appkit/react";
import { useState } from "react";
import { formatUnits } from "viem";
import { NFTMARKET_ADDRESS, NFTMARKET_ABI } from "@/contracts/nftmarket";
import { ERC20_ABI } from "@/contracts/erc20";

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
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();

  const [nftAddress, setNftAddress] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [price, setPrice] = useState("");

  const [queryListingId, setQueryListingId] = useState("");
  const [buyListingId, setBuyListingId] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [unlistId, setUnlistId] = useState("");

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

  const handleBuy = async () => {
    if (!address) return;
    const listingId = toUint(buyListingId);
    const amount = toUint(buyAmount);
    if (listingId <= BigInt(0) || amount <= BigInt(0)) return;
    try {
      await writeContractAsync({
        address: NFTMARKET_ADDRESS,
        abi: NFTMARKET_ABI,
        functionName: "buyNFT",
        args: [listingId, amount],
      });
      setBuyAmount("");
    } catch (e) {
      console.error(e);
    }
  };

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
          const args = log.args as any;
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
          const args = log.args as any;
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
          const args = log.args as any;
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
          className="rounded-lg bg-emerald-500/10 border border-emerald-500/40 p-3 text-sm"
        >
          <div className="flex justify-between">
            <span className="font-semibold text-emerald-300">Listed</span>
            <span className="text-xs text-slate-400">{time}</span>
          </div>
          <div className="mt-1 space-y-1 text-xs text-slate-300">
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
          className="rounded-lg bg-sky-500/10 border border-sky-500/40 p-3 text-sm"
        >
          <div className="flex justify-between">
            <span className="font-semibold text-sky-300">Sold</span>
            <span className="text-xs text-slate-400">{time}</span>
          </div>
          <div className="mt-1 space-y-1 text-xs text-slate-300">
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
        className="rounded-lg bg-rose-500/10 border border-rose-500/40 p-3 text-sm"
      >
        <div className="flex justify-between">
          <span className="font-semibold text-rose-300">Unlisted</span>
          <span className="text-xs text-slate-400">{time}</span>
        </div>
        <div className="mt-1 space-y-1 text-xs text-slate-300">
          <div>Listing ID: {event.listingId.toString()}</div>
          <div>Seller: {formatAddress(event.seller)}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <header className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-slate-400 transition hover:text-white"
            >
              ← 返回
            </a>
            <h1 className="text-3xl font-bold tracking-tight">NFT Market</h1>
          </div>
          <div className="flex items-center gap-4">
            {chainId && (
              <span className="rounded-full bg-slate-700/60 px-3 py-1 text-sm">
                Chain ID: {chainId}
              </span>
            )}
            {isConnected && address && (
              <span className="hidden font-mono text-sm text-slate-300 sm:inline">
                {formatAddress(address)}
              </span>
            )}
            <AppKitButton />
          </div>
        </header>

        <div className="rounded-2xl border border-slate-600/50 bg-slate-800/40 p-8 shadow-xl backdrop-blur space-y-8">
          <div>
            <p className="mb-2 text-sm text-slate-400">
              NFTMarket 合约地址:
            </p>
            <a
              href={`https://${chainId === 11155111 ? "sepolia." : ""}etherscan.io/address/${NFTMARKET_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-emerald-400 hover:underline break-all text-sm"
            >
              {NFTMARKET_ADDRESS}
            </a>
            {paymentTokenAddress && (
              <p className="mt-3 text-sm text-slate-400">
                支付代币:{" "}
                <span className="font-mono text-emerald-300">
                  {paymentTokenAddress as string}
                </span>{" "}
                ({tokenSymbol})
              </p>
            )}
            {nextListingId !== undefined && (
              <p className="mt-1 text-sm text-slate-400">
                下一个 Listing ID:{" "}
                <span className="font-mono">
                  {nextListingId.toString()}
                </span>
              </p>
            )}
          </div>

          {isConnected ? (
            <>
              {/* 上架 NFT */}
              <section>
                <h2 className="mb-3 text-lg font-semibold">上架 NFT</h2>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="NFT 合约地址"
                    value={nftAddress}
                    onChange={(e) => setNftAddress(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm font-mono placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Token ID (整数)"
                      value={tokenId}
                      onChange={(e) => setTokenId(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm font-mono placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <input
                      type="text"
                      placeholder={`价格(原始单位, ${tokenSymbol})`}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm font-mono placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    onClick={handleList}
                    disabled={
                      isWritePending ||
                      !nftAddress ||
                      !tokenId ||
                      !price
                    }
                    className="mt-1 w-full rounded-lg bg-emerald-600 px-6 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isWritePending ? "交易提交中..." : "上架 NFT"}
                  </button>
                  <p className="text-xs text-slate-500">
                    注意：价格为原始整数单位（非小数），需确保您已为市场合约授权足够的支付代币。
                  </p>
                </div>
              </section>

              {/* 查询挂单 */}
              <section className="border-t border-slate-700/60 pt-6">
                <h2 className="mb-3 text-lg font-semibold">查询挂单</h2>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Listing ID"
                      value={queryListingId}
                      onChange={(e) => setQueryListingId(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm font-mono placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!queryListingId) return;
                        refetchListingDetail();
                        refetchListingPrice();
                      }}
                      className="rounded-lg bg-sky-600 px-6 py-3 font-medium transition hover:bg-sky-500"
                    >
                      刷新
                    </button>
                  </div>

                  {isListingFetched && listingDetail && (
                    <div className="mt-2 rounded-lg bg-slate-700/50 p-4 text-sm space-y-1">
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
                    <p className="mt-1 text-xs text-slate-400">
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

              {/* 购买 & 下架 */}
              <section className="border-t border-slate-700/60 pt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <h2 className="mb-3 text-lg font-semibold">购买 NFT</h2>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Listing ID"
                      value={buyListingId}
                      onChange={(e) => setBuyListingId(e.target.value)}
                      className="w-full rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm font-mono placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <input
                      type="text"
                      placeholder={`支付数量(原始单位, ${tokenSymbol})`}
                      value={buyAmount}
                      onChange={(e) => setBuyAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm font-mono placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      onClick={handleBuy}
                      disabled={
                        isWritePending || !buyListingId || !buyAmount
                      }
                      className="w-full rounded-lg bg-emerald-600 px-6 py-3 font-medium transition hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {isWritePending ? "购买中..." : "购买 NFT"}
                    </button>
                    <p className="text-xs text-slate-500">
                      购买前请确认已为市场合约授权足够数量的支付代币，且 `_amount`
                      与价格保持一致。
                    </p>
                  </div>
                </div>

                <div>
                  <h2 className="mb-3 text-lg font-semibold">下架 NFT</h2>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Listing ID"
                      value={unlistId}
                      onChange={(e) => setUnlistId(e.target.value)}
                      className="w-full rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm font-mono placeholder-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                    <button
                      onClick={handleUnlist}
                      disabled={isWritePending || !unlistId}
                      className="w-full rounded-lg bg-rose-600 px-6 py-3 font-medium transition hover:bg-rose-500 disabled:opacity-50"
                    >
                      {isWritePending ? "下架中..." : "下架 NFT"}
                    </button>
                    <p className="text-xs text-slate-500">
                      仅挂单的卖家可以下架对应 Listing。
                    </p>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <p className="rounded-xl bg-slate-700/30 p-6 text-center text-slate-400">
              请先连接钱包以进行上架、购买和下架操作
            </p>
          )}

          {/* 实时事件流 */}
          <section className="border-t border-slate-700/60 pt-6">
            <h2 className="mb-3 text-lg font-semibold">合约事件</h2>
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">
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

