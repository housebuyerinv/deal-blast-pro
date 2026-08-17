import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const sidebar = readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8')
const access = readFileSync(new URL('../src/lib/planAccess.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/pages/app/WhatsNew.tsx', import.meta.url), 'utf8')
const data = readFileSync(new URL('../src/content/releaseNotes.ts', import.meta.url), 'utf8')

test("What's New is authenticated, routable, and available to every plan", () => {
  assert.match(app, /Route path="whats-new" element=\{<WhatsNew \/>\}/)
  assert.match(sidebar, /to: '\/app\/whats-new', label: "What's New"/)
  for (const plan of ['Free:', "'Free Demo':", 'Starter:', 'Pro:']) {
    const line = access.split('\n').find(candidate => candidate.trim().startsWith(plan)) || ''
    assert.match(line, /'\/app\/whats-new'/, plan)
  }
})

test('release content is static, customer-friendly, and sorted newest-first', () => {
  assert.match(data, /date: '2026-08-15'/)
  assert.match(data, /Recent property searches now persist across sessions/)
  assert.match(data, /Property searches can be saved and reopened later/)
  assert.match(data, /Eligible cached lookups[\s\S]*without consuming an additional credit/)
  assert.match(data, /sort\([\s\S]*right\.date[\s\S]*left\.date/)
  for (const forbidden of ['RENTCAST_API_KEY', 'property_intelligence_', 'reserve_property', 'deployment ID']) {
    assert.doesNotMatch(data, new RegExp(forbidden, 'i'), forbidden)
  }
  assert.match(page, /sortedReleaseNotes\.map/)
})

test('unread badge is local-only and is dismissed when the page opens', () => {
  assert.match(sidebar, /localStorage\.getItem\(RELEASE_NOTES_VIEWED_KEY\)/)
  assert.match(page, /localStorage\.setItem\(RELEASE_NOTES_VIEWED_KEY, latestReleaseId\)/)
  assert.match(page, /dealblastpro:release-notes-viewed/)
  assert.match(sidebar, /item\.badgeKey === 'whatsNew' \? 'New'/)
})
