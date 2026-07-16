import { getAuthenticatedAccount, cleanString } from './_accountAuth.js'

const BUYERS_TABLE = process.env.SUPABASE_BUYERS_TABLE || process.env.VITE_SUPABASE_BUYERS_TABLE || 'buyers'

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

function buyerToRow(buyer: any, workspaceId: string, userId: string, existing?: any) {
  const now = new Date().toISOString()
  const email = normalizeEmail(buyer)
  const id = cleanString(existing?.id) || normalizeBuyerId(buyer)
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
    owner_user_id: userId,
    email,
    name: cleanString(data.name || data.buyerName || data.fullName),
    company: cleanString(data.company),
    phone: cleanString(data.phone || data.mobile),
    status: cleanString(data.status) || 'Active',
    source: cleanString(data.source),
    buyer_type: cleanString(data.buyerType || data.type) || 'Cash Buyer',
    markets: data.markets,
    asset_types: data.assetTypes,
    strategy: cleanString(data.strategy || data.exitStrategy || data.investmentStrategy),
    budget_min: data.budgetMin ?? data.budget_min ?? null,
    budget_max: data.budgetMax ?? data.budget_max ?? data.budget ?? null,
    notes: cleanString(data.notes || data.buyBox || data.buy_box),
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
    type: row.buyer_type || data.type || data.buyerType || 'Cash Buyer',
    buyerType: row.buyer_type || data.buyerType || data.type || 'Cash Buyer',
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

    const workspaceId = cleanString(account.plan?.workspace_id || account.workspace?.id)
    if (!workspaceId) {
      return send(res, 409, { ok: false, code: 'missing_workspace', error: 'We could not identify your Deal Blast Pro workspace. Please refresh or contact support.' })
    }

    const body = parseJsonBody(req.body)
    const rawBuyers = Array.isArray(body.buyers) ? body.buyers : []
    const buyers = rawBuyers.filter((buyer: any) => normalizeEmail(buyer))
    if (!buyers.length) return send(res, 400, { ok: false, code: 'validation_failed', error: 'Some selected buyers could not be imported. Review the highlighted rows.' })

    const emails = Array.from(new Set(buyers.map(normalizeEmail).filter(Boolean)))
    const { data: existingRows, error: existingError } = await account.adminClient
      .from(BUYERS_TABLE)
      .select('id,email,data,created_at')
      .eq('workspace_id', workspaceId)
      .in('email', emails)

    if (existingError) {
      const classified = classifySupabaseError(existingError)
      return send(res, classified.status, { ok: false, code: classified.code, error: classified.error })
    }

    const existingByEmail = new Map<string, any>()
    ;(Array.isArray(existingRows) ? existingRows : []).forEach((row: any) => {
      const email = normalizeEmail(row)
      if (email && !existingByEmail.has(email)) existingByEmail.set(email, row)
    })

    const payload = buyers.map((buyer: any) => buyerToRow(buyer, workspaceId, account.user.id, existingByEmail.get(normalizeEmail(buyer))))

    const { data, error } = await account.adminClient
      .from(BUYERS_TABLE)
      .upsert(payload, { onConflict: 'id' })
      .select('id,email,name,company,phone,status,source,buyer_type,markets,asset_types,strategy,budget_min,budget_max,notes,data,created_at,updated_at')

    if (error) {
      const classified = classifySupabaseError(error)
      return send(res, classified.status, { ok: false, code: classified.code, error: classified.error })
    }

    return send(res, 200, {
      ok: true,
      data: Array.isArray(data) ? data.map(rowToBuyer) : [],
      workspaceId,
      imported: Array.isArray(data) ? data.length : 0,
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
