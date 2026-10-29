// Validates a manifest AFTER authorized decryption inside encrypted storage.
// Never walks local files, decrypts archives, retrieves keys or executes restored SQL.
import {createHash} from 'node:crypto';
export const REQUIRED_COVERAGE=['database','auth','roles','storage-metadata','storage-bytes','identities','provenance','configuration'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyRecoveryCoverage(manifest,readBytes){
 if(manifest?.version!==1||!Array.isArray(manifest.files)||typeof readBytes!=='function')throw Error('RECOVERY_MANIFEST_INVALID');
 const paths=new Set(),coverage=new Set();let bytes=0;
 for(const file of manifest.files){
  if(typeof file.path!=='string'||!/^[-a-zA-Z0-9_./]+$/.test(file.path)||file.path.startsWith('/')||file.path.split('/').some(p=>!p||p==='.'||p==='..')||paths.has(file.path.toLowerCase()))throw Error('UNSAFE_OR_DUPLICATE_PATH');
  if(!REQUIRED_COVERAGE.includes(file.coverage)||!Number.isSafeInteger(file.bytes)||file.bytes<0||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('INVALID_FILE_CONTRACT');
  paths.add(file.path.toLowerCase());coverage.add(file.coverage);
  // The reader must refuse symlinks/reparse points and enforce canonical containment.
  const data=readBytes(file.path);
  if(!(data instanceof Uint8Array)||data.byteLength!==file.bytes||sha(data)!==file.sha256)throw Error('RECOVERY_BYTES_MISMATCH');
  bytes+=data.byteLength;if(!Number.isSafeInteger(bytes))throw Error('RECOVERY_SIZE_INVALID');
 }
 if(REQUIRED_COVERAGE.some(name=>!coverage.has(name)))throw Error('RECOVERY_COVERAGE_INCOMPLETE');
 return {coverageComplete:true,files:paths.size,bytes,archiveEncryptionVerified:false,
  keyCustodyVerified:false,networkIsolationVerified:false,restoreVerified:false,productionReady:false};
}
