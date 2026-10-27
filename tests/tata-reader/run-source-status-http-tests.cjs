'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {criarLeitorStatusTata:createReader}=require('../../dist/src/entregas/pilot/tata-source-status.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'copiloto-source-http-'));
const source=path.join(root,'source'),events=path.join(source,'state','reader-events-v1');
const bindingPath=path.join(root,'binding.json');
const binding={schema:'deliveryos.tata-source-binding.v1',hostName:os.hostname(),unitId:'ITAIM',
  sourceUnitId:'LAB',sourceStoreId:'01',evidence:'synthetic-only',publishEnabled:false};
let child,passed=0;
const base='http://127.0.0.1:15393';
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
async function call(token,method='GET',route='/api/copiloto/source'){
  const r=await fetch(base+route,{method,headers:token?{Authorization:'Bearer '+token}:{}});
  return {status:r.status,body:await r.text(),cache:r.headers.get('cache-control')};
}
(async()=>{try{
  fs.mkdirSync(events,{recursive:true});
  fs.writeFileSync(bindingPath,JSON.stringify(binding));
  fs.writeFileSync(path.join(source,'state','production-service-state.json'),JSON.stringify({
    schema:'deliveryos.production-service-shift-state.v2',operational_date:'2026-10-14',service:'LUNCH',
    valid_from_local:'2026-10-14T11:00:00',valid_until_local:'2026-10-14T15:00:00',source_ref:'PRIVATE_SENTINEL'}));
  fs.writeFileSync(path.join(events,'fixture.json'),JSON.stringify({schema:'deliveryos.tata-reader-stable-order-event.v1',
    order:{CDFILIAL:'LAB',CDLOJA:'01',customer:'PRIVATE_SENTINEL',NRCOMANDA:'PRIVATE_SENTINEL'},
    ready_for_downstream_shadow:false,blockers:['SERVICE_STATE_EXPIRED_FOR_ORDER','PRIVATE_SENTINEL'],
    service_resolution:{blockers:[]}}));
  await test('disabled is explicit; partial and relative configurations refused',()=>{
    assert.equal(createReader({}).read().state,'not_configured');
    assert.throws(()=>createReader({ENTREGAS_TATA_READER_ROOT:source}),/CONFIG_INVALID/);
    assert.throws(()=>createReader({ENTREGAS_TATA_READER_ROOT:'relative',ENTREGAS_TATA_BINDING_PATH:bindingPath}),/CONFIG_INVALID/);
  });
  await test('wrong host refuses source without paths or exception leakage',()=>{
    fs.writeFileSync(bindingPath,JSON.stringify({...binding,hostName:'different-host'}));
    const r=createReader({ENTREGAS_TATA_READER_ROOT:source,ENTREGAS_TATA_BINDING_PATH:bindingPath}).read();
    assert.equal(r.state,'unavailable');assert.equal(JSON.stringify(r).includes(root),false);
    fs.writeFileSync(bindingPath,JSON.stringify(binding));
  });
  const config=JSON.parse(fs.readFileSync('config/entregas-pilot.example.json','utf8'));
  config.mode='test';config.bind='127.0.0.1';config.data_dir=path.join(root,'data');
  config.users=[{actor_id:'lab-manager',role:'gerente',label:'Synthetic manager',token:'synthetic-manager'},
    {actor_id:'lab-rider',role:'motoboy_interno',label:'Synthetic rider',token:'synthetic-rider'}];
  config.backup.auto_interval_minutes=600;
  fs.writeFileSync(path.join(root,'pilot.json'),JSON.stringify(config));
  fs.writeFileSync(path.join(root,'flags.json'),JSON.stringify({gps_capture_enabled:false}));
  const env={...process.env,ENTREGAS_ENV:'local',ENTREGAS_BIND:'127.0.0.1',ENTREGAS_UI_PORT:'15393',
    ENTREGAS_PILOT_CONFIG:path.join(root,'pilot.json'),ENTREGAS_DATA_DIR:config.data_dir,
    ENTREGAS_GPS_FLAGS_CONFIG:path.join(root,'flags.json'),ENTREGAS_HTTPS:'',
    ENTREGAS_TATA_READER_ROOT:source,ENTREGAS_TATA_BINDING_PATH:bindingPath};
  child=spawn(process.execPath,['dist/tools/entregas_pilot_server.js'],{env,stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',x=>{logs+=x});child.stderr.on('data',x=>{logs+=x});
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}
    if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}
  assert(ready,'server failed: '+logs);
  await test('anonymous denied before and after authenticated request',async()=>{
    assert.equal((await call()).status,401);assert.equal((await call('synthetic-manager')).status,200);
    assert.equal((await call()).status,401);
  });
  await test('rider forbidden and writes refused',async()=>{
    assert.equal((await call('synthetic-rider')).status,403);
    assert.equal((await call('synthetic-manager','POST')).status,405);
  });
  await test('manager gets blocked metadata, unknown total and no order content',async()=>{
    const r=await call('synthetic-manager');assert.equal(r.cache,'no-store');
    const b=JSON.parse(r.body);assert.equal(b.state,'source_blocked');assert.equal(b.operationalOrderTotal,null);
    assert.equal(b.ordersEnabled,false);assert.equal(b.preview.producerBlocksDownstream,1);
    assert.equal(b.preview.serviceState.validUntilLocal,'2026-10-14T15:00:00');
    assert.equal(r.body.includes('PRIVATE_SENTINEL'),false);assert.equal(r.body.includes(root),false);
  });
  await test('screen and navigation distinguish source status from full Copiloto',async()=>{
    const page=await call(null,'GET','/copiloto/');assert.equal(page.status,200);
    assert(page.body.includes('pilot-session-boot'));assert(page.body.includes('Ainda não há lista de pedidos'));
    const home=await call(null,'GET','/');assert(home.body.includes('Copiloto: fonte de pedidos'));
    const health=JSON.parse((await call(null,'GET','/api/health')).body);
    assert.equal(health.copiloto,false);assert.equal(health.copiloto_source_status,true);assert.equal(health.gps_production,false);
  });
  if(process.argv.includes('--browser')) {
    const {chromium}=require('playwright');const browser=await chromium.launch({headless:true});
    try {for(const width of [390,1440]) await test('browser session, blocked status, refresh and width '+width,async()=>{
      const page=await browser.newPage({viewport:{width,height:900}});
      try {
        await page.goto(base+'/copiloto/');
        await page.getByRole('heading',{name:'Acesso do responsável necessário'}).waitFor();
        await page.getByLabel('Chave de acesso do ensaio').fill('synthetic-manager');
        await page.getByRole('button',{name:'Entrar',exact:true}).click();
        await page.getByRole('heading',{name:'Fonte bloqueada para leitura'}).waitFor();
        assert((await page.locator('#window').innerText()).includes('2026-10-14 · Almoço · 11:00–15:00'));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.getByRole('button',{name:'Verificar novamente'}).click();
        await page.waitForFunction(()=>!document.getElementById('refresh').disabled);
        assert((await page.locator('#sample').innerText()).includes('1 arquivos examinados'));
        assert.equal((await page.locator('body').innerText()).includes('PRIVATE_SENTINEL'),false);
      }finally{await page.close();}
    });}finally{await browser.close();}
  }
  console.log(`SOURCE_STATUS_HTTP_PASS ${passed}`);
}finally{
  if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
  fs.rmSync(root,{recursive:true,force:true});
}})().catch(e=>{console.error(e);process.exitCode=1});
