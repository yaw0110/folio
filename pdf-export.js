import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const chromeCandidates = [
  process.env.FOLIO_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'google-chrome',
  'chromium'
].filter(Boolean)

export async function writePdf(html, outputPath) {
  const directory = await mkdtemp(path.join(tmpdir(), 'folio-pdf-'))
  const inputPath = path.join(directory, 'document.html')
  try {
    await writeFile(inputPath, fitPdfToContent(html), 'utf8')
    let lastError
    for (const chrome of chromeCandidates) {
      try {
        await printWithChrome(chrome, inputPath, outputPath, directory)
        return outputPath
      } catch (error) {
        lastError = error
        if (error.code !== 'ENOENT') throw error
      }
    }
    throw new Error(`PDF 导出需要 Chrome 或 Chromium。${lastError?.message ?? ''}`.trim())
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {})
  }
}

function fitPdfToContent(html) {
  const script = `<script>addEventListener('load',()=>setTimeout(()=>{const height=Math.ceil(Math.max(document.documentElement.scrollHeight,document.body.scrollHeight))+64;const style=document.createElement('style');style.textContent='@page{size:210mm '+height+'px;margin:0!important}';document.head.append(style)},0),{once:true})<\/script>`
  return html.replace(/<\/head>/iu, `${script}</head>`)
}

function printWithChrome(chrome, inputPath, outputPath, directory) {
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer', '--disable-background-networking', '--disable-component-update', '--virtual-time-budget=1000', `--user-data-dir=${path.join(directory, 'profile')}`, `--print-to-pdf=${outputPath}`, pathToFileURL(inputPath).href], { stdio: 'ignore' })
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve()
    }
    child.once('error', (error) => finish(error))
    child.once('close', (code) => finish(code === 0 ? new Error('Chrome 未生成 PDF。') : new Error(`Chrome PDF 导出失败（退出码 ${code}）。`)))
    const deadline = Date.now() + 30_000
    const poll = async () => {
      try {
        if ((await stat(outputPath)).size > 0) {
          child.kill('SIGKILL')
          return finish()
        }
      } catch {}
      if (Date.now() >= deadline) {
        child.kill('SIGKILL')
        return finish(new Error('PDF 导出超时。'))
      }
      setTimeout(poll, 100)
    }
    poll()
  })
}
