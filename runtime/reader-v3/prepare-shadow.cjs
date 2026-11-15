'use strict';
// Offline staging only: reads the supplied legacy script and writes a NEW directory outside Reader.
// Never installs, starts/stops a process, touches ACLs, connects to SQL or approves production.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const FILES=['capture.cjs','capture.sql','discover.sql','engine.cjs','projection.cjs','run.cjs','service-sidecar.cjs','sql-client.cjs','sql-source.ps1','store.cjs'].map(n=>'runtime/reader-v3/'+n).concat(['native_reader_n2_base_tables_review_v1.cjs','native_reader_n2_child_tables_review_v1.cjs','native_reader_shadow_replay_v1.cjs'].map(n=>'runtime/reporting/'+n));
function prepare({repo,legacyFile,output,readerRoot,productRoot,from,expectedLegacySha}){
 for(const p of [repo,legacyFile,output,readerRoot,productRoot])if(!path.isAbsolute(p))throw Error('ABSOLUTE_PATH_REQUIRED');
 const relative=path.relative(readerRoot,output);if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('STAGING_INSIDE_READER_FORBIDDEN');
 if(fs.existsSync(output))throw Error('NEW_STAGING_DIRECTORY_REQUIRED');
 if(!/^\d{4}-\d{2}-\d{2}T00:00:00$/.test(from))throw Error('EXPLICIT_START_REQUIRED');
 const legacy=fs.readFileSync(legacyFile);if(sha(legacy)!==expectedLegacySha)throw Error('LEGACY_SHA_MISMATCH');
 if(legacy.includes(Buffer.from('reader-v3-candidate')))throw Error('ALREADY_INSTRUMENTED');
 const target=path.join(readerRoot,'shadow','reader-v3-candidate');
 const cfg={schema:'deliveryos.reader-v3.shadow-config.v1',mode:'SHADOW_ONLY',productionApproved:false,readerRoot,root:path.join(readerRoot,'state','reader-v3-shadow'),productRoot,from};
 // Append after the existing module, preserving its exact bytes and strict-mode prologue.
 const append='\n;try{require('+JSON.stringify(path.join(target,'runtime/reader-v3/service-sidecar.cjs'))+').start('+JSON.stringify(path.join(target,'shadow-config.json'))+').catch(()=>{});}catch{console.error("READER_V3_SHADOW_HELD");}\n';
 const entries=[];fs.mkdirSync(output,{recursive:false});
 function put(name,bytes){const dest=path.join(output,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes,{flag:'wx'});entries.push({path:name,sha256:sha(bytes),bytes:Buffer.byteLength(bytes)});}
 for(const name of FILES)put('candidate/'+name,fs.readFileSync(path.join(repo,name)));
 put('candidate/shadow-config.json',JSON.stringify(cfg,null,2)+'\n');
 put('legacy-original.cjs',legacy);put('live_shadow_consumer_loop_v1.cjs',Buffer.concat([legacy,Buffer.from(append)]));
 const manifest={schema:'deliveryos.reader-v3.staging.v1',approval:'NOT_GRANTED',legacySha256:expectedLegacySha,target,readerRoot,files:entries,effects:{production_write:false,sql_query:false,service_change:false}};
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifest;
}
module.exports={prepare,FILES,sha};
if(require.main===module){try{const file=process.argv[2];if(!file||!path.isAbsolute(file))throw Error('ABSOLUTE_PLAN_REQUIRED');const m=prepare(JSON.parse(fs.readFileSync(file,'utf8')));console.log(JSON.stringify({schema:m.schema,approval:m.approval,files:m.files.length,legacySha256:m.legacySha256}));}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'STAGING_FAILED');process.exitCode=1;}}
