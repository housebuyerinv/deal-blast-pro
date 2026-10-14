import test from 'node:test';
import assert from 'node:assert/strict';
import * as parsing from '../src/lib/buyerImport.js';
import { createBuyerImportFixture } from './helpers/buyerImportFixture.mjs';

test('sparse reviewed profile edit preserves import safeguards and permits its own phone', async () => {
  const { db, invoke } = await createBuyerImportFixture();
  try {
    const first = await invoke([parsing.parseBuyerRecord({ Email: 'edit@example.invalid', Phone: '5550109991', Company: 'Keep company', 'Do Not Email': 'yes' })]);
    const saved = first.body.data[0];
    assert.equal(saved.buyerType, '');
    const edited = await invoke([{ id: saved.id, email: 'edited@example.invalid', phone: saved.phone, company: '', suppressed: false, doNotEmail: false, blastEligible: true, distributionEligible: true }], 'reviewed-update');
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data[0].email, 'edited@example.invalid');
    assert.equal(edited.body.data[0].company, 'Keep company');
    assert.equal(edited.body.data[0].importVersion, 2);
    assert.equal(edited.body.data[0].suppressed, true);
    assert.equal(edited.body.data[0].blastEligible, false);
    assert.equal(edited.body.data[0].distributionEligible, false);
    assert.equal((await db.query('SELECT count(*) FROM buyers')).rows[0].count, 1);
  } finally { await db.close(); }
});

test('concurrent different imports preserve both fields and mandates on one profile', async () => {
  const { db, invoke } = await createBuyerImportFixture();
  const row = fields => parsing.parseBuyerRecord({ Email: 'race@example.invalid', ...fields });
  try {
    await invoke([row({ Name: 'Synthetic race' })]);
    const results = await Promise.all([
      invoke([row({ Company: 'Preserve company', Markets: 'Austin, TX', 'Property Criteria': 'SFH' })]),
      invoke([row({ Phone: '5551230099', Markets: 'Tampa, FL', 'Property Criteria': 'Land', 'Do Not Email': 'yes' })]),
    ]);
    assert.ok(results.every(result => result.status === 200));
    const saved = (await db.query('SELECT * FROM buyers')).rows;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].company, 'Preserve company');
    assert.equal(saved[0].phone, '5551230099');
    assert.equal(saved[0].data.suppressed, true);
    assert.ok(saved[0].data.sourceRecords.some(source => source.Markets === 'Austin, TX'));
    assert.ok(saved[0].data.sourceRecords.some(source => source.Markets === 'Tampa, FL'));
    assert.ok(saved[0].data.buyingMandates.length >= 2);
  } finally { await db.close(); }
});

test('concurrent first imports merge into one profile and legacy ambiguous emails fail closed', async () => {
  const { db, invoke } = await createBuyerImportFixture();
  try {
    const results = await Promise.all([
      invoke([parsing.parseBuyerRecord({ Email: 'new@example.invalid', Company: 'Synthetic company', Markets: 'Austin, TX' })]),
      invoke([parsing.parseBuyerRecord({ Email: 'NEW@example.invalid', Phone: '5550109944', Markets: 'Tampa, FL' })]),
    ]);
    assert.ok(results.every(result => result.status === 200));
    const saved = (await db.query('SELECT * FROM buyers')).rows;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].company, 'Synthetic company');
    assert.equal(saved[0].phone, '5550109944');
    assert.equal(saved[0].data.buyingMandates.length, 2);
    await db.query('INSERT INTO buyers (id,workspace_id,email) VALUES ($1,$2,$3)', ['legacy-duplicate', 'synthetic-workspace', 'NEW@example.invalid']);
    const conflict = await invoke([parsing.parseBuyerRecord({ Email: 'new@example.invalid' })]);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, 'identity_conflict');
  } finally { await db.close(); }
});

test('actual import API → disposable Postgres → API/profile hydration, replay and reviewed update', async () => {
  const { db, account, invoke } = await createBuyerImportFixture();
  try {
    const rows = Array.from({ length: 8 }, (_, i) => parsing.parseBuyerRecord({ Name: `Synthetic ${i}`, Email: `synthetic${i}@example.invalid`, Company: `Company ${i}`, Phone: `555010100${i}`, Markets: 'Austin, TX', 'Property Criteria': 'SFH', 'Price / Formula': '$100K–$500K', Notes: '  exact\nnotes  ' }, String(i)));
    const first = await invoke(rows);
    assert.equal(first.status, 200); assert.equal(first.body.data.length, 8);
    const saved = first.body.data[0];
    assert.equal(saved.notes, rows[0].notes); assert.deepEqual(saved.sourceRecords, rows[0].sourceRecords); assert.equal(saved.verificationStatus, 'Unverified'); assert.equal(saved.blastEligible, false);
    await Promise.all([invoke(rows), invoke(rows)]);
    assert.equal((await db.query('SELECT count(*) FROM buyers')).rows[0].count, 8);
    const blank = await invoke([parsing.parseBuyerRecord({ Email: ' SYNTHETIC0@EXAMPLE.INVALID ', Company: '', Phone: '', Notes: '' })]);
    assert.equal(blank.status, 200); assert.equal(blank.body.data[0].company, 'Company 0'); assert.equal(blank.body.data[0].notes, rows[0].notes);
    const next = await invoke([{ ...saved, company: 'Reviewed replacement' }], 'reviewed-update');
    assert.equal(next.body.data[0].company, 'Reviewed replacement');
    const conflict = await invoke([{ ...saved, email: 'synthetic1@example.invalid' }], 'reviewed-update');
    assert.equal(conflict.status, 409);
    const ambiguous = await invoke([parsing.parseBuyerRecord({ Email: 'different@example.invalid', Phone: '5550101000' })]);
    assert.equal(ambiguous.status, 409);
    const suppression = await invoke([parsing.parseBuyerRecord({ Email: saved.email, 'Do Not Email': 'yes' })]);
    assert.equal(suppression.body.data[0].status, 'Do Not Blast');
    const denied = await invoke([{ id: saved.id, email: saved.email, importVersion: 2, blastEligible: true, suppressed: false, doNotEmail: false }], 'reviewed-update');
    assert.equal(denied.body.data[0].blastEligible, false);
    account.workspace.id = 'other-workspace';
    const isolated = await invoke([{ ...saved, company: 'Wrong workspace' }], 'reviewed-update');
    assert.equal(isolated.status, 409);
    const persisted = (await db.query('SELECT data FROM buyers WHERE id=$1', [saved.id])).rows[0].data;
    assert.equal(persisted.company, 'Reviewed replacement'); assert.equal(persisted.sourceRecords[0].Notes, rows[0].notes);
  } finally { await db.close(); }
});
