'use strict';
// Host-only proof. Credentials and browser storage remain local and ephemeral.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,base='http://100.107.78.202:5193';
async function main(){
  const secrets=JSON.parse(fs.readFileSync(path.join(root,'private-local.json'),'utf8'));
  const manager=secrets.users.find(u=>u.role==='gerente');
  const rider=secrets.users.find(u=>u.role==='motoboy_interno');
  assert(manager&&rider,'Synthetic manager/rider required');
  const results=[];
  async function check(name,token,method='GET',route='/api/copiloto/source',expected=200){
    const r=await fetch(base+route,{method,headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(8000)});
    assert.equal(r.status,expected,name);results.push({name,status:r.status});return r;
  }
  await check('anonymous_denied',null,'GET',undefined,401);
  await check('rider_denied',rider.token,'GET',undefined,403);
  await check('write_denied',manager.token,'POST',undefined,405);
  const response=await check('manager_source_status',manager.token);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const data=await response.json();assert.equal(data.unitId,'ITAIM');assert.equal(data.ordersEnabled,false);
  assert.equal(data.operationalOrderTotal,null);assert.equal(data.preview?.sourceBindingConfirmed,true);
  assert.equal(data.preview?.publishEnabled,false);assert.equal(data.preview?.sourceMode,null);
  const health=await(await check('health',null,'GET','/api/health')).json();
  assert.equal(health.copiloto,false);assert.equal(health.copiloto_source_status,true);
  assert.equal(health.gps_production,false);assert.equal(health.term_publishable,false);
  const {chromium}=require(path.join(root,'app/node_modules/playwright'));
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {for(const width of [390,1440]){
    const context=await browser.newContext({viewport:{width,height:900}});
    try {
      const page=await context.newPage();await page.goto(base+'/copiloto/');
      await page.getByRole('heading',{name:'Acesso do responsável necessário'}).waitFor();
      await page.getByLabel('Chave de acesso do ensaio').fill(manager.token);
      await page.getByRole('button',{name:'Entrar',exact:true}).click();
      await page.waitForFunction(()=>document.getElementById('login').hidden);
      await page.waitForFunction(()=>!document.getElementById('refresh').disabled);
      const title=await page.locator('#title').innerText();
      assert.notEqual(title,'Acesso do responsável necessário');assert.notEqual(title,'Consulta indisponível');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert((await page.locator('#sample').innerText()).includes('sem garantia de atualidade'));
      await page.getByRole('button',{name:'Verificar novamente'}).click();
      await page.waitForFunction(()=>!document.getElementById('refresh').disabled);
      results.push({name:'browser_'+width,pass:true});
    }finally{await context.close();}
  }}finally{await browser.close();}
  const receipt={observedAtUtc:new Date().toISOString(),scope:'HOST_HTTP_AND_NEW_HEADLESS_BROWSER_NOT_PUBLIC_PROXY_PROOF',
    results,sourceState:data.state,sampledFiles:data.preview.sampledFiles,
    producerBlocksDownstream:data.preview.producerBlocksDownstream,
    serviceState:data.preview.serviceState,ordersEnabled:false,gpsEnabled:false};
  fs.writeFileSync(path.join(root,'copiloto-source-proof.json'),JSON.stringify(receipt,null,2));
  console.log('COPILOTO_SOURCE_HOST_PASS',JSON.stringify(receipt));
}
main().catch(()=>{console.error('COPILOTO_SOURCE_HOST_FAILED: inspect locally; no secrets exported');process.exitCode=1;});
