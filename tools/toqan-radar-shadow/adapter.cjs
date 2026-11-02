"use strict";
/* Radar Toqan: manual/provider-authorized aggregate report → shadow signal.
 * No account access, scraping, API call, cookies, customer/order IDs, GPS,
 * command dispatch, production inference, or source attestation.
 */
const SCHEMA="tata.deliveryos.toqan-native-report.v1";
const OUT="tata.deliveryos.toqan-radar-shadow.v1";
const METRICS=Object.freeze({
 orders_total:"count",orders_delayed:"count",orders_cancelled:"count",
 orders_dispatched:"count",preparation_mean_minutes:"minutes",
 pause_total_minutes:"minutes"
});
const KEYS=Object.keys(METRICS);
const noEffects=Object.freeze({network:false,read_account:false,scrape:false,order_modify:false,
 dispatch:false,location_access:false,print:false,delivery_create:false});
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,allowed)=>object(x)&&Object.keys(x).every(k=>allowed.includes(k));
const stamp=x=>{
 if(typeof x!=="string")return null;
 const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?([+-]\d\d:\d\d|Z)$/.exec(x);
 if(!m)return null;
 const [y,M,d,h,min,s]=m.slice(1,7).map(Number);
 const check=new Date(Date.UTC(y,M-1,d));
 if(y<2020||y>2100||M<1||M>12||d<1||check.getUTCFullYear()!==y||
  check.getUTCMonth()+1!==M||check.getUTCDate()!==d||h>23||min>59||s>59)return null;
 const offs=m[8];
 if(offs!=="Z"&&(Number(offs.slice(1,3))>23||Number(offs.slice(4,6))>59))return null;
 const millis=Date.parse(x);return Number.isFinite(millis)?millis:null;
};
const hold=reason=>Object.freeze({
 schema:OUT,status:"HOLD",reason,unit:"ITAIM",metrics:{},derived:{},
 sourceTime:null,observedAt:null,sourceIndependentlyVerified:false,
 continuous:false,orderLevel:false,realTime:false,gps:false,
 itemProduction:false,canTriggerAction:false,forCopilot:"NO",
 effects:noEffects
});
const n=x=>Number.isFinite(x)&&x>=0&&x<=1e7;
function fromNativeReport(input,clock=new Date()){
 if(!exact(input,["schema","source","transfer","scope","period","reportCreatedAt","metrics"])||
   input.schema!==SCHEMA||input.source!=="TOQAN"||
   !["MANUAL_EXPORT","PROVIDER_AUTHORIZED_EXPORT"].includes(input.transfer))return hold("UNSUPPORTED_OR_UNAUTHORIZED_TRANSFER");
 if(!exact(input.scope,["unit","storeClaim"])||input.scope.unit!=="ITAIM"||
   !["53069","UNKNOWN"].includes(input.scope.storeClaim))return hold("UNIT_OR_STORE_SCOPE_INVALID");
 if(!exact(input.period,["start","end","timezone"])||
   input.period.timezone!=="America/Sao_Paulo")return hold("PERIOD_SCOPE_INVALID");
 const start=stamp(input.period.start),end=stamp(input.period.end),created=stamp(input.reportCreatedAt);
 const now=clock instanceof Date?clock.getTime():NaN;
 if(start===null||end===null||created===null||!Number.isFinite(now)||
  start>=end||end>now+300000||created>now+300000||
  end-start>31*86400000)return hold("PERIOD_OR_CLOCK_INVALID");
 if(!exact(input.metrics,KEYS)||Object.keys(input.metrics).length===0)return hold("UNSUPPORTED_METRICS");
 for(const [k,v] of Object.entries(input.metrics)){
  if(!n(v)||((METRICS[k]==="count")&&!Number.isSafeInteger(v)))return hold("METRIC_INVALID");
 }
 const m=input.metrics;
 if(m.orders_total!==undefined){
  if(["orders_delayed","orders_cancelled","orders_dispatched"].some(k=>m[k]!==undefined&&m[k]>m.orders_total))
   return hold("COUNT_EXCEEDS_TOTAL");
 }
 const derived={};
 if(m.orders_total!==undefined&&m.orders_total>0&&m.orders_delayed!==undefined)
  derived.delayed_rate_pct=Math.round(m.orders_delayed/m.orders_total*10000)/100;
 // Never infer missing metric = 0, infer prep status from mean, or claim live GPS.
 return Object.freeze({
  schema:OUT,status:"SHADOW_AGGREGATE_REVIEW_ONLY",reason:null,
  unit:"ITAIM",storeClaim:input.scope.storeClaim,
  dataType:"AGGREGATE_PERIOD",source:"TOQAN",
  transfer:input.transfer,sourceTime:input.reportCreatedAt,
  observedAt:clock.toISOString(),period:Object.freeze({...input.period}),
  metrics:Object.freeze({...m}),derived:Object.freeze(derived),
  reportAgeMinutes:Math.max(0,Math.round((now-created)/60000)),
  sourceIndependentlyVerified:false,continuous:false,orderLevel:false,realTime:false,
  gps:false,itemProduction:false,canTriggerAction:false,forCopilot:"SHADOW_ONLY_UNVERIFIED",
  effects:noEffects
 });
}
module.exports={SCHEMA,OUT,METRICS,fromNativeReport};