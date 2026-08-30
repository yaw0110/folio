import { createServer } from 'node:http'
import { access, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { render } from './src/render.js'
import { writePdf } from './pdf-export.js'
import { createTemplateStore } from './template-store.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(root, 'dist')
const templates = createTemplateStore(path.join(root, 'templates'))
const mimeTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' }

export async function createFolioServer({ idleTimeout = 30 * 60 * 1000, onIdle, pdfWriter = writePdf } = {}) {
  await access(path.join(dist, 'index.html'))
  const documents = new Map()
  const clients = new Map()
  let lastCliActivityAt = Date.now()

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost')
      if (url.pathname === '/api/documents' && request.method === 'POST') {
        const { path: requestedPath } = await readJson(request)
        if (typeof requestedPath !== 'string') return sendJson(response, 400, { error: 'path must be a string' })
        lastCliActivityAt = Date.now()
        return sendJson(response, 200, await openDocument(requestedPath))
      }
      if (url.pathname === '/api/documents' && request.method === 'GET') {
        lastCliActivityAt = Date.now()
        return sendJson(response, 200, { documents: [...documents.values()].map(documentInfo) })
      }
      if (url.pathname === '/api/document' && request.method === 'GET') {
        const document = getDocument(url.searchParams.get('document'))
        return sendJson(response, 200, { ...documentInfo(document), markdown: document.markdown })
      }
      if (url.pathname === '/api/document' && request.method === 'PUT') {
        const { markdown: nextMarkdown, version } = await readJson(request)
        if (typeof nextMarkdown !== 'string' || (version !== undefined && !Number.isInteger(version))) return sendJson(response, 400, { error: 'markdown must be a string and version must be an integer when provided' })
        const document = getDocument(url.searchParams.get('document'))
        const nextVersion = await saveDocument(document, nextMarkdown, version)
        return sendJson(response, 200, { ok: true, version: nextVersion })
      }
      if (url.pathname === '/api/clients' && request.method === 'POST') {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        clients.set(id, Date.now())
        return sendJson(response, 200, { clientId: id })
      }
      if (url.pathname.startsWith('/api/clients/') && request.method === 'POST') {
        const id = decodeURIComponent(url.pathname.slice('/api/clients/'.length))
        if (!clients.has(id)) return sendJson(response, 404, { error: 'Client not found' })
        clients.set(id, Date.now())
        return sendJson(response, 200, { ok: true })
      }
      if (url.pathname.startsWith('/api/clients/') && request.method === 'DELETE') {
        clients.delete(decodeURIComponent(url.pathname.slice('/api/clients/'.length)))
        return sendJson(response, 200, { ok: true })
      }
      if (url.pathname === '/api/templates' && request.method === 'GET') {
        return sendJson(response, 200, { templates: await templates.list() })
      }
      if (url.pathname.startsWith('/api/templates/') && request.method === 'GET') {
        const id = decodeURIComponent(url.pathname.slice('/api/templates/'.length))
        return sendJson(response, 200, await templates.read(id))
      }
      if (url.pathname === '/api/export' && request.method === 'POST') {
        const { markdown: source, templateId, revision, documentId } = await readJson(request)
        if (typeof source !== 'string' || typeof templateId !== 'string' || typeof revision !== 'string' || typeof documentId !== 'string') return sendJson(response, 400, { error: 'markdown, templateId, revision and documentId must be strings' })
        const template = await templates.read(templateId, revision)
        const document = getDocument(documentId)
        const exportPath = stampedExportPath(document, '.html')
        await writeFile(exportPath, render(source, template.css), 'utf8')
        return sendJson(response, 200, { path: exportPath })
      }
      if (url.pathname === '/api/export-pdf' && request.method === 'POST') {
        const { markdown: source, templateId, revision, documentId } = await readJson(request)
        if (typeof source !== 'string' || typeof templateId !== 'string' || typeof revision !== 'string' || typeof documentId !== 'string') return sendJson(response, 400, { error: 'markdown, templateId, revision and documentId must be strings' })
        const template = await templates.read(templateId, revision)
        const document = getDocument(documentId)
        const baseHref = pathToFileURL(`${path.dirname(document.path)}${path.sep}`).href
        const html = render(source, template.css, { baseHref, print: true })
        const pdfPath = stampedExportPath(document, '.pdf')
        await pdfWriter(html, pdfPath)
        return sendJson(response, 200, { path: pdfPath })
      }
      if (url.pathname.startsWith('/api/assets/') && request.method === 'GET') {
        const [, , , documentId, ...parts] = url.pathname.split('/')
        const document = getDocument(documentId)
        return sendAsset(response, path.dirname(document.path), parts.map(decodeURIComponent).join('/'))
      }
      if (request.method === 'GET') return sendStatic(response, url.pathname)
      sendJson(response, 404, { error: 'Not found' })
    } catch (error) {
      sendJson(response, error instanceof Error && typeof error.statusCode === 'number' ? error.statusCode : 500, { error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  const idleTimer = setInterval(() => {
    const now = Date.now()
    for (const [id, lastSeenAt] of clients) if (now - lastSeenAt > 90_000) clients.delete(id)
    if (!clients.size && now - lastCliActivityAt >= idleTimeout) onIdle?.()
  }, 60_000)
  idleTimer.unref?.()
  server.once('close', () => clearInterval(idleTimer))

  return { server }

  async function openDocument(requestedPath) {
    const documentPath = path.resolve(requestedPath)
    if (path.extname(documentPath).toLowerCase() !== '.md') throw new Error('Folio only opens .md files.')
    await access(documentPath)
    if (!(await stat(documentPath)).isFile()) throw new Error(`${documentPath} is not a file.`)
    const existing = [...documents.values()].find((document) => document.path === documentPath)
    if (existing) return documentInfo(existing)
    const id = `${documents.size.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const document = { id, path: documentPath, markdown: await readFile(documentPath, 'utf8'), version: 0, saveQueue: Promise.resolve() }
    documents.set(id, document)
    return documentInfo(document)
  }

  function getDocument(id) {
    const document = documents.get(id)
    if (!document) {
      const error = new Error('No Markdown document is open.')
      error.statusCode = 404
      throw error
    }
    return document
  }

  function saveDocument(document, markdown, version) {
    const operation = document.saveQueue.catch(() => {}).then(async () => {
      if (Number.isInteger(version) && document.version !== version) {
        const error = new Error('Document changed. Reload before saving.')
        error.statusCode = 409
        throw error
      }
      await writeFile(document.path, markdown, 'utf8')
      document.markdown = markdown
      document.version += 1
      return document.version
    })
    document.saveQueue = operation
    return operation
  }
}

function documentInfo(document) {
  return { documentId: document.id, name: path.basename(document.path), path: document.path, version: document.version }
}

function stampedExportPath(document, suffix) {
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, suffix === '.pdf' ? 15 : 13)
  return path.join(path.dirname(document.path), `${path.basename(document.path, path.extname(document.path))}-${stamp}${suffix}`)
}

async function readJson(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 2_000_000) throw new Error('Request body is too large.')
  }
  return JSON.parse(body)
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

async function sendAsset(response, documentDir, relativePath) {
  const assetPath = path.resolve(documentDir, relativePath)
  if (path.relative(documentDir, assetPath).startsWith('..')) return sendJson(response, 403, { error: 'Asset is outside the document folder.' })
  const content = await readFile(assetPath)
  response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(assetPath)] ?? 'application/octet-stream' })
  response.end(content)
}

async function sendStatic(response, requestPath) {
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1)
  const assetPath = path.resolve(dist, relativePath)
  if (!assetPath.startsWith(`${dist}${path.sep}`)) return sendJson(response, 403, { error: 'Invalid asset path.' })
  try {
    const content = await readFile(assetPath)
    response.writeHead(200, { 'Content-Type': `${mimeTypes[path.extname(assetPath)] ?? 'application/octet-stream'}; charset=utf-8` })
    response.end(content)
  } catch {
    const index = await readFile(path.join(dist, 'index.html'))
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(index)
  }
}
