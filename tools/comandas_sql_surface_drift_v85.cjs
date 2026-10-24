'use strict';
/**
 * V8.5: compare INSTALLED reader preflight's requested SQL column list
 * against the last effective least-privilege manifest. All facts are
 * SOURCE/CONTRACT only; the 2026-10-05 manifest is never "current" proof.
 * No shell/process/SQL/network/write/printer operations.
 */
const SCHEMA='deliveryos.comandas.sql-column-surface-drift.v85';
const OBJECTS=['COMANDAVEN','ITCOMANDAVEN','PRODUTO','VENDAREST'];
const REQUIRED_PRINCIPAL='NT SERVICE\\TataComandaReader';
function hold(reason){
 return {schema:SCHEMA,status:'HOLD',reason,requested_objects:[],
   columns_requested_without_last_proven_grant:[],
   last_proven_columns_not_required_by_installed_check:[],
   last_known_permissions_date:'2026-10-05',
   current_effective_permissions_proven:false,
   service_identity_authenticated_in_current_SQL_session:false,
   read_authorized:false,preflight_current_success:false,
   source_code_only:true,production_effects:false};
}
function parseAllowed(script){
 if(typeof script!=='string'||script.length<100||script.length>200000)
  throw Error('SOURCE_INVALID');
 const m=script.match(/\$allowed\s*=\s*\[ordered\]@\{([\s\S]*?)\r?\n\}/i);
 if(!m)throw Error('EXACT_ALLOWED_BLOCK_NOT_FOUND');
 const body=m[1],items=[...body.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*@\(([\s\S]*?)\)/gm)];
 if(items.length!==OBJECTS.length||
    items.some(x=>!OBJECTS.includes(x[1]))||
    new Set(items.map(x=>x[1])).size!==OBJECTS.length)
  throw Error('OBJECT_ALLOWLIST_UNEXPECTED');
 const parsed={};
 for(const x of items){
   const raw=x[2].trim();
   if(!/^(?:\s*"[^"]+"\s*,?\s*)+$/.test(raw))throw Error('UNSAFE_ALLOWLIST_EXPRESSION');
   const cols=[...raw.matchAll(/"([^"]+)"/g)].map(z=>z[1]);
   if(!cols.length||cols.some(z=>!/^[A-Z][A-Z0-9_]*$/.test(z))||
      new Set(cols).size!==cols.length)
     throw Error('COLUMN_ALLOWLIST_INVALID');
   parsed[x[1]]=cols;
 }
 const residual=body.replace(/^\s*[A-Z][A-Z0-9_]*\s*=\s*@\([\s\S]*?\)/gm,'').trim();
 if(residual)throw Error('UNPARSED_ALLOWLIST_CONTENT');
 return parsed;
}
function inspect(manifest,script,{exitCode=null,stderrStatus='',preflightJson=null}={}){
 try{
  if(manifest?.schema!=='deliveryos.tata-reader-permission-manifest.v1'||
     manifest.principal!==REQUIRED_PRINCIPAL||
     manifest.object_schema!=='TEKNISA'||
     manifest.database!=='teknisa'||
     typeof manifest.effective_columns!=='object')
   return hold('LAST_KNOWN_PERMISSION_MANIFEST_NOT_PINNED');
  const installed=parseAllowed(script);
  const missing=[],unused=[];
  for(const table of OBJECTS){
    const current=installed[table],last=manifest.effective_columns[table];
    if(!Array.isArray(last)||last.some(x=>typeof x!=='string'))
      return hold('LAST_KNOWN_COLUMN_SURFACE_INVALID');
    for(const c of current)if(!last.includes(c))missing.push(table+'.'+c);
    for(const c of last)if(!current.includes(c))unused.push(table+'.'+c);
  }
  const root=hold(missing.length||unused.length?'INSTALLED_PREFLIGHT_COLUMN_SURFACE_DRIFT':
    'INSTALLED_PREFLIGHT_MATCHES_HISTORIC_MANIFEST_NOT_FRESH');
  root.requested_objects=[...OBJECTS];
  root.columns_requested_without_last_proven_grant=missing.sort();
  root.last_proven_columns_not_required_by_installed_check=unused.sort();
  // An earlier timeout is a separate, independent current-state blocker.
  root.last_preflight_timed_out=String(exitCode)==='124'||
    String(stderrStatus).trim()==='PREFLIGHT_TIMEOUT';
  root.current_preflight_missing_or_unusable=!preflightJson||
    typeof preflightJson!=='object'||Object.keys(preflightJson).length===0;
  // Never conclude that a source snapshot or manually supplied JSON file is
  // an independently authenticated current SQL execution under the service.
  return root;
 }catch{return hold('INSTALLED_PREFLIGHT_CONTRACT_UNPARSEABLE')}
}
module.exports={inspect,parseAllowed,OBJECTS,REQUIRED_PRINCIPAL};
