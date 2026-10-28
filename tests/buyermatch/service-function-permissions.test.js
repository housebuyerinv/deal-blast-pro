import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile('supabase/migrations/20261028031838_buyermatch_service_function_permissions.sql','utf8');
const signatures=[
 ['insert_email_notification_log','text,uuid,text,text,text,text,text,text,integer,text,jsonb,text'],
 ['reserve_property_intelligence_credit','uuid,uuid,text,text,text'],
 ['finalize_property_intelligence_credit','uuid,jsonb,integer'],
 ['release_property_intelligence_credit','uuid,text'],
];
async function fixture(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;create table calls(n integer);insert into calls values(0);');
 for(const [name,types]of signatures)await db.exec(`create function ${name}(${types}) returns void language sql security definer set search_path=public as $$update calls set n=n+1$$;grant execute on function ${name}(${types}) to anon,authenticated,service_role;`);
 return db;}
test('actual browser roles lose privileged invocation while server behavior, owner and definitions stay intact',async()=>{
 const db=await fixture();try{
 const metadata=async()=> (await db.query("select proname,pg_get_functiondef(oid) body,proowner from pg_proc where pronamespace='public'::regnamespace order by proname")).rows;
 const before=await metadata();await db.exec(sql);assert.deepEqual(await metadata(),before);
 for(const [name,types]of signatures){const args=types.split(',').map(type=>`null::${type}`).join(',');
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query(`select ${name}(${args})`),e=>e.code==='42501');await db.exec('reset role');}
  await db.exec(`set role service_role;select ${name}(${args});reset role`);
 }
 assert.equal((await db.query('select n from calls')).rows[0].n,4);await db.exec(sql);assert.deepEqual(await metadata(),before);
 }finally{await db.close();}
});
test('missing signature and inherited unsafe authority roll back all preceding permission changes',async()=>{
 for(const failure of ['missing','inherited']){const db=await fixture();try{
 if(failure==='missing')await db.exec('drop function release_property_intelligence_credit(uuid,text)');
 else await db.exec('create role unsafe;grant execute on function finalize_property_intelligence_credit(uuid,jsonb,integer) to unsafe;grant unsafe to authenticated');
 await assert.rejects(db.exec(sql));await db.exec('rollback');
 assert.equal((await db.query("select has_function_privilege('anon','insert_email_notification_log(text,uuid,text,text,text,text,text,text,integer,text,jsonb,text)','execute') allowed")).rows[0].allowed,true);
 }finally{await db.close();}}
});
