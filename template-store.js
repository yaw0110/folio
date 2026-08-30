import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export function createTemplateStore(directory) {
  return {
    async list() {
      const entries = await readdir(directory, { withFileTypes: true })
      const templates = await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => readMetadata(directory, entry.name)))
      return templates.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    },
    async read(id, revision) {
      const metadata = await readMetadata(directory, id)
      const css = await readFile(path.join(directory, id, 'template.css'), 'utf8')
      const currentRevision = hash(css)
      if (revision && revision !== currentRevision) {
        const error = new Error('Template changed. Refresh the preview before exporting.')
        error.statusCode = 409
        throw error
      }
      return { ...metadata, revision: currentRevision, css }
    }
  }
}

async function readMetadata(directory, id) {
  if (!/^[a-z0-9-]+$/u.test(id)) throw new Error('Invalid template id.')
  const source = await readFile(path.join(directory, id, 'template.json'), 'utf8')
  const metadata = JSON.parse(source)
  if (metadata.id !== id || typeof metadata.name !== 'string' || typeof metadata.summary !== 'string') throw new Error(`Invalid template metadata: ${id}`)
  return { id, name: metadata.name, summary: metadata.summary }
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}
