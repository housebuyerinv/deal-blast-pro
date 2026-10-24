import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
const sql=await readFile(new URL('../../scripts/buyermatch-s2-catalog.sql',import.meta.url),'utf8');
async function fixture(){
  const db=new PGlite();
  await db.exec(`create table bm_plans(version text primary key,product text,approved boolean,stripe_price_id text unique,allowance integer,distribution_allowance integer,max_distribution_fanout integer);
    insert into bm_plans values
    ('buyermatch-starter-v1','buyermatch',true,'price_1UNYGnLwKAFEsDh6JIB6CIk8',20,10,25),
    ('buyermatch-pro-v1','buyermatch',true,'price_1UNYGxLwKAFEsDh6WlRlDegP',50,25,50),
    ('staging-only-v2','buyermatch',false,null,50,50,50);
    create table bm_entitlements(id text,plan text); insert into bm_entitlements values('synthetic','historical');`);
  return db;
}
test('guarded remap changes only both price references and is safely retryable',async()=>{
  const db=await fixture();
  try {
    const before=(await db.query('select * from bm_plans order by version')).rows;
    await db.exec(sql);await db.exec(sql);
    const after=(await db.query('select * from bm_plans order by version')).rows;
    const protectedFields=row=>[row.version,row.product,row.approved,row.allowance,row.distribution_allowance,row.max_distribution_fanout];
    assert.deepEqual(after.map(protectedFields),before.map(protectedFields));
    assert.deepEqual(after.map(row=>row.stripe_price_id),['price_1UTRdrL6efr9LhPIpYKIYIyd','price_1UTRdfL6efr9LhPIchNeE7u1',null]);
    assert.deepEqual((await db.query('select * from bm_entitlements')).rows,[{id:'synthetic',plan:'historical'}]);
  }finally{await db.close();}
});
for(const [name,mutation] of [
  ['allowance drift',"update bm_plans set allowance=99 where version='buyermatch-pro-v1'"],
  ['foreign price',"update bm_plans set stripe_price_id='foreign' where version='buyermatch-pro-v1'"],
  ['partial prior mapping',"update bm_plans set stripe_price_id='price_1UTRdfL6efr9LhPIchNeE7u1' where version='buyermatch-starter-v1'"],
  ['unapproved plan',"update bm_plans set approved=false where version='buyermatch-pro-v1'"],
])test(`${name} aborts without a partial change`,async()=>{
  const db=await fixture();try{
    await db.exec(mutation);const before=(await db.query('select * from bm_plans order by version')).rows;
    await assert.rejects(db.exec(sql));await db.exec('rollback');
    assert.deepEqual((await db.query('select * from bm_plans order by version')).rows,before);
  }finally{await db.close();}
});
