import * as fs from 'node:fs';
import * as path from 'node:path';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {createOperatorFileRoster} from './operator-file-roster';
import {createNeonOperatorSessions} from './neon-operator-session';
import {createOperatorHttp} from './operator-http';

/** Opt-in composition for the existing pilot server. No new listener or legacy-token authority.
 * Configuration and roster must live outside the public asset directory, under host ACLs.
 * Changing/removing the configuration denies subsequent requests until a reviewed restart.
 */
export function createOperatorPilotRuntime(env:NodeJS.ProcessEnv, appRoot=process.cwd(), now=Date.now) {
  const configFile=env.ENTREGAS_OPERATOR_CONFIG;
  const assetsRoot=path.resolve(appRoot,'src/entregas/ui');
  const privatePath=(file:unknown):file is string=>typeof file==='string'&&path.isAbsolute(file)&&
    !isWithin(assetsRoot,path.resolve(file));
  const readConfig=()=>{
    if(!privatePath(configFile))throw Error('OPERATOR_CONFIG_PATH_INVALID');
    const s=fs.lstatSync(configFile);
    if(!s.isFile()||s.isSymbolicLink()||s.size>16384||fs.realpathSync(configFile)!==path.resolve(configFile))throw Error('OPERATOR_CONFIG_FILE_INVALID');
    const fd=fs.openSync(configFile,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    try{
      const before=fs.fstatSync(fd),buf=Buffer.alloc(16385),n=fs.readSync(fd,buf,0,buf.length,0),after=fs.fstatSync(fd),current=fs.lstatSync(configFile);
      if(n!==s.size||n>16384||[before,after,current].some(v=>!v.isFile()||v.isSymbolicLink()||v.ino!==s.ino||v.dev!==s.dev||v.size!==s.size||v.mtimeMs!==s.mtimeMs))throw Error('OPERATOR_CONFIG_CHANGED');
      return buf.subarray(0,n).toString('utf8');
    }finally{fs.closeSync(fd);}
  };
  const raw=configFile===undefined?null:readConfig();
  const cfg=raw===null?null:JSON.parse(raw.replace(/^\uFEFF/,''));
  if(raw!==null&&(!cfg||cfg.schema!=='deliveryos.operator-pilot.v1'||typeof cfg.enabled!=='boolean'||cfg.unitId!=='ITAIM'))throw Error('OPERATOR_CONFIG_INVALID');
  const enabled=cfg?.enabled===true;
  let operator:ReturnType<typeof createOperatorHttp>|null=null;
  let expires=0;
  const unchanged=()=>{
    const t=now();
    if(!Number.isSafeInteger(t)||t>=expires||readConfig()!==raw)throw Error('OPERATOR_CONFIG_REVALIDATION_REQUIRED');
  };
  if(enabled){
    const scope=cfg.scope,p=scope?.sourceTimePolicy;
    const evidence=(s:unknown)=>typeof s==='string'&&s.trim().length>0&&s.length<=512;
    if(cfg.publishEnabled!==true||cfg.appOrigin!==env.ENTREGAS_PUBLIC_URL||!privatePath(cfg.rosterFile)||!privatePath(cfg.sourceRoot)||
      !evidence(cfg.approvalRef)||!evidence(cfg.sourceModeEvidenceRef)||
      typeof cfg.expiresAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(cfg.expiresAt)||
      !Number.isSafeInteger(Date.parse(cfg.expiresAt))||new Date(cfg.expiresAt).toISOString()!==cfg.expiresAt||Date.parse(cfg.expiresAt)<=now()||
      !Number.isSafeInteger(cfg.maxAgeMs)||cfg.maxAgeMs<1000||cfg.maxAgeMs>300000||
      scope?.unitId!=='ITAIM'||!['sourceUnitId','sourceStoreId','mappingEvidenceRef'].every(k=>evidence(scope[k]))||
      !['real','control','simulated'].includes(scope.sourceMode)||
      p?.schema!=='deliveryos.source-time-policy.v1'||p.timeZone!=='America/Sao_Paulo'||p.field!=='DTHRABERMESA'||p.basis!=='NATIVE_LOCAL_WALL_TIME'||
      !['unitId','sourceUnitId','sourceStoreId'].every(k=>p[k]===scope[k])||!evidence(p.evidenceRef))throw Error('OPERATOR_PUBLICATION_CONFIG_REQUIRED');
    expires=Date.parse(cfg.expiresAt);
    const roster=createOperatorFileRoster({file:cfg.rosterFile,issuer:cfg.authBase,now});
    const sessions=createNeonOperatorSessions({authBase:cfg.authBase,appOrigin:cfg.appOrigin,now,
      approvedSubject:async email=>{unchanged();return roster.approvedSubject(email);}});
    // Fixed implementation path. Configuration never selects executable code.
    const {readTataFileFeed}=require(path.join(appRoot,'runtime/reporting/copiloto_tata_file_feed_v1.cjs'));
    const assetsDir=path.join(assetsRoot,'copiloto/pedidos');
    operator=createOperatorHttp({sessions,now,
      lookupGrant:async(...args)=>{unchanged();return roster.lookupGrant(...args);},
      readFeed:async unit=>{unchanged();if(unit!=='ITAIM')throw Error('UNIT_NOT_AUTHORIZED');
        return readTataFileFeed({root:cfg.sourceRoot,scope,now:new Date(now()).toISOString(),maxAgeMs:cfg.maxAgeMs});},
      assets:{html:fs.readFileSync(path.join(assetsDir,'index.html'),'utf8'),js:fs.readFileSync(path.join(assetsDir,'app.js'),'utf8'),css:fs.readFileSync(path.join(assetsDir,'app.css'),'utf8')}});
  }
  return {enabled, async handle(req:IncomingMessage,res:ServerResponse):Promise<boolean>{
    // Reserve namespaces even when disabled; never fall through to legacy static HTML injection.
    let pathname:string;
    try{pathname=decodeURIComponent(new URL(req.url??'/', 'http://pilot.invalid').pathname);}catch{pathname='';}
    if(!(pathname==='/copiloto/pedidos'||pathname.startsWith('/copiloto/pedidos/')||pathname==='/api/operator'||pathname.startsWith('/api/operator/')||pathname==='/api/copiloto/orders'))return false;
    if(operator){try{unchanged();}catch{return unavailable(res);}
      await operator(req,res);return true;}
    return unavailable(res);
  }};
}
function unavailable(res:ServerResponse):true{
  res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify({ok:false,code:'OPERATOR_READING_NOT_AVAILABLE',data:null}));return true;
}
function isWithin(root:string,file:string){const relative=path.relative(root,file);return !relative||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
