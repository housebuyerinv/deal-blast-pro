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

const mode = process.argv[2] || 'test'

let body = {
  type: 'test',
  eventType: 'test_email',
  workspaceId: 'default',
  recipients: ['housebuyerinv@gmail.com'],
  data: { requestedAt: new Date().toISOString() },
}

if (mode === 'deal') {
  const id = crypto.randomUUID()
  const dealPayload = {
    id,
    submittedAt: new Date().toISOString(),
    submissionStatus: 'Pending Review',
    contactName: 'Codex Email Alert Test',
    sellerName: 'Codex Email Alert Test',
    email: 'codex.email.alert@example.com',
    phone: '4125550199',
    address: '2026 Codex Email Alert Way',
    propertyAddress: '2026 Codex Email Alert Way',
    city: 'Pittsburgh',
    state: 'PA',
    askingPrice: '275000',
    contractPrice: '255000',
    assetType: 'SFH',
    directness: 'Direct to Owner',
    permissionConfirmed: true,
    consentConfirmed: true,
    source: 'public_portal',
    notes: 'Codex production email alert regression submission.',
    uploadedFiles: [
      { label: 'Photos', name: 'codex-property-photo.png', fileType: 'image/png', publicUrl: 'https://deal-blast-pro.vercel.app/favicon.ico' },
      { label: 'PSA / Contract', name: 'codex-contract.pdf', fileType: 'application/pdf', publicUrl: 'https://deal-blast-pro.vercel.app/favicon.ico' },
    ],
  }

  const insertResponse = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/deal_submissions`, {
    method: 'POST',
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify({
      id,
      deal_data: dealPayload,
      status: 'pending',
      source: 'public_portal',
    }),
  })
  const insertText = await insertResponse.text()
  console.log('insert', insertResponse.status, insertText)
  if (!insertResponse.ok) process.exit(1)

  body = {
    type: 'deal',
    eventType: 'new_deal',
    workspaceId: 'default',
    relatedRecordId: id,
    data: dealPayload,
  }
}

const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/notify-submission`, {
  method: 'POST',
  headers: {
    apikey: env.VITE_SUPABASE_ANON_KEY,
    authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
})

const text = await response.text()
console.log(response.status)
console.log(text)
if (!response.ok) process.exit(1)
