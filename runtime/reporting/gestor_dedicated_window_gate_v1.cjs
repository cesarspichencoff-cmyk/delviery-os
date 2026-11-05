'use strict';
// Identifies review CANDIDATES from sanitized local metadata only.
// No process/Windows/browser I/O. Never grants hide, navigation or order actions.
// Metadata assertions are untrusted until independently checked on the real host.
const INPUT='deliveryos.gestor-dedicated-window-input.v1';
const OUTPUT='deliveryos.gestor-dedicated-window-gate.v1';
const PROFILE='C:\\Users\\Tata\\AppData\\Local\\TataGestorObservationLab\\DedicatedEdgeProfile';
const HOST='CAIXA_MOOCA';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keys=(o,allowed)=>object(o)&&Object.keys(o).every(k=>allowed.includes(k));
const deny=reason=>Object.freeze({schema:OUTPUT,state:'HOLD',reason,
  candidateRef:null,groupCount:null,orderCount:null,ordersPublishable:0,
  merchantVerified:false,sessionVerified:false,profileVerified:false,
  readOnly:true,windowActionsAuthorized:false,hideAuthorized:false});
function review(input){
  if(!keys(input,['schema','host','profilePath','source','windows'])||
     input.schema!==INPUT||input.host!==HOST||input.profilePath!==PROFILE||
     input.source!=='SANITIZED_WINDOW_METADATA_UNVERIFIED'||
     !Array.isArray(input.windows)||!input.windows.length||input.windows.length>12)
    return deny('SCOPE_OR_PROVENANCE');
  const ids=new Set(),matches=[];
  for(const w of input.windows){
    if(!keys(w,['ref','processName','exactProfileCandidate','mainProcessCandidate',
       'topLevelWindowCount','visible','minimized','uiReadOnly','groupCards',
       'individualOrderEvidence','stable'])||
       typeof w.ref!=='string'||!/^[a-z][a-z0-9_-]{0,31}$/.test(w.ref)||ids.has(w.ref)||
       w.processName!=='msedge.exe'||typeof w.exactProfileCandidate!=='boolean'||
       typeof w.mainProcessCandidate!=='boolean'||typeof w.visible!=='boolean'||
       typeof w.minimized!=='boolean'||typeof w.uiReadOnly!=='boolean'||
       typeof w.stable!=='boolean'||!Number.isInteger(w.topLevelWindowCount)||
       w.topLevelWindowCount<0||w.topLevelWindowCount>8||
       !Number.isInteger(w.groupCards)||w.groupCards<0||w.groupCards>200||
       w.individualOrderEvidence!==false)
      return deny('INVALID_METADATA');
    ids.add(w.ref);
    if(w.exactProfileCandidate&&w.mainProcessCandidate){
      if(w.topLevelWindowCount!==1||!w.visible||w.minimized||!w.uiReadOnly||
         !w.stable)return deny('DEDICATED_WINDOW_NOT_STABLE');
      matches.push(w);
    }
  }
  if(!matches.length)return deny('NO_DEDICATED_CANDIDATE');
  if(matches.length!==1)return deny('AMBIGUOUS_DEDICATED_CANDIDATE');
  const w=matches[0];
  // A group count is not an order count; window identity is NOT session proof.
  return Object.freeze({schema:OUTPUT,state:'CANDIDATE_UNVERIFIED',reason:null,
    candidateRef:w.ref,groupCount:w.groupCards,orderCount:null,
    ordersPublishable:0,merchantVerified:false,sessionVerified:false,
    profileVerified:false,readOnly:true,windowActionsAuthorized:false,
    hideAuthorized:false});
}
module.exports=Object.freeze({INPUT,OUTPUT,PROFILE,review});
