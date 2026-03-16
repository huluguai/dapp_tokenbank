import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-16">
        <header className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">TokenBank DApp</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400 md:text-base">
              基于 Next.js、wagmi 与 Viem 构建的去中心化应用，
              提供代币存款银行与 NFT 交易市场两个模块。
            </p>
          </div>
        </header>

        <main className="grid gap-6 md:grid-cols-2">
          <Link
            href="/tokenbank"
            className="group rounded-2xl border border-emerald-500/40 bg-slate-800/40 p-6 shadow-lg backdrop-blur transition hover:border-emerald-400 hover:bg-slate-800/70"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-emerald-300">
                TokenBank
              </h2>
              <span className="text-sm text-emerald-200 group-hover:translate-x-1 transition">
                进入 →
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              存入/取出 MyToken(V2) 代币，查看总存款、存款人数以及个人存款余额。
            </p>
          </Link>

          <Link
            href="/nftmarket"
            className="group rounded-2xl border border-sky-500/40 bg-slate-800/40 p-6 shadow-lg backdrop-blur transition hover:border-sky-400 hover:bg-slate-800/70"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-sky-300">
                NFT Market
              </h2>
              <span className="text-sm text-sky-200 group-hover:translate-x-1 transition">
                进入 →
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              上架、查询、购买和下架 NFT，并在前端实时监听 Listed / Sold / Unlisted 合约事件。
            </p>
          </Link>
        </main>
      </div>
    </div>
  );
}

