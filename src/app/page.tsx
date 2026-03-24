import Link from "next/link";

export default function Home() {
  return (
    <div className="solana-page">
      <div className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-16">
        <header className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sol-mint/80">
              Web3 DApp
            </p>
            <h1 className="solana-title-gradient text-4xl font-bold tracking-tight md:text-5xl">
              TokenBank DApp
            </h1>
            <p className="mt-3 max-w-xl text-sm text-sol-muted md:text-base">
              基于 Next.js、wagmi 与 Viem 构建的去中心化应用，
              提供代币存款银行与 NFT 交易市场两个模块。
            </p>
          </div>
        </header>

        <main className="grid gap-6 md:grid-cols-2">
          <Link
            href="/tokenbank"
            className="group solana-panel rounded-2xl p-6 transition duration-300 hover:border-sol-mint/40 hover:shadow-[0_0_40px_-8px_rgba(20,241,149,0.35)]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-sol-mint">
                TokenBank
              </h2>
              <span className="text-sm text-sol-mint/80 transition group-hover:translate-x-1">
                进入 →
              </span>
            </div>
            <p className="mt-3 text-sm text-sol-muted">
              存入/取出 MyToken(V2) 代币，查看总存款、存款人数以及个人存款余额。
            </p>
          </Link>

          <Link
            href="/nftmarket"
            className="group solana-panel rounded-2xl p-6 transition duration-300 hover:border-sol-purple/50 hover:shadow-[0_0_40px_-8px_rgba(153,69,255,0.4)]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-violet-300">
                NFT Market
              </h2>
              <span className="text-sm text-violet-200/90 transition group-hover:translate-x-1">
                进入 →
              </span>
            </div>
            <p className="mt-3 text-sm text-sol-muted">
              上架、查询、购买和下架 NFT，并在前端实时监听 Listed / Sold / Unlisted 合约事件。
            </p>
          </Link>

          <Link
            href="/erc20wallet"
            className="group solana-panel rounded-2xl p-6 transition duration-300 hover:border-sol-mint/30 hover:shadow-[0_0_36px_-10px_rgba(20,241,149,0.25)] md:col-span-2"
          >
            <div className="flex items-center justify-between">
              <h2 className="bg-gradient-to-r from-sol-mint to-sol-purple bg-clip-text text-xl font-semibold text-transparent">
                ERC20 Wallet
              </h2>
              <span className="text-sm text-sol-muted transition group-hover:translate-x-1 group-hover:text-sol-ink">
                进入 →
              </span>
            </div>
            <p className="mt-3 text-sm text-sol-muted">
              使用 SIWE 登录后查询转账记录（后端 /api/transfers），并展示指定 ERC20 的余额与基本信息。
            </p>
          </Link>
        </main>
      </div>
    </div>
  );
}
