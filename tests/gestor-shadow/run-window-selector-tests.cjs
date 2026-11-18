'use strict';
const assert=require('node:assert/strict');
const {SCHEMA,selectWindow}=require('../../runtime/reporting/gestor_window_selector_v1.cjs');
const full=(ref='original')=>({ref,visible:true,minimized:false,listMatches:1,listChildren:20,
 singleCodeCards:20,uniqueCodeCandidates:20,uiReadOnly:true,stable:true});
const empty=(ref='side')=>({ref,visible:true,minimized:true,listMatches:0,listChildren:0,
 singleCodeCards:0,uniqueCodeCandidates:0,uiReadOnly:true,stable:true});
const fixture=()=>({schema:SCHEMA,host:'CAIXA_MOOCA',
 profile:'DeliveryOS-Edge-Gestor-Itaim',windows:[full()]});
let n=0;
function test(label,f,expected){const x=fixture();f(x);const r=selectWindow(x);
 assert.equal(r.state,expected,label);assert.equal(r.ordersPublishable,0);
 assert.equal(r.actionsAuthorized,false);n++;}
test('unique original accepted',()=>{},'SELECTED_READ_ONLY');
test('second minimized window does not steal selection',x=>x.windows.push(empty()),'SELECTED_READ_ONLY');
test('second maximized blank window does not steal selection',x=>x.windows.push({...empty(),minimized:false}),'SELECTED_READ_ONLY');
test('two qualified windows refuse selection',x=>x.windows.push(full('second')),'HOLD');
test('duplicate refs refused',x=>x.windows.push(full()),'HOLD');
test('wrong host refused',x=>x.host='FOXXY','HOLD');
test('wrong profile refused',x=>x.profile='DeliveryOS-Edge-Gestor-Itaim-V2','HOLD');
test('no windows refused',x=>x.windows=[],'HOLD');
test('hidden original refused',x=>x.windows[0].visible=false,'HOLD');
test('minimized original refused',x=>x.windows[0].minimized=true,'HOLD');
test('two completed lists refused',x=>x.windows[0].listMatches=2,'HOLD');
test('unknown children refused',x=>x.windows[0].listChildren=0,'HOLD');
test('one malformed card refused',x=>x.windows[0].singleCodeCards=19,'HOLD');
test('duplicate candidate refused',x=>x.windows[0].uniqueCodeCandidates=19,'HOLD');
test('not stable refused',x=>x.windows[0].stable=false,'HOLD');
test('not read only refused',x=>x.windows[0].uiReadOnly=false,'HOLD');
test('extra raw customer field refused',x=>x.windows[0].customerName='NO','HOLD');
test('high count refused',x=>{x.windows[0].listChildren=101;x.windows[0].singleCodeCards=101;x.windows[0].uniqueCodeCandidates=101},'HOLD');
test('unrecognized window property refused',x=>x.windows[0].secret=true,'HOLD');
test('date not needed or inferred',x=>x.when='2026-11-03','HOLD');
console.log('GESTOR_WINDOW_SELECTOR_PASS '+n+'/'+n);
