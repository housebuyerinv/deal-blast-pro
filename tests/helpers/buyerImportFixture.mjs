import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import * as parsing from '../../src/lib/buyerImport.js';
import * as merging from '../../src/lib/buyerImportMerge.js';


export async function createBuyerImportFixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE buyers (id text PRIMARY KEY, workspace_id text, created_by_user_id text, owner_user_id text, email text, name text, company text, phone text, status text, source text, buyer_type text, markets jsonb, asset_types jsonb, strategy text, budget_min numeric, budget_max numeric, notes text, data jsonb, created_at text, updated_at text);`);
  const adminClient = { from(table) {
    assert.equal(table, 'buyers');
    const query = { table, filters: [], start: 0, end: 999, payload: null, head: false };
    const chain = {
      select(_columns, options) { query.head = Boolean(options?.head); return chain; },
      eq(column, value) { query.filters.push([column, value]); return chain; },
      order() { return chain; }, range(start, end) { query.start = start; query.end = end; return chain; },
      upsert(payload, options) { query.payload = payload; query.ignoreDuplicates = options?.ignoreDuplicates; return chain; },
      update(payload) { query.update = payload; return chain; },
      is(column, value) { query.filters.push([column, value]); return chain; },
      async then(resolve, reject) {
        try {
          if (query.update) {
            const keys = Object.keys(query.update), values = keys.map(key => typeof query.update[key] === 'object' && query.update[key] !== null ? JSON.stringify(query.update[key]) : query.update[key]);
            const where = query.filters.map(([key, value]) => value === null ? `${key} IS NULL` : `${key}=$${values.push(value)}`).join(' AND ');
            const result = await db.query(`UPDATE buyers SET ${keys.map((key, i) => `${key}=$${i + 1}`).join(',')} WHERE ${where} RETURNING *`, values);
            resolve({ data: result.rows });
          } else if (query.payload) {
            const result = await db.transaction(async tx => {
              const saved = [];
              for (const row of query.payload) {
                const keys = Object.keys(row), values = keys.map(key => typeof row[key] === 'object' && row[key] !== null ? JSON.stringify(row[key]) : row[key]);
                const sql = `INSERT INTO buyers (${keys.join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')}) ON CONFLICT (id) ${query.ignoreDuplicates ? 'DO NOTHING' : `DO UPDATE SET ${keys.filter(k => k !== 'id').map(k => `${k}=excluded.${k}`).join(',')}`} RETURNING *`;
                saved.push(...(await tx.query(sql, values)).rows);
              }
              return saved;
            });
            resolve({ data: result });
          } else {
            const where = query.filters.length ? ' WHERE ' + query.filters.map(([key], i) => `${key}=$${i + 1}`).join(' AND ') : '';
            const result = await db.query(`SELECT ${query.head ? 'count(*)' : '*'} FROM buyers${where}${query.head ? '' : ` ORDER BY id LIMIT ${query.end - query.start + 1} OFFSET ${query.start}`}`, query.filters.map(([, value]) => value));
            resolve(query.head ? { count: Number(result.rows[0].count) } : { data: result.rows });
          }
        } catch (error) { reject(error); }
      },
    };
    return chain;
  } };
  const account = { user: { id: 'synthetic-user' }, workspace: { id: 'synthetic-workspace', owner_user_id: 'synthetic-user' }, plan: {}, isOwnerAdmin: true, adminClient };
  const source = readFileSync(new URL('../../api/import-buyers.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, process: { env: {} }, console,
    require(name) {
      if (name === 'node:crypto') return { createHash };
      if (name.includes('_accountAuth')) return { getAuthenticatedAccount: async () => account, cleanString: value => String(value ?? '').trim() };
      if (name.includes('buyerImportMerge')) return merging;
      if (name.includes('buyerImport')) return parsing;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const invoke = async (buyers, operation) => {
    let status, body;
    await exports.default({ method: 'POST', body: { buyers, operation } }, { status(code) { status = code; return this; }, json(value) { body = JSON.parse(JSON.stringify(value)); }, setHeader() {} });
    return { status, body };
  };
  return { db, account, adminClient, invoke };
}
