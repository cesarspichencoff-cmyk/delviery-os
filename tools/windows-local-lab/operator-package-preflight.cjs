'use strict';
// Offline, read-only preparation. Never import/execute the application, contact
// the provider, open the source/roster, create a worker, start a listener or activate.
// Usage: node operator-package-preflight.cjs --app-root ABSOLUTE
//   [--config ABSOLUTE --public-url https://exact-origin]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire,isBuiltin}=require('node:module');
const {createHash}=require('node:crypto');
const ENTRYPOINTS=[
  'dist/tools/entregas_pilot_server.js',
  'dist/src/platform/auth/operator-pilot-runtime.js',
  'runtime/reporting/copiloto_tata_worker_v1.cjs',
  // Fixed dynamic dependency used by the legacy source diagnostic.
  'tools/windows-local-lab/tata-source-preview.cjs',
];
const ASSETS=[
  'src/entregas/ui/copiloto/pedidos/index.html',
  'src/entregas/ui/copiloto/pedidos/app.js',
  'src/entregas/ui/copiloto/pedidos/app.css',
  'src/product/ui/tokens/organismo-tokens.css',
  'docs/figma/MOTION_TOKENS.json',
];
const LIMITATIONS=[
  'STATIC_PACKAGE_AND_CONFIG_ONLY', 'LAUNCHER_NOT_VERIFIED',
  'SOURCE_AND_CHECKPOINT_NOT_READ', 'ROSTER_AND_ACL_NOT_VERIFIED',
  'LIVE_IDENTITY_AND_PROXY_NOT_VERIFIED', 'NO_OPERATIONAL_ACCEPTANCE',
  'EXTERNAL_DEPENDENCIES_RESOLVED_NOT_EXECUTED', 'EXTERNAL_TRANSITIVE_GRAPH_NOT_VERIFIED',
];
function within(root,file){const r=path.relative(root,file);return !r||r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);}
function fail(code){throw Error(code);}
function boundedRead(file,max){
  const before=fs.lstatSync(file);
  if(!before.isFile()||before.isSymbolicLink()||before.size>max||fs.realpathSync(file)!==path.resolve(file))fail('FILE_INVALID');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{
    const opened=fs.fstatSync(fd),buf=Buffer.alloc(before.size+1),n=fs.readSync(fd,buf,0,buf.length,0);
    const after=fs.fstatSync(fd),current=fs.lstatSync(file);
    if(n!==before.size||[opened,after,current].some(s=>!s.isFile()||s.isSymbolicLink()||s.ino!==before.ino||s.dev!==before.dev||s.size!==before.size||s.mtimeMs!==before.mtimeMs))fail('FILE_CHANGED');
    return buf.subarray(0,n);
  }finally{fs.closeSync(fd);}
}
function auditOperatorPackage({appRoot,configFile,publicUrl,now=Date.now()}={}){
  const checks=[],files=new Map(),external=new Set();let configState='not_checked';
  const check=(id,action)=>{try{action();checks.push({id,ok:true});}catch{checks.push({id,ok:false});}};
  const validRoot=typeof appRoot==='string'&&path.isAbsolute(appRoot);
  check('APP_ROOT',()=>{
    if(!validRoot||!fs.lstatSync(appRoot).isDirectory()||fs.realpathSync(appRoot)!==path.resolve(appRoot))fail('APP_ROOT');
  });
  check('NODE_CAPABILITIES',()=>{
    if(typeof fetch!=='function'||typeof structuredClone!=='function'||typeof Headers.prototype.getSetCookie!=='function'||typeof AbortSignal.timeout!=='function')fail('NODE_CAPABILITIES');
  });
  if(checks[0].ok){
    const root=path.resolve(appRoot),visited=new Set();
    const read=(file)=>{
      if(!within(root,file))fail('PACKAGE_PATH');
      if(!files.has(file)){
        if(files.size>=1000)fail('PACKAGE_BUDGET');
        files.set(file,boundedRead(file,2*1024*1024));
      }
      return files.get(file);
    };
    function walk(file){
      if(visited.has(file))return;visited.add(file);
      const content=read(file).toString('utf8');
      if(path.extname(file)==='.json'){JSON.parse(content);return;}
      // Compile only: top-level code, requires and worker entry never execute.
      new vm.Script(content,{filename:'package-module'});
      const resolve=createRequire(file).resolve;
      // This is a dependency presence check for reviewed CommonJS output, not
      // a JavaScript security parser. Explicit runtime assets are listed above.
      for(const match of content.matchAll(/\brequire\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g)){
        const spec=match[2];if(isBuiltin(spec))continue;
        const target=resolve(spec);
        if(spec.startsWith('.'))walk(target);
        else {if(!within(path.join(root,'node_modules'),target))fail('EXTERNAL_DEPENDENCY_OUTSIDE_PACKAGE');read(target);external.add(spec);}
      }
    }
    for(const [index,entry] of ENTRYPOINTS.entries())check('MODULE_GRAPH_'+index,()=>walk(path.join(root,entry)));
    for(const [index,asset] of ASSETS.entries())check('UI_ASSET_'+index,()=>{
      const content=read(path.join(root,asset)).toString('utf8');if(!content.trim())fail('EMPTY_ASSET');
      if(asset.endsWith('MOTION_TOKENS.json')){
        const motion=JSON.parse(content);
        if(!motion.duracao||!motion.easing||typeof motion.duracao['motion-quick']!=='string'||typeof motion.easing['motion-ease-standard']!=='string')fail('MOTION_INVALID');
      }else if(asset.endsWith('/app.js'))new vm.Script(content,{filename:'reader-ui'});
    });
    check('OPERATOR_CONFIG_STATIC',()=>{
      if(configFile===undefined){configState='absent_disabled';return;}
      // Be stricter than today's single static root: no private file may be
      // located anywhere in the package, including the canonical Home assets.
      const privatePath=p=>typeof p==='string'&&path.isAbsolute(p)&&!within(root,path.resolve(p));
      if(!privatePath(configFile))fail('CONFIG_PATH');
      const cfg=JSON.parse(boundedRead(configFile,16384).toString('utf8').replace(/^\uFEFF/,''));
      if(!cfg||cfg.schema!=='deliveryos.operator-pilot.v1'||cfg.unitId!=='ITAIM'||typeof cfg.enabled!=='boolean')fail('CONFIG_SCHEMA');
      if(!cfg.enabled){configState='explicitly_disabled';return;}
      const evidence=s=>typeof s==='string'&&s.trim().length>0&&s.length<=512;
      const scope=cfg.scope,p=scope?.sourceTimePolicy;
      if(cfg.publishEnabled!==true||cfg.appOrigin!==publicUrl||!privatePath(cfg.rosterFile)||!privatePath(cfg.sourceRoot)||
        !evidence(cfg.approvalRef)||!evidence(cfg.sourceModeEvidenceRef)||!Number.isSafeInteger(now)||
        typeof cfg.expiresAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(cfg.expiresAt)||
        !Number.isSafeInteger(Date.parse(cfg.expiresAt))||new Date(cfg.expiresAt).toISOString()!==cfg.expiresAt||Date.parse(cfg.expiresAt)<=now||
        !Number.isSafeInteger(cfg.maxAgeMs)||cfg.maxAgeMs<1000||cfg.maxAgeMs>300000||
        scope?.unitId!=='ITAIM'||!['sourceUnitId','sourceStoreId','mappingEvidenceRef'].every(k=>evidence(scope[k]))||
        !['real','control','simulated'].includes(scope.sourceMode)||
        p?.schema!=='deliveryos.source-time-policy.v1'||p.timeZone!=='America/Sao_Paulo'||p.field!=='DTHRABERMESA'||p.basis!=='NATIVE_LOCAL_WALL_TIME'||
        !['unitId','sourceUnitId','sourceStoreId'].every(k=>p[k]===scope[k])||!evidence(p.evidenceRef))fail('CONFIG_FIELDS');
      const base=new URL(cfg.authBase),origin=new URL(cfg.appOrigin);
      if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!base.pathname.endsWith('/auth')||
        origin.protocol!=='https:'||origin.origin!==cfg.appOrigin)fail('AUTH_ORIGIN');
      configState='enabled_static_candidate';
    });
  }
  const ok=checks.every(c=>c.ok);
  if(checks.some(c=>c.id==='OPERATOR_CONFIG_STATIC'&&!c.ok))configState='invalid';
  const hash=createHash('sha256');
  for(const [file,bytes] of [...files].sort(([a],[b])=>a<b?-1:a>b?1:0))hash.update(path.relative(appRoot,file).split(path.sep).join('/')+'\0').update(createHash('sha256').update(bytes).digest('hex')+'\n');
  return {schema:'deliveryos.operator-package-preflight.v1',ok,code:ok?'OFFLINE_PREPARATION_PASS':'OFFLINE_PREPARATION_FAIL',
    activationAllowed:false,configState,checks,blockers:checks.filter(c=>!c.ok).map(c=>c.id),
    activationBlockers:[...LIMITATIONS,...(configState!=='enabled_static_candidate'?['OPERATOR_CONFIG_NOT_ENABLED_CANDIDATE']:[])],checkedPackageFiles:files.size,
    checkedFilesSha256:ok?hash.digest('hex'):null,externalDependencyCount:external.size,
    limitations:LIMITATIONS};
}
function main(args){
  try{
    const options={};
    for(let i=0;i<args.length;i+=2){
      const key={'--app-root':'appRoot','--config':'configFile','--public-url':'publicUrl'}[args[i]];
      if(!key||options[key]!==undefined||!args[i+1]||args[i+1].startsWith('--'))fail('ARGUMENTS');options[key]=args[i+1];
    }
    const result=auditOperatorPackage(options);process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=result.ok?0:1;
  }catch{process.stdout.write(JSON.stringify({schema:'deliveryos.operator-package-preflight.v1',ok:false,code:'PREFLIGHT_ARGUMENTS_OR_INTERNAL_FAILURE',activationAllowed:false})+'\n');process.exitCode=1;}
}
module.exports={auditOperatorPackage,ENTRYPOINTS,ASSETS};
if(require.main===module)main(process.argv.slice(2));
