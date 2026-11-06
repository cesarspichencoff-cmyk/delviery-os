'use strict';
/**
 * Conference-specific intake of passive human-reported native paper evidence.
 * Complements, never replaces, the broad production-station census v2.
 * Pure: no filesystem, SQL, printer, customer data, network or source auth.
 * Only accepts closed, aggregate, non-identifying observations.
 */
const {review:reviewProduction,SCHEMA:PRODUCTION_SCHEMA} =
 require('./comandas_passive_paper_census_review_only.cjs');
const SCHEMA='tata.comandas.native-conference-paper-census-review.v1';
const FIELDS=['window','paper_seen','reported_origin','paper_kind',
 'caixa_watched_whole_sample','order_link_confirmed','orders_matched',
 'items_quantities_match','notes_match','one_paper_per_order',
 'late_output_checked','additional_tata_paper_seen'];
const PERMISSIONS=Object.freeze({sql:false,reader:false,service:false,
 files:false,network:false,printer:false,spooler:false,sequence:false,
 cutover:false,merge:false,deploy:false});
const tri=new Set(['YES','NO','UNKNOWN']);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
const D0='D0_EVIDENCE_INSUFFICIENT';
const D1='D1_NATIVE_CONFERENCE_SAMPLE_REPORTED_NOT_AUTHENTICATED';
const D2='D2_CONFERENCE_OR_PRODUCTION_ANOMALY_REPORTED';
function result(classification,reason,details={}){
 return Object.freeze({
  schema:SCHEMA,classification,reason,review_status:'HOLD',
  source:'AGGREGATED_HUMAN_REPORT_ONLY',
  production_sample_classification:details.production_sample_classification||D0,
  conference_shifts_reported:details.shifts||0,
  conference_orders_visually_matched_reported:details.matched||0,
  report_anomaly_categories:details.report_anomaly_categories||0,
  native_conference_paper_world_proven:false,
  all_native_paper_sources_authenticated:false,
  per_order_timing_and_uniqueness_world_proven:false,
  complete_native_revision_semantics_proven:false,
  independent_ifood_identity_proven:false,
  conference_native_sufficiency_operationally_accepted:false,
  tata_conference_print_authorized:false,
  production_print_change_authorized:false,
  current_action:'PRESERVE_EXISTING_NATIVE_OUTPUT_NO_EXTRA_TATA_PAPER',
  permitted_effects:PERMISSIONS
 });
}
function review(input){
 try{
  if(!exact(input,['schema','production_sample','conference_observations'])||
      input.schema!==SCHEMA||!Array.isArray(input.conference_observations)||
      input.conference_observations.length>2)
   return result(D0,'INVALID_ENVELOPE');
  const p=reviewProduction(input.production_sample);
  const info={production_sample_classification:p.classification};
  if(p.reason==='INVALID_INPUT'||p.reason==='REPORT_SHAPE_OR_PRIVACY_INVALID')
   return result(D0,'PRODUCTION_REPORT_INVALID',info);
  const shifts=Array.isArray(input.production_sample.shifts)?
   input.production_sample.shifts:[];
  const sampled=new Map(shifts.map(s=>[s.window,s.orders_observed]));
  const seen=new Set();
  let matched=0,anomalies=0,complete=true;
  for(const c of input.conference_observations){
   if(!exact(c,FIELDS)||!['ALMOCO','JANTAR'].includes(c.window)||
      seen.has(c.window)||!sampled.has(c.window)||
      !tri.has(c.paper_seen)||!tri.has(c.caixa_watched_whole_sample)||
      !tri.has(c.order_link_confirmed)||!tri.has(c.items_quantities_match)||
      !tri.has(c.notes_match)||!tri.has(c.one_paper_per_order)||
      !tri.has(c.late_output_checked)||!tri.has(c.additional_tata_paper_seen)||
      !['TEKNISA_NATIVE_REPORTED','OTHER_REPORTED','UNKNOWN'].includes(c.reported_origin)||
      !['CONFERENCE_NONFISCAL_REPORTED','FISCAL_ONLY_REPORTED','UNKNOWN'].includes(c.paper_kind)||
      !Number.isSafeInteger(c.orders_matched)||c.orders_matched<0||
      c.orders_matched>20||c.orders_matched>sampled.get(c.window))
    return result(D0,'CONFERENCE_REPORT_SHAPE_OR_PRIVACY_INVALID',info);
   seen.add(c.window);matched+=c.orders_matched;
   if(c.paper_seen==='NO')anomalies++;
   if(c.reported_origin==='OTHER_REPORTED')anomalies++;
   if(c.paper_kind==='FISCAL_ONLY_REPORTED')anomalies++;
   if(c.items_quantities_match==='NO')anomalies++;
   if(c.notes_match==='NO')anomalies++;
   if(c.one_paper_per_order==='NO')anomalies++;
   if(c.additional_tata_paper_seen==='YES')anomalies++;
   if(c.paper_seen!=='YES'||c.reported_origin!=='TEKNISA_NATIVE_REPORTED'||
      c.paper_kind!=='CONFERENCE_NONFISCAL_REPORTED'||
      c.caixa_watched_whole_sample!=='YES'||
      c.order_link_confirmed!=='YES'||
      c.orders_matched!==sampled.get(c.window)||
      c.items_quantities_match!=='YES'||c.notes_match!=='YES'||
      c.one_paper_per_order!=='YES'||c.late_output_checked!=='YES'||
      c.additional_tata_paper_seen!=='NO')
    complete=false;
  }
  info.shifts=seen.size;info.matched=matched;
  info.report_anomaly_categories=anomalies;
  if(p.classification.startsWith('D2_')||anomalies>0)
   return result(D2,'REPORTED_PAPER_ANOMALY_NOT_CAUSAL_OR_WORLD_PROOF',info);
  if(p.classification!=='D1_SAMPLE_CONFORME_RELATADA_NAO_AUTENTICADA'||
     seen.size!==2||!complete)
   return result(D0,'NATIVE_CONFERENCE_WITNESS_OR_COVERAGE_INSUFFICIENT',info);
  return result(D1,'TWO_COMPLETE_SELF_REPORTS_STILL_NOT_WORLD_EVIDENCE',info);
 }catch{return result(D0,'REVIEW_EXCEPTION');}
}
module.exports={SCHEMA,PRODUCTION_SCHEMA,FIELDS,review};
