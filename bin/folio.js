#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { access, readFile, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFolioServer } from '../server.js'

const sessionPath = path.join(os.tmpdir(), `folio-${process.getuid?.() ?? 'user'}.json`)
// ponytail: one per-user launch lock; enough while Folio owns a single daemon.
const launchLockPath = `${sessionPath}.lock`
const args = process.argv.slice(2)

if (args[0] === 'daemon') await runDaemon(args.slice(1))
else if (args[0] === 'status') await status()
else if (args[0] === 'stop') await stop()
else await openFiles(args)

async function openFiles(argv) {
  const { files, mode, idleTimeout } = parseOptions(argv)
  if (!files.length) return usage()
  try {
    const session = await ensureDaemon(idleTimeout)
    const urls = []
    for (const filePath of files) {
      const response = await api(session, '/api/documents', { method: 'POST', body: JSON.stringify({ path: filePath }) })
      urls.push(`http://127.0.0.1:${session.port}/?document=${encodeURIComponent(response.documentId)}&mode=${mode}`)
    }
    urls.forEach(openBrowser)
  } catch (error) {
    console.error(error instanceof Error ? `Folio: ${error.message}` : error)
    process.exitCode = 1
  }
}

async function runDaemon(argv) {
  const { idleTimeout } = parseOptions(argv)
  try {
    const { server } = await createFolioServer({ idleTimeout, onIdle: () => shutdown() })
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address()
      await writeFile(sessionPath, JSON.stringify({ pid: process.pid, port, idleTimeout }), 'utf8')
      console.log(`Folio daemon listening on http://127.0.0.1:${port}`)
    })
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown)
    function shutdown() {
      server.close(async () => {
        try { await unlink(sessionPath) } catch {}
        process.exit()
      })
    }
  } catch (error) {
    console.error(error instanceof Error ? `Folio: ${error.message}` : error)
    process.exitCode = 1
  }
}

async function ensureDaemon(idleTimeout) {
  const existing = await readSession()
  if (existing && await isAlive(existing)) return existing
  const ownsLock = await acquireLaunchLock()
  if (!ownsLock) return waitForDaemon()
  try {
    const current = await readSession()
    if (current && await isAlive(current)) return current
    if (current) await unlink(sessionPath).catch(() => {})
    const daemonArgs = [fileURLToPath(import.meta.url), 'daemon', Number.isFinite(idleTimeout) ? '--idle-timeout' : '--no-idle-timeout']
    if (Number.isFinite(idleTimeout)) daemonArgs.push(String(idleTimeout))
    const child = spawn(process.execPath, daemonArgs, { detached: true, stdio: 'ignore' })
    child.unref()
    return waitForDaemon()
  } finally {
    await unlink(launchLockPath).catch(() => {})
  }
}

async function waitForDaemon() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const session = await readSession()
    if (session && await isAlive(session)) return session
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('无法启动 Folio daemon。')
}

async function acquireLaunchLock() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await writeFile(launchLockPath, String(process.pid), { flag: 'wx' })
      return true
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      try {
        const owner = Number(await readFile(launchLockPath, 'utf8'))
        if (!Number.isInteger(owner) || owner <= 0) throw Object.assign(new Error('Invalid lock owner'), { code: 'EINVAL' })
        process.kill(owner, 0)
      } catch (ownerError) {
        if (ownerError?.code === 'ESRCH' || ownerError?.code === 'ENOENT' || ownerError?.code === 'EINVAL') await unlink(launchLockPath).catch(() => {})
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error('无法获取 Folio daemon 启动锁。')
}

async function readSession() {
  try {
    return JSON.parse(await readFile(sessionPath, 'utf8'))
  } catch {
    return null
  }
}

async function isAlive(session) {
  try {
    await api(session, '/api/documents')
    return true
  } catch {
    return false
  }
}

async function api(session, endpoint, options = {}) {
  const response = await fetch(`http://127.0.0.1:${session.port}${endpoint}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? '请求失败。')
  return result
}

async function status() {
  const session = await readSession()
  if (!session || !(await isAlive(session))) return console.log('Folio daemon 未运行。')
  const result = await api(session, '/api/documents')
  console.log(`Folio daemon 运行中（PID ${session.pid}，${result.documents.length} 个文档）`)
}

async function stop() {
  const session = await readSession()
  if (!session || !(await isAlive(session))) return unlink(sessionPath).catch(() => {})
  process.kill(session.pid, 'SIGTERM')
  console.log('Folio daemon 已停止。')
}

function parseOptions(argv) {
  let mode = 'preview'
  let idleTimeout = 30 * 60 * 1000
  const files = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--preview' || arg === '-p') mode = 'preview'
    else if (arg === '--workspace' || arg === '-w') mode = 'workspace'
    else if (arg === '--no-idle-timeout') idleTimeout = Number.POSITIVE_INFINITY
    else if (arg === '--idle-timeout') idleTimeout = parseDuration(argv[++index])
    else if (arg.startsWith('-')) throw new Error(`未知参数：${arg}`)
    else files.push(arg)
  }
  return { files, mode, idleTimeout }
}

function parseDuration(value) {
  if (/^\d+$/.test(value ?? '')) return Number(value)
  const match = /^(\d+)([smhd])$/.exec(value ?? '')
  if (!match) throw new Error('idle timeout 必须使用例如 30m、2h 的格式。')
  return Number(match[1]) * ({ s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7 }[match[2]])
}

function usage() {
  console.error('Usage: mdp [--preview|--workspace] [--idle-timeout 30m] <file.md> [...file.md]')
  process.exitCode = 1
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]]
  spawn(command[0], command[1], { detached: true, stdio: 'ignore' }).unref()
}
