'use strict';
const {spawn}=require('node:child_process');const path=require('node:path');
class SqlSource {
 constructor({executable='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',script=path.join(__dirname,'sql-source.ps1'),spawnProcess=spawn}={}) {
  const args=['-NoLogo','-NoProfile','-NonInteractive'];
  // The Windows service account has no per-user execution policy. Permit the
  // locally staged script in this child session while retaining signature checks for remote files.
  if(path.win32.basename(executable).toLowerCase()==='powershell.exe'){
   args.push('-ExecutionPolicy','RemoteSigned');
  }
  args.push('-File',script);
  this.child=spawnProcess(executable,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.pending=null;this.buffer='';this.dead=false;
  this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',s=>{this.buffer+=s;if(Buffer.byteLength(this.buffer)>4*1024*1024)return this.fail('SQL_RESPONSE_BOUNDS');
   const i=this.buffer.indexOf('\n');if(i<0)return;const line=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+1);if(this.buffer.trim())return this.fail('SQL_RESPONSE_FRAMING');const p=this.pending;
   if(!p)return this.fail('UNSOLICITED_RESPONSE');this.pending=null;clearTimeout(p.timer);
   try{const v=JSON.parse(line);if(v.ok!==true)throw Error(['LOCK_TIMEOUT','QUERY_TIMEOUT'].includes(v.code)?v.code:'SQL_CAPTURE_FAILED');p.resolve(v.value);}catch(e){p.reject(Error(/^[A-Z_]+$/.test(e.message)?e.message:'SQL_RESPONSE_INVALID'));}
  });
  let stderrTail='';
  this.child.stderr.setEncoding('utf8');
  this.child.stderr.on('data',chunk=>{stderrTail=(stderrTail+chunk).slice(-4096);});
  this.child.on('error',()=>this.fail('SQL_PROCESS_FAILED'));
  this.child.on('exit',()=>{this.dead=true;});
  // Windows can deliver the last stderr line after exit. Only close proves the pipe drained.
  this.child.on('close',()=>{
   const startup=/^READER_V3_STARTUP (SQL_BOOT_(?:STDIO_FAILED|WINDOWS_IDENTITY_FAILED|CONNECT_FAILED|LOGIN_CHECK_FAILED|LOGIN_MISMATCH)|SQL_PROTOCOL_STOPPED)\r?$/m.exec(stderrTail);
   const blocked=/PSSecurityException/.test(stderrTail) && /FullyQualifiedErrorId\s*:\s*UnauthorizedAccess/.test(stderrTail);
   this.fail(startup?.[1] ?? (blocked ? 'SQL_BOOT_POWERSHELL_BLOCKED' : 'SQL_PROCESS_EXITED'));
  });
 }
 fail(code){this.dead=true;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error(code));this.pending=null;}this.child.kill();}
 request(q){if(this.dead)return Promise.reject(Error('SQL_SOURCE_CLOSED'));if(this.pending)return Promise.reject(Error('SQL_OVERLAP'));
  return new Promise((resolve,reject)=>{this.pending={resolve,reject,timer:setTimeout(()=>this.fail('SQL_PROCESS_TIMEOUT'),6000)};this.child.stdin.write(JSON.stringify(q)+'\n',e=>{if(e)this.fail('SQL_PIPE_FAILED');});});}
 discover(c,until){return this.request({op:'discover',after:c.time,sale:c.sale,order:c.order,until});}
 capture(r){return this.request({op:'capture',sale:r.NRVENDAREST,order:r.NRCOMANDA});}
 close(){this.fail('SQL_SOURCE_CLOSED');}
}
module.exports={SqlSource};
