#!/bin/bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Folio 需要 Node.js 20+：https://nodejs.org/"
  read -r -p "按回车关闭..." _
  exit 1
fi

if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "首次启动：正在安装依赖..."
  (cd "$ROOT" && npm install --no-audit --no-fund)
fi

if [[ ! -f "$ROOT/dist/index.html" ]]; then
  echo "首次启动：正在构建 Folio..."
  (cd "$ROOT" && npm run build)
fi

if [[ "$#" -eq 0 ]]; then
  set -- "$ROOT/README.md"
fi

exec node "$ROOT/bin/folio.js" "$@"
