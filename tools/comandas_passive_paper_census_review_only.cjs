'use strict';
/**
 * PR #135 — HUMAN-REPORTED paper census classifier (Itaim).
 * Pure offline intake for the already authorized passive physical
 * observation. It cannot observe a printer, authenticate a human
 * witness or approve the production/Conferencia architecture.
 *
 * No order identifiers, names, numbers, raw notes, printers'
 * connection details, fiscal codes or photos are accepted.
 * D1 is only a LABEL FOR A COMPLETE SELF-REPORTED SAMPLE.
 * Nothing here can authorize print, SQL, service or cutover.
 */
const SCHEMA='tata.comandas.paper-census-sample-offline.v2';
// Human-reported family coverage is a necessary but NOT independently
// authenticated condition for considering the reported sample complete.
const FAMILIES=Object.freeze(['SUSHI_1','SUSHI_2','HOT_ROLL','KITCHEN']);
const ALLOWED_ANOMALIES=Object.freeze([
 'MISSING_PAPER','DUPLICATE','WRONG_STATION','CONTENT_MISMATCH',
 'NOTE_OMITTED','LATE_PAPER','UNEXPECTED_GP_GESTOR','UNREADABLE',
 'UNKNOWN_ORIGIN','ORDER_IDENTITY_MISMATCH','OTHER_WITNESSED_ANOMALY'
]);
const EFFECTS=Object.freeze({
 sql:false,reader:false,service:false,files:false,network:false,
 printer:false,spooler:false,sequence:false,cutover:false
});
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).sort().join('|')===keys.slice().sort().join('|');
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000;
const yesno=new Set(['YES','NO','UNKNOWN']);
function outcome(classification,reason,details={}){
 return Object.freeze({
  schema:SCHEMA,classification,review_status:'HOLD',reason,
  sample_provenance:'UNATTESTED_HUMAN_REPORT',
  reported_anomalies:details.reported_anomalies||0,
  shifts_reported:details.shifts_reported||0,
  observed_orders:details.observed_orders||0,
  sample_mix_complete_reported:details.sample_mix_complete_reported||false,
  preparation_family_coverage_reported:details.preparation_family_coverage_reported||false,
  native_paper_sample_proven:false,
  complete_station_coverage_world_proven:false,
  source_join_world_proven:false,
  universal_absence_of_duplicates_proven:false,
  origin_ifood_independent_proven:false,
  native_revision_complete_proven:false,
  reader_sql_plan_proven:false,
  conference_print_authorized:false,
  production_change_authorized:false,
  effect_permissions:EFFECTS
 });
}
function review(input){
 try{
  if(!exact(input,['schema','shifts'])||input.schema!==SCHEMA||
     !Array.isArray(input.shifts)||input.shifts.length>2)
    return outcome('D0_EVIDENCE_INSUFFICIENT','INVALID_INPUT');
  if(input.shifts.length===0)
    return outcome('D0_EVIDENCE_INSUFFICIENT','NO_FIELD_OBSERVATION');
  const seen=new Set(),days=new Set();
  let anomalies=0,observed=0,complete=true,
      allMix=true,allFamilies=true;
  for(const s of input.shifts){
   if(!exact(s,['window','day','orders_available','orders_observed',
      'consecutive_sample','identity_confirmed','stations_covered',
      'content_compared','notes_compared','late_output_checked',
      'anomalies','preparation_coverage'])||
      !['ALMOCO','JANTAR'].includes(s.window)||seen.has(s.window)||
      typeof s.day!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s.day)||
      (!Number.isFinite(Date.parse(s.day+'T00:00:00Z'))||
       new Date(s.day+'T00:00:00Z').toISOString().slice(0,10)!==s.day)||
      !count(s.orders_available)||!count(s.orders_observed)||
      s.orders_observed>Math.min(20,s.orders_available)||
      !yesno.has(s.consecutive_sample)||
      !yesno.has(s.identity_confirmed)||
      !['ALL_REQUIRED','PARTIAL','UNKNOWN'].includes(s.stations_covered)||
      !yesno.has(s.content_compared)||
      !yesno.has(s.notes_compared)||
      !yesno.has(s.late_output_checked)||
      !exact(s.preparation_coverage,['single_station_orders','multi_station_orders',
        'unknown_station_orders','families_observed','ambiguous_combined_double'])||
      !count(s.preparation_coverage.single_station_orders)||
      !count(s.preparation_coverage.multi_station_orders)||
      !count(s.preparation_coverage.unknown_station_orders)||
      s.preparation_coverage.single_station_orders+
       s.preparation_coverage.multi_station_orders+
       s.preparation_coverage.unknown_station_orders!==s.orders_observed||
      typeof s.preparation_coverage.ambiguous_combined_double!=='boolean'||
      !Array.isArray(s.preparation_coverage.families_observed)||
      s.preparation_coverage.families_observed.length>FAMILIES.length||
      s.preparation_coverage.families_observed.some(f=>!FAMILIES.includes(f))||
      new Set(s.preparation_coverage.families_observed).size!==
       s.preparation_coverage.families_observed.length||
      !Array.isArray(s.anomalies)||s.anomalies.length>20||
      s.anomalies.some(x=>typeof x!=='string'||
         !ALLOWED_ANOMALIES.includes(x))||
      new Set(s.anomalies).size!==s.anomalies.length)
    return outcome('D0_EVIDENCE_INSUFFICIENT','REPORT_SHAPE_OR_PRIVACY_INVALID');
   seen.add(s.window);days.add(s.day);
   const reportedTypes=new Set(s.anomalies);
   // Explicit NO is a conflict category; a matching tag must not double count.
   if(s.content_compared==='NO')reportedTypes.add('CONTENT_MISMATCH');
   if(s.notes_compared==='NO')reportedTypes.add('NOTE_OMITTED');
   // On the field sheet, NO means a WITNESSED contradictory order-to-paper
   // identity. UNKNOWN means no safe correlation could be checked. A known
   // mismatch must remain an anomaly even when the anomaly tag was omitted.
   if(s.identity_confirmed==='NO')reportedTypes.add('ORDER_IDENTITY_MISMATCH');
   anomalies+=reportedTypes.size;observed+=s.orders_observed;
   const sampleComplete=s.orders_available>0&&
     s.orders_observed===Math.min(20,s.orders_available)&&
     s.consecutive_sample==='YES'&&s.identity_confirmed==='YES'&&
     s.stations_covered==='ALL_REQUIRED'&&
     s.content_compared==='YES'&&s.notes_compared==='YES'&&
     s.late_output_checked==='YES';
   const m=s.preparation_coverage;
   const mixComplete=m.single_station_orders>0&&m.multi_station_orders>0&&
     m.unknown_station_orders===0&&m.ambiguous_combined_double===false;
   const familiesComplete=FAMILIES.every(f=>m.families_observed.includes(f));
   if(!sampleComplete||!mixComplete||!familiesComplete)complete=false;
   if(!mixComplete)allMix=false;
   if(!familiesComplete)allFamilies=false;
  }
  const counts={reported_anomalies:anomalies,
    shifts_reported:seen.size,observed_orders:observed,
    sample_mix_complete_reported:seen.size===2&&days.size===1&&allMix,
    preparation_family_coverage_reported:seen.size===2&&days.size===1&&allFamilies};
  if(anomalies>0)
    return outcome('D2_ANOMALIA_RELATADA_REQUER_APURACAO',
      'AT_LEAST_ONE_REPORTED_ANOMALY_NOT_WORLD_ATTESTED',counts);
  // Both shifts must describe the same operational calendar day. Two
  // individually complete shifts from different days cannot prove a single
  // day's lunch+dinner paper coverage. Preserve D2 anomaly precedence above.
  if(seen.size===2&&days.size!==1)
    return outcome('D0_EVIDENCE_INSUFFICIENT',
      'CROSS_DAY_SHIFT_SAMPLES_NOT_ONE_OPERATIONAL_DAY',counts);
  if(seen.size!==2||!complete)
    return outcome('D0_EVIDENCE_INSUFFICIENT',
      'INCOMPLETE_OR_UNVERIFIED_SHIFT_SAMPLE',counts);
  return outcome('D1_SAMPLE_CONFORME_RELATADA_NAO_AUTENTICADA',
    'TWO_SELF_REPORTED_SAMPLES_NO_INDEPENDENT_PHYSICAL_PROOF',counts);
 }catch{return outcome('D0_EVIDENCE_INSUFFICIENT','REVIEW_EXCEPTION')}
}
module.exports={review,SCHEMA,ALLOWED_ANOMALIES,FAMILIES};
