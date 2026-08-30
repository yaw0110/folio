import assert from 'node:assert/strict'
import test from 'node:test'
import { render } from '../src/render.js'

test('render produces one standalone document for preview and export', () => {
  const html = render('# Heading\n\nParagraph with *em* and **strong**.\n\n- one\n- two\n\n> quote\n\n`inline`\n\n```js\ncode\n```\n\n![image](cover.png)', 'body { color: red; }', { baseHref: '/api/assets/' })
  assert.match(html, /<h1>Heading<\/h1>/)
  assert.match(html, /<em>em<\/em>/)
  assert.match(html, /<strong>strong<\/strong>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<blockquote>/)
  assert.match(html, /<code>inline<\/code>/)
  assert.match(html, /<code class="language-js">code/)
  assert.match(html, /<img src="cover.png" alt="image">/)
  assert.match(html, /<base href="\/api\/assets\/">/)
  assert.match(html, /html\{box-sizing:border-box\}/)
})

test('interactive preview includes the section synchronization bridge', () => {
  const html = render('# Heading\n\nParagraph', '', { interactive: true })
  assert.match(html, /folio-workbench/)
  assert.match(html, /action:'section'/)
  assert.match(html, /folio-active-section/)
  assert.match(html, /body\{user-select:none\}/)
  assert.match(html, /data-source-line="0"/)
  assert.match(html, /data-source-line="2"/)
})
