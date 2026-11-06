'use strict';
// Offline source-SHAPE contract, based on passive GetIn code review.
// Fictional LAB data only. Does NOT execute productive scripts or Playwright.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../../labs/getin-silent/getin-source-shape-contract.cjs');
let passed=0;
const check=(name,condition)=>{assert.ok(condition,name);passed++;};
const expected='2026-11-06';
const now='2026-11-05T23:55:03.604Z';
const finished='2026-11-05T23:50:25.122Z';
const fakeReport=()=>({
 date:expected,unit:'TATÁ Sushi Itaim',
 entries:[{name:'LAB_PERSON_A',people:2},{name:'LAB_PERSON_B',people:3}],
 totals:{reservations:2,people:5},turns:{Almoço:{reservations:1,people:2},Jantar:{reservations:1,people:3}}
});
const message='LAB_FICTITIOUS_RESERVATIONS 06/11/2026\nNO REAL CUSTOMER\n';
const child={status:'DETAIL_READ_VALIDATED',date:expected};
const collector=(other={})=>M.collect({
 expected,child,report:fakeReport(),message,finishedAt:finished,...other
});
const good=collector();
check('source collector accepts validated fictional payload',good.ok && good.receipt.status==='SUCCESS');
check('collector status mode anchored',good.receipt.mode==='WINDOWS_SCHEDULER');
check('collector fixed output filenames anchored',JSON.stringify(good.receipt.files)===JSON.stringify(['detail-latest.json','whatsapp-detailed.txt']));
check('collector hash is exact sha256',good.receipt.sha256===M.sha(message) && good.receipt.sha256.length===64);
check('collector counts preserved',good.receipt.people===5 && good.receipt.reservations===2);
check('collector date preserved',good.receipt.targetDate===expected);
check('invalid expected date rejected',!collector({expected:'2026-13-01'}).ok);
check('bad child status rejected',!collector({child:{...child,status:'RUNNING'}}).ok);
check('missing child rejected',!collector({child:null}).ok);
check('bad child date rejected',!collector({child:{...child,date:'2026-11-07'}}).ok);
check('report date drift rejected',!collector({report:{...fakeReport(),date:'2026-11-07'}}).ok);
check('different unit rejected',!collector({report:{...fakeReport(),unit:'LAB_OTHER'}}).ok);
check('message date missing rejected',!collector({message:'NO_DATE_LAB\n'}).ok);
check('report reservation count mismatch rejected',!collector({report:{...fakeReport(),totals:{reservations:3,people:5}}}).ok);
check('people-count reconciliation fails closed',!collector({report:{...fakeReport(),totals:{reservations:2,people:4}}}).ok);
check('negative people fails closed',!collector({report:{...fakeReport(),entries:[{people:-1},{people:6}]}}).ok);
check('invalid timestamp fails closed',!collector({finishedAt:'INVALID_DATE'}).ok);
const render=(over={})=>M.visual({status:good.receipt,report:fakeReport(),message,now,...over});
const validated=render();
check('visual accepts same-day validated source',validated.ok && validated.receipt.sourceHashMatched===true);
check('visual never claims image actually rendered',validated.receipt.pngActuallyRendered===false);
check('visual never promotes orders',validated.receipt.ordersPublishable===0);
check('visual declares mirror only',validated.receipt.source==='SOURCE_SHAPE_MIRROR_ONLY');
check('visual status not SUCCESS rejected',!render({status:{...good.receipt,status:'RUNNING'}}).ok);
check('visual mismatched targetDate rejected',!render({status:{...good.receipt,targetDate:'2026-11-07'}}).ok);
check('visual tampered SHA rejected',!render({status:{...good.receipt,sha256:'0'.repeat(64)}}).ok);
check('visual malformed SHA rejected',!render({status:{...good.receipt,sha256:'invalid'}}).ok);
check('visual tampered message rejected',!render({message:message+'tampered'}).ok);
check('visual expired finishedAt day rejected',!render({now:'2026-11-07T02:00:00.000Z'}).ok);
check('visual bad date rejected',!render({now:'NOT_A_DATE'}).ok);
check('visual people-sum discrepancy rejected',!render({report:{...fakeReport(),totals:{reservations:2,people:99}}}).ok);
check('visual entries length mismatch rejected',!render({report:{...fakeReport(),entries:[]}}).ok);
check('visual no source rejected',!render({status:null}).ok);
check('Brazilian day boundary before midnight',M.brDate('2026-11-06T02:59:59Z')==='2026-11-05');
check('Brazilian day boundary after midnight',M.brDate('2026-11-06T03:00:00Z')==='2026-11-06');
check('HTML injection escaped',M.escapeHtml('<img src="x" onerror=\'run()\'>')==='&lt;img src=&quot;x&quot; onerror=&#39;run()&#39;&gt;');
check('lock absent acquires exclusively',M.lockDecision({exists:false})==='ACQUIRE_EXCLUSIVE');
check('recent lock blocks duplicate',M.lockDecision({exists:true,ageMs:40_000})==='HOLD_ALREADY_RUNNING');
check('unknown lock age blocks',M.lockDecision({exists:true,ageMs:NaN})==='HOLD_AGE_UNKNOWN');
check('stale lock demands review, not silent removal',M.lockDecision({exists:true,ageMs:26*60_000})==='REVIEW_STALE_LOCK');
const source=fs.readFileSync(path.join(__dirname,'../../labs/getin-silent/getin-source-shape-contract.cjs'),'utf8');
check('mirror uses no fs/network/browser',!/require\(['"](?:node:)?(?:fs|http|https|child_process|playwright)/.test(source));
check('mirror cannot be misrepresented as field proof',source.includes('SOURCE_SHAPE_MIRROR_ONLY') && source.includes('pngActuallyRendered:false'));
const launcher=fs.readFileSync(path.join(__dirname,'../../labs/getin-silent/LabGuiLauncher.cs'),'utf8');
check('native lab launcher blocked on cashier',launcher.includes('Environment.MachineName,"CAIXA_MOOCA"'));
check('lab launcher requires GitHub runner',launcher.includes('GITHUB_ACTIONS') && launcher.includes('GITHUB_REPOSITORY'));
console.log('GETIN_SOURCE_SHAPE_OFFLINE_CONTRACT_PASS '+passed+'/'+passed+' FICTIONAL_ONLY NO_LIVE_SOURCE NO_PII');
