'use strict';
/** V8.26 hosted-Windows-only executed guard expressions with MOCKED CIM.
 * No production supervisor, Windows service, SQL, printer or reader process.
 * Tests the actual function/gate strings exported by V8.20 and V8.22.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {FUNCTION,INVOCATION,OLD,STAGED}=require('./comandas_supervisor_guard_v820_offline.cjs');
const {INJECT}=require('./comandas_supervisor_prelaunch_v822_offline.cjs');
assert.equal(process.platform,'win32','HOSTED_WINDOWS_ONLY');
assert.equal(process.env.GITHUB_ACTIONS,'true','GITHUB_ACTIONS_REQUIRED');
assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted','GITHUB_HOSTED_ONLY');
assert.ok(process.env.RUNNER_TEMP,'RUNNER_TEMP_REQUIRED');
assert.ok(fs.statSync(process.env.RUNNER_TEMP).isDirectory(),'RUNNER_TEMP_INVALID');
assert.ok(FUNCTION.join('\n').includes('Get-CimInstance -ClassName Win32_Process'));
assert.ok(INVOCATION.join('\n').includes('Stop-Fatal "CUTOVER_QUIESCENCE_NOT_PROVEN"'));
assert.ok(INJECT.join('\n').includes('Stop-Fatal "CUTOVER_PRELAUNCH_NOT_QUIET"'));
const scenarios=[
 {id:'empty_inventory',mock:'EMPTY',allow:true},
 {id:'unrelated_powershell',mock:'OTHER',allow:true},
 {id:'own_process_skipped',mock:'SELF',allow:true},
 {id:'old_orphan_no_child_record',mock:'OLD',allow:false,reason:'ACTIVE'},
 {id:'staged_orphan_no_child_record',mock:'STAGED',allow:false,reason:'ACTIVE'},
 {id:'both_generations',mock:'BOTH',allow:false,reason:'ACTIVE'},
 {id:'old_path_uppercase',mock:'OLD_UPPER',allow:false,reason:'ACTIVE'},
 {id:'blank_process_command',mock:'BLANK',allow:false,reason:'UNKNOWN'},
 {id:'null_process_command',mock:'NULL_CMD',allow:false,reason:'UNKNOWN'},
 {id:'cim_unavailable',mock:'THROW',allow:false,reason:'UNKNOWN'},
 {id:'invalid_process_id',mock:'BAD_PID',allow:false,reason:'UNKNOWN'}
];
const fixture = "$ErrorActionPreference='Stop'\nSet-StrictMode -Version Latest\n$script:MockCase='EMPTY'\n$script:CimCalls=0\n$script:MockOld=__OLD__\n$script:MockStaged=__STAGED__\nfunction Get-CimInstance {\n param([string]$ClassName,[string]$Filter,[string]$ErrorAction)\n $script:CimCalls++\n if($ClassName -cne 'Win32_Process') {throw 'UNEXPECTED_MOCK_CIM_CLASS'}\n if($Filter -cne \"Name='powershell.exe' OR Name='pwsh.exe'\") {throw 'UNEXPECTED_MOCK_FILTER'}\n $base=[int]$PID+200\n switch($script:MockCase) {\n  'EMPTY' {return @()}\n  'OTHER' {return @([pscustomobject]@{ProcessId=$base;CommandLine='pwsh.exe -NoProfile -File harmless-fixture.ps1'})}\n  'SELF' {return @([pscustomobject]@{ProcessId=$PID;CommandLine=('pwsh.exe '+$script:MockOld)})}\n  'OLD' {return @([pscustomobject]@{ProcessId=$base;CommandLine=('powershell.exe -File '+$script:MockOld)})}\n  'STAGED' {return @([pscustomobject]@{ProcessId=$base;CommandLine=('powershell.exe -File '+$script:MockStaged)})}\n  'BOTH' {return @([pscustomobject]@{ProcessId=$base;CommandLine=$script:MockOld},[pscustomobject]@{ProcessId=($base+1);CommandLine=$script:MockStaged})}\n  'OLD_UPPER' {return @([pscustomobject]@{ProcessId=$base;CommandLine=$script:MockOld.ToUpperInvariant()})}\n  'BLANK' {return @([pscustomobject]@{ProcessId=$base;CommandLine='  '})}\n  'NULL_CMD' {return @([pscustomobject]@{ProcessId=$base;CommandLine=$null})}\n  'THROW' {throw 'SYNTHETIC_CIM_UNAVAILABLE'}\n  'BAD_PID' {return @([pscustomobject]@{ProcessId='invalid';CommandLine='pwsh.exe -File fixture.ps1'})}\n  default {throw 'UNEXPECTED_MOCK_CASE'}\n }\n}\nfunction Stop-Fatal([string]$Reason){throw ('SIMULATED_STOP:'+ $Reason)}\n__FUNCTION__\nfunction Invoke-Guard([string]$stage){\n $state=@{blocked=$null}\n try{\n  if($stage -eq 'startup'){\n__STARTUP__\n  }elseif($stage -eq 'prelaunch'){\n__PRELAUNCH__\n  }else{throw 'UNKNOWN_STAGE'}\n  return [pscustomobject]@{status='ALLOW';halt='';reason=''}\n }catch{\n  $s=[string]$_.Exception.Message\n  if($s.StartsWith('SIMULATED_STOP:')){\n   return [pscustomobject]@{status='BLOCK';halt=$s.Substring(15);reason=[string]$state.blocked}\n  }\n  throw 'HARNESS_UNEXPECTED_GUARD_ERROR'\n }\n}\n$results=@()\n$cases=@(ConvertFrom-Json -InputObject '__SCENARIOS__')\nforeach($scenario in $cases){\n $script:MockCase=[string]$scenario.mock\n $callsBefore=$script:CimCalls\n $first=Invoke-Guard 'startup'\n $second=Invoke-Guard 'prelaunch'\n $results+=@([pscustomobject]@{\n  id=[string]$scenario.id\n  startup_status=$first.status\n  startup_halt=$first.halt\n  startup_reason=$first.reason\n  prelaunch_status=$second.status\n  prelaunch_halt=$second.halt\n  cim_calls=($script:CimCalls-$callsBefore)\n })\n}\n# A previously clean scan is invalidated by an unrecorded old process\n# appearing between startup and prelaunch; only a synthetic mock changes.\n$script:MockCase='EMPTY'\n$first=Invoke-Guard 'startup'\n$script:MockCase='OLD'\n$second=Invoke-Guard 'prelaunch'\n$results+=@([pscustomobject]@{\n id='appears_between_gates';startup_status=$first.status\n startup_halt=$first.halt;startup_reason=$first.reason\n prelaunch_status=$second.status;prelaunch_halt=$second.halt;cim_calls=2\n})\n[pscustomobject]@{schema='deliveryos.v826.executed-guard-expression.fixture.v1'\n results=@($results);mocked_cim=$true;real_cim_used=$false\n supervisor_executed=$false;reader_process_started=$false\n service_control=$false;sql=$false;printer=$false;spooler=$false\n}|ConvertTo-Json -Depth 6 -Compress\n";

const casesJson=JSON.stringify(scenarios);
assert.ok(!casesJson.includes("'"),'UNSAFE_MOCK_CASE_LITERAL');
const ps=fixture
 .replace('__OLD__',"'"+OLD+"'")
 .replace('__STAGED__',"'"+STAGED+"'")
 .replace('__FUNCTION__',FUNCTION.join('\n'))
 .replace('__STARTUP__',INVOCATION.join('\n'))
 .replace('__PRELAUNCH__',INJECT.join('\n'))
 .replace('__SCENARIOS__',casesJson);
assert.ok(!/__OLD__|__STAGED__|__FUNCTION__|__STARTUP__|__PRELAUNCH__|__SCENARIOS__/.test(ps));
const root=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,'v826-guard-'));
let checks=0;
try{
 const file=path.join(root,'mocked-guard.ps1');
 fs.writeFileSync(file,ps,{flag:'wx',encoding:'utf8'});
 const proc=spawnSync('pwsh.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',file],
  {encoding:'utf8',timeout:15000,maxBuffer:128*1024,cwd:root,
   env:{PATH:process.env.PATH,PSModulePath:process.env.PSModulePath}});
 assert.equal(proc.status,0,'FIXTURE_RUN_FAILED: '+String(proc.stderr).slice(0,340));
 assert.equal(proc.stderr,'','FIXTURE_STDERR');
 const lines=proc.stdout.trim().split(/\r?\n/).filter(Boolean);
 assert.equal(lines.length,1,'FIXTURE_OUTPUT_NOT_UNIQUE');
 const data=JSON.parse(lines[0]);
 assert.equal(data.schema,'deliveryos.v826.executed-guard-expression.fixture.v1');
 for(const name of ['mocked_cim','real_cim_used','service_control','sql','printer','reader_process_started']){
  assert.equal(data[name],name==='mocked_cim',name);
 }
 assert.equal(data.results.length,scenarios.length+1);
 for(let i=0;i<scenarios.length;i++){
  const s=scenarios[i],x=data.results[i];
  assert.equal(x.id,s.id);
  assert.equal(x.cim_calls,2,'two mocked CIM reads '+s.id);
  if(s.allow){
   assert.equal(x.startup_status,'ALLOW',s.id);
   assert.equal(x.prelaunch_status,'ALLOW',s.id);
  }else{
   assert.equal(x.startup_status,'BLOCK',s.id);
   assert.equal(x.prelaunch_status,'BLOCK',s.id);
   assert.equal(x.startup_halt,'CUTOVER_QUIESCENCE_NOT_PROVEN',s.id);
   assert.equal(x.prelaunch_halt,'CUTOVER_PRELAUNCH_NOT_QUIET',s.id);
   assert.equal(x.startup_reason,'CUTOVER_GENERATION_'+s.reason,s.id);
  }
  checks++;
 }
 const race=data.results[scenarios.length];
 assert.equal(race.id,'appears_between_gates');
 assert.equal(race.startup_status,'ALLOW');
 assert.equal(race.prelaunch_status,'BLOCK');
 assert.equal(race.prelaunch_halt,'CUTOVER_PRELAUNCH_NOT_QUIET');
 checks++;
 console.log(JSON.stringify({schema:'deliveryos.v826.windows-executed-guard-gate.v1',
  status:'PASS',checks,mocked_inventory_only:true,
  real_supervisor_executed:false,real_watcher_executed:false,
  atomic_cutover_proven:false,race_after_final_gate_excluded:false,
  effects:{sql:false,service:false,printer:false,spooler:false,remote:false}}));
}finally{
 fs.rmSync(root,{recursive:true,force:true});
}
