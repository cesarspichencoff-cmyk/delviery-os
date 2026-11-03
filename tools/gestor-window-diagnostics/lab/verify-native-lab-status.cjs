'use strict';
// Verifies one fresh, sanitized Windows-HWND lab observation; never accesses Edge.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {SCHEMA,selectWindow}=require('../../../runtime/reporting/gestor_window_selector_v1.cjs');
const file=path.join(__dirname,'lab-two-window-results.json');
function verify(){
 const stat=fs.statSync(file);
 if(!stat.isFile()||stat.size>20000)throw Error('LAB_RESULT_INVALID_SIZE');
 const x=JSON.parse(fs.readFileSync(file,'utf8'));
 if(x.schema!=='deliveryos.gestor-lab-two-hwnd.v1')throw Error('LAB_RESULT_SCHEMA');
 if(x.observedTwoWindows!==true||x.focusPreserved!==true||
    x.profileIsDisposable!==true||x.noIfoodDomainVisited!==true||x.noOrdersModified!==true)
  throw Error('LAB_SAFE_PROOF_MISSING');
 const age=Date.now()-Date.parse(x.observedAtUtc);
 if(!Number.isFinite(age)||age<0||age>600000)throw Error('LAB_RESULT_NOT_FRESH');
 for(const key of ['stageOne','stageTwo']){
  const input=x[key];
  if(input?.schema!==SCHEMA||input.host!=='CAIXA_MOOCA'||
    input.profile!=='DeliveryOS-Edge-Gestor-Itaim'||
    !Array.isArray(input.windows)||input.windows.length!==2)throw Error('LAB_NATIVE_WINDOW_STRUCTURE_'+key);
 }
 const first=selectWindow(x.stageOne);
 const second=selectWindow(x.stageTwo);
 assert.equal(first.state,'SELECTED_READ_ONLY','minimized second real HWND must not displace selected fixture');
 assert.equal(first.usable,true);
 assert.equal(second.state,'HOLD','two qualifying real HWNDs must be held');
 assert.equal(second.reason,'AMBIGUOUS_WINDOWS');
 assert.equal(first.ordersPublishable,0);assert.equal(second.ordersPublishable,0);
 assert.equal(first.actionsAuthorized,false);assert.equal(second.actionsAuthorized,false);
 return {schema:'deliveryos.gestor-native-two-hwnd-verification.v1',pass:true,
  nativeWindowsObserved:2,firstState:first.state,secondState:second.reason,
  noExternalEffects:true,orderIdsExported:0,merchantOrdersUsed:false};
}
try{console.log(JSON.stringify(verify()))}
catch(e){console.error('GESTOR_NATIVE_HWND_HOLD',e.name,String(e.message).slice(0,180));process.exitCode=1}
