// @ts-check
import { demand, digest, validateProfile, ownership } from './profile.mjs';
import { URL,URLSearchParams } from 'node:url';
const {AbortSignal}=globalThis;
// Native provider wire protocol. No provider defaults, connector/browser credentials or mutation on import.
/** @param {unknown} input @param {()=>Promise<any>} custody @param {{fetch?:typeof globalThis.fetch,authorizeMutation?:(request:any)=>Promise<boolean>}} [options] */
export function nativePorts(input, custody, { fetch: injected, authorizeMutation } = {}) {
  const p=validateProfile(input);
  demand(!injected || p.mode === 'LOCAL_SYNTHETIC','HOSTED_TRANSPORT_INJECTION');
  const fetcher=injected || globalThis.fetch;
  const database=`https://${p.database}.supabase.co`;
  async function credentials() {
    const c=await custody();
    demand(c?.profileDigest===digest(p) && c.account===p.account && c.database===p.database &&
      /^(sk|rk)_test_/.test(c.stripeKey || '') && c.serviceKey && c.signingSecret,'CREDENTIAL_SCOPE');
    if(p.mode==='LOCAL_SYNTHETIC')demand(c.stripeKey==='rk_test_synthetic_only' &&
      c.serviceKey==='synthetic-service' && c.signingSecret==='synthetic-signing','SYNTHETIC_CREDENTIALS_ONLY');
    return c;
  }
  async function wire(url, init={}) {
    try {
      const r=await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
      const text=await r.text();demand(text.length<1048576,'RESPONSE_SIZE');
      let body=null;try{body=text?JSON.parse(text):null;}catch{demand(false,'PROVIDER_JSON');}
      return {status:r.status,body};
    } catch { throw Error('ISOLATED_PROVIDER_UNKNOWN_NO_RETRY'); }
  }
  async function stripe(method,path,body) {
    const c=await credentials();
    demand(/^\/v1\/(account|prices|webhook_endpoints|subscriptions|customers|checkout\/sessions|invoices)(?:[/?]|$)/.test(path) &&
      !path.includes('..') && !path.includes('://'),'STRIPE_PATH');
    if(method!=='GET'){
      demand(typeof authorizeMutation==='function' && await authorizeMutation({provider:'stripe',method,path,body}), 'MUTATION_APPROVAL');
      demand((method==='POST' && ((path==='/v1/webhook_endpoints/'+p.endpoint && Object.keys(body||{}).join()==='disabled') ||
        /^\/v1\/checkout\/sessions\/cs_test_[A-Za-z0-9]+\/expire$/.test(path))) ||
        (method==='DELETE' && /^\/v1\/subscriptions\/sub_[A-Za-z0-9]+$/.test(path)), 'MUTATION_CAPABILITY');
      if(method==='DELETE')demand(body?.invoice_now===false && body?.prorate===false && Object.keys(body).length===2,'CANCELLATION_OPTIONS');
    }
    const r=await wire('https://api.stripe.com'+path,{method,headers:{Authorization:'Bearer '+c.stripeKey,
      ...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
      ...(body?{body:new URLSearchParams(Object.entries(body).map(([k,v])=>[k,String(v)]))}:{})});
    demand(r.status>=200 && r.status<300,'STRIPE_RESPONSE');return r.body;
  }
  async function db(name,args={}) {
    demand(['bm_isolated_snapshot','bm_isolated_permit','bm_isolated_event','bm_isolated_pause',
      'bm_isolated_arm','bm_isolated_checkout'].includes(name),'DB_RPC');
    if(['bm_isolated_arm','bm_isolated_pause'].includes(name))demand(typeof authorizeMutation==='function' &&
      await authorizeMutation({provider:'database',method:'POST',path:name}),'MUTATION_APPROVAL');
    const c=await credentials();const r=await wire(`${database}/rest/v1/rpc/${name}`,{method:'POST',
      headers:{apikey:c.serviceKey,Authorization:'Bearer '+c.serviceKey,'Content-Type':'application/json'},
      body:JSON.stringify({p_run:p.runId,p_digest:digest(p),...args})});
    demand(r.status===200,'DATABASE_RESPONSE');return r.body;
  }
  async function authority() {
    const a=await stripe('GET','/v1/account');
    demand(a.id===p.account && Number.isSafeInteger(a.created) && a.created*1000>=p.provisioningStartedAt,'STRIPE_ACCOUNT');
    const endpoint=await stripe('GET','/v1/webhook_endpoints/'+p.endpoint);
    demand(endpoint.id===p.endpoint && endpoint.livemode===false &&
      endpoint.url===database+'/functions/v1/isolated-billing-webhook','WEBHOOK_DESTINATION');
    const s=await db('bm_isolated_snapshot');
    demand(s?.profileDigest===digest(p) && s.owner===p.owner && s.database===p.database &&
      s.buyers===0 && s.provenance===0 && s.account===p.account,'DB_BINDING');
    return {...p,livemode:false,ownerAuthorized:true,snapshot:s};
  }
  async function authenticate(req) {
    const c=await credentials();const token=String(req.headers?.authorization||'').match(/^Bearer ([^\s]+)$/)?.[1];
    demand(token,'AUTH_REQUIRED');
    const r=await wire(database+'/auth/v1/user',{headers:{apikey:c.serviceKey,Authorization:'Bearer '+token}});
    demand(r.status===200 && r.body?.id===p.owner && r.body.email_confirmed_at,'AUTH_OWNER');return r.body;
  }
  async function checkout() {
    const record=await db('bm_isolated_checkout');
    const list=await stripe('GET','/v1/checkout/sessions?limit=100');
    demand(list.has_more===false && Array.isArray(list.data) && list.data.length<=1,'CHECKOUT_INVENTORY');
    if(!list.data.length){demand(!record.session,'UNKNOWN_CHECKOUT');return null;}
    const s=await stripe('GET','/v1/checkout/sessions/'+list.data[0].id);
    demand(s.metadata?.dbpS2RunId===p.runId && s.client_reference_id===p.owner &&
      s.metadata?.dealBlastUserId===p.owner && s.metadata?.dbpProduct==='buyermatch' &&
      s.metadata?.dbpCheckoutId===record.checkoutId && s.livemode===false && s.mode==='subscription' &&
      (!record.session || record.session===s.id) && s.created*1000>=p.startedAt && s.created*1000<=p.expiresAt,'CHECKOUT_RECONCILIATION');
    return {session:s,checkoutId:record.checkoutId};
  }
  async function reconcile() {
    const found=await checkout();demand(found?.session.status==='complete','COMPLETE_CHECKOUT');
    const subscription=await stripe('GET','/v1/subscriptions/'+found.session.subscription);
    const customer=await stripe('GET','/v1/customers/'+found.session.customer);
    ownership(p,found.session,subscription,customer,found.checkoutId);
    return {...found,subscription,customer};
  }
  async function hosting(method,path) {
    demand(p.hosting==='vercel','HOSTING_ADAPTER_UNAVAILABLE');
    const c=await credentials();demand(c.hostingToken,'NEW_HOSTING_CREDENTIAL_REQUIRED');
    if(method!=='GET')demand(method==='DELETE' && typeof authorizeMutation==='function' &&
      await authorizeMutation({provider:'hosting',method,path}), 'HOSTING_MUTATION_APPROVAL');
    const u=new URL(path,'https://api.vercel.com');u.searchParams.set('teamId',p.team);
    const r=await wire(u.href,{method,headers:{Authorization:'Bearer '+c.hostingToken}});
    return r;
  }
  async function hostedInventory() {
    const project=await hosting('GET','/v9/projects/'+p.project);
    demand(project.status===200 && project.body.id===p.project && project.body.accountId===p.team &&
      project.body.createdAt>=p.provisioningStartedAt && !project.body.link &&
      project.body.ssoProtection?.deploymentType==='all' &&
      !Object.keys(project.body.protectionBypass||{}).length,'HOSTING_BINDING');
    const ds=await hosting('GET','/v6/deployments?projectId='+p.project+'&limit=100');
    const as=await hosting('GET','/v4/aliases?projectId='+p.project+'&limit=100');
    demand(ds.status===200 && as.status===200 && !ds.body.pagination?.next && !as.body.pagination?.next &&
      Array.isArray(ds.body.deployments) && ds.body.deployments.length<=2,'HOSTING_INVENTORY');
    const deployments=[];
    for(const item of ds.body.deployments){
      const r=await hosting('GET','/v13/deployments/'+(item.uid??item.id));const d=r.body;
      demand(r.status===200 && d.projectId===p.project && d.ownerId===p.team && d.target===null &&
        d.meta?.isolatedRunId===p.runId && d.meta?.githubCommitSha===p.source &&
        d.createdAt>=p.provisioningStartedAt && d.readyState==='READY','PREVIEW_PROVENANCE');deployments.push(d);
    }
    demand(Array.isArray(as.body.aliases) && as.body.aliases.length<=1 && as.body.aliases.every(a=>
      a.projectId===p.project && a.alias===new URL(p.origin).hostname &&
      deployments.some(d=>d.id===(a.deploymentId??a.deployment?.id))),'ISOLATED_ALIAS');
    return {deployments,aliases:as.body.aliases};
  }
  return { stripe, db, authority, authenticate, checkout, reconcile, hostedInventory,
    async arm(){await db('bm_isolated_arm');await stripe('POST','/v1/webhook_endpoints/'+p.endpoint,{disabled:false});
      const e=await stripe('GET','/v1/webhook_endpoints/'+p.endpoint);
      demand(e.status==='enabled' && (await db('bm_isolated_snapshot')).state==='armed','ARM_READBACK');},
    async preflight() {
      demand((await authority()).snapshot.state==='paused','PAUSED_BASELINE');const price=await stripe('GET','/v1/prices/'+p.pro);
      demand(price.id===p.pro && price.livemode===false && price.active && price.unit_amount===11900 &&
        price.currency==='usd' && price.recurring?.interval==='month' && price.recurring.interval_count===1 &&
        price.recurring.usage_type==='licensed','PRICE');
      const endpoint=await stripe('GET','/v1/webhook_endpoints/'+p.endpoint);
      demand(endpoint.id===p.endpoint && endpoint.livemode===false && endpoint.status==='disabled' &&
        endpoint.url===database+'/functions/v1/isolated-billing-webhook','ENDPOINT');
      const subs=await stripe('GET','/v1/subscriptions?limit=100&status=all');
      const customers=await stripe('GET','/v1/customers?limit=100');
      demand(subs.has_more===false && subs.data?.length===0 && customers.has_more===false &&
        customers.data?.length===0,'EMPTY_PROVIDER_BASELINE');
      await hostedInventory();return (await authority()).snapshot;
    },
    async protectedRead(path) {
      demand(['/api/isolated-attestation','/api/buyermatch?action=billing-status'].includes(path),'PROBE_PATH');
      const c=await credentials();demand(c.oidcToken && c.ownerAccessToken,'PRIVATE_OIDC_AND_AUTH_REQUIRED');
      const r=await wire(p.origin+path,{headers:{'x-vercel-trusted-oidc-idp-token':c.oidcToken,
        Authorization:'Bearer '+c.ownerAccessToken}});
      demand(r.status===200 && r.body.profileDigest===digest(p) && r.body.source===p.source,'PROTECTED_READBACK');return r.body;
    },
    async pause() {
      await authority();await db('bm_isolated_pause');
      await stripe('POST','/v1/webhook_endpoints/'+p.endpoint,{disabled:true});
      const e=await stripe('GET','/v1/webhook_endpoints/'+p.endpoint);
      demand(e.id===p.endpoint && e.status==='disabled' && (await db('bm_isolated_snapshot')).state==='closed','PAUSE_READBACK');
    },
    async expireOwned() {
      const found=await checkout();if(!found)return {checkouts:[]};
      if(found.session.status==='open'){
        await stripe('POST','/v1/checkout/sessions/'+found.session.id+'/expire');
        const after=await stripe('GET','/v1/checkout/sessions/'+found.session.id);
        demand(after.id===found.session.id && after.status==='expired','EXPIRATION_UNKNOWN');
      }else demand(['expired','complete'].includes(found.session.status),'SESSION_STATE');
      return {checkouts:[{id:found.session.id,checkoutId:found.checkoutId}]};
    },
    async removeOwnedHosting() {
      const {deployments,aliases}=await hostedInventory();
      for(const a of aliases){demand(a.uid || a.id,'ALIAS_ID');
        const r=await hosting('DELETE','/v2/aliases/'+encodeURIComponent(a.uid??a.id));
        demand(r.status>=200 && r.status<300,'ALIAS_DELETE_UNKNOWN');}
      for(const d of deployments){
        const fresh=await hosting('GET','/v13/deployments/'+d.id);demand(fresh.body?.id===d.id &&
          fresh.body.meta?.isolatedRunId===p.runId && fresh.body.projectId===p.project,'PREVIEW_DELETE_SCOPE');
        const r=await hosting('DELETE','/v13/deployments/'+d.id);demand(r.status>=200 && r.status<300,'PREVIEW_DELETE_UNKNOWN');
        demand((await hosting('GET','/v13/deployments/'+d.id)).status===404,'PREVIEW_READBACK');
      }
      const after=await hostedInventory();demand(after.deployments.length===0 && after.aliases.length===0,'HOSTING_CLEANUP');
    },
  };
}
