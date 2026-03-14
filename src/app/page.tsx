import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <main className="flex flex-col items-center gap-8 px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          TokenBank DApp
        </h1>
        <p className="max-w-md text-lg text-slate-400">
          基于 Next.js 和 Viem 构建的 TokenBank 前端应用，支持代币存款与取款。
        </p>
        <Link
          href="/tokenbank"
          className="rounded-lg bg-emerald-600 px-8 py-4 text-lg font-medium text-white transition hover:bg-emerald-500"
        >
          进入 TokenBank
        </Link>
      </main>
    </div>
  );
}
