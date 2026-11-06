'use strict';
// CI-only: restore exact committed LF bytes for NEW pinned Reader-v2 modules
// only if Windows checkout is demonstrably an LF->CRLF conversion.
// Any other difference is a hard failure. NEVER runs on the productive cashier.
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto');
if(process.platform!=='win32' ||
   process.env.GITHUB_ACTIONS!=='true' ||
   process.env.GITHUB_REPOSITORY!=='cesarspichencoff-cmyk/delviery-os' ||
   os.hostname().toUpperCase()==='CAIXA_MOOCA')
 throw Error('CI_WINDOWS_ONLY_NO_FIELD_EXECUTION');
const root=fs.realpathSync(process.env.GITHUB_WORKSPACE||'');
if(root!==fs.realpathSync(process.cwd()))
 throw Error('REPOSITORY_WORKSPACE_IDENTITY_NOT_PROVEN');
const originals=Object.freeze({
 'labs/reader-proof/native_reader_one_shot_lab_cli_v2.cjs':
  '532344b2d3b35ed87f475a0bebaa441f12bc54cc',
 'runtime/reporting/native_reader_existing_event_binding_v2.cjs':
  '1eb75fa3f6cc1959be6ff6cb6bc09fa2c1b7484e',
 'runtime/reporting/native_reader_n2n3_sanitized_receipt_v2.cjs':
  'fb52befe9bfa08da0cb24b16daeba227a86815cf',
 'runtime/reporting/native_reader_legacy_ps51_digest_v1.cjs':
  '57881e642c4b6d0e183c11da0a546efa6c184fe5'
});
const gitHash=data=>createHash('sha1').update(Buffer.concat([
 Buffer.from('blob '+data.length+'\0','ascii'),data])).digest('hex');
let checked=0,restored=0;
for(const [rel,expected] of Object.entries(originals)){
 const full=path.resolve(root,...rel.split('/'));
 assert(full.startsWith(root+path.sep),'OUTSIDE_WORKSPACE');
 const st=fs.lstatSync(full);
 assert(st.isFile()&&!st.isSymbolicLink()&&!st.isDirectory(),'NOT_REGULAR_FILE');
 const git=execFileSync('git',['show','HEAD:'+rel],{
  cwd:root,timeout:4000,maxBuffer:65536,windowsHide:true
 });
 assert.equal(gitHash(git),expected,'GIT_BLOB_PIN_NOT_MATCHED');
 assert(!git.includes(Buffer.from('\r\n')),'COMMITTED_SOURCE_NOT_LF');
 const disk=fs.readFileSync(full);
 if(!disk.equals(git)){
  const onlyCrlf=Buffer.from(git.toString('utf8').replace(/\n/g,'\r\n'),'utf8');
  assert(disk.equals(onlyCrlf),'CHECKOUT_NON_EOL_DRIFT_REJECTED');
  fs.writeFileSync(full,git);
  restored++;
 }
 assert(fs.readFileSync(full).equals(git),'PINNED_BYTES_NOT_RESTORED');
 checked++;
}
console.log('READER_V2_CI_EXACT_BLOB_PREPARATION_PASS '+checked+'/'+checked+
 ' EOL_ONLY_RESTORED='+restored+' NO_FIELD_EXECUTION');
