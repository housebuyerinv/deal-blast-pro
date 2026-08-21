import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('authenticated trial state synchronizes Pro software access and Stripe trial dates', async () => {
  const accountStatus = await read('api/account-status.ts')
  const app = await read('src/App.tsx')
  const store = await read('src/store/useAppStore.ts')

  for (const field of ['effectiveAccessPlan', 'trialStartedAt', 'trialEndsAt']) {
    assert.match(accountStatus, new RegExp(field))
    assert.match(app, new RegExp(field))
  }
  assert.match(store, /effectiveAccessPlan: updates\.effectiveAccessPlan \|\| normalizedPlan/)
  assert.match(store, /Math\.ceil\(\(trialEndMs - Date\.now\(\)\) \/ 86400000\)/)
  assert.doesNotMatch(store, /isTrial \? Math\.max\(s\.trial\.daysLeft \|\| 0, 7\)/)
})

test('QA active trial fixture is exactly fourteen days and never paid for PI', async () => {
  const fixture = await read('supabase/qa/fictional_lifecycle_fixtures.sql')
  assert.match(fixture, /'Pro','Pro','Pro','Trial Active','Trial Active','Trialing','trialing','monthly',0,now\(\),now\(\)\+interval '14 days'/)
  assert.doesNotMatch(fixture, /Trial Active[^\n]*999 days/i)
})

test('trial, Free, paid Pro, and Agency retain distinct access and PI states', async () => {
  const fixture = await read('supabase/qa/fictional_lifecycle_fixtures.sql')
  assert.match(fixture, /'Free','Free','Free','Free Active'[^\n]*,0,/)
  assert.match(fixture, /'Pro','Pro','Pro','Trial Active'[^\n]*'trialing','monthly',0,/)
  assert.match(fixture, /'Pro','Pro','Pro','Paid Active'[^\n]*'active','monthly',50,/)
  assert.match(fixture, /'Agency','Agency','Agency','Paid Active'[^\n]*'active','monthly',150,/)

  const auth = await read('api/_accountAuth.ts')
  assert.doesNotMatch(auth, /PAID_EXTERNAL_RESOURCE_BILLING_STATUSES[^\n]*trial active/i)
})
