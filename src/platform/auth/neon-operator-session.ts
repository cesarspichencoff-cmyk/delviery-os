import {createHash,randomBytes} from 'node:crypto';
import type {VerifiedOperatorIdentity} from './operator-read-authority';
const COOKIE='__Host-deliveryos_operator';
const FLOW='__Host-deliveryos_login';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const cookie=(name:string,token:string,seconds:number)=>`${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
export function operatorCredential(header:unknown,name=COOKIE):string|null{
 if(typeof header!=='string'||header.length>8192)return null;
 const found=header.split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
 if(found.length!==1)return null;const token=found[0].slice(name.length+1);
 return /^[a-f0-9]{64}$/.test(token)?token:null;
}
/** Candidate server bridge. No registration, JWT decoding, shared-cookie reuse or live configuration.
 * approvedSubject is a server-owned roster of existing approved accounts, NOT an email claim from the browser.
 * fetchTransport may be injected for tests; production must use trusted HTTPS fetch.
 */
export function createNeonOperatorSessions(cfg:{authBase:string;appOrigin:string;
 approvedSubject:(email:string)=>Promise<string|null>;now:()=>number;fetchTransport?:typeof fetch}){
 const base=new URL(cfg.authBase),origin=new URL(cfg.appOrigin),fetcher=cfg.fetchTransport??fetch;
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||
   origin.protocol!=='https:'||origin.origin!==cfg.appOrigin||!base.pathname.endsWith('/auth'))throw Error('AUTH_ENDPOINT_CONFIGURATION_INVALID');
 const authBase=base.href.replace(/\/$/,''),appOrigin=origin.origin,now=cfg.now,approved=cfg.approvedSubject;
 const sessions=new Map<string,{upstream:string;subject:string;created:number;expires:number}>();
 const flows=new Map<string,{email:string;subject:string;expires:number;attempts:number;busy:boolean}>();
 const limits=new Map<string,{until:number;count:number}>();
 const fail=(status:number,code:string)=>({ok:false as const,status,code,setCookies:[] as string[]});
 function cleanup(){const t=now();if(!Number.isSafeInteger(t))throw Error('INVALID_CLOCK');for(const [k,s] of sessions)if(s.expires<=t)sessions.delete(k);for(const [k,s] of flows)if(s.expires<=t)flows.delete(k);for(const [k,s] of limits)if(s.until<=t)limits.delete(k);}
 async function call(route:string,method:string,body?:unknown,upstream?:string){
  const response=await fetcher(authBase+route,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),
   headers:{Origin:appOrigin,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(upstream?{Cookie:upstream}:{})},body:body?JSON.stringify(body):undefined});
  // Bounded response and deadline also cover body consumption.
  const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
  if(reader){try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>65536)throw Error('PROVIDER_RESPONSE_TOO_LARGE');chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});}}
  let value:any=null;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{if(response.ok)throw Error('INVALID_PROVIDER_RESPONSE');}
  return {response,value};
 }
 function upstreamCookies(response:Response){
  const get=(response.headers as unknown as {getSetCookie?:()=>string[]}).getSetCookie;
  const lines=get?.call(response.headers)??[];
  if(!lines.length||lines.length>16)throw Error('PROVIDER_COOKIE_MISSING');
  const pairs=lines.map(line=>line.split(';')[0]);
  if(pairs.some(p=>!/^[-A-Za-z0-9_.]+=[\x21-\x2B\x2D-\x3A\x3C-\x7E]+$/.test(p))||pairs.join('; ').length>8192)throw Error('PROVIDER_COOKIE_INVALID');
  return pairs.join('; ');
 }
 async function identity(upstream:string){
  const {response,value}=await call('/get-session?disableCookieCache=true','GET',undefined,upstream);
  if(response.status===401||response.status===403||value===null)return null;
  if(!response.ok)throw Error('PROVIDER_UNAVAILABLE');
  const s=value.session,u=value.user;
  if(!s||!u||typeof u.id!=='string'||!u.id||s.userId!==u.id||typeof u.email!=='string')return null;
  if(![s.expiresAt,s.createdAt].every(v=>typeof v==='string'&&/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)))return null;
  const expires=Date.parse(s.expiresAt),created=Date.parse(s.createdAt),t=now();
  if(!Number.isSafeInteger(expires)||!Number.isSafeInteger(created)||created>t||expires<=t||expires<=created)return null;
  return {subject:u.id,email:u.email.trim().toLowerCase(),expires};
 }
 return {
  issuer:authBase,audience:appOrigin,
  async begin(requestOrigin:unknown,email:unknown){
   if(requestOrigin!==appOrigin)return fail(403,'ORIGIN_FORBIDDEN');
   if(typeof email!=='string'||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail(400,'EMAIL_INVALID');
   const normalized=email.toLowerCase();
   try{
    cleanup();const key=digest(normalized),t=now(),limit=limits.get(key);
    if(limit&&limit.count>=3||limits.size>=1000||flows.size>=100||sessions.size>=100)return fail(429,'LOGIN_LIMIT');
    limits.set(key,{until:limit?.until??t+300000,count:(limit?.count??0)+1});
    const subject=await approved(normalized);if(typeof subject!=='string'||!subject.trim()||subject.length>512)return fail(403,'OPERATOR_NOT_APPROVED');
    const {response}=await call('/email-otp/send-verification-otp','POST',{email:normalized,type:'sign-in'});
    if(!response.ok)return fail(503,'LOGIN_PROVIDER_UNAVAILABLE');
    const token=randomBytes(32).toString('hex');flows.set(digest(token),{email:normalized,subject,expires:t+300000,attempts:0,busy:false});
    return {ok:true as const,status:200,code:'CODE_REQUESTED',setCookies:[cookie(FLOW,token,300)]};
   }catch{return fail(503,'LOGIN_PROVIDER_UNAVAILABLE');}
  },
  async complete(requestOrigin:unknown,header:unknown,otp:unknown){
   if(requestOrigin!==appOrigin)return fail(403,'ORIGIN_FORBIDDEN');
   const token=operatorCredential(header,FLOW);if(!token)return fail(401,'LOGIN_REQUIRED');
   try{
    cleanup();const key=digest(token),flow=flows.get(key);
    if(!flow||flow.busy||flow.attempts>=5)return fail(401,'LOGIN_REQUIRED');
    // Lock before awaiting; logout/expiry removes this object and prevents late issuance.
    flow.busy=true;flow.attempts++;
    if(typeof otp!=='string'||!/^\d{4,10}$/.test(otp))return fail(400,'CODE_INVALID');
    if(await approved(flow.email)!==flow.subject)return fail(403,'OPERATOR_NOT_APPROVED');
    const {response}=await call('/sign-in/email-otp','POST',{email:flow.email,otp});
    if(!response.ok)return fail(401,'LOGIN_REJECTED');
    const upstream=upstreamCookies(response),person=await identity(upstream);
    if(!person||person.subject!==flow.subject||person.email!==flow.email||await approved(flow.email)!==flow.subject)return fail(403,'OPERATOR_NOT_APPROVED');
    cleanup();if(flows.get(key)!==flow||flow.expires<=now())return fail(401,'LOGIN_REQUIRED');
    if(sessions.size>=100)return fail(429,'LOGIN_LIMIT');
    const local=randomBytes(32).toString('hex'),t=now(),expires=Math.min(t+600000,person.expires);
    flows.delete(key);sessions.set(digest(local),{upstream,subject:person.subject,created:t,expires});
    const old=operatorCredential(header);if(old)sessions.delete(digest(old));
    return {ok:true as const,status:200,code:'SIGNED_IN',setCookies:[cookie(FLOW,'',0),cookie(COOKIE,local,Math.max(0,Math.floor((expires-t)/1000)))]};
   }catch{return fail(503,'LOGIN_PROVIDER_UNAVAILABLE');}
   finally{const f=flows.get(digest(token));if(f)f.busy=false;}
  },
  async verifyIdentity(credential:string):Promise<VerifiedOperatorIdentity|null>{
   cleanup();if(!/^[a-f0-9]{64}$/.test(credential))return null;
   const key=digest(credential),session=sessions.get(key);if(!session)return null;
   const person=await identity(session.upstream);
   if(!person||person.subject!==session.subject||await approved(person.email)!==session.subject){sessions.delete(key);return null;}
   if(sessions.get(key)!==session||session.expires<=now())return null;
   return {issuer:authBase,audience:appOrigin,subject:person.subject,authenticatedAtMs:session.created,expiresAtMs:Math.min(session.expires,person.expires)};
  },
  logout(requestOrigin:unknown,header:unknown){
   if(requestOrigin!==appOrigin)return fail(403,'ORIGIN_FORBIDDEN');
   const token=operatorCredential(header);if(token)sessions.delete(digest(token));
   const flow=operatorCredential(header,FLOW);if(flow)flows.delete(digest(flow));
   return {ok:true as const,status:200,code:'SIGNED_OUT_LOCALLY',setCookies:[cookie(COOKIE,'',0),cookie(FLOW,'',0)]};
  }
 };
}
