#!/usr/bin/env node
'use strict';

const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {NativeConversationRuntime,safeError,loadCanonicalCatalogs,runScenarioOnRuntime}=require('../../src/conversation-crm/native');
const {HomologationService}=require('./homologation/service');
const {CustomerMenuHomologationService}=require('./customer-menu/service');
const {LocalHomologationWriter}=require('./homologation/local-writer');
const {CognitiveAuthorityVariantService,CognitiveAuthorityExperimentService}=require('./cognitive-authority/service');

const APP_ROOT=path.join(__dirname,'simulator','app');
const COGNITIVE_PANEL_ROOT=path.join(__dirname,'cognitive-authority','panel');
const MAX_BODY_BYTES=32*1024;
function validateHost(host,allowIpv6Loopback=false){if(host==='127.0.0.1')return host;if(host==='::1'&&allowIpv6Loopback)return host;const error=new Error('host_not_allowed');error.code='HOST_NAO_PERMITIDO';throw error;}
function send(res,status,body,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"});res.end(body);}
function json(res,status,value){send(res,status,JSON.stringify(value));}
async function readJson(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY_BYTES){const error=new Error('payload_too_large');error.code='PAYLOAD_TOO_LARGE';throw error;}chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{const error=new Error('invalid_json');error.code='INVALID_JSON';throw error;}}
function staticFile(res,name,type){send(res,200,fs.readFileSync(path.join(APP_ROOT,name)),type);}
function cognitiveStaticFile(res,name,type){send(res,200,fs.readFileSync(path.join(COGNITIVE_PANEL_ROOT,name)),type);}
function restoredManualTurn(runtime){
  return runtime.store.eventsOfType('runtime.response_registered').reduce((maximum,event)=>{
    const match=String(event.payload?.result?.message_id||'').match(/^SIM-MANUAL-(\d{4,})$/);
    return match?Math.max(maximum,Number(match[1])):maximum;
  },0);
}

function createNativeServer(options={}){
  const runtimeOptions={runtimeRoot:options.runtimeRoot,projectRoot:options.projectRoot,flagsFile:options.flagsFile};
  const scenarios=loadCanonicalCatalogs().scenarios.scenarios;
  let runtime=options.runtime||new NativeConversationRuntime(runtimeOptions);
  const localWriter=options.localWriter||new LocalHomologationWriter({...options.localWriterOptions,enabled:options.enableLocalWriter===true});
  const customerMenu=options.customerMenu||new CustomerMenuHomologationService({
    projectRoot:options.projectRoot,
    menuReviewRoot:options.menuReviewRoot,
    now:options.now,
    writerStatus:()=>localWriter.inspect()
  });
  const homologation=options.homologation||new HomologationService({
    projectRoot:options.projectRoot,
    feedbackRoot:options.feedbackRoot||options.runtimeRoot,
    chatRuntimeRoot:options.chatRuntimeRoot,
    exportRoot:options.exportRoot,
    now:options.now,
    customerMenu,
    localWriter
  });
  const ownsCognitiveRuntime=!options.cognitiveRuntimeRoot;
  const cognitiveRuntimeRoot=path.resolve(options.cognitiveRuntimeRoot||fs.mkdtempSync(path.join(os.tmpdir(),'deliveryos-cognitive-authority-b-')));
  const cognitiveCustomerMenu=options.cognitiveCustomerMenu||new CustomerMenuHomologationService({
    projectRoot:homologation.projectRoot,
    menuReviewRoot:options.menuReviewRoot,
    now:options.now,
    writerStatus:()=>localWriter.inspect()
  });
  const cognitiveHomologation=options.cognitiveHomologation||new HomologationService({
    projectRoot:homologation.projectRoot,
    feedbackRoot:cognitiveRuntimeRoot,
    chatRuntimeRoot:path.join(cognitiveRuntimeRoot,'chat-runtime'),
    exportRoot:options.exportRoot,
    now:options.now,
    customerMenu:cognitiveCustomerMenu,
    localWriter
  });
  const cognitiveVariantB=options.cognitiveVariantB||new CognitiveAuthorityVariantService({
    homologation:cognitiveHomologation,
    customerMenu:cognitiveCustomerMenu,
    localWriter
  });
  const cognitiveExperiment=options.cognitiveExperiment||new CognitiveAuthorityExperimentService({
    variantA:homologation,
    variantB:cognitiveVariantB
  });
  let manualTurn=restoredManualTurn(runtime);
  const server=http.createServer(async(req,res)=>{try{
    if(req.method==='GET'&&req.url==='/')return staticFile(res,'index.html','text/html; charset=utf-8');
    if(req.method==='GET'&&req.url==='/app.js')return staticFile(res,'app.js','application/javascript; charset=utf-8');
    if(req.method==='GET'&&req.url==='/styles.css')return staticFile(res,'styles.css','text/css; charset=utf-8');
    if(req.method==='GET'&&req.url==='/cognitive-authority')return cognitiveStaticFile(res,'index.html','text/html; charset=utf-8');
    if(req.method==='GET'&&req.url==='/cognitive-authority/app.js')return cognitiveStaticFile(res,'app.js','application/javascript; charset=utf-8');
    if(req.method==='GET'&&req.url==='/cognitive-authority/styles.css')return cognitiveStaticFile(res,'styles.css','text/css; charset=utf-8');
    if(req.method==='GET'&&req.url==='/api/health')return json(res,200,{ok:true,mode:'conversation_native_simulated_v1',synthetic:true,seed:runtime.seed,clock:runtime.clock.iso(),real_drivers:false});
    if(req.method==='GET'&&req.url==='/api/cases')return json(res,200,{cases:scenarios.map((item)=>({id:item.scenario_id,scenario_id:item.scenario_id,category:item.archetype,message:item.input,context:{scenario_id:item.scenario_id,synthetic:true}}))});
    if(req.method==='GET'&&req.url==='/api/native/snapshot')return json(res,200,{ok:true,snapshot:runtime.snapshot()});
    if(req.method==='GET'&&req.url==='/api/native/drivers')return json(res,200,{ok:true,drivers:runtime.registry.manifests()});
    if(req.method==='GET'&&req.url==='/api/homologation/bootstrap')return json(res,200,homologation.bootstrap());
    if(req.method==='GET'&&req.url?.startsWith('/api/homologation/technical')){
      const parsed=new URL(req.url,'http://127.0.0.1');
      return json(res,200,homologation.technical(parsed.searchParams.get('mode'),parsed.searchParams.get('review_id')));
    }
    if(req.method==='GET'&&req.url==='/api/homologation/summary')return json(res,200,homologation.summary());
    if(req.method==='GET'&&req.url==='/api/customer-menu/bootstrap')return json(res,200,customerMenu.bootstrap());
    if(req.method==='GET'&&req.url==='/api/cognitive-authority/bootstrap')return json(res,200,{ok:true,blind:true,financial_mode:'ZERO_EXTERNAL_COST',maximum_external_spend_brl:0,variants:['conversation_a','conversation_b'],diagnostics_hidden:true});
    const customerMenuMatch=req.url?.match(/^\/api\/customer-menu\/customers\/(SIM-CUSTOMER-\d{3})$/);
    if(req.method==='GET'&&customerMenuMatch)return json(res,200,customerMenu.customer(customerMenuMatch[1]));
    if(req.method==='POST'&&req.url==='/api/customer-menu/recommend'){const body=await readJson(req);return json(res,200,customerMenu.recommend(body));}
    if(req.method==='POST'&&req.url==='/api/customer-menu/imports/action'){const body=await readJson(req);return json(res,200,customerMenu.importAction(body));}
    if(req.method==='POST'&&req.url==='/api/customer-menu/review/action'){const body=await readJson(req);return json(res,200,customerMenu.menuReviewAction(body));}
    if(req.method==='POST'&&req.url==='/api/customer-menu/public-review/preview'){const body=await readJson(req);return json(res,200,customerMenu.publicMenuReviewPreview(body));}
    if(req.method==='POST'&&req.url==='/api/customer-menu/public-review/commit'){const body=await readJson(req);return json(res,200,customerMenu.publicMenuReviewCommit(body));}
    if(req.method==='POST'&&req.url==='/api/customer-menu/public-review/action'){const body=await readJson(req);return json(res,200,customerMenu.publicMenuFieldAction(body));}
    if(req.method==='POST'&&req.url==='/api/homologation/chat'){const body=await readJson(req);return json(res,200,await homologation.chatWithWriter(body));}
    if(req.method==='POST'&&req.url==='/api/homologation/chat/reset')return json(res,200,homologation.resetChat());
    if(req.method==='POST'&&req.url==='/api/cognitive-authority/turn'){const body=await readJson(req);return json(res,200,await cognitiveExperiment.pairedTurn(body));}
    if(req.method==='POST'&&req.url==='/api/cognitive-authority/reset')return json(res,200,cognitiveExperiment.reset());
    if(req.method==='POST'&&req.url==='/api/cognitive-authority/diagnostic-b/turn'){const body=await readJson(req);return json(res,200,await cognitiveExperiment.diagnosticB(body));}
    if(req.method==='POST'&&req.url==='/api/cognitive-authority/diagnostic-b/reset')return json(res,200,cognitiveExperiment.resetDiagnosticB());
    if(req.method==='POST'&&req.url==='/api/cognitive-authority/vote'){const body=await readJson(req);return json(res,200,cognitiveExperiment.vote(body));}
    if(req.method==='GET'&&req.url==='/api/cognitive-authority/reveal')return json(res,200,cognitiveExperiment.reveal());
    if(req.method==='GET'&&req.url==='/api/cognitive-authority/diagnostics')return json(res,200,cognitiveExperiment.diagnostics());
    if(req.method==='POST'&&req.url==='/api/homologation/feedback'){const body=await readJson(req);return json(res,200,homologation.feedback(body));}
    if(req.method==='POST'&&req.url==='/api/homologation/export')return json(res,200,homologation.export());
    if(req.method==='POST'&&req.url==='/api/homologation/session/reset'){const body=await readJson(req);return json(res,200,{ok:true,...homologation.store.resetReviewSession(body.confirmation)});}
    if(req.method==='POST'&&req.url==='/api/homologation/test-data/delete'){const body=await readJson(req);return json(res,200,{ok:true,...homologation.store.deleteSyntheticFeedback(body.confirmation)});}
    if(req.method==='POST'&&req.url==='/api/triage'){const body=await readJson(req);manualTurn+=1;const messageId=`SIM-MANUAL-${String(manualTurn).padStart(4,'0')}`;const input={synthetic:true,message_type:'text',content:String(body.message||''),channel:'synthetic',subject_id:'SIM-SUBJECT-MANUAL',conversation_id:'SIM-CONV-MANUAL',message_id:messageId,correlation_id:`SIM-CORR-${messageId}`,idempotency_key:`manual:${messageId}`,occurred_at:runtime.clock.iso(),turn_order:manualTurn,unit_id:'SIM-UNIT-001',context:{...(body.context||{}),synthetic:true}};return json(res,200,{ok:true,result:runtime.processMessage(input)});}
    const scenarioMatch=req.url?.match(/^\/api\/native\/scenarios\/(TATA-SC-\d{3})$/);if(req.method==='POST'&&scenarioMatch)return json(res,200,{ok:true,result:runScenarioOnRuntime(runtime,scenarioMatch[1])});
    if(req.method==='POST'&&req.url==='/api/native/clock'){const body=await readJson(req);return json(res,200,{ok:true,clock:runtime.clock.advance(Number(body.advance_ms))});}
    if(req.method==='POST'&&req.url==='/api/native/replay'){runtime=new NativeConversationRuntime(runtimeOptions);manualTurn=restoredManualTurn(runtime);return json(res,200,{ok:true,replay_status:'completed',snapshot:runtime.snapshot()});}
    if(req.method==='POST'&&req.url==='/api/native/reset'){const root=runtime.runtimeRoot;fs.rmSync(root,{recursive:true,force:true});runtime=new NativeConversationRuntime({...runtimeOptions,runtimeRoot:root});manualTurn=0;return json(res,200,{ok:true,reset:true,clock:runtime.clock.iso()});}
    return json(res,404,{ok:false,error_code:'NOT_FOUND'});
  }catch(error){const safe=safeError(error);return json(res,error?.code==='PAYLOAD_TOO_LARGE'?413:400,{ok:false,...safe});}});
  server.on('close',()=>{void localWriter.close();if(ownsCognitiveRuntime)fs.rmSync(cognitiveRuntimeRoot,{recursive:true,force:true});});
  server.nativeRuntime=()=>runtime;server.homologation=homologation;server.customerMenu=customerMenu;server.localWriter=localWriter;server.cognitiveExperiment=cognitiveExperiment;return server;
}

function start(options={}){const host=validateHost(options.host||'127.0.0.1',options.allowIpv6Loopback===true);const port=options.port===undefined?4179:Number(options.port);if(!Number.isInteger(port)||port<0||port>65535){const error=new Error('port_invalid');error.code='PORTA_INVALIDA';throw error;}const server=createNativeServer({...options,enableLocalWriter:options.enableLocalWriter!==false});server.listen(port,host,()=>{const actual=server.address().port;process.stdout.write(`Chatbot Nativo DeliveryOS V1 em http://${host}:${actual}\n`);process.stdout.write('Somente simulação local; drivers reais desativados.\n');});return server;}
if(require.main===module)start();
module.exports={MAX_BODY_BYTES,validateHost,createNativeServer,start};
