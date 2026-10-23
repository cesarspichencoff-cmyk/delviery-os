"use strict";
/** V8.76: disposable Windows-only runtime proof for the passive IMP metadata
 * monitor. No printer, GP, SQL, network, service or live Teknisa access.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process");
const file=path.join(__dirname,"monitor_imp_printer_metadata_only.ps1");
const source=fs.readFileSync(file,"utf8");
assert.match(source,/\[ValidateRange\(1000,\s*60000\)\]\s*\[int\]\$PollMs/);
assert.match(source,/\[ValidateRange\(1,\s*30\)\]\s*\[int\]\$SampleCount/);
assert.doesNotMatch(source,/\bwhile\s*\(\s*\$true\s*\)/i);
assert.match(source,/MONITOR_TIME_BUDGET_EXCEEDED/);
assert.match(source,/for\s*\(\s*\$sample\s*=\s*0;\s*\$sample\s*-lt\s*\$SampleCount;/);
let checks=1;
console.log("PASS 1 no unbounded polling or unsafe cadence");
if(process.env.V876_STATIC_ONLY==="1"){
 console.log("V876_STATIC_ONLY=PASS RUNTIME_NOT_EXECUTED");
 process.exit(0);
}
if(process.platform!=="win32")throw Error("WINDOWS_DISPOSABLE_HOST_REQUIRED");
const invoke=(args,timeout=13000)=>spawnSync("pwsh",
 ["-NoProfile","-NonInteractive","-File",file,...args],
 {encoding:"utf8",timeout,windowsHide:true,maxBuffer:200000});
const clock=spawnSync("pwsh",
 ["-NoProfile","-NonInteractive","-Command","Get-Date -Format 'MMyyyy'; Get-Date -Format 'yyyy_MM_dd'"],
 {encoding:"utf8",timeout:8000,windowsHide:true});
assert.equal(clock.status,0,"Windows clock query failed");
const [month,prefix]=clock.stdout.trim().split(/\r?\n/);
assert.match(month,/^\d{6}$/);assert.match(prefix,/^\d{4}_\d{2}_\d{2}$/);
const root=fs.mkdtempSync(path.join(os.tmpdir(),"deliveryos-v876-disposable-"));
try{
 const dir=path.join(root,"Log",month);fs.mkdirSync(dir,{recursive:true});
 const name=prefix+"_IMP_SYNTHETIC.txt";
 const dummy=path.join(dir,name);
 fs.writeFileSync(dummy,"OFFLINE_DUMMY_METADATA_ONLY\n","utf8");
 const before=fs.readFileSync(dummy);
 const start=Date.now();
 const accepted=invoke(["-OdhenPerifericosRoot",root,"-PollMs","1000","-SampleCount","1"]);
 assert.equal(accepted.status,0,JSON.stringify({stderr:accepted.stderr,stdout:accepted.stdout}).slice(0,500));
 assert.ok(Date.now()-start<11000,"bounded poll exceeded runtime budget");
 assert.match(accepted.stdout,/INICIO /);
 assert.match(accepted.stdout,/BASE /);
 assert.match(accepted.stdout,/FIM /);
 assert.deepEqual(fs.readFileSync(dummy),before,"monitor must not change original file");
 checks++;console.log("PASS 2 one bounded sample of disposable fixture; unchanged bytes");
 for(const [parameter,value] of [["-PollMs","0"],["-PollMs","100"],["-SampleCount","0"],["-SampleCount","31"]]){
  const args=["-OdhenPerifericosRoot",root,"-PollMs","1000","-SampleCount","1"];
  const i=args.indexOf(parameter);args[i+1]=value;
  const denied=invoke(args,6000);
  assert.notEqual(denied.status,0,"invalid "+parameter+"="+value+" must fail");
  assert.deepEqual(fs.readFileSync(dummy),before);
  checks++;console.log("PASS "+checks+" invalid "+parameter+"="+value+" rejected");
 }
 const budget=invoke(["-OdhenPerifericosRoot",root,"-PollMs","60000","-SampleCount","3"],6000);
 assert.notEqual(budget.status,0,"poll budget >120s must fail");
 checks++;console.log("PASS "+checks+" cumulative 120s budget enforced");
 const missing=invoke(["-OdhenPerifericosRoot",path.join(root,"MISSING"),"-PollMs","1000","-SampleCount","1"]);
 assert.notEqual(missing.status,0);
 assert.match(missing.stdout,/SOURCE_MISSING /);
 checks++;console.log("PASS "+checks+" missing fixture source handled without creation");
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log("PASS V876_MONITOR_BOUNDED="+checks+"/"+checks+" NO_PRINTER NO_TEKNISA NO_NETWORK NO_PRINT");
