# Folio 设计

## 核心闭环

```text
Markdown → Template → Render → Preview → Export (HTML / PDF)
```

Markdown 是唯一内容源；Template 只提供 CSS；Preview 和 Export 使用同一 `render` 实现。平台发布、AI、图片和云同步都不进入当前闭环。

## 状态不变量

- `isDirty = markdown !== savedMarkdown`。
- `previewVersion === contentVersion` 才允许 Export。
- 保存失败或版本冲突时保留内存 Markdown。
- Template revision 变化时拒绝过期 Export。
- daemon 退出不承诺恢复未保存草稿。

## 真实 seam

- `Render` 是纯函数 seam，浏览器 Preview 与 daemon Export 共享它。
- `pdfWriter` 是两个真实 Adapter 的 seam：CLI 使用系统 Chrome，Electron 使用内置 Chromium。
- 没有第二种实现前，不增加 repository、controller、renderer factory 或 target registry。
