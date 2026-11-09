'use strict';
// Test-only synthetic fixture builder. No customer data or native Reader access.
const fs=require('node:fs'),path=require('node:path');
const {snapshotHash}=require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
const marker='DELIVERYOS_READER_PROOF_LAB_ONLY_V1';
function makeEvent(){
 const order={
  CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'FICT_SALE',NRCOMANDA:'FICT_COMMAND',
  NRCOMANDAEXT:'999',IDORGCMDVENDA:'DLV_IFO',IDSTCOMANDA:'3',
  DTHRABERMESA:'2026-11-05T12:04:00.0000000',
  items:[{NRPRODCOMVEN:'LINE_1',CDPRODUTO:'FICT_PRODUCT',CDARVPROD:'9200001000',
    QTPRODCOMVEN:'2.000',IDSTPRCOMVEN:'4'}],
  observation_scan_complete:true,
  observation_rows:[{
   source_field:'DSOBSPEDDIGCMD',scope_hint:'item',item_index:0,
   CDPRODUTO:'FICT_PRODUCT',join_proven:true,
   value:"FICT_PRIVATE_SENTINEL L'ação sem molho"
  }]
 };
 return {schema:'deliveryos.tata-reader-stable-order-event.v1',
  order_key:'0001|01|FICT_SALE|FICT_COMMAND',
  snapshot_hash:snapshotHash(order),order};
}
function eventPath(dir,event=makeEvent()){
 return path.join(dir,'reader-events-v1',
  event.order.NRCOMANDA+'_'+event.snapshot_hash+'.json');
}
function checkpointPath(dir){
 return path.join(dir,'synthetic-checkpoint.json');
}
function build(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir)||
    path.basename(dir)!=='deliveryos-reader-proof-lab')
  throw Error('INVALID_LAB_ROOT');
 if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'LAB_ONLY.txt'),marker+'\n',{flag:'wx'});
 const event=makeEvent();
 fs.mkdirSync(path.join(dir,'reader-events-v1'));
 fs.writeFileSync(eventPath(dir,event),
  JSON.stringify(event)+'\n',{flag:'wx'});
 const checkpoint={
  schema:'deliveryos.tata-reader-continuous-checkpoint.v1',
  hash_contract_version:'NODE_CANONICAL_JSON_SHA256_V1',
  checkpoint_origin:'FRESH_NODE_CANONICAL_V2',
  checkpoint_generation:'1234567890abcdef1234567890abcdef',
  bootstrap_complete:true,entries:[{
   order_key:event.order_key,snapshot_hash:event.snapshot_hash,
   emitted_hash:event.snapshot_hash,stable_count:2,
   last_seen_order_time:event.order.DTHRABERMESA
  }]
 };
 fs.writeFileSync(checkpointPath(dir),JSON.stringify(checkpoint)+'\n',{flag:'wx'});
}
if(require.main===module){
 const args=process.argv.slice(2);
 if(args.length!==1||!args[0].startsWith('--lab-dir='))process.exitCode=77;
 else try{build(args[0].slice(10));}catch{process.exitCode=78;}
}
module.exports={makeEvent,build,eventPath,checkpointPath};
