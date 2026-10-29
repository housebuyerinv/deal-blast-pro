import { createHmac, timingSafeEqual } from 'node:crypto'

export type RegistrationIntent = {
  version: 1; email: string; name: string; company: string; role: string;
  plan: string; product?: 'crm' | 'buyermatch'; tier?: 'starter' | 'pro'; documents: { id: string; hash: string }[]; expires: number
}
const plans = new Set(['Free', 'Starter', 'Pro'])
const roles = new Set(['Admin', 'Team Member / VA', 'Buyer', 'Seller / Submitter'])
function validate(value: RegistrationIntent, now: number) {
  if ((value.product !== undefined && !['crm', 'buyermatch'].includes(value.product)) ||
      (value.product === 'buyermatch' ? (!['starter', 'pro'].includes(value.tier || '') || value.plan !== 'Free' || value.role !== 'Admin') : value.tier !== undefined) ||
      value.version !== 1 || !plans.has(value.plan) || !roles.has(value.role) ||
      typeof value.email !== 'string' || !value.email.includes('@') || value.email.length > 254 ||
      typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 ||
      typeof value.company !== 'string' || value.company.length > 200 ||
      !Number.isSafeInteger(value.expires) || value.expires <= now || value.expires > now + 7 * 86400000 ||
      !Array.isArray(value.documents) || value.documents.length > 2 ||
      value.documents.some(d => !/^[a-f0-9-]{36}$/i.test(d.id) || !/^[a-f0-9]{64}$/i.test(d.hash))) throw new Error('Invalid registration intent')
  return value
}
const sign = (payload: string, key: string) => {
  if (!key) throw new Error('Registration signing unavailable')
  return createHmac('sha256', key).update(`dbp-registration-v1:${payload}`).digest()
}
export function signRegistrationIntent(value: RegistrationIntent, key: string, now = Date.now()) {
  validate(value, now)
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${payload}.${sign(payload, key).toString('base64url')}`
}
export function verifyRegistrationIntent(token: unknown, email: string, key: string, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 6000) throw new Error('Registration intent required')
  const parts = token.split('.')
  if (parts.length !== 2) throw new Error('Invalid registration intent')
  const signature = Buffer.from(parts[1], 'base64url'), expected = sign(parts[0], key)
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error('Invalid registration intent')
  const value = validate(JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')), now)
  if (value.email !== email.toLowerCase()) throw new Error('Registration identity mismatch')
  return value
}

// Destinations are derived from verified intent; never accept arbitrary return URLs.
export function registrationDestination(intent?: RegistrationIntent) {
  return intent?.product === 'buyermatch'
    ? `/app/buyermatch/plans?tier=${intent.tier}` : '/app/dashboard'
}
