import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')]
    })
)

const normalize = value => String(value ?? '').trim().replace(/[-/]+/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase()
const reviewable = new Set(['pending review', 'submitted / pending review', 'submitted pending review', 'submitted', 'pending', 'new', 'needs recheck', 'pending verification'])
const resolved = new Set(['approved', 'imported', 'dismissed', 'removed', 'rejected', 'archived', 'duplicate resolved', 'resolved'])

function isReviewable(row) {
  const data = row.buyer_data || {}
  const statuses = [
    row.status,
    data.submissionStatus,
    data.submission_status,
    data.verificationStatus,
    data.verification_status,
    data.status,
  ].map(normalize).filter(Boolean)
  return !statuses.some(status => resolved.has(status)) && statuses.some(status => reviewable.has(status))
}

const response = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/buyer_portal_submissions?select=id,status,buyer_data,created_at&order=created_at.desc`, {
  headers: {
    apikey: env.VITE_SUPABASE_ANON_KEY,
    authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
  },
})

const text = await response.text()
if (!response.ok) {
  console.log(response.status)
  console.log(text)
  process.exit(1)
}

const rows = JSON.parse(text)
const pending = rows.filter(isReviewable)
console.log(JSON.stringify({
  totalVisibleRows: rows.length,
  pendingCount: pending.length,
  pending: pending.map(row => ({
    id: row.id,
    status: row.status,
    name: row.buyer_data?.name || row.buyer_data?.fullName || row.buyer_data?.buyerName,
    email: row.buyer_data?.email,
    nestedStatus: row.buyer_data?.status || row.buyer_data?.submissionStatus || row.buyer_data?.verificationStatus,
  })),
}, null, 2))
