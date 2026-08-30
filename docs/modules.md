# Folio 模块

Folio 只保留五个模块；每个模块有一个小 Interface，内部实现不向其他模块泄漏。

## Launcher

`bin/folio.js` 和 Electron 启动器是两个入口 Adapter：解析参数、启动或复用 daemon、打开文档。它们不解析 Markdown，也不维护工作台状态。

## Document Store

`server.js` 内的文档会话 Map 负责打开、缓存和保存 Markdown，并通过 HTTP 暴露文档、模板、资源和导出操作。保存可携带 `version` 做冲突检查；草稿只存在内存中。

## Template

`template-store.js` 只读取 `templates/<id>/template.json` 和 `template.css`，返回 `id`、`name`、`summary`、CSS 与 SHA-256 revision。模板只负责排版，不拥有 Markdown。

## Render

`src/render.js` 的 `render(markdown, css, options)` 是 Preview 与 HTML/PDF Export 共用的唯一渲染入口；它不读写文件，也不依赖 Vue。

## Workbench

`src/App.vue` 负责当前 Tab 的编辑、脏状态、预览版本、保存、导出和生命周期。内容或 CSS 变化后必须先生成新的 Preview 才能 Export。
