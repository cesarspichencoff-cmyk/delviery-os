'use strict';
/* Browser microbenchmark with fictional menu lines. Never loads merchant websites. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const probe=path.resolve(__dirname,'../../runtime/reporting/gestor_visible_detail_probe_v1.js');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deliveryos-detail-benchmark-'));
(async()=>{
 let ctx,requests=0;
 try{
  ctx=await chromium.launchPersistentContext(dir,{headless:true,
   executablePath:process.env.EDGE_EXE||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
   args:['--disable-extensions'],acceptDownloads:false});
  ctx.on('request',()=>requests++);
  const page=ctx.pages()[0]||await ctx.newPage();
  const rows=Array.from({length:20},(_,i)=>
   '<div data-testid="order-item"><span data-testid="item-name">Item fictício '+(i+1)+
   '</span><span data-testid="item-quantity">'+((i%4)+1)+
   '</span><span data-testid="item-option">Opção de teste</span></div>').join('');
  await page.setContent('<!doctype html><html><body><input id="focus-marker" value="simulado">'+
   '<dialog open data-testid="order-details">'+rows+'</dialog></body></html>');
  await page.addScriptTag({path:probe});
  await page.locator('#focus-marker').focus();
  const before=await page.evaluate(()=>({html:document.documentElement.outerHTML,
   focused:document.activeElement?.id||'',scrollX,scrollY}));
  const values=await page.evaluate(()=>{
   const durations=[];
   for(let i=0;i<200;i++){
    const start=performance.now();
    const found=globalThis.DeliveryGestorDetailReadOnly.readVisibleDetail(document);
    const elapsed=performance.now()-start;
    if(found.state!=='DETAIL_CANDIDATE_UNVERIFIED'||found.itemLines!==20||
       found.optionLines!==20||found.actionsExecuted!==0||found.merchantVerified!==false)
      throw Error('BAD_RESULT');
    durations.push(elapsed);
   }
   durations.sort((a,b)=>a-b);
   return {runs:durations.length,p50ms:durations[99],p95ms:durations[189],maxMs:durations[199]};
  });
  const after=await page.evaluate(()=>({html:document.documentElement.outerHTML,
   focused:document.activeElement?.id||'',scrollX,scrollY}));
  assert.deepEqual(after,before,'observer must not mutate DOM, focus or scroll');
  assert.equal(requests,0,'no network');
  assert.ok(values.p95ms<1000,'unreasonable latency');
  console.log(JSON.stringify({schema:'deliveryos.detail.fixture-benchmark.v1',edgeReal:true,
   data:'20_SYNTHETIC_LINES',runs:values.runs,
   p50ms:Number(values.p50ms.toFixed(3)),
   p95ms:Number(values.p95ms.toFixed(3)),
   maxMs:Number(values.maxMs.toFixed(3)),
   noFocusChange:true,noDOMChange:true,noScrollChange:true,networkRequests:requests,
   provesRealMerchant:false,provesBackgroundPerformance:false}));
 }finally{
  if(ctx)await ctx.close().catch(()=>{});
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error('DETAIL_FIXTURE_BENCHMARK_FAIL',e.name,String(e.message).slice(0,400));process.exitCode=1});
