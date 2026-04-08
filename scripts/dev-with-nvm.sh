#!/usr/bin/env bash
# WSL：若 `npm run dev` 使用 D 盘 npm 且报 node: not found，请在本仓库根目录执行：
#   bash scripts/dev-with-nvm.sh
# 或（已 chmod +x）：
#   ./dev
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

use_nvm_sh() {
  [[ -s "$NVM_DIR/nvm.sh" ]] || return 1
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  if [[ -f "$ROOT/.nvmrc" ]]; then
    nvm install
    nvm use
  else
    nvm use default 2>/dev/null || nvm use node
  fi
  return 0
}

use_nvm_versions_fallback() {
  # 无 nvm.sh 时，直接把已安装的 node*/bin 插到 PATH 最前（压过 Windows 的 npm）
  shopt -s nullglob
  local -a bins=( "$NVM_DIR/versions/node"/*/bin )
  shopt -u nullglob
  ((${#bins[@]} == 0)) && return 1
  export PATH="${bins[-1]}:$PATH"
  return 0
}

if use_nvm_sh; then
  :
elif use_nvm_versions_fallback; then
  echo "已使用 NVM_DIR 下已安装的 Node（未加载 nvm.sh）。建议安装完整 nvm 以便切换版本。"
else
  echo "找不到可用的 Linux Node。"
  echo "1) 安装 nvm：curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "2) 重开终端后：cd 本仓库 && nvm install && bash scripts/dev-with-nvm.sh"
  exit 1
fi

hash -r
if ! command -v node >/dev/null 2>&1; then
  echo "PATH 中仍无 node。"
  exit 1
fi

# 强制使用与当前 node 同目录的 npm，避免继续命中 /mnt/d/.../npm
NODE_DIR="$(dirname "$(command -v node)")"
export PATH="$NODE_DIR:$PATH"
hash -r

echo "Using: $(command -v node) ($(node -v)) · $(command -v npm)"
exec npm run dev
