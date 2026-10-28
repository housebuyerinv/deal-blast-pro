// Optional official-stack bootstrap. Never accepts a connection URL or remote host.
// Requires an already-running, empty local Supabase stack; does not start/install it.
import {Client} from 'pg';import process from 'node:process';import {pathToFileURL} from 'node:url';
import {localSyntheticOrigin} from '../server/buyermatch/local-synthetic.js';
import {stagingSources,stripTransaction} from './buyermatch-staging-sources.mjs';
export async function setupLocalAcceptance(env,makeClient=options=>new Client(options)){
 if(!localSyntheticOrigin(env)||!env.BM_LOCAL_DATABASE_PASSWORD)throw Error('PRIVATE_LOCAL_DATABASE_CONFIGURATION_REQUIRED');
 const db=makeClient({host:'127.0.0.1',port:55322,database:'postgres',user:'postgres',password:env.BM_LOCAL_DATABASE_PASSWORD,ssl:false,connectionTimeoutMillis:5000});
 let transaction=false;
 try{
  await db.connect();
  await db.query('begin');transaction=true;
  await db.query("set local lock_timeout='5s';set local statement_timeout='30s'");
  const state=await db.query(`select (select count(*)::int from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p')) public_tables,
   (select count(*)::int from pg_roles where rolname in ('anon','authenticated','service_role')) service_roles`);
  if(state.rows[0]?.public_tables!==0||state.rows[0]?.service_roles!==3)throw Error('FRESH_LOCAL_STACK_REQUIRED');
  await db.query(`create table public.dbp_staging_installation(project_ref text primary key);
   create table public.dbp_staging_migrations(path text primary key,hash text not null,applied_at timestamptz default now());
   revoke all on public.dbp_staging_installation,public.dbp_staging_migrations from public,anon,authenticated;
   grant select on public.dbp_staging_installation,public.dbp_staging_migrations to service_role`);
  await db.query('insert into public.dbp_staging_installation values($1)',[env.BM_STAGING_PROJECT_REF]);
  const sources=stagingSources();for(const source of sources){
   await db.query(stripTransaction(source.sql));
   await db.query('insert into public.dbp_staging_migrations(path,hash) values($1,$2)',[source.path,source.hash]);
  }
  await db.query('commit');transaction=false;
  return {mode:'LOCAL_SYNTHETIC',schemaSources:sources.length,hosted:false};
 }catch{
  if(transaction)await db.query('rollback').catch(()=>{});
  throw Error('LOCAL_ACCEPTANCE_SETUP_FAILED_NO_AUTOMATIC_RETRY');
 }finally{await db.end().catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3||process.argv[2]!=='--execute-local-empty'){console.error('Explicit --execute-local-empty required. No operation performed.');process.exitCode=1;}
 else try{console.log(JSON.stringify(await setupLocalAcceptance(process.env)));}catch{console.error('LOCAL_ACCEPTANCE_SETUP_STOP; verify local engine, private local configuration and fresh schema. No automatic retry.');process.exitCode=1;}
}
