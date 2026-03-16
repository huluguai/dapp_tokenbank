"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { AppKitProvider } from "@reown/appkit/react";
import { sepolia } from "@reown/appkit/networks";
import { config } from "@/lib/wagmi";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AppKitProvider
          projectId="1fa92d86ece751f8b6b24f4164ee11a2"
          metadata={{
            name: "TokenBank DApp",
            description: "TokenBank + NFT Market",
            url: "http://localhost:3000",
            icons: ["https://walletconnect.com/meta/favicon.ico"],
          }}
          networks={[sepolia]}
        >
          {children}
        </AppKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}


