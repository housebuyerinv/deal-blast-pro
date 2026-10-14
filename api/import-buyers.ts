import { getAuthenticatedAccount, cleanString } from './_accountAuth.js'
import { createHash } from 'node:crypto'
import { mergeImportedBuyer, preserveBuyerFields } from '../src/lib/buyerImportMerge.js'
import { consolidateImportRows } from '../src/lib/buyerImport.js'

const BUYERS_TABLE = process.env.SUPABASE_BUYERS_TABLE || process.env.VITE_SUPABASE_BUYERS_TABLE || 'buyers'

type BuyerCapacity =
  | { kind: 'finite'; plan: string; limit: number; used: number; remaining: number }
  | { kind: 'unlimited'; plan: string; used: number }

function send(res: any, status: number, payload: any) {
  res.status(status).json(payload)
}

function parseJsonBody(value: any) {
  if (typeof value !== 'string') return value || {}
  const cleaned = value.replace(/^\uFEFF/, '').trim()
  return cleaned ? JSON.parse(cleaned) : {}
}

function normalizeEmail(buyer: any) {
  return cleanString(
    buyer?.email ||
    buyer?.buyer_email ||
    buyer?.contact_email ||
    buyer?.Email ||
    ''
  ).toLowerCase()
}

function normalizeBuyerId(buyer: any) {
  return cleanString(buyer?.id) || `B${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8)}`
}

function asArray(value: any) {
  if (Array.isArray(value)) return value.map(item => cleanString(item)).filter(Boolean)
  const text = cleanString(value)
  if (!text) return []
  return text.split(/[;,|]/g).map(item => item.trim()).filter(Boolean)
}

function planBuyerLimit(planName: string) {
  switch (cleanString(planName).toLowerCase()) {
    case 'free demo':
    case 'free':
      return 25
    case 'starter':
      return 250
    case 'pro':
      return 1000
    case 'agency':
      return 2000
    case 'enterprise':
      return 5000
    default:
      return 25
  }
}

function resolveBuyerCapacity(input: {
  isOwnerAdmin: boolean
  planName: string
  savedCount: number
  purchasedCapacity?: any
  capacityMode?: any
  capacityLimit?: any
}): BuyerCapacity {
  const used = Math.max(0, Number(input.savedCount) || 0)
  const plan = cleanString(input.planName) || 'Free'
  const mode = cleanString(input.capacityMode).toLowerCase()
  const customLimit = Number(input.capacityLimit)

  if (input.isOwnerAdmin || mode === 'unlimited') {
    return { kind: 'unlimited', plan: 'Owner Admin', used }
  }

  const purchased = Math.max(0, Number(input.purchasedCapacity) || 0)
  const limit = mode === 'custom' && Number.isFinite(customLimit) && customLimit >= 0
    ? Math.floor(customLimit)
    : planBuyerLimit(plan) + purchased
  return {
    kind: 'finite',
    plan,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  }
}

function canAddBuyers(capacity: BuyerCapacity, netNewCount: number) {
  if (capacity.kind === 'unlimited') return true
  return Math.max(0, Number(netNewCount) || 0) <= capacity.remaining
}

function buyerToRow(buyer: any, workspaceId: string, userId: string, ownerUserId: string, existing?: any, reviewed = false) {
  if (buyer.importVersion === 2 || existing?.data?.importVersion === 2) {
    buyer = mergeImportedBuyer(existing ? rowToBuyer(existing) : {}, buyer, reviewed)
  } else if (existing) buyer = preserveBuyerFields(rowToBuyer(existing), buyer, reviewed)
  const now = new Date(Math.max(Date.now(), (Date.parse(existing?.updated_at) || 0) + 1)).toISOString()
  const email = normalizeEmail(buyer)
  const id = cleanString(existing?.id) || (buyer.importVersion === 2
    ? `BI${createHash('sha256').update(`${workspaceId}:${email}`).digest('hex').slice(0, 30)}`
    : normalizeBuyerId(buyer))
  const data = {
    ...(existing?.data && typeof existing.data === 'object' ? existing.data : {}),
    ...buyer,
    id,
    email,
    createdAt: buyer?.createdAt || buyer?.created_at || existing?.created_at || now,
    updatedAt: now,
    markets: asArray(buyer?.markets),
    assetTypes: asArray(buyer?.assetTypes || buyer?.asset_types),
    tags: asArray(buyer?.tags),
  }

  return {
    id,
    workspace_id: workspaceId,
    created_by_user_id: userId,
    owner_user_id: ownerUserId || userId,
    email,
    name: cleanString(data.name || data.buyerName || data.fullName),
    company: cleanString(data.company),
    phone: cleanString(data.phone || data.mobile),
    status: cleanString(data.status) || 'Active',
    source: cleanString(data.source),
    buyer_type: cleanString(data.buyerType || data.type) || (buyer.importVersion === 2 ? '' : 'Cash Buyer'),
    markets: data.markets,
    asset_types: data.assetTypes,
    strategy: cleanString(data.strategy || data.exitStrategy || data.investmentStrategy),
    budget_min: data.budgetMin ?? data.budget_min ?? null,
    budget_max: data.budgetMax ?? data.budget_max ?? data.budget ?? null,
    notes: data.notes ?? data.buyBox ?? data.buy_box ?? '',
    data,
    created_at: data.createdAt,
    updated_at: now,
  }
}

function rowToBuyer(row: any) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {}
  return {
    ...data,
    id: row.id || data.id,
    email: row.email || data.email || '',
    name: row.name || data.name || data.buyerName || '',
    company: row.company || data.company || '',
    phone: row.phone || data.phone || '',
    status: row.status || data.status || 'Active',
    type: row.buyer_type || data.type || data.buyerType || (data.importVersion === 2 ? '' : 'Cash Buyer'),
    buyerType: row.buyer_type || data.buyerType || data.type || (data.importVersion === 2 ? '' : 'Cash Buyer'),
    source: row.source || data.source || '',
    markets: Array.isArray(row.markets) && row.markets.length ? row.markets : Array.isArray(data.markets) ? data.markets : [],
    assetTypes: Array.isArray(row.asset_types) && row.asset_types.length ? row.asset_types : Array.isArray(data.assetTypes) ? data.assetTypes : [],
    budgetMin: row.budget_min ?? data.budgetMin ?? data.budget_min,
    budgetMax: row.budget_max ?? data.budgetMax ?? data.budget_max,
    strategy: row.strategy || data.strategy || '',
    notes: row.notes || data.notes || '',
    createdAt: data.createdAt || row.created_at,
    updatedAt: data.updatedAt || row.updated_at,
  }
}

function classifySupabaseError(error: any) {
  const message = cleanString(error?.message || error?.details || error?.hint || error)
  const lower = message.toLowerCase()

  if (lower.includes('buyer_plan_limit_exceeded')) {
    return { status: 409, code: 'capacity_exceeded', error: 'Your selected buyers exceed the remaining capacity for your plan.' }
  }

  if (error?.code === '42501' || lower.includes('permission') || lower.includes('row-level security') || lower.includes('rls')) {
    return { status: 403, code: 'permission_denied', error: 'You do not have permission to add buyers to this workspace.' }
  }

  if (lower.includes('network') || lower.includes('fetch')) {
    return { status: 503, code: 'network_error', error: 'Buyer import could not reach the server. Please try again.' }
  }

  return { status: 500, code: 'buyer_import_failed', error: 'Buyer import failed. No buyers were added.' }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return send(res, 405, { ok: false, code: 'method_not_allowed', error: 'Method not allowed' })
  }

  try {
    const account = await getAuthenticatedAccount(req)
    if (account.deactivated) {
      return send(res, 403, { ok: false, code: 'account_inactive', error: 'This account is not active.' })
    }

    const workspaceId = cleanString(account.workspace?.id || account.plan?.workspace_id)
    if (!workspaceId) {
      console.warn('[Deal Blast Pro] Buyer import missing workspace after authenticated resolution', {
        userId: account.user?.id,
        email: account.email,
        hasProfile: Boolean(account.profile),
        hasWorkspace: Boolean(account.workspace),
        hasPlan: Boolean(account.plan),
      })
      return send(res, 409, { ok: false, code: 'missing_workspace', error: 'We could not access your buyer workspace. Please refresh and try again.' })
    }

    const body = parseJsonBody(req.body)
    const reviewed = body.operation === 'reviewed-update'
    const rawBuyers = Array.isArray(body.buyers) ? body.buyers : []
    const buyers = consolidateImportRows(rawBuyers.filter((buyer: any) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(buyer))))
    if (!buyers.length) return send(res, 400, { ok: false, code: 'validation_failed', error: 'Some selected buyers could not be imported. Review the highlighted rows.' })

    const emails: string[] = Array.from(new Set(buyers.map(normalizeEmail).filter(Boolean)))
    // Legacy email values can be mixed-case. Page the authorized workspace rather
    // than an exact-case IN lookup (which previously missed those contacts).
    const existingRows: any[] = []
    let existingError: any = null
    for (let offset = 0; ; offset += 1000) {
      const page = await account.adminClient.from(BUYERS_TABLE).select('*')
        .eq('workspace_id', workspaceId).order('id').range(offset, offset + 999)
      if (page.error) { existingError = page.error; break }
      existingRows.push(...(page.data || []))
      if ((page.data || []).length < 1000) break
    }

    if (existingError) {
      const classified = classifySupabaseError(existingError)
      return send(res, classified.status, { ok: false, code: classified.code, error: classified.error })
    }

    const existingByEmail = new Map<string, any>()
    const ambiguousEmails = new Set<string>()
    ;(Array.isArray(existingRows) ? existingRows : []).forEach((row: any) => {
      const email = normalizeEmail(row)
      if (email && existingByEmail.has(email)) ambiguousEmails.add(email)
      if (email && !existingByEmail.has(email)) existingByEmail.set(email, row)
    })
    if (emails.some(email => ambiguousEmails.has(email))) {
      return send(res, 409, { ok: false, code: 'identity_conflict', error: 'Multiple existing profiles share an email. Resolve those existing duplicates before importing.' })
    }

    const identityConflict = reviewed
      ? buyers.some((buyer: any) => consolidateImportRows([buyer], existingRows.filter(row => row.id !== buyer.id)).some(row => row._identityConflict))
      : consolidateImportRows(buyers, existingRows).some(row => row._identityConflict)
    if (identityConflict) {
      return send(res, 409, { ok: false, code: 'identity_conflict', error: 'A phone number belongs to an existing contact with a different email. Review the identity before importing.' })
    }
    if (reviewed && buyers.some((buyer: any) => !existingRows.some(row => row.id === buyer.id))) {
      return send(res, 409, { ok: false, code: 'identity_conflict', error: 'The reviewed buyer no longer exists in this workspace. Refresh before saving.' })
    }
    if (reviewed && buyers.some((buyer: any) => existingByEmail.has(normalizeEmail(buyer)) && existingByEmail.get(normalizeEmail(buyer)).id !== buyer.id)) {
      return send(res, 409, { ok: false, code: 'identity_conflict', error: 'That email already belongs to another buyer. Review a merge instead.' })
    }

    const { count: savedBuyerCount, error: countError } = await account.adminClient
      .from(BUYERS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)

    if (countError) {
      const classified = classifySupabaseError(countError)
      return send(res, classified.status, { ok: false, code: classified.code, error: classified.error })
    }

    const netNewCount = emails.filter(email => !existingByEmail.has(email)).length
    const capacity = resolveBuyerCapacity({
      isOwnerAdmin: Boolean(account.isOwnerAdmin),
      planName: cleanString(account.plan?.effective_access_plan || account.plan?.current_plan || account.planName),
      purchasedCapacity: account.plan?.purchased_buyer_capacity,
      capacityMode: account.plan?.buyer_capacity_mode,
      capacityLimit: account.plan?.buyer_capacity_limit,
      savedCount: Number(savedBuyerCount) || 0,
    })

    if (capacity.kind === 'finite' && !canAddBuyers(capacity, netNewCount)) {
      return send(res, 409, {
        ok: false,
        code: 'capacity_exceeded',
        error: `You can add up to ${capacity.remaining.toLocaleString()} new buyer${capacity.remaining === 1 ? '' : 's'} on your current plan.`,
        capacity,
        netNewCount,
      })
    }

    const ownerUserId = cleanString(account.workspace?.owner_user_id || account.user.id)
    const payload = buyers.map((buyer: any) => buyerToRow(buyer, workspaceId, account.user.id, ownerUserId,
      reviewed ? existingRows.find(row => row.id === buyer.id) : existingByEmail.get(normalizeEmail(buyer)), reviewed))

    // Never overwrite a concurrently created profile. Merge retries read the latest
    // row and compare its version in the UPDATE predicate before writing.
    const data: any[] = []
    const inserted = new Map<string, any>()
    const newRows = reviewed ? [] : payload.filter(row => !existingByEmail.has(row.email))
    for (let offset = 0; offset < newRows.length; offset += 250) {
      const result = await account.adminClient.from(BUYERS_TABLE)
        .upsert(newRows.slice(offset, offset + 250), { onConflict: 'id', ignoreDuplicates: true }).select('*')
      if (result.error) {
        const classified = classifySupabaseError(result.error)
        return send(res, classified.status, { ok: false, code: classified.code, error: 'Import stopped. Some earlier rows may have saved; refresh before retrying.', imported: inserted.size })
      }
      for (const row of result.data || []) inserted.set(row.id, row)
    }
    for (let index = 0; index < payload.length; index += 1) {
      if (inserted.has(payload[index].id)) { data.push(inserted.get(payload[index].id)); continue }
      const buyer = buyers[index]
      let current = reviewed ? existingRows.find(row => row.id === buyer.id) : existingByEmail.get(normalizeEmail(buyer))
      let saved: any = null
      for (let attempt = 0; attempt < 5 && !saved; attempt += 1) {
        const row = buyerToRow(buyer, workspaceId, account.user.id, ownerUserId, current, reviewed)
        let query = current
          ? account.adminClient.from(BUYERS_TABLE).update(row).eq('workspace_id', workspaceId).eq('id', current.id)
          : account.adminClient.from(BUYERS_TABLE).upsert([row], { onConflict: 'id', ignoreDuplicates: true })
        if (current) query = current.updated_at == null ? query.is('updated_at', null) : query.eq('updated_at', current.updated_at)
        const result = await query.select('*')
        if (result.error) {
          const classified = classifySupabaseError(result.error)
          return send(res, classified.status, { ok: false, code: classified.code, error: 'Import stopped. Some earlier rows may have saved; refresh before retrying.', imported: data.length })
        }
        saved = result.data?.[0]
        if (!saved) {
          if (reviewed) return send(res, 409, { ok: false, code: 'concurrent_update', error: 'This buyer changed during review. Refresh and review the latest profile before saving.' })
          const fresh = await account.adminClient.from(BUYERS_TABLE).select('*').eq('workspace_id', workspaceId).eq('id', row.id)
          if (fresh.error || !fresh.data?.[0]) return send(res, 409, { ok: false, code: 'concurrent_update', error: 'Buyer changed during import. Refresh before retrying.', imported: data.length })
          current = fresh.data[0]
        }
      }
      if (!saved) return send(res, 409, { ok: false, code: 'concurrent_update', error: 'Buyer is being updated by another request. Refresh before retrying.', imported: data.length })
      data.push(saved)
    }

    return send(res, 200, {
      ok: true,
      data: Array.isArray(data) ? data.map(rowToBuyer) : [],
      workspaceId,
      imported: Array.isArray(data) ? data.length : 0,
      capacity,
      netNewCount,
    })
  } catch (error: any) {
    const status = Number(error?.status) || 500
    const code = cleanString(error?.code) || (status === 401 ? 'invalid_session' : 'buyer_import_failed')
    const message = code === 'auth_required' || code === 'invalid_session'
      ? 'Your session has expired. Please sign in again.'
      : 'Buyer import failed. No buyers were added.'

    return send(res, status, { ok: false, code, error: message })
  }
}
