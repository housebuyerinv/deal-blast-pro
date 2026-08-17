import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const access = fs.readFileSync(new URL('../src/lib/planAccess.ts', import.meta.url), 'utf8')
const shell = fs.readFileSync(new URL('../src/components/layout/AppShell.tsx', import.meta.url), 'utf8')
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('basic intake is available to every customer plan', () => {
  for (const plan of ['Free', 'Free Demo', 'Starter', 'Pro']) {
    const line = access.match(new RegExp(`${plan === 'Free Demo' ? "'Free Demo'" : plan}: \\[[^\\n]+`))?.[0] || ''
    assert.match(line, /['\"]\/app\/intake['\"]/, `${plan} should allow /app/intake`)
  }
  assert.match(access, /Agency: ALL_APP_ROUTES/)
  assert.match(access, /Enterprise: ALL_APP_ROUTES/)
})

test('Free keeps genuinely paid routes gated', () => {
  const freeLine = access.match(/Free: \[[^\n]+/)?.[0] || ''
  for (const route of ['/app/blast', '/app/resources', '/app/analytics', '/app/hot-zones']) {
    assert.doesNotMatch(freeLine, new RegExp(route.replaceAll('/', '\\/')))
  }
})

test('the intake route uses the existing ManualIntake workflow', () => {
  assert.match(app, /path="intake" element={<ManualIntake \/>}/)
})

test('Free gate copy describes basic intake as included', () => {
  assert.match(shell, /Free includes basic deal intake/)
})
