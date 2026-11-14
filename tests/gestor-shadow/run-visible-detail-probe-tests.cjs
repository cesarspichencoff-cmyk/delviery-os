'use strict';
const assert=require('node:assert/strict');
const {readVisibleDetail}=require('../../runtime/reporting/gestor_visible_detail_probe_v1.js');
const css={getComputedStyle:()=>({display:'block',visibility:'visible'})};
function el(value='',selectors={},visible=true){
 return {textContent:value,ownerDocument:{defaultView:css},
  getClientRects:()=>visible?[{}]:[],
  querySelector:s=>(selectors[s]||[])[0]||null,
  querySelectorAll:s=>selectors[s]||[]};
}
const row=(name,qty,options=[],show=true)=>el('',{
 '[data-testid="item-name"]':[el(name)],
 '[data-testid="item-quantity"]':[el(qty)],
 '[data-testid="item-option"]':options.map(x=>el(x))},show);
const dialog=rows=>el('',{
 '[data-testid="order-item"], [data-testid="order-line-item"]':rows});
const fixture=ds=>({querySelectorAll:()=>ds});
let tests=0;
function t(name,fn){fn();tests++;}
t('closed detail stays unknown',()=>assert.equal(readVisibleDetail(fixture([])).state,'DETAIL_NOT_OPEN'));
t('visible two items',()=>{
 const a=readVisibleDetail(fixture([dialog([row('Temaki salmão','2',['Sem cebolinha']),row('Combinado clássico','1',[])])]));
 assert.equal(a.state,'DETAIL_CANDIDATE_UNVERIFIED');assert.equal(a.itemLines,2);
 assert.equal(a.optionLines,1);assert.equal(a.items[0].quantity,2);
 assert.equal(a.items[0].options[0],'Sem cebolinha');
});
t('merchant and order remain unverified',()=>{
 const a=readVisibleDetail(fixture([dialog([row('Combinado','1')])]));
 assert.equal(a.merchantVerified,false);assert.equal(a.orderIdVerified,false);
 assert.equal(a.coverageVerified,false);assert.equal(a.actionsExecuted,0);
});
t('multiple dialogs held',()=>assert.equal(readVisibleDetail(fixture([dialog([]),dialog([])])).state,'HOLD_MULTIPLE_DETAILS'));
t('unknown markup held',()=>assert.equal(readVisibleDetail(fixture([dialog([])])).state,'HOLD_UNKNOWN_DETAIL_STRUCTURE'));
t('invalid quantity held',()=>assert.equal(readVisibleDetail(fixture([dialog([row('Temaki','dois')])])).state,'HOLD_AMBIGUOUS_ITEM'));
t('zero quantity held',()=>assert.equal(readVisibleDetail(fixture([dialog([row('Temaki','0')])])).state,'HOLD_AMBIGUOUS_ITEM'));
t('phone-like item rejected',()=>assert.equal(readVisibleDetail(fixture([dialog([row('Cliente 11999998888','1')])])).state,'HOLD_AMBIGUOUS_ITEM'));
t('email option rejected',()=>assert.equal(readVisibleDetail(fixture([dialog([row('Temaki','1',['x@example.org'])])])).state,'HOLD_AMBIGUOUS_OPTION'));
t('too many items held',()=>assert.equal(readVisibleDetail(fixture([dialog(Array.from({length:61},()=>row('Hot Roll','1')))])).state,'HOLD_TOO_MANY_ITEMS'));
t('too many options held',()=>assert.equal(readVisibleDetail(fixture([dialog([row('Hot Roll','1',Array(16).fill('Shoyu'))])])).state,'HOLD_OPTION_LIMIT'));
t('hidden rows block partial detail',()=>{
 const a=readVisibleDetail(fixture([dialog([row('Sushi','1'),row('Outro','1',[],false)])]));
 assert.equal(a.state,'HOLD_HIDDEN_ITEM_ROWS');assert.equal(a.items.length,0);
});
t('hidden dialog not read',()=>assert.equal(readVisibleDetail(fixture([el('',{},false)])).state,'DETAIL_NOT_OPEN'));
t('hidden item name is refused',()=>{
 const r=el('',{'[data-testid="item-name"]':[el('Hidden product',{},false)],
 '[data-testid="item-quantity"]':[el('1')], '[data-testid="item-option"]':[]});
 assert.equal(readVisibleDetail(fixture([dialog([r])])).state,'HOLD_HIDDEN_ITEM_FIELDS');
});

t('duplicate item name blocks',()=>{
 const r=row('Temaki','1');
 r.querySelectorAll=s=>s==='[data-testid="item-name"]'?[el('Temaki'),el('Outra leitura')]:
  s==='[data-testid="item-quantity"]'?[el('1')]:[];
 assert.equal(readVisibleDetail(fixture([dialog([r])])).state,'HOLD_AMBIGUOUS_ITEM_FIELDS');
});
t('duplicate quantity blocks',()=>{
 const r=row('Temaki','1');
 r.querySelectorAll=s=>s==='[data-testid="item-name"]'?[el('Temaki')]:
  s==='[data-testid="item-quantity"]'?[el('1'),el('2')]:[];
 assert.equal(readVisibleDetail(fixture([dialog([r])])).state,'HOLD_AMBIGUOUS_ITEM_FIELDS');
});
t('hidden option blocks',()=>assert.equal(
 readVisibleDetail(fixture([dialog([row('Temaki','1',[]),row('Sushi','1')])])).state,
 'DETAIL_CANDIDATE_UNVERIFIED'));
t('hidden option text is not silently dropped',()=>{
 const r=row('Temaki','1');
 r.querySelectorAll=s=>s==='[data-testid="item-name"]'?[el('Temaki')]:
  s==='[data-testid="item-quantity"]'?[el('1')]:
  s==='[data-testid="item-option"]'?[el('Extra',{},false)]:[];
 assert.equal(readVisibleDetail(fixture([dialog([r])])).state,'HOLD_HIDDEN_OPTION_FIELDS');
});
t('aria-hidden ancestor blocks field',()=>{
 const r=row('Temaki','1');
 const parent={getAttribute:k=>k==='aria-hidden'?'true':null,ownerDocument:{defaultView:css},parentElement:null};
 r.querySelectorAll=s=>s==='[data-testid="item-name"]'?[Object.assign(el('Temaki'),{parentElement:parent})]:
  s==='[data-testid="item-quantity"]'?[el('1')]:[];
 assert.equal(readVisibleDetail(fixture([dialog([r])])).state,'HOLD_HIDDEN_ITEM_FIELDS');
});
t('candidate does not prove absence of PII or completeness',()=>{
 const a=readVisibleDetail(fixture([dialog([row('Sushi','1')])]));
 assert.equal(a.personalDataAbsentProven,false);
 assert.equal(a.completeDetailProven,false);
});
t('strict no side effect claims',()=>{
 const a=readVisibleDetail(fixture([dialog([row('Sushi','1')])]));
 assert.equal(a.noNavigation,true);assert.equal(a.noFocusChange,true);
 assert.equal(a.noRemoteTransmission,true);assert.equal(a.customerFieldsCopied,false);
});
t('no item identifiers inserted',()=>{
 const a=readVisibleDetail(fixture([dialog([row('Nigiri','1')])]));
 assert.equal(Object.prototype.hasOwnProperty.call(a,'shortId'),false);
});
console.log('GESTOR_VISIBLE_DETAIL_PROBE_PASS '+tests+'/'+tests);
