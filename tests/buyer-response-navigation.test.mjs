import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { URL } from 'node:url'
import ts from 'typescript'

function page(initialHash) {
  const source = fs.readFileSync(new URL('../src/pages/public/BuyerMatchResponse.tsx', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const state = [], listeners = new Map(), effects = []
  let cursor = 0, mounted = false, resolveFetch
  const window = { location: { hash: initialHash, pathname: '/buyer-response' },
    history: { replaceState() { window.location.hash = '' } },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  }
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = value }] },
    useRef(initial) { const i = cursor++; return state[i] ||= { current: initial } },
    useEffect(fn) { if (!mounted) effects.push(fn) },
  }
  const exports = {}
  vm.runInNewContext(js, { exports, window, crypto: { randomUUID: () => 'operation' },
    fetch: () => new Promise(resolve => { resolveFetch = resolve }),
    require: name => name === 'react' ? hooks : { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  })
  function render() { cursor = 0; const tree = exports.default(); if (!mounted) { mounted = true; effects.forEach(fn => fn()) } return tree }
  const visit = (node, type) => !node || typeof node !== 'object' ? null : node.type === type ? node : [node.props?.children].flat().map(child => visit(child, type)).find(Boolean)
  render()
  return { state, window, render, visit,
    reopen(hash) { window.location.hash = hash; listeners.get('hashchange')() },
    finish() { resolveFetch({ ok: true, json: async () => ({ recorded: true }) }) },
  }
}

test('original invitation reopens in the same mounted document after refresh', () => {
  const p = page('')
  assert.equal(p.visit(p.render(), 'form'), undefined)
  p.reopen('#' + 'a'.repeat(43))
  assert.ok(p.visit(p.render(), 'form'))
  assert.equal(p.window.location.hash, '')
  assert.equal(p.state[0], 'a'.repeat(43))
  p.reopen('#invalid')
  assert.equal(p.visit(p.render(), 'form'), undefined)
})

test('new invitation clears draft and ignores completion from the previous capability', async () => {
  const p = page('#' + 'a'.repeat(43))
  p.visit(p.render(), 'form').props.onSubmit({ preventDefault() {} })
  p.reopen('#' + 'b'.repeat(43))
  p.finish()
  await new Promise(resolve => globalThis.setTimeout(resolve, 0))
  assert.equal(p.state[0], 'b'.repeat(43))
  assert.equal(p.state[6], false)
  assert.equal(p.state[7], '')
  assert.equal(p.window.location.hash, '')
})
