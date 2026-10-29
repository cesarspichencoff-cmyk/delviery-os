'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {auditOperatorPackage,ASSETS}=require('../../tools/windows-local-lab/operator-package-preflight.cjs');
const repo=path.resolve(__dirname,'../..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'operator-package-'));
const app=path.join(tmp,'app'),config=path.join(tmp,'operator.json');
const origin='https://operator.example.invalid',now=Date.parse('2026-10-28T12:00:00.000Z');
const options={appRoot:app,configFile:config,publicUrl:origin,now};
const scope={unitId:'ITAIM',sourceUnitId:'LAB',sourceStoreId:'01',mappingEvidenceRef:'SYNTHETIC',sourceMode:'simulated',sourceTimePolicy:{schema:'deliveryos.source-time-policy.v1',unitId:'ITAIM',sourceUnitId:'LAB',sourceStoreId:'01',field:'DTHRABERMESA',basis:'NATIVE_LOCAL_WALL_TIME',timeZone:'America/Sao_Paulo',evidenceRef:'SYNTHETIC'}};
const valid={schema:'deliveryos.operator-pilot.v1',unitId:'ITAIM',enabled:true,publishEnabled:true,authBase:'https://provider.invalid/auth',appOrigin:origin,rosterFile:path.join(tmp,'DO_NOT_READ_ROSTER'),sourceRoot:path.join(tmp,'DO_NOT_READ_SOURCE'),scope,maxAgeMs:120000,expiresAt:'2026-10-28T13:00:00.000Z',approvalRef:'SECRET_APPROVAL_SENTINEL',sourceModeEvidenceRef:'SYNTHETIC'};
let passed=0;const pass=name=>{passed++;console.log('PASS '+name);};
const save=c=>fs.writeFileSync(config,JSON.stringify(c));
const run=()=>auditOperatorPackage(options);
function denied(r,id){assert.equal(r.ok,false);assert.equal(r.activationAllowed,false);assert(r.blockers.includes(id));assert.equal(r.checkedFilesSha256,null);}
function temporarily(relative,mutate,check){const file=path.join(app,relative),bytes=fs.readFileSync(file);try{mutate(file);check();}finally{fs.writeFileSync(file,bytes);}}
try{
  // Real compiled tree, not an application-shaped mock. No node_modules scripts run.
  for(const relative of ['dist','runtime/reporting','src/entregas/ui','src/product/ui/tokens','docs/figma/MOTION_TOKENS.json','tools/windows-local-lab/tata-source-preview.cjs','node_modules/pg']){
    const target=path.join(app,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(repo,relative),target,{recursive:true});
  }
  const baseline=auditOperatorPackage({appRoot:app,now});
  assert.equal(baseline.ok,true);assert(baseline.checkedPackageFiles>=70);assert.equal(baseline.configState,'absent_disabled');assert.equal(baseline.activationAllowed,false);assert(baseline.activationBlockers.includes('OPERATOR_CONFIG_NOT_ENABLED_CANDIDATE'));
  pass('real copied package passes preparation; absent configuration never means activation');
  save({schema:valid.schema,unitId:'ITAIM',enabled:false,publishEnabled:false});let r=run();assert.equal(r.ok,true);assert.equal(r.configState,'explicitly_disabled');assert.equal(r.checkedFilesSha256,baseline.checkedFilesSha256);
  pass('explicitly disabled package stays disabled and preserves checked-artifact digest');
  save(valid);r=run();assert.equal(r.ok,true);assert.equal(r.configState,'enabled_static_candidate');assert.equal(r.activationAllowed,false);assert(r.activationBlockers.includes('ROSTER_AND_ACL_NOT_VERIFIED'));assert(!fs.existsSync(valid.rosterFile));assert(!fs.existsSync(valid.sourceRoot));
  pass('valid active candidate is structural only; missing live source and roster are not silently claimed verified');
  const mutations=[c=>c.unitId='MOOCA',c=>c.publishEnabled=false,c=>c.appOrigin='https://other.invalid',c=>c.authBase='http://provider.invalid/auth',c=>c.authBase='https://user:SECRET_PASSWORD@provider.invalid/auth',c=>c.expiresAt='2026-10-28T12:00:00.000Z',c=>c.maxAgeMs=300001,c=>c.scope.sourceMode=null,c=>c.scope.sourceTimePolicy.sourceUnitId='OTHER',c=>c.sourceModeEvidenceRef='',c=>c.scope.mappingEvidenceRef='',c=>c.sourceRoot='relative',c=>c.rosterFile=path.join(app,'src/product/ui/private.json'),c=>c.scope.sourceTimePolicy=null];
  for(const mutation of mutations){const c=structuredClone(valid);mutation(c);save(c);r=run();denied(r,'OPERATOR_CONFIG_STATIC');assert.equal(r.configState,'invalid');}
  save(valid);denied(auditOperatorPackage({...options,configFile:path.join(app,'private.json')}),'OPERATOR_CONFIG_STATIC');
  pass('15 invalid origin, scope, policy, expiry, provenance and public-package path controls');
  for(const asset of ASSETS)temporarily(asset,f=>fs.unlinkSync(f),()=>assert.equal(run().ok,false));
  temporarily('docs/figma/MOTION_TOKENS.json',f=>fs.writeFileSync(f,'{}'),()=>denied(run(),'UI_ASSET_4'));
  pass('missing reader assets, canonical palette and motion schema fail before boot');
  for(const relative of ['runtime/reporting/tata_comanda_order_truth_v1.cjs','runtime/reporting/copiloto_tata_worker_v1.cjs','dist/src/platform/auth/operator-read-authority.js','dist/src/entregas/pilot/pilot-facade.js','node_modules/pg/lib/index.js'])temporarily(relative,f=>fs.unlinkSync(f),()=>assert.equal(run().ok,false));
  temporarily('dist/src/platform/auth/operator-http.js',f=>fs.writeFileSync(f,'function {'),()=>assert.equal(run().ok,false));
  pass('transitive worker/motor, compiled runtime, pilot and external entry-point omissions plus syntax errors fail');
  for(const text of ['{"SECRET_CUSTOMER_SENTINEL":',' '.repeat(16385)]){fs.writeFileSync(config,text);const output=JSON.stringify(run());assert(!output.includes('SECRET'));assert(!output.includes(tmp));assert.equal(run().ok,false);}
  save(valid);assert(!JSON.stringify(run()).includes('SECRET_APPROVAL_SENTINEL'));
  pass('malformed and oversized private configuration produces only stable codes');
  // Prove source/roster are never even statted, and modules are only compiled.
  const entry=path.join(app,'dist/tools/entregas_pilot_server.js'),entryBytes=fs.readFileSync(entry);
  fs.appendFileSync(entry,'\nthrow Error("APPLICATION_EXECUTED");\n');
  const originals={};let network=0,writes=0,forbiddenReads=0;
  const oldFetch=global.fetch;global.fetch=()=>{network++;throw Error('NETWORK_FORBIDDEN');};
  for(const method of ['lstatSync','statSync','readFileSync','openSync','realpathSync']){originals[method]=fs[method];fs[method]=function(file,...args){if(file===valid.sourceRoot||file===valid.rosterFile){forbiddenReads++;throw Error('PRIVATE_READ_FORBIDDEN');}return originals[method].call(this,file,...args);};}
  originals.writeFileSync=fs.writeFileSync;fs.writeFileSync=()=>{writes++;throw Error('WRITE_FORBIDDEN');};
  try{assert.equal(run().ok,true);assert.equal(network,0);assert.equal(writes,0);assert.equal(forbiddenReads,0);}finally{global.fetch=oldFetch;for(const [k,v] of Object.entries(originals))fs[k]=v;fs.writeFileSync(entry,entryBytes);}
  pass('no application execution, network, mutation or source/roster access');
  const digest=run().checkedFilesSha256;
  temporarily('src/entregas/ui/copiloto/pedidos/app.css',f=>fs.appendFileSync(f,'\n/* changed */'),()=>assert.notEqual(run().checkedFilesSha256,digest));assert.equal(run().checkedFilesSha256,digest);
  pass('checked-file digest detects asset changes and is reproducible after restoration');
  const cli=path.join(repo,'tools/windows-local-lab/operator-package-preflight.cjs');
  let child=spawnSync(process.execPath,[cli,'--app-root',app],{encoding:'utf8',timeout:10000});assert.equal(child.status,0);assert.equal(child.stderr,'');assert.equal(JSON.parse(child.stdout).activationAllowed,false);
  child=spawnSync(process.execPath,[cli,'--SECRET_PATH',tmp],{encoding:'utf8',timeout:10000});assert.equal(child.status,1);assert.equal(child.stderr,'');assert(!child.stdout.includes(tmp));assert(!child.stdout.includes('SECRET_PATH'));
  child=spawnSync(process.execPath,[cli,'--app-root',path.join(tmp,'MISSING_PRIVATE_PATH')],{encoding:'utf8',timeout:10000});assert.equal(child.status,1);assert(!child.stdout.includes('MISSING_PRIVATE_PATH'));
  pass('CLI exit codes, fail-closed argument parsing and sanitized JSON output');
  console.log('OPERATOR_PACKAGE_PREFLIGHT_PASS '+passed);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
