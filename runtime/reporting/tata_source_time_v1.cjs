'use strict';
// Pure conversion. Policy is supplied by a trusted caller, never taken from an event.
// A policy reference records provenance; it does not authenticate a caller or publish data.
function parseWall(value) {
  if(typeof value!=='string')return null;
  const m=/^(20\d{2})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?$/.exec(value);
  if(!m)return null;
  const p=m.slice(1,7).map(Number),ms=Date.UTC(p[0],p[1]-1,...p.slice(2));
  if(new Date(ms).toISOString().slice(0,19)!==value.slice(0,19))return null;
  return {ms,p};
}
function explicitInstant(value){
  if(typeof value!=='string')return false;
  const m=/^(.*)(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!m||!parseWall(m[1]))return false;
  if(m[2]!=='Z'){
    const h=Number(m[2].slice(1,3)),n=Number(m[2].slice(4));
    if(h>14||n>59||(h===14&&n!==0)||m[2]==='-00:00')return false;
  }
  return Number.isFinite(Date.parse(value));
}
function resolveNativeOpenedAt(value,scope){
  const denied=reason=>({state:'blocked',reason,instant:null});
  if(explicitInstant(value))return {state:'resolved',instant:value,basis:'EXPLICIT_OFFSET'};
  const wall=parseWall(value);if(!wall)return denied('SOURCE_LOCAL_TIME_INVALID');
  const p=scope?.sourceTimePolicy;
  if(!p||p.schema!=='deliveryos.source-time-policy.v1'||p.timeZone!=='America/Sao_Paulo'||
    p.field!=='DTHRABERMESA'||p.basis!=='NATIVE_LOCAL_WALL_TIME'||
    !['unitId','sourceUnitId','sourceStoreId'].every(k=>typeof scope[k]==='string'&&p[k]===scope[k])||
    typeof p.evidenceRef!=='string'||!p.evidenceRef.trim())return denied('EXPLICIT_SOURCE_TIMEZONE_REQUIRED');
  try{
    const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:p.timeZone,calendar:'gregory',numberingSystem:'latn',
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    const candidates=[];
    // Exhaustive minute offsets, bounded to ISO offsets and dates 2000..2099.
    // Round-trip matching rejects skipped and duplicated local times instead of guessing.
    for(let offset=-840;offset<=840;offset++){
      const fields=Object.fromEntries(fmt.formatToParts(wall.ms-offset*60000).map(x=>[x.type,x.value]));
      if(['year','month','day','hour','minute','second'].every((k,i)=>Number(fields[k])===wall.p[i]))candidates.push(offset);
    }
    if(candidates.length!==1)return denied(candidates.length?'SOURCE_LOCAL_TIME_AMBIGUOUS':'SOURCE_LOCAL_TIME_NONEXISTENT');
    const offset=candidates[0],abs=Math.abs(offset),suffix=(offset<0?'-':'+')+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');
    return {state:'resolved',instant:value+suffix,basis:'EXPLICIT_SOURCE_POLICY',timeZone:p.timeZone,evidenceRef:p.evidenceRef};
  }catch{return denied('SOURCE_TIMEZONE_UNAVAILABLE');}
}
module.exports={resolveNativeOpenedAt,explicitInstant};
