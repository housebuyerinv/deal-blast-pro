import { supabase } from './supabase'

export const BUYERS_TABLE =
  import.meta.env.VITE_SUPABASE_BUYERS_TABLE ||
  import.meta.env.VITE_BUYERS_TABLE ||
  'buyers'

export type BuyerSyncResult<T = any> = {
  ok: boolean
  data?: T
  error?: string
}

type BuyerScope = {
  userId: string
  email: string
  workspaceId: string
  planName: string
}

type BuyerScopeFilter = {
  column: string
  value: string
}

const buyerScopeColumns = [
  { column: 'workspace_id', source: 'workspaceId' },
  { column: 'created_by_user_id', source: 'userId' },
] as const

let resolvedBuyerScopeColumn: string | null = null

async function getActiveSupabaseSession() {
  if (!supabase) return null

  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData?.session?.access_token) return sessionData.session

  const { data: refreshData } = await supabase.auth.refreshSession()
  return refreshData?.session?.access_token ? refreshData.session : null
}

async function getBuyerScope(): Promise<BuyerScope | null> {
  if (!supabase) return null

  const session = await getActiveSupabaseSession()
  if (!session?.access_token) return null

  const { data, error } = await supabase.auth.getUser(session.access_token)
  if (error || !data.user) return null

  const { data: plan } = await supabase
    .from('workspace_plan_assignments')
    .select('workspace_id,plan_name')
    .eq('user_id', data.user.id)
    .maybeSingle()

  const workspaceId = String(plan?.workspace_id || '').trim()
  if (!workspaceId) return null

  return {
    userId: data.user.id,
    email: String(data.user.email || '').trim().toLowerCase(),
    workspaceId,
    planName: String(plan?.plan_name || 'Free').trim(),
  }
}

async function importBuyersThroughApi(buyers: any[]): Promise<BuyerSyncResult<any[]> | null> {
  if (!supabase || typeof fetch === 'undefined') return null

  const session = await getActiveSupabaseSession()
  if (!session?.access_token) {
    return {
      ok: false,
      error: 'Your session has expired. Please sign in again.',
    }
  }

  try {
    const response = await fetch('/api/import-buyers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ buyers }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok || payload?.ok === false) {
      return {
        ok: false,
        error: payload?.error || classifyBuyerImportError(payload?.code),
      }
    }

    return {
      ok: true,
      data: Array.isArray(payload?.data) ? payload.data : [],
    }
  } catch {
    return {
      ok: false,
      error: 'Buyer import could not reach the server. Please try again.',
    }
  }
}

function classifyBuyerImportError(code?: string) {
  if (code === 'auth_required' || code === 'invalid_session') return 'Your session has expired. Please sign in again.'
  if (code === 'missing_workspace') return 'We could not identify your Deal Blast Pro workspace. Please refresh or contact support.'
  if (code === 'capacity_exceeded') return 'Your selected buyers exceed the remaining capacity for your plan.'
  if (code === 'permission_denied') return 'You do not have permission to add buyers to this workspace.'
  if (code === 'network_error') return 'Buyer import could not reach the server. Please try again.'
  if (code === 'validation_failed') return 'Some selected buyers could not be imported. Review the highlighted rows.'
  return 'Buyer import failed. No buyers were added.'
}

function getBuyerScopeFilters(scope: BuyerScope): BuyerScopeFilter[] {
  return buyerScopeColumns
    .map(({ column, source }) => ({
      column,
      value: String(scope[source] || ''),
    }))
    .filter(filter => Boolean(filter.value))
}

function looksLikeMissingColumnError(error: any) {
  const message = String(error?.message || error?.details || error?.hint || error || '').toLowerCase()
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('column')
  )
}

function addBuyerScopeToRow(row: any, filter: BuyerScopeFilter | null) {
  if (!filter) return row
  return {
    ...row,
    [filter.column]: filter.value,
  }
}

function addBuyerWorkspaceToRow(row: any, scope: BuyerScope) {
  return {
    ...row,
    workspace_id: scope.workspaceId,
    created_by_user_id: scope.userId,
    owner_user_id: scope.userId,
  }
}

async function resolveBuyerScopeFilter(scope: BuyerScope): Promise<BuyerScopeFilter | null> {
  const filters = getBuyerScopeFilters(scope)
  const cached = filters.find(filter => filter.column === resolvedBuyerScopeColumn)
  if (cached) return cached

  for (const filter of filters) {
    const { error } = await supabase
      .from(BUYERS_TABLE)
      .select('id')
      .eq(filter.column, filter.value)
      .limit(1)

    if (!error) {
      resolvedBuyerScopeColumn = filter.column
      return filter
    }

    if (!looksLikeMissingColumnError(error)) {
      console.warn('[Deal Blast Pro] Buyer sync scope check failed:', error.message || error)
      return null
    }
  }

  return null
}

function normalizeBuyerId(buyer: any) {
  return String(buyer?.id || ('B' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6))).trim()
}

function normalizeEmail(buyer: any) {
  return String(
    buyer?.email ||
    buyer?.buyer_email ||
    buyer?.contact_email ||
    buyer?.Email ||
    ''
  )
    .trim()
    .toLowerCase()
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

function buyerToRow(buyer: any) {
  const id = normalizeBuyerId(buyer)
  const email = normalizeEmail(buyer)
  const now = new Date().toISOString()

  const data = {
    ...buyer,
    id,
    email,
    createdAt: buyer?.createdAt || buyer?.created_at || now,
    updatedAt: now,
    markets: Array.isArray(buyer?.markets) ? buyer.markets : [],
    assetTypes: Array.isArray(buyer?.assetTypes) ? buyer.assetTypes : [],
    tags: Array.isArray(buyer?.tags) ? buyer.tags : [],
  }

  return {
    id,
    email,
    name: data.name || data.buyerName || data.fullName || '',
    company: data.company || '',
    phone: data.phone || data.mobile || '',
    status: data.status || 'Active',
    source: data.source || '',
    buyer_type: data.buyerType || data.type || 'Cash Buyer',
    markets: Array.isArray(data.markets) ? data.markets : [],
    asset_types: Array.isArray(data.assetTypes) ? data.assetTypes : [],
    strategy: data.strategy || data.exitStrategy || data.investmentStrategy || '',
    budget_min: data.budgetMin ?? data.budget_min ?? null,
    budget_max: data.budgetMax ?? data.budget_max ?? data.budget ?? null,
    notes: data.notes || data.buyBox || data.buy_box || '',
    data,
    updated_at: now,
    created_at: buyer?.createdAt || buyer?.created_at || now,
  }
}




const titleCase = (value: any) => {
  return String(value || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
};

const inferNameFromEmail = (email: any) => {
  const local = String(email || '').split('@')[0] || '';
  return titleCase(local) || 'Buyer';
};

const firstValue = (...values: any[]) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;

    const text = String(value).trim();
    if (!text) continue;

    const bad = ['undefined', 'null', 'n/a', 'na', 'none'];
    if (bad.includes(text.toLowerCase())) continue;

    return value;
  }

  return undefined;
};

const textValue = (...values: any[]) => {
  const value = firstValue(...values);
  return value === undefined ? '' : String(value).trim();
};

const numberValue = (...values: any[]) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const text = String(value ?? '').trim();
    if (!text) continue;

    const cleaned = text.replace(/[$,\s]/g, '');
    const n = Number(cleaned);

    if (Number.isFinite(n) && n > 0) return n;
  }

  return undefined;
};

const boolValue = (...values: any[]) => {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;

    const text = String(value ?? '').trim().toLowerCase();
    if (!text) continue;

    if (['true', 'yes', 'y', '1', 'cash', 'seller finance', 'creative'].includes(text)) return true;
    if (['false', 'no', 'n', '0'].includes(text)) return false;
  }

  return false;
};

const listValue = (...values: any[]) => {
  for (const value of values) {
    if (Array.isArray(value)) {
      const cleaned = value
        .map(v => String(v ?? '').trim())
        .filter(Boolean);

      if (cleaned.length) return cleaned;
    }

    const text = String(value ?? '').trim();
    if (!text) continue;

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .map(v => String(v ?? '').trim())
          .filter(Boolean);

        if (cleaned.length) return cleaned;
      }
    } catch {}

    const cleaned = text
      .split(/[;,|]/g)
      .map(v => v.trim())
      .filter(Boolean);

    if (cleaned.length) return cleaned;
  }

  return [];
};

const repairBuyerForDisplay = (buyer: any) => {
  const email = textValue(
    buyer?.email,
    buyer?.buyer_email,
    buyer?.contact_email,
    buyer?.Email
  );

  const nameRaw = textValue(
    buyer?.name,
    buyer?.buyerName,
    buyer?.buyer_name,
    buyer?.fullName,
    buyer?.full_name,
    buyer?.contactName,
    buyer?.contact_name,
    buyer?.firstName,
    buyer?.first_name,
    buyer?.Name
  );

  const name = nameRaw && !['buyer name', 'name missing'].includes(nameRaw.toLowerCase())
    ? nameRaw
    : inferNameFromEmail(email);

  const company = textValue(
    buyer?.company,
    buyer?.companyName,
    buyer?.company_name,
    buyer?.entity,
    buyer?.businessName,
    buyer?.business_name,
    buyer?.organization,
    buyer?.Company
  ) || 'Company Missing';

  const phone = textValue(
    buyer?.phone,
    buyer?.mobile,
    buyer?.cell,
    buyer?.phoneNumber,
    buyer?.phone_number,
    buyer?.Phone
  ) || 'Phone Missing';

  const markets = listValue(
    buyer?.markets,
    buyer?.targetMarkets,
    buyer?.target_markets,
    buyer?.market,
    buyer?.states,
    buyer?.state,
    buyer?.locations,
    buyer?.target_states,
    buyer?.targetStates
  );

  const assetTypes = listValue(
    buyer?.assetTypes,
    buyer?.asset_types,
    buyer?.assetFocus,
    buyer?.asset_focus,
    buyer?.propertyTypes,
    buyer?.property_types,
    buyer?.buyer_asset_types,
    buyer?.focus
  );

  const zipCodes = listValue(
    buyer?.zipCodes,
    buyer?.zip_codes,
    buyer?.zips,
    buyer?.zipcodes
  );

  const budgetMin = numberValue(
    buyer?.budgetMin,
    buyer?.budget_min,
    buyer?.minBudget,
    buyer?.min_budget,
    buyer?.price_min
  );

  const budgetMax = numberValue(
    buyer?.budgetMax,
    buyer?.budget_max,
    buyer?.maxBudget,
    buyer?.max_budget,
    buyer?.price_max,
    buyer?.budget
  );

  const downPaymentMax = numberValue(
    buyer?.downPaymentMax,
    buyer?.down_payment_max,
    buyer?.maxDownPayment,
    buyer?.max_down_payment
  );

  const monthlyPaymentMax = numberValue(
    buyer?.monthlyPaymentMax,
    buyer?.monthly_payment_max,
    buyer?.maxMonthlyPayment,
    buyer?.max_monthly_payment
  );

  const buyerType = textValue(
    buyer?.buyerType,
    buyer?.buyer_type,
    buyer?.type,
    buyer?.category
  ) || 'Buyer';

  const notes = textValue(
    buyer?.notes,
    buyer?.buyBoxSummary,
    buyer?.buy_box_summary,
    buyer?.criteria,
    buyer?.requirements,
    buyer?.description
  );

  const creativeFinance = boolValue(
    buyer?.creativeFinance,
    buyer?.creative_finance,
    buyer?.creative
  );

  const sellerFinance = boolValue(
    buyer?.sellerFinance,
    buyer?.seller_finance,
    buyer?.ownerFinance,
    buyer?.owner_finance
  );

  const cashBuyer = boolValue(
    buyer?.cashBuyer,
    buyer?.cash_buyer,
    buyer?.cash
  ) || (!creativeFinance && !sellerFinance);

  return {
    ...buyer,

    // app shape
    id: textValue(buyer?.id, buyer?.buyer_id, buyer?.uuid),
    name,
    email,
    company,
    phone,
    mobile: textValue(buyer?.mobile, buyer?.cell),
    type: buyerType,
    buyerType,
    status: textValue(buyer?.status) || 'Active',
    source: textValue(buyer?.source, buyer?.lead_source, buyer?.leadSource),

    markets: markets.length ? markets : [],
    targetMarkets: markets.length ? markets : [],
    assetTypes: assetTypes.length ? assetTypes : [],
    assetFocus: assetTypes.length ? assetTypes : [],
    zipCodes,

    budgetMin,
    budgetMax,
    downPaymentMax,
    monthlyPaymentMax,

    bedRequirement: textValue(buyer?.bedRequirement, buyer?.bed_requirement),
    bathRequirement: textValue(buyer?.bathRequirement, buyer?.bath_requirement),
    unitRequirement: textValue(buyer?.unitRequirement, buyer?.unit_requirement),

    notes,
    buyBoxSummary: notes,

    creativeFinance,
    sellerFinance,
    cashBuyer,

    heatScore: numberValue(buyer?.heatScore, buyer?.heat_score) ?? 50,
    strengthScore: numberValue(buyer?.strengthScore, buyer?.strength_score) ?? 65,

    createdAt: textValue(buyer?.createdAt, buyer?.created_at) || new Date().toISOString(),
    updatedAt: textValue(buyer?.updatedAt, buyer?.updated_at) || textValue(buyer?.createdAt, buyer?.created_at) || new Date().toISOString()
  };
};


function mergeBuyerRecords(existing: any, buyer: any) {
  const now = new Date().toISOString()

  return {
    ...existing,
    ...buyer,
    id: existing?.id || buyer?.id,
    email: normalizeEmail(buyer) || normalizeEmail(existing),
    name: buyer?.name || existing?.name,
    company: buyer?.company || existing?.company,
    phone: buyer?.phone || existing?.phone,
    mobile: buyer?.mobile || existing?.mobile,
    markets: Array.isArray(buyer?.markets) && buyer.markets.length ? buyer.markets : existing?.markets,
    targetMarkets: Array.isArray(buyer?.targetMarkets) && buyer.targetMarkets.length ? buyer.targetMarkets : existing?.targetMarkets,
    assetTypes: Array.isArray(buyer?.assetTypes) && buyer.assetTypes.length ? buyer.assetTypes : existing?.assetTypes,
    assetFocus: Array.isArray(buyer?.assetFocus) && buyer.assetFocus.length ? buyer.assetFocus : existing?.assetFocus,
    zipCodes: Array.isArray(buyer?.zipCodes) && buyer.zipCodes.length ? buyer.zipCodes : existing?.zipCodes,
    notes: buyer?.notes || existing?.notes,
    buyBoxSummary: buyer?.buyBoxSummary || existing?.buyBoxSummary,
    createdAt: existing?.createdAt || buyer?.createdAt || buyer?.created_at,
    updatedAt: now,
  }
}

function dedupeBuyersByEmailOrId(buyers: any[]) {
  const map = new Map<string, any>()

  ;(buyers || []).forEach((buyer: any) => {
    const repaired = repairBuyerForDisplay(buyer)
    const key = normalizeEmail(repaired) || String(repaired?.id || '').trim()
    if (!key) return

    const existing = map.get(key)
    map.set(key, existing ? mergeBuyerRecords(existing, repaired) : repaired)
  })

  return Array.from(map.values())
}


export async function fetchBuyersFromSupabase() {
  if (!supabase) {
    return { ok: false, data: [], error: 'Supabase client not configured' }
  }

  const scope = await getBuyerScope()
  if (!scope) {
    return { ok: true, data: [], error: null }
  }

  const scopeFilter = await resolveBuyerScopeFilter(scope)
  if (!scopeFilter) {
    return {
      ok: false,
      data: [],
      error: 'Buyer sync requires an owner-scoped buyers table; refusing to load a shared global buyer list.',
    }
  }

  const pageSize = 1000
  const allRows: any[] = []

  for (let from = 0; 

; from += pageSize) {
    const to = from + pageSize - 1

    const { data, error } = await supabase
      .from(BUYERS_TABLE)
      .select('*')
      .eq(scopeFilter.column, scopeFilter.value)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      return { ok: false, data: allRows, error: error.message || String(error) }
    }

    const page = Array.isArray(data) ? data : []
    allRows.push(...page)

    if (page.length < pageSize) break
  }

  return { ok: true, data: dedupeBuyersByEmailOrId(allRows), error: null }
}


function dedupeBuyersBeforeSupabaseSave(buyers: any[]) {
  const map = new Map<string, any>()

  ;(buyers || []).forEach((buyer: any) => {
    const repaired = repairBuyerForDisplay(buyer)
    const key = normalizeEmail(repaired) || String(repaired?.id || '').trim()
    if (!key) return

    const existing = map.get(key)
    map.set(key, existing ? mergeBuyerRecords(existing, repaired) : repaired)
  })

  return Array.from(map.values())
}

export async function upsertBuyersToSupabase(buyers: any[]): Promise<BuyerSyncResult<any[]>> {
  try {
    if (!supabase) return { ok: false, error: 'Supabase client missing' }

    const incoming = dedupeBuyersBeforeSupabaseSave(buyers || [])
    if (!incoming.length) return { ok: true, data: [] }

    const apiResult = await importBuyersThroughApi(incoming)
    if (apiResult) return apiResult

    const scope = await getBuyerScope()
    if (!scope) return { ok: false, error: 'Your session has expired. Please sign in again.' }

    const scopeFilter = await resolveBuyerScopeFilter(scope)
    if (!scopeFilter) {
      return {
        ok: false,
        error: 'Buyer sync requires an owner-scoped buyers table before cloud buyer saves are enabled.',
      }
    }

    // First look up existing buyer rows and reuse their ids when the email already exists.
    // This keeps approvals working even before the database has a UNIQUE(email) constraint.
    const existingRows = await fetchBuyersFromSupabase()
    const existingByEmail = new Map<string, any>()

    if (existingRows.ok && Array.isArray(existingRows.data)) {
      existingRows.data.forEach((buyer: any) => {
        const emailKey = normalizeEmail(buyer)
        if (!emailKey || existingByEmail.has(emailKey)) return
        existingByEmail.set(emailKey, buyer)
      })
    }

    const payload = incoming.map((buyer: any) => {
      const emailKey = normalizeEmail(buyer)
      const existing = emailKey ? existingByEmail.get(emailKey) : null
      const merged = existing ? mergeBuyerRecords(existing, buyer) : buyer

      return addBuyerWorkspaceToRow(addBuyerScopeToRow(buyerToRow({
        ...merged,
        id: existing?.id || buyer?.id,
        email: emailKey || normalizeEmail(merged),
        createdAt: existing?.createdAt || buyer?.createdAt || buyer?.created_at,
      }), scopeFilter), scope)
    })

    // Use id conflict because every Supabase table already has id uniqueness.
    // Email-conflict only works after a UNIQUE(email) constraint exists, which caused approval errors.
    const { data, error } = await supabase
      .from(BUYERS_TABLE)
      .upsert(payload, { onConflict: 'id' })
      .select('id,email,data,created_at,updated_at')

    if (error) return { ok: false, error: error.message }

    return {
      ok: true,
      data: Array.isArray(data) ? data.map(rowToBuyer) : [],
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

export async function insertBuyerToSupabase(buyer: any): Promise<BuyerSyncResult<any>> {
  try {
    const result = await upsertBuyersToSupabase([buyer])
    if (!result.ok) return result
    return { ok: true, data: result.data?.[0] }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

export async function updateBuyerInSupabase(id: string, updates: any): Promise<BuyerSyncResult<any>> {
  try {
    if (!supabase) return { ok: false, error: 'Supabase client missing' }

    const existing = await fetchBuyersFromSupabase()
    const current = existing.ok
      ? existing.data?.find((b: any) => b.id === id) || {}
      : {}

    const merged = {
      ...current,
      ...updates,
      id,
      updatedAt: new Date().toISOString(),
    }

    const result = await upsertBuyersToSupabase([merged])
    if (!result.ok) return result

    return { ok: true, data: result.data?.[0] }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

export async function deleteBuyersFromSupabase(ids: string[]): Promise<BuyerSyncResult<boolean>> {
  try {
    if (!supabase) return { ok: false, error: 'Supabase client missing' }

    const scope = await getBuyerScope()
    if (!scope) return { ok: false, error: 'Sign in before deleting buyers from Supabase' }

    const scopeFilter = await resolveBuyerScopeFilter(scope)
    if (!scopeFilter) {
      console.warn('[Deal Blast Pro] Skipping Supabase buyer delete because the buyers table is not owner-scoped.')
      return { ok: true, data: true }
    }

    const cleanIds = Array.from(new Set((ids || []).map(id => String(id || '').trim()).filter(Boolean)))
    if (!cleanIds.length) return { ok: true, data: true }

    // PostgREST can return 400 Bad Request if the id list is huge, so delete in chunks.
    // This also avoids URL-length issues when deleting hundreds/thousands of buyers.
    const chunkSize = 100

    for (let i = 0; i < cleanIds.length; i += chunkSize) {
      const chunk = cleanIds.slice(i, i + chunkSize)
      const { error } = await supabase
        .from(BUYERS_TABLE)
        .delete()
        .eq(scopeFilter.column, scopeFilter.value)
        .in('id', chunk)

      if (error) {
        // Some older/local-only buyer ids may not match a UUID id column.
        // If the table id column is UUID, retry the chunk using only UUID-looking ids.
        const uuidIds = chunk.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))

        if (uuidIds.length && uuidIds.length !== chunk.length) {
          const retry = await supabase
            .from(BUYERS_TABLE)
            .delete()
            .eq(scopeFilter.column, scopeFilter.value)
            .in('id', uuidIds)

          if (retry.error) return { ok: false, error: retry.error.message || String(retry.error) }
          continue
        }

        return { ok: false, error: error.message || String(error) }
      }
    }

    return { ok: true, data: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

export async function deleteAllBuyersFromSupabase(): Promise<BuyerSyncResult<boolean>> {
  try {
    if (!supabase) return { ok: false, error: 'Supabase client missing' }

    const scope = await getBuyerScope()
    if (!scope) return { ok: false, error: 'Sign in before deleting buyers from Supabase' }

    const scopeFilter = await resolveBuyerScopeFilter(scope)
    if (!scopeFilter) {
      console.warn('[Deal Blast Pro] Skipping Supabase buyer clear because the buyers table is not owner-scoped.')
      return { ok: true, data: true }
    }

    // Supabase requires a WHERE clause for delete(). Keep this scoped to the active owner.
    const { error } = await supabase
      .from(BUYERS_TABLE)
      .delete()
      .eq(scopeFilter.column, scopeFilter.value)
      .not('id', 'is', null)

    if (error) return { ok: false, error: error.message || String(error) }
    return { ok: true, data: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}
