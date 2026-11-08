'use strict';
const assert=require('node:assert/strict');
const {review,SCHEMA}=require('./comandas_passive_paper_census_review_only.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const one=window=>({window,day:'2026-11-04',orders_available:25,
 orders_observed:20,consecutive_sample:'YES',
 identity_confirmed:'YES',stations_covered:'ALL_REQUIRED',
 content_compared:'YES',notes_compared:'YES',
 late_output_checked:'YES',anomalies:[],
 preparation_coverage:{
  single_station_orders:12,multi_station_orders:8,unknown_station_orders:0,
  families_observed:['SUSHI_1','SUSHI_2','HOT_ROLL','KITCHEN'],
  ambiguous_combined_double:false
 }});
const baseline=()=>({schema:SCHEMA,shifts:[one('ALMOCO'),one('JANTAR')]});
const D0='D0_EVIDENCE_INSUFFICIENT';
const D1='D1_SAMPLE_CONFORME_RELATADA_NAO_AUTENTICADA';
const D2='D2_ANOMALIA_RELATADA_REQUER_APURACAO';
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name)}
function check(x,expected,reason){
 const r=review(x);
 assert.equal(r.classification,expected);
 if(reason)assert.equal(r.reason,reason);
 assert.equal(r.review_status,'HOLD');
 assert.equal(r.sample_provenance,'UNATTESTED_HUMAN_REPORT');
 for(const f of ['native_paper_sample_proven',
  'complete_station_coverage_world_proven',
  'source_join_world_proven',
  'universal_absence_of_duplicates_proven',
  'origin_ifood_independent_proven',
  'native_revision_complete_proven',
  'reader_sql_plan_proven',
  'conference_print_authorized',
  'production_change_authorized'])
  assert.equal(r[f],false,f);
 assert.ok(Object.values(r.effect_permissions).every(v=>v===false));
 return r;
}
test('no paper observations remain D0',()=>{
 const x=baseline();x.shifts=[];check(x,D0,'NO_FIELD_OBSERVATION');
});
test('only lunch cannot prove both shift samples',()=>{
 const x=baseline();x.shifts.pop();check(x,D0);
});
test('only dinner cannot prove lunch',()=>{
 const x=baseline();x.shifts.shift();check(x,D0);
});
test('two explicitly reported complete samples get only provisional D1',()=>{
 const r=check(baseline(),D1);
 assert.equal(r.shifts_reported,2);assert.equal(r.observed_orders,40);
 assert.equal(r.native_paper_sample_proven,false);
});
test('sample fewer than twenty when shift had more is incomplete',()=>{
 const x=baseline();x.shifts[0].orders_observed=19;check(x,D0);
});
test('shift with 12 available and all 12 observed is eligible only for provisional D1',()=>{
 const x=baseline();x.shifts[0].orders_available=12;
 x.shifts[0].orders_observed=12;
 x.shifts[0].preparation_coverage.single_station_orders=7;
 x.shifts[0].preparation_coverage.multi_station_orders=5;
 assert.equal(check(x,D1).observed_orders,32);
});
test('a shift with zero reported orders cannot prove the paper route',()=>{
 const x=baseline();x.shifts[0].orders_available=0;
 x.shifts[0].orders_observed=0;check(x,D0);
});
test('consecutive sample must be witnessed, not inferred',()=>{
 const x=baseline();x.shifts[0].consecutive_sample='UNKNOWN';check(x,D0);
});
test('sampling selected successful orders is insufficient',()=>{
 const x=baseline();x.shifts[1].consecutive_sample='NO';check(x,D0);
});
test('unknown paper order identity stays D0',()=>{
 const x=baseline();x.shifts[1].identity_confirmed='UNKNOWN';check(x,D0);
});
test('all stations must be witnessed for observed paper sample',()=>{
 const x=baseline();x.shifts[0].stations_covered='PARTIAL';check(x,D0);
});
test('absence of station observer never becomes zero duplicates',()=>{
 const x=baseline();x.shifts[0].stations_covered='UNKNOWN';check(x,D0);
});
test('unverified item quantities or contents do not become conforming',()=>{
 const x=baseline();x.shifts[0].content_compared='UNKNOWN';check(x,D0);
});
test('missing note verification does not become conforming',()=>{
 const x=baseline();x.shifts[0].notes_compared='UNKNOWN';check(x,D0);
});
test('late outputs not watched cannot prove no late output',()=>{
 const x=baseline();x.shifts[0].late_output_checked='UNKNOWN';check(x,D0);
});
test('missing paper report immediately branches to D2 despite incomplete dinner',()=>{
 const x=baseline();x.shifts[0].anomalies=['MISSING_PAPER'];
 x.shifts[1].stations_covered='PARTIAL';
 const r=check(x,D2);assert.equal(r.reported_anomalies,1);
});
test('duplicated paper is an anomaly even with good remaining counts',()=>{
 const x=baseline();x.shifts[1].anomalies=['DUPLICATE'];
 check(x,D2);
});
test('unexpected Gestor or GP paper is an anomaly, not automatically a native way',()=>{
 const x=baseline();x.shifts[0].anomalies=['UNEXPECTED_GP_GESTOR'];check(x,D2);
});
test('wrong station is D2',()=>{
 const x=baseline();x.shifts[1].anomalies=['WRONG_STATION'];check(x,D2);
});
test('unreadable printed content is D2',()=>{
 const x=baseline();x.shifts[1].anomalies=['UNREADABLE'];check(x,D2);
});
test('explicit item mismatch NO is D2 even with empty anomaly list',()=>{
 const x=baseline();x.shifts[0].content_compared='NO';check(x,D2);
});
test('explicit omitted notes NO is D2',()=>{
 const x=baseline();x.shifts[0].notes_compared='NO';check(x,D2);
});
test('two anomalies count as two reports but no physical proof',()=>{
 const x=baseline();x.shifts[1].anomalies=['LATE_PAPER','UNKNOWN_ORIGIN'];
 assert.equal(check(x,D2).reported_anomalies,2);
});
test('both windows must be distinct',()=>{
 const x=baseline();x.shifts[1].window='ALMOCO';
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('per-order identifiers are forbidden from aggregate report',()=>{
 const x=baseline();x.shifts[0].native_order_id='9092';
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('name and address cannot enter shift record',()=>{
 const x=baseline();x.shifts[0].customer_name='PERSON';
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('raw observation content cannot be submitted',()=>{
 const x=baseline();x.shifts[0].notes_text='SEM CEBOLA';
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('fax or fiscal records do not count as valid anomaly types',()=>{
 const x=baseline();x.shifts[0].anomalies=['CPF'];
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('future unknown classification is not silently accepted',()=>{
 const x=baseline();x.shifts[1].stations_covered='CONFERENCIA_ONLY';
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('more observations than availability cannot be self attested',()=>{
 const x=baseline();x.shifts[1].orders_available=8;
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('more than 20 observed is not the pre-approved sample',()=>{
 const x=baseline();x.shifts[1].orders_observed=21;
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('duplicate anomaly tags do not double count',()=>{
 const x=baseline();x.shifts[1].anomalies=['DUPLICATE','DUPLICATE'];
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('new permission fields rejected at root',()=>{
 const x=baseline();x.production_authorized=true;
 check(x,D0,'INVALID_INPUT');
});
test('wrong unit schema rejected',()=>{
 const x=baseline();x.schema='unit-pinheiros';
 check(x,D0,'INVALID_INPUT');
});
test('absence of a date is incomplete',()=>{
 const x=baseline();x.shifts[1].day='';
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('one source category absent cannot be inferred as covered',()=>{
 const x=baseline();x.shifts[1].stations_covered='PARTIAL';
 const r=check(x,D0);assert.equal(r.complete_station_coverage_world_proven,false);
});
test('invalid calendar date cannot be treated as a witnessed shift',()=>{
 const x=baseline();x.shifts[0].day='2026-02-30';
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('two shifts with only single-station orders cannot prove multi-station routes',()=>{
 const x=baseline();for(const s of x.shifts){
 s.preparation_coverage.single_station_orders=20;
 s.preparation_coverage.multi_station_orders=0;
 }
 check(x,D0,'INCOMPLETE_OR_UNVERIFIED_SHIFT_SAMPLE');
});
test('two shifts with only multi-station orders cannot prove simple routes',()=>{
 const x=baseline();for(const s of x.shifts){
 s.preparation_coverage.single_station_orders=0;
 s.preparation_coverage.multi_station_orders=20;
 }
 check(x,D0,'INCOMPLETE_OR_UNVERIFIED_SHIFT_SAMPLE');
});
test('unknown native station mapping must keep D0',()=>{
 const x=baseline();x.shifts[0].preparation_coverage.unknown_station_orders=1;
 x.shifts[0].preparation_coverage.single_station_orders=11;
 check(x,D0);
});
test('missing HOT_ROLL coverage cannot prove full station routing',()=>{
 const x=baseline();x.shifts[1].preparation_coverage.families_observed=
 ['SUSHI_1','SUSHI_2','KITCHEN'];check(x,D0);
});
test('missing KITCHEN coverage cannot prove routing to kitchen',()=>{
 const x=baseline();x.shifts[0].preparation_coverage.families_observed=
 ['SUSHI_1','SUSHI_2','HOT_ROLL'];check(x,D0);
});
test('one shift missing any family prevents whole-day D1',()=>{
 const x=baseline();x.shifts[1].preparation_coverage.families_observed=
 ['SUSHI_1'];const r=check(x,D0);
 assert.equal(r.preparation_family_coverage_reported,false);
});
test('unverified combined double exception cannot yield D1',()=>{
 const x=baseline();x.shifts[0].preparation_coverage.ambiguous_combined_double=true;
 check(x,D0);
});
test('invalid preparation category never becomes silently accepted',()=>{
 const x=baseline();x.shifts[0].preparation_coverage.families_observed.push('FISCAL');
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('repeated family cannot double count',()=>{
 const x=baseline();x.shifts[1].preparation_coverage.families_observed=
 ['SUSHI_1','SUSHI_1'];check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('reported station mix cannot exceed observed order count',()=>{
 const x=baseline();x.shifts[0].preparation_coverage.multi_station_orders=20;
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('negative count of multi-station sample is invalid',()=>{
 const x=baseline();x.shifts[1].preparation_coverage.multi_station_orders=-1;
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('old input v1 schema cannot bypass added category and mix checks',()=>{
 const x=baseline();x.schema='tata.comandas.paper-census-sample-offline.v1';
 check(x,D0,'INVALID_INPUT');
});
test('missing per-shift preparation coverage cannot silently promote D1',()=>{
 const x=baseline();delete x.shifts[0].preparation_coverage;
 check(x,D0,'REPORT_SHAPE_OR_PRIVACY_INVALID');
});
test('anomaly outranks missing multi-station samples',()=>{
 const x=baseline();x.shifts[0].anomalies=['DUPLICATE'];
 x.shifts[1].preparation_coverage.multi_station_orders=0;
 x.shifts[1].preparation_coverage.single_station_orders=20;
 check(x,D2);
});
test('nominal D1 is still self reported even with complete four-family sample',()=>{
 const r=check(baseline(),D1);
 assert.equal(r.sample_mix_complete_reported,true);
 assert.equal(r.preparation_family_coverage_reported,true);
 assert.equal(r.native_paper_sample_proven,false);
});
test('both item and note mismatch NO count as two distinct reported categories',()=>{
 const x=baseline();x.shifts[0].content_compared='NO';x.shifts[0].notes_compared='NO';
 assert.equal(check(x,D2).reported_anomalies,2);
});
test('explicit mismatch tag and matching NO count as one category',()=>{
 const x=baseline();x.shifts[0].content_compared='NO';
 x.shifts[0].anomalies=['CONTENT_MISMATCH'];
 assert.equal(check(x,D2).reported_anomalies,1);
});
test('two mismatch tags with matching NO flags count as two categories',()=>{
 const x=baseline();x.shifts[0].content_compared='NO';
 x.shifts[0].notes_compared='NO';
 x.shifts[0].anomalies=['CONTENT_MISMATCH','NOTE_OMITTED'];
 assert.equal(check(x,D2).reported_anomalies,2);
});
test('same anomaly type reported in each distinct shift counts once per shift',()=>{
 const x=baseline();x.shifts[0].anomalies=['DUPLICATE'];
 x.shifts[1].anomalies=['DUPLICATE'];
 assert.equal(check(x,D2).reported_anomalies,2);
});
test('published field grid has all nine columns for every observed-order alias',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const markdown=fs.readFileSync(path.join(__dirname,'..','docs','comandas',
  'FICHA_CAMPO_CENSO_PAPEL_ITAIM_ALMOCO_JANTAR_20261108.md'),'utf8');
 const lines=markdown.split(String.fromCharCode(10));
 const header=lines.find(x=>x.startsWith('| Nº |'));
 const table=lines.filter(x=>x.startsWith('| ')&&
   /^[0-9]{2}$/.test((x.split('|')[1]||'').trim()));
 assert.ok(header,'missing field header');
 assert.equal(header.split('|').length-2,9);
 assert.equal(header.split('|').at(-2).trim(),'Cobertura');
 assert.equal(table.length,20);
 for(let i=0;i<table.length;i++){
  assert.equal(table[i].split('|').length-2,9,'field row '+(i+1));
  assert.equal(table[i].split('|')[1].trim(),String(i+1).padStart(2,'0'));
 }
});
if(passed!==57)throw Error('CENSUS_REVIEW_CASE_COUNT_'+passed);
console.log('COMANDAS_PASSIVE_PAPER_CENSUS_REVIEW_PASS '+passed+'/'+passed+
 ' HUMAN_REPORT_UNATTESTED_NO_REAL_PAPER_NO_PRINT');
