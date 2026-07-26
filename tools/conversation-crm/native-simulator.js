#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {runScenarioIsolated,runAllCanonicalScenarios,NativeConversationRuntime}=require('../../src/conversation-crm/native');

function run(argv=process.argv.slice(2)){
  const command=argv[0]||'scenario';
  if(command==='scenario'){const id=argv[1]||'TATA-SC-001';process.stdout.write(`${JSON.stringify(runScenarioIsolated(id))}\n`);return 0;}
  if(command==='all'){const result=runAllCanonicalScenarios();process.stdout.write(`${JSON.stringify(result.summary)}\n`);return result.summary.failed?1:0;}
  if(command==='reproduce'){const id=argv[1]||'TATA-SC-193';const stage=argv[2]||'action_started';const root=fs.mkdtempSync(path.join(os.tmpdir(),'deliveryos-native-reproduce-'));try{let runtime=new NativeConversationRuntime({runtimeRoot:root});const input=runtime.scenarioInput(id);try{runtime.processMessage(input,{crashAfter:stage});}catch(error){if(error.code!=='SIMULATED_CRASH')throw error;}runtime=new NativeConversationRuntime({runtimeRoot:root});const result=runtime.processMessage(input);process.stdout.write(`${JSON.stringify({scenario_id:id,stage,seed:runtime.seed,clock:runtime.clock.iso(),recovered:true,result:result.result.status,snapshot_hash:runtime.snapshot().snapshot_hash})}\n`);return 0;}finally{fs.rmSync(root,{recursive:true,force:true});}}
  const error=new Error('command_invalid');error.code='COMMAND_INVALID';throw error;
}
if(require.main===module){try{process.exitCode=run();}catch(error){process.stderr.write(`${JSON.stringify({error_code:error.code||'NATIVE_SIMULATOR_FAILED'})}\n`);process.exitCode=1;}}
module.exports={run};
