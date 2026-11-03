'use strict';
// Strict selector from already-sanitized per-window UI accessibility metadata.
// No browser/Windows I/O, click, focus, navigation, customer data, or exported order IDs.
const SCHEMA='deliveryos.gestor-window-selection-input.v1';
const OUT='deliveryos.gestor-window-selection-output.v1';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const only=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
const hold=(reason)=>Object.freeze({schema:OUT,state:'HOLD',reason,
 windowRef:null,usable:false,actionsAuthorized:false,ordersPublishable:0});
function selectWindow(input){
 if(!only(input,['schema','host','profile','windows'])||input.schema!==SCHEMA||
  input.host!=='CAIXA_MOOCA'||input.profile!=='DeliveryOS-Edge-Gestor-Itaim'||
  !Array.isArray(input.windows)||input.windows.length<1||input.windows.length>12)
  return hold('SCOPE_OR_ENVELOPE');
 const ids=new Set(),eligible=[];
 for(const w of input.windows){
  if(!only(w,['ref','visible','minimized','listMatches','listChildren','singleCodeCards',
     'uniqueCodeCandidates','uiReadOnly','stable'])||
   typeof w.ref!=='string'||!/^[a-z][a-z0-9_-]{0,31}$/.test(w.ref)||
   ids.has(w.ref)||typeof w.visible!=='boolean'||typeof w.minimized!=='boolean'||
   typeof w.uiReadOnly!=='boolean'||typeof w.stable!=='boolean'||
   ![w.listMatches,w.listChildren,w.singleCodeCards,w.uniqueCodeCandidates]
    .every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100))return hold('INVALID_WINDOW_METADATA');
  ids.add(w.ref);
  if(w.visible&& !w.minimized&&w.uiReadOnly&&w.stable&&w.listMatches===1&&
    w.listChildren>0&&w.singleCodeCards===w.listChildren&&
    w.uniqueCodeCandidates===w.listChildren)eligible.push(w.ref);
 }
 if(eligible.length===0)return hold('NO_QUALIFIED_WINDOW');
 if(eligible.length!==1)return hold('AMBIGUOUS_WINDOWS');
 return Object.freeze({schema:OUT,state:'SELECTED_READ_ONLY',reason:null,
   windowRef:eligible[0],usable:true,actionsAuthorized:false,ordersPublishable:0});
}
module.exports={SCHEMA,OUT,selectWindow};
