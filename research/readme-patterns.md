# 开源项目 README 行文模式调研

调研日期：2026-08-30
目的：为 Folio README 重写提供可复用的信息架构和行文参考。
范围：只阅读项目官方仓库中的 README，不引用二手文章；以下链接均指向项目拥有者维护的原文。

## 先说结论

优秀项目的 README 通常不试图写成完整手册，而是完成三件事：

1. 让读者在首屏知道“这是什么、解决什么问题”。
2. 让读者用最短路径跑通一次（或明确把入口交给官方文档）。
3. 说清楚适用范围和不适用场景，避免错误预期。

常见的有效顺序是：产品定义 → 价值/关键特性 → 安装 → 第一个成功示例 → 深入文档与社区入口。项目越成熟，README 越倾向于短，把 API 细节和长教程交给文档站；工具类项目则会增加可复制命令、对比数据和限制说明。

## 项目对照

| 项目 | README 的信息架构 | 示例密度 | 边界表达 |
| --- | --- | --- | --- |
| Vite | 品牌/徽章 → 一句话定位与核心能力 → 文档 CTA → 包列表 → 贡献 → License/赞助 | 低；没有安装或代码教程，直接引导文档 | 用“开发服务器 + HMR”和“生产构建”定义范围，其余细节交给文档与插件生态 |
| Vue | 标题/徽章 → Getting Started 文档入口 → 赞助 → 支持渠道 → Issue 规则 → 联系方式 → 贡献/生态 → License | 极低；不放代码，也不重复安装命令 | 明确 README 只是仓库入口；使用方式以 vuejs.org 为准，Issue 只收 bug/feature |
| ripgrep | 一句话定义/默认行为 → 快速目录 → 截图 → 对比命令与基准数据 → Why use → Why not use → 原理/兼容性 → 安装、构建、配置、文档 | 高；每个命令可复制，且附输出/时间/限制 | 单独的 “Why shouldn’t I use ripgrep?” 列出 POSIX、平台、功能和性能边界，并提醒单次 benchmark 不足以证明结论 |
| Deno | 定义/架构与文档链接 → 安装（多平台）→ 源码构建 → 第一个可运行程序 → 资源链接 → 贡献 | 中；一个最小 TypeScript 服务示例，含运行命令和 localhost 结果 | 用“runtime、secure defaults”界定产品；完整选项和 API 链接到文档，不在 README 穷举 |

## 逐个观察

### Vite：先卖清楚价值，再把细节交给文档

- 首屏是 logo、徽章、项目名和短定位；随后用少量要点说明开发服务器、HMR、生产构建和插件扩展。
- “Read the Docs”是明显的下一步，而不是在 README 内复制一套入门教程。
- 包列表、变更记录、贡献和 License 放在后段，服务维护者而非第一次使用者。
- README 没有可运行代码，说明它把“快速开始”视为文档站职责；适合已有工具认知、希望快速确认定位的读者。

来源：[Vite README（官方仓库）](https://github.com/vitejs/vite/blob/main/README.md) · [原始 Markdown](https://raw.githubusercontent.com/vitejs/vite/main/README.md)

### Vue：仓库入口不等于产品教程

- 内容极短，主要作用是把读者送到 Getting Started、贡献指南和支持渠道。
- 不在 README 内维护安装命令或示例，减少文档漂移；权威使用说明集中在 [vuejs.org](https://vuejs.org/)。
- 对 Issue 的用途做了限制（bug/feature），把问答导向讨论区或社区；这是对维护成本的直接管理。
- 该模式适合生态成熟、文档站完善的项目；小项目照搬会造成“看完仍不会运行”的断层。

来源：[Vue core README（官方仓库）](https://github.com/vuejs/core/blob/main/README.md) · [原始 Markdown](https://raw.githubusercontent.com/vuejs/core/main/README.md)

### ripgrep：用可验证的命令和反例建立信任

- 开头先定义默认行为（递归搜索、忽略隐藏/忽略文件等）和支持平台，再给出快速目录，读者可以按兴趣跳转。
- 以实际命令、输出行数和耗时对比 grep/ag/ack；同时强调“单次 benchmark 永远不够”，避免把营销数字写成保证。
- “Why should I use ripgrep?” 与 “Why shouldn’t I use ripgrep?” 成对出现：优势和不适用场景同等重要。
- 限制包括非 POSIX 默认工具、特定功能缺失、极端输入下的性能差异和平台安装可用性；这些内容显著降低误用和 Issue 噪音。
- 后半段才放安装、构建、配置、补全和完整用户指南，首屏不被维护细节打断。

来源：[ripgrep README（官方仓库）](https://github.com/BurntSushi/ripgrep/blob/master/README.md) · [原始 Markdown](https://raw.githubusercontent.com/BurntSushi/ripgrep/master/README.md)

### Deno：一条从认识到成功运行的渐进路径

- 先用一句话定义 Deno，再补充 V8、Rust、Tokio 等架构关键词和文档链接，满足好奇但不展开实现细节。
- Installation 覆盖 macOS/Linux、Windows、包管理器等常见路径；源码构建另设入口，不干扰普通用户。
- “Your first Deno program”只有一个最小 TypeScript HTTP 服务，配套运行命令、监听地址和下一步资源，形成可验证的首次成功。
- 额外资源（文档、标准库、JSR、博客）统一放在示例之后；贡献说明收尾。
- 该顺序适合需要降低首次使用门槛的工具。示例应小到可复制，但必须真的能运行。

来源：[Deno README（官方仓库）](https://github.com/denoland/deno/blob/main/README.md) · [原始 Markdown](https://raw.githubusercontent.com/denoland/deno/main/README.md)

## 可迁移到 Folio 的写法

Folio 目前既没有 Vite/Vue 那样成熟的文档站，也不是 ripgrep 那种命令行性能工具；最合适的是 Deno 的“最小成功路径”加 ripgrep 的“明确不做什么”，保留 Vite 的短定位。

建议 README 按以下顺序收敛：

1. **一句话定位**：Folio 是本地优先的 Markdown 发布工作台；不要先讲模块名。
2. **为什么存在**：指出 Markdown 写作与稳定交付之间的断点，用一条 `Markdown → Render → Preview → Export` 主链说明解决方案。
3. **30 秒成功路径**：只保留安装、打开一个文件、保存/导出三步；命令必须可复制。
4. **关键能力**：用 4–6 个结果导向的要点（稳定渲染、模板、预览同步、冲突保护、HTML/PDF），避免把内部实现写成功能。
5. **架构（可选但短）**：一张主链图 + 一段“Markdown 是唯一事实源”；详细契约链接到 `docs/`。
6. **边界**：明确当前不提供云同步、团队协作、官方平台发布和 AI 代写；这类反向承诺参考 ripgrep 的 Why-not 段落。
7. **开发/贡献**：Node 版本、`npm ci`、`npm test` 和文档入口；桌面打包放到末尾。

### 行文和示例密度

- 每段先给结论，再给解释；避免“使命/期望”式抽象口号占据首屏。
- README 内最多一个完整示例：从 `folio article.md` 到导出结果；其余 API、模块契约和设计决策链接出去。
- 命令块只展示用户必须复制的命令；不要把所有开发脚本都列成菜单。
- 对“当前不包含”的功能使用明确、可验证的名词，不用“未来可能支持”制造承诺。

### 不应照搬的模式

- 不照搬 Vue 的极简 README：Folio 仍需要让新用户在本地跑通一次。
- 不照搬 ripgrep 的完整 benchmark：Folio 没有可比的性能指标；除非未来建立可重复基准，否则只描述稳定性承诺。
- 不把架构图扩展成模块目录或调用时序图；README 只回答“主链如何工作”，细节留在 `docs/`。
