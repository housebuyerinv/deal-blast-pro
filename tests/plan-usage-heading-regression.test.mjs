import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const settings = fs.readFileSync(new URL('../src/pages/app/Settings.tsx', import.meta.url), 'utf8')

test('plan billing uses distinct limits and current usage headings', () => {
  assert.match(settings, /\{`\$\{effectivePlanForDisplay\} Plan Limits`\}/)
  assert.match(settings, />Current Usage<\/div>/)
  assert.doesNotMatch(settings, /Free Usage Caps/)
})

test('existing limits and usage values remain unchanged', () => {
  assert.match(settings, /\['Active Deals', `\$\{usage\.dealsSubmitted \|\| 0\} \/ 3`\]/)
  assert.match(settings, /\['Buyers Used', `\$\{usage\.buyersImported \|\| 0\} \/ 25`\]/)
  assert.match(settings, /\['Blasts Used', 'Not included'\]/)
  assert.match(settings, /\['Exports Used', `\$\{usage\.exports \|\| 0\} \/ 20`\]/)
})
