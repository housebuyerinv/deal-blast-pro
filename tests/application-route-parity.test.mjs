import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { URL } from 'node:url'
import ts from 'typescript'
import { matchRoutes } from 'react-router-dom'

// Parse the actual JSX declarations, then exercise React Router's matching logic.
// The fixture records the deployed Production contract, not the candidate's output.
const source = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/production-routes.json', import.meta.url), 'utf8'))
const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const routes = []
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'Route') {
    const attrs = node.attributes.properties
    const path = attrs.find(a => a.name?.getText(tree) === 'path')?.initializer?.text
    const element = attrs.find(a => a.name?.getText(tree) === 'element')?.initializer?.getText(tree)
    let nesting = 0
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(tree) === 'Routes') nesting++
    }
    if (path) routes.push({ path, element, scope: nesting > 1 ? 'app' : 'public' })
  }
  ts.forEachChild(node, visit)
}
visit(tree)
const publicRoutes = routes.filter(r => r.scope === 'public')
const appRoutes = routes.filter(r => r.scope === 'app')
const resolve = (path, list = publicRoutes) => matchRoutes(list, path)?.at(-1)?.route.element

test('all deployed Production route elements survive integration', () => {
  for (const original of baseline.filter(r => r.path !== '/app/*')) {
    assert.ok(routes.some(r => r.path === original.path && r.element === original.element), original.path)
  }
})
test('password reset resolves to recovery rather than the wildcard', () => {
  assert.equal(resolve('/reset-password'), '{<ResetPassword />}')
  assert.equal(resolve('/forgot-password'), '{<ForgotPassword />}')
  assert.equal(resolve('/verify-email'), '{<VerifyEmail />}')
  assert.equal(resolve('/register'), '{<Register />}')
})
test('authenticated Production deep links remain reachable', () => {
  for (const path of ['dashboard', 'settings', 'hot-zones', 'whats-new', 'inventory', 'buyers', 'calculator']) {
    assert.ok(resolve('/' + path, appRoutes)?.includes('Navigate') === false, path)
  }
  assert.match(source, /<ProtectedRoute>\s*<AppShell>\s*<Routes>/)
})
test('BuyerMatch public and protected routes coexist with Production', () => {
  assert.equal(resolve('/buyer-response'), '{<BuyerMatchResponse />}')
  for (const path of ['buyermatch', 'buyermatch/plans', 'buyermatch/admin', 'buyermatch/deals/test']) {
    assert.equal(resolve('/' + path, appRoutes), '{<BuyerMatch />}')
  }
})
test('unknown public and authenticated routes retain their respective fallback', () => {
  assert.equal(resolve('/not-a-route'), '{<Navigate to="/" replace />}')
  assert.equal(resolve('/not-a-route', appRoutes), '{<Navigate to="dashboard" replace />}')
})
