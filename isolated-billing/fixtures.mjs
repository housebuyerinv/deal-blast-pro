// @ts-check
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { randomBytes, createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { schemaPacket } from './schema.mjs';
import { validateProfile,digest,demand } from './profile.mjs';
export function fixtureSql(input) {
  const p=validateProfile(input),email=`billing-${p.runId}@example.invalid`;
  const terms=['platform_terms','privacy'].map(kind=>{
    const content=`SYNTHETIC ISOLATED BILLING QA ONLY ${kind}; not production legal approval.`;
    const hash=createHash('sha256').update(content).digest('hex');
    return `select bm_publish_document('${kind}','isolated-${p.runId}','${content}','${hash}',true);
      select bm_accept_document('${p.owner}',null,id,document_hash,'SYNTHETIC QA FIXTURE')
        from bm_documents where kind='${kind}' and version='isolated-${p.runId}';`;
  }).join('\n');
  return `begin;
    do $$ begin if not exists(select 1 from bm_isolated_run where run='${p.runId}' and profile_digest='${digest(p)}')
      or not exists(select 1 from auth.users where id='${p.owner}' and email_confirmed_at is not null)
      or exists(select 1 from account_profiles) or exists(select 1 from bm_buyers)
      then raise exception 'FRESH_SYNTHETIC_AUTH_AND_DATABASE_REQUIRED';end if;end $$;
    insert into account_profiles(user_id,email,full_name,role,account_status)
      values('${p.owner}','${email}','SYNTHETIC ISOLATED BILLING OWNER','Admin','Active');
    insert into workspaces(id,owner_user_id,owner_email,name) values('${p.runId}','${p.owner}','${email}','SYNTHETIC ISOLATED ONLY');
    insert into workspace_plan_assignments(workspace_id,user_id,plan_name,billing_status,payment_status,current_plan,effective_access_plan)
      values('${p.runId}','${p.owner}','Free','Free Active','No payment required','Free','Free');
    update bm_plans set stripe_price_id='${p.pro}',approved=true where version='buyermatch-pro-v1';
    ${terms}
    commit;`;
}
export async function createLocalFixture(input) {
  const p=validateProfile(input);demand(p.mode==='LOCAL_SYNTHETIC','LOCAL_FIXTURE_ONLY');
  const db=new PGlite({extensions:{pgcrypto}}),key=randomBytes(32);
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
    create function auth.role() returns text language sql as $$select current_user::text$$;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);`);
  await db.exec(schemaPacket(p).sql);
  await db.query('insert into auth.users values($1,$2,now(),null)',[p.owner,`billing-${p.runId}@example.invalid`]);
  await db.exec(fixtureSql(p));
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  function token(owner=p.owner){const data=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:owner,ref:p.database,exp:Math.floor(Date.now()/1000)+600});
    return data+'.'+createHmac('sha256',key).update(data).digest('base64url');}
  async function authenticate(value){
    const parts=String(value||'').split('.');demand(parts.length===3,'FIXTURE_JWT');
    const expected=createHmac('sha256',key).update(parts.slice(0,2).join('.')).digest();const actual=Buffer.from(parts[2],'base64url');
    demand(actual.length===expected.length && timingSafeEqual(actual,expected),'FIXTURE_SIGNATURE');
    const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
    demand(claims.ref===p.database && claims.exp>Date.now()/1000,'FIXTURE_ISSUER_OR_EXPIRY');
    const r=await db.query('select * from auth.users where id=$1',[claims.sub]);demand(r.rows.length===1,'FIXTURE_USER');return r.rows[0];
  }
  return {db,token,authenticate,metadata:{syntheticOnly:true,buyers:0,provenance:0,hostedAuthVerified:false},
    async close(){key.fill(0);await db.close();}};
}
