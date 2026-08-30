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
  const { server } = await createFolioServer({ pdfWriter: async (_html, outputPath) => writeFile(outputPath, '%PDF-1.4 test', 'utf8') })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  try {
    assert.equal((await fetch(`${baseUrl}/api/document`)).status, 404)
    await fetch(`${baseUrl}/api/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: sourcePath }) })
    const listed = await (await fetch(`${baseUrl}/api/documents`)).json()
    const opened = await (await fetch(`${baseUrl}/api/document?document=${listed.documents[0].documentId}`)).json()
    assert.equal(opened.markdown, '# First')
    assert.equal(opened.path, sourcePath)
    const documentUrl = `${baseUrl}/api/document?document=${opened.documentId}`
    const saved = await (await fetch(documentUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: '# Saved' }) })).json()
    assert.equal(saved.version, 1)
    assert.equal(await readFile(sourcePath, 'utf8'), '# Saved')
    const stale = await fetch(documentUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: '# Stale', version: opened.version }) })
    assert.equal(stale.status, 409)
    assert.equal(await readFile(sourcePath, 'utf8'), '# Saved')
    const templateList = await (await fetch(`${baseUrl}/api/templates`)).json()
    assert.deepEqual(templateList.templates.map((template) => template.id).sort(), ['lapis-cv', 'ticket', 'wechat-crimson', 'wechat-emerald'])
    assert.deepEqual(new Set(templateList.templates.map((template) => template.name)), new Set(['Lapis 简历', '检票单', '朱砂长文', '翠绿清单']))
    const template = await (await fetch(`${baseUrl}/api/templates/ticket`)).json()
    const exported = await (await fetch(`${baseUrl}/api/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: '# Exported', templateId: template.id, revision: template.revision, documentId: opened.documentId }) })).json()
    assert.match(exported.path, /article-\d{8}-\d{4}\.html$/)
    assert.match(await readFile(exported.path, 'utf8'), /<h1>Exported<\/h1>/)
    assert.match(await readFile(exported.path, 'utf8'), /#2e8b66/)
    const pdfResponse = await fetch(`${baseUrl}/api/export-pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: '# Exported', templateId: template.id, revision: template.revision, documentId: opened.documentId }) })
    assert.equal(pdfResponse.status, 200)
    const pdfExport = await pdfResponse.json()
    assert.match(pdfExport.path, /article-\d{8}-\d{6}\.pdf$/)
    assert.deepEqual((await readFile(pdfExport.path)).subarray(0, 5).toString(), '%PDF-')
    const staleExport = await fetch(`${baseUrl}/api/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: '# Exported', templateId: template.id, revision: 'outdated', documentId: opened.documentId }) })
    assert.equal(staleExport.status, 409)
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
