import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('public Features route and navigation are present', async () => {
  const [app, nav, footer] = await Promise.all([read('src/App.tsx'), read('src/components/layout/PublicNav.tsx'), read('src/components/layout/PublicFooter.tsx')])
  assert.match(app, /path="\/features"/)
  assert.match(nav, /to: '\/features', label: 'Features'/)
  assert.match(footer, /to: '\/features', label: 'Features'/)
})

test('homepage CTA groups promote Features in the requested order', async () => {
  const landing = await read('src/pages/public/Landing.tsx')
  const expectedOrder = /to="\/register"[\s\S]*?Create Free Account[\s\S]*?to="\/features"[\s\S]*?Explore Features[\s\S]*?to="\/pricing"[\s\S]*?View Pricing[\s\S]*?to="\/admin-login"[\s\S]*?Sign In/
  assert.equal(landing.match(new RegExp(expectedOrder.source, 'g'))?.length, 2)
  assert.equal((landing.match(/to="\/features" className="btn btn-ghost[^>]*>Explore Features<\/Link>/g) || []).length, 2)
})

test('Property Intelligence marketing matches the enforced ledger rules', async () => {
  const page = await read('src/pages/public/Features.tsx')
  assert.match(page, /One successful new property lookup = one credit/)
  assert.match(page, /cached for 14 days/)
  assert.match(page, /does not include Property Intelligence credits/)
  assert.match(page, /included credits first, then purchased credits/)
  assert.match(page, /purchased credits.*no ledger expiration/is)
})
