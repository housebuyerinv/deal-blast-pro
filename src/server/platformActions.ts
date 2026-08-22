import { readCreditPacks, publicCreditPacks } from './creditPacks.js'
import { aggregateHotZones } from './hotZones.js'
import { PRO_TRIAL_PROMOTION } from '../lib/promotionConfig.js'
import { canCreateProTrialCheckout } from './proTrialCheckoutAuthorization.js'
import { couponAppliesOnlyToProduct, stripeCouponRetrievalPath } from './stripePromotionVerification.js'
const clean=(value:any)=>String(value||'').trim()
const WINDOWS:Record<string,number>={weekly:7,monthly:30,yearly:365}
const PLAN_RANK:Record<string,number>={free:0,'free demo':0,starter:1,pro:2,agency:3,enterprise:4,'owner admin':5}
const planRank=(value:any)=>PLAN_RANK[clean(value).toLowerCase()]??0
const escapeHtml=(value:any)=>clean(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":'&#39;'}[char]||char))

export async function handlePlatformAction(action:string,req:any,res:any,account:any){
  const send=(status:number,payload:any)=>{res.status(status).json(payload);return true}
  const workspaceId=clean(account.workspace?.id||account.plan?.workspace_id)
  if(action==='recent-searches'){
    if(req.method!=='GET')return send(405,{ok:false,error:'Method not allowed'})
    if(!workspaceId)return send(409,{ok:false,error:'Workspace unavailable.'})
    const {data,error}=await account.adminClient.from('property_intelligence_searches')
      .select('id,normalized_address,display_address,last_lookup_operation_id,last_audit_id,result_reference,result_metadata,is_saved,saved_at,last_searched_at')
      .eq('workspace_id',workspaceId).eq('user_id',account.user.id).order('last_searched_at',{ascending:false}).limit(30)
    if(error)throw error
    return send(200,{ok:true,searches:data||[]})
  }
  if(action==='saved-searches'){
    if(req.method!=='POST')return send(405,{ok:false,error:'Method not allowed'})
    if(!workspaceId)return send(409,{ok:false,error:'Workspace unavailable.'})
    const normalizedAddress=clean(req.body?.normalizedAddress).toLowerCase(),displayAddress=clean(req.body?.displayAddress)
    const saved=req.body?.saved===true
    if(!normalizedAddress||!displayAddress)return send(400,{ok:false,error:'A complete saved-search address is required.'})
    const {data,error}=await account.adminClient.from('property_intelligence_searches').upsert({
      workspace_id:workspaceId,user_id:account.user.id,normalized_address:normalizedAddress,display_address:displayAddress,
      is_saved:saved,saved_at:saved?new Date().toISOString():null,updated_at:new Date().toISOString(),
    },{onConflict:'workspace_id,user_id,normalized_address'}).select('id,normalized_address,display_address,is_saved,saved_at,last_searched_at,result_metadata,last_audit_id').single()
    if(error)throw error
    return send(200,{ok:true,search:data})
  }
  if(action==='credit-packs'){
    if(req.method==='GET')return send(200,{ok:true,packs:publicCreditPacks()})
    if(req.method!=='POST')return send(405,{ok:false,error:'Method not allowed'})
    if(account.isOwnerAdmin)return send(409,{ok:false,code:'owner_admin_bypass',error:'Owner Admin does not need customer credits.'})
    const pack=readCreditPacks().find(item=>item.key===clean(req.body?.packKey));if(!workspaceId||!pack)return send(400,{ok:false,code:'invalid_pack',error:'Choose an available credit pack.'})
    if(!pack.stripePriceId)return send(503,{ok:false,code:'pack_not_configured',error:'This credit pack is not available for checkout yet.'})
    const secret=clean(process.env.STRIPE_SECRET_KEY);if(!secret)return send(503,{ok:false,code:'stripe_not_configured',error:'Credit checkout is not configured.'})
    const origin=clean(req.headers?.origin).replace(/\/+$/,'');const safeOrigin=/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)||/^https:\/\/deal-blast-pro\.vercel\.app$/i.test(origin)?origin:'https://deal-blast-pro.vercel.app'
    const params=new URLSearchParams({mode:'payment','line_items[0][price]':pack.stripePriceId,'line_items[0][quantity]':'1',success_url:`${safeOrigin}/app/settings?creditCheckout=submitted`,cancel_url:`${safeOrigin}/app/settings?creditCheckout=cancelled`,client_reference_id:account.user.id,
      'metadata[purchaseKind]':'property_intelligence_credit_pack','metadata[workspaceId]':workspaceId,'metadata[packKey]':pack.key,
      'payment_intent_data[metadata][purchaseKind]':'property_intelligence_credit_pack','payment_intent_data[metadata][workspaceId]':workspaceId,'payment_intent_data[metadata][packKey]':pack.key})
    const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/x-www-form-urlencoded'},body:params});const payload=await response.json().catch(()=>null)
    return !response.ok||!payload?.url?send(502,{ok:false,code:'stripe_checkout_failed',error:'Credit checkout could not be created.'}):send(200,{ok:true,url:payload.url})
  }
  if(action==='pro-trial-checkout'){
    if(req.method!=='POST')return send(405,{ok:false,error:'Method not allowed'})
    if(account.isOwnerAdmin)return send(403,{ok:false,code:'owner_admin_ineligible',error:'Owner Admin accounts do not use customer trials.'})
    const trialFlowVerified=PRO_TRIAL_PROMOTION.enabled&&clean(process.env.PRO_TRIAL_LAUNCH20_VERIFIED).toLowerCase()==='true'
    const trialCheckoutAuthorized=PRO_TRIAL_PROMOTION.enabled&&canCreateProTrialCheckout({
      publicGateEnabled:trialFlowVerified,
      qaBypassEnabled:clean(process.env.PRO_TRIAL_QA_CHECKOUT_ENABLED).toLowerCase()==='true',
      vercelEnvironment:clean(process.env.VERCEL_ENV),
      authenticatedEmail:clean(account.user.email),
      authenticatedWorkspaceId:workspaceId,
    })
    if(!trialCheckoutAuthorized)return send(409,{ok:false,code:'promotion_unverified',error:'The Pro trial is awaiting final Stripe lifecycle verification.'})
    if(!workspaceId)return send(409,{ok:false,error:'Workspace unavailable.'})
    const assignment=account.plan||{}
    const billingStatus=clean(assignment.billing_status).toLowerCase(),subscriptionStatus=clean(assignment.subscription_status).toLowerCase()
    const currentPlan=clean(assignment.current_plan||assignment.plan_name).toLowerCase()
    if(assignment.trial_consumed_at)return send(409,{ok:false,code:'trial_already_consumed',error:'This workspace has already used its Pro trial.'})
    if(billingStatus==='trial active'||subscriptionStatus==='trialing')return send(409,{ok:false,code:'trial_already_active',error:'A Pro trial is already active for this workspace.'})
    if(billingStatus==='paid active'||['active','past_due','unpaid','incomplete'].includes(subscriptionStatus)||['pro','agency','enterprise'].includes(currentPlan))return send(409,{ok:false,code:'subscription_exists',error:'This workspace already has a paid or pending subscription.'})
    const secret=clean(process.env.STRIPE_SECRET_KEY),priceId=clean(process.env.STRIPE_PRO_MONTHLY_PRICE_ID||process.env.STRIPE_PRICE_PRO_MONTHLY)
    if(!secret||!priceId)return send(503,{ok:false,code:'stripe_trial_not_configured',error:'Pro trial checkout is not configured.'})
    const stripe=async(path:string,init:RequestInit={})=>{const response=await fetch(`https://api.stripe.com/v1/${path}`,{...init,headers:{Authorization:`Bearer ${secret}`,...(init.headers||{})}});const payload=await response.json().catch(()=>null);if(!response.ok)throw Object.assign(new Error(payload?.error?.message||'Stripe request failed.'),{status:502,code:'stripe_request_failed'});return payload}
    const pendingSessionId=clean(assignment.trial_checkout_session_id)
    if(pendingSessionId){const pending=await stripe(`checkout/sessions/${encodeURIComponent(pendingSessionId)}`);if(pending?.status==='open'&&pending?.url)return send(200,{ok:true,url:pending.url,reused:true,promotion:{key:PRO_TRIAL_PROMOTION.key,code:PRO_TRIAL_PROMOTION.code,trialDays:PRO_TRIAL_PROMOTION.trialDays}});if(pending?.status==='complete')return send(409,{ok:false,code:'trial_checkout_sync_pending',error:'Your completed trial checkout is still being synchronized. Please refresh shortly.'})}
    let customerId=clean(assignment.stripe_customer_id)
    if(customerId){
      const subscriptions=await stripe(`subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`)
      if((subscriptions?.data||[]).some((item:any)=>['trialing','active','past_due','unpaid','incomplete'].includes(clean(item.status).toLowerCase())))return send(409,{ok:false,code:'stripe_subscription_exists',error:'Stripe already has an active or pending subscription for this workspace.'})
    }
    const price=await stripe(`prices/${encodeURIComponent(priceId)}`)
    const promotions=await stripe(`promotion_codes?code=${encodeURIComponent(PRO_TRIAL_PROMOTION.code)}&active=true&limit=10`)
    const dateInNewYork=(unixSeconds:any)=>{if(!Number.isFinite(Number(unixSeconds)))return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Number(unixSeconds)*1000));const value=(type:string)=>parts.find(part=>part.type===type)?.value||'';return `${value('year')}-${value('month')}-${value('day')}`}
    const matches:any[]=[]
    for(const candidate of promotions?.data||[]){
      const couponRef=candidate?.promotion?.coupon??candidate?.coupon
      const couponId=typeof couponRef==='string'?couponRef:clean(couponRef?.id)
      const coupon=couponId?await stripe(stripeCouponRetrievalPath(couponId)):couponRef
      const restrictions=candidate?.restrictions||{}
      const couponApplicableProductIds=Array.isArray(coupon?.applies_to?.products)?coupon.applies_to.products.map((value:any)=>clean(value)).filter(Boolean):[]
      const configuredPriceProductId=clean(price?.product)
      const diagnostics={
        codeMatch:clean(candidate?.code)===PRO_TRIAL_PROMOTION.code,
        active:candidate?.active!==false,
        promotionMaxRedemptions:candidate?.max_redemptions===PRO_TRIAL_PROMOTION.maximumRedemptions,
        firstTimeRestriction:restrictions?.first_time_transaction===PRO_TRIAL_PROMOTION.firstTimeTransactionOnly,
        minimumAmount:restrictions?.minimum_amount===PRO_TRIAL_PROMOTION.minimumAmount,
        percentOff:coupon?.percent_off===PRO_TRIAL_PROMOTION.percentOff,
        duration:coupon?.duration===PRO_TRIAL_PROMOTION.duration,
        couponValid:coupon?.valid!==false,
        couponMaxRedemptions:coupon?.max_redemptions==null,
        promotionExpiryDate:dateInNewYork(candidate?.expires_at)===PRO_TRIAL_PROMOTION.expiresOn,
        couponRedeemByDate:dateInNewYork(coupon?.redeem_by)===PRO_TRIAL_PROMOTION.expiresOn,
        configuredPriceProductId,
        couponApplicableProductIds,
        couponAppliesOnlyToProduct:couponAppliesOnlyToProduct(coupon,configuredPriceProductId),
      }
      if(diagnostics.codeMatch&&diagnostics.active&&diagnostics.promotionMaxRedemptions&&diagnostics.firstTimeRestriction&&diagnostics.minimumAmount&&diagnostics.percentOff&&diagnostics.duration&&diagnostics.couponValid&&diagnostics.couponMaxRedemptions&&diagnostics.promotionExpiryDate&&diagnostics.couponRedeemByDate&&diagnostics.couponAppliesOnlyToProduct)matches.push(candidate)
    }
    const promotion=matches.length===1?matches[0]:null
    if(!promotion?.id)return send(503,{ok:false,code:'launch20_not_verified',error:'LAUNCH20 is unavailable or does not match the verified Pro trial promotion rules in the current Stripe mode. Trial checkout has not been created.'})
    if(!customerId){
      const customerParams=new URLSearchParams({email:clean(account.user.email),'name':clean(account.profile?.full_name||account.user.user_metadata?.full_name||''),'metadata[workspaceId]':workspaceId,'metadata[userId]':account.user.id})
      const customer=await stripe('customers',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:customerParams})
      customerId=clean(customer.id)
    }
    const origin=clean(req.headers?.origin).replace(/\/+$/,'');const safeOrigin=/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)||/^https:\/\/deal-blast-pro\.vercel\.app$/i.test(origin)?origin:'https://deal-blast-pro.vercel.app'
    const params=new URLSearchParams({mode:'subscription',customer:customerId,'line_items[0][price]':priceId,'line_items[0][quantity]':'1',payment_method_collection:'always',success_url:`${safeOrigin}/app/upgrade?trialCheckout=success`,cancel_url:`${safeOrigin}/app/upgrade?trialCheckout=cancelled`,client_reference_id:account.user.id,
      'subscription_data[trial_period_days]':String(PRO_TRIAL_PROMOTION.trialDays),'subscription_data[trial_settings][end_behavior][missing_payment_method]':'cancel','discounts[0][promotion_code]':promotion.id,
      'metadata[purchaseKind]':'pro_trial','metadata[workspaceId]':workspaceId,'metadata[userId]':account.user.id,'metadata[promotionKey]':PRO_TRIAL_PROMOTION.key,'metadata[promotionCode]':PRO_TRIAL_PROMOTION.code,
      'metadata[dealBlastUserId]':account.user.id,'metadata[selectedPlan]':'Pro','metadata[billingFrequency]':'monthly',
      'subscription_data[metadata][purchaseKind]':'pro_trial','subscription_data[metadata][workspaceId]':workspaceId,'subscription_data[metadata][userId]':account.user.id,'subscription_data[metadata][dealBlastUserId]':account.user.id,'subscription_data[metadata][selectedPlan]':'Pro','subscription_data[metadata][billingFrequency]':'monthly','subscription_data[metadata][promotionKey]':PRO_TRIAL_PROMOTION.key,'subscription_data[metadata][promotionCode]':PRO_TRIAL_PROMOTION.code})
    const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`pro-trial-${workspaceId}-${PRO_TRIAL_PROMOTION.key}`},body:params});const payload=await response.json().catch(()=>null)
    if(!response.ok||!payload?.url)return send(502,{ok:false,code:'stripe_checkout_failed',error:payload?.error?.message||'Pro trial checkout could not be created.'})
    const now=new Date().toISOString()
    const {error:updateError}=await account.adminClient.from('workspace_plan_assignments').update({stripe_customer_id:customerId,trial_checkout_session_id:payload.id,trial_checkout_created_at:now,promotion_code:PRO_TRIAL_PROMOTION.code,stripe_promotion_code_id:promotion.id,updated_at:now}).eq('workspace_id',workspaceId).is('trial_consumed_at',null)
    if(updateError)throw updateError
    return send(201,{ok:true,url:payload.url,promotion:{key:PRO_TRIAL_PROMOTION.key,code:PRO_TRIAL_PROMOTION.code,trialDays:PRO_TRIAL_PROMOTION.trialDays}})
  }
  if(action==='pro-trial-promotion'){
    if(req.method==='POST'){
      if(req.body?.dismissPermanently!==true)return send(400,{ok:false,error:'A permanent promotion dismissal must be explicit.'})
      const {error}=await account.adminClient.from('account_profiles').update({dismissed_promotion_key:PRO_TRIAL_PROMOTION.key,dismissed_promotion_at:new Date().toISOString()}).eq('user_id',account.user.id)
      if(error)throw error
      return send(200,{ok:true,dismissedPromotionKey:PRO_TRIAL_PROMOTION.key})
    }
    if(req.method!=='GET')return send(405,{ok:false,error:'Method not allowed'})
    const assignment=account.plan||{},plan=clean(assignment.current_plan||assignment.plan_name).toLowerCase(),billing=clean(assignment.billing_status).toLowerCase(),subscription=clean(assignment.subscription_status).toLowerCase()
    const trialFlowVerified=PRO_TRIAL_PROMOTION.enabled&&clean(process.env.PRO_TRIAL_LAUNCH20_VERIFIED).toLowerCase()==='true'
    const eligible=trialFlowVerified&&PRO_TRIAL_PROMOTION.loginModalEnabled&&!account.isOwnerAdmin&&!assignment.trial_consumed_at&&!assignment.trial_checkout_session_id&&account.profile?.dismissed_promotion_key!==PRO_TRIAL_PROMOTION.key&&!['pro','agency','enterprise'].includes(plan)&&billing!=='trial active'&&!['trialing','active','past_due','unpaid','incomplete'].includes(subscription)
    return send(200,{ok:true,eligible,promotion:PRO_TRIAL_PROMOTION,dismissedPermanently:account.profile?.dismissed_promotion_key===PRO_TRIAL_PROMOTION.key})
  }
  if(action==='admin-customer-lifecycle'){
    if(!account.isOwnerAdmin)return send(403,{ok:false,error:'Owner Admin access is required.'})
    if(req.method!=='GET')return send(405,{ok:false,error:'Method not allowed'})
    const lifecycleQuery=async(operation:string,query:PromiseLike<any>,optional=false)=>{
      const result=await query
      if(result?.error){
        const diagnostic={
          operation,
          code:clean(result.error.code).slice(0,40),
          message:clean(result.error.message).slice(0,300),
          hint:clean(result.error.hint).slice(0,200),
        }
        if(optional){
          console.warn('[DBP optional lifecycle metric unavailable]',diagnostic)
          return {data:[],error:null}
        }
        console.error('[DBP lifecycle query failed]',diagnostic)
      }
      return result
    }
    const [workspacesResult,profilesResult,plansResult,buyersResult,dealsResult]=await Promise.all([
      lifecycleQuery('workspaces',account.adminClient.from('workspaces').select('*').order('created_at',{ascending:false}).limit(2000)),
      lifecycleQuery('account_profiles',account.adminClient.from('account_profiles').select('*').limit(2000)),
      lifecycleQuery('workspace_plan_assignments',account.adminClient.from('workspace_plan_assignments').select('*').limit(2000)),
      lifecycleQuery('buyers',account.adminClient.from('buyers').select('workspace_id').limit(10000),true),
      lifecycleQuery('inventory_deals',account.adminClient.from('inventory_deals').select('workspace_id').limit(10000),true),
    ])
    for(const result of [workspacesResult,profilesResult,plansResult,buyersResult,dealsResult])if(result.error)throw result.error
    const profiles=new Map((profilesResult.data||[]).map((item:any)=>[item.user_id,item])),plans=new Map((plansResult.data||[]).map((item:any)=>[item.workspace_id,item]));const buyerCounts=new Map<string,number>(),dealCounts=new Map<string,number>()
    for(const row of buyersResult.data||[])buyerCounts.set(row.workspace_id,(buyerCounts.get(row.workspace_id)||0)+1)
    for(const row of dealsResult.data||[])dealCounts.set(row.workspace_id,(dealCounts.get(row.workspace_id)||0)+1)
    const now=Date.now();const customers=(workspacesResult.data||[]).map((workspace:any)=>{const profile:any=profiles.get(workspace.owner_user_id)||{},plan:any=plans.get(workspace.id)||{};const daysRemaining=plan.trial_ends_at?Math.max(0,Math.ceil((Date.parse(plan.trial_ends_at)-now)/86400000)):null;return {workspaceId:workspace.id,workspace:workspace.name,email:profile.email||workspace.owner_email,name:profile.display_name||profile.full_name||'',signupDate:profile.created_at||workspace.created_at,verificationState:profile.email?'Verified':'Unverified',currentPlan:plan.current_plan||plan.plan_name||'Free',billingStatus:plan.billing_status||'Free Active',subscriptionStatus:plan.subscription_status||'',trialState:plan.trial_status||'',trialStart:plan.trial_started_at,trialEnd:plan.trial_ends_at,daysRemaining,trialConvertedDate:plan.trial_converted_at,firstPaidDate:plan.first_paid_at,stripeCustomerId:plan.stripe_customer_id,stripeSubscriptionId:plan.stripe_subscription_id,effectiveAccessPlan:plan.effective_access_plan||plan.plan_name||'Free',paidPiEntitlement:clean(plan.billing_status).toLowerCase()==='paid active'&&clean(plan.payment_status).toLowerCase()==='paid'&&clean(plan.subscription_status).toLowerCase()==='active',includedPiLimit:Number(plan.property_intelligence_included_credits)||0,buyerCount:buyerCounts.get(workspace.id)||0,dealCount:dealCounts.get(workspace.id)||0,promotionDismissal:profile.dismissed_promotion_key||'',productUpdatesOptIn:profile.product_updates_opt_in===true,accountStatus:profile.account_status||workspace.account_status||'Active'}})
    const count=(fn:(item:any)=>boolean)=>customers.filter(fn).length
    return send(200,{ok:true,kpis:{totalSignups:customers.length,free:count(c=>c.currentPlan==='Free'),starterPaid:count(c=>c.currentPlan==='Starter'&&c.billingStatus==='Paid Active'),proTrials:count(c=>c.billingStatus==='Trial Active'),proPaid:count(c=>c.currentPlan==='Pro'&&c.billingStatus==='Paid Active'),agency:count(c=>c.currentPlan==='Agency'),enterprise:count(c=>c.currentPlan==='Enterprise'),trialsEndingSoon:count(c=>c.billingStatus==='Trial Active'&&c.daysRemaining<=7),trialConversions:count(c=>Boolean(c.trialConvertedDate)),cancelled:count(c=>c.billingStatus==='Cancelled'),pastDue:count(c=>c.billingStatus==='Past Due')},customers})
  }
  if(action==='admin-announcement-campaign'){
    if(!account.isOwnerAdmin)return send(403,{ok:false,error:'Owner Admin access is required.'})
    const resolveRecipients=async(audience:any)=>{const {data,error}=await account.adminClient.from('account_profiles').select('user_id,email,product_updates_opt_in,account_status,created_at');if(error)throw error;const {data:plans, error:planError}=await account.adminClient.from('workspace_plan_assignments').select('user_id,current_plan,plan_name,billing_status,trial_ends_at');if(planError)throw planError;const byUser=new Map((plans||[]).map((item:any)=>[item.user_id,item]));const selected=new Set((audience?.plans||[]).map((item:any)=>clean(item).toLowerCase()));return (data||[]).filter((profile:any)=>profile.product_updates_opt_in===true&&clean(profile.account_status).toLowerCase()!=='deactivated'&&profile.email).filter((profile:any)=>{const plan:any=byUser.get(profile.user_id)||{},name=clean(plan.current_plan||plan.plan_name||'Free').toLowerCase(),paid=clean(plan.billing_status).toLowerCase()==='paid active';if(audience?.kind==='non_paying')return !paid;if(audience?.kind==='pro_trial')return clean(plan.billing_status).toLowerCase()==='trial active';if(audience?.kind==='pro_paid')return name==='pro'&&paid;if(audience?.kind==='free')return name==='free';if(audience?.kind==='starter')return name==='starter';if(audience?.kind==='agency')return name==='agency';if(audience?.kind==='recent_signups')return profile.created_at&&Date.parse(profile.created_at)>=Date.now()-30*86400000;if(audience?.kind==='trials_ending_soon')return clean(plan.billing_status).toLowerCase()==='trial active'&&plan.trial_ends_at&&Date.parse(plan.trial_ends_at)-Date.now()<=7*86400000;if(selected.size)return selected.has(name);return true}).map((profile:any)=>clean(profile.email).toLowerCase()).filter((email:string,index:number,list:string[])=>list.indexOf(email)===index)}
    if(req.method==='GET'){const audience={kind:clean(req.query?.audience)||'all'};const recipients=await resolveRecipients(audience);const {data:campaigns,error}=await account.adminClient.from('announcement_campaigns').select('id,subject,audience,status,recipient_count,created_at,confirmed_at,queued_at').order('created_at',{ascending:false}).limit(25);if(error)throw error;return send(200,{ok:true,previewRecipientCount:recipients.length,campaigns:campaigns||[]})}
    if(req.method!=='POST')return send(405,{ok:false,error:'Method not allowed'})
    const operation=clean(req.body?.operation),subject=clean(req.body?.subject).slice(0,180),message=clean(req.body?.message).slice(0,20000),audience=req.body?.audience||{kind:'all'}
    if(operation==='draft'){if(!subject||!message)return send(400,{ok:false,error:'Subject and message are required.'});const recipients=await resolveRecipients(audience);const {data,error}=await account.adminClient.from('announcement_campaigns').insert({promotion_key:PRO_TRIAL_PROMOTION.key,subject,html_body:`<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(message).replace(/\n/g,'<br>')}</div>`,text_body:message,audience,status:'draft',recipient_count:recipients.length,created_by_user_id:account.user.id}).select('id,status,recipient_count').single();if(error)throw error;return send(201,{ok:true,campaign:data})}
    const campaignId=clean(req.body?.campaignId);const {data:campaign,error:campaignError}=await account.adminClient.from('announcement_campaigns').select('*').eq('id',campaignId).maybeSingle();if(campaignError)throw campaignError;if(!campaign)return send(404,{ok:false,error:'Campaign not found.'})
    if(operation==='test'){const recipient=clean(account.user.email).toLowerCase();const {error}=await account.adminClient.from('email_outbox').upsert({workspace_id:workspaceId||'owner-admin',user_id:account.user.id,event_type:'announcement_test',recipient,subject:`[TEST] ${campaign.subject}`,html_body:campaign.html_body,text_body:campaign.text_body,essential:false,related_record_id:campaign.id,idempotency_key:`campaign-test:${campaign.id}:${recipient}`,campaign_id:campaign.id},{onConflict:'idempotency_key'});if(error)throw error;return send(200,{ok:true,testQueued:true})}
    if(operation==='queue'){if(req.body?.confirmed!==true)return send(400,{ok:false,error:'Final campaign delivery requires explicit confirmation.'});if(campaign.status!=='draft')return send(409,{ok:false,error:'Only draft campaigns can be queued.'});const recipients=await resolveRecipients(campaign.audience);const rows=recipients.map((recipient:string)=>({workspace_id:'campaign',event_type:'product_announcement',recipient,subject:campaign.subject,html_body:campaign.html_body,text_body:campaign.text_body,essential:false,related_record_id:campaign.id,idempotency_key:`campaign:${campaign.id}:${recipient}`,campaign_id:campaign.id}));if(rows.length){const {error}=await account.adminClient.from('email_outbox').upsert(rows,{onConflict:'campaign_id,recipient',ignoreDuplicates:true});if(error)throw error}const now=new Date().toISOString();const {error:updateError}=await account.adminClient.from('announcement_campaigns').update({status:'queued',recipient_count:recipients.length,confirmed_by_user_id:account.user.id,confirmed_at:now,queued_at:now,updated_at:now}).eq('id',campaign.id).eq('status','draft');if(updateError)throw updateError;return send(200,{ok:true,queued:recipients.length})}
    return send(400,{ok:false,error:'Choose draft, test, or queue.'})
  }
  if(action==='hot-zones'){
    if(req.method!=='GET')return send(405,{ok:false,error:'Method not allowed'});if(!workspaceId)return send(409,{ok:false,error:'Workspace unavailable.'})
    const accountRank=account.isOwnerAdmin?PLAN_RANK['owner admin']:planRank(account.planName);if(accountRank<PLAN_RANK.pro)return send(403,{ok:false,code:'pro_required',error:'Hot Zones requires Pro or higher.'})
    const period=WINDOWS[clean(req.query?.period)]?clean(req.query.period):'monthly';const scope=clean(req.query?.scope)==='shared'?'shared':'workspace';if(scope==='shared'&&accountRank<PLAN_RANK.agency)return send(403,{ok:false,code:'agency_required',error:'Shared and team Hot Zones require Agency or higher.'});const since=new Date(Date.now()-WINDOWS[period]*86400000).toISOString()
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
    if(!account.isOwnerAdmin)return send(403,{ok:false,error:'Owner Admin access is required.'})
    if(req.method==='GET'){
      const q=clean(req.query?.q).slice(0,120),target=clean(req.query?.workspaceId)
      const workspaceSelect='id,name,owner_email,owner_user_id,created_at'
      let workspaces:any[]=[]
      if(q){
        const escaped=q.replace(/[%_,()]/g,' ')
        const queries=/^[0-9a-f-]{36}$/i.test(q)
          ? [account.adminClient.from('workspaces').select(workspaceSelect).eq('id',q).limit(20),account.adminClient.from('workspaces').select(workspaceSelect).eq('owner_user_id',q).limit(20)]
          : [account.adminClient.from('workspaces').select(workspaceSelect).ilike('name',`%${escaped}%`).limit(20),account.adminClient.from('workspaces').select(workspaceSelect).ilike('owner_email',`%${escaped}%`).limit(20)]
        const results=await Promise.all(queries)
        const queryError=results.find(result=>result.error)?.error
        if(queryError)throw queryError
        workspaces=results.flatMap(result=>result.data||[])
          .filter((item:any,index:number,list:any[])=>list.findIndex(candidate=>candidate.id===item.id)===index)
          .sort((a:any,b:any)=>String(a.name||'').localeCompare(String(b.name||''))).slice(0,20)
      } else {
        const result=await account.adminClient.from('workspaces').select(workspaceSelect).order('name').limit(20)
        if(result.error)throw result.error
        workspaces=result.data||[]
      }
      if(!target)return send(200,{ok:true,workspaces:workspaces||[]})
      const selected=(workspaces||[]).find((item:any)=>item.id===target) || (await account.adminClient.from('workspaces').select(workspaceSelect).eq('id',target).maybeSingle()).data
      if(!selected)return send(404,{ok:false,error:'Workspace not found.'})
      const [balanceResult,ledgerResult,purchasesResult,operationsResult,planResult,auditResult]=await Promise.all([
        account.adminClient.rpc('property_intelligence_credit_balance',{p_workspace_id:target}),
        account.adminClient.from('property_intelligence_credit_ledger').select('id,entry_type,credit_bucket,amount,operation_id,stripe_event_id,purchase_id,idempotency_key,audit_reason,metadata,created_by_user_id,created_at,billing_period_start,billing_period_end,expires_at').eq('workspace_id',target).order('created_at',{ascending:false}).limit(50),
        account.adminClient.from('property_intelligence_addon_purchases').select('id,credits_purchased,amount_cents,status,pack_key,currency,created_at,fulfilled_at').eq('workspace_id',target).order('created_at',{ascending:false}).limit(20),
        account.adminClient.from('property_intelligence_lookup_operations').select('id,operation_id,status,credit_source,credit_charged,created_at,completed_at,failure_code').eq('workspace_id',target).order('created_at',{ascending:false}).limit(20),
        account.adminClient.from('workspace_plan_assignments').select('plan_name,billing_status,billing_interval,current_period_end,created_at').eq('workspace_id',target).maybeSingle(),
        account.adminClient.from('property_intelligence_operation_audit').select('id,lookup_id,user_id,display_address,normalized_address,action_type,cache_hit,provider_called,provider_name,provider_succeeded,credit_operation_id,credit_reservation_reference,credit_finalization_reference,credit_release_reference,credits_consumed,cache_reference,result_status,error_code,error_message,request_correlation_id,provider_request_count,created_at,completed_at').eq('workspace_id',target).order('created_at',{ascending:false}).limit(50),
      ])
      for(const result of [balanceResult,ledgerResult,purchasesResult,operationsResult,planResult,auditResult])if(result.error)throw result.error
      const operations=operationsResult.data||[],reserved=operations.filter((item:any)=>item.status==='reserved').length
      const ledger=ledgerResult.data||[],lastGrant=ledger.find((item:any)=>item.entry_type==='included_grant')||null
      return send(200,{ok:true,workspaces:workspaces||[],workspace:selected,balance:{...(balanceResult.data||{}),reservedCredits:reserved},plan:planResult.data||null,lastIncludedGrant:lastGrant,ledger,purchases:purchasesResult.data||[],operations,propertyIntelligenceAudit:auditResult.data||[]})
    }
    if(req.method!=='POST')return send(405,{ok:false,error:'Method not allowed'})
    const target=clean(req.body?.workspaceId),amount=Number(req.body?.amount),reason=clean(req.body?.reason),correctionId=clean(req.body?.correctionId),bucket=clean(req.body?.bucket),entryType=clean(req.body?.entryType)
    if(!target||!Number.isInteger(amount)||amount===0||!reason||!correctionId)return send(400,{ok:false,error:'Workspace, amount, reason, and correction ID are required.'})
    if(!['included','purchased'].includes(bucket)||!['promotion','admin_correction','refund'].includes(entryType))return send(400,{ok:false,error:'Choose a valid credit bucket and adjustment type.'})
    const {data,error}=await account.adminClient.rpc('admin_adjust_property_intelligence_credits',{p_workspace_id:target,p_amount:amount,p_credit_bucket:bucket,p_entry_type:entryType,p_idempotency_key:`admin:credit:${correctionId}`,p_reason:reason,p_created_by_user_id:account.user.id})
    if(error)throw error
    if(data?.code==='negative_balance_prevented')return send(409,{ok:false,code:data.code,error:'This adjustment would create a negative balance.',result:data})
    return send(data?.duplicate?200:201,{ok:true,result:data})
  }
  return false
}
