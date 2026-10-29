import process from 'node:process';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const [operatorFile,profileFile,directory,credentials,approval,proxy]=process.argv.slice(2);
const operator=await import(pathToFileURL(operatorFile));
await operator.startWatchdog(profileFile,directory,credentials,approval,process.pid,proxy);
// Keep only the primary fixture alive until the parent explicitly ends it.
for(let i=0;i<1200;i++){
  try{await readFile(path.join(directory,'release-primary'));await writeFile(path.join(directory,'primary-exited'),'yes');process.exit(0);}catch{/* fixture synchronization */}
  await new Promise(r=>setTimeout(r,50));
}
throw Error('Fixture primary timeout');
