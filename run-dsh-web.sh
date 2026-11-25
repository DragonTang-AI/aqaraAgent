#!/bin/sh
# ---------------------------------------------------------------
# Aqara 空间智能桌面端 · PoC 一键启动 dsh Web UI
# ---------------------------------------------------------------
# 两个关键点（踩过的坑）：
#   1) 必须用「真 Node」而不是 Loomy 自带的 Electron 内核 node，
#      否则加载原生模块（koffi.node 等）会因 macOS 签名 Team ID
#      不一致而 dlopen 失败。
#   2) 用「源码模式」（tsx 直接跑 apps/cli/src/bin.ts），
#      而不是 lib 构建产物；lib 模式在此仓库下插件解析会失败。
# ---------------------------------------------------------------
set -e

DSH_REPO="/Users/admin/Documents/Loomy Workspace/deepseek-harness"
REAL_NODE="/usr/local/bin/node"          # 标准 Node.js（非 Electron）
PORT="${1:-3080}"

# 国内镜像，避免 dsh 内部 pnpm 拉依赖时走官方源
export npm_config_registry="https://registry.npmmirror.com"

# 确保 pnpm / 真 node 在 PATH 前
export PATH="/usr/local/bin:$HOME/.npm-global/bin:$PATH"

cd "$DSH_REPO"

echo "==> 启动 dsh web"
echo "    node : $REAL_NODE ($($REAL_NODE --version))"
echo "    地址 : http://127.0.0.1:${PORT}"
echo ""

exec "$REAL_NODE" --import tsx/esm apps/cli/src/bin.ts web --host 127.0.0.1 --port "$PORT"
