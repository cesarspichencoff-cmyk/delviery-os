'use strict';
const assert=require('node:assert/strict');
const {SCHEMA,plan}=require('../../runtime/reporting/gestor_shadow_plan_v1.cjs');
const T='2026-11-03T15:30:00Z',H='a'.repeat(64),G='b'.repeat(64);
const sample=()=>({schema:SCHEMA,host:'CAIXA_MOOCA',unit:'ITAIM',now:T,
privateKey:'f'.repeat(64),gestor:{capturedAt:T,origin:'GESTOR_WEB_SHADOW',
coverage:'VISIBLE_ONLY',merchantVerified:false,cards:[{shortId:'1234',state:'CONCLUDED',revisionHash:H},
{shortId:'5678',state:'PREPARING',revisionHash:H}]},
reader:{capturedAt:T,origin:'TEKNISA_READER_SHADOW',sourceProven:false,
revisions:[{shortId:'1234',nativeKey:'0001|01|123|33',revisionHash:G,
origin:'DLV_IFO',itemLines:2}]},
separateSession:false,operatorActive:true,navigationEffectProven:false});
let n=0;const check=(name,ok)=>{assert.ok(ok,name);n++};
const b=plan(sample());
check('shadow only',b.gate==='SHADOW_ONLY');
check('visible only',b.cardsVisible===2&&b.coverage==='VISIBLE_ONLY');
check('candidate not join',b.matchedClaims===1&&!b.readerJoinProven);
check('navigation prohibited',!b.navigationAuthorized&&b.detailsPerCycleCap===0);
check('no raw IDs',!JSON.stringify(b).includes('1234'));
check('no outbound effects',b.personalFieldsExported===0&&b.noExternalEffects);
const c=sample();c.gestor.cards.push({...c.gestor.cards[0]});
check('duplicate quarantine',plan(c).collisionCount===1);
const x=sample();x.unit='OTHER';check('wrong unit held',plan(x).gate==='HOLD');
const stale=sample();stale.reader.capturedAt='2026-11-03T14:30:00Z';
check('stale Reader held',plan(stale).reason==='SOURCE_STALE');
const altered=sample();altered.gestor.cards[0].unexpected='x';
check('unapproved field refused',plan(altered).reason==='CARD_SCHEMA_INVALID');
const nav=sample();nav.separateSession=true;nav.operatorActive=false;
nav.navigationEffectProven=true;nav.gestor.merchantVerified=true;
check('self-claim never authorizes navigation',plan(nav).navigationAuthorized===false);
const cat=sample();cat.catalog={source:'TOQAN_AGGREGATE',pausedCount:12,sourceVerified:true};
check('aggregate does not certify catalog',plan(cat).pausedCatalogProven===false);
const invalidDay=sample();invalidDay.now='2026-03-03T15:30:00Z';invalidDay.gestor.capturedAt='2026-02-31T15:30:00Z';invalidDay.reader.capturedAt=invalidDay.now;
check('impossible February date refused',plan(invalidDay).reason==='SOURCE_STALE');
console.log('GESTOR_SHADOW_PLAN_TEST_PASS '+n+'/'+n);
