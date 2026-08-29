# Folio 设计文档

## 设计目标

让个人作者从“打开 Markdown”到“可交付 HTML”保持一条可验证的本地闭环：内容可编辑、预览可读、导出稳定，并且不引入账号、云端或复杂状态管理。

## 核心决策

### Markdown 是唯一内容源

Template 只拥有排版 CSS，Preview 与 Export 都由 Markdown 派生。导出的 HTML 不能反向写回内容；未来接入 LaTeX/DOCX 时先单向导入 Markdown，只有明确需要无损往返才重新评估多源模型。

### Preview 与 Export 共享 Render

Preview 在浏览器中即时调用 `render`，Export 请求 daemon 使用同样的 `render`/`renderWeChat`。因此两者的 Markdown、模板 CSS 和 HTML 结构一致；Export 额外通过 CSS SHA-256 revision 防止模板在预览后被修改。

### 每个文档一个会话、一个 Tab

daemon 维护多个独立 `documentId`，CLI 每注册一个文件就打开一个 Tab。重复打开同一路径复用会话，避免重新读取覆盖未保存草稿；Tab 内的 mode、模板、脏状态和 Preview 版本互不共享。

### 默认 Preview，显式进入 Workspace

阅读或确认成品是默认路径，`--workspace` 用于编辑。URL 的 `mode` 是启动时的初始状态，双击预览在两种模式间切换。Preview iframe 使用 sandbox，并通过 `postMessage` 传递滚动定位与切换事件。

## 状态与不变量

```text
加载文档
   │
   ▼
已载入 ──编辑 Markdown/切换模板──▶ 未保存 / 预览过期
   │                                  │
   ├──────────────保存─────────────────┘
   │                                  │
   └──────────────更新 Preview────────▶ 可导出
                                      │
                                      └─模板 revision 变化 → 409，需刷新 Preview
```

- `isDirty = markdown !== savedMarkdown`。
- `previewVersion === contentVersion` 才允许 Export。
- 保存只影响 Markdown 文件，不改变 Preview 版本。
- 导出失败不清除编辑器内容；保存失败也不丢失内存草稿。
- daemon 空闲退出只回收进程，不承诺草稿恢复。

## 交互基线

工作台采用原型 B：左侧 Markdown 编辑器、右侧成品预览；Preview 模式隐藏编辑器和工具栏以扩大阅读区域。编辑器提供行号、当前回退行高亮、字数和 Toast 状态提示。长文滚动通过源码行锚点进行近似同步，不追求逐像素排版一致。

## 失败与边界

- 非 `.md`、不存在或目录路径：打开请求失败，不创建空白会话。
- 模板 id/metadata/CSS 无效：模板请求失败；旧 Preview 仍可留在页面中，但不能用过期 revision 导出。
- Markdown 解析或渲染异常：显示错误 Toast，保留当前输入。
- 文档图片只能读取 Markdown 所在目录及其子路径，跨目录请求返回 403。
- 当前不支持并发外部写入冲突检测；后续若引入文件监听，应先定义覆盖与合并策略。

## 后续演进

先补齐模板编辑、导出质量校验和平台约束检查；只有性能或协作需求被实际验证后，再考虑服务端草稿、WebSocket、版本历史、PDF/图片渲染或 Agent 修改权限。
