import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy backend (Gin) to avoid CORS and keep a clean base path.
      { source: "/backend/auth/siwe/nonce", destination: "http://127.0.0.1:8080/auth/siwe/nonce" },
      { source: "/backend/auth/siwe/login", destination: "http://127.0.0.1:8080/auth/siwe/login" },
      { source: "/backend/api/transfers", destination: "http://127.0.0.1:8080/api/transfers" },
    ];
  },
};

export default nextConfig;
