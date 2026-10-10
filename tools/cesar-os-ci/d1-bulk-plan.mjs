// Candidate query planner for a future PRIVATE D1 transactional v2 ingest.
// Pure function. Does NOT connect to D1, execute SQL, or authorize source ingestion.
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

export function packWorkObservationInserts(rows){
  if(!Array.isArray(rows)||rows.length>D1_MAX_OBSERVATIONS)
    fail('d1_work_observation_count_invalid');
  const used=new Set(),out=[];
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       typeof row.observation_id!=='string'||!/^obs_[a-zA-Z0-9_-]{6,80}$/.test(row.observation_id)||
       used.has(row.observation_id)||row.source_id!==SOURCE||row.domain!=='WORK'||
       row.truth_class!=='SOURCE_CLAIM'||row.possible_commitment!==false||
       row.raw_payload_persisted===true)
      fail('d1_work_observation_invalid');
    used.add(row.observation_id);
    if(!Number.isFinite(Number(row.confidence)))fail('d1_work_confidence_invalid');
    for(const col of WORK_COLUMNS){
      if(!(col in row))fail('d1_work_missing_'+col);
      if(row[col]===undefined||typeof row[col]==='object'&&row[col]!==null&&col!=='metadata_json')
        fail('d1_work_type_'+col);
    }
  }
  for(let index=0;index<rows.length;index+=MAX_ROWS_PER_INSERT){
    const chunk=rows.slice(index,index+MAX_ROWS_PER_INSERT);
    const params=[];
    for(const row of chunk){
      for(const col of WORK_COLUMNS){
        const value=col==='possible_commitment'?0:
          col==='metadata_json'?(typeof row[col]==='string'?row[col]:JSON.stringify(row[col])):row[col];
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
