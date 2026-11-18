'use strict';
// LAB ONLY: metadata-first inventory for the installed reporting projector.
// NOT a live watcher, not a source attestor, not a production fast path.
// Results NEVER authorize publication, CURRENT, SQL, printing or deployment.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT_NAME='deliveryos-projector-lab';
const MARKER='DELIVERYOS_PROJECTOR_LAB_ONLY_V1';
const SOURCES=Object.freeze(['source','enrichment','quality','kds','station','logistics','consumption']);
const SCHEMA='deliveryos.projector-source-preflight-lab.v1';
const validDigest=x=>typeof x==='string'&&/^[A-F0-9]{64}$/.test(x);
const digest=x=>crypto.createHash('sha256').update(x,'utf8').digest('hex').toUpperCase();
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function labRoot(root){
 if(process.env.GITHUB_ACTIONS!=='true'||
   process.env.GITHUB_REPOSITORY!=='cesarspichencoff-cmyk/delviery-os'||
   os.hostname().toUpperCase()==='CAIXA_MOOCA')throw Error('LAB_ONLY');
 if(typeof root!=='string'||!path.isAbsolute(root)||path.basename(root)!==ROOT_NAME)
   throw Error('BAD_LAB_ROOT');
 const resolved=path.resolve(root), tmp=path.resolve(os.tmpdir())+path.sep;
 const norm=x=>process.platform==='win32'?x.toLowerCase():x;
 if(!norm(resolved).startsWith(norm(tmp))||norm(fs.realpathSync(resolved))!==norm(resolved))
   throw Error('LAB_ROOT_NOT_DISPOSABLE');
 const st=fs.lstatSync(resolved),marker=path.join(resolved,'LAB_ONLY.txt');
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('LAB_ROOT_INVALID');
 const ms=fs.lstatSync(marker);
 if(!ms.isFile()||ms.isSymbolicLink()||ms.size>80||fs.readFileSync(marker,'utf8').trim()!==MARKER)
   throw Error('LAB_MARKER_INVALID');
 return resolved;
}
function deny(reason,extra={}){return Object.freeze({schema:SCHEMA,state:'HOLD',reason,
  sourceAuthenticated:false,completeNativeChildrenProven:false,
  operatorAuthorized:false,skipProductionProjector:false,homePublishAuthorized:false,
  printAuthorized:false,productionWrites:0,...extra});}
/** Identical to installed sourceSignature: basename + size + trunc(mtimeMs), SHA-256 uppercase.
 * It does NOT read order envelopes, and is therefore not a content-integrity proof.
 */
function inventory(root,{maxFiles=20000}={}){
 try{
  const safe=labRoot(root);
  if(!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>25000)
   return deny('INVALID_BOUNDED_FILE_BUDGET');
  const base=path.join(safe,'state','reader-report-source-envelopes-v1');
  for(const folder of [path.dirname(base),base]){
   const st=fs.lstatSync(folder);
   if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(folder)!==folder)
    return deny('SOURCE_DIRECTORY_UNSAFE');
  }
  const names=fs.readdirSync(base).sort();
  if(names.length>maxFiles)return deny('SOURCE_FILE_BUDGET_EXCEEDED',{fileCount:names.length});
  const rows=[];
  for(const name of names){
   if(!/^[A-Za-z0-9_-]+\.report-source\.json$/.test(name))return deny('SOURCE_ENTRY_NAME_INVALID');
   const st=fs.lstatSync(path.join(base,name));
   if(!st.isFile()||st.isSymbolicLink()||st.size<0||st.size>1048576)
    return deny('SOURCE_ENTRY_NOT_REGULAR_OR_BOUNDED');
   rows.push(name+'|'+st.size+'|'+Math.trunc(st.mtimeMs));
  }
  return Object.freeze({schema:SCHEMA,state:'SOURCE_METADATA_OBSERVED',
   fileCount:names.length,sourceSignature:digest(rows.join('\n')),
   envelopeBytesRead:0,sourceAuthenticated:false,completeNativeChildrenProven:false,
   operatorAuthorized:false,skipProductionProjector:false,homePublishAuthorized:false,
   printAuthorized:false,productionWrites:0});
 }catch{return deny('LAB_SOURCE_INVENTORY_UNAVAILABLE');}
}
/** Conservative review: a source match can reduce parsing work in a FUTURE gated
 * implementation only after the real projector separately authenticates ALL other
 * inputs, SQL-derived enrichment, source finality, output idempotence and lock owner.
 */
function review({inventoryResult,checkpoint,currentAux,semanticsVersion}={}){
 if(inventoryResult?.state!=='SOURCE_METADATA_OBSERVED'||
   !validDigest(inventoryResult.sourceSignature))return deny('SOURCE_METADATA_NOT_ATTESTED');
 if(!isRecord(checkpoint)||checkpoint.schema!=='deliveryos.projector-fast-checkpoint-lab.v1'||
    !isRecord(checkpoint.signatures)||!isRecord(currentAux)||
    typeof semanticsVersion!=='string'||semanticsVersion.length<1)
   return deny('FAST_CHECKPOINT_NOT_QUALIFIED');
 if(checkpoint.semanticsVersion!==semanticsVersion)return deny('SEMANTICS_VERSION_CHANGED');
 const current={source:inventoryResult.sourceSignature,...currentAux};
 for(const k of SOURCES){
  if(!validDigest(checkpoint.signatures[k])||!validDigest(current[k]))
   return deny('DEPENDENCY_SIGNATURE_UNATTESTED');
  if(checkpoint.signatures[k]!==current[k])
   return deny('DEPENDENCY_CHANGED_FULL_REPLAY_REQUIRED',{changedKind:k});
 }
 return deny('METADATA_MATCHES_BUT_LIVE_SOURCE_UNPROVEN',{
   potentialFullEnvelopeParsesAvoided:inventoryResult.fileCount,
   requiresTrustedLiveEnrichmentReceipt:true,
   requiresAtomicLockMigration:true});
}
module.exports=Object.freeze({SCHEMA,MARKER,SOURCES,inventory,review});
