# TokenBank DApp

基于 **Next.js** 和 **Viem** 构建的 TokenBank 前端应用，支持代币存款与取款。

## 技术栈

- **Next.js 16** - React 全栈框架
- **Viem** - 轻量级以太坊 TypeScript 接口
- **Wagmi** - React Hooks 用于以太坊
- **TanStack Query** - 数据获取与缓存

## 合约信息

- **合约地址**: `0xBB5Dce153B4bF0b0106b47A93957f55e3fC28d41`
- **支持网络**: Ethereum Mainnet、Sepolia Testnet

## 功能

- 连接钱包（MetaMask 等注入式钱包）
- 查看 TokenBank 总存款与存款人数
- 查看个人存款余额与钱包代币余额
- 存款：授权 + 存款（自动两步完成）
- 取款

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)，点击「进入 TokenBank」访问应用。

## 项目结构

```
src/
├── app/
│   ├── layout.tsx      # 根布局（含 Providers）
│   ├── page.tsx        # 首页
│   └── tokenbank/
│       └── page.tsx    # TokenBank 页面
├── components/
│   └── providers.tsx   # Wagmi + React Query Provider
├── contracts/
│   ├── tokenbank.ts   # TokenBank ABI 与地址
│   └── erc20.ts       # ERC20 ABI（approve、balanceOf）
└── lib/
    └── wagmi.ts       # Wagmi 配置
```

## 构建

```bash
npm run build
npm start
```
