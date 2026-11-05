'use strict';
// Review-only in-memory diff, NEVER register/execute/change a Windows task.
// No fs/process/shell. Refuses anything besides ONE LogonType substitution.
const RESULT_SCHEMA='deliveryos.reader-observer-noninteractive-xml-review.v1';
const FROM='<LogonType>InteractiveToken</LogonType>';
const TO='<LogonType>S4U</LogonType>';
const safeStatus=(reason,onlyLogonTypeChange=false)=>Object.freeze({
 schema:RESULT_SCHEMA,mode:'REVIEW_ONLY',state:'HOLD_FIELD_CHANGE',
 reason,onlyLogonTypeChange,taskRegistrationAuthorized:false,
 noWindowProvenOnCashier:false,sourceAclProven:false,
 batchLogonRightProven:false,diagnosticStatusParityProven:false,
 networkUnavailableWithS4U:true,ordersPublishable:0,
 changesExecuted:0,taskXmlExported:false
});
const count=(s,x)=>s.split(x).length-1;
function review(original,proposed){
 try {
  if(typeof original!=='string'||typeof proposed!=='string'||
     original.length<250||original.length>32768||
     proposed.length<250||proposed.length>32768||
     !original.includes('<Task ')||!original.includes('</Task>')||
     !proposed.includes('<Task ')||!proposed.includes('</Task>'))
   return safeStatus('TASK_XML_INVALID');
  if(count(original,FROM)!==1||count(original,TO)!==0||
     count(proposed,TO)!==1||count(proposed,FROM)!==0)
   return safeStatus('LOGON_TOKEN_NOT_UNIQUE');
  const required=[
   '<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
   '<RunLevel>HighestAvailable</RunLevel>',
   '<Interval>PT2M</Interval>',
   '<LogonType>InteractiveToken</LogonType>'
  ];
  if(required.some(tag=>!original.includes(tag))||
     count(original,'<Enabled>true</Enabled>')<1||
     !/<Command>[^<]+<\/Command>/.test(original))
   return safeStatus('BASELINE_CONTRACT_NOT_MATCHED');
  // A one-field S4U change is categorically WRONG for Windows built-in
  // service principals (SYSTEM/LocalService/NetworkService). Task Scheduler
  // provides ServiceAccount logon for those identities. Reject the real
  // CAIXA_MOOCA task XML until the installed-vs-receipt principal is reconciled.
  const userMatches=[...original.matchAll(/<UserId>([^<]*)<\/UserId>/g)];
  if(userMatches.length!==1 || !userMatches[0][1].trim())
   return safeStatus('TASK_PRINCIPAL_MISSING_OR_AMBIGUOUS');
  // Normalize locale-dependent names in receipts/XML: SISTEMA and S-1-5-18
  // refer to the same built-in account. A service principal is never S4U.
  const principal=userMatches[0][1].trim().normalize('NFKC').replace(/\s+/g,' ').toUpperCase();
  const serviceSid=/^S-1-5-(?:18|19|20)$/.test(principal);
  const serviceName=/^(?:(?:NT AUTHORITY|AUTORIDADE NT)\\)?(?:SYSTEM|SISTEMA|LOCALSYSTEM|LOCAL SYSTEM|LOCALSERVICE|LOCAL SERVICE|NETWORKSERVICE|NETWORK SERVICE|SERVIÇO LOCAL|SERVICO LOCAL|SERVIÇO DE REDE|SERVICO DE REDE)$/.test(principal);
  if(serviceSid||serviceName)
   return safeStatus('BUILTIN_SERVICE_PRINCIPAL_NOT_ELIGIBLE_FOR_S4U');
  if(proposed!==original.replace(FROM,TO))
   return safeStatus('UNAUTHORIZED_XML_DIFFERENCE');
  return safeStatus('ONLY_LOGON_TYPE_CHANGED_BUT_FIELD_GATES_PENDING',true);
 }catch {return safeStatus('XML_REVIEW_EXCEPTION');}
}
module.exports=Object.freeze({RESULT_SCHEMA,review});
