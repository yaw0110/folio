# Folio

Folio 面向个人用户提供 Markdown 到可交付成品的发布工作台。本文件只定义稳定、可共享的业务语言；实现细节和技术选型不属于本文件。

## 内容与模板

**Markdown**：
作者可编辑、可保存的文章内容，也是唯一内容源。预览、模板和导出都从 Markdown 派生。
_Avoid_: HTML 源文件、最终稿、富文本内容

**Template**：
可复用、可编辑的文档排版规则，包含视觉样式与 CSS，不拥有文章内容。
_Avoid_: 主题、皮肤、成品文章

**Render**：
按 Markdown 与 Template 生成 Preview 或 Export 的过程。
_Avoid_: 导出、发布、预览

**Preview**：
Markdown 按 Template 呈现的即时查看结果，不是交付文件。
_Avoid_: 草稿、导出物

## 交付

**Export**：
由 Folio 生成、可保存或传递的成品结果，例如 HTML、PDF 或图片。
_Avoid_: Markdown、Preview

**Platform Delivery**：
按指定图文平台限制生成并交付 Export 的过程；平台接口并非 Folio 的默认职责。
_Avoid_: 发布记录、导出格式、平台账号

## 可选协作

**Agent**：
可选的协作能力，围绕 Markdown 或 Template CSS 提供建议或修改；不取代 Markdown，也不负责确定性渲染、Export 或 Platform Delivery。
_Avoid_: 内容源、渲染器、自动发布器
