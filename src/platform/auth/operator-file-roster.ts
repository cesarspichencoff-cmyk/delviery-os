import * as fs from 'node:fs';
import * as path from 'node:path';
import type {OperatorReadGrant} from './operator-read-authority';

interface Entry {email:string;subject:string;unitId:'ITAIM';role:'gerente'|'lider';active:boolean;approvalRef:string;expiresAt:string}
/** Server-owned approval registry. Never populate from browser claims or provider role alone.
 * The deployment must protect this file with its operator/admin ACL. No default users are granted.
 * Reads on every lookup so removal/revocation takes effect without process restart.
 */
export function createOperatorFileRoster(cfg:{file:string;issuer:string;now:()=>number}) {
 if(!path.isAbsolute(cfg.file)||!cfg.issuer.trim())throw Error('ROSTER_CONFIGURATION_REQUIRED');
 function entries():Entry[]{
  const before=fs.lstatSync(cfg.file);
  if(!before.isFile()||before.isSymbolicLink()||before.size>65536||fs.realpathSync(cfg.file)!==path.resolve(cfg.file))throw Error('ROSTER_FILE_INVALID');
  const fd=fs.openSync(cfg.file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  let raw:string;
  try{
   const opened=fs.fstatSync(fd);
   if(!opened.isFile()||opened.ino!==before.ino||opened.dev!==before.dev||opened.size!==before.size||opened.mtimeMs!==before.mtimeMs)throw Error('ROSTER_CHANGED');
   const buf=Buffer.alloc(before.size+1),n=fs.readSync(fd,buf,0,buf.length,0),after=fs.fstatSync(fd);
   if(n!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw Error('ROSTER_CHANGED');
   raw=buf.subarray(0,n).toString('utf8');
  }finally{fs.closeSync(fd);}
  const current=fs.lstatSync(cfg.file);
  if(current.isSymbolicLink()||current.ino!==before.ino||current.dev!==before.dev||current.size!==before.size||current.mtimeMs!==before.mtimeMs)throw Error('ROSTER_CHANGED');
  const value=JSON.parse(raw.replace(/^\uFEFF/,''));
  if(value?.schema!=='deliveryos.operator-roster.v1'||!Array.isArray(value.entries)||value.entries.length>100)throw Error('ROSTER_SCHEMA_INVALID');
  const emails=new Set<string>(),subjects=new Set<string>();
  for(const e of value.entries){
   if(!e||typeof e.email!=='string'||e.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)||e.email!==e.email.toLowerCase()||
    typeof e.subject!=='string'||!e.subject.trim()||e.subject.length>512||e.unitId!=='ITAIM'||!['gerente','lider'].includes(e.role)||typeof e.active!=='boolean'||
    typeof e.approvalRef!=='string'||!e.approvalRef.trim()||e.approvalRef.length>512||
    typeof e.expiresAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(e.expiresAt)||!Number.isFinite(Date.parse(e.expiresAt))||new Date(e.expiresAt).toISOString()!==e.expiresAt||
    emails.has(e.email)||subjects.has(e.subject))throw Error('ROSTER_ENTRY_INVALID');
   emails.add(e.email);subjects.add(e.subject);
  }
  return value.entries;
 }
 function live(e:Entry){const now=cfg.now();if(!Number.isSafeInteger(now))throw Error('ROSTER_CLOCK_INVALID');return e.active&&Date.parse(e.expiresAt)>now;}
 return {
  async approvedSubject(email:string):Promise<string|null>{
   const e=entries().find(e=>e.email===email);return e&&live(e)?e.subject:null;
  },
  async lookupGrant(issuer:string,subject:string,unitId:string):Promise<OperatorReadGrant|null>{
   if(issuer!==cfg.issuer||unitId!=='ITAIM')return null;
   const e=entries().find(e=>e.subject===subject);if(!e||!live(e))return null;
   return {issuer:cfg.issuer,subject:e.subject,unitId:e.unitId,role:e.role,active:true,approvalRef:e.approvalRef,expiresAtMs:Date.parse(e.expiresAt)};
  }
 };
}
