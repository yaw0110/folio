# Folio 架构

Folio 是本机 Markdown 发布工作台：CLI 或 Electron 启动器打开 daemon，Vue Workbench 负责编辑和预览，daemon 负责文件与 Export。

```text
Launcher → daemon (HTTP) → Document Store
                         ├→ Template
                         ├→ Render → Preview
                         └→ Render → HTML / PDF Export
```

## 运行时组件

| Module | 入口 | 职责 |
|---|---|---|
| Launcher | `bin/folio.js` / `electron/main.cjs` | 参数、daemon 生命周期、打开文档 |
| Document Store | `server.js` | 文档会话、保存、资源读取、HTTP API |
| Template | `template-store.js` | 模板元数据、CSS、revision |
| Render | `src/render.js` | Markdown + CSS → 完整 HTML |
| Workbench | `src/App.vue` | 编辑、Preview、保存、Export |

## HTTP API

- `POST /api/documents`：打开或复用 Markdown 会话。
- `GET/PUT /api/document?document=<id>`：读取或保存 Markdown。
- `GET /api/templates`、`GET /api/templates/<id>`：读取模板。
- `POST /api/export`：写出带时间戳的 HTML。
- `POST /api/export-pdf`：通过当前运行时的 `pdfWriter` 写出 PDF。
- `GET /api/assets/<documentId>/<path>`：读取文档目录内资源。
- `POST/DELETE /api/clients/<id>`：Tab 心跳和注销。

服务只绑定 `127.0.0.1`；文档路径必须是可读的普通 `.md` 文件；资源禁止越过 Markdown 所在目录；JSON 请求体上限为 2 MB。

## 构建

`npm run build` 生成 `dist/`；`npm test` 先构建再运行 Node 原生测试。Electron 只是另一个 Launcher 和 PDF Adapter，不引入第二套业务状态。
