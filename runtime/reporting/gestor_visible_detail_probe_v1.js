'use strict';
/* Delivery OS: read-only detail extraction from an ALREADY OPEN and visible dialog.
 * Does not navigate, click, focus, scroll, fetch, alter the page or export identities.
 * Product names exist only in caller memory; caller must enforce local retention/ACL.
 * Actual iFood DOM compatibility and merchant identity remain UNVERIFIED.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.DeliveryGestorDetailReadOnly=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 const SCHEMA='deliveryos.gestor-visible-detail-candidate.v1';
 const text=(el,max)=>{
   if(!el)return '';
   const value=typeof el.innerText==='string'?el.innerText:el.textContent;
   return typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max+1):'';
 };
 const privatePattern=/(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:\+?55)?\s?\(?\d{2}\)?\s?9?\d{4}[- ]?\d{4}\b|\b(?:cliente|telefone|endere[cç]o|cpf|email)\b)/i;
 const permitted=(s,max)=>typeof s==='string'&&s.length>0&&s.length<=max&&!privatePattern.test(s);
 const fail=(code,more={})=>Object.freeze({schema:SCHEMA,state:code,merchantVerified:false,
   orderIdVerified:false,coverageVerified:false,readOnly:true,actionsExecuted:0,
   customerFieldsCopied:false,items:[],...more});
 const visible=e=>{
   if(!e||typeof e.getClientRects!=='function'||e.getClientRects().length===0)return false;
   if(e.isConnected===false)return false;
   for(let node=e,depth=0;node&&depth<32;node=node.parentElement,depth++){
     if(node.hidden===true||node.inert===true||node.getAttribute?.('aria-hidden')==='true')return false;
     const css=node.ownerDocument?.defaultView?.getComputedStyle?.(node);
     if(css&&(css.visibility==='hidden'||css.visibility==='collapse'||css.display==='none'||Number(css.opacity??1)===0))return false;
   }
   return true;
 };
 const quantity=s=>{
   const m=/^(?:[xX]\s*)?([0-9]{1,3})(?:\s*(?:[xX]|un|und|unidades?))?$/.exec(s);
   const n=m?Number(m[1]):NaN;return Number.isSafeInteger(n)&&n>=1&&n<=200?n:null;
 };
 function readVisibleDetail(doc){
   if(!doc||typeof doc.querySelectorAll!=='function')return fail('HOLD_DOCUMENT');
   const open=[...doc.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"], [data-testid="order-details"]')]
     .filter(e=>(String(e.tagName||'').toLowerCase()!=='dialog'||e.hasAttribute('open'))&&visible(e));
   if(open.length===0)return fail('DETAIL_NOT_OPEN');
   if(open.length!==1)return fail('HOLD_MULTIPLE_DETAILS');
   const container=open[0];
   const found=[...container.querySelectorAll('[data-testid="order-item"], [data-testid="order-line-item"]')];
   if(found.length===0)return fail('HOLD_UNKNOWN_DETAIL_STRUCTURE');
   if(found.length>60)return fail('HOLD_TOO_MANY_ITEMS',{detectedRows:found.length});
   if(found.some(row=>!visible(row)))return fail('HOLD_HIDDEN_ITEM_ROWS',{detectedRows:found.length});
   const rows=found;
   const items=[];let optionsTotal=0;
   for(const row of rows){
     const nameNodes=[...row.querySelectorAll('[data-testid="item-name"]')];
     const qtyNodes=[...row.querySelectorAll('[data-testid="item-quantity"]')];
     if(nameNodes.length!==1||qtyNodes.length!==1)return fail('HOLD_AMBIGUOUS_ITEM_FIELDS');
     const nameEl=nameNodes[0],qtyEl=qtyNodes[0];
     if(!visible(nameEl)||!visible(qtyEl))return fail('HOLD_HIDDEN_ITEM_FIELDS');
     const name=text(nameEl,120);
     const rawQty=text(qtyEl,20);
     const qty=quantity(rawQty);
     if(!permitted(name,120)||qty===null)return fail('HOLD_AMBIGUOUS_ITEM',{visibleRows:rows.length});
     const optionEls=[...row.querySelectorAll('[data-testid="item-option"]')];
     if(optionEls.length>15)return fail('HOLD_OPTION_LIMIT');
     if(optionEls.some(option=>!visible(option)))return fail('HOLD_HIDDEN_OPTION_FIELDS');
     const options=[];
     for(const op of optionEls){
       const value=text(op,90);
       if(!permitted(value,90))return fail('HOLD_AMBIGUOUS_OPTION');
       options.push(value);
     }
     optionsTotal+=options.length;
     if(optionsTotal>250)return fail('HOLD_OPTION_TOTAL_LIMIT');
     items.push({name,quantity:qty,options});
   }
   return Object.freeze({schema:SCHEMA,state:'DETAIL_CANDIDATE_UNVERIFIED',
     observedAtUtc:new Date().toISOString(),source:'VISIBLE_OPEN_DIALOG_ONLY',
     visibleRows:rows.length,itemLines:items.length,optionLines:optionsTotal,
     items,merchantVerified:false,orderIdVerified:false,coverageVerified:false,
     readOnly:true,actionsExecuted:0,customerFieldsCopied:false,
     noNavigation:true,noFocusChange:true,noRemoteTransmission:true,
     personalDataAbsentProven:false,completeDetailProven:false});
 }
 return Object.freeze({SCHEMA,readVisibleDetail});
});
