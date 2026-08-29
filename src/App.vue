<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { render, renderWeChatDocument } from './render.js'

const templates = ref([])
const markdown = ref('')
const name = ref('')
const documentId = ref(new URLSearchParams(location.search).get('document') ?? '')
const savedMarkdown = ref('')
const activeTemplate = ref('')
const currentTemplate = ref(null)
const requestedMode = new URLSearchParams(location.search).get('mode')
const mode = ref(requestedMode === 'workspace' ? 'workspace' : 'preview')
const contentVersion = ref(0)
const previewVersion = ref(0)
const previewHtml = ref('')
const toast = ref(null)
const editor = ref(null)
const previewFrame = ref(null)
const draftWidth = ref(0)
const draftChange = ref('等待编辑')
const revertedLine = ref(-1)
const editorScrollTop = ref(0)
let toastTimer
let draftResizeObserver
let clientId
let heartbeatTimer
let activeLine = -1
let editorSyncLockUntil = 0
let previewSyncLockUntil = 0
let editorMirror
let editorLineMetrics = []
let editorMetricsSource = ''
let editorMetricsWidth = 0
let draftHistory = []
let draftHistoryIndex = -1
let pendingHistoryAction = ''

const isDirty = computed(() => markdown.value !== savedMarkdown.value)
const wordCount = computed(() => markdown.value.trim() ? markdown.value.trim().split(/\s+/u).length : 0)
const exportLabel = computed(() => currentTemplate.value?.target === 'wechat' ? '导出公众号 HTML' : '导出 HTML')
function refreshPreview() {
  if (!currentTemplate.value) return
  try {
    if (editor.value) activeLine = lineAtSelection()
    previewSyncLockUntil = performance.now() + 200
    previewHtml.value = currentTemplate.value.target === 'wechat'
      ? renderWeChatDocument(markdown.value, currentTemplate.value.css, { baseHref: `/api/assets/${encodeURIComponent(documentId.value)}/` })
      : render(markdown.value, currentTemplate.value.css, { baseHref: `/api/assets/${encodeURIComponent(documentId.value)}/`, interactive: true })
    previewVersion.value = contentVersion.value
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : '预览无法生成。', 'error')
  }
}

function showToast(text, type = 'success') {
  clearTimeout(toastTimer)
  toast.value = { text, type }
  toastTimer = setTimeout(() => { toast.value = null }, 3_000)
}

function toggleMode() {
  mode.value = mode.value === 'workspace' ? 'preview' : 'workspace'
}

function handlePreviewMessage(event) {
  if (event.data?.source === 'folio-preview' && event.data.action === 'toggle-mode') toggleMode()
  if (event.data?.source === 'folio-preview' && ['line', 'section'].includes(event.data.action)) {
    if (performance.now() < previewSyncLockUntil) return
    const line = Number(event.data.line)
    if (Number.isFinite(line)) {
      activeLine = line
      syncEditorLine(line)
    }
  }
}

function restorePreviewLine() {
  if (!previewFrame.value || activeLine < 0) return
  previewSyncLockUntil = performance.now() + 200
  previewFrame.value.contentWindow?.postMessage({ source: 'folio-workbench', action: 'line', line: activeLine, origin: 'editor' }, '*')
}

function editorLines() {
  if (!editor.value) return []
  const width = editor.value.clientWidth
  if (editorMetricsSource === markdown.value && editorMetricsWidth === width) return editorLineMetrics

  editorMirror ??= document.createElement('div')
  const style = getComputedStyle(editor.value)
  Object.assign(editorMirror.style, { position: 'fixed', top: '0', left: '-9999px', visibility: 'hidden', pointerEvents: 'none', width: `${width}px`, boxSizing: 'border-box', padding: style.padding, font: style.font, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, tabSize: style.tabSize, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' })
  if (!editorMirror.isConnected) document.body.append(editorMirror)

  editorMirror.replaceChildren()
  editorLineMetrics = markdown.value.split('\n').map((line, index) => {
    const marker = document.createElement('span')
    marker.style.display = 'block'
    marker.textContent = line || '\u200b'
    editorMirror.append(marker)
    return { line: index, top: marker.offsetTop }
  })
  const origin = editorLineMetrics[0]?.top ?? 0
  editorLineMetrics.forEach((line) => { line.top -= origin })
  editorMetricsSource = markdown.value
  editorMetricsWidth = width
  return editorLineMetrics
}

function lineAtEditorY(y) {
  const lines = editorLines()
  if (!lines.length) return 0
  let right = lines.findIndex((line) => line.top > y)
  if (right < 0) return lines[lines.length - 1].line
  if (right === 0) return lines[0].line
  const previous = lines[right - 1]
  const next = lines[right]
  const span = next.top - previous.top
  return span > 0 ? previous.line + ((y - previous.top) / span) * (next.line - previous.line) : previous.line
}

function lineAtSelection(source = markdown.value) {
  return source.slice(0, editor.value?.selectionStart ?? 0).split('\n').length - 1
}

function syncPreviewLine(event = { type: 'scroll' }) {
  if (!editor.value || (performance.now() < editorSyncLockUntil && event.type === 'scroll')) return
  editorScrollTop.value = editor.value.scrollTop
  if (event.type !== 'scroll') editorSyncLockUntil = 0
  const line = event.type === 'scroll' ? lineAtEditorY(editor.value.scrollTop) : lineAtSelection(event.target?.value)
  if (line === activeLine) return
  activeLine = line
  previewFrame.value?.contentWindow?.postMessage({ source: 'folio-workbench', action: 'line', line, origin: 'editor' }, '*')
}

function handleEditorInput(event) {
  const nextMarkdown = event.target?.value ?? markdown.value
  const line = lineAtSelection(nextMarkdown)
  const inputType = pendingHistoryAction || event.inputType || 'insertText'
  pendingHistoryAction = ''
  const previousIndex = draftHistoryIndex
  let undoTarget = -1
  for (let index = draftHistoryIndex - 1; index >= 0; index -= 1) if (draftHistory[index].markdown === nextMarkdown) {
    undoTarget = index
    break
  }
  let redoTarget = -1
  for (let index = draftHistoryIndex + 1; index < draftHistory.length; index += 1) if (draftHistory[index].markdown === nextMarkdown) {
    redoTarget = index
    break
  }
  const direction = inputType === 'historyUndo' || (inputType !== 'historyRedo' && undoTarget >= 0) ? -1 : 1
  const target = direction < 0 ? undoTarget : redoTarget
  if (target >= 0) {
    if (target >= 0) draftHistoryIndex = target
    const step = Math.max(1, Math.abs(draftHistoryIndex - previousIndex))
    const affectedLine = draftHistory[direction < 0 ? previousIndex : draftHistoryIndex]?.line ?? line
    draftChange.value = `${direction < 0 ? '回退' : '重做'}第 ${step} 步 · 第 ${affectedLine + 1} 行`
    setRevertedLine(direction < 0 ? affectedLine : -1, nextMarkdown)
    revealEditorLine(affectedLine)
  } else {
    draftHistory = draftHistory.slice(0, draftHistoryIndex + 1)
    draftHistory.push({ markdown: nextMarkdown, selection: event.target?.selectionStart ?? 0, line })
    draftHistoryIndex = draftHistory.length - 1
    if (draftHistory.length > 100) {
      draftHistory.shift()
      draftHistoryIndex -= 1
    }
    draftChange.value = `修改 · 第 ${line + 1} 行`
    setRevertedLine(-1)
  }
  syncPreviewLine(event)
}

function handleEditorKeydown(event) {
  const modifier = event.ctrlKey || event.metaKey
  if (!modifier) return
  const key = event.key.toLowerCase()
  const direction = key === 'z' && !event.shiftKey ? -1 : key === 'z' || key === 'y' ? 1 : 0
  if (!direction) return
  event.preventDefault()
  const previousIndex = draftHistoryIndex
  const target = previousIndex + direction
  if (target < 0 || target >= draftHistory.length) return
  draftHistoryIndex = target
  const snapshot = draftHistory[target]
  const affectedLine = draftHistory[direction < 0 ? previousIndex : target]?.line ?? 0
  markdown.value = snapshot.markdown
  if (editor.value) {
    editor.value.value = snapshot.markdown
    editor.value.setSelectionRange(snapshot.selection, snapshot.selection)
  }
  activeLine = lineAtSelection(snapshot.markdown)
  draftChange.value = `${direction < 0 ? '回退' : '重做'}第 1 步 · 第 ${affectedLine + 1} 行`
  setRevertedLine(direction < 0 ? affectedLine : -1, snapshot.markdown)
  revealEditorLine(affectedLine)
}

const lineNumbers = computed(() => markdown.value.split('\n').map((_, index) => index))

function setRevertedLine(index, source = markdown.value) {
  if (index < 0) {
    revertedLine.value = -1
    return
  }
  revertedLine.value = Math.min(index, Math.max(0, source.split('\n').length - 1))
}

function editorLineTop(index) {
  if (!editor.value) return `${index * 28.5}px`
  const lines = editorLines()
  const paddingTop = Number.parseFloat(getComputedStyle(editor.value).paddingTop) || 0
  return `${(lines[index]?.top ?? index * 28.5) + paddingTop - editorScrollTop.value}px`
}

function editorLineHeight(index) {
  const lines = editorLines()
  return `${Math.max(28.5, (lines[index + 1]?.top ?? (lines[index]?.top ?? 0) + 28.5) - (lines[index]?.top ?? 0))}px`
}

function syncEditorLine(line) {
  const lines = editorLines()
  if (!editor.value || !lines.length) return
  const index = Math.max(0, Math.min(lines.length - 1, Math.floor(line)))
  const current = lines[index]
  const next = lines[index + 1]
  editorSyncLockUntil = performance.now() + 200
  editor.value.scrollTop = current.top + (next ? (line - current.line) * (next.top - current.top) : 0)
  editorScrollTop.value = editor.value.scrollTop
}

function revealEditorLine(line) {
  requestAnimationFrame(() => syncEditorLine(line))
}

function cancelEditorSyncLock() {
  editorSyncLockUntil = 0
}

function handleWorkbenchWheel(event) {
  if (mode.value !== 'workspace' || !editor.value || event.target.closest?.('.preview-pane') || event.target === editor.value) return
  event.preventDefault()
  editorSyncLockUntil = 0
  editor.value.scrollTop += event.deltaY
  syncPreviewLine()
}

function syncDraftWidth() {
  draftWidth.value = editor.value?.clientWidth ?? 0
  editorMetricsWidth = 0
}

async function save() {
  try {
    await request('/api/document', { method: 'PUT', body: JSON.stringify({ markdown: markdown.value }) })
    savedMarkdown.value = markdown.value
    showToast('已保存')
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : '保存失败，内存中的修改仍然保留。', 'error')
  }
}

async function exportHtml() {
  if (!currentTemplate.value || previewVersion.value !== contentVersion.value) return
  try {
    await request('/api/export', { method: 'POST', body: JSON.stringify({ markdown: markdown.value, templateId: currentTemplate.value.id, revision: currentTemplate.value.revision, documentId: documentId.value }) })
    showToast('HTML 已导出')
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : '导出失败。', 'error')
  }
}

async function request(path, options = {}) {
  if (documentId.value && path === '/api/document') path += `?document=${encodeURIComponent(documentId.value)}`
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? '请求失败。')
  return result
}

async function loadTemplate(id) {
  currentTemplate.value = null
  if (!id) return
  try {
    const template = await request(`/api/templates/${encodeURIComponent(id)}`)
    if (activeTemplate.value === id) currentTemplate.value = template
  } catch (cause) {
    if (activeTemplate.value === id) showToast(cause instanceof Error ? cause.message : '无法读取 CSS 模板。', 'error')
  }
}

watch([markdown, currentTemplate], () => {
  contentVersion.value += 1
  refreshPreview()
})

watch(activeTemplate, loadTemplate)

onMounted(async () => {
  window.addEventListener('message', handlePreviewMessage)
  draftResizeObserver = new ResizeObserver(syncDraftWidth)
  if (editor.value) {
    syncDraftWidth()
    draftResizeObserver.observe(editor.value)
  }
  try {
    const [document, templateList] = await Promise.all([request('/api/document'), request('/api/templates')])
    markdown.value = document.markdown
    savedMarkdown.value = document.markdown
    draftHistory = [{ markdown: document.markdown, selection: 0, line: 0 }]
    draftHistoryIndex = 0
    draftChange.value = '已载入'
    name.value = document.name
    documentId.value = document.documentId
    templates.value = templateList.templates
    activeTemplate.value = templates.value.find((template) => template.id === 'ocean')?.id ?? templates.value[0]?.id ?? ''
    clientId = (await request('/api/clients', { method: 'POST', body: '{}' })).clientId
    heartbeatTimer = setInterval(() => { if (clientId) request(`/api/clients/${encodeURIComponent(clientId)}`, { method: 'POST', body: '{}' }).catch(() => {}) }, 30_000)
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : '无法打开 Markdown 文件。', 'error')
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handlePreviewMessage)
  draftResizeObserver?.disconnect()
  editorMirror?.remove()
  clearInterval(heartbeatTimer)
  if (clientId) fetch(`/api/clients/${encodeURIComponent(clientId)}`, { method: 'DELETE', keepalive: true }).catch(() => {})
})
</script>

<template>
  <main class="workbench" :class="{ previewing: mode === 'preview' }" @wheel="handleWorkbenchWheel">
    <header class="topbar">
      <div class="brand"><i />FOLIO</div>
      <div class="document-state">
        <span>{{ name || '—' }}</span>
        <span :class="isDirty ? 'dirty' : 'saved'">{{ isDirty ? '未保存' : '已保存' }}</span>
      </div>
      <div class="actions">
        <button class="button quiet" type="button" @click="save" :disabled="!name || !isDirty">保存</button>
        <button class="button primary" type="button" @click="exportHtml" :disabled="!name || !currentTemplate || previewVersion !== contentVersion">{{ exportLabel }}</button>
      </div>
    </header>
    <section class="canvas" :class="{ 'preview-only': mode === 'preview' }">
      <div v-show="mode === 'workspace'" class="editor-pane">
        <div class="pane-header">
          <div><p>MARKDOWN</p><h1>{{ name || '正在载入' }}</h1></div>
          <div class="draft-state"><p>DRAFT</p><span class="draft-change" aria-live="polite">{{ draftChange }}</span><small>{{ wordCount }} 词</small></div>
        </div>
        <div class="editor-body">
          <div class="line-numbers" aria-hidden="true">
            <span v-for="line in lineNumbers" :key="line" :style="{ top: editorLineTop(line) }">{{ line + 1 }}</span>
          </div>
          <div v-if="revertedLine >= 0" class="draft-revert-highlight" aria-hidden="true" :style="{ top: editorLineTop(revertedLine), height: editorLineHeight(revertedLine) }" />
          <textarea ref="editor" v-model="markdown" aria-label="Markdown 内容" spellcheck="false" placeholder="# 开始写作" @keydown="handleEditorKeydown" @input="handleEditorInput" @scroll="syncPreviewLine" @click="syncPreviewLine" @select="syncPreviewLine" @wheel="cancelEditorSyncLock" />
        </div>
        <p class="hint">Markdown 是唯一内容源 · 保存会写回原文件</p>
      </div>

      <aside class="preview-pane" @dblclick="toggleMode">
        <div class="preview-header"><span>PREVIEW</span><label class="template-select" @dblclick.stop><span>TEMPLATE</span><select v-model="activeTemplate" aria-label="CSS 模板"><option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }} · {{ template.summary }}</option></select></label></div>
        <div v-if="previewHtml" class="preview-stage"><iframe ref="previewFrame" title="Markdown 预览" :style="mode === 'workspace' && draftWidth ? { width: `${draftWidth}px` } : undefined" :srcdoc="previewHtml" sandbox="allow-scripts" @load="restorePreviewLine" @dblclick="toggleMode" /></div>
        <div v-else class="preview-loading" role="status">正在生成预览…</div>
      </aside>
    </section>
    <div v-if="toast" class="toast" :class="toast.type" role="status">{{ toast.text }}</div>
  </main>
</template>
