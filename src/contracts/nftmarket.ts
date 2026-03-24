export const NFTMARKET_ADDRESS =
  "0x84D6B75ddE24F0398aD2033f610bAAd483f52Cb1" as const;

/** 白名单 EIP-712 签名者（与链上 whitelistSigner 一致，便于展示核对） */
export const NFTMARKET_WHITELIST_SIGNER =
  "0xfd8890Be36244f4270602B1F46717882c5ffDf47" as const;

export const NFTMARKET_ABI = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_tokenAddress",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "activeListingByNft",
    inputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPriceInTokenUnits",
    inputs: [
      {
        name: "_listingId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "list",
    inputs: [
      {
        name: "_nftContract",
        type: "address",
        internalType: "address",
      },
      {
        name: "_tokenId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "_price",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "listings",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "seller",
        type: "address",
        internalType: "address",
      },
      {
        name: "nftContract",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "priceInWei",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "isActive",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "permitBuy",
    inputs: [
      { name: "_listingId", type: "uint256", internalType: "uint256" },
      { name: "_amount", type: "uint256", internalType: "uint256" },
      { name: "_deadline", type: "uint256", internalType: "uint256" },
      { name: "_v", type: "uint8", internalType: "uint8" },
      { name: "_r", type: "bytes32", internalType: "bytes32" },
      { name: "_s", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "whitelistSigner",
    inputs: [],
    outputs: [
      { name: "", type: "address", internalType: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextListingId",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract MyTokenV2",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tokensReceived",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unlist",
    inputs: [
      {
        name: "_listingId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Listed",
    inputs: [
      {
        name: "listingId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "seller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "nftContract",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "priceInWei",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Sold",
    inputs: [
      {
        name: "listingId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "buyer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "seller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "nftContract",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "priceInWei",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Unlisted",
    inputs: [
      {
        name: "listingId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "seller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
] as const;

