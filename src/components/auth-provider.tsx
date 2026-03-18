"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useChainId, useSignMessage } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";

import { fetchNonce, siweLogin } from "@/lib/backend";

type AuthState = {
  jwt: string | null;
  address: `0x${string}` | null;
  isLoggingIn: boolean;
  error: string | null;
  login: (args: { address: `0x${string}` }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function buildSiweMessage(args: {
  domain: string;
  address: `0x${string}`;
  statement: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
}) {
  return `${args.domain} wants you to sign in with your Ethereum account:
${args.address}

${args.statement}

URI: ${args.uri}
Version: 1
Chain ID: ${args.chainId}
Nonce: ${args.nonce}
Issued At: ${args.issuedAt}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const chainId = useChainId();
  const queryClient = useQueryClient();
  const { signMessageAsync } = useSignMessage();

  const [jwt, setJwt] = useState<string | null>(null);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(() => {
    setJwt(null);
    setAddress(null);
    setError(null);
    queryClient.removeQueries({ queryKey: ["transfers"] });
  }, [queryClient]);

  const login = useCallback(
    async ({ address }: { address: `0x${string}` }) => {
      setIsLoggingIn(true);
      setError(null);
      try {
        const { nonce } = await fetchNonce();
        const issuedAt = new Date().toISOString();
        const domain = window.location.host;
        const uri = window.location.origin;
        const message = buildSiweMessage({
          domain,
          address,
          statement: "Sign in to TokenBank.",
          uri,
          chainId,
          nonce,
          issuedAt,
        });

        const signature = await signMessageAsync({ message });
        const resp = await siweLogin({ message, signature });

        setJwt(resp.token);
        setAddress(resp.address as `0x${string}`);
        queryClient.removeQueries({ queryKey: ["transfers"] });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "登录失败";
        setError(msg);
        setJwt(null);
        setAddress(null);
      } finally {
        setIsLoggingIn(false);
      }
    },
    [chainId, queryClient, signMessageAsync],
  );

  const value = useMemo<AuthState>(
    () => ({ jwt, address, isLoggingIn, error, login, logout }),
    [jwt, address, isLoggingIn, error, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

