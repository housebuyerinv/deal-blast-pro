// Disposable in-memory acceptance database. No hosted client, network, dump import,
// environment file, original ciphertext, user password or credential is consumed.
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {createCipheriv,createDecipheriv,createHmac,createHash,randomBytes,randomUUID} from 'node:crypto';
import {stagingSources,stripTransaction} from '../buyermatch-staging-sources.mjs';
export const LOCAL_ACCEPTANCE=Object.freeze({project:'buyermatch-local-synthetic',api:'http://127.0.0.1:55321',app:'http://127.0.0.1:5189'});
export function assertLocalAcceptanceTarget({project,api}){
 if(project!==LOCAL_ACCEPTANCE.project)throw Error('ISOLATED_PROJECT_REQUIRED');
 let url;try{url=new URL(api);}catch{throw Error('LITERAL_LOOPBACK_REQUIRED');}
 if(api!==LOCAL_ACCEPTANCE.api || url.origin!==LOCAL_ACCEPTANCE.api || url.username || url.password || url.pathname!=='/' || url.search || url.hash)throw Error('LITERAL_LOOPBACK_REQUIRED');
 return true;
}
const id=label=>{const h=createHash('sha256').update('buyermatch-local-only-v1:'+label).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const active=new WeakSet();
function syntheticProof(){
 const text='BT /F1 18 Tf 40 740 Td (SYNTHETIC ONLY - NOT PROOF OF FUNDS) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${text.length} >>\nstream\n${text}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[];
 objects.forEach((body,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${body}\nendobj\n`;});
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(pdf);
}
export function assertIsolatedDatabase(db){if(!active.has(db))throw Error('IN_MEMORY_ACCEPTANCE_DATABASE_REQUIRED');}
export async function createIsolatedBuyerMatch(){
 const db=new PGlite({extensions:{pgcrypto}});active.add(db);
 const key=randomBytes(32); // Ephemeral SYNTHETIC fixture material, never returned/saved.
 const hash=email=>createHmac('sha256',key).update(email).digest('hex');
 const encrypt=value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return [iv,Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]),cipher.getAuthTag()].map(b=>b.toString('base64')).join('.');};
 const decrypt=value=>{const [iv,data,tag]=value.split('.').map(b=>Buffer.from(b,'base64'));const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(tag);return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString());};
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);`);
 const sources=stagingSources();
 for(const source of sources)await db.exec('begin;'+stripTransaction(source.sql)+';commit;');
 const actors={};
 for(const label of ['starter','pro','owner','buyer','other-buyer','outsider']){
  const actor={id:id('actor:'+label),email:`${label}@example.invalid`};actors[label]=actor;
  await db.query('insert into auth.users values($1,$2,now(),null)',[actor.id,actor.email]);
  await db.query(`insert into account_profiles(user_id,email,full_name,role,account_status) values($1,$2,$3,$4,'Active')`,[actor.id,actor.email,'SYNTHETIC '+label,label.includes('buyer')?'Buyer':'Admin']);
  if(!label.includes('buyer')){
   const workspace=id('workspace:'+label);
   await db.query('insert into workspaces(id,owner_user_id,owner_email,name) values($1,$2,$3,$4)',[workspace,actor.id,actor.email,'SYNTHETIC '+label]);
   await db.query(`insert into workspace_plan_assignments(workspace_id,user_id,plan_name,billing_status,payment_status,current_plan,effective_access_plan) values($1,$2,'Free','Free Active','No payment required','Free','Free')`,[workspace,actor.id]);
  }
 }
 const property={address:'100 SYNTHETIC ONLY STREET',city:'Austin',state:'TX',zip:'78701',assetType:'sfh',price:100000,arv:250000,repairs:20000,beds:3,baths:2,sqft:1200,serviceType:'software'};
 const deals={};for(const label of ['starter','pro','outsider']){
  deals[label]=id('deal:'+label);await db.query(`insert into bm_deals(id,owner_id,property,title,status) values($1,$2,$3,$4,'analyzed')`,[deals[label],actors[label].id,property,{eoc:'2099-01-01'}]);
 }
 for(const [label,allowance]of [['starter',20],['pro',50]])await db.query(`insert into bm_entitlements(owner_id,product,plan_version,status,period_start,period_end,allowance) values($1,'buyermatch',$2,'active',now()-interval '1 day',now()+interval '29 days',$3)`,[actors[label].id,`buyermatch-${label}-v1`,allowance]);
 const buyers=[];for(let n=0;n<52;n++){
  const identity={name:`SYNTHETIC BUYER ${n}`,email:`buyer-${n}@example.invalid`,company:'Synthetic fixture'},buyer=id('buyer:'+n);
  const criteria={markets:[{state:'TX',city:'Austin'}],assetTypes:['sfh'],maxPrice:150000,maxArvRatio:0.7};
  await db.query(`insert into bm_buyers(id,identity_hash,identity_ciphertext,source_ciphertext,criteria,status,synthetic,consent_evidence,criteria_verified_at) values($1,$2,$3,$4,$5,'active',true,'SYNTHETIC QA ONLY',now())`,[buyer,hash(identity.email),encrypt(identity),n<2?encrypt({synthetic:true,source:n}):null,criteria]);buyers.push({id:buyer,criteria});
 }
 for(const [n,label]of [[0,'buyer'],[1,'other-buyer']])await db.query('insert into bm_buyer_accounts(user_id,buyer_id) values($1,$2)',[actors[label].id,buyers[n].id]);
 const exposure=id('exposure:buyer');await db.query(`insert into bm_exposures(id,deal_id,buyer_id,owner_id,operation_key,frozen_terms) values($1,$2,$3,$4,$5,'{}')`,[exposure,deals.pro,buyers[0].id,actors.pro.id,randomUUID()]);
 await db.query(`insert into bm_outbox(exposure_id,state,accepted_at,delivered_at) values($1,'delivered',now(),now())`,[exposure]);
 const token=randomBytes(32).toString('base64url'),tokenHash=createHash('sha256').update(token).digest('hex');
 await db.query(`insert into bm_response_tokens(token_hash,exposure_id,environment,expires_at) values($1,$2,'staging',now()+interval '1 day')`,[tokenHash,exposure]);
 const proofBytes=syntheticProof();
 const proof={id:randomUUID(),path:'',sha256:createHash('sha256').update(proofBytes).digest('hex'),mime:'application/pdf',bytes:proofBytes.length,expiresOn:new Date(Date.now()+30*86400000).toISOString().slice(0,10)};proof.path=`${actors.buyer.id}/${proof.id}`;
 let closed=false;
 return {db,actors,deals,buyers,property,tokenHash,proof,proofBytes,
  decryptSynthetic:decrypt,syntheticHash:hash,
  metadata:{mode:'LOCAL_SYNTHETIC_PGLITE',migrations:sources.length,buyers:52,actors:6,hostedClientConfigured:false,originalDataImported:false,hostedVerified:false},
  async close(){if(!closed){closed=true;active.delete(db);key.fill(0);await db.close();}}
 };
 }catch(error){active.delete(db);key.fill(0);await db.close();throw error;}
}
