// Offline preparation only. No provider client, shell execution or secret reader.
import {createHash} from 'node:crypto';
export const S2_PROJECT='qxhhlprentrufobpcgna';
export const STRIPE_ACCOUNT='acct_1UTRcRL6efr9LhPI';
export const PENDING_MIGRATIONS=[
 '20261026175709_buyermatch_authenticated_buyer_self_service.sql',
 '20261028025423_buyermatch_deal_activity.sql',
 '20261028025900_buyermatch_explicit_criteria_version.sql',
 '20261028031838_buyermatch_service_function_permissions.sql',
];
export const ACCEPTANCE_CASES=Object.freeze([
 ['identity','buyer','Confirmed normal buyer login and permitted profile/criteria updates'],
 ['pof','buyer','Private POF replace/expiry/review, stale revision and retained prior evidence'],
 ['history','buyer','Invitations, interest/decline/conversation and complete private history'],
 ['subscriber','subscriber','Owned deal submission, valid/invalid facts, private analysis and quotas'],
 ['outreach','subscriber','Consented preparation, recorded distribution and latest response tracking'],
 ['admin','admin','Owner-only buyer/deal/proof review, operations and closing audit'],
 ['billing','billing','Pro activation, Starter boundary, CRM separation, tier/cancel/renewal/failure'],
 ['replay','billing','Real signed duplicate/out-of-order reconciliation without duplicate access'],
 ['portal','billing','Only approved products/fixed quantity; independently contained issued sessions'],
 ['denial','security','Cross-owner/document/legacy-route denial and immutable audit protection'],
 ['cleanup','containment','Independent pause/disable/removal plus unchanged fallback/cohort fingerprints'],
].map(([id,area,description])=>Object.freeze({id,area,description})));
const hash=sql=>createHash('sha256').update(sql.replace(/\r\n/g,'\n')).digest('hex');
export function prepareS2Migrations({project,history,sources}) {
 if(project!==S2_PROJECT || !Array.isArray(history) || !Array.isArray(sources))throw Error('S2_METADATA_REQUIRED');
 if(sources.length!==PENDING_MIGRATIONS.length || new Set(sources.map(s=>s.name)).size!==sources.length || sources.some(s=>!PENDING_MIGRATIONS.includes(s.name)))throw Error('EXACT_SOURCE_REQUIRED');
 const versions=new Set();for(const row of history){if(!/^\d{14}$/.test(row.version)||versions.has(row.version))throw Error('MIGRATION_HISTORY_AMBIGUOUS');versions.add(row.version);}
 const intake=history.filter(row=>row.name==='buyermatch_private_buyer_intake');
 if(intake.length!==1 || intake[0].version!=='20261024000845')throw Error('RECORDED_INTAKE_REQUIRED_DO_NOT_REPLAY');
 for(const name of ['buyermatch_analysis_version_guard','buyermatch_completed_checkout_guards'])if(!history.some(row=>row.name===name))throw Error('RECORDED_PREREQUISITE_REQUIRED');
 const seen=new Set();const pending=[];
 for(const name of PENDING_MIGRATIONS){
  const source=sources.find(item=>item.name===name);
  if(!source || typeof source.sql!=='string' || seen.has(source.name))throw Error('EXACT_SOURCE_REQUIRED');seen.add(source.name);
  const version=name.slice(0,14);const recorded=history.find(row=>row.version===version);
  if(recorded){if(recorded.canonicalSha256!==hash(source.sql))throw Error('RECORDED_SOURCE_UNVERIFIED');continue;}
  pending.push({name,version,canonicalSha256:hash(source.sql)});
 }
 return {project,pending,replayIntake:false,executionAllowed:false,
  rollback:'Transactional failure rolls back only the active migration. After a commit retain additive guards, pause processing and roll back application routing; never drop audit tables or restore broad grants.'};
}
export function assessAcceptanceEvidence(rows){
 if(!Array.isArray(rows))throw Error('EVIDENCE_REQUIRED');
 const seen=new Set();for(const row of rows){if(!ACCEPTANCE_CASES.some(c=>c.id===row.id)||seen.has(row.id))throw Error('AMBIGUOUS_EVIDENCE');seen.add(row.id);}
 const cases=ACCEPTANCE_CASES.map(item=>{
  const row=rows.find(r=>r.id===item.id);
  const actual=row?.status==='PASS'&&row?.origin==='CURRENT_HOSTED'&&/^[a-f0-9]{40}$/.test(row.source||'')&&row?.independentlyVerified===true;
  return {id:item.id,status:actual?'CURRENT_HOSTED_PASS':row?.status==='FAIL'?'FAIL':'NOT_VERIFIED'};
 });
 // Evidence labels alone do not authenticate provider receipts; an independent
 // reviewer must verify each referenced source/run receipt before hosted success.
 return {cases,allCasesReported:cases.every(c=>c.status==='CURRENT_HOSTED_PASS'),
  independentlyAuthenticated:false,launchReady:false,executionAllowed:false};
}
