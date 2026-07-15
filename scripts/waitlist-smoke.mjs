import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(line => line.includes('='))
    .map(line => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')]
    })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const email = `codex.waitlist.${Date.now()}@example.com`
const row = {
  full_name: 'Codex Waitlist Test',
  email,
  phone: '555-0100',
  primary_market: 'St Louis, MO',
  business_type: 'Investor',
  notes: 'Prerelease smoke test',
}

const first = await supabase.from('waitlist_entries').insert(row)
const second = await supabase.from('waitlist_entries').insert(row)

console.log(JSON.stringify({
  firstOk: !first.error,
  firstCode: first.error?.code || null,
  firstMessage: first.error?.message || null,
  duplicateBlocked: Boolean(second.error),
  duplicateCode: second.error?.code || null,
  duplicateMessage: second.error?.message || null,
}, null, 2))
