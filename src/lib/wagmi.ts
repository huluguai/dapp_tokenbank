import { createConfig, fallback, http, injected } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

export const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [injected()],
  transports: {
    [mainnet.id]: fallback([
      http("https://ethereum-rpc.publicnode.com"),
      http(),
    ]),
    [sepolia.id]: fallback([
      http("https://ethereum-sepolia-rpc.publicnode.com"),
      http("https://rpc.sepolia.org"),
      http(),
    ]),
  },
});
