import { readContract } from "wagmi/actions";
import type { Config } from "wagmi";
import type { Address } from "viem";

/** Uniswap Permit2 在 Ethereum / Sepolia 等链上的规范部署地址 */
/** Uniswap Permit2 规范部署（EIP-55） */
export const PERMIT2_ADDRESS_CANONICAL =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

const PERMIT2_NONCE_ABI = [
  {
    type: "function",
    name: "nonceBitmap",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "word", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;

/** 与链上 Permit2 EIP712Domain 一致 */
export const PERMIT2_EIP712_DOMAIN_NAME = "Permit2" as const;
export const PERMIT2_EIP712_DOMAIN_VERSION = "1" as const;

/** 与 Permit2 PermitHash.sol 中 SignatureTransfer 一致 */
export const permit2SignatureTransferTypes = {
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const;

const PERMIT2_BY_CHAIN: Partial<Record<number, Address>> = {
  1: PERMIT2_ADDRESS_CANONICAL,
  11155111: PERMIT2_ADDRESS_CANONICAL,
};

export function permit2AddressForChain(chainId: number): Address {
  return PERMIT2_BY_CHAIN[chainId] ?? PERMIT2_ADDRESS_CANONICAL;
}

export function permit2Eip712Domain(
  chainId: number,
  permit2Address: Address = PERMIT2_ADDRESS_CANONICAL,
) {
  return {
    name: PERMIT2_EIP712_DOMAIN_NAME,
    version: PERMIT2_EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract: permit2Address,
  } as const;
}

/** Permit2 Nonces.sol: wordPos = uint248(nonce >> 8), bitPos = uint8(nonce) */
export function permit2NonceWordAndBit(nonce: bigint): {
  wordPos: bigint;
  bitPos: number;
} {
  const wordPos =
    (nonce >> BigInt(8)) &
    ((BigInt(1) << BigInt(248)) - BigInt(1));
  const bitPos = Number(nonce & BigInt(0xff));
  return { wordPos, bitPos };
}

export async function isPermit2SignatureNonceUnused(
  wagmiConfig: Config,
  permit2Address: Address,
  owner: Address,
  nonce: bigint,
): Promise<boolean> {
  const { wordPos, bitPos } = permit2NonceWordAndBit(nonce);
  const bitmap = await readContract(wagmiConfig, {
    address: permit2Address,
    abi: PERMIT2_NONCE_ABI,
    functionName: "nonceBitmap",
    args: [owner, wordPos],
  });
  return ((bitmap >> BigInt(bitPos)) & BigInt(1)) === BigInt(0);
}

function randomUint256(): bigint {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let n = BigInt(0);
  for (let i = 0; i < 32; i++) n = (n << BigInt(8)) | BigInt(buf[i]!);
  return n;
}

export async function pickUnusedPermit2SignatureNonce(
  wagmiConfig: Config,
  permit2Address: Address,
  owner: Address,
  maxAttempts = 48,
): Promise<bigint> {
  for (let i = 0; i < maxAttempts; i++) {
    const nonce = randomUint256();
    if (
      await isPermit2SignatureNonceUnused(
        wagmiConfig,
        permit2Address,
        owner,
        nonce,
      )
    ) {
      return nonce;
    }
  }
  throw new Error("无法找到未使用的 Permit2 签名 nonce，请稍后重试");
}

export function buildPermit2TransferFromMessage(params: {
  token: Address;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
}) {
  return {
    permitted: {
      token: params.token,
      amount: params.amount,
    },
    nonce: params.nonce,
    deadline: params.deadline,
  } as const;
}
