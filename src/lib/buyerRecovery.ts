import { supabase } from './supabase'
import { BUYERS_TABLE, fetchBuyersFromSupabase } from './buyerSupabaseSync'

type RecoveryScope = {
  userId: string
  email: string
}

export type BuyerRecoverySource = 'supabase-owned' | 'supabase-legacy' | 'local-legacy' | 'old-demo-workspace' | 'import-file'

export type RecoverableBuyer = {
  recoveryId: string
  recoverySource: BuyerRecoverySource
  recoveryLabel: string
  buyer: any
}

export type BuyerRecoveryScanResult = {
  ok: boolean
  message: string
  ownerScopeActive: boolean
  supportedOwnerColumns: string[]
  currentAccountBuyersCount: number
  supabaseOwnedCount: number
  legacyUnscopedCount: number
  localLegacyCount: number
  oldDemoWorkspaceCount: number
  importFileCount: number
  migrationAvailable: boolean
  unsafeGlobalBuyerLoadingBlocked: boolean
  recoverableBuyers: RecoverableBuyer[]
}

const ownerColumns = [
  { column: 'user_id', source: 'userId' },
  { column: 'owner_id', source: 'userId' },
  { column: 'account_id', source: 'userId' },
  { column: 'created_by', source: 'userId' },
  { column: 'user_email', source: 'email' },
  { column: 'owner_email', source: 'email' },
] as const

const buyerishKeys = ['email', 'buyer_email', 'contact_email', 'name', 'phone', 'markets', 'assettypes', 'budgetmax', 'tags']

function safeString(value: any) {
  return String(value || '').trim()
}

function normalizeEmail(value: any) {
  return safeString(value).toLowerCase()
}

function buyerEmail(buyer: any) {
  return normalizeEmail(buyer?.email || buyer?.buyer_email || buyer?.contact_email || buyer?.Email)
}

function buyerName(buyer: any) {
  return safeString(buyer?.name || buyer?.fullName || buyer?.buyer_name || buyer?.company || buyerEmail(buyer) || 'Unknown Buyer')
}

function makeRecoveryId(source: BuyerRecoverySource, buyer: any, index: number) {
  return `${source}:${buyerEmail(buyer) || safeString(buyer?.id) || index}`
}

function rowToBuyer(row: any) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {}
  return {
    ...row,
    ...data,
    id: data.id || row?.id || `REC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    email: row?.email || data.email || row?.buyer_email || data.buyer_email || '',
    createdAt: data.createdAt || row?.created_at || row?.createdAt,
    updatedAt: data.updatedAt || row?.updated_at || row?.updatedAt,
  }
}

function dedupeRecoverable(items: RecoverableBuyer[]) {
  const map = new Map<string, RecoverableBuyer>()
  items.forEach((item, index) => {
    const key = buyerEmail(item.buyer) || safeString(item.buyer?.id) || `${item.recoverySource}:${index}`
    if (!key || map.has(key)) return
    map.set(key, item)
  })
  return Array.from(map.values())
}

async function getScope(): Promise<RecoveryScope | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  return {
    userId: data.user.id,
    email: normalizeEmail(data.user.email),
  }
}

function scopeValue(scope: RecoveryScope, source: 'userId' | 'email') {
  return source === 'userId' ? scope.userId : scope.email
}

async function findSupportedOwnerColumns(scope: RecoveryScope) {
  if (!supabase) return []
  const supported: string[] = []

  for (const ownerColumn of ownerColumns) {
    const value = scopeValue(scope, ownerColumn.source)
    if (!value) continue

    const { error } = await supabase
      .from(BUYERS_TABLE)
      .select('id')
      .eq(ownerColumn.column, value)
      .limit(1)

    if (!error) supported.push(ownerColumn.column)
  }

  return supported
}

async function fetchRowsByColumn(column: string, value: string) {
  if (!supabase || !column || !value) return []
  const { data, error } = await supabase
    .from(BUYERS_TABLE)
    .select('*')
    .eq(column, value)
    .limit(1000)

  if (error) return []
  return Array.isArray(data) ? data : []
}

async function fetchLegacyUnscopedRows(column: string) {
  if (!supabase || !column) return []
  const { data, error } = await supabase
    .from(BUYERS_TABLE)
    .select('*')
    .is(column, null)
    .limit(1000)

  if (error) return []
  return Array.isArray(data) ? data : []
}

function looksLikeBuyer(value: any) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).map(key => key.toLowerCase())
  return buyerishKeys.some(key => keys.includes(key)) && Boolean(buyerEmail(value) || value.name || value.company)
}

function collectBuyerArrays(value: any, found: any[][] = [], depth = 0) {
  if (!value || depth > 5) return found
  if (Array.isArray(value)) {
    if (value.some(looksLikeBuyer)) found.push(value.filter(looksLikeBuyer))
    return found
  }
  if (typeof value !== 'object') return found

  Object.keys(value).forEach(key => {
    const lowered = key.toLowerCase()
    if (['buyers', 'buyerlist', 'buyerdatabase', 'buyerrecords'].includes(lowered) && Array.isArray(value[key])) {
      found.push(value[key].filter(looksLikeBuyer))
      return
    }
    collectBuyerArrays(value[key], found, depth + 1)
  })

  return found
}

function parseJsonMaybe(raw: string) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function scanLocalStorage(scope: RecoveryScope | null) {
  const localLegacy: any[] = []
  const oldDemoWorkspace: any[] = []
  if (typeof window === 'undefined' || !window.localStorage) {
    return { localLegacy, oldDemoWorkspace }
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index) || ''
    const loweredKey = key.toLowerCase()
    if (!/(dealblast|deal-blast|buyer|workspace|dbp)/i.test(key)) continue

    const parsed = parseJsonMaybe(window.localStorage.getItem(key) || '')
    if (!parsed) continue

    const ownerEmail = normalizeEmail(parsed?.state?.workspaceOwnerEmail || parsed?.workspaceOwnerEmail || parsed?.owner_email || parsed?.user_email)
    const ownerId = safeString(parsed?.state?.workspaceOwnerId || parsed?.workspaceOwnerId || parsed?.owner_id || parsed?.user_id)
    const buyerArrays = collectBuyerArrays(parsed)
    const buyers = buyerArrays.flat()
    if (!buyers.length) continue

    const belongsToCurrent = scope && ((ownerEmail && ownerEmail === scope.email) || (ownerId && ownerId === scope.userId) || loweredKey.includes(scope.email))
    const looksOldDemo = loweredKey.includes('demo') || loweredKey.includes('sample') || (ownerEmail && ownerEmail !== scope?.email) || (ownerId && ownerId !== scope?.userId)

    if (belongsToCurrent) continue
    if (looksOldDemo) oldDemoWorkspace.push(...buyers)
    else localLegacy.push(...buyers)
  }

  return { localLegacy, oldDemoWorkspace }
}

export async function parseBuyerRecoveryImportFile(file: File): Promise<RecoverableBuyer[]> {
  const text = await file.text()
  const parsedJson = parseJsonMaybe(text)
  let buyers: any[] = []

  if (Array.isArray(parsedJson)) {
    buyers = parsedJson
  } else if (parsedJson && typeof parsedJson === 'object') {
    buyers = collectBuyerArrays(parsedJson).flat()
  } else {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    const headers = lines[0]?.split(/,|\t/).map(header => header.trim()) || []
    buyers = lines.slice(1).map(line => {
      const values = line.split(/,|\t/).map(value => value.trim())
      return headers.reduce((row: any, header, index) => {
        row[header] = values[index] || ''
        return row
      }, {})
    }).filter(looksLikeBuyer)
  }

  return dedupeRecoverable(
    buyers.map((buyer, index) => ({
      recoveryId: makeRecoveryId('import-file', buyer, index),
      recoverySource: 'import-file',
      recoveryLabel: 'Uploaded buyer backup',
      buyer,
    }))
  )
}

export async function scanBuyerRecoverySources(currentBuyers: any[] = [], importedBuyers: RecoverableBuyer[] = []): Promise<BuyerRecoveryScanResult> {
  const scope = await getScope()
  const supportedOwnerColumns = scope ? await findSupportedOwnerColumns(scope) : []
  const ownerScopeActive = supportedOwnerColumns.length > 0
  const recoverable: RecoverableBuyer[] = []
  let supabaseOwnedRows: any[] = []
  let legacyRows: any[] = []

  if (scope && ownerScopeActive) {
    const scopedResult = await fetchBuyersFromSupabase()
    if (scopedResult.ok && Array.isArray(scopedResult.data)) {
      supabaseOwnedRows = scopedResult.data
    }

    const emailColumn = supportedOwnerColumns.find(column => column === 'user_email' || column === 'owner_email')
    if (emailColumn && scope.email) {
      const emailRows = await fetchRowsByColumn(emailColumn, scope.email)
      if (emailRows.length) supabaseOwnedRows = [...supabaseOwnedRows, ...emailRows.map(rowToBuyer)]
    }

    const legacyColumn = supportedOwnerColumns[0]
    legacyRows = (await fetchLegacyUnscopedRows(legacyColumn)).map(rowToBuyer)
    recoverable.push(...legacyRows.map((buyer, index) => ({
      recoveryId: makeRecoveryId('supabase-legacy', buyer, index),
      recoverySource: 'supabase-legacy' as BuyerRecoverySource,
      recoveryLabel: 'Supabase legacy unscoped buyer',
      buyer,
    })))
  }

  const local = scanLocalStorage(scope)
  recoverable.push(...local.localLegacy.map((buyer, index) => ({
    recoveryId: makeRecoveryId('local-legacy', buyer, index),
    recoverySource: 'local-legacy' as BuyerRecoverySource,
    recoveryLabel: 'Browser local legacy buyer',
    buyer,
  })))
  recoverable.push(...local.oldDemoWorkspace.map((buyer, index) => ({
    recoveryId: makeRecoveryId('old-demo-workspace', buyer, index),
    recoverySource: 'old-demo-workspace' as BuyerRecoverySource,
    recoveryLabel: 'Old demo workspace buyer',
    buyer,
  })))
  recoverable.push(...importedBuyers)

  return {
    ok: true,
    message: ownerScopeActive
      ? 'Recovery sources checked. Migration is available through scoped buyer ownership.'
      : 'Recovery sources checked. Supabase buyer migration needs an owner-scoped buyers table before import.',
    ownerScopeActive,
    supportedOwnerColumns,
    currentAccountBuyersCount: Array.isArray(currentBuyers) ? currentBuyers.length : 0,
    supabaseOwnedCount: dedupeRecoverable(supabaseOwnedRows.map((buyer, index) => ({
      recoveryId: makeRecoveryId('supabase-owned', buyer, index),
      recoverySource: 'supabase-owned',
      recoveryLabel: 'Supabase buyer owned by current account',
      buyer,
    }))).length,
    legacyUnscopedCount: legacyRows.length,
    localLegacyCount: dedupeRecoverable(local.localLegacy.map((buyer, index) => ({
      recoveryId: makeRecoveryId('local-legacy', buyer, index),
      recoverySource: 'local-legacy',
      recoveryLabel: 'Browser local legacy buyer',
      buyer,
    }))).length,
    oldDemoWorkspaceCount: dedupeRecoverable(local.oldDemoWorkspace.map((buyer, index) => ({
      recoveryId: makeRecoveryId('old-demo-workspace', buyer, index),
      recoverySource: 'old-demo-workspace',
      recoveryLabel: 'Old demo workspace buyer',
      buyer,
    }))).length,
    importFileCount: importedBuyers.length,
    migrationAvailable: ownerScopeActive,
    unsafeGlobalBuyerLoadingBlocked: true,
    recoverableBuyers: dedupeRecoverable(recoverable),
  }
}

export function prepareRecoveredBuyers(items: RecoverableBuyer[]) {
  const now = new Date().toISOString()
  return dedupeRecoverable(items).map(item => {
    const existingNotes = safeString(item.buyer?.notes)
    const recoveryNote = 'Recovered from legacy buyer storage'
    return {
      ...item.buyer,
      name: buyerName(item.buyer),
      email: buyerEmail(item.buyer),
      tags: Array.isArray(item.buyer?.tags) ? item.buyer.tags : safeString(item.buyer?.tags).split(/[,.|]/).map(tag => tag.trim()).filter(Boolean),
      markets: Array.isArray(item.buyer?.markets) ? item.buyer.markets : safeString(item.buyer?.markets).split(/[,.|]/).map(market => market.trim()).filter(Boolean),
      assetTypes: Array.isArray(item.buyer?.assetTypes) ? item.buyer.assetTypes : Array.isArray(item.buyer?.asset_types) ? item.buyer.asset_types : safeString(item.buyer?.assetTypes || item.buyer?.asset_types).split(/[,.|]/).map(type => type.trim()).filter(Boolean),
      status: item.buyer?.status || 'Active',
      source: [item.buyer?.source, recoveryNote].filter(Boolean).join(' | '),
      notes: existingNotes.includes(recoveryNote) ? existingNotes : [existingNotes, recoveryNote].filter(Boolean).join(' | '),
      recoverySource: item.recoverySource,
      recoveredAt: now,
      updatedAt: now,
    }
  })
}

export function recoverableBuyersToCsv(items: RecoverableBuyer[]) {
  const buyers = prepareRecoveredBuyers(items)
  const columns = Array.from(new Set(buyers.flatMap(buyer => Object.keys(buyer)))).filter(column => typeof column === 'string')
  const escape = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [
    columns.join(','),
    ...buyers.map(buyer => columns.map(column => escape(Array.isArray(buyer[column]) ? buyer[column].join('|') : buyer[column])).join(',')),
  ].join('\n')
}
