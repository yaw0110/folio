import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'

async function launch({ beforeReadyPath, afterReadyPath } = {}) {
  const fakeServer = new EventEmitter()
  fakeServer.listen = (_port, _host, callback) => {
    fakeServer.address = () => ({ port: 43123 })
    callback()
  }
  fakeServer.close = () => {}

  const app = new EventEmitter()
  let resolveReady
  app.whenReady = () => new Promise((resolve) => { resolveReady = resolve })
  app.quit = () => {}
  const openedUrls = []
  class FakeWindow extends EventEmitter {
    constructor() {
      super()
      this.webContents = { printToPDF: async () => Buffer.from('') }
    }
    async loadURL(url) { openedUrls.push(url) }
    destroy() {}
  }

  const source = (await readFile('electron/main.cjs', 'utf8')).replace(
    "await import('../server.js')",
    "await Promise.resolve({ createFolioServer: async () => ({ server: fakeServer }) })"
  )
  const context = {
    require: (name) => name === 'electron'
      ? { app, BrowserWindow: FakeWindow, dialog: { showMessageBox: async () => {} } }
      : name === 'node:fs/promises' ? { writeFile: async () => {} }
      : name === 'node:path' ? path
      : (() => { throw new Error(`unexpected require: ${name}`) })(),
    process: { argv: ['node', 'electron/main.cjs'], platform: 'darwin' },
    __dirname: path.resolve('electron'),
    fetch: async (_url, options) => ({
      ok: true,
      json: async () => ({ documentId: path.basename(JSON.parse(options.body).path, '.md') })
    }),
    Buffer, Promise, setTimeout, clearTimeout, console, fakeServer
  }

  vm.runInNewContext(source, context, { filename: 'electron/main.cjs' })
  let prevented = false
  if (beforeReadyPath) app.emit('open-file', { preventDefault: () => { prevented = true } }, beforeReadyPath)
  resolveReady()
  await new Promise((resolve) => setTimeout(resolve, 20))
  if (afterReadyPath) {
    app.emit('open-file', { preventDefault: () => { prevented = true } }, afterReadyPath)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  return { openedUrls, prevented }
}

test('Electron opens files delivered through macOS open-file events', async () => {
  const fallback = await launch()
  assert.match(fallback.openedUrls[0], /document=README/)

  const opened = await launch({ beforeReadyPath: '/tmp/first.md', afterReadyPath: '/tmp/second.md' })

  assert.equal(opened.prevented, true)
  assert.equal(opened.openedUrls.length, 2)
  assert.match(opened.openedUrls[0], /document=first/)
  assert.match(opened.openedUrls[1], /document=second/)
})
