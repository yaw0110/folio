# Folio

> 面向个人作者的本地 Markdown 发布工作台

## 使命

让作者从一份 Markdown 稳定地产出可阅读、可交付的 HTML 或 PDF。Folio 保持本地优先、确定性渲染和可回到源文件的工作流，不把编辑器变成云端协作平台或 AI 代写工具。

## 背景

Markdown 适合写作，却常常缺少稳定的排版、预览和交付流程。Folio 把这条链收敛为一个事实源和四个动作：

```text
Markdown → Template → Render → Preview → Export
```

Markdown 是唯一内容源；Template 只负责 CSS 排版；Preview 和 Export 使用同一份 Render 规则。

## 功能

- `folio article.md`：从终端打开一个或多个 Markdown 文件。
- 多文档共享一个本地 daemon，每个文档独立 Tab 和编辑状态。
- Preview 模式默认打开成品；`--workspace` 进入 Markdown 编辑。
- 内置 CSS Template，可实时切换并检测模板 revision 变化。
- 保存回原 Markdown 文件，版本冲突时保留内存草稿。
- 导出同目录、带时间戳的 HTML 或 PDF。
- CLI 使用系统 Chrome 生成 PDF；Electron 安装包使用内置 Chromium。

当前不包含账号、云同步、团队协作、官方平台发布、图片导出和 AI 自动写作。

## 架构

```text
Launcher (CLI / Electron)
          ↓ HTTP
Daemon (Document Store + Template + Export)
          ↓
       Render
       ↙    ↘
   Preview  HTML / PDF
```

五个 Module 各自保持小 Interface：

- Launcher：参数、daemon 生命周期和打开文档。
- Document Store：文档会话、读取、保存、版本检查和本地资源。
- Template：读取模板元数据、CSS 和 SHA-256 revision。
- Render：`render(markdown, css, options)`，纯函数生成完整 HTML。
- Workbench：Vue 编辑、预览、脏状态、保存和导出。

详细契约见 [`docs/modules.md`](./docs/modules.md)、[`docs/design.md`](./docs/design.md) 和 [`docs/architecture.md`](./docs/architecture.md)。

## 安装与开发

需要 Node.js 20+：

```sh
npm ci
npm run build
npm link
folio README.md
```

开发模式：

```sh
npm run dev
node bin/folio.js article.md
```

运行测试：

```sh
npm test
```

## 桌面安装包

终端用户不需要预装 Node.js、npm 或 Chrome：

```sh
npm run dist:win
npm run dist:mac
npm run dist:mac:pkg
```

安装包输出到 `release/`。macOS 用户也可以双击项目内的 `start.command` 启动开发版。

## 期望

Folio 当前优先保证：

1. 相同 Markdown 和 CSS 得到稳定一致的 Render。
2. Preview 与 Export 不出现排版分叉。
3. 模板少而可控，修改后能识别过期 Preview。
4. 保存失败、版本冲突和导出失败都不丢失编辑中的内容。
5. 新格式（如 DOCX、LaTeX）先单向导入 Markdown，不维护多份内容源。

图片、平台交付和 Agent 只有在出现明确的第二种真实实现后才加入新的 Adapter 或 Module。
