import { cleanString, getAuthenticatedAccount } from './_accountAuth.js'
import { publicCreditPacks, readCreditPacks } from './_creditPacks.js'

const send = (res: any, status: number, payload: any) => res.status(status).json(payload)

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') return send(res, 200, { ok: true, packs: publicCreditPacks() })
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed' })
  try {
    const account = await getAuthenticatedAccount(req)
    if (account.isOwnerAdmin) return send(res, 409, { ok: false, code: 'owner_admin_bypass', error: 'Owner Admin does not need customer credits.' })
    const workspaceId = cleanString(account.workspace?.id || account.plan?.workspace_id)
    const packKey = cleanString(req.body?.packKey)
    const pack = readCreditPacks().find(item => item.key === packKey)
    if (!workspaceId || !pack) return send(res, 400, { ok: false, code: 'invalid_pack', error: 'Choose an available credit pack.' })
    if (!pack.stripePriceId) return send(res, 503, { ok: false, code: 'pack_not_configured', error: 'This credit pack is not available for checkout yet.' })
    const secret = cleanString(process.env.STRIPE_SECRET_KEY)
    if (!secret) return send(res, 503, { ok: false, code: 'stripe_not_configured', error: 'Credit checkout is not configured.' })
    const origin = cleanString(req.headers?.origin).replace(/\/+$/, '')
    const safeOrigin = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin) || /^https:\/\/deal-blast-pro\.vercel\.app$/i.test(origin)
      ? origin : 'https://deal-blast-pro.vercel.app'
    const params = new URLSearchParams({
      mode: 'payment', 'line_items[0][price]': pack.stripePriceId, 'line_items[0][quantity]': '1',
      success_url: `${safeOrigin}/app/settings?creditCheckout=submitted`, cancel_url: `${safeOrigin}/app/settings?creditCheckout=cancelled`,
      client_reference_id: account.user.id,
      'metadata[purchaseKind]': 'property_intelligence_credit_pack', 'metadata[workspaceId]': workspaceId,
      'metadata[packKey]': pack.key, 'metadata[credits]': String(pack.credits),
      'payment_intent_data[metadata][purchaseKind]': 'property_intelligence_credit_pack',
      'payment_intent_data[metadata][workspaceId]': workspaceId,
      'payment_intent_data[metadata][packKey]': pack.key,
      'payment_intent_data[metadata][credits]': String(pack.credits),
    })
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.url) return send(res, 502, { ok: false, code: 'stripe_checkout_failed', error: 'Credit checkout could not be created.' })
    return send(res, 200, { ok: true, url: payload.url })
  } catch (error: any) {
    return send(res, Number(error?.status || 500), { ok: false, code: error?.code || 'checkout_failed', error: error?.message || 'Checkout failed.' })
  }
}
