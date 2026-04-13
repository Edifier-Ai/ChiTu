#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
MC_DIR="$ROOT_DIR/crawler/MediaCrawler"
VENV_DIR="$MC_DIR/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"

echo "赤兔数据采集系统"
echo "================================"

find_python() {
  if [ -x "$VENV_PYTHON" ]; then
    echo "$VENV_PYTHON"
    return 0
  fi

  if command -v python3.11 >/dev/null 2>&1; then
    echo "python3.11"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    local version
    version="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    if [ "$version" = "3.11" ] || [ "$version" = "3.12" ] || [ "$version" = "3.13" ]; then
      echo "python3"
      return 0
    fi
  fi

  return 1
}

ensure_python_env() {
  local python_cmd
  if ! python_cmd="$(find_python)"; then
    echo "未检测到 Python 3.11+。"
    echo "请先安装 Python 3.11 或 3.12，然后重新执行 ./start.sh"
    exit 1
  fi

  if [ ! -x "$VENV_PYTHON" ]; then
    echo "创建 MediaCrawler 虚拟环境..."
    (cd "$MC_DIR" && "$python_cmd" -m venv .venv)
  fi

  if ! "$VENV_PYTHON" -m pip --version >/dev/null 2>&1; then
    echo "修复虚拟环境中的 pip..."
    "$VENV_PYTHON" -m ensurepip --upgrade
  fi

  echo "检查 Python 依赖..."
  "$VENV_PYTHON" -m pip install --upgrade pip >/dev/null
  "$VENV_PYTHON" -m pip install -r "$MC_DIR/requirements.txt"

  echo "检查 Playwright 浏览器..."
  "$VENV_PYTHON" -m playwright install chromium
}

ensure_node_env() {
  echo "检查 Node 依赖..."
  if [ ! -d "$ROOT_DIR/node_modules" ]; then
    (cd "$ROOT_DIR" && npm install)
  fi
}

ensure_dev_ports() {
  if lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "端口 5173 已被占用。"
    echo "请先关闭旧的赤兔/Vite 开发进程，再重新执行 ./start.sh"
    exit 1
  fi
}

ensure_python_env
ensure_node_env
ensure_dev_ports

echo "启动开发环境..."
cd "$ROOT_DIR"
npm run dev
