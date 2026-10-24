// Explicitly authorized S2-only synthetic verification. No browser token bridge.
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';

const ref='qxhhlprentrufobpcgna',origin=`https://${ref}.supabase.co`;
const run=`intake-s2-${randomUUID()}`,out='artifacts/buyermatch-1b/intake-s2-hosted.json';
const report={run,project:ref,checks:[],status:'RUNNING',ownedUser:null,keys:[],paths:[]};
mkdirSync('artifacts/buyermatch-1b',{recursive:true});
const save=()=>writeFileSync(out,JSON.stringify(report,null,2));
function check(ok,label){report.checks.push({label,pass:Boolean(ok)});save();if(!ok)throw Error(label);}
const scopedFetch=(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.origin!==origin)throw Error('Unexpected service origin');
 return fetch(input,{...init,redirect:'error'});
};
const parsed=JSON.parse(execFileSync(process.execPath,['C:/Users/CTL Katastrophic/AppData/Roaming/npm/node_modules/supabase/dist/supabase.js','projects','api-keys','--project-ref',ref,'--output-format','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const keys=Array.isArray(parsed)?parsed:parsed.api_keys??parsed.keys??parsed.data;
if(!Array.isArray(keys))throw Error('Private staging key access unavailable');
const service=keys.find(k=>k.name==='service_role')?.api_key,publicKey=keys.find(k=>k.name==='anon')?.api_key;
for(const [key,role] of [[service,'service_role'],[publicKey,'anon']]){
 if(!key?.startsWith('eyJ'))throw Error('Expected verified legacy staging credential unavailable');
 const claim=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));
 if(claim.ref!==ref||claim.role!==role)throw Error('Credential project/role mismatch');
}
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:scopedFetch}};
const admin=createClient(origin,service,options),anon=createClient(origin,publicKey,options),customer=createClient(origin,publicKey,options);
let userId,profileCreated=false;
const nextKey=()=>{const key=randomUUID();report.keys.push(key);save();return key;};
const payload=()=>({name:'Synthetic buyer',company:'Synthetic S2',email:`${run}@example.invalid`,phone:'555-0100',markets:['AL'],assetTypes:['SFH'],notes:run,portalForm:{consent:true,dealConsent:false},proofFiles:[]});
const receipt=(client,key,value=payload())=>client.rpc('bm_submit_buyer_intake',{p_key:key,p_value:value});
const row=async key=>{
 const r=await admin.from('buyer_portal_submissions').select('id,submission_key,buyer_data,status').eq('submission_key',key).eq('buyer_data->>notes',run).single();
 check(!r.error&&r.data?.submission_key===key,'Owned synthetic receipt record');return r.data;
};
try{
 const gate=await scopedFetch(`${origin}/functions/v1/stripe-webhook`,{method:'POST',body:''});
 check(gate.status===503,'Webhook receiver remains paused before fixture creation');
 const bucket=await admin.storage.getBucket('buyer-proof-files');
 check(!bucket.error&&bucket.data?.public===false,'Proof bucket is private');
 if(process.argv.includes('--preflight')){report.status='PREFLIGHT_PASS';save();console.log(JSON.stringify({status:report.status,checks:report.checks}));process.exit(0);}
 const key=nextKey(),input=payload();
 const concurrent=await Promise.all(Array.from({length:4},()=>receipt(anon,key,input)));
 check(concurrent.every(r=>!r.error&&r.data?.recorded===true&&Object.keys(r.data).sort().join(',')==='id,recorded')&&new Set(concurrent.map(r=>r.data.id)).size===1,'Four real concurrent anonymous calls produce the same private receipt');
 const count=await admin.from('buyer_portal_submissions').select('id',{count:'exact',head:true}).eq('submission_key',key).eq('buyer_data->>notes',run);
 check(!count.error&&count.count===1,'Concurrent calls persist exactly one owned submission');
 const original=await row(key);
 check(original.status==='pending_review'&&original.buyer_data.blastEligible===false&&original.buyer_data.consent?.dealInvitations===false,'Pending/unverified state and separate invitation opt-out');
 const conflict=await receipt(anon,key,{...input,name:'Conflicting synthetic retry'});
 check(Boolean(conflict.error),'Changed retry payload rejected');
 check(JSON.stringify((await row(key)).buyer_data)===JSON.stringify(original.buyer_data),'Conflicting retry preserves submitted evidence');
 const read=await anon.from('buyer_portal_submissions').select('buyer_data').eq('id',original.id);
 check(read.error?.code==='42501','Actual anonymous private-row read denied');
 const directInsert=await anon.from('buyer_portal_submissions').insert({status:'pending_review',buyer_data:input});
 check(directInsert.error?.code==='42501','Anonymous direct INSERT denied');
 const helper=await anon.rpc('bm_can_review_buyer_intake');
 check(helper.error?.code==='42501','Anonymous owner helper execution denied');
 const badProof=await receipt(anon,nextKey(),{...input,proofFiles:[{storageProvider:'supabase',storageBucket:'buyer-proof-files',storagePath:`buyer-documents/${randomUUID()}/foreign.png`}]});
 check(Boolean(badProof.error),'Anonymous cannot attach authenticated proof identity');

 const email=`${run}@example.invalid`,password=randomBytes(40).toString('base64url')+'!8aA';
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{buyermatch_s2_run:run,role:'Admin',email:'housebuyerinv@gmail.com'}});
 check(!created.error&&created.data.user?.email===email,'One owned synthetic confirmed Auth identity created without email');
 userId=created.data.user.id;report.ownedUser=userId;save();
 const profile=await admin.from('account_profiles').upsert({user_id:userId,email,full_name:'Synthetic S2 Intake Admin',company:run,role:'Admin',account_status:'Active'},{onConflict:'user_id'});
 check(!profile.error,'Owned synthetic ordinary Admin profile');profileCreated=true;
 const login=await customer.auth.signInWithPassword({email,password});
 check(!login.error&&login.data.user?.id===userId,'Normal synthetic password login (tokens stay in memory)');
 const allowed=await customer.rpc('bm_can_review_buyer_intake');
 check(!allowed.error&&allowed.data===false,'Ordinary Admin and forged user metadata do not confer owner authority');
 const customerRead=await customer.from('buyer_portal_submissions').select('id,buyer_data').eq('id',original.id);
 check(!customerRead.error&&customerRead.data.length===0,'Actual authenticated ordinary Admin cannot read another intake');
 const patch=await customer.from('buyer_portal_submissions').update({status:'imported'}).eq('id',original.id).select('id');
 check(!patch.error&&patch.data.length===0,'Actual ordinary Admin review UPDATE denied by RLS');
 const immutable=await customer.from('buyer_portal_submissions').update({buyer_data:{forged:true}}).eq('id',original.id);
 check(immutable.error?.code==='42501','Submitted evidence column cannot be overwritten');

 const ownPath=`buyer-documents/${userId}/${run}.png`,foreignPath=`buyer-documents/${randomUUID()}/${run}.png`;
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBpsAAAAASUVORK5CYII=','base64');
 const uploaded=await customer.storage.from('buyer-proof-files').upload(ownPath,bytes,{contentType:'image/png',upsert:false});
 if(!uploaded.error){report.paths.push(ownPath);save();}
 check(!uploaded.error,'Owned synthetic proof upload succeeds');
 const foreign=await customer.storage.from('buyer-proof-files').upload(foreignPath,bytes,{contentType:'image/png',upsert:false});
 if(!foreign.error){report.paths.push(foreignPath);save();}
 check(Boolean(foreign.error),'Cross-identity proof upload rejected');
 const privateDownload=await customer.storage.from('buyer-proof-files').download(ownPath);
 check(!privateDownload.error&&createHash('sha256').update(Buffer.from(await privateDownload.data.arrayBuffer())).digest('hex')===createHash('sha256').update(bytes).digest('hex'),'Own private proof download matches checksum');
 const publicDownload=await anon.storage.from('buyer-proof-files').download(ownPath);
 check(Boolean(publicDownload.error),'Anonymous private proof download rejected');
 const badIdentity=await receipt(customer,nextKey(),{...input,proofFiles:[{storageProvider:'supabase',storageBucket:'buyer-proof-files',storagePath:foreignPath}]});
 check(Boolean(badIdentity.error),'Authenticated receipt cannot bind foreign proof identity');
 const proofKey=nextKey(),proof=await receipt(customer,proofKey,{...input,blastEligible:true,role:'Admin',proofFiles:[{storageProvider:'supabase',storageBucket:'buyer-proof-files',storagePath:ownPath,uploadedBy:randomUUID(),verificationStatus:'Verified'}]});
 check(!proof.error&&proof.data?.recorded===true,'Authenticated own-proof receipt succeeds');
 const saved=await row(proofKey);
 check(saved.buyer_data.proofFiles[0].uploadedBy===userId&&saved.buyer_data.proofFiles[0].verificationStatus==='Pending Review'&&saved.buyer_data.blastEligible===false&&saved.buyer_data.consent.dealInvitations===false,'Server binds proof owner and preserves pending status and opt-out');
 report.status='PASS_WITH_OWNER_BROWSER_NOT_RUN';
}catch{report.status='FAIL';report.failedCheck=report.checks.find(x=>!x.pass)?.label??'Controlled test infrastructure failure';}
finally{
 const cleanup=[];
 try{
  const removed=await admin.from('buyer_portal_submissions').delete().in('submission_key',report.keys.length?report.keys:[randomUUID()]).eq('buyer_data->>notes',run);
  cleanup.push({stage:'owned_receipts',pass:!removed.error});
  if(report.paths.length){const r=await admin.storage.from('buyer-proof-files').remove(report.paths);cleanup.push({stage:'owned_proofs',pass:!r.error});}
  if(userId){
   const owned=await admin.auth.admin.getUserById(userId);
   if(owned.error||owned.data.user?.user_metadata?.buyermatch_s2_run!==run){cleanup.push({stage:'fixture_ownership',pass:false});}
   else{
    const signedOut=await customer.auth.signOut();cleanup.push({stage:'owned_session',pass:!signedOut.error});
    if(profileCreated){const p=await admin.from('account_profiles').delete().eq('user_id',userId).eq('company',run);cleanup.push({stage:'owned_profile',pass:!p.error});}
    const deleted=await admin.auth.admin.deleteUser(userId);cleanup.push({stage:'owned_auth',pass:!deleted.error});
   }
  }
  const after=await admin.from('buyer_portal_submissions').select('id',{count:'exact',head:true}).in('submission_key',report.keys.length?report.keys:[randomUUID()]).eq('buyer_data->>notes',run);
  cleanup.push({stage:'owned_receipts_absent',pass:!after.error&&after.count===0});
  const receiver=await scopedFetch(`${origin}/functions/v1/stripe-webhook`,{method:'POST',body:''});cleanup.push({stage:'receiver_still_paused',pass:receiver.status===503});
 }catch{cleanup.push({stage:'cleanup_infrastructure',pass:false});}
 report.cleanup=cleanup;if(cleanup.some(x=>!x.pass))report.status='FAIL_CLEANUP';save();
 console.log(JSON.stringify({status:report.status,checks:report.checks,cleanup,ownerPositive:'NOT RUN: no qualified staging owner',browser:'NOT RUN: candidate not deployed'}));
}
if(report.status.startsWith('FAIL'))process.exitCode=2;
