# Folio

> Markdown publishing workspace for individual authors

Folio 是面向个人用户的 Markdown 发布工作台。用户从终端命令打开 Markdown 文件，在工作台中选择内置 CSS 模板、预览成品，并导出可交付的文件。

## 使用 CLI

需要 Node.js 20+。在仓库目录首次运行：

```sh
npm install
npm run build
npm link
```

macOS 用户也可以直接双击项目里的 `start.command` 一键启动；首次运行会自动安装依赖并构建，未传入文件时默认打开 `README.md`。之后无需再手动执行 npm 命令。

CLI 默认以 Preview 模式打开一个或多个 `.md` 文件；多个文件会在浏览器中分别打开 Tab，但复用同一个 Folio daemon。保存会覆写对应 Markdown；导出会将最新 Preview 写为同目录、带时间后缀的 `.html` / `.pdf`。

```sh
folio "$PWD/README.md"                    # 默认 Preview
folio article-a.md article-b.md            # 同时打开多个文件
folio --workspace article.md               # 编辑模式
folio --preview article.md                 # 显式 Preview
folio --idle-timeout 15m article.md        # 15 分钟空闲后退出
folio --no-idle-timeout article.md         # 禁用自动退出
folio status                                # 查看 daemon
folio stop                                  # 停止 daemon
```

CLI、daemon、多文档和自动退出方案见 [`docs/folio-cli-daemon.md`](./docs/folio-cli-daemon.md)；系统分层见 [`docs/architecture.md`](./docs/architecture.md)。

## 开发者模式与终端用户模式

开发者模式继续使用 Node.js/npm：

```sh
npm ci
npm run dev
node bin/folio.js article.md
```

终端用户模式由 Electron 打包，使用安装包即可，不需要预先安装 Node.js、npm 或 Chrome：

```sh
npm run dist:win
# macOS
npm run dist:mac
# macOS 一键安装包
npm run dist:mac:pkg
```

安装包输出到 `release/`；Windows 安装后可直接双击 `.md` 文件打开 Folio。macOS 的 `.dmg` 需要拖入 Applications，`.pkg` 可双击后按安装向导一键安装。

## 产品定位

Folio 的内容源只有 Markdown：模板、预览和导出物都由同一份 Markdown 派生。产品先把 Markdown 稳定地制作成可阅读、可交付的成品，再考虑 AI 协作；它不是通用富文本编辑器、笔记应用或自动代写工具。

## 用户流程

```text
folio article-a.md article-b.md
  → 启动或复用 Folio daemon
  → 分别打开浏览器 Tab
  → 默认进入 Preview
  → 选择内置 CSS 模板
  → 可切换 Workspace 编辑 Markdown
  → 导出 HTML / PDF
```

终端命令打开指定文件；用户在工作台编辑 Markdown、选择模板并预览，确认后保存原文件并导出成品。

- Markdown 是唯一内容源；CSS 只属于 Template。
- Preview 和 Export 必须来自同一次确定性 Render。
- 图片、Platform Delivery 和 Agent 是后续旁路，不阻塞 HTML/PDF 闭环。

## 产品范围

### 当前范围

- 终端启动命令，直接打开一个或多个 Markdown 文件。
- 多个 Markdown Tab 复用同一个后台 daemon 进程。
- 网页工作台中的 Markdown 编辑与预览，以及仅预览模式。
- 模板存放在项目的 `templates/<id>/template.css`；当前保留三套普通样式：「检票单」「翠绿清单」「朱砂长文」。
- 从 Markdown 与模板导出 HTML。
- 从 Markdown 与模板导出 PDF（开发者 CLI 使用系统 Chrome；Electron 安装包使用内置 Chromium）。
- 本地打开与保存原 Markdown 文件。

### 后续范围

- 图片及特定图文平台的交付文件。
- 可选的 AI 插件：协助迭代 Markdown 或模板 CSS。

### 暂不包含

- 官方平台发布接口、账号体系和云同步。
- 团队协作工作区、云同步和跨设备状态同步。
- 以 AI 自动代写为主体的产品信息架构。

## 优先级

1. 渲染品质与 HTML 产物稳定性。
2. CSS 模板的可控性与复用性。
3. PDF、图片及平台交付能力。
4. AI 插件体验。

## 架构方向

当前只确定边界：

- Markdown 是唯一内容源；不得从 HTML 反向维护内容。
- 模板负责排版规则与 CSS，渲染核心必须是确定性的。
- 预览与导出应共享同一套渲染结果，避免所见与所得不一致。
- PDF、图片、平台适配和 AI 插件都不能取代核心渲染能力。

### 输入格式扩展

首版仍以 Markdown 作为唯一内容源。未来加入 LaTeX、DOCX 等格式时，优先采用单向导入：

```text
LaTeX / DOCX
     ↓ 单向导入
Markdown（唯一内容源）
     ↓
Template → Preview → Export
```

这样新格式可以复用现有渲染链，也不需要同时维护多套内容状态。只有明确要求无损往返编辑时，才重新评估多源文档模型。

## 技术选型（当前）

- UI：Vue 3 + Vite，承载多面板、模板管理和撤销/重做。
- CLI/本地文件：Node.js 标准库（`fs/promises`、`http`、`child_process`）。
- Markdown：`markdown-it`，作为确定性 `Render` 的解析器。
- 样式：原生 CSS；每个 Template 以 `template.json` 和 `template.css` 作为本地资源。
- 不引入 React、后端、数据库或平台 SDK，直到需求越过当前边界。

## 原型结论

UI 原型采用 B 方案（深色沉浸式编辑区 + 右侧成品预览与快速调整面板）作为当前工作台基线，见 [`prototype/folio-ui.html?variant=B`](./prototype/folio-ui.html?variant=B)。A/C 方案仅作为对比参考。

## ASCII 架构图

```text
┌────────────────────────┐
│ folio a.md b.md        │ CLI client
└──────────┬─────────────┘
           │ 启动或复用 daemon
           ▼
┌────────────────────────────────┐
│ Folio daemon（一个 Node 进程） │
│ HTTP API + Document Sessions   │
│ Idle Manager + heartbeats      │
└───────┬──────────────┬─────────┘
        │              │
        ▼              ▼
┌──────────────┐  ┌──────────────────────┐
│ a.md / b.md  │  │ 浏览器：每文档一个 Tab │
│ 对应 documentId ││ Preview / Workspace  │
└──────────────┘  └──────────────────────┘
        │              ▲
        ▼              │ HTTP + heartbeat
   a.html / b.html     │
                       │
             Preview → Export（HTML）
```

## 模块划分

按最少、较深的 Module 划分；模块之间通过小 Interface 连接，先不为单一实现增加 Adapter。

各模块的职责、接口和失败行为详见 [`docs/modules.md`](./docs/modules.md)，关键状态与交互决策详见 [`docs/design.md`](./docs/design.md)。

业务名词遵循 [CONTEXT.md](./CONTEXT.md)：`Markdown`、`Template`、`Render`、`Preview`、`Export`、`Platform Delivery`、`Agent`。有对应业务概念的 Module 直接复用这些名称；`Launcher`、`Document Store`、`Workbench` 仅是实现层名称。

| Module | Interface（最小） | 负责 | 不负责 |
|---|---|---|---|
| Launcher | `start(filePaths, options)` | 校验 CLI 参数、启动或复用 daemon、打开浏览器 Tab | Markdown 解析、UI 状态 |
| Document Store | `open(filePath)` / `save(documentId, markdown[, version])` | 管理多个文档会话，读取与保存对应 Markdown 文件 | 模板 CSS、渲染 |
| Template | `list()` / `read(id, revision?)` | 从项目内 `templates/` 提供模板元数据与 CSS | 文章内容、HTML 生成 |
| Render | `render(markdown, css)` | 确定性地生成 Preview/Export 共用的 HTML | 文件读写、Vue 状态 |
| Workbench | 当前 Tab 的编辑/预览状态 | Vue 3 + Vite 的交互、脏状态和版本提示 | 直接操作文件系统、再次解析 Markdown |

### Module Interface 契约

- `Launcher`：任一 `filePath` 不存在或不可读时返回可见错误，不为该路径打开空白工作台；daemon 启动或复用成功后才打开浏览器 Tab。
- `Document Store`：`open(filePath)` 建立或复用文档会话；默认保存直接覆盖对应文件，调用方提供 `version` 时才执行冲突检查。版本冲突或写入失败不得丢失该 Tab 内存中的 Markdown。
- `Template`：模板 `id` 来自 `templates/<id>/`；选择模板只改变 Render 使用的 CSS，不得改变 Markdown。CSS 内容的 SHA-256 是 revision；导出必须使用预览时读取的同一 revision。
- `Render`：纯函数；相同 Markdown 与 CSS 必须产生相同 HTML。解析失败抛出可展示错误，不能由 Workbench 重复解析。
- `Workbench`：未打开文件不能 `preview/save/export`，内容或 CSS 变化后必须先产生新的 Preview 才能 Export。

`Export` 复用 `Render` 的结果，由 Workbench 触发写入 Markdown 同目录的 HTML 或 PDF；图片和 `Platform Delivery` 出现第二种真实实现后再引入 Adapter。

## 功能拆解

### P0：HTML 首发闭环

1. `folio [options] <file.md> [...file.md]`：校验一个或多个 Markdown，启动或复用 daemon，并打开对应浏览器 Tab。
2. Markdown 打开/保存：读取原文件，编辑后明确显示未保存状态，保存回原路径。
3. Markdown 基础渲染：标题、段落、强调、列表、引用、代码和图片，预览可实时更新。
4. B 方案工作台：左侧 Markdown 编辑，右侧成品预览；预览宽度可切换。
5. Template：内置少量 CSS 模板，支持下拉选择；模板 CSS 与元数据位于项目内 `templates/<id>/`，修改后刷新读取；模板修改使旧预览失效。
6. `Export`：仅允许导出最新 `Preview` 版本，生成同目录的 HTML 或 PDF 文件。

### P1：模板与内容可靠性

- 支持工作台内的自定义 CSS 编辑、新建、重命名和删除；本地模板资源可在需要多用户同步时迁移至远端存储。
- 补齐 Markdown 方言、错误提示、图片路径和长文性能。
- 增加自定义模板的新建、重命名和删除。
- 增加撤销/重做（先覆盖 Markdown/CSS 编辑，再扩展到模板管理）。

### P2：交付旁路

- 图片导出及其质量验证。
- 首批图文平台的约束检查与 Platform Delivery。
- Agent 插件：在用户确认后修改 Markdown 或 Template CSS。

### P3：输入格式扩展

- LaTeX、DOCX 等文件导入并转换为 Markdown。
- 原格式的无损往返编辑暂不承诺。

当前模板以项目内本地文件维护，不引入数据库或同步服务。

## 待确认问题

- 多用户同步时的模板归属、共享与版本保留策略。
- HTML 渲染引擎及 Markdown 方言支持范围。
- PDF/图片质量标准与首批平台交付约束。
- 本地文件读写的权限、覆盖策略和跨平台行为。
