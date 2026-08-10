import { PROPERTY_INTELLIGENCE_CREDIT_PACKS } from '../lib/propertyIntelligencePolicy'

export type CreditPack = { key: string; credits: number; amountCents: number; stripePriceId: string }
const DEFAULTS = PROPERTY_INTELLIGENCE_CREDIT_PACKS
export function readCreditPacks(env: Record<string,string|undefined> = process.env): CreditPack[] {
  let configured:any[]=[]; try { configured=JSON.parse(String(env.PROPERTY_INTELLIGENCE_CREDIT_PACKS_JSON||'[]')) } catch { configured=[] }
  return DEFAULTS.map(fallback=>{const override=configured.find(item=>String(item?.key)===fallback.key)||{}; const envKey=`STRIPE_PRICE_${fallback.key.toUpperCase()}`; return {
    key:fallback.key,credits:Math.max(1,Number(override.credits)||fallback.credits),amountCents:Math.max(1,Number(override.amountCents)||fallback.amountCents),
    stripePriceId:String(override.stripePriceId||env[envKey]||'').trim()}})
}
export const publicCreditPacks=(env?:Record<string,string|undefined>)=>readCreditPacks(env).map(({stripePriceId,...pack})=>({...pack,checkoutReady:Boolean(stripePriceId)}))
