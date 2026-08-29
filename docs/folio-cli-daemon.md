# Folio CLI、后台进程与多文档方案

## 目标

- 用一个 `folio` CLI 直接打开 Markdown。
- 默认使用 `preview` 模式，也支持 `--workspace` 编辑模式。
- 多个 Markdown 可以同时打开。
- 多次执行 CLI 复用同一个 Folio daemon 进程。
- 所有文档 Tab 关闭且超过空闲时间后，daemon 自动退出。

## 用户命令

```sh
folio article-a.md
folio article-a.md article-b.md
folio --preview article.md
folio --workspace article.md
folio status
folio stop
folio --idle-timeout 30m article.md
folio --no-idle-timeout article.md
```

默认值：`preview` 模式、30 分钟空闲退出。

每个 Markdown 使用一个浏览器 Tab；多个 Tab 共享一个 Node.js daemon。重复打开同一路径时复用已有文档会话，不重新读取内容，避免丢失未保存草稿。

## ASCII 架构图

```text
┌──────────────────────────────┐
│ 用户终端                     │
│ folio a.md b.md              │
│ folio --workspace a.md       │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ CLI client                   │
│ 参数解析、daemon 握手、开 Tab │
└──────────────┬───────────────┘
               │ session.json: pid/port/token
               ▼
┌─────────────────────────────────────┐
│ Folio daemon（一个 Node.js 进程）    │
│                                     │
│ HTTP API                            │
│  /api/documents                     │
│  /api/documents/:id                 │
│  /api/documents/:id/export          │
│  /api/assets/:id/*                  │
│                                     │
│ Document sessions: A, B, ...        │
│ Client heartbeats + idle manager    │
└──────────────┬──────────────┬───────┘
               │              │
               ▼              ▼
       Markdown 文件       templates/
       a.md / b.md         CSS 模板
               ▲
               │ HTTP + heartbeat
┌──────────────┴──────────────────────┐
│ 浏览器：每个文档一个 Tab              │
│ a.md?document=A&mode=preview         │
│ b.md?document=B&mode=workspace       │
└─────────────────────────────────────┘
```

## Server 状态

```js
documents = Map<documentId, {
  id,
  path,
  markdown,
  exportPath
}>
```

路径在注册时规范化并校验：必须存在、可读、是普通 `.md` 文件。模板仍然由现有 `template-store` 管理。

## CLI 与 daemon 生命周期

1. CLI 读取临时目录中的 `session.json`。
2. session 有效则复用 daemon；无效则清理后启动新 daemon。
3. daemon 注册每个 Markdown 并返回 `documentId`。
4. CLI 为每个新文档打开一个浏览器 Tab；首次启动才需要启动浏览器会话。
5. `folio stop` 请求 daemon 优雅退出并删除 session 文件。

当前 session 文件包含：`pid`、`port`、`idleTimeout`。daemon 只绑定 `127.0.0.1`，暂未实现 token 鉴权，因此该文件不是跨用户安全边界。

## Preview 与 Workspace

模式放在文档 URL 中：

```text
/?document=<id>&mode=preview
/?document=<id>&mode=workspace
```

前端默认读取 `mode`，缺省为 `preview`。Markdown、模板、dirty 状态和 Preview 版本均属于当前 Tab，不在文档之间共享。

## 自动退出

默认空闲时间为 30 分钟，可用 `--idle-timeout` 覆盖，`--no-idle-timeout` 禁用。

浏览器 Tab 启动时注册 client，并定期发送 heartbeat。daemon 每 60 秒检查：

- 有存活 Tab：继续运行。
- 没有存活 Tab，且最近 CLI 请求已超过 idle timeout：关闭 HTTP server、删除 session 文件并退出。

静态资源请求和页面轮询不计为 CLI 活动。heartbeat 用于判断 Tab 是否存活，不能依赖 `beforeunload`。

## 未保存内容

未保存 Markdown 只保存在对应浏览器 Tab 的内存中。关闭 Tab 或 daemon 重启会丢失未保存修改；保存仍然覆盖原始 Markdown 文件。第一版不做 server 端草稿持久化和冲突合并。

## 迭代边界

第一版实现 daemon、多文档浏览器 Tab、Preview 默认值、Workspace 覆盖参数、`status`/`stop` 和 idle timeout。单页面内部 Tab、草稿恢复、WebSocket 和版本历史暂不实现。
