'use strict';
const assert=require('node:assert/strict');
const {inspect,isDay,isLocal}=require('./comandas_shift_state_v811_offline.cjs');
let checks=0;
function eq(actual,expected){assert.deepEqual(actual,expected);checks++;}
const current={schema:'deliveryos.production-service-shift-state.v2',store_id:'0001',
 operational_date:'2026-10-14',service:'LUNCH',valid_from_local:'2026-10-14T11:00:00',
 valid_until_local:'2026-10-14T15:00:00',evidence:'HUMAN_CONFIRMED_RULE'};
const proposed={store_id:'0001',operational_date:'2026-10-16',service:'LUNCH',
 valid_from_local:'2026-10-16T11:00:00',valid_until_local:'2026-10-16T15:00:00'};
const passed=inspect(current,proposed);
eq(passed.status,'REVIEW_ONLY_AUTHORIZATION_REQUIRED');
eq(passed.valid_window,true);
eq(passed.review_projection.valid_from_local,proposed.valid_from_local);
eq(passed.review_projection.valid_until_local,proposed.valid_until_local);
eq(passed.review_projection.evidence,'NOT_AUTHENTICATED_DRAFT');
eq(passed.review_projection.source_ref,null);
eq(passed.independent_approval_authenticated,false);
eq(passed.operational_activation_allowed,false);
eq(passed.installed_updater_safe_to_run,false);
eq(passed.effects.state_write,false);
eq(passed.effects.history_append,false);
eq(passed.effects.printer,false);
eq(passed.effects.sql,false);
eq(inspect(current,{...proposed,source_ref:'human-approved'}).status,'HOLD');
eq(inspect(current,{...proposed,authorized:true}).status,'HOLD');
eq(inspect(current,{...proposed,write:true}).status,'HOLD');
eq(inspect(current,{...proposed,valid_from_local:undefined}).status,'HOLD');
eq(inspect(current,{...proposed,valid_until_local:null}).status,'HOLD');
eq(inspect(current,{...proposed,valid_from_local:'2026-10-16T15:00:00'}).status,'HOLD');
eq(inspect(current,{...proposed,valid_from_local:'2026-10-16T16:00:00'}).status,'HOLD');
eq(inspect(current,{...proposed,valid_until_local:'2026-10-17T01:00:00'}).status,'HOLD');
eq(inspect(current,{...proposed,operational_date:'2026-10-17'}).status,'HOLD');
eq(inspect(current,{...proposed,service:'BREAKFAST'}).status,'HOLD');
eq(inspect(current,{...proposed,store_id:'0002'}).status,'HOLD');
eq(inspect({...current,schema:'legacy'},proposed).status,'HOLD');
eq(inspect(null,proposed).status,'HOLD');
eq(inspect(current,null).status,'HOLD');
eq(inspect(current,[]).status,'HOLD');
eq(isDay('2026-02-29'),false);
eq(isDay('2024-02-29'),true);
eq(isLocal('2026-10-16T24:00:00'),false);
eq(isLocal('2026-10-16T12:60:00'),false);
eq(isLocal('2026-10-16T12:00:60'),false);
eq(isLocal('2026-10-16T12:00:00Z'),false);
eq(isLocal('2026-10-16T12:00:00-03:00'),false);
eq(inspect(current,{...proposed,valid_from_local:'2026-10-16T09:00:00',valid_until_local:'2026-10-16T10:00:00'}).valid_window,true);
const freeze=Object.freeze({...proposed});
inspect(current,freeze);eq(freeze,proposed);
console.log(JSON.stringify({schema:'deliveryos.comandas-shift-window-v811-offline.test',
 status:'PASS',checks,synthetic_only:true,sql_executed:false,operational_effects:false,
 human_authorization_granted:false,writer_installed:false}));
