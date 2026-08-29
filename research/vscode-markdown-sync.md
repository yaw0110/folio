# VS Code Markdown 编辑器与预览同步定位调研

调研日期：2026-08-29
范围：VS Code 内置 Markdown Preview 与 Markdown Preview Enhanced（其渲染内核 Mume）的公开一手源码，并记录 Folio 的第一轮同步实现。

## 结论

不要用“编辑器与预览的总滚动百分比”、固定行高，或以 `textarea` 的文本行数估算位置。它们都会被自动换行、图片、表格、列表、代码块、字体和 CSS 改变而漂移。

VS Code 内置预览采用的关键模型是：

```text
Markdown parser 的源码行号
  -> 渲染块的 data-line / data-source-line
  -> 浏览器完成布局后的真实 DOM 几何位置
  -> 相邻源码锚点之间的局部插值
  -> 另一侧按“源码行（可带小数）”定位
```

因此，Folio 后续应把“标题索引”升级为“所有可映射 Markdown block 的源码行锚点”。标题可以继续作为最低成本的降级方案，但不能作为同步算法的主数据结构。

## Folio Draft Preview 同步方案（draft）

先固定一条边界：Markdown 文本是唯一内容源；同步层只在“源码行号”和“屏幕几何位置”之间转换，不复制或改写内容。

```text
                                  布局失效事件
                         输入 / 模板 / 图片 / 字体 / 尺寸变化
                                           │ 重建
                                           ▼
┌─────────────────────────┐   渲染(v)     ┌────────────────────────────┐   srcdoc   ┌──────────────────────┐
│ Markdown（唯一内容源）  │──────────────▶│ 渲染管线                    │──────────▶│ 预览 iframe            │
│ 文本值                  │               │ markdown-it token.map       │           │ DOM + 锚点表           │
│ 光标 / 滚动位置         │               │ → 注入 data-source-line     │           │ 源码行 → 预览 Y        │
└───────────┬─────────────┘               └────────────────────────────┘           └──────────┬───────────┘
            │ 编辑器滚动 / 光标                                                             │ 预览滚动
            ▼                                                                                ▼
┌─────────────────────────┐   源码行 / 编辑器 Y        ┌───────────────────────────────┐
│ 编辑器几何              │───────────────────────────▶│ 同步协调器（Workbench）        │
│ 行镜像（或编辑器 API）  │                            │ rAF 合并 / 相邻锚点二分查找   │
│ 源码行 → 编辑器 Y       │◀───────────────────────────│ 局部插值 / 版本校验            │
└─────────────────────────┘      定位编辑器 Y          │ 防回环锁（50–200ms）           │
                                                       └───────────────┬───────────────┘
                                                                       │ 预览 Y / postMessage
                                                                       ▼
                                                               ┌──────────────────────┐
                                                               │ 预览 iframe 滚动      │
                                                               │ scrollTo(预览 Y)      │
                                                               └──────────────────────┘
```

消息层只传 `{ line: number, origin: 'editor' | 'preview' }`；`line` 可以是小数，表示相邻源码锚点之间的局部位置。两侧的 `AnchorMap` 都由实际布局采样得到，重渲染或尺寸变化后丢弃并重建。程序性滚动持有短暂的 `origin lock`，用户新的滚轮/拖拽事件优先并立即解除 lock。

## VS Code 内置 Markdown Preview

### 1. 渲染阶段注入源码锚点

VS Code 的 Markdown-it 插件读取每个 block token 的 `token.map[0]`，把其原始 Markdown 起始行写入 HTML 的 `data-line`，并添加 `code-line` class。`token.map` 是 parser 给出的源码位置，不依赖页面视觉折行。

- [源码：`markdownEngine.ts`，固定提交](https://github.com/microsoft/vscode/blob/cd429513258458bcbe37b17fe714874197fe2adf/extensions/markdown-language-features/src/markdownEngine.ts#L18-L39)
- [测试：渲染结果带 `data-line` 与 `code-line`](https://github.com/microsoft/vscode/blob/cd429513258458bcbe37b17fe714874197fe2adf/extensions/markdown-language-features/src/test/engine.test.ts#L15-L30)

例如 `# hello\n\nworld!` 输出的标题和段落分别带 `data-line="0"` 与 `data-line="2"`。这正是预览 DOM 与源文档之间的稳定身份关系。

### 2. 预览滚动到源码：按真实 DOM 块定位

预览端会缓存带 `code-line` 的元素；缓存以 `documentVersion` 为键，在文档版本变化时失效。它对 fenced code block、嵌套 block 与列表做专门去重/范围处理，而不是假定“一个标题就是一个段落”。

- [锚点缓存和特殊 block 处理](https://github.com/microsoft/vscode/blob/cd429513258458bcbe37b17fe714874197fe2adf/extensions/markdown-language-features/preview-src/scroll-sync.ts#L39-L75)

用户滚动预览时，VS Code 根据 `getBoundingClientRect()` 在可见锚点中二分查找滚动位置的前后元素，再按实际元素高度与相邻锚点的源码行范围做局部插值；代码块还会排除 padding，按代码块的源码行范围单独处理。

- [按页面实际几何查找相邻锚点](https://github.com/microsoft/vscode/blob/cd429513258458bcbe37b17fe714874197fe2adf/extensions/markdown-language-features/preview-src/scroll-sync.ts#L123-L150)
- [预览页面位置反算源码行（包含代码块边界处理）](https://github.com/microsoft/vscode/blob/cd429513258458bcbe37b17fe714874197fe2adf/extensions/markdown-language-features/preview-src/scroll-sync.ts#L279-L328)

这里的插值只发生在两个已知源码锚点之间，并使用浏览器已算出的块高度；它不是全篇的滚动比例。因此长段落自动折行或图片加载后的高度变化不会累计成全局误差。

### 3. 源码滚动到预览：同一套锚点反向定位

给定编辑器行号，预览找到该行前后的 `data-line` 元素，并按其真实矩形位置定位。行号在 block 内或两个 block 之间时才局部插值；否则直接使用该 block 的真实顶部。

- [源码行定位到预览元素](https://github.com/microsoft/vscode/blob/cd429513258458bcbe37b17fe714874197fe2adf/extensions/markdown-language-features/preview-src/scroll-sync.ts#L219-L277)

### 4. 编辑器端保留小数行位置并交给编辑器排版

预览反向同步得到的行号可以有小数。VS Code 将整数部分作为源码行、小数部分换算为该行内的字符位置，然后调用编辑器原生 `revealRange(..., AtTop)`。编辑器本身负责考虑真实折行和当前字体度量。

- [`scrollEditorToLine`：小数行 -> Range -> 原生 reveal](https://github.com/microsoft/vscode/blob/cd429513258458bcbe37b17fe714874197fe2adf/extensions/markdown-language-features/src/preview/scrolling.ts#L10-L29)

### 5. 节流与防同步回环

预览端滚动事件按 50ms 节流。程序性预览滚动时先增加禁用计数并短暂解除，避免它立即触发“预览 -> 编辑器”的反向事件。扩展主机收到预览行号后也会设置 200ms 的 `isScrolling` 窗口，防止编辑器 reveal 导致预览回跳。

- [预览端 50ms 节流、图片加载后再定位与禁用窗口](https://github.com/microsoft/vscode/blob/cd429513258458bcbe37b17fe714874197fe2adf/extensions/markdown-language-features/preview-src/index.ts#L152-L170)
- [预览滚动事件发送源码行](https://github.com/microsoft/vscode/blob/cd429513258458bcbe37b17fe714874197fe2adf/extensions/markdown-language-features/preview-src/index.ts#L770-L783)
- [扩展主机反向 reveal 与 200ms 回环保护](https://github.com/microsoft/vscode/blob/cd429513258458bcbe37b17fe714874197fe2adf/extensions/markdown-language-features/src/preview/preview.ts#L355-L376)

这也是“有延迟但不跳动”与“立即双向互相抢滚动”的分界：仅把主动一侧的事件传播到被动一侧，被动一侧在短暂保护窗口内不再反发事件。

## Markdown Preview Enhanced（Mume）对照

Mume 是 Markdown Preview Enhanced 的公开渲染内核。其结构也证明主流实现依赖 parser source map 与预览 DOM 的实际位置，而不是全篇百分比。

### 相同点：为 block 注入源码行，并构造实测位置表

它在 Markdown-it 的 open token 上设置 `data-source-line`（`token.map[0] + 1`），随后扫描这些 block 元素的真实 `offsetTop`，建立源码行到预览 Y 坐标的 `scrollMap`。缺失的源码行只在相邻锚点之间插值。

- [源码行属性注入](https://github.com/shd101wyy/mume/blob/aa66d6deffd4e5ffafaeab6ecc0d7cf1cd8cf70f/src/custom-markdown-it-features/sourcemap.ts#L1-L29)
- [`scrollMap` 的 DOM 采样与局部插值](https://github.com/shd101wyy/mume/blob/aa66d6deffd4e5ffafaeab6ecc0d7cf1cd8cf70f/src/webview/containers/preview.ts#L245-L317)
- [预览滚动以 `scrollMap` 二分查找源码行](https://github.com/shd101wyy/mume/blob/aa66d6deffd4e5ffafaeab6ecc0d7cf1cd8cf70f/src/webview/containers/preview.ts#L319-L395)

### 与 Folio 不应照搬的部分

Mume 在无法读取宿主编辑器 viewport 时，用 `0.372` 的“golden section”作为预览落点；源码注释明确说明这是因为它无法访问编辑器 viewport。这适合 VS Code webview 的跨进程限制，但 Folio 的编辑区和 iframe 同页可直接通信，不需要该经验值。

- [源码注释与 `0.372` 落点](https://github.com/shd101wyy/mume/blob/aa66d6deffd4e5ffafaeab6ecc0d7cf1cd8cf70f/src/webview/containers/preview.ts#L832-L857)

## 对 Folio 的最小落地建议（第一轮已实施）

第一轮实现前，Folio 以 Markdown 标题数组为同步锚点，并分别估算 textarea 与 iframe 的位置；这会在一个标题下有很长段落、表格或图片时失真。现在已改为按所有可映射 block 的源码行锚点同步。

按 VS Code 模型的最小改造路径，当前已完成第一轮：

1. `render.js` 为所有带 `token.map` 的 block token 输出 `data-source-line`，不再只标记标题。
2. iframe 收集 block 的真实 `getBoundingClientRect()`，建立按源码行排序的预览锚点；图片、字体、窗口尺寸变化和重渲染后重建。
3. 编辑区用与 `textarea` 字号、内边距、换行规则一致的行镜像，采样每个源码行的编辑器 Y 位置。
4. 两个方向发送 `{ line: number, origin }`，由 `requestAnimationFrame` 合并，并用 200ms 防回环锁保护程序性滚动；编辑、撤销、粘贴统一从 `input` 事件更新，重渲染时保留当前源码行，iframe 加载后恢复预览，避免初始位置反向覆盖编辑器；用户滚轮优先。
5. Draft 状态盒子记录最近一次修改、回退或重做的步数与源码行，帮助用户快速定位回退位置；历史快照暂保留最近 100 步。

第二轮交互修复补充：Draft 使用独立的视觉行号栏，行号层 `aria-hidden`、`user-select: none` 且不接收指针事件，因此复制只会取得 Markdown；撤销时在对应源码行后方显示浅黄色高亮，并在下一帧把该行滚回 Draft 盒子可见区域；普通编辑或重做会清除高亮，滚动时高亮与行号跟随编辑器内容同步。恢复内容少于历史行号时，目标行会夹紧到恢复文档的最后一行。

仍保留的边界：编辑器侧暂不引入 CodeMirror/Monaco；行镜像是原生 `textarea` 的最小实现，后续只有在实测误差仍不可接受时才替换。

## 决策依据

内置 VS Code 源码已经给出可直接验证的模式：parser source map 提供稳定身份，浏览器 DOM layout 提供真实空间位置，局部插值只填补两个相邻已知锚点之间的空隙。它直接覆盖当前原型中“长行折行、段落高度差异造成定位超出”的根因。
