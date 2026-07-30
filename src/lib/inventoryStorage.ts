import type { Deal } from './types'
import { supabase } from './supabaseClient'

const INVENTORY_COLUMNS = 'id,source_submission_id,status,deal_data,created_at,updated_at'

const rowToDeal = (row: any): Deal => ({
  ...(row?.deal_data || {}),
  id: row.id,
  status: row.status || row?.deal_data?.status || 'Approved',
  sourceSubmissionId: row.source_submission_id || row?.deal_data?.sourceSubmissionId,
  createdAt: row.created_at || row?.deal_data?.createdAt,
  updatedAt: row.updated_at || row?.deal_data?.updatedAt,
}) as Deal

export async function listInventoryDeals() {
  if (!supabase) return { ok: false as const, error: new Error('Supabase client is not configured'), data: [] }
  try {
    const { data, error } = await supabase
      .from('inventory_deals')
      .select(INVENTORY_COLUMNS)
      .order('updated_at', { ascending: false })
    if (error) return { ok: false as const, error, data: [] }
    return { ok: true as const, error: null, data: (data || []).map(rowToDeal) }
  } catch (error) {
    return { ok: false as const, error, data: [] }
  }
}

export async function convertSubmissionToInventory(
  submissionId: string,
  inventoryDeal: Record<string, any>,
  convertedBy: string,
) {
  if (!supabase) return { ok: false as const, error: new Error('Supabase client is not configured') }
  try {
    const { data, error } = await supabase.rpc('convert_deal_submission_to_inventory', {
      p_submission_id: submissionId,
      p_inventory_deal: inventoryDeal,
      p_converted_by: convertedBy,
    })
    if (error) return { ok: false as const, error }
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.id) return { ok: false as const, error: new Error('Conversion did not return an inventory deal') }
    return { ok: true as const, error: null, data: rowToDeal(row) }
  } catch (error) {
    return { ok: false as const, error }
  }
}
