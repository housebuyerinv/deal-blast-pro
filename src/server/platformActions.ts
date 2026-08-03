import { readCreditPacks, publicCreditPacks } from './creditPacks.js'
import { aggregateHotZones } from './hotZones.js'
const clean=(value:any)=>String(value||'').trim()
const WINDOWS:Record<string,number>={weekly:7,monthly:30,yearly:365}

export async function handlePlatformAction(action:string,req:any,res:any,account:any){
  const send=(status:number,payload:any)=>{res.status(status).json(payload);return true}
  const workspaceId=clean(account.workspace?.id||account.plan?.workspace_id)
  if(action==='credit-packs'){
    if(req.method==='GET')return send(200,{ok:true,packs:publicCreditPacks()})
    if(req.method!=='POST')return send(405,{ok:false,error:'Method not allowed'})
    if(account.isOwnerAdmin)return send(409,{ok:false,code:'owner_admin_bypass',error:'Owner Admin does not need customer credits.'})
    const pack=readCreditPacks().find(item=>item.key===clean(req.body?.packKey));if(!workspaceId||!pack)return send(400,{ok:false,code:'invalid_pack',error:'Choose an available credit pack.'})
    if(!pack.stripePriceId)return send(503,{ok:false,code:'pack_not_configured',error:'This credit pack is not available for checkout yet.'})
    const secret=clean(process.env.STRIPE_SECRET_KEY);if(!secret)return send(503,{ok:false,code:'stripe_not_configured',error:'Credit checkout is not configured.'})
    const origin=clean(req.headers?.origin).replace(/\/+$/,'');const safeOrigin=/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)||/^https:\/\/deal-blast-pro\.vercel\.app$/i.test(origin)?origin:'https://deal-blast-pro.vercel.app'
    const params=new URLSearchParams({mode:'payment','line_items[0][price]':pack.stripePriceId,'line_items[0][quantity]':'1',success_url:`${safeOrigin}/app/settings?creditCheckout=submitted`,cancel_url:`${safeOrigin}/app/settings?creditCheckout=cancelled`,client_reference_id:account.user.id,
      'metadata[purchaseKind]':'property_intelligence_credit_pack','metadata[workspaceId]':workspaceId,'metadata[packKey]':pack.key,'metadata[credits]':String(pack.credits),
      'payment_intent_data[metadata][purchaseKind]':'property_intelligence_credit_pack','payment_intent_data[metadata][workspaceId]':workspaceId,'payment_intent_data[metadata][packKey]':pack.key,'payment_intent_data[metadata][credits]':String(pack.credits)})
    const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/x-www-form-urlencoded'},body:params});const payload=await response.json().catch(()=>null)
    return !response.ok||!payload?.url?send(502,{ok:false,code:'stripe_checkout_failed',error:'Credit checkout could not be created.'}):send(200,{ok:true,url:payload.url})
  }
  if(action==='hot-zones'){
    if(req.method!=='GET')return send(405,{ok:false,error:'Method not allowed'});if(!workspaceId)return send(409,{ok:false,error:'Workspace unavailable.'})
    const period=WINDOWS[clean(req.query?.period)]?clean(req.query.period):'monthly';const scope=clean(req.query?.scope)==='shared'?'shared':'workspace';const since=new Date(Date.now()-WINDOWS[period]*86400000).toISOString()
    let query=account.adminClient.from('verified_closings').select('workspace_id,city,state,postal_code,closed_at').eq('outcome','closed').eq('is_demo',false).eq('is_sample',false).eq('is_duplicate',false).gte('closed_at',since);if(scope==='workspace')query=query.eq('workspace_id',workspaceId)
    const {data,error}=await query;if(error)throw error;const workspaceMinimum=Math.max(1,Number(process.env.HOT_ZONES_WORKSPACE_MIN_CLOSINGS)||3);const sharedMinimum=Math.max(1,Number(process.env.HOT_ZONES_SHARED_MIN_CLOSINGS)||5);const sharedWorkspaces=Math.max(2,Number(process.env.HOT_ZONES_SHARED_MIN_WORKSPACES)||3)
    const zones=aggregateHotZones(data||[],scope,{workspaceMinimum,sharedMinimum,sharedWorkspaceMinimum:sharedWorkspaces});res.setHeader('Cache-Control','private, max-age=60');return send(200,{ok:true,scope,period,totalVerifiedClosings:(data||[]).length,zones,minimumRequired:scope==='workspace'?workspaceMinimum:sharedMinimum,message:!zones.length?'Hot Zones become more useful as verified closing records accumulate.':''})
  }
  if(action==='verified-closing'){
    if(req.method!=='POST')return send(405,{ok:false,error:'Method not allowed'});const body=req.body||{};if(body.confirmVerified!==true)return send(400,{ok:false,code:'explicit_confirmation_required',error:'Explicit closing verification is required.'})
    const dealId=clean(body.inventoryDealId),closedAt=clean(body.closedAt),postalCode=clean(body.postalCode),city=clean(body.city),state=clean(body.state).toUpperCase();if(!workspaceId||!dealId||!closedAt||!postalCode||!city||!/^[A-Z]{2}$/.test(state)||Number.isNaN(Date.parse(closedAt)))return send(400,{ok:false,code:'closing_fields_required',error:'Closing date and complete market fields are required.'})
    if(body.isDemo||body.isSample||body.isDuplicate||['canceled','failed'].includes(clean(body.outcome).toLowerCase()))return send(400,{ok:false,code:'ineligible_closing',error:'Ineligible closing record.'})
    const {data:deal}=await account.adminClient.from('inventory_deals').select('id').eq('id',dealId).eq('workspace_id',workspaceId).maybeSingle();if(!deal)return send(404,{ok:false,error:'Inventory deal was not found in this workspace.'})
    const {data,error}=await account.adminClient.from('verified_closings').insert({workspace_id:workspaceId,inventory_deal_id:dealId,closed_at:new Date(closedAt).toISOString(),verified_by_user_id:account.user.id,verification_method:clean(body.verificationMethod)||'owner_confirmation',city,state,postal_code:postalCode,county:clean(body.county)||null,outcome:'closed',evidence_metadata:{source:'mark_as_closed_workflow'}}).select('id,closed_at').single()
    if(error?.code==='23505')return send(200,{ok:true,duplicate:true,message:'This deal already has a verified closing.'});if(error)throw error;return send(201,{ok:true,closing:data})
  }
  if(action==='admin-credit-adjustment'){
    if(req.method!=='POST')return send(405,{ok:false,error:'Method not allowed'});if(!account.isOwnerAdmin)return send(403,{ok:false,error:'Owner Admin access is required.'})
    const target=clean(req.body?.workspaceId),amount=Number(req.body?.amount),reason=clean(req.body?.reason),correctionId=clean(req.body?.correctionId);if(!target||!Number.isInteger(amount)||amount===0||!reason||!correctionId)return send(400,{ok:false,error:'Workspace, amount, reason, and correction ID are required.'})
    if(amount<0){const {data,error}=await account.adminClient.rpc('adjust_property_intelligence_purchased_credits',{p_workspace_id:target,p_requested_debit:Math.abs(amount),p_entry_type:'admin_correction',p_idempotency_key:`admin:credit:${correctionId}`,p_reason:reason,p_stripe_event_id:null,p_created_by_user_id:account.user.id});if(error)throw error;return send(200,{ok:true,result:data})}
    const {data,error}=await account.adminClient.from('property_intelligence_credit_ledger').insert({workspace_id:target,entry_type:'admin_correction',credit_bucket:'purchased',amount,idempotency_key:`admin:credit:${correctionId}`,audit_reason:reason,created_by_user_id:account.user.id}).select('id').single();if(error?.code==='23505')return send(200,{ok:true,duplicate:true});if(error)throw error;return send(201,{ok:true,ledgerEntryId:data.id})
  }
  return false
}
