'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspect,parseAllowed,OBJECTS}=require('./comandas_sql_surface_drift_v85.cjs');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,
 '../data/tata_reader_permission_manifest_v1.json'),'utf8'));
let checks=0;
const eq=(x,y)=>{assert.deepEqual(x,y);checks++};
const build=surface=>[
 'param([string]$ExpectedPrincipal = "NT SERVICE\\TataComandaReader")',
 '$allowed = [ordered]@{',
 ...OBJECTS.map(name=>'  '+name+' = @('+surface[name].map(s=>'"'+s+'"').join(',')+')'),
 '}',
 '$result = [ordered]@{ safe_for_minimized_order_read = $false }'
].join('\n');
const expected=manifest.effective_columns,installed={...expected,
 PRODUTO:['CDPRODUTO','NMPRODUTO']};
const script=build(installed);
const r=inspect(manifest,script,{exitCode:124,stderrStatus:'PREFLIGHT_TIMEOUT',preflightJson:null});
eq(r.status,'HOLD');
eq(r.reason,'INSTALLED_PREFLIGHT_COLUMN_SURFACE_DRIFT');
eq(r.columns_requested_without_last_proven_grant,['PRODUTO.NMPRODUTO']);
eq(r.last_proven_columns_not_required_by_installed_check,['PRODUTO.CDARVPROD']);
eq(r.last_preflight_timed_out,true);
eq(r.current_preflight_missing_or_unusable,true);
eq(r.current_effective_permissions_proven,false);
eq(r.service_identity_authenticated_in_current_SQL_session,false);
eq(r.read_authorized,false);
eq(r.production_effects,false);
eq(Object.keys(parseAllowed(script)).sort(),[...OBJECTS].sort());
const same=inspect(manifest,build(expected),{exitCode:0,preflightJson:{safe_for_minimized_order_read:true}});
eq(same.reason,'INSTALLED_PREFLIGHT_MATCHES_HISTORIC_MANIFEST_NOT_FRESH');
eq(same.current_effective_permissions_proven,false);
eq(same.read_authorized,false);
eq(same.preflight_current_success,false);
eq(same.current_preflight_missing_or_unusable,false);
const bad=[
 build(installed).replace('  VENDAREST =','  BADTABLE ='),
 build(installed).replace('  PRODUTO =','  COMANDAVEN ='),
 build(installed).replace('  PRODUTO = @','  PRODUTO = $(evil); @'),
 build(installed).replace('  PRODUTO = @("CDPRODUTO","NMPRODUTO")','  PRODUTO = @("CDPRODUTO","CDPRODUTO")'),
 build(installed).replace('  PRODUTO = @("CDPRODUTO","NMPRODUTO")','  PRODUTO = @("CDPRODUTO","NMPRODUTO","")'),
 build(installed).replace('  PRODUTO = @("CDPRODUTO","NMPRODUTO")','  PRODUTO = @("CDPRODUTO","NMPRODUTO")\n Invoke-Expression "echo h"'),
 build(installed).replace('$allowed = [ordered]@{','$allowed = @{'),
 '',
 '{}'
];
for(const badScript of bad){
 const x=inspect(manifest,badScript);
 eq(x.status,'HOLD');
 eq(x.reason,'INSTALLED_PREFLIGHT_CONTRACT_UNPARSEABLE');
 eq(x.read_authorized,false);
}
const unknown={...manifest,principal:'OTHER_IDENTITY'};
eq(inspect(unknown,script).reason,'LAST_KNOWN_PERMISSION_MANIFEST_NOT_PINNED');
eq(inspect(manifest,script,{exitCode:0,preflightJson:{safe_for_minimized_order_read:true}}).read_authorized,false);
console.log(JSON.stringify({schema:'deliveryos.sql-surface-drift-v85.test',result:'PASS',
 checks,synthetic_source_only:true,
 expected_installed_surface_mismatch:['PRODUTO.NMPRODUTO','PRODUTO.CDARVPROD'],
 real_database_probed:false,
 read_authorized:false,service_changed:false,printer_touched:false}));
