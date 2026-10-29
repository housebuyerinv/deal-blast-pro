// @ts-check
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { runtime, demand, ownership } from './profile.mjs';
const { Request, Response,TextDecoder } = globalThis;
export function signature(raw, header, secret, now = Date.now()) {
  if(typeof raw !== 'string' || raw.length > 262144 || typeof header !== 'string' || !secret)return false;
  const parts=header.split(',');const timestamps=parts.filter(x=>x.startsWith('t='));
  if(timestamps.length!==1)return false;
  const t=timestamps[0].slice(2);if(!/^\d+$/.test(t)||Math.abs(now/1000-Number(t))>300)return false;
  const expected=createHmac('sha256',secret).update(`${t}.${raw}`).digest();
  return parts.filter(x=>/^v1=[a-f0-9]{64}$/.test(x)).some(x=>timingSafeEqual(expected,Buffer.from(x.slice(3),'hex')));
}
export function createIsolatedWebhook(p, { env, signingSecret, authority, reconcile, countDelivery, delegate }) {
  return async request => {
    try {
      runtime(p,env,{receiver:true});
      demand(request.method === 'POST' && env.BM_S2_STRIPE_WEBHOOK_ENABLED === 'true' &&
        Date.now() >= p.startedAt && Date.now() < p.expiresAt-30000, 'RECEIVER_CLOSED');
      const reader=request.body?.getReader();demand(reader,'BODY');let bytes=0;const chunks=[];
      while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;
        if(bytes>262144){await reader.cancel();demand(false,'BODY_LIMIT');}chunks.push(part.value);}
      const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
      if(!signature(raw,request.headers.get('stripe-signature'),signingSecret))
        return Response.json({ok:false,error:'Invalid signature'},{status:400});
      const event=JSON.parse(raw);
      demand(event.livemode === false && /^evt_[A-Za-z0-9]+$/.test(event.id || '') &&
        (!event.account || event.account===p.account) && (!event.context || event.context===p.account) &&
        ['checkout.session.completed','customer.subscription.created','invoice.paid'].includes(event.type), 'EVENT_TYPE');
      await authority();
      const {session,subscription,customer,checkoutId}=await reconcile(event);
      ownership(p,session,subscription,customer,checkoutId);
      const object=event.data?.object;
      if(event.type==='checkout.session.completed')demand(object?.id===session.id,'EVENT_OBJECT');
      else if(event.type==='customer.subscription.created')demand(object?.id===subscription.id,'EVENT_OBJECT');
      else demand((object?.subscription || object?.parent?.subscription_details?.subscription)===subscription.id &&
        object.customer===customer.id,'EVENT_OBJECT');
      demand(await countDelivery(event.id) <= 12,'EVENT_LIMIT');
      // Delegate verifies the raw signature again and uses the unchanged billing RPC path.
      return await delegate(new Request(request.url,{method:'POST',headers:request.headers,body:raw}));
    } catch { return Response.json({ok:false,error:'Isolated webhook denied'},{status:503}); }
  };
}
