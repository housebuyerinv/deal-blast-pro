import test from 'node:test'
import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'

const built = await build({
  entryPoints: ['api/platform/[endpoint].ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'record-dispatch', setup(builder) {
    builder.onResolve({ filter: /server\/http\// }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: `export default (req,res)=>res.json({handler:${JSON.stringify(args.path.split('/').at(-1))},method:req.method})` }))
  } }],
})
const { default: handler } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
function dispatch(url, query = {}) {
  let status = 200, body
  handler({ url, query, method: 'POST' }, { status(value) { status = value; return this }, json(value) { body = value } })
  return { status, body }
}
test('all public API URLs rewrite to the intended guarded handler', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  for (const name of ['buyermatch', 'buyermatch-response', 'buyermatch-worker', 'email-operations']) {
    const rule = config.rewrites.find(r => r.source === '/api/' + name)
    assert.equal(rule.destination, '/api/platform/' + name)
    assert.equal(dispatch(rule.source).body.handler, name + '.js')
    assert.equal(dispatch(rule.destination).body.handler, name + '.js')
  }
})
test('query parameters cannot replace the endpoint or escape the handler allowlist', () => {
  assert.equal(dispatch('/api/buyermatch?action=buyermatch-worker', { action: 'buyermatch-worker' }).body.handler, 'buyermatch.js')
  for (const path of ['/api/platform/unknown', '/api/platform/__proto__', '/api/platform/buyermatch/extra']) {
    assert.equal(dispatch(path, { action: 'buyermatch' }).status, 404)
  }
})

test("routing parameter cannot shadow the BuyerMatch action query", () => {
  assert.equal(readFileSync(new URL("../api/platform/[endpoint].ts", import.meta.url), "utf8").includes("req.query.action"), false)
})
