'use strict';
// Offline contract tests. These do not compile/run C#; native Windows proof remains a separate gate.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../../runtime/silent-runner/SilentObserverLab.cs'),'utf8');
let passed=0;
const check=(name,test)=>{assert.ok(test,name);passed++;};
const expected=[
  'deliveryos.silent-fixture.v1','FICTIONAL_ONLY',
  'CONTROL_DIAGNOSTIC_NOT_REAL_PROOF','STRUCTURE_ONLY_UNVERIFIED'
];
const validator=contents=>{
  if(Buffer.byteLength(contents,'utf8')>1024)return false;
  const lines=contents.split(/\r?\n/).filter((x,i,a)=>i!==a.length-1||x!=='');
  if(lines.length!==4)return false;
  const desired=new Map([['schema',expected[0]],['source',expected[1]],['reader',expected[2]],['gestor',expected[3]]]);
  for(const line of lines){const parts=line.split('=');if(parts.length!==2||!desired.has(parts[0])||desired.get(parts[0])!==parts[1])return false;desired.delete(parts[0]);}
  return desired.size===0;
};
const ok='schema=deliveryos.silent-fixture.v1\nsource=FICTIONAL_ONLY\nreader=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF\ngestor=STRUCTURE_ONLY_UNVERIFIED\n';
check('valid fictional payload',validator(ok));
check('out-of-order valid strict dictionary',validator(ok.split('\n').filter(Boolean).reverse().join('\n')+'\n'));
check('merchant proven impossible',!validator(ok.replace('STRUCTURE_ONLY_UNVERIFIED','MERCHANT_PROVEN')));
check('reader real proof impossible',!validator(ok.replace('CONTROL_DIAGNOSTIC_NOT_REAL_PROOF','REAL_ORDERS')));
check('reject IDs',!validator(ok+'orderId=1234\n'));
check('reject PII',!validator(ok+'customer=Person\n'));
check('reject duplicate',!validator(ok.replace('source=FICTIONAL_ONLY','schema=deliveryos.silent-fixture.v1')));
check('reject malformed delimiter',!validator(ok.replace('source=FICTIONAL_ONLY','source==FICTIONAL_ONLY')));
check('reject extra data',!validator(ok+'fifth=extra\n'));
check('reject huge data',!validator(ok+'X'.repeat(1024)));
check('reject empty',!validator(''));
check('fixture marker required',source.includes('DELIVERYOS_SILENT_TEST_ONLY_V1')&&source.includes('DELIVERYOS_LAB_ONLY.txt'));
check('lab dirname guard',source.includes('deliveryos-silent-lab')&&source.includes('ReparsePoint'));
check('strict bounded runtime',source.includes('ticks <= 8')&&source.includes('sleepMs <= 1000'));
check('singleton mutex',source.includes('Local\\DeliveryOS_Silent_Fixture_Only_v1')&&source.includes('Mutex(true'));
check('unexpected exceptions never display UI',source.includes('catch (Exception) { return 26; }'));
check('fixture binary itself refuses cashier PC',source.includes('Environment.MachineName, "CAIXA_MOOCA"')&&source.includes('return 27;'));
check('zero publishable',source.includes('\\\"ordersPublishable\\\": 0'));
check('zero personal data export',source.includes('\\\"customerFieldsExported\\\": 0')&&source.includes('\\\"orderIdsExported\\\": 0'));
check('zero network declaration',source.includes('\\\"networkRequests\\\": 0'));
check('zero window declaration',source.includes('\\\"windowActions\\\": 0'));
check('atomic status write',source.includes('File.Replace(tmp,status,null)')&&source.includes('File.Move(tmp,status)'));
const forbidden=[/Process\.Start\s*\(/,/System\.Net\./,/System\.Windows\.Forms/,/DllImport\s*\(/,/ShowWindow\s*\(/,/schtasks/i,/taskschd/i,/Invoke-WebRequest/i,/HttpClient/i,/HttpWebRequest/i,/ChromeDriver/i,/msedge\.exe/i,/ifood\.com\.br/i];
for(const regex of forbidden){check('no forbidden API '+regex,!regex.test(source));}
check('no secrets',!/(?:password|cookie|authorization|bearer\s)/i.test(source));
check('GUI subsystem compile guide',source.includes('/target:winexe'));
const nativeHarness=fs.readFileSync(path.join(__dirname,'verify-windows-fixture.ps1'),'utf8');
check('native harness rejects cashier machine',nativeHarness.includes("COMPUTERNAME -eq 'CAIXA_MOOCA'"));
check('native harness checks visible HWND',nativeHarness.includes('VisibleForPid')&&nativeHarness.includes('NO_VISIBLE_HWND_RUNNING'));
check('native harness checks foreground',nativeHarness.includes('FOCUS_UNCHANGED'));
check('native harness does not install scheduled tasks',!/(Register-ScheduledTask|schtasks\.exe|New-ScheduledTask)/i.test(nativeHarness));
check('native harness compiles winexe',nativeHarness.includes('/target:winexe'));
const systemLogonFixture=fs.readFileSync(path.join(__dirname,'verify-system-logon-metadata-windows-lab.ps1'),'utf8');
check('SYSTEM metadata fixture refuses cashier',systemLogonFixture.includes("COMPUTERNAME -eq 'CAIXA_MOOCA'"));
check('SYSTEM metadata fixture requires disposable GitHub Windows runner',systemLogonFixture.includes("GITHUB_ACTIONS -ne 'true'") && systemLogonFixture.includes("GITHUB_REPOSITORY -ne 'cesarspichencoff-cmyk/delviery-os'"));
check('SYSTEM metadata fixture tasks disabled and cannot demand start',systemLogonFixture.includes('New-ScheduledTaskSettingsSet -Disable -DisallowDemandStart'));
check('SYSTEM metadata fixture cannot run scheduled tasks',!systemLogonFixture.includes('Start-ScheduledTask') && !systemLogonFixture.includes('Enable-ScheduledTask'));
check('SYSTEM metadata fixture uses unique tasks and cleans up',systemLogonFixture.includes('[Guid]::NewGuid()') && systemLogonFixture.includes('Unregister-ScheduledTask'));
console.log('SILENT_OBSERVER_LAB_CONTRACT_PASS '+passed+'/'+passed+' (STATIC_OFFLINE_ONLY)');
require('./run-reader-observer-noninteractive-review-tests.cjs');
