'use strict';
const a=require('node:assert/strict'),path=require('node:path');const {SqlSource}=require('../../runtime/reader-v3/sql-client.cjs');
(async()=>{const s=new SqlSource({script:path.join(__dirname,'windows-transport.ps1')});try{for(let i=0;i<5;i++){const r=await s.discover({time:'2026-11-15T00:00:00',sale:'',order:''},'2026-11-15T23:00:00.123');a.equal(r.version,5);a.deepEqual(r.dates,['2026-11-15T00:00:00.000','2026-11-15T23:00:00.123']);}}finally{s.close();}
const realAdapter=new SqlSource();
try{
 await a.rejects(realAdapter.discover({time:'2026-11-15T00:00:00',sale:'',order:''},'2026-11-15T23:00:00.123'),
  {message:'SQL_BOOT_WINDOWS_IDENTITY_FAILED'});
}finally{realAdapter.close();}
console.log('POWERSHELL_51_TRANSPORT_PASS');})().catch(()=>{process.exitCode=1;});
