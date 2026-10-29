// Standalone synthetic execution with no inherited provider credentials or .env.
import {spawnSync} from 'node:child_process';import process from 'node:process';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const env={NODE_ENV:'test',...Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','PATHEXT'].filter(name=>process.env[name]).map(name=>[name,process.env[name]]))};
const child=spawnSync(process.execPath,['--test','tests/buyermatch/isolated-application-acceptance.test.mjs'],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:1024*1024});
// The fixture contains synthetic values only. Child failures are summarized so a
// database stack/query can never be mistaken for a safe provider diagnostic.
if(child.status!==0){console.error('ISOLATED_ACCEPTANCE_FAILED; inspect local synthetic test directly. No provider retry.');process.exitCode=1;}
else{process.stdout.write(child.stdout);console.log('LOCAL_DATABASE_AND_APPLICATION_LOGIC_ONLY; AUTH_STORAGE_STRIPE_E2E_NOT_VERIFIED');}
