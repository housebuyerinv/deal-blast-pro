import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import { parseBuyerRecord, parsePurchaseCriteria, parseGeography, consolidateImportRows, parseBuyerText } from '../src/lib/buyerImport.js';
import { mergeImportedBuyer, preserveBuyerFields } from '../src/lib/buyerImportMerge.js';
import { importedMandateFit } from '../src/lib/importedBuyerMatching.js';
import { matchBuyer } from '../server/buyermatch/matching.js';

test('JSONB key reordering does not duplicate mandates or exact source records on replay', () => {
  const incoming = parseBuyerRecord({ Email: 'jsonb@example.invalid', Markets: 'Austin, TX', 'Property Criteria': 'SFH', 'Price / Formula': 'under $500K', Notes: ' exact notes ' });
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value;
  const stored = reorder(JSON.parse(JSON.stringify(incoming)));
  const merged = mergeImportedBuyer(stored, incoming);
  assert.equal(merged.buyingMandates.length, 1);
  assert.equal(merged.sourceRecords.length, 1);
  assert.equal(merged.sourceRecords[0].Notes, ' exact notes ');
  const repaired = mergeImportedBuyer({ ...stored, buyingMandates: [...stored.buyingMandates, ...incoming.buyingMandates] }, incoming);
  assert.equal(repaired.buyingMandates.length, 1);
  const different = parseBuyerRecord({ Email: incoming.email, Markets: 'Tampa, FL', 'Property Criteria': 'Land', 'Price / Formula': 'under $30K' });
  assert.equal(mergeImportedBuyer(merged, different).buyingMandates.length, 2);
});

test('master-list columns preserve complete source and separate claims from authorization', () => {
  const raw = { Name: 'Synthetic Buyer', Email: ' QA@EXAMPLE.INVALID ', Company: 'Synthetic Co', Phone: '+1 (555) 010-1000', Markets: 'Austin, TX', 'ZIPs / Areas': '78701', 'Property Criteria': '  SFH only\n3 bedrooms  ', Strategy: 'Fix & Flip', 'Price / Formula': '$100K–$500K', 'Closing Speed': '14 days', 'Verification Status': 'Verified', 'Proof Provided': 'Claimed POF', 'Contact Consent': 'Yes', Notes: '  Exact notes\n  retained ', Source: 'Synthetic master list', Extra: 'untouched' };
  const row = parseBuyerRecord(raw, 'sample');
  assert.equal(row.company, raw.Company); assert.equal(row.phone, raw.Phone);
  assert.equal(row.originalCriteria, raw['Property Criteria']); assert.equal(row.notes, raw.Notes);
  assert.deepEqual(row.originalFields, raw); assert.equal(row.source, raw.Source);
  assert.equal(row.budgetMin, 100000); assert.equal(row.budgetMax, 500000);
  assert.deepEqual(row.cities, ['Austin']); assert.deepEqual(row.states, ['TX']); assert.deepEqual(row.zipCodes, ['78701']);
  assert.equal(row.verificationStatus, 'Unverified'); assert.equal(row.status, 'Inactive'); assert.equal(row.blastEligible, false); assert.equal(row.consentStatus, 'unknown');
  assert.equal(row.importDiagnostics.columns.find(c => c.source === 'Extra').destination, null);
});
for (const [text, expected] of [['under $30K', 30000], ['up to $500K', 500000], ['$1.5M', 1500000]]) {
  test(`purchase expression ${text}`, () => assert.equal(parsePurchaseCriteria(text).purchaseMax, expected));
}
test('ARV formula, all-in and ARV are never purchase budgets', () => {
  const formula = parsePurchaseCriteria('65% ARV minus repairs');
  assert.equal(formula.purchaseMax, null); assert.equal(formula.formula.maxArvRatio, .65); assert.equal(formula.formula.subtractRepairs, true);
  assert.equal(parsePurchaseCriteria('all-in up to $500K').allInMax, 500000);
  assert.equal(parsePurchaseCriteria('all-in up to $500K').purchaseMax, null);
  assert.equal(parsePurchaseCriteria('ARV $500K').arv, 500000);
  assert.equal(parsePurchaseCriteria('ARV $500K').purchaseMax, null);
  assert.equal(parsePurchaseCriteria('3 beds, 2 baths').purchaseMax, null);
});
test('blank fields do not become inferred company, name, cash type or zero budget', () => {
  const row = parseBuyerRecord({ Email: 'buyer@synthetic-company.invalid' });
  for (const field of ['name', 'company', 'phone', 'type']) assert.equal(row[field], '');
  assert.equal(row.budgetMax, null); assert.equal(row.budgetMin, null);
});
test('state names, paired city/state and leading-zero ZIPs', () => {
  const geo = parseGeography('Boston, Massachusetts 02108; Austin TX 78701');
  assert.deepEqual(geo.states, ['MA', 'TX']); assert.deepEqual(geo.cities, ['Boston', 'Austin']); assert.deepEqual(geo.zips, ['02108', '78701']);
});
test('same normalized email retains both buying mandates and conflicts', () => {
  const rows = consolidateImportRows([
    parseBuyerRecord({ Email: 'qa@example.invalid', Company: 'One', Markets: 'TX', 'Price / Formula': 'under $30K' }, 'a'),
    parseBuyerRecord({ Email: ' QA@EXAMPLE.INVALID ', Company: 'Two', Markets: 'MA', 'Price / Formula': 'up to $500K', 'Do Not Email': 'yes' }, 'b'),
  ]);
  assert.equal(rows.length, 1); assert.equal(rows[0].buyingMandates.length, 2); assert.equal(rows[0].sourceRecords.length, 2); assert.equal(rows[0].doNotEmail, true);
  assert.ok(rows[0].importDiagnostics.review.includes('Conflicting company: review source records'));
  assert.equal(rows[0].buyingMandates[0].purchaseMax, 30000); assert.equal(rows[0].buyingMandates[1].purchaseMax, 500000);
});
test('existing email and ambiguous shared phone require deliberate review', () => {
  const rows = consolidateImportRows([parseBuyerRecord({ Email: ' QA@EXAMPLE.INVALID ', Phone: '5550101000' }), parseBuyerRecord({ Email: 'other@example.invalid', Phone: '(555) 010-1000' })], [{ email: 'qa@example.invalid', phone: '5550101000' }]);
  assert.equal(rows[0]._dup, true); assert.equal(rows[1]._identityConflict, true);
});
test('merge fills gaps without erasing existing facts or lifting suppression', () => {
  const existing = { company: 'Original', phone: '5550101000', notes: 'Exact existing notes', status: 'Do Not Blast', suppressed: true, consentStatus: 'denied', buyingMandates: [{ originalCriteria: 'old' }] };
  const row = mergeImportedBuyer(existing, parseBuyerRecord({ Email: 'qa@example.invalid', Company: '', 'Verification Status': 'Verified', 'Contact Consent': 'yes' }));
  assert.equal(row.company, 'Original'); assert.equal(row.phone, existing.phone); assert.equal(row.notes, existing.notes); assert.equal(row.status, 'Do Not Blast'); assert.equal(row.blastEligible, false); assert.equal(row.consentStatus, 'denied'); assert.equal(row.buyingMandates.length, 2);
  assert.deepEqual(mergeImportedBuyer(row, row).buyingMandates, row.buyingMandates);
});
test('8 synthetic CSV records survive quoted multiline parsing and storage JSON roundtrip', () => {
  const raw = Array.from({ length: 8 }, (_, i) => ({ Name: `Synthetic ${i}`, Email: `synthetic${i}@example.invalid`, Company: `Test ${i}`, Phone: `555010100${i}`, Markets: 'Austin, TX', 'Property Criteria': 'SFH\n3 beds, 2 baths', 'Price / Formula': i % 2 ? '65% ARV minus repairs' : 'up to $500K', Notes: '  exact\nnotes ' }));
  const csv = Papa.unparse(raw);
  const preview = Papa.parse(csv, { header: true }).data.map((row, i) => parseBuyerRecord(row, String(i)));
  const stored = JSON.parse(JSON.stringify(preview.map(row => ({ data: mergeImportedBuyer({}, row) }))));
  assert.equal(stored.length, 8);
  stored.forEach((row, i) => { assert.deepEqual(row.data.originalFields, raw[i]); assert.equal(row.data.notes, raw[i].Notes); assert.equal(row.data.blastEligible, false); });
});
test('thousands of rows consolidate without dropping mandates or source rows', () => {
  const rows = Array.from({ length: 4000 }, (_, i) => parseBuyerRecord({ Email: `synthetic${i % 3000}@example.invalid`, 'Property Criteria': `SFH mandate ${i}` }, String(i)));
  const result = consolidateImportRows(rows);
  assert.equal(result.length, 3000); assert.equal(result.reduce((n, r) => n + r.sourceRecords.length, 0), 4000);
});
test('master-list multiple mandate syntax stays separate with original conditions', () => {
  const row = parseBuyerRecord({ Email: 'qa@example.invalid', 'Buying Mandates': 'Mandate: Texas; Markets Raw: Austin, TX; Property Criteria Raw: SFH; Price / Formula Raw: Under $30K || Mandate: Florida; Markets Raw: Miami, FL; Property Criteria Raw: Multifamily; Price / Formula Raw: Maximum $2.5M' });
  assert.equal(row.buyingMandates.length, 2); assert.equal(row.buyingMandates[0].purchaseMax, 30000); assert.equal(row.buyingMandates[1].purchaseMax, 2500000); assert.equal(row.budgetMax, null);
});
test('imported records cannot become matches before verification and consent; no mandate cross-product', () => {
  const row = consolidateImportRows([
    parseBuyerRecord({ Email: 'qa@example.invalid', Markets: 'Austin, TX', 'Property Criteria': 'SFH', 'Price / Formula': 'under $30K' }),
    parseBuyerRecord({ Email: 'qa@example.invalid', Markets: 'Miami, FL', 'Property Criteria': 'SFH', 'Price / Formula': 'up to $500K' }),
  ])[0];
  const deal = { property: { state: 'TX', city: 'Austin', type: 'SFH' }, pricing: { askingPrice: 200000 } };
  assert.equal(importedMandateFit(deal, row).score, 0);
  assert.equal(matchBuyer({ state: 'TX', city: 'Austin', assetType: 'SFH', price: 200000 }, row).eligible, false);
  const reviewed = { ...row, verificationStatus: 'Verified Buyer', status: 'Active', consentStatus: 'granted', blastEligible: true };
  assert.equal(importedMandateFit(deal, reviewed).score, 0);
  assert.equal(importedMandateFit({ ...deal, pricing: { askingPrice: 25000 } }, reviewed).score, 100);
  assert.equal(importedMandateFit(deal, { ...reviewed, doNotEmail: true }).score, 0);
});
test('ARV formula matching subtracts repairs and never uses ARV as purchase ceiling', () => {
  const row = { ...parseBuyerRecord({ Email: 'qa@example.invalid', Markets: 'Austin, TX', 'Property Criteria': 'SFH', 'Price / Formula': '65% ARV minus repairs' }), verificationStatus: 'Verified Buyer', status: 'Active', consentStatus: 'granted', blastEligible: true };
  const deal = { property: { state: 'TX', city: 'Austin', type: 'SFH' }, pricing: { askingPrice: 180000, arv: 300000, rehab: 30000 } };
  assert.equal(importedMandateFit(deal, row).score, 0);
  assert.equal(importedMandateFit({ ...deal, pricing: { ...deal.pricing, askingPrice: 160000 } }, row).score, 100);
});
test('multiline TXT retains all labeled criteria and unlabeled notes', () => {
  const text = 'Name: Synthetic\nEmail: qa@example.invalid\nProperty Criteria: SFH; 3 beds\nno pools\nNotes:  exact notes  ';
  const raw = parseBuyerText(text);
  assert.equal(raw.length, 1); assert.equal(raw[0]['Property Criteria'], 'SFH; 3 beds\nno pools');
  assert.equal(raw[0]['Original Text'], text);
  assert.equal(parseBuyerRecord(raw[0]).assetTypes[0], 'SFH');
});
test('nested blank values cannot erase data; only reviewed nonblank values replace facts', () => {
  const existing = { company: 'Original', phone: '5550101000', data: { criteria: { roof: 'Good', pool: false }, notes: 'Saved' }, zipCodes: ['02108'] };
  const blank = { company: '   ', phone: null, data: { criteria: {}, notes: '' }, zipCodes: [] };
  assert.deepEqual(preserveBuyerFields(existing, blank), existing);
  assert.deepEqual(preserveBuyerFields(existing, blank, true), existing);
  assert.equal(preserveBuyerFields(existing, { company: 'New' }).company, 'Original');
  assert.equal(preserveBuyerFields(existing, { company: 'New' }, true).company, 'New');
});
test('same-file ambiguous phone identities and international prefix are flagged', () => {
  const rows = consolidateImportRows([parseBuyerRecord({ Email: 'one@example.invalid', Phone: '+1 555 010 1000' }), parseBuyerRecord({ Email: 'two@example.invalid', Phone: '5550101000' })]);
  assert.ok(rows.every(row => row._identityConflict));
});
