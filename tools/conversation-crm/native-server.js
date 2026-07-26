#!/usr/bin/env node
'use strict';

const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {NativeConversationRuntime,safeError,loadCanonicalCatalogs,runScenarioOnRuntime}=require('../../src/conversation-crm/native');
const {HUMAN_TEST_GROUPS}=require('./human-test-catalog');

const APP_ROOT=path.join(__dirname,'simulator','app');
const MAX_BODY_BYTES=32*1024;
function validateHost(host,allowIpv6Loopback=false){if(host==='127.0.0.1')return host;if(host==='::1'&&allowIpv6Loopback)return host;const error=new Error('host_not_allowed');error.code='HOST_NAO_PERMITIDO';throw error;}
function send(res,status,body,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"});res.end(body);}
function json(res,status,value){send(res,status,JSON.stringify(value));}
async function readJson(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY_BYTES){const error=new Error('payload_too_large');error.code='PAYLOAD_TOO_LARGE';throw error;}chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{const error=new Error('invalid_json');error.code='INVALID_JSON';throw error;}}
function staticFile(res,name,type){send(res,200,fs.readFileSync(path.join(APP_ROOT,name)),type);}

function createNativeServer(options={}){
  const runtimeOptions={runtimeRoot:options.runtimeRoot,projectRoot:options.projectRoot,flagsFile:options.flagsFile};
  const scenarios=loadCanonicalCatalogs().scenarios.scenarios;
  let runtime=options.runtime||new NativeConversationRuntime(runtimeOptions);
  let manualTurn=0;
  const evaluations=[];
  const server=http.createServer(async(req,res)=>{try{
    if(req.method==='GET'&&req.url==='/')return staticFile(res,'index.html','text/html; charset=utf-8');
    if(req.method==='GET'&&req.url==='/app.js')return staticFile(res,'app.js','application/javascript; charset=utf-8');
    if(req.method==='GET'&&req.url==='/styles.css')return staticFile(res,'styles.css','text/css; charset=utf-8');
    if(req.method==='GET'&&req.url==='/api/health')return json(res,200,{ok:true,mode:'conversation_native_simulated_v1',synthetic:true,seed:runtime.seed,clock:runtime.clock.iso(),real_drivers:false});
    if(req.method==='GET'&&req.url==='/api/cases')return json(res,200,{cases:scenarios.map((item)=>({id:item.scenario_id,scenario_id:item.scenario_id,category:item.archetype,message:item.input,context:{scenario_id:item.scenario_id,synthetic:true}}))});
    if(req.method==='GET'&&req.url==='/api/human-test-groups')return json(res,200,{groups:HUMAN_TEST_GROUPS,synthetic:true,oracle_exposed:false});
    if(req.method==='GET'&&req.url==='/api/native/snapshot')return json(res,200,{ok:true,snapshot:runtime.snapshot()});
    if(req.method==='GET'&&req.url==='/api/native/drivers')return json(res,200,{ok:true,drivers:runtime.registry.manifests()});
    if(req.method==='POST'&&req.url==='/api/triage'){const body=await readJson(req);manualTurn+=1;const messageId=`SIM-MANUAL-${String(manualTurn).padStart(4,'0')}`;const input={synthetic:true,message_type:'text',content:String(body.message||''),channel:'synthetic',subject_id:'SIM-SUBJECT-MANUAL',conversation_id:'SIM-CONV-MANUAL',message_id:messageId,correlation_id:`SIM-CORR-${messageId}`,idempotency_key:`manual:${messageId}`,occurred_at:runtime.clock.iso(),turn_order:manualTurn,unit_id:'SIM-UNIT-001',context:{...(body.context||{}),synthetic:true}};return json(res,200,{ok:true,result:runtime.processMessage(input)});}
    if(req.method==='POST'&&req.url==='/api/evaluations'){const body=await readJson(req);const verdict=String(body.verdict||'').slice(0,64);const note=String(body.note||'').trim().slice(0,500);const allowed=new Set(['correct','incorrect','bad_response','wrong_severity','wrong_block','should_be_human','should_not_be_human','experience_note']);if(!allowed.has(verdict)){const error=new Error('invalid_evaluation');error.code='INVALID_EVALUATION';throw error;}evaluations.push(Object.freeze({evaluation_id:`SIM-EVAL-${String(evaluations.length+1).padStart(4,'0')}`,case_id:String(body.case_id||'manual').slice(0,64),verdict,note,synthetic:true}));return json(res,200,{ok:true,evaluation_id:evaluations.at(-1).evaluation_id,stored:'memory_only'});}
    const scenarioMatch=req.url?.match(/^\/api\/native\/scenarios\/(TATA-SC-\d{3})$/);if(req.method==='POST'&&scenarioMatch)return json(res,200,{ok:true,result:runScenarioOnRuntime(runtime,scenarioMatch[1])});
    if(req.method==='POST'&&req.url==='/api/native/clock'){const body=await readJson(req);return json(res,200,{ok:true,clock:runtime.clock.advance(Number(body.advance_ms))});}
    if(req.method==='POST'&&req.url==='/api/native/replay'){runtime=new NativeConversationRuntime(runtimeOptions);return json(res,200,{ok:true,replay_status:'completed',snapshot:runtime.snapshot()});}
    if(req.method==='POST'&&req.url==='/api/native/reset'){const root=runtime.runtimeRoot;fs.rmSync(root,{recursive:true,force:true});runtime=new NativeConversationRuntime({...runtimeOptions,runtimeRoot:root});manualTurn=0;evaluations.length=0;return json(res,200,{ok:true,reset:true,clock:runtime.clock.iso()});}
    return json(res,404,{ok:false,error_code:'NOT_FOUND'});
  }catch(error){const safe=safeError(error);return json(res,error?.code==='PAYLOAD_TOO_LARGE'?413:400,{ok:false,...safe});}});
  server.nativeRuntime=()=>runtime;server.evaluations=()=>[...evaluations];return server;
}

function start(options={}){const host=validateHost(options.host||'127.0.0.1',options.allowIpv6Loopback===true);const port=options.port===undefined?4179:Number(options.port);if(!Number.isInteger(port)||port<0||port>65535){const error=new Error('port_invalid');error.code='PORTA_INVALIDA';throw error;}const server=createNativeServer(options);server.listen(port,host,()=>{const actual=server.address().port;process.stdout.write(`Chatbot Nativo DeliveryOS V1 em http://${host}:${actual}\n`);process.stdout.write('Somente simulação local; drivers reais desativados.\n');});return server;}
if(require.main===module)start();
module.exports={MAX_BODY_BYTES,validateHost,createNativeServer,start};
