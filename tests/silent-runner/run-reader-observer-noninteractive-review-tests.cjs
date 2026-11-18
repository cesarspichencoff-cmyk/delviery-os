'use strict';
// Windows Task Scheduler XML dry-run: FICTIONAL task, no registration or effects.
const assert=require('node:assert/strict');
const {review}=require('../../runtime/silent-runner/reader_observer_noninteractive_xml_review_v1.cjs');
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name)}
const original=`<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<RegistrationInfo><Description>FICTIONAL OBSERVER</Description></RegistrationInfo>
<Triggers><TimeTrigger><Repetition><Interval>PT2M</Interval></Repetition>
<StartBoundary>2026-11-05T10:00:00Z</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers>
<Principals><Principal id="Author"><UserId>FICTIONAL_USER</UserId>
<LogonType>InteractiveToken</LogonType>
<RunLevel>HighestAvailable</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
<Enabled>true</Enabled><Hidden>false</Hidden></Settings>
<Actions><Exec><Command>LAB_NODE_EXE</Command>
<Arguments>LAB_OBSERVER_FIXTURE</Arguments></Exec></Actions></Task>`;
const from='<LogonType>InteractiveToken</LogonType>';
const to='<LogonType>S4U</LogonType>';
const proposed=original.replace(from,to);
function blocked(r){
 assert.equal(r.state,'HOLD_FIELD_CHANGE');
 assert.equal(r.changesExecuted,0);assert.equal(r.ordersPublishable,0);
 assert.equal(r.taskRegistrationAuthorized,false);
 assert.equal(r.noWindowProvenOnCashier,false);
 assert.equal(r.sourceAclProven,false);
 assert.equal(r.batchLogonRightProven,false);
 assert.equal(r.diagnosticStatusParityProven,false);
 assert.equal(r.taskXmlExported,false);
 assert(!JSON.stringify(r).includes('FICTIONAL_USER'));
 assert(!JSON.stringify(r).includes('LAB_NODE_EXE'));
}
check('exact one-field substitution qualifies as review-only, not deploy',()=>{
 const r=review(original,proposed);
 assert.equal(r.onlyLogonTypeChange,true);
 assert.equal(r.reason,'ONLY_LOGON_TYPE_CHANGED_BUT_FIELD_GATES_PENDING');
 blocked(r);
});
check('unchanged interactive task is not mistakenly accepted',()=>{
 const r=review(original,original);assert.equal(r.onlyLogonTypeChange,false);blocked(r);
});
check('disabled task modification is rejected',()=>{
 const r=review(original,proposed.replace('<Enabled>true</Enabled>','<Enabled>false</Enabled>'));
 assert.equal(r.reason,'UNAUTHORIZED_XML_DIFFERENCE');blocked(r);
});
check('schedule modification is rejected',()=>{
 const r=review(original,proposed.replace('PT2M','PT3M'));
 assert.equal(r.reason,'UNAUTHORIZED_XML_DIFFERENCE');blocked(r);
});
check('account modification is rejected',()=>{
 const r=review(original,proposed.replace('FICTIONAL_USER','OTHER_USER'));
 assert.equal(r.reason,'UNAUTHORIZED_XML_DIFFERENCE');blocked(r);
});
check('runlevel modification is rejected',()=>{
 const r=review(original,proposed.replace('HighestAvailable','LeastPrivilege'));
 assert.equal(r.reason,'UNAUTHORIZED_XML_DIFFERENCE');blocked(r);
});
check('observer command modification is rejected',()=>{
 const r=review(original,proposed.replace('LAB_NODE_EXE','FAKE_OTHER_EXE'));
 assert.equal(r.reason,'UNAUTHORIZED_XML_DIFFERENCE');blocked(r);
});
check('original task with duplicate logon type refuses migration',()=>{
 const r=review(original+from,proposed);assert.equal(r.reason,'LOGON_TOKEN_NOT_UNIQUE');blocked(r);
});
check('already modified baseline cannot be silently reused',()=>{
 const r=review(proposed,proposed);assert.equal(r.reason,'LOGON_TOKEN_NOT_UNIQUE');blocked(r);
});
check('new task without exact two-minute repetition rejected',()=>{
 const r=review(original.replace('PT2M','PT30M'),proposed.replace('PT2M','PT30M'));
 assert.equal(r.reason,'BASELINE_CONTRACT_NOT_MATCHED');blocked(r);
});
check('unexpected XML whitespace differences rejected',()=>{
 const r=review(original,proposed.replace('<Hidden>false</Hidden>','<Hidden> false </Hidden>'));
 assert.equal(r.reason,'UNAUTHORIZED_XML_DIFFERENCE');blocked(r);
});
check('non-task strings rejected',()=>{
 for(const [a,b] of [[null,proposed],[original,null],['SECRET',proposed],['',proposed]]){
  const r=review(a,b);assert.equal(r.reason,'TASK_XML_INVALID');blocked(r);
 }
});
check('service accounts are never eligible for the S4U shortcut',()=>{
 for(const sid of ['S-1-5-18','S-1-5-19','S-1-5-20']){
  const baseline=original.replace('FICTIONAL_USER',sid);
  const candidate=baseline.replace(from,to);
  const r=review(baseline,candidate);
  assert.equal(r.reason,'BUILTIN_SERVICE_PRINCIPAL_NOT_ELIGIBLE_FOR_S4U');
  assert.equal(r.onlyLogonTypeChange,false);
  blocked(r);
  assert.equal(JSON.stringify(r).includes(sid),false);
 }
});
check('localized and English built-in service-account names also reject S4U',()=>{
 for(const principal of ['SYSTEM','SISTEMA','LocalSystem','NT AUTHORITY\\SYSTEM',
   'NT AUTHORITY\\LOCAL SERVICE','NT AUTHORITY\\NETWORK SERVICE','SERVIÇO LOCAL','Serviço de Rede']){
  const baseline=original.replace('FICTIONAL_USER',principal);
  const r=review(baseline,baseline.replace(from,to));
  assert.equal(r.reason,'BUILTIN_SERVICE_PRINCIPAL_NOT_ELIGIBLE_FOR_S4U');
  assert.equal(r.onlyLogonTypeChange,false);
  blocked(r);
  assert.equal(JSON.stringify(r).includes(principal),false);
 }
});
check('baseline without principal is blocked',()=>{
 const baseline=original.replace('<UserId>FICTIONAL_USER</UserId>','');
 const r=review(baseline,baseline.replace(from,to));
 assert.equal(r.reason,'TASK_PRINCIPAL_MISSING_OR_AMBIGUOUS');
 blocked(r);
});
check('ambiguous duplicate principal in baseline is blocked',()=>{
 const baseline=original.replace('<UserId>FICTIONAL_USER</UserId>',
  '<UserId>FICTIONAL_USER</UserId><UserId>OTHER_USER</UserId>');
 const r=review(baseline,baseline.replace(from,to));
 assert.equal(r.reason,'TASK_PRINCIPAL_MISSING_OR_AMBIGUOUS');
 blocked(r);
});
console.log('READER_OBSERVER_S4U_XML_REVIEW_PASS '+passed+'/'+passed+' SYNTHETIC_ONLY_NO_TASK_CHANGE');
