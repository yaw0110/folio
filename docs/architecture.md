# Folio 架构文档

## 1. 系统边界

Folio 是一个运行在本机的 Markdown 发布工作台：终端命令负责定位文档并打开浏览器，Node.js daemon 负责本地文件与 HTTP API，Vue 工作台负责编辑、预览和导出操作。

```text
┌─────────────┐     HTTP      ┌──────────────────────────┐
│ folio CLI   │ ─────────────▶ │ Node.js daemon           │
│ 参数/浏览器  │                │ HTTP API + 文档会话       │
└─────────────┘                │ 模板读取 + idle manager   │
                               └──────────┬───────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
              Markdown 文件          templates/              dist/
              读写与会话缓存          template.json/css       Vue 静态资源
                                          │                     ▲
                                          └──── 浏览器 Workbench ─┘
```

系统只在 `127.0.0.1` 提供服务，不包含账号、云同步、数据库或官方平台发布接口。

## 2. 运行时组件

| 组件 | 入口 | 职责 | 状态边界 |
|---|---|---|---|
| Launcher | `bin/folio.js` | 解析参数、启动/复用 daemon、注册文档、打开浏览器 | CLI 调用是短生命周期；`session.json` 记录 daemon PID、端口和 idle timeout |
| Daemon | `server.js` | 提供静态资源与 JSON API，维护文档会话、客户端心跳和空闲退出 | 一个进程内维护多个 `documentId`；Markdown 草稿只在内存中 |
| Template Store | `template-store.js` | 枚举模板、读取元数据/CSS、计算 SHA-256 revision | 模板来自本地 `templates/<id>/`；revision 变化会拒绝旧导出 |
| Render | `src/render.js` | 将 Markdown 与 CSS 渲染为独立 HTML 或公众号内联片段 | 无文件读写；相同输入产生相同输出 |
| Workbench | `src/App.vue` | Vue 状态、编辑器、预览 iframe、保存/导出、滚动同步 | 每个浏览器 Tab 绑定一个文档会话；未保存内容不回写服务器 |

## 3. 请求流

### 打开文档

1. `folio a.md b.md` 解析为 `preview` 模式（可用 `--workspace` 覆盖）。
2. CLI 读取临时 `session.json`；daemon 不可用时以 detached 子进程启动。
3. CLI 对每个路径调用 `POST /api/documents`。daemon 规范化路径、验证 `.md` 普通文件并读取内容；同一路径复用已有会话。
4. CLI 为每个返回的 `documentId` 打开一个浏览器 Tab。

### 预览与导出

```text
markdown + template.css
          │
          ▼
      Render（前端即时执行）
          ├── Preview：iframe srcdoc
          └── Export：POST /api/export → daemon 再次 Render → HTML 文件
```

WorkBench 记录 `contentVersion` 与 `previewVersion`；内容或模板变化后，只有最新 Preview 才能导出。导出时携带模板 `revision`，Template Store 检测 CSS 是否已被外部修改。

### 心跳与退出

Tab 打开时 `POST /api/clients` 注册 client，每 30 秒发送 heartbeat。daemon 每 60 秒清理超过 90 秒未更新的 client；当没有存活 client 且 CLI 活动超过 `idleTimeout`（默认 30 分钟）时关闭 HTTP server，并由 CLI 删除 `session.json`。

## 4. HTTP API

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/documents` | 打开/复用 Markdown，返回 `documentId`、名称和 HTML 导出路径 |
| `GET` | `/api/documents` | 返回当前 daemon 的文档摘要，用于 `status` |
| `GET` | `/api/document?document=<id>` | 读取文档摘要和内存中的 Markdown |
| `PUT` | `/api/document?document=<id>` | 将 Markdown 覆盖写回原文件并更新会话缓存 |
| `GET` | `/api/templates` | 列出模板元数据 |
| `GET` | `/api/templates/<id>` | 读取模板元数据、CSS 和 revision |
| `POST` | `/api/export` | 校验模板 revision，渲染并写出 `.html` 或 `.wechat.html` |
| `GET` | `/api/assets/<documentId>/<path>` | 读取文档目录内的图片等资源 |
| `POST` | `/api/clients` | 注册浏览器 Tab |
| `POST` / `DELETE` | `/api/clients/<id>` | 心跳 / 注销 Tab |

## 5. 安全与一致性约束

- 只接受扩展名为 `.md` 且 `stat().isFile()` 为真的路径。
- 静态资源路径必须位于 `dist/`；文档资源路径必须位于对应 Markdown 目录，禁止路径穿越。
- JSON 请求体上限为 2 MB。
- daemon 绑定回环地址；当前 session 文件未包含 token，不能视为跨用户安全边界。
- 保存失败时保留 Tab 内存中的 Markdown；关闭 Tab 或 daemon 重启会丢失未保存草稿。

## 6. 部署与构建

`npm run build` 生成 `dist/`；`npm test` 先构建再运行 Node 原生测试。发布包包含 CLI、daemon、模板、渲染器和前端源代码，不包含 `node_modules/` 与构建产物目录以外的临时状态。
