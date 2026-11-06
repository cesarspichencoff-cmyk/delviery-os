'use strict';
const assert=require('node:assert/strict');
const {SCHEMA,PRODUCTION_SCHEMA,review}=
 require('./comandas_native_conference_paper_census_review_v1.cjs');
const {review:oldReview}=
 require('./comandas_passive_paper_census_review_only.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const shift=window=>({window,day:'2026-11-06',orders_available:25,
 orders_observed:20,consecutive_sample:'YES',identity_confirmed:'YES',
 stations_covered:'ALL_REQUIRED',content_compared:'YES',
 notes_compared:'YES',late_output_checked:'YES',anomalies:[],
 preparation_coverage:{single_station_orders:12,multi_station_orders:8,
  unknown_station_orders:0,families_observed:['SUSHI_1','SUSHI_2','HOT_ROLL','KITCHEN'],
  ambiguous_combined_double:false}});
const conf=window=>({window,day:'2026-11-06',paper_seen:'YES',reported_origin:'TEKNISA_NATIVE_REPORTED',
 paper_kind:'CONFERENCE_NONFISCAL_REPORTED',
 caixa_watched_whole_sample:'YES',order_link_confirmed:'YES',
 orders_matched:20,items_quantities_match:'YES',notes_match:'YES',
 one_paper_per_order:'YES',late_output_checked:'YES',
 additional_tata_paper_seen:'NO'});
const sample=()=>({schema:PRODUCTION_SCHEMA,shifts:[shift('ALMOCO'),shift('JANTAR')]});
const baseline=()=>({schema:SCHEMA,production_sample:sample(),
 conference_observations:[conf('ALMOCO'),conf('JANTAR')]});
const D0='D0_EVIDENCE_INSUFFICIENT';
const D1='D1_NATIVE_CONFERENCE_SAMPLE_REPORTED_NOT_AUTHENTICATED';
const D2='D2_CONFERENCE_OR_PRODUCTION_ANOMALY_REPORTED';
let cases=0;
function test(name,fn){fn();cases++;console.log('PASS '+cases+' '+name);}
function check(x,expected,reason){
 const o=review(x);
 assert.equal(o.schema,SCHEMA);
 assert.equal(o.classification,expected);
 if(reason)assert.equal(o.reason,reason);
 assert.equal(o.review_status,'HOLD');
 assert.equal(o.source,'AGGREGATED_HUMAN_REPORT_ONLY');
 for(const key of ['native_conference_paper_world_proven',
  'all_native_paper_sources_authenticated',
  'per_order_timing_and_uniqueness_world_proven',
  'complete_native_revision_semantics_proven',
  'independent_ifood_identity_proven',
  'conference_native_sufficiency_operationally_accepted',
  'tata_conference_print_authorized','production_print_change_authorized'])
  assert.equal(o[key],false,key);
 assert.equal(o.current_action,'PRESERVE_EXISTING_NATIVE_OUTPUT_NO_EXTRA_TATA_PAPER');
 assert.ok(Object.values(o.permitted_effects).every(v=>v===false));
 assert.ok(!JSON.stringify(o).includes('CUSTOMER_SECRET'));
 return o;
}
test('old production census may D1 without any separate conference evidence',()=>{
 assert.equal(oldReview(sample()).classification,
  'D1_SAMPLE_CONFORME_RELATADA_NAO_AUTENTICADA');
 check({schema:SCHEMA,production_sample:sample(),conference_observations:[]},D0);
});
test('fully claimed paper observation still is D1 self reported only',()=>{
 const o=check(baseline(),D1);
 assert.equal(o.conference_shifts_reported,2);
 assert.equal(o.conference_orders_visually_matched_reported,40);
 assert.equal(o.native_conference_paper_world_proven,false);
});
test('one conference shift insufficient',()=>{
 const x=baseline();x.conference_observations.pop();check(x,D0);
});
test('paper explicitly missing is anomalous',()=>{
 const x=baseline();x.conference_observations[0].paper_seen='NO';check(x,D2);
});
test('fiscal paper is not conference paper',()=>{
 const x=baseline();x.conference_observations[0].paper_kind='FISCAL_ONLY_REPORTED';check(x,D2);
});
test('other source instead of reported native Teknisa is D2',()=>{
 const x=baseline();x.conference_observations[0].reported_origin='OTHER_REPORTED';check(x,D2);
});
test('unknown source does not prove native Teknisa',()=>{
 const x=baseline();x.conference_observations[0].reported_origin='UNKNOWN';check(x,D0);
});
test('items or quantities mismatch is D2',()=>{
 const x=baseline();x.conference_observations[0].items_quantities_match='NO';check(x,D2);
});
test('note omission report is D2',()=>{
 const x=baseline();x.conference_observations[0].notes_match='NO';check(x,D2);
});
test('duplicate or missing native conference way is D2',()=>{
 const x=baseline();x.conference_observations[0].one_paper_per_order='NO';check(x,D2);
});
test('additional TATA print reported is duplication risk',()=>{
 const x=baseline();x.conference_observations[0].additional_tata_paper_seen='YES';check(x,D2);
});
test('CAIXA coverage not witnessed remains D0',()=>{
 const x=baseline();x.conference_observations[1].caixa_watched_whole_sample='NO';check(x,D0);
});
test('unconfirmed order to conference paper linkage is D0',()=>{
 const x=baseline();x.conference_observations[0].order_link_confirmed='UNKNOWN';check(x,D0);
});
test('19 of 20 visually matched remains insufficient',()=>{
 const x=baseline();x.conference_observations[0].orders_matched=19;check(x,D0);
});
test('note comparison unknown remains D0',()=>{
 const x=baseline();x.conference_observations[0].notes_match='UNKNOWN';check(x,D0);
});
test('late output not watched remains D0',()=>{
 const x=baseline();x.conference_observations[0].late_output_checked='NO';check(x,D0);
});
test('duplicate conference shift cannot cover both shifts',()=>{
 const x=baseline();x.conference_observations[1].window='ALMOCO';check(x,D0);
});
test('PII injected into conference report rejected',()=>{
 const x=baseline();x.conference_observations[0].customer_name='CUSTOMER_SECRET';
 check(x,D0,'CONFERENCE_REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('raw native order identifier rejected',()=>{
 const x=baseline();x.conference_observations[0].NRCOMANDA='12345';
 check(x,D0,'CONFERENCE_REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('production anomaly outranks good conference report',()=>{
 const x=baseline();x.production_sample.shifts[1].anomalies=['WRONG_STATION'];check(x,D2);
});
test('production D0 cannot become conference D1',()=>{
 const x=baseline();x.production_sample.shifts[0].stations_covered='PARTIAL';check(x,D0);
});
test('production invalid shape cannot become D1',()=>{
 const x=baseline();x.production_sample.shifts[0].customer_name='CUSTOMER_SECRET';
 check(x,D0,'PRODUCTION_REPORT_INVALID');
});
test('production no reported shifts cannot become D1',()=>{
 const x=baseline();x.production_sample.shifts=[];check(x,D0);
});
test('future authorization field is rejected',()=>{
 const x=baseline();x.print_authorized=true;check(x,D0,'INVALID_ENVELOPE');
});
test('self asserted finality is rejected as extra field',()=>{
 const x=baseline();x.conference_observations[0].native_finality_proven=true;
 check(x,D0,'CONFERENCE_REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('over 20 conference orders is invalid',()=>{
 const x=baseline();x.conference_observations[0].orders_matched=21;check(x,D0);
});
test('unknown paper kind not native conference sufficiency',()=>{
 const x=baseline();x.conference_observations[0].paper_kind='UNKNOWN';check(x,D0);
});
test('production anomaly still D2 if conference incomplete',()=>{
 const x=baseline();x.production_sample.shifts[0].anomalies=['NOTE_OMITTED'];
 x.conference_observations[1].caixa_watched_whole_sample='UNKNOWN';
 check(x,D2);
});
test('native paper anomaly D2 even when production sample is D0',()=>{
 const x=baseline();x.production_sample.shifts[1].stations_covered='PARTIAL';
 x.conference_observations[0].paper_seen='NO';check(x,D2);
});
test('malformed conference flag rejected',()=>{
 const x=baseline();x.conference_observations[0].one_paper_per_order='PROVEN';
 check(x,D0,'CONFERENCE_REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('malformed source schema rejected',()=>{
 const x=baseline();x.schema='legacy-source';check(x,D0);
});
test('missing root fields rejected',()=>{
 const x=baseline();delete x.conference_observations;check(x,D0);
});
test('conference paper cannot be matched to another day with same shift',()=>{
 const x=baseline();x.conference_observations[0].day='2026-11-05';
 check(x,D0,'CONFERENCE_SHIFT_DATE_NOT_BOUND_TO_PRODUCTION');
});
test('invalid conference calendar day is rejected',()=>{
 const x=baseline();x.conference_observations[0].day='2026-02-30';
 check(x,D0,'CONFERENCE_REPORT_SHAPE_OR_PRIVACY_INVALID');
});
if(cases!==34)throw Error('CONFERENCE_CENSUS_CASE_COUNT_'+cases);
console.log('COMANDAS_NATIVE_CONFERENCE_CENSUS='+cases+'/'+cases+
 ' HUMAN_REPORT_ONLY NO_PAPER_IO NO_FIELD_PROOF PRINT_HOLD');
