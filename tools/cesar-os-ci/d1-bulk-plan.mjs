// Candidate query planner for a future PRIVATE D1 transactional v2 ingest.
// Pure function. Does NOT connect to D1, execute SQL, or authorize source ingestion.
import {createHash} from 'node:crypto';
const SOURCE='github-actions-public-deliveryos';
export const WORK_COLUMNS=Object.freeze([
  'observation_id','source_id','external_ref','signal_type','observed_at',
  'ingested_at','domain','privacy_scope','truth_class','authority','sensitivity',
  'subject_type','subject_ref','fact_summary','possible_commitment','due_at',
  'confidence','evidence_ref','content_fingerprint','attention_candidate','metadata_json'
]);
export const D1_FREE_QUERY_CEILING=50;
export const D1_BIND_PARAM_CEILING=100;
export const D1_MAX_OBSERVATIONS=100;
export const MAX_ROWS_PER_INSERT=Math.floor(D1_BIND_PARAM_CEILING/WORK_COLUMNS.length);
export const RESERVED_EXTRA_QUERIES=5;
const fail=(x)=>{throw Error(x);};
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const fingerprints=row=>{
  const content=sha([row.signal_type,row.fact_summary,row.due_at||'',row.subject_ref].join('|'));
  const observation='obs_'+sha(['source-observation-v1',SOURCE,row.external_ref,content].join('|')).slice(0,20);
  return {content,observation};
};

const metadataText=value=>{
  let data;
  try{data=typeof value==='string'?JSON.parse(value):value;}
  catch{fail('d1_work_metadata_invalid');}
  if(!data||typeof data!=='object'||Array.isArray(data))fail('d1_work_metadata_invalid');
  let text;
  try{text=JSON.stringify(data);}
  catch{fail('d1_work_metadata_invalid');}
  if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>4096)
    fail('d1_work_metadata_size_invalid');
  const forbidden=new Set(['raw_payload','raw_body','authorization','access_token',
    'api_key','password','cookie','response_body','request_body']);
  const visit=x=>{
    if(!x||typeof x!=='object')return;
    for(const [k,v] of Object.entries(x)){
      if(forbidden.has(k.toLowerCase()))fail('d1_work_metadata_sensitive_key');
      visit(v);
    }
  };
  visit(data);
  return text;
};

export function packWorkObservationInserts(rows){
  if(!Array.isArray(rows)||rows.length>D1_MAX_OBSERVATIONS)
    fail('d1_work_observation_count_invalid');
  const used=new Set(),out=[],metadataById=new Map();
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       typeof row.observation_id!=='string'||!/^obs_[a-f0-9]{20}$/.test(row.observation_id)||
       used.has(row.observation_id)||row.source_id!==SOURCE||row.domain!=='WORK'||
       row.truth_class!=='SOURCE_CLAIM'||row.possible_commitment!==false||
       row.privacy_scope!=='ORGANIZATIONAL'||row.authority!=='OBSERVATION_ONLY'||
       row.raw_payload_persisted===true)
      fail('d1_work_observation_invalid');
    for(const col of WORK_COLUMNS){
      if(!(col in row))fail('d1_work_missing_'+col);
      if(row[col]===undefined||typeof row[col]==='object'&&row[col]!==null&&col!=='metadata_json')
        fail('d1_work_type_'+col);
    }
    const expected=fingerprints(row);
    if(row.content_fingerprint!==expected.content||row.observation_id!==expected.observation)
      fail('d1_work_normalized_fingerprint_mismatch');
    metadataById.set(row.observation_id,metadataText(row.metadata_json));
    used.add(row.observation_id);
    if(!Number.isFinite(Number(row.confidence)))fail('d1_work_confidence_invalid');
  }
  for(let index=0;index<rows.length;index+=MAX_ROWS_PER_INSERT){
    const chunk=rows.slice(index,index+MAX_ROWS_PER_INSERT);
    const params=[];
    for(const row of chunk){
      for(const col of WORK_COLUMNS){
        const value=col==='possible_commitment'?0:
          col==='metadata_json'?metadataById.get(row.observation_id):row[col];
        params.push(value);
      }
    }
    const valueTuple='('+WORK_COLUMNS.map(()=>'?').join(',')+')';
    const sql='INSERT INTO source_observations ('+WORK_COLUMNS.join(',')+') VALUES '+
      chunk.map(()=>valueTuple).join(',')+' ON CONFLICT(observation_id) DO NOTHING';
    if(params.length>D1_BIND_PARAM_CEILING||sql.length>100000)
      fail('d1_work_query_limit_violation');
    out.push({sql,params,row_count:chunk.length});
  }
  if(out.length+RESERVED_EXTRA_QUERIES>D1_FREE_QUERY_CEILING)
    fail('d1_work_free_query_budget_violation');
  return {schema:'cesar-os-d1-work-bulk-plan-v1',source_id:SOURCE,
    rows_seen:rows.length,statement_count:out.length,
    max_parameters:Math.max(0,...out.map(x=>x.params.length)),
    reserved_extra_queries:RESERVED_EXTRA_QUERIES,
    estimated_total_statements:out.length+RESERVED_EXTRA_QUERIES,
    observations:out,external_effect_authorized:false,executed:false};
}
