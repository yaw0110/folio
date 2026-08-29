import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt()

export function render(markdownSource, css, { baseHref = '', interactive = false } = {}) {
  const base = baseHref ? `<base href="${escapeAttribute(baseHref)}">` : ''
  const tokens = markdown.parse(markdownSource, {})
  if (interactive) tokens.forEach((token) => {
    if (!token.map) return
    token.attrSet('data-source-line', String(token.map[0]))
    token.attrJoin('class', 'folio-source-block')
  })
  const interactionStyle = interactive ? '\nbody{user-select:none}.folio-active-section{outline:2px solid #BFDBFE;outline-offset:4px;border-radius:4px}' : ''
  const interaction = interactive ? `<script>const anchors=()=>[...document.querySelectorAll('[data-source-line]')].map(el=>({el,line:Number(el.dataset.sourceLine),y:el.getBoundingClientRect().top+scrollY})).filter(anchor=>Number.isFinite(anchor.line)).sort((a,b)=>a.line-b.line||a.y-b.y);let anchorMap=[];let lockUntil=0;const rebuild=()=>{anchorMap=anchors()};const lineAtY=y=>{if(!anchorMap.length)return 0;let right=anchorMap.findIndex(anchor=>anchor.y>y);if(right<0)return anchorMap[anchorMap.length-1].line;if(right===0)return anchorMap[0].line;const a=anchorMap[right-1],b=anchorMap[right],span=b.y-a.y;return span>0?a.line+(y-a.y)/span*(b.line-a.line):a.line};const yAtLine=line=>{if(!anchorMap.length)return 0;let right=anchorMap.findIndex(anchor=>anchor.line>=line);if(right<0)return anchorMap[anchorMap.length-1].y;if(right===0)return anchorMap[0].y;const a=anchorMap[right-1],b=anchorMap[right],span=b.line-a.line;return span>0?a.y+(line-a.line)/span*(b.y-a.y):a.y};const reportLine=()=>{if(Date.now()<lockUntil)return;rebuild();parent.postMessage({source:'folio-preview',action:'section',line:lineAtY(scrollY),origin:'preview'},'*')};const scheduleReport=()=>requestAnimationFrame(reportLine);addEventListener('dblclick',()=>parent.postMessage({source:'folio-preview',action:'toggle-mode'},'*'));addEventListener('wheel',()=>{lockUntil=0},{passive:true});addEventListener('scroll',scheduleReport,{passive:true});addEventListener('resize',()=>{rebuild();scheduleReport()});addEventListener('load',()=>{rebuild();scheduleReport()});document.fonts?.addEventListener('loadingdone',()=>{rebuild();scheduleReport()});document.querySelectorAll('img').forEach(image=>image.addEventListener('load',()=>{rebuild();scheduleReport()}));addEventListener('message',event=>{if(event.data?.source!=='folio-workbench'||!['line','section'].includes(event.data.action))return;const line=Number(event.data.line);if(!Number.isFinite(line))return;rebuild();lockUntil=Date.now()+150;scrollTo(0,yAtLine(line))})</script>` : ''
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${base}
  <style>${css}\nhtml{box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}html,body{scrollbar-width:none}::-webkit-scrollbar{width:0;height:0}${interactionStyle}</style>
</head>
<body>
  <main class="folio-document">${markdown.renderer.render(tokens, markdown.options, {})}</main>
  ${interaction}
</body>
</html>`
}

export function renderWeChat(markdownSource, css) {
  const theme = readWeChatTheme(css)
  const body = styleWeChatHtml(markdown.render(markdownSource), theme)
  return `<section style="max-width:677px;margin:0 auto;padding:20px 16px;background:${theme.paper};color:${theme.ink};font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.85;letter-spacing:.2px;">${body}</section>`
}

export function renderWeChatDocument(markdownSource, css, { baseHref = '' } = {}) {
  const base = baseHref ? `<base href="${escapeAttribute(baseHref)}">` : ''
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${base}</head>
<body style="margin:0;background:#f5f5f5;">${renderWeChat(markdownSource, css)}</body>
</html>`
}

function readWeChatTheme(css) {
  const fallback = { brand: '#147a5a', ink: '#25332d', muted: '#718078', tint: '#edf8f1', line: '#cce5d6', paper: '#ffffff' }
  return Object.fromEntries(Object.entries(fallback).map(([name, value]) => [name, readColor(css, name, value)]))
}

function readColor(css, name, fallback) {
  const value = css.match(new RegExp(`--folio-wechat-${name}\\s*:\\s*([^;]+);`, 'i'))?.[1]?.trim()
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value ?? '') ? value : fallback
}

function styleWeChatHtml(html, theme) {
  const section = (style, content) => `<section style="${style}">${content}</section>`
  const paragraph = `margin:0 0 18px;font-size:15px;line-height:1.9;text-align:justify;color:${theme.ink};`
  return html
    .replace(/<pre><code(?: class="[^"]*")?>([\s\S]*?)<\/code><\/pre>/g, (_, code) => section(`margin:24px 0;padding:14px 16px;background:${theme.ink};border-radius:8px;overflow:auto;`, `<pre style="margin:0;color:${theme.paper};font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;">${code}</pre>`))
    .replace(/<h1>([\s\S]*?)<\/h1>/g, (_, text) => section(`margin:8px 0 34px;padding:24px 20px 20px;border:1px solid ${theme.line};border-top:6px solid ${theme.brand};background:${theme.paper};`, `<p style="margin:0;color:${theme.brand};font-size:10px;font-weight:800;letter-spacing:2.6px;">FOLIO / WECHAT</p><p style="margin:12px 0 0;color:${theme.ink};font-size:25px;font-weight:800;line-height:1.4;">${text}</p>`))
    .replace(/<h2>([\s\S]*?)<\/h2>/g, (_, text) => section(`display:flex;align-items:center;gap:10px;margin:34px 0 18px;padding-bottom:10px;border-bottom:1px solid ${theme.line};`, `<span style="display:inline-block;padding:3px 8px;background:${theme.brand};color:${theme.paper};font-size:10px;font-weight:800;letter-spacing:1px;">SECTION</span><p style="margin:0;color:${theme.ink};font-size:18px;font-weight:800;line-height:1.45;">${text}</p>`))
    .replace(/<h3>([\s\S]*?)<\/h3>/g, (_, text) => `<p style="margin:26px 0 12px;padding-left:10px;border-left:4px solid ${theme.brand};color:${theme.ink};font-size:16px;font-weight:800;line-height:1.5;">${text}</p>`)
    .replace(/<blockquote>/g, `<section style="margin:24px 0;padding:16px 18px;border-left:4px solid ${theme.brand};background:${theme.tint};">`)
    .replace(/<\/blockquote>/g, '</section>')
    .replace(/<hr>/g, `<section style="width:42px;height:2px;margin:36px auto;background:${theme.brand};"><span>&nbsp;</span></section>`)
    .replace(/<table>/g, `<section style="margin:24px 0;overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">`)
    .replace(/<\/table>/g, '</table></section>')
    .replace(/<th>/g, `<th style="padding:9px;border:1px solid ${theme.line};background:${theme.tint};color:${theme.ink};text-align:left;">`)
    .replace(/<td>/g, `<td style="padding:9px;border:1px solid ${theme.line};color:${theme.ink};vertical-align:top;">`)
    .replace(/<ul>/g, `<ul style="margin:0 0 18px;padding-left:1.4em;color:${theme.ink};">`)
    .replace(/<ol>/g, `<ol style="margin:0 0 18px;padding-left:1.5em;color:${theme.ink};">`)
    .replace(/<li>/g, '<li style="margin:8px 0;padding-left:2px;">')
    .replace(/<img([^>]*)>/g, `<img$1 style="display:block;max-width:100%;height:auto;margin:24px auto;border-radius:6px;">`)
    .replace(/<a href="[^"]*">([\s\S]*?)<\/a>/g, `<span style="color:${theme.brand};font-weight:700;">$1</span>`)
    .replace(/<strong>([\s\S]*?)<\/strong>/g, `<span style="color:${theme.brand};font-weight:800;">$1</span>`)
    .replace(/<em>([\s\S]*?)<\/em>/g, `<span style="color:${theme.muted};font-style:italic;">$1</span>`)
    .replace(/<code>([\s\S]*?)<\/code>/g, `<span style="padding:1px 5px;border-radius:4px;background:${theme.tint};color:${theme.brand};font:12px ui-monospace,SFMono-Regular,Menlo,monospace;">$1</span>`)
    .replace(/<p>/g, `<p style="${paragraph}">`)
}

function escapeAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}
