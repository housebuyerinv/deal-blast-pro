type ExportFormat = 'pdf' | 'xlsx' | 'csv' | 'json' | 'zip'

type ExportScope = 'selected' | 'all' | 'filtered' | 'single'

type InventoryExportOptions = {
  format: ExportFormat
  scope: ExportScope
  deals: any[]
  allDeals?: any[]
  filteredDeals?: any[]
  filters?: Record<string, any>
  workspaceName?: string
}

const EXPORT_VERSION = 'inventory-export-v1'
const textEncoder = new TextEncoder()

function clean(value: any) {
  if (value === undefined || value === null || value === '' || value === false) return 'Not Provided'
  if (value === true) return 'Yes'
  if (Number.isNaN(value)) return 'Not Provided'
  return String(value)
}

function numberValue(value: any) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function currency(value: any) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) return 'Not Provided'
  return `$${Math.round(numeric).toLocaleString()}`
}

function dateValue(value: any) {
  if (!value) return 'Not Provided'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? clean(value) : date.toLocaleDateString()
}

function generatedDateStamp() {
  return new Date().toISOString().slice(0, 10)
}

function sanitizeFilename(value: string) {
  const cleaned = clean(value)
    .replace(/[^a-z0-9\-_\s.]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '-')
  return cleaned.slice(0, 120) || 'Deal-Blast-Pro-Export'
}

function dealTitle(deal: any) {
  const p = deal?.property || {}
  return [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ') || deal?.id || 'Deal'
}

function dealFilename(deal: any, ext: string) {
  return `${sanitizeFilename(dealTitle(deal))}.${ext}`
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function docManifest(deal: any) {
  const docs = Array.isArray(deal?.docs) ? deal.docs : []
  return docs.map((doc: any, index: number) => ({
    dealId: deal?.id || '',
    propertyAddress: dealTitle(deal),
    fileNumber: index + 1,
    filename: clean(doc?.name),
    category: clean(doc?.category || doc?.type),
    uploadedAt: dateValue(doc?.uploadedAt || doc?.createdAt),
    isPhoto: /\.(png|jpe?g|gif|webp|svg)$/i.test(String(doc?.name || '')),
  }))
}

function calcQuality(deal: any) {
  const score = deal?.quality?.score || deal?.qualityScore || ''
  const grade = deal?.quality?.grade || deal?.grade || ''
  return [score, grade].filter(Boolean).join(' / ') || 'Not Provided'
}

function flattenDeal(deal: any) {
  const p = deal?.property || {}
  const pricing = deal?.pricing || {}
  const debt = deal?.debt || {}
  const condition = deal?.condition || {}
  const submitter = deal?.submitter || {}
  const closing = deal?.closing || {}
  const docs = docManifest(deal)
  return {
    'Deal ID': clean(deal?.id),
    'Address': clean(p.address),
    'City': clean(p.city),
    'State': clean(p.state),
    'ZIP': clean(p.zip),
    'County': clean(p.county),
    'Property Type': clean(p.type),
    'Strategy': clean(p.strategy),
    'Status': clean(deal?.status),
    'Source': clean(deal?.source || 'Internal Intake'),
    'Created': dateValue(deal?.createdAt),
    'Updated': dateValue(deal?.updatedAt),
    'Quality Score': calcQuality(deal),
    'Beds': clean(p.beds),
    'Baths': clean(p.baths),
    'Units': clean(p.units || p.totalUnits),
    'Square Feet': clean(p.sqft),
    'Year Built': clean(p.yearBuilt),
    'Lot Size / Acres': clean(p.lotSize || p.acres),
    'Occupancy': clean(p.occupancy || condition.occupancyStatus),
    'Description': clean(p.description),
    'Asking Price': currency(pricing.askingPrice),
    'Contract Price': currency(pricing.contractPrice),
    'Buyer Price': currency(pricing.buyerPrice),
    'Assignment Fee': currency(pricing.assignmentFee),
    'Potential Fee': currency(pricing.potentialFee || pricing.fee || pricing.assignmentFee),
    'ARV': currency(pricing.arv),
    'Estimated Rehab': currency(pricing.rehab),
    'Current Rent': currency(pricing.currentRent),
    'Market Rent': currency(pricing.marketRent),
    'Taxes': currency(pricing.taxes),
    'HOA': currency(pricing.hoa),
    'NOI': currency(pricing.noi),
    'Cap Rate': pricing.capRate ? `${pricing.capRate}%` : 'Not Provided',
    'Seller Finance Available': pricing.sellerFinance ? 'Yes' : 'No / Not Provided',
    'Down Payment': currency(pricing.downPayment),
    'Monthly Payment': currency(pricing.monthlyPayment),
    'Interest Rate': pricing.interestRate ? `${pricing.interestRate}%` : 'Not Provided',
    'Balloon Term': clean(pricing.balloonTerm),
    'Amortization': clean(pricing.amortization),
    'PITI Included': pricing.pitiIncluded ? 'Yes' : 'No / Not Provided',
    'Free and Clear': debt.isFreeClear ? 'Yes' : 'No / Not Provided',
    'Mortgage Balance': currency(debt.mortgageBalance),
    'Arrears': currency(debt.arrears),
    'Taxes Owed': currency(debt.taxesOwed),
    'Title Company': clean(debt.titleCompany || closing.titleCompany),
    'Title Contact': clean(debt.titleContact || closing.escrowOfficer),
    'Liens': clean(debt.liens),
    'Ownership Issues': clean(debt.ownershipIssues),
    'Tenant Details': clean(condition.tenantDetails),
    'Lease Terms': clean(condition.leaseTerms),
    'Section 8': condition.section8 ? 'Yes' : 'No / Not Provided',
    'Walkthrough Available': condition.walkthroughAvailable ? 'Yes' : 'No / Not Provided',
    'Lockbox': clean(condition.lockbox),
    'Roof': clean(condition.roof),
    'HVAC': clean(condition.hvac),
    'Plumbing': clean(condition.plumbing),
    'Electrical': clean(condition.electrical),
    'Foundation': clean(condition.foundation),
    'Major Repairs': clean(condition.majorRepairs),
    'Rehab Notes': clean(condition.rehabNotes),
    'Submitter Name': clean(submitter.name),
    'Submitter Email': clean(submitter.email),
    'Submitter Phone': clean(submitter.phone),
    'Submitter Company': clean(submitter.company),
    'Submitter Role': clean(submitter.role),
    'Consent Status': submitter.consent ? 'Yes' : 'No / Not Provided',
    'Document Count': docs.filter((d: any) => !d.isPhoto).length,
    'Photo Count': docs.filter((d: any) => d.isPhoto).length,
    'Closing Date': dateValue(closing.closingDate),
    'Buyer Entity': clean(closing.buyerEntity),
    'Funding Status': clean(closing.fundingStatus),
    'EMD Amount': currency(closing.emdAmount),
    'EMD Date': dateValue(closing.emdDate),
    'Closing Notes': clean(closing.closingNotes),
    'Notes': clean(deal?.notes),
  }
}

function sectionRows(deal: any) {
  const flat = flattenDeal(deal)
  const entries = Object.entries(flat)
  return [
    ['Deal Summary', entries.slice(0, 12)],
    ['Property Information', entries.slice(12, 22)],
    ['Pricing and Financials', entries.slice(22, 35)],
    ['Creative Terms', entries.slice(35, 42)],
    ['Debt and Title', entries.slice(42, 49)],
    ['Condition and Repairs', entries.slice(49, 59)],
    ['Contact', entries.slice(59, 65)],
    ['Documents, Closing, Notes', entries.slice(65)],
  ] as Array<[string, Array<[string, any]>]>
}

function csvEscape(value: any) {
  const text = clean(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvFromRows(rows: Array<Record<string, any>>) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [
    headers.map(csvEscape).join(','),
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(',')),
  ].join('\r\n')
}

function exportPayload(options: InventoryExportOptions) {
  const deals = options.deals || []
  return {
    exportVersion: EXPORT_VERSION,
    generatedAt: new Date().toISOString(),
    workspace: options.workspaceName || 'Deal Blast Pro Workspace',
    scope: options.scope,
    appliedFilters: options.filters || {},
    dealCount: deals.length,
    summary: inventorySummary(deals),
    deals: deals.map((deal: any) => ({
      id: deal?.id,
      title: dealTitle(deal),
      status: deal?.status || null,
      property: deal?.property || {},
      pricing: deal?.pricing || {},
      debt: deal?.debt || {},
      condition: deal?.condition || {},
      submitter: deal?.submitter || {},
      closing: deal?.closing || {},
      notes: deal?.notes || '',
      documents: docManifest(deal),
    })),
  }
}

function inventorySummary(deals: any[]) {
  const byStatus: Record<string, number> = {}
  const byType: Record<string, number> = {}
  const byState: Record<string, number> = {}
  for (const deal of deals) {
    byStatus[deal?.status || 'Unknown'] = (byStatus[deal?.status || 'Unknown'] || 0) + 1
    byType[deal?.property?.type || 'Unknown'] = (byType[deal?.property?.type || 'Unknown'] || 0) + 1
    byState[deal?.property?.state || 'Unknown'] = (byState[deal?.property?.state || 'Unknown'] || 0) + 1
  }
  const totals = deals.reduce((acc, deal) => {
    const pricing = deal?.pricing || {}
    acc.asking += numberValue(pricing.askingPrice)
    acc.contract += numberValue(pricing.contractPrice)
    acc.fees += numberValue(pricing.assignmentFee || pricing.potentialFee || pricing.fee)
    return acc
  }, { asking: 0, contract: 0, fees: 0 })
  return { totalDeals: deals.length, totals, byStatus, byType, byState }
}

function makePdf(lines: string[], title: string) {
  const pages: string[][] = []
  let current: string[] = []
  const maxLines = 44
  for (const line of lines) {
    if (current.length >= maxLines || line === '\f') {
      pages.push(current)
      current = []
      if (line === '\f') continue
    }
    current.push(line)
  }
  pages.push(current)

  const objects: string[] = []
  const add = (body: string) => {
    objects.push(body)
    return objects.length
  }
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const pageIds: number[] = []
  const escapePdf = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    let y = 770
    const content = [
      'BT',
      `/F1 16 Tf 50 ${y} Td (${escapePdf(title)}) Tj`,
      `/F1 9 Tf 0 -18 Td (${escapePdf(`Generated ${new Date().toLocaleString()} | Page ${pageIndex + 1} of ${pages.length}`)}) Tj`,
    ]
    y -= 38
    for (const line of pages[pageIndex]) {
      const size = line.startsWith('## ') ? 12 : line.startsWith('# ') ? 14 : 9
      const text = line.replace(/^#+\s*/, '')
      content.push(`/F1 ${size} Tf 0 -14 Td (${escapePdf(text.slice(0, 115))}) Tj`)
      y -= 14
      if (y < 50) break
    }
    content.push('ET')
    const stream = content.join('\n')
    const contentId = add(`<< /Length ${textEncoder.encode(stream).length} >>\nstream\n${stream}\nendstream`)
    const pageId = add(`<< /Type /Page /Parent PAGES_PLACEHOLDER 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    pageIds.push(pageId)
  }
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
  for (let index = 0; index < objects.length; index += 1) {
    objects[index] = objects[index].replace(/PAGES_PLACEHOLDER/g, String(pagesId))
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([pdf], { type: 'application/pdf' })
}

function wrappedLines(label: string, value: any) {
  const text = `${label}: ${clean(value)}`
  const lines: string[] = []
  let remaining = text
  while (remaining.length > 100) {
    lines.push(remaining.slice(0, 100))
    remaining = `  ${remaining.slice(100)}`
  }
  lines.push(remaining)
  return lines
}

function singleDealPdf(deal: any) {
  const lines = [`# ${dealTitle(deal)}`, `Safe reference: ${clean(deal?.id)}`, '']
  sectionRows(deal).forEach(([section, rows]) => {
    lines.push(`## ${section}`)
    rows.forEach(([label, value]) => lines.push(...wrappedLines(label, value)))
    lines.push('')
  })
  return makePdf(lines, `Deal Blast Pro Deal Report`)
}

function combinedPdf(deals: any[], options: InventoryExportOptions) {
  const summary = inventorySummary(deals)
  const lines = [
    '# Deal Blast Pro Inventory Export',
    `Generated: ${new Date().toLocaleString()}`,
    `Scope: ${options.scope}`,
    `Deal count: ${deals.length}`,
    `Total asking value: ${currency(summary.totals.asking)}`,
    `Total contract value: ${currency(summary.totals.contract)}`,
    `Estimated fees: ${currency(summary.totals.fees)}`,
    '',
    '## Table of Contents',
    ...deals.map((deal, index) => `${index + 1}. ${dealTitle(deal)}`),
  ]
  deals.forEach((deal, index) => {
    lines.push('\f', `# ${index + 1}. ${dealTitle(deal)}`)
    sectionRows(deal).forEach(([section, rows]) => {
      lines.push(`## ${section}`)
      rows.forEach(([label, value]) => lines.push(...wrappedLines(label, value)))
      lines.push('')
    })
  })
  return makePdf(lines, 'Deal Blast Pro Inventory Export')
}

function excelXml(value: any) {
  return clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function columnName(index: number) {
  let name = ''
  let current = index + 1
  while (current > 0) {
    const rem = (current - 1) % 26
    name = String.fromCharCode(65 + rem) + name
    current = Math.floor((current - rem - 1) / 26)
  }
  return name
}

function sheetXml(rows: Array<Record<string, any>>) {
  const headers = rows.length ? Object.keys(rows[0]) : ['Status']
  const bodyRows = [Object.fromEntries(headers.map(h => [h, h])), ...rows]
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetData>
${bodyRows.map((row, r) => `<row r="${r + 1}">${headers.map((h, c) => `<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t>${excelXml(row[h])}</t></is></c>`).join('')}</row>`).join('')}
</sheetData><autoFilter ref="A1:${columnName(headers.length - 1)}${Math.max(1, bodyRows.length)}"/></worksheet>`
}

function makeXlsx(deals: any[]) {
  const dealRows = deals.map(flattenDeal)
  const documents = deals.flatMap(docManifest)
  const sheets = [
    { name: 'Inventory Summary', rows: [inventorySummary(deals) as any].map(row => ({ 'Total Deals': row.totalDeals, 'Total Asking': currency(row.totals.asking), 'Total Contract': currency(row.totals.contract), 'Estimated Fees': currency(row.totals.fees) })) },
    { name: 'Deals', rows: dealRows },
    { name: 'Contacts', rows: dealRows.map(row => ({ 'Deal ID': row['Deal ID'], Address: row.Address, Name: row['Submitter Name'], Email: row['Submitter Email'], Phone: row['Submitter Phone'], Company: row['Submitter Company'], Role: row['Submitter Role'] })) },
    { name: 'Financials', rows: dealRows.map(row => ({ 'Deal ID': row['Deal ID'], Address: row.Address, 'Asking Price': row['Asking Price'], 'Contract Price': row['Contract Price'], 'Assignment Fee': row['Assignment Fee'], ARV: row.ARV, Rehab: row['Estimated Rehab'], NOI: row.NOI, 'Cap Rate': row['Cap Rate'] })) },
    { name: 'Creative Terms', rows: dealRows.map(row => ({ 'Deal ID': row['Deal ID'], Address: row.Address, 'Seller Finance': row['Seller Finance Available'], 'Down Payment': row['Down Payment'], 'Monthly Payment': row['Monthly Payment'], 'Interest Rate': row['Interest Rate'], 'Balloon Term': row['Balloon Term'] })) },
    { name: 'Title and Debt', rows: dealRows.map(row => ({ 'Deal ID': row['Deal ID'], Address: row.Address, 'Free and Clear': row['Free and Clear'], 'Mortgage Balance': row['Mortgage Balance'], Arrears: row.Arrears, 'Taxes Owed': row['Taxes Owed'], Liens: row.Liens, 'Ownership Issues': row['Ownership Issues'] })) },
    { name: 'Condition and Repairs', rows: dealRows.map(row => ({ 'Deal ID': row['Deal ID'], Address: row.Address, Roof: row.Roof, HVAC: row.HVAC, Plumbing: row.Plumbing, Electrical: row.Electrical, Foundation: row.Foundation, 'Major Repairs': row['Major Repairs'], 'Rehab Notes': row['Rehab Notes'] })) },
    { name: 'Closing', rows: dealRows.map(row => ({ 'Deal ID': row['Deal ID'], Address: row.Address, 'Closing Date': row['Closing Date'], 'Buyer Entity': row['Buyer Entity'], 'Funding Status': row['Funding Status'], 'EMD Amount': row['EMD Amount'], 'EMD Date': row['EMD Date'] })) },
    { name: 'Documents', rows: documents.length ? documents : [{ dealId: 'Not Provided', propertyAddress: 'Not Provided', filename: 'Not Provided' }] },
    { name: 'Missing Information', rows: dealRows.map(row => ({ 'Deal ID': row['Deal ID'], Address: row.Address, Status: row.Status, Notes: row.Notes })) },
    { name: 'Buyer Matches', rows: dealRows.map(row => ({ 'Deal ID': row['Deal ID'], Address: row.Address, 'Buyer Match Summary': 'Not Provided' })) },
  ]
  const files: Record<string, BlobPart> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${excelXml(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
  }
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(sheet.rows.length ? sheet.rows : [{ Status: 'No records' }])
  })
  return makeZip(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u16(value: number) {
  return new Uint8Array([value & 255, (value >>> 8) & 255])
}

function u32(value: number) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255])
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

async function blobPartToBytes(content: BlobPart) {
  if (typeof content === 'string') return textEncoder.encode(content)
  if (content instanceof Uint8Array) return content
  if (content instanceof ArrayBuffer) return new Uint8Array(content)
  if (content instanceof Blob) return new Uint8Array(await content.arrayBuffer())
  return textEncoder.encode(String(content))
}

async function makeZip(files: Record<string, BlobPart>, type = 'application/zip') {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = textEncoder.encode(name)
    const data = await blobPartToBytes(content)
    const crc = crc32(data)
    const local = concatBytes([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data])
    locals.push(local)
    const central = concatBytes([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes])
    centrals.push(central)
    offset += local.length
  }
  const centralStart = offset
  const centralBytes = concatBytes(centrals)
  const end = concatBytes([u32(0x06054b50), u16(0), u16(0), u16(centrals.length), u16(centrals.length), u32(centralBytes.length), u32(centralStart), u16(0)])
  return new Blob([concatBytes([...locals, centralBytes, end])], { type })
}

async function makeCompletePackage(options: InventoryExportOptions) {
  const deals = options.deals
  const payload = exportPayload(options)
  const dealRows = deals.map(flattenDeal)
  const docs = deals.flatMap(docManifest)
  const files: Record<string, BlobPart> = {
    'manifest.json': JSON.stringify({ exportVersion: EXPORT_VERSION, generatedAt: payload.generatedAt, workspace: payload.workspace, dealCount: deals.length, scope: options.scope, appliedFilters: options.filters || {}, includedFiles: ['inventory-summary.pdf', 'inventory.xlsx', 'deals.csv', 'contacts.csv', 'documents.csv', 'buyer-matches.csv', 'missing-information.csv', 'inventory.json', 'deal-pdfs/'] }, null, 2),
    'inventory.json': JSON.stringify(payload, null, 2),
    'deals.csv': csvFromRows(dealRows),
    'contacts.csv': csvFromRows(dealRows.map(row => ({ 'Deal ID': row['Deal ID'], Address: row.Address, Name: row['Submitter Name'], Email: row['Submitter Email'], Phone: row['Submitter Phone'], Company: row['Submitter Company'] }))),
    'documents.csv': csvFromRows(docs.length ? docs : [{ dealId: 'Not Provided', propertyAddress: 'Not Provided', filename: 'Not Provided' }]),
    'buyer-matches.csv': csvFromRows(dealRows.map(row => ({ 'Deal ID': row['Deal ID'], Address: row.Address, Summary: 'Not Provided' }))),
    'missing-information.csv': csvFromRows(dealRows.map(row => ({ 'Deal ID': row['Deal ID'], Address: row.Address, Notes: row.Notes }))),
    'inventory-summary.pdf': combinedPdf(deals, options),
    'inventory.xlsx': await makeXlsx(deals),
  }
  deals.forEach((deal, index) => {
    files[`deal-pdfs/${String(index + 1).padStart(2, '0')}-${dealFilename(deal, 'pdf')}`] = singleDealPdf(deal)
  })
  return makeZip(files)
}

export async function downloadInventoryExport(options: InventoryExportOptions) {
  const deals = options.deals || []
  if (!deals.length) throw new Error('No inventory deals are available for this download.')
  const date = generatedDateStamp()
  const scopeLabel = options.scope === 'selected' ? `Selected-${deals.length}-Deals` : options.scope === 'filtered' ? `Filtered-${deals.length}-Deals` : 'Inventory'
  if (options.format === 'pdf') {
    downloadBlob(`Deal-Blast-Pro-${scopeLabel}-${date}.pdf`, deals.length === 1 ? singleDealPdf(deals[0]) : combinedPdf(deals, options))
    return
  }
  if (options.format === 'xlsx') {
    downloadBlob(`Deal-Blast-Pro-${scopeLabel}-${date}.xlsx`, await makeXlsx(deals))
    return
  }
  if (options.format === 'csv') {
    downloadBlob(`Deal-Blast-Pro-${scopeLabel}-${date}.csv`, new Blob([`\uFEFF${csvFromRows(deals.map(flattenDeal))}`], { type: 'text/csv;charset=utf-8' }))
    return
  }
  if (options.format === 'json') {
    downloadBlob(`Deal-Blast-Pro-${scopeLabel}-${date}.json`, new Blob([JSON.stringify(exportPayload(options), null, 2)], { type: 'application/json' }))
    return
  }
  downloadBlob(`Deal-Blast-Pro-${scopeLabel}-${date}.zip`, await makeCompletePackage(options))
}

export async function downloadDealExport(deal: any, format: Exclude<ExportFormat, 'zip'>) {
  if (!deal) throw new Error('No deal is open for download.')
  if (format === 'pdf') {
    downloadBlob(dealFilename(deal, 'pdf'), singleDealPdf(deal))
  } else if (format === 'xlsx') {
    downloadBlob(dealFilename(deal, 'xlsx'), await makeXlsx([deal]))
  } else if (format === 'csv') {
    downloadBlob(dealFilename(deal, 'csv'), new Blob([`\uFEFF${csvFromRows([flattenDeal(deal)])}`], { type: 'text/csv;charset=utf-8' }))
  } else {
    downloadBlob(dealFilename(deal, 'json'), new Blob([JSON.stringify(exportPayload({ format: 'json', scope: 'single', deals: [deal] }), null, 2)], { type: 'application/json' }))
  }
}
