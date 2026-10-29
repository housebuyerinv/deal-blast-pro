// @ts-check
import { runtime, demand, digest, ID } from './profile.mjs';
import { URL } from 'node:url';
export function createIsolatedApi(p, { buyermatch, accountStatus, authenticate, permitCheckout, authority, env }) {
  return async (req, res) => {
    res.setHeader('Cache-Control','no-store');
    try {
      runtime(p,env);
      const path = new URL(req.url, p.origin).pathname;
      const body = req.method === 'GET' ? req.query || {} : typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const read = new Set(['plans','access','onboarding','billing-status']);
      demand((path === '/api/account-status' && req.method === 'GET') ||
        (['/api/buyermatch','/api/platform/buyermatch'].includes(path) &&
          ((req.method === 'GET' && read.has(body.action)) || (req.method === 'POST' && body.action === 'checkout'))) ||
        (path === '/api/isolated-attestation' && req.method === 'GET'), 'ROUTE_DENIED');
      demand(!req.headers?.origin || req.headers.origin === p.origin, 'ORIGIN');
      const user = await authenticate(req);
      demand(user?.id === p.owner && user.email_confirmed_at, 'CONFIRMED_OWNER');
      await authority();
      if(path === '/api/isolated-attestation')return res.status(200).json({ profile:ID,source:p.source,
        baseSource:p.baseSource,profileDigest:digest(p),project:p.project,database:p.database,account:p.account });
      if(req.method === 'POST') {
        runtime(p,env,{issuance:true,owner:user.id});
        demand(body.operationKey === p.runId && body.planVersion === 'buyermatch-pro-v1', 'CHECKOUT_SCOPE');
        await permitCheckout(p.runId, user.id, body.operationKey);
      }
      // The delegated handlers and commercial calculations are approved-source code.
      const wrapped = { setHeader: (...args)=>res.setHeader(...args), status(code) {
        return { json: value => res.status(code).json(code >= 400 ? {ok:false,error:'Isolated billing request denied'} : value) };
      } };
      return await (path === '/api/account-status' ? accountStatus : buyermatch)(req, wrapped);
    } catch { return res.status(503).json({ok:false,error:'Isolated billing request denied'}); }
  };
}
