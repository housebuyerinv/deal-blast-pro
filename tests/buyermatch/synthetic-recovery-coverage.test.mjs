import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
test('disposable synthetic logical restore preserves Auth links, private bytes, ciphertext and role denial',async()=>{
 const source=new PGlite(),target=new PGlite();
 const schema=`create role anon;create role service_role bypassrls;create schema auth;create table auth.users(id integer primary key);
 create table buyer_fixture(id integer primary key,user_id integer references auth.users,ciphertext text,provenance jsonb);
 create table private_object(id integer primary key,buyer_id integer references buyer_fixture,bytes bytea);
 alter table buyer_fixture enable row level security;alter table private_object enable row level security;
 revoke all on buyer_fixture,private_object from public,anon;grant select on buyer_fixture,private_object to service_role;`;
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
 try{
 await source.exec(schema);await target.exec(schema);
 await source.exec(`insert into auth.users values(1);insert into buyer_fixture values(1,1,'SYNTHETIC-OPAQUE-CIPHERTEXT','{"fixture":true}');insert into private_object values(1,1,decode('000102ff','hex'));`);
 const users=(await source.query('select * from auth.users')).rows;
 const buyers=(await source.query('select * from buyer_fixture')).rows;
 const objects=(await source.query('select * from private_object')).rows;
 for(const row of users)await target.query('insert into auth.users values($1)',[row.id]);
 for(const row of buyers)await target.query('insert into buyer_fixture values($1,$2,$3,$4)',[row.id,row.user_id,row.ciphertext,row.provenance]);
 for(const row of objects)await target.query('insert into private_object values($1,$2,$3)',[row.id,row.buyer_id,row.bytes]);
 assert.deepEqual((await target.query('select * from buyer_fixture')).rows,buyers);
 assert.equal(digest((await target.query('select bytes from private_object')).rows[0].bytes),digest(objects[0].bytes));
 await target.exec('set role anon');await assert.rejects(target.query('select * from private_object'),e=>e.code==='42501');await target.exec('reset role;set role service_role');
 assert.equal((await target.query('select * from buyer_fixture')).rows.length,1);
 // No archive encryption, native namespace, actual Auth/Storage API, original key
 // compatibility or independent hardware proof is claimed by this logical fixture.
 }finally{await source.close();await target.close();}
});
