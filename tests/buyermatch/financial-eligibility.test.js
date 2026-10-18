import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {matchBuyer} from '../../server/buyermatch/matching.js';

const deal={state:'TX',city:'Austin',assetType:'sfh',price:180000,arv:300000,repairs:30000};
const buyer={id:randomUUID(),status:'active',markets:[{state:'TX',city:'Austin'}],assetTypes:['sfh'],maxArvRatio:0.7};
for(const field of ['arv','repairs']) for(const value of [undefined,null,'']) {
  test(`ARV formula rejects ${field}=${String(value)}`,()=>{
    const result=matchBuyer({...deal,[field]:value},buyer);
    assert.equal(result.eligible,false);assert.equal(result.score,0);
    assert.ok(result.unknown.includes('ARV formula'));
  });
}
test('complete formula passes at boundary and rejects above it',()=>{
  assert.equal(matchBuyer(deal,buyer).eligible,true);
  assert.equal(matchBuyer({...deal,price:180001},buyer).eligible,false);
});
test('explicit zero repairs is known, not substituted for missing repairs',()=>{
  assert.equal(matchBuyer({...deal,price:210000,repairs:0},buyer).eligible,true);
  assert.equal(matchBuyer({...deal,price:210000,repairs:undefined},buyer).eligible,false);
  assert.equal(matchBuyer({...deal,arv:0},buyer).eligible,false);
});
test('buyers without explicit financial rules retain missing-budget behavior',()=>{
  const unrestricted={...buyer,maxArvRatio:undefined};
  const result=matchBuyer({...deal,arv:undefined,repairs:undefined},unrestricted);
  assert.equal(result.eligible,true);assert.ok(result.unknown.includes('Price criteria'));
  assert.equal(matchBuyer({...deal,arv:undefined,repairs:undefined},{...unrestricted,maxPrice:200000}).eligible,true);
});
for(const [rule,field] of [['maxRepairs','repairs'],['minCapRate','capRate'],['minNoi','noi'],['minDebtServiceCoverage','debtServiceCoverage']]) {
  test(`explicit ${rule} rejects unknown ${field}`,()=>{
    assert.equal(matchBuyer({...deal,[field]:undefined},{...buyer,maxArvRatio:undefined,[rule]:1}).eligible,false);
  });
}
test('actual distribution recipient SELECT excludes persisted rejected financial matches',async()=>{
  const db=new PGlite();
  try {
    await db.exec('create table bm_buyers(id uuid primary key,status text,opted_out_at timestamptz,consent_evidence text)');
    const matches=[];
    for(const patch of [{arv:undefined},{repairs:undefined},{price:180001},{}]) {
      const id=randomUUID();
      await db.query("insert into bm_buyers values($1,'active',null,'Synthetic only')",[id]);
      matches.push(matchBuyer({...deal,...patch},{...buyer,id}));
    }
    const sql=readFileSync(new URL('../../supabase/migrations/20261006043844_buyermatch_commercial_limits.sql',import.meta.url),'utf8');
    const recipientSelect=sql.match(/for b in (select buyer\.\*[\s\S]*?limit fanout) loop/)[1]
      .replace('a.private_result', '$1::jsonb').replace('limit fanout','limit $2');
    const selected=await db.query(recipientSelect,[{matches},20]);
    assert.deepEqual(selected.rows.map(r=>r.id),[matches[3].buyerId]);
    const rejectedOnly=await db.query(recipientSelect,[{matches:matches.slice(0,3)},20]);
    assert.equal(rejectedOnly.rows.length,0);
  } finally {await db.close();}
});
