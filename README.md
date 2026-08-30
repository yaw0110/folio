# Folio

> 本地优先的 Markdown 发布工作台：写作、预览，并交付 HTML / PDF。

Folio 面向需要把 Markdown 变成稳定成品的个人作者。它不接管内容，也不要求账号、云端或复杂配置：一份 Markdown，配一套 Template，就能得到可检查、可保存的 Export。

## 30 秒开始

需要 Node.js 20+：

```sh
npm ci
npm run build
npm link
mdp README.md
```

打开后默认进入 Preview。需要编辑时：

```sh
mdp --workspace article.md
```

在工作台中选择 Template、编辑 Markdown、保存，再点击导出 HTML 或 PDF。

## 使命

缩短“开始写 Markdown”和“交付一份可靠成品”之间的距离。

Folio 的原则很简单：Markdown 是唯一内容源，Template 只负责排版，Preview 和 Export 必须来自同一套确定性 Render。任何时候都可以回到原始 Markdown，而不是维护一份无法追溯的 HTML。

## 背景

Markdown 解决了内容可读性和版本管理，却没有解决交付问题：不同预览方式会产生排版差异，CSS 修改也可能让旧预览失效，多个文件更难在本地工作流中保持一致。

Folio 把这些问题收进一条主链：

```text
Markdown → Template → Render → Preview → Export
```

一个本地 daemon 管理多个文档会话；每个文档有独立的 Tab、草稿和版本。保存冲突或导出失败时，内存中的编辑内容仍然保留。

## 功能

- 从终端打开一个或多个 `.md` 文件：`mdp a.md b.md`。
- 多个文件复用同一个 daemon，每个文档保持独立状态。
- Preview 默认优先；`--workspace` 显式进入编辑模式。
- 从项目内 `templates/<id>/` 选择可复用的 CSS Template。
- 内容或 Template 变化后重新生成 Preview，避免导出过期结果。
- 保存回原 Markdown；携带版本时检测并发修改。
- 导出同目录、带时间戳的 HTML 或 PDF。

常用命令：

```sh
mdp article.md                         # Preview
mdp --workspace article.md             # 编辑
mdp article-a.md article-b.md          # 多文档
mdp --idle-timeout 15m article.md      # 自定义空闲退出
mdp --no-idle-timeout article.md       # 不自动退出
mdp status                             # 查看 daemon
mdp stop                               # 停止 daemon
```

## 架构

```text
Launcher (CLI / Electron)
          │ HTTP
          ▼
Daemon ── Document Store ── Markdown 文件
   │
   ├── Template ── CSS + revision
   └── Render ──── Preview / HTML / PDF
```

运行时只有五个 Module：

- Launcher：参数、daemon 生命周期和打开文档。
- Document Store：文档会话、保存、版本检查和本地资源。
- Template：模板元数据、CSS 和 SHA-256 revision。
- Render：`render(markdown, css, options)`，纯函数生成完整 HTML。
- Workbench：Vue 编辑、预览、脏状态、保存和导出。

Electron 只是另一个 Launcher，并提供内置 Chromium 的 PDF Adapter；不会产生第二套业务状态。详细 Interface 和失败行为见 [`docs/modules.md`](./docs/modules.md)、[`docs/design.md`](./docs/design.md) 与 [`docs/architecture.md`](./docs/architecture.md)。

## 安装与开发

开发模式使用 Node.js 和 npm：

```sh
npm ci
npm run dev
```

构建和测试：

```sh
npm run build
npm test
```

开发者 CLI 的 PDF 使用本机 Chrome 或 Chromium；可通过 `FOLIO_CHROME` 指定可执行文件。

## 桌面安装包

终端用户不需要预装 Node.js、npm 或 Chrome：

最新安装包直接下载：[GitHub Releases](https://github.com/yaw0110/folio/releases)。

```sh
npm run dist:win
npm run dist:mac
npm run dist:mac:pkg
```

产物写入 `release/`。macOS 也可以双击项目内的 `start.command` 启动开发版。

维护者推送 `v*` 标签后，GitHub Actions 会自动测试、构建 macOS/Windows 安装包并创建 Release：

```sh
git tag vX.Y.Z
git push origin vX.Y.Z
```

标签版本必须与 `package.json` 的版本一致。

## 期望与边界

Folio 当前优先保证：

- 相同 Markdown 和 CSS 得到稳定一致的 Render。
- Preview 与 Export 不出现排版分叉。
- Template 修改后能识别过期 Preview。
- 保存、冲突和导出失败都不丢失编辑中的内容。

当前不提供账号、云同步、团队协作、官方平台发布、图片导出或 AI 自动写作。图片、平台交付和 Agent 只有在出现明确的第二种真实实现后，才会加入新的 Adapter 或 Module。

新输入格式（如 DOCX、LaTeX）优先单向导入 Markdown；除非明确需要无损往返，否则不维护多份内容源。
