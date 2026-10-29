import test from 'node:test';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
test('BuyerMatch discovery never offers CRM signup as a product purchase', async () => {
  const page = await read('src/pages/public/BuyerMatchLanding.tsx');
  assert.doesNotMatch(page, /to="\/register"/);
  assert.match(page, /register\?product=buyermatch&tier=/);
  assert.match(page, /Choose \{plan.name\}/);
  assert.match(page, /Success fees remain disabled/);
  assert.match(page, /Powered by Deal Blast Pro/);
  const catalog = JSON.parse(await read('supabase/functions/_shared/buyermatchPlans.json'));
  assert.deepEqual(catalog.map(p => [p.amountCents,p.analysisAllowance,p.distributionAllowance,p.maxDistributionFanout]), [[5900,20,10,25],[11900,50,25,50]]);
});
test('public entry points expose BuyerMatch and preserve public/private route boundaries', async () => {
  for (const name of ['Landing','Features','Pricing']) assert.match(await read(`src/pages/public/${name}.tsx`), /to="\/buyermatch"/);
  const nav = await read('src/components/layout/PublicNav.tsx');
  assert.match(nav, /to: '\/buyermatch', label: 'BuyerMatch'/);
  assert.match(nav, /to="\/buyermatch"/);
  const app = await read('src/App.tsx');
  assert.match(app, /path="\/buyermatch\/pricing" element=\{<BuyerMatchLanding/);
  assert.match(app, /path="\/app\/\*"[\s\S]*?<ProtectedRoute>[\s\S]*?path="buyermatch"/);
});

test('integration branch cannot automatically deploy through connected DBP Git integration',async()=>{
 const config=JSON.parse(await read('vercel.json'));
 assert.equal(config.git.deploymentEnabled['codex/buyermatch-1b-integration'],false);
 assert.equal(Object.keys(config.git.deploymentEnabled).length,1);
});
