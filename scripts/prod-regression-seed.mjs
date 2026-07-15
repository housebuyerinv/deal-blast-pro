import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1)]
    })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const submittedAt = new Date().toISOString()
const day = submittedAt.slice(0, 10)
const base = `deal-submissions/${day}/codex-prod-${Date.now()}`

const photo = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#22c55e"/><text x="20" y="90" font-size="20" fill="#000">Codex production photo</text></svg>'
const contract = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 64 >>
stream
BT /F1 14 Tf 36 96 Td (Codex production regression contract) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
trailer
<< /Root 1 0 R /Size 6 >>
%%EOF`

async function upload(path, body, contentType) {
  const { error } = await supabase.storage
    .from('deal-submission-files')
    .upload(path, new Blob([body], { type: contentType }), { contentType, upsert: false })

  if (error) throw error

  return supabase.storage.from('deal-submission-files').getPublicUrl(path).data.publicUrl
}

const photoPath = `${base}-photo.svg`
const pdfPath = `${base}-contract.pdf`
const photoUrl = await upload(photoPath, photo, 'image/svg+xml')
const pdfUrl = await upload(pdfPath, contract, 'application/pdf')

const files = [
  {
    category: 'photos',
    label: 'Photos',
    name: 'codex-production-photo.svg',
    fileName: 'codex-production-photo.svg',
    size: photo.length,
    fileSize: photo.length,
    type: 'image/svg+xml',
    fileType: 'image/svg+xml',
    storageBucket: 'deal-submission-files',
    storagePath: photoPath,
    publicUrl: photoUrl,
    uploadedAt: submittedAt,
  },
  {
    category: 'psa',
    label: 'PSA / Contract',
    name: 'codex-production-contract.pdf',
    fileName: 'codex-production-contract.pdf',
    size: contract.length,
    fileSize: contract.length,
    type: 'application/pdf',
    fileType: 'application/pdf',
    storageBucket: 'deal-submission-files',
    storagePath: pdfPath,
    publicUrl: pdfUrl,
    uploadedAt: submittedAt,
  },
]

const deal_data = {
  name: 'Codex Production Test',
  email: 'codex.production.test@example.com',
  phone: '555-010-2026',
  role: 'Wholesaler',
  address: '987 Codex Production Ave',
  city: 'Pittsburgh',
  state: 'PA',
  zip: '15222',
  county: 'Allegheny',
  assetType: 'SFH',
  askingPrice: 245000,
  contractPrice: 225000,
  structure: 'Cash',
  underContract: 'No',
  closeTimeline: '0-30 days',
  freeAndClearStatus: 'Yes, free and clear',
  directToSeller: 'Direct to Owner',
  proofOfControl: 'PSA/Contract',
  permissionsConfirmed: true,
  consent: true,
  docs: files,
  documents: files,
  uploadedFiles: files,
  submittedAt,
  source: 'public_deal_submission_portal',
  submissionStatus: 'Pending Review',
}

const { error } = await supabase
  .from('deal_submissions')
  .insert({ deal_data, status: 'pending', source: 'public_portal' })

if (error) throw error

console.log(JSON.stringify({ inserted: true, photoPath, pdfPath, photoUrl, pdfUrl }, null, 2))
