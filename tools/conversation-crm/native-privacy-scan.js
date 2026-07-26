#!/usr/bin/env node
'use strict';

const path=require('node:path');
const {resolveProjectRelative,PROJECT_ROOT}=require('../../src/conversation-crm/config');
const {scanTree}=require('../../src/conversation-crm/native/privacy-scan');
function run(argv=process.argv.slice(2)){const selected=argv[0]||'runtime/conversation-crm/native-v1';const target=resolveProjectRelative(selected,{projectRoot:PROJECT_ROOT,label:'privacy_scan_root'});const result=scanTree(target.resolved);process.stdout.write(`${JSON.stringify(result)}\n`);return result.passed?0:1;}
if(require.main===module){try{process.exitCode=run();}catch(error){process.stderr.write(`${JSON.stringify({error_code:error.code||'PRIVACY_SCAN_FAILED'})}\n`);process.exitCode=1;}}
module.exports={run};
