'use strict';
// Offline review adapter. V2 decision is immutable; annotation never grants FACT, READY, V6.8 or print.
const HUMAN_REF='runtime/shadow/human-validations-cesar-20261014.review.json@abc9fa7';
const N={
 EXEC:['9.05.05.080.00','COMB EXEC SUSHI SALMAO'],KIDS:['9.80.00.010.00','COMBINADO KIDS'],
 ZERO:['8.00.05.010.00','COCA COLA ZERO 350ML - UN'],COLA:['8.00.05.000.00','COCA COLA 350ML - UN'],
 SPRITE:['8.00.05.040.00','SPRITE 350ML - UN'],HOT:['9.50.00.060.00','HOT ROLL'],
 BATERA:['9.50.00.090.00','BATERA DE SALMAO'],TEMAKI:['9.60.00.000.00','TEMAKI DE SALMAO'],
 TEMAKI_BARRIGA:['9.60.00.010.00','TEMAKI DE BARRIGA DE SALMAO'],
 HOSSO:['9.55.00.000.00','HOSSOMAKI DE SALMAO'],URAMAKI_ESP:['9.50.00.010.00','URAMAKI DE SALMAO ESPECIAL'],
 LETRA_B:['9.05.05.060.00','LETRA B - COMB EXEC SUSHI + SASHIMI'],
 LETRA_A:['9.05.05.070.00','LETRA A - COMB EXEC SUSHI'],MOCHI:['8.20.00.061.00','MOCHI INDIVIDUAL'],
 MISSO:['9.75.00.020.00','MISSOSHIRO'],TUNA:['9.10.05.060.00','TUNA SHISSO TARTAR'],
 SHIMEJI:['9.10.00.010.00','SHIMEJI'],GENGIBRE:['9.75.00.031.00','GENGIBRE PORÇÃO'],
 CHOC:['9.99.00.007.00','TATA CHOCOLATE'],COOKIE:['8.20.11.000.00','COOKIE TRES CHOCOLATES'],
 ESPECIAL_1P:['9.15.00.000.00','COMB SUSHI ESPECIAL 1 P'],
 SASHIMI_BARRIGA:['9.45.00.010.00','SASHIMI DE BARRIGA DE SALMAO'],
 SUSHI_POLVO_TRUFADO:['9.40.00.030.00','SUSHI DE POLVO TRUFADO']
};
const COMBOS={
 '9.05.05.060.00':N.LETRA_B[1],'9.05.05.070.00':N.LETRA_A[1],
 '9.05.05.080.00':N.EXEC[1],'9.15.00.000.00':N.ESPECIAL_1P[1],
 '9.15.00.060.00':'SALMAO/ATUM 1 PESSOA','9.15.00.075.00':'COMBINADO SALMAO 1 PESSOA'
};
const CASES=[
 ['B1',[['EXEC',1]],['M']],
 ['B2',[['EXEC',1],['COLA',1]],['M']],['B2',[['EXEC',1],['COLA',2]],['M']],
 ['B2',[['EXEC',1],['ZERO',1]],['M']],['B2',[['EXEC',1],['ZERO',2]],['M']],
 ['B3',[['EXEC',1],['ZERO',1],['CHOC',1]],['M']],['B3',[['EXEC',1],['COLA',1],['CHOC',1]],['M']],
 ['B4',[['KIDS',1],['ZERO',1]],['M']],
 ['B5',[['KIDS',1],['TEMAKI',1],['SPRITE',1]],['M']],
 ['B6',[['KIDS',1],['BATERA',1],['HOT',1]],['M']],
 ['B7',[['EXEC',1],['HOT',1]],['M']],
 ['B8',[['ESPECIAL_1P',1],['SASHIMI_BARRIGA',1]],['M']],
 ['B8',[['ESPECIAL_1P',1],['SUSHI_POLVO_TRUFADO',1]],['M']],
 ['B9',[['TEMAKI',1],['HOSSO',1]],['M']],
 ['B9',[['TEMAKI_BARRIGA',1],['HOSSO',1]],['M']],
 ['B9',[['TEMAKI',1],['URAMAKI_ESP',1]],['M']],
 ['B10',[['LETRA_B',1]],['M']],
 ['B11',[['LETRA_B',1],['MOCHI',2]],['M']],
 ['B12',[['LETRA_A',1],['MISSO',1]],['M','P']],
 ['B13',[['TUNA',1],['SHIMEJI',1],['ZERO',1],['GENGIBRE',1]],['P','P']],
 ['B15',[['COOKIE',1]],['P']]
];
const canon=new Map(Object.values(N).map(([c,n])=>[c,n]));
const norm=v=>typeof v==='string'?v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase():null;
function mapItems(items){
 if(!Array.isArray(items)||!items.length)return null;
 const m=new Map();
 for(const x of items){
  if(!x||typeof x!=='object'||typeof x.canonical_code!=='string'||
     typeof x.product_name!=='string'||!Number.isSafeInteger(x.quantity)||x.quantity<1)return null;
  const code=x.canonical_code,name=norm(x.product_name);
  if(!name||(canon.has(code)&&name!==norm(canon.get(code)))||
     (Object.hasOwn(COMBOS,code)&&name!==norm(COMBOS[code])))return null;
  const old=m.get(code);if(old&&old.name!==name)return null;
  const qty=(old?.qty||0)+x.quantity;if(!Number.isSafeInteger(qty))return null;
  m.set(code,{qty,name});
 }
 return m;
}
function same(m,items){
 return m?.size===items.length&&items.every(([key,qty])=>{
  const [code,name]=N[key];return m.get(code)?.qty===qty&&m.get(code)?.name===norm(name);
 });
}
function assess(items){
 const m=mapItems(items);
 if(!m)return {status:'HOLD_INVALID_IDENTITY',bag:null,boxes:[],kits:[],ready_override:false,print_authorized:false};
 const matching=CASES.filter(([c,lines])=>same(m,lines));
 if(matching.length>1)return {status:'HOLD_AMBIGUOUS_CASE',bag:null,boxes:[],kits:[],ready_override:false,print_authorized:false};
 const bag=matching.length?{case:matching[0][0],sizes:matching[0][2],count:matching[0][2].length}:null;
 const boxes=[];
 for(const [code,x]of m){
  if(Object.hasOwn(COMBOS,code)&&x.name===norm(COMBOS[code])&&!(code===N.LETRA_B[0]&&x.qty>3))
   boxes.push({code,model:'750',count:x.qty,proof:'EXACT_HUMAN_REVIEW_ONLY'});
 }
 const kits=same(m,[['KIDS',1],['ZERO',1]])?[{kind:'Kit Kids',count:1,case:'C1'}]:[];
 return {status:'REVIEW_ONLY',bag,boxes,kits,ready_override:false,print_authorized:false,human_ref:HUMAN_REF};
}
const BAG=new Set(['BAG_SIZE_NOT_FACT','BAG_COUNT_NOT_FACT']);
function reviewV2(decision){
 const hold=reason=>({status:'HOLD',reason,bag:null,boxes:[],kits:[],candidate_for_reconciliation:false,
  snapshot_authenticated:false,human_attestation_authenticated:false,ready_override:false,print_authorized:false});
 if(!decision||decision.schema!=='deliveryos.live-shadow-decision.v1'||!Array.isArray(decision.items)||
    !Array.isArray(decision.blocking_reasons)||typeof decision.ready!=='boolean'||
    decision.blocking_reasons.some(x=>typeof x!=='string'||!x.trim())||
    decision.ready!==(decision.blocking_reasons.length===0))return hold('INVALID_OR_CONFLICTING_V2');
 const h=assess(decision.items);
 if(h.status!=='REVIEW_ONLY')return hold(h.status);
 const onlyBag=decision.blocking_reasons.length>0&&decision.blocking_reasons.every(x=>BAG.has(x));
 return {status:'REVIEW_ONLY',bag:h.bag,boxes:h.boxes,kits:h.kits,
  original_v2_ready:decision.ready,original_blockers:decision.blocking_reasons.length,
  candidate_for_reconciliation:onlyBag&&h.bag!==null,
  snapshot_authenticated:false,human_attestation_authenticated:false,
  ready_override:false,print_authorized:false};
}
module.exports={assess,reviewV2,N,COMBOS,CASES};
