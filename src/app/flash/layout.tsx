import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "闪电兑换 · FlashArbitrage",
  description:
    "Sepolia 闪电借贷与跨池套利：调用 FlashArbitrage.executeFlash，支持报价、滑点、链上模拟与交易事件解析。",
};

export default function FlashLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
