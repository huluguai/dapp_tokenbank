type ApiError = { error: string };

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as ApiError).error === "string"
  ) {
    return (payload as ApiError).error;
  }
  return fallback;
}

export async function fetchNonce(): Promise<{ nonce: string }> {
  const res = await fetch("/backend/auth/siwe/nonce", { method: "POST" });
  const payload = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(toErrorMessage(payload, `获取 nonce 失败（${res.status}）`));
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as Record<string, unknown>).nonce !== "string"
  ) {
    throw new Error("获取 nonce 失败：响应格式不正确");
  }
  return payload as { nonce: string };
}

export async function siweLogin(args: {
  message: string;
  signature: `0x${string}` | string;
}): Promise<{ token: string; address: string }> {
  const res = await fetch("/backend/auth/siwe/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: args.message, signature: args.signature }),
  });
  const payload = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(toErrorMessage(payload, `SIWE 登录失败（${res.status}）`));
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as Record<string, unknown>).token !== "string" ||
    typeof (payload as Record<string, unknown>).address !== "string"
  ) {
    throw new Error("SIWE 登录失败：响应格式不正确");
  }
  return payload as { token: string; address: string };
}

export type TransferItem = {
  tokenAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  from: string;
  to: string;
  amount: string;
};

export type TransfersResponse = {
  items: TransferItem[];
  nextCursor?: string;
};

export async function fetchTransfers(args: {
  jwt: string;
  limit?: number;
  cursor?: string;
}): Promise<TransfersResponse> {
  const url = new URL("/backend/api/transfers", window.location.origin);
  if (args.limit) url.searchParams.set("limit", String(args.limit));
  if (args.cursor) url.searchParams.set("cursor", args.cursor);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.jwt}`,
    },
  });
  const payload = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(toErrorMessage(payload, `获取转账记录失败（${res.status}）`));
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as Record<string, unknown>).items)
  ) {
    throw new Error("获取转账记录失败：响应格式不正确");
  }
  return payload as TransfersResponse;
}

