const { app, BrowserWindow, dialog } = require('electron')
const { writeFile } = require('node:fs/promises')
const path = require('node:path')

let folioServer
let folioPort
let initialized = false
let openQueue = Promise.resolve()
const pendingFilePaths = []
const windows = new Set()

function markdownArgument() {
  return process.argv.slice(1).find((value) => value.toLowerCase().endsWith('.md'))
}

async function startServer() {
  const { createFolioServer } = await import('../server.js')
  const result = await createFolioServer({ idleTimeout: Number.POSITIVE_INFINITY, pdfWriter: printPdf })
  folioServer = result.server
  await new Promise((resolve, reject) => {
    folioServer.once('error', reject)
    folioServer.listen(0, '127.0.0.1', () => {
      folioPort = folioServer.address().port
      resolve()
    })
  })
}

async function printPdf(html, outputPath) {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await writeFile(outputPath, await window.webContents.printToPDF({ printBackground: true }))
  } finally {
    window.destroy()
  }
}

async function openDocument(filePath) {
  const response = await fetch(`http://127.0.0.1:${folioPort}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath })
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? '无法打开 Markdown 文件。')
  return result.documentId
}

async function createWindow(filePath) {
  const documentId = await openDocument(filePath)
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  windows.add(window)
  window.once('closed', () => windows.delete(window))
  await window.loadURL(`http://127.0.0.1:${folioPort}/?document=${encodeURIComponent(documentId)}&mode=workspace`)
}

function showError(error) {
  return dialog.showMessageBox({ type: 'error', title: 'Folio', message: error instanceof Error ? error.message : String(error) })
}

function enqueueOpen(filePath) {
  openQueue = openQueue.then(() => createWindow(filePath)).catch(showError)
}

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (!folioPort || !initialized) pendingFilePaths.push(filePath)
  else enqueueOpen(filePath)
})

app.whenReady().then(async () => {
  try {
    await startServer()
    const filePaths = pendingFilePaths.splice(0)
    if (!filePaths.length) filePaths.push(markdownArgument() ?? path.join(__dirname, '..', 'README.md'))
    for (const filePath of filePaths) await createWindow(filePath)
    initialized = true
    for (const filePath of pendingFilePaths.splice(0)) enqueueOpen(filePath)
  } catch (error) {
    await showError(error)
    app.quit()
  }
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => folioServer?.close())
