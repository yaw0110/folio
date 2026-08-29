# Folio 模块功能文档

模块按业务能力划分，优先保持接口小而稳定。

## Launcher（CLI）

- 入口：`bin/folio.js`，命令名 `folio`。
- 参数：`--preview/-p`、`--workspace/-w`、`--idle-timeout <数字或 30m/2h>`、`--no-idle-timeout`。
- 子命令：`status` 查询 daemon；`stop` 发送 `SIGTERM`。
- 流程：解析参数 → 复用或启动 daemon → 注册每个 Markdown → 为每个文档打开浏览器 Tab。
- 失败行为：参数错误、文件不可读或 daemon 启动失败时输出可见错误并返回非零退出码。

## Document Store（daemon 文档会话）

- 实现：`server.js` 内的 `documents: Map`。
- `openDocument(path)` 负责路径规范化、`.md`/普通文件校验、读取内容和会话去重。
- 会话字段：`id`、绝对路径、内存 Markdown、默认 HTML 导出路径。
- `PUT /api/document` 直接覆盖原 Markdown；写入成功后才更新内存缓存。
- 当前不做草稿持久化、文件冲突合并或版本历史。

## Template（模板资源）

- 实现：`template-store.js`。
- 目录约定：`templates/<id>/template.json` + `template.css`；id 仅允许小写字母、数字和连字符。
- 元数据：`id`、`name`、`summary`，可选 `target: "wechat"`。
- `read(id, revision)` 对 CSS 计算 SHA-256；传入旧 revision 返回 HTTP 409，阻止导出过期预览。
- HTML 模板输出 `<name>.html`；公众号模板输出 `<name>.wechat.html`，并将 CSS 转为内联样式片段。

## Render（确定性渲染）

- 实现：`src/render.js`，底层解析器为 `markdown-it`。
- `render(markdown, css, options)` 生成完整 HTML 文档，可选 `<base>` 和预览滚动同步脚本。
- `renderWeChat(markdown, css)` 生成可粘贴的 `<section>` 片段；主题色从 `--folio-wechat-*` CSS 变量读取。
- `renderWeChatDocument` 仅为工作台 iframe 包装完整 HTML，不改变导出片段。
- Render 不读写文件，不依赖 Vue 状态；预览和导出使用同一渲染规则。

## Workbench（Vue 工作台）

- 入口：`src/App.vue`，由 `src/main.js` 挂载；样式在 `src/style.css`。
- 启动时并行读取当前文档与模板列表，默认选择 `ocean`（不存在时选择第一个模板）。
- `mode=workspace` 显示 Markdown 编辑区；默认 `preview` 只显示成品 iframe；双击预览可切换模式。
- 编辑时维护脏状态、最多 100 个历史快照、撤销/重做和编辑器/预览滚动定位。
- 内容或模板改变会使 `previewVersion` 落后；导出按钮在 Preview 未更新时禁用。
- 保存调用 `PUT /api/document`；导出调用 `POST /api/export`。网络失败时以内存内容继续工作并显示 Toast。
- Tab 生命周期负责 client 注册、30 秒 heartbeat 和卸载时注销。

## Static Assets（静态资源）

`server.js` 将 `dist/` 作为 SPA 静态目录，并为 Markdown 相对图片提供受限的 `/api/assets/<documentId>/...` 路径。未知前端路径回退到 `dist/index.html`，支持 Vue history 路由式访问。
