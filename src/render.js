import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt()

export function render(markdownSource, css, { baseHref = '', interactive = false, print = false } = {}) {
  const base = baseHref ? `<base href="${escapeAttribute(baseHref)}">` : ''
  const tokens = markdown.parse(markdownSource, {})
  if (interactive) tokens.forEach((token) => {
    if (!token.map) return
    token.attrSet('data-source-line', String(token.map[0]))
    token.attrJoin('class', 'folio-source-block')
  })
  const interactionStyle = interactive ? '\nbody{user-select:none}.folio-active-section{outline:2px solid #BFDBFE;outline-offset:4px;border-radius:4px}' : ''
  const printStyle = print ? '\n@page{size:A4;margin:0}body{margin:0!important}.folio-document{margin:0 auto!important;border:0!important;box-shadow:none!important}' : ''
  const interaction = interactive ? `<script>const anchors=()=>[...document.querySelectorAll('[data-source-line]')].map(el=>({el,line:Number(el.dataset.sourceLine),y:el.getBoundingClientRect().top+scrollY})).filter(anchor=>Number.isFinite(anchor.line)).sort((a,b)=>a.line-b.line||a.y-b.y);let anchorMap=[];let lockUntil=0;const rebuild=()=>{anchorMap=anchors()};const lineAtY=y=>{if(!anchorMap.length)return 0;let right=anchorMap.findIndex(anchor=>anchor.y>y);if(right<0)return anchorMap[anchorMap.length-1].line;if(right===0)return anchorMap[0].line;const a=anchorMap[right-1],b=anchorMap[right],span=b.y-a.y;return span>0?a.line+(y-a.y)/span*(b.line-a.line):a.line};const yAtLine=line=>{if(!anchorMap.length)return 0;let right=anchorMap.findIndex(anchor=>anchor.line>=line);if(right<0)return anchorMap[anchorMap.length-1].y;if(right===0)return anchorMap[0].y;const a=anchorMap[right-1],b=anchorMap[right],span=b.line-a.line;return span>0?a.y+(line-a.line)/span*(b.y-a.y):a.y};const reportLine=()=>{if(Date.now()<lockUntil)return;rebuild();parent.postMessage({source:'folio-preview',action:'section',line:lineAtY(scrollY),origin:'preview'},'*')};const scheduleReport=()=>requestAnimationFrame(reportLine);addEventListener('dblclick',()=>parent.postMessage({source:'folio-preview',action:'toggle-mode'},'*'));addEventListener('wheel',()=>{lockUntil=0},{passive:true});addEventListener('scroll',scheduleReport,{passive:true});addEventListener('resize',()=>{rebuild();scheduleReport()});addEventListener('load',()=>{rebuild();scheduleReport()});document.fonts?.addEventListener('loadingdone',()=>{rebuild();scheduleReport()});document.querySelectorAll('img').forEach(image=>image.addEventListener('load',()=>{rebuild();scheduleReport()}));addEventListener('message',event=>{if(event.data?.source!=='folio-workbench'||!['line','section'].includes(event.data.action))return;const line=Number(event.data.line);if(!Number.isFinite(line))return;rebuild();lockUntil=Date.now()+150;scrollTo(0,yAtLine(line))})</script>` : ''
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${base}
  <style>${css}\nhtml{box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}html,body{scrollbar-width:none}::-webkit-scrollbar{width:0;height:0}${interactionStyle}${printStyle}</style>
</head>
<body>
  <main class="folio-document">${markdown.renderer.render(tokens, markdown.options, {})}</main>
  ${interaction}
</body>
</html>`
}

function escapeAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}
