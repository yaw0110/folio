import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createFolioServer } from '../server.js'

test('document save and HTML export use the opened Markdown path', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'folio-test-'))
  const sourcePath = path.join(directory, 'article.md')
  await writeFile(sourcePath, '# First')
  const { server } = await createFolioServer(sourcePath)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  try {
    const opened = await (await fetch(`${baseUrl}/api/document`)).json()
    assert.equal(opened.markdown, '# First')
    await fetch(`${baseUrl}/api/document`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: '# Saved' }) })
    assert.equal(await readFile(sourcePath, 'utf8'), '# Saved')
    const templateList = await (await fetch(`${baseUrl}/api/templates`)).json()
    assert.ok(templateList.templates.some((template) => template.id === 'ocean'))
    assert.deepEqual(new Set(['blueprint', 'graphite', 'ledger', 'ticket', 'vermilion', 'wechat-emerald', 'wechat-crimson', 'wechat-slate', 'willow'].filter((id) => templateList.templates.some((template) => template.id === id))), new Set(['blueprint', 'graphite', 'ledger', 'ticket', 'vermilion', 'wechat-emerald', 'wechat-crimson', 'wechat-slate', 'willow']))
    const template = await (await fetch(`${baseUrl}/api/templates/ocean`)).json()
    const exported = await (await fetch(`${baseUrl}/api/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: '# Exported', templateId: template.id, revision: template.revision }) })).json()
    assert.equal(exported.path, path.join(directory, 'article.html'))
    assert.match(await readFile(exported.path, 'utf8'), /<h1>Exported<\/h1>/)
    assert.match(await readFile(exported.path, 'utf8'), /#1D4ED8/)
    const staleExport = await fetch(`${baseUrl}/api/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: '# Exported', templateId: template.id, revision: 'outdated' }) })
    assert.equal(staleExport.status, 409)
    const wechatTemplate = await (await fetch(`${baseUrl}/api/templates/wechat-emerald`)).json()
    const wechatExport = await (await fetch(`${baseUrl}/api/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: '# Exported', templateId: wechatTemplate.id, revision: wechatTemplate.revision }) })).json()
    assert.equal(wechatExport.path, path.join(directory, 'article.wechat.html'))
    assert.doesNotMatch(await readFile(wechatExport.path, 'utf8'), /<style/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
})

test('one server keeps multiple Markdown documents independent', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'folio-test-'))
  const firstPath = path.join(directory, 'first.md')
  const secondPath = path.join(directory, 'second.md')
  await writeFile(firstPath, '# First')
  await writeFile(secondPath, '# Second')
  const { server } = await createFolioServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  try {
    const open = async (filePath) => (await fetch(`${baseUrl}/api/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: filePath }) })).json()
    const first = await open(firstPath)
    const second = await open(secondPath)
    assert.notEqual(first.documentId, second.documentId)
    assert.equal((await (await fetch(`${baseUrl}/api/document?document=${first.documentId}`)).json()).markdown, '# First')
    assert.equal((await (await fetch(`${baseUrl}/api/document?document=${second.documentId}`)).json()).markdown, '# Second')
    const list = await (await fetch(`${baseUrl}/api/documents`)).json()
    assert.equal(list.documents.length, 2)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
})
