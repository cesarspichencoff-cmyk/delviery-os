'use strict';
// Fail earlier than Windows: verify all exact Git blob pins on the
// disposable no-console proof launcher. Pure local file reads only.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../../');
const cs=fs.readFileSync(path.join(root,
 'labs/reader-proof/NativeReaderOneShotLabLauncher.cs'),'utf8');
const file=(p)=>fs.readFileSync(path.join(root,p));
function blob(bytes){
 return createHash('sha1').update(
  Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])
 ).digest('hex');
}
function quotedArray(source,name){
 const rx=new RegExp('var '+name+'=new\\[\\]\\{([\\s\\S]*?)\\};');
 const m=rx.exec(source);
 if(!m)throw Error('PIN_ARRAY_NOT_FOUND_'+name);
 return [...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
}
function check(source=cs,overrides={}){
 const names=quotedArray(source,'names'),pins=quotedArray(source,'expected');
 if(names.length!==5||pins.length!==5||new Set(names).size!==5)
  return 'EXACT_FIVE_DEPENDENCY_PINS_REQUIRED';
 if(!source.includes('return DependenciesMatch(workspace);'))
  return 'DEPENDENCY_CHECK_MUST_REMAIN_ACTIVE';
 const scriptMatch=/const string ApprovedScriptGitBlob="([a-f0-9]{40})";/.exec(source);
 if(!scriptMatch)return 'APPROVED_SCRIPT_PIN_MISSING';
 const actualScript=blob(file('labs/reader-proof/native_reader_one_shot_lab_cli_v1.cjs'));
 if(actualScript!==scriptMatch[1])return 'SCRIPT_GIT_BLOB_PIN_STALE';
 for(let i=0;i<names.length;i++){
  if(!/^[a-z0-9_]+\.cjs$/.test(names[i]))return 'DEPENDENCY_NAME_OUT_OF_SCOPE';
  if(!/^[a-f0-9]{40}$/.test(pins[i]))return 'DEPENDENCY_SHA_INVALID';
  const rel='runtime/reporting/'+names[i];
  const bytes=Object.hasOwn(overrides,rel)?Buffer.from(overrides[rel]):file(rel);
  if(blob(bytes)!==pins[i])return 'DEPENDENCY_GIT_BLOB_PIN_STALE:'+names[i];
 }
 return 'PASS';
}
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name)}
test('actual no-console launcher pins all current source bytes',()=>{
 assert.equal(check(),'PASS');
});
test('modifying a dependency with unchanged pin fails before Windows',()=>{
 const which='runtime/reporting/native_reader_shadow_replay_v1.cjs';
 assert.equal(check(cs,{[which]:'// SYNTHETIC MUTATION'}),'DEPENDENCY_GIT_BLOB_PIN_STALE:native_reader_shadow_replay_v1.cjs');
});
test('stale PIN in launcher fails even if source is untouched',()=>{
 const old=quotedArray(cs,'expected')[4];
 assert.equal(check(cs.replace(old,'0'.repeat(40))),
  'DEPENDENCY_GIT_BLOB_PIN_STALE:native_reader_shadow_replay_v1.cjs');
});
test('removing mandatory dependency verification is rejected',()=>{
 assert.equal(check(cs.replace('return DependenciesMatch(workspace);','return true;')),
  'DEPENDENCY_CHECK_MUST_REMAIN_ACTIVE');
});
test('modifying main script SHA is rejected before launch',()=>{
 const m=/const string ApprovedScriptGitBlob="([a-f0-9]{40})";/.exec(cs);
 assert.ok(m);
 assert.equal(check(cs.replace(m[1],'0'.repeat(40))),'SCRIPT_GIT_BLOB_PIN_STALE');
});
console.log('READER_ONE_SHOT_EXACT_PIN_INTEGRITY_PASS '+n+'/'+n+' NO_WINDOWS_NO_POS');
