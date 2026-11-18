'use strict';
// Fail-closed input gate for native Reader V2 offline replay.
// The underlying v1 validator is not a live reader or authentication source.
const base=require('./native_reader_shadow_replay_v1.cjs');
const {SCHEMA,OUT}=base;
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
function timestamp(value){
  if(typeof value!=='string')return false;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if(!m)return false;
  const [y,mo,d,h,min,s]=m.slice(1,7).map(Number);
  if(y<2020||y>2100||mo<1||mo>12||h>23||min>59||s>59)return false;
  const date=new Date(Date.UTC(y,mo-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()+1!==mo||
    date.getUTCDate()!==d)return false;
  const zone=m[8]||'';
  if(zone&&zone!=='Z'){
    const hours=Number(zone.slice(1,3)),minutes=Number(zone.slice(4,6));
    // Product source policy: allow only practical civil offsets up to +/-14:00.
    // This is stricter than RFC 3339's syntactic offset range.
    if(hours>14||minutes>59||(hours===14&&minutes!==0))return false;
  }
  return true;
}
function reject(reason){
  return Object.freeze({...base.replay(null),reason,
    nextGate:'SOURCE_AUTHENTICITY_AND_TEMPORAL_REVISION_PROOF'});
}
function replay(input){
  try{
    if(!object(input)||!Array.isArray(input.pairs)||input.pairs.length<1||
      input.pairs.length>64)return reject('INVALID_OR_OVERSIZED_REPLAY');
    for(const p of input.pairs){
      if(!object(p)||!object(p.event)||!object(p.event.order)||
        !object(p.decision)||!timestamp(p.event.order.DTHRABERMESA)||
        !Array.isArray(p.event.order.items)||
        !Array.isArray(p.event.order.observation_rows)||
        p.event.order.items.length>200||
        p.event.order.observation_rows.length>400||
        !Array.isArray(p.decision.items)||
        p.decision.items.length>200)return reject('NATIVE_TIMESTAMP_OR_SHAPE_INVALID');
      // Bound JSON material, detect cyclic/malformed structures without exporting it.
      const bytes=Buffer.byteLength(JSON.stringify(p),'utf8');
      if(bytes>131072)return reject('NATIVE_PAIR_TOO_LARGE');
    }
    return base.replay(input); // Still always HOLD / no events / no publication.
  }catch(_){
    return reject('NATIVE_INPUT_EXCEPTION_FAIL_CLOSED');
  }
}
module.exports={SCHEMA,OUT,replay,timestamp};