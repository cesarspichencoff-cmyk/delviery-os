'use strict';
// Delivery OS: pure read-only candidate planner; not a browser controller.
// It cannot attest a store, authorize clicks, dispatch, update orders, or publish to Copiloto.
const crypto=require('node:crypto');
const SCHEMA='deliveryos.gestor-shadow-plan-input.v1';
const OUTPUT='deliveryos.gestor-shadow-plan.v1';
const SHORT=/^[0-9]{4}$/;
const HEX=/^[0-9a-fA-F]{64}$/;
const NATIVE=/^0001\|01\|[0-9]{1,12}\|[0-9]{1,12}$/;
const STATE=new Set(['CONCLUDED','PREPARING','READY','CANCELLED','UNKNOWN']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const only=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
const instant=s=>{
 if(typeof s!=='string')return null;
 const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?(Z|[+-]\d\d:\d\d)$/.exec(s);
 if(!m)return null;
 const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number);
 const date=new Date(Date.UTC(year,month-1,day));
 if(year<2020||year>2100||month<1||month>12||day<1||
   date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||
   date.getUTCDate()!==day||hour>23||minute>59||second>59)return null;
 const offset=m[8];
 if(offset!=='Z'&&(Number(offset.slice(1,3))>23||Number(offset.slice(4,6))>59))return null;
 const n=Date.parse(s);return Number.isFinite(n)?n:null;
};
const bounded=(x,n)=>Number.isSafeInteger(x)&&x>=0&&x<=n;
const result=(gate,reason,more={})=>Object.freeze({schema:OUTPUT,gate,reason,
 completeness:'UNPROVEN',merchantVerified:false,readerJoinProven:false,
 detailsOperationallyProven:false,pausedCatalogProven:false,
 navigationAuthorized:false,detailsPerCycleCap:0,ordersPublishable:0,
 rawIdsExported:0,personalFieldsExported:0,actionsExecuted:0,
 noExternalEffects:true,detailQueue:[],...more});
const token=(keyBytes,s)=>crypto.createHmac('sha256',keyBytes).update(s).digest('hex').slice(0,24);
function plan(input,previous={}){
 if(!only(input,['schema','host','unit','now','privateKey','gestor','reader','catalog','separateSession','operatorActive','navigationEffectProven']))
  return result('HOLD','ENVELOPE_INVALID');
 if(input.schema!==SCHEMA||input.host!=='CAIXA_MOOCA'||input.unit!=='ITAIM'||!HEX.test(input.privateKey||''))
  return result('HOLD','SCOPE_OR_KEY_INVALID');
 const now=instant(input.now);
 if(now===null)return result('HOLD','CLOCK_INVALID');
 const keyBytes=Buffer.from(input.privateKey,'hex');
 const g=input.gestor,r=input.reader;
 if(!only(g,['capturedAt','origin','coverage','merchantVerified','cards'])||
  g.origin!=='GESTOR_WEB_SHADOW'||!['VISIBLE_ONLY','UNKNOWN','FULL_VERIFIED'].includes(g.coverage)||
  !Array.isArray(g.cards)||g.cards.length>200||typeof g.merchantVerified!=='boolean')
  return result('HOLD','GESTOR_SCHEMA_INVALID');
 if(!only(r,['capturedAt','origin','sourceProven','revisions'])||r.origin!=='TEKNISA_READER_SHADOW'||
  !Array.isArray(r.revisions)||r.revisions.length>400||typeof r.sourceProven!=='boolean')
  return result('HOLD','READER_SCHEMA_INVALID');
 const gt=instant(g.capturedAt),rt=instant(r.capturedAt);
 if(gt===null||rt===null||gt>now+5000||rt>now+5000||
  now-gt>30000||now-rt>30000)return result('HOLD','SOURCE_STALE');
 if(input.catalog!==undefined&&(!only(input.catalog,['source','pausedCount','sourceVerified'])||
  !['TOQAN_AGGREGATE','CATALOG_OBSERVATION'].includes(input.catalog.source)||
  !bounded(input.catalog.pausedCount,100000)||typeof input.catalog.sourceVerified!=='boolean'))
  return result('HOLD','CATALOG_SCHEMA_INVALID');
 const groups=new Map(),native=new Map();
 for(const card of g.cards){
  if(!only(card,['shortId','state','revisionHash','detail','detailObservedAt'])||
   !SHORT.test(card.shortId||'')||!STATE.has(card.state)||!HEX.test(card.revisionHash||''))
   return result('HOLD','CARD_SCHEMA_INVALID');
  if(card.detail!==undefined){
   const d=card.detail;
   if(!only(d,['state','itemLines','optionLines'])||
    !['READ','NONE','UNKNOWN'].includes(d.state)||
    !bounded(d.itemLines,250)||!bounded(d.optionLines,1000))
    return result('HOLD','DETAIL_SCHEMA_INVALID');
   if(d.state==='READ'){
    const age=instant(card.detailObservedAt);
    if(age===null||age>now+5000||now-age>60000)return result('HOLD','DETAIL_STALE');
   }
  }
  const items=groups.get(card.shortId)||[];items.push(card);groups.set(card.shortId,items);
 }
 for(const revision of r.revisions){
  if(!only(revision,['shortId','nativeKey','revisionHash','origin','itemLines'])||
   !SHORT.test(revision.shortId||'')||!NATIVE.test(revision.nativeKey||'')||
   !HEX.test(revision.revisionHash||'')||revision.origin!=='DLV_IFO'||
   !bounded(revision.itemLines,250))return result('HOLD','NATIVE_SCHEMA_INVALID');
  const items=native.get(revision.shortId)||[];items.push(revision);native.set(revision.shortId,items);
 }
 const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 if(!/^\d{4}-\d\d-\d\d$/.test(localDay))return result('HOLD','LOCAL_DAY_INVALID');
 const earlier=only(previous,['observations'])&&object(previous.observations)?previous.observations:{};
 const observations=Object.create(null),pending=[];let collisions=0,matchedClaims=0,detailsVisible=0;
 const rank={PREPARING:0,READY:1,CANCELLED:2,CONCLUDED:3,UNKNOWN:4};
 for(const short of [...groups.keys()].sort()){
  const cards=groups.get(short),revisions=native.get(short)||[];
  if(cards.length!==1||revisions.length>1){collisions++;continue}
  const card=cards[0],opaque=token(keyBytes,'ITAIM|'+localDay+'|'+short);
  const version=token(keyBytes,card.state+'|'+card.revisionHash);
  observations[opaque]=version;
  if(revisions.length===1)matchedClaims++;
  const detailRead=card.detail?.state==='READ';
  if(detailRead)detailsVisible++;
  if(!detailRead||earlier[opaque]!==version)pending.push({
   opaqueRef:opaque,reason:detailRead?'CARD_CHANGED':'DETAIL_NOT_OBSERVED',
   priority:rank[card.state]
  });
 }
 pending.sort((a,b)=>a.priority-b.priority||a.opaqueRef.localeCompare(b.opaqueRef));
 const queue=pending.slice(0,5).map(({priority,...s})=>s);
 // 'eligible' does not grant browser navigation; independent effect proof is still required.
 const eligible=input.separateSession===true&&input.operatorActive===false&&
   input.navigationEffectProven===true&&g.merchantVerified===true;
 return result('SHADOW_ONLY',null,{
  observedAt:input.now,operationalDay:localDay,
  cardsVisible:g.cards.length,detailsVisible,matchedClaims,collisionCount:collisions,
  detailNavigationEligible:Boolean(eligible),detailQueue:queue,
  catalogSignal:input.catalog?.source==='TOQAN_AGGREGATE'?'AGGREGATE_ONLY':'UNVERIFIED',
  readerItemProgress:'UNKNOWN',coverage:g.coverage==='FULL_VERIFIED'?'CLAIM_ONLY':'VISIBLE_ONLY',
  observations
 });
}
module.exports={SCHEMA,OUTPUT,plan};
