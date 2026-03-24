import type { Address } from "viem";
import { NFTMARKET_ADDRESS } from "@/contracts/nftmarket";

/** 与链上 NFTMarket EIP-712 domain 一致：name / version / chainId / verifyingContract */
export const NFTMARKET_EIP712_DOMAIN_NAME = "NFTMarket" as const;
export const NFTMARKET_EIP712_DOMAIN_VERSION = "1" as const;

export const permitBuy712Types = {
  PermitBuy: [
    { name: "buyer", type: "address" },
    { name: "listingId", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function nftMarketPermit712Domain(chainId: number) {
  return {
    name: NFTMARKET_EIP712_DOMAIN_NAME,
    version: NFTMARKET_EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract: NFTMARKET_ADDRESS as Address,
  } as const;
}
