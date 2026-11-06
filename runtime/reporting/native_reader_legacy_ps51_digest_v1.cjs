'use strict';
// REVIEW-ONLY PowerShell 5.1 serialization candidate: no I/O, SQL, runtime
// actions or authority claims. Must be checked against the PS5.1 oracle.
// Fail closed on object types / numbers outside the verified JSON subset.
const {createHash}=require('node:crypto');
const {snapshotHash}=require('./native_reader_shadow_replay_v1.cjs');
const HEADER=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA','NRCOMANDAEXT',
  'IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
const ITEM=['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'];
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
function hashBasis(order){
 if(!obj(order)||HEADER.some(k=>!Object.hasOwn(order,k))||
   !Array.isArray(order.items))return null;
 const basis={};for(const k of HEADER)basis[k]=order[k];
 basis.items=[];
 for(const x of order.items){
  if(!obj(x)||ITEM.some(k=>!Object.hasOwn(x,k)))return null;
  const item={};for(const k of ITEM)item[k]=x[k];
  basis.items.push(item);
 }
 if(Array.isArray(order.observation_rows)&&order.observation_rows.length)
  basis.observation_rows=order.observation_rows;
 return basis;
}
function supported(v,depth=0){
 if(depth>12)return false;
 if(v===null||typeof v==='string'||typeof v==='boolean')return true;
 if(typeof v==='number')return Number.isSafeInteger(v);
 if(Array.isArray(v))return v.length<=500&&v.every(x=>supported(x,depth+1));
 if(!obj(v))return false;
 const keys=Object.keys(v);
 return keys.length<=32&&keys.every(k=>supported(v[k],depth+1));
}
const PS51_ESCAPES=Object.freeze({
  "'":'\\u0027','<':'\\u003c','>':'\\u003e','&':'\\u0026',
  '\u0085':'\\u0085','\u2028':'\\u2028','\u2029':'\\u2029'
});
const SPECIAL=/['<>&\u0085\u2028\u2029]/g;
function ps51CompactJson(basis){
 if(!supported(basis))return null;
 const js=JSON.stringify(basis);
 return typeof js==='string'?js.replace(SPECIAL,c=>PS51_ESCAPES[c]):null;
}
const digest=data=>createHash('sha256').update(data,'utf8').digest('hex');
function legacyDigestUpper(order){
 const basis=hashBasis(order),text=ps51CompactJson(basis);
 return text===null?null:digest(text).toUpperCase();
}
function checkBasisGuard(order){
 const b=hashBasis(order);
 if(b===null||!supported(b))return false;
 return digest(JSON.stringify(b))===snapshotHash(order);
}
function divergentClasses(order){
 const b=hashBasis(order),json=b&&supported(b)?JSON.stringify(b):null;
 if(json===null)return null;
 return Object.freeze({
  apostrophe:json.includes("'"),
  angles:/[<>]/.test(json),
  ampersand:json.includes('&'),
  unicodeSeparators:/[\u0085\u2028\u2029]/.test(json)
 });
}
module.exports=Object.freeze({hashBasis,ps51CompactJson,legacyDigestUpper,
  checkBasisGuard,divergentClasses});
