import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const settings = fs.readFileSync(new URL('../src/pages/app/Settings.tsx', import.meta.url), 'utf8')
const contact = fs.readFileSync(new URL('../src/pages/public/Contact.tsx', import.meta.url), 'utf8')

test('support cards have actionable, keyboard-accessible destinations', () => {
  assert.match(settings, /<button type="button" onClick=\{\(\) => \{ window\.location\.href = '\/contact\?topic=billing/)
  assert.match(settings, /<button type="button" onClick=\{\(\) => \{ window\.location\.href = '\/pricing'/)
  assert.match(settings, /<button type="button" onClick=\{\(\) => \{ window\.location\.href = '\/contact\?topic=workspace/)
  assert.equal((settings.match(/Billing help/g) || []).length, 1)
  assert.equal((settings.match(/Plan guidance/g) || []).length, 1)
  assert.equal((settings.match(/Workspace support/g) || []).length, 1)
})

test('support contact context is prefixed from URL parameters', () => {
  assert.match(contact, /new URLSearchParams\(/)
  assert.match(contact, /Support request: \$\{context\}/)
  assert.match(contact, /interest: topic \? 'Support' : 'Demo'/)
})
