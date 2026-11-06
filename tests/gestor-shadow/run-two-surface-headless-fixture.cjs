'use strict';
// Purely fictional, two-page Edge headless regression: logical surfaces, not two HWNDs.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const {SCHEMA,selectWindow}=require('../../runtime/reporting/gestor_window_selector_v1.cjs');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'deliveryos-two-surface-fixture-'));
const rows=Array.from({length:20},(_,i)=>'<li role="listitem" aria-label="Pedido '+(1000+i)+' concluído">Pedido '+(1000+i)+' concluído</li>').join('');
const orderHtml='<!doctype html><html lang="pt-BR"><head><title>Dados fictícios</title></head><body><ul role="list" aria-label="Concluídos">'+rows+'</ul></body></html>';
const blankHtml='<!doctype html><html lang="pt-BR"><body><p>Janela fictícia vazia</p></body></html>';
(async()=>{
 let ctx,requests=0,tests=0;
 const check=(name,condition)=>{assert.ok(condition,name);tests++};
 try{
  ctx=await chromium.launchPersistentContext(profile,{headless:true,
   executablePath:process.env.EDGE_EXE||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
   args:['--disable-extensions','--disable-background-networking','--disable-sync'],
   acceptDownloads:false});
  ctx.on('request',()=>requests++);
  const first=ctx.pages()[0]||await ctx.newPage();
  const second=await ctx.newPage();
  await first.setContent(orderHtml);await second.setContent(blankHtml);
  const measure=async(page,ref,minimized=false)=>{
   const m=await page.evaluate(()=>{
    const lists=[...document.querySelectorAll('[role="list"]')]
     .filter(e=>/conclu[ií]d/i.test(e.getAttribute('aria-label')||''));
    if(lists.length!==1)return {listMatches:lists.length,listChildren:0,singleCodeCards:0,uniqueCodeCandidates:0};
    const children=[...lists[0].querySelectorAll(':scope > [role="listitem"]')];
    const numbers=children.map(e=>[...((e.getAttribute('aria-label')||'').matchAll(/(?<!\d)\d{4}(?!\d)/g))]);
    return {listMatches:lists.length,listChildren:children.length,
     singleCodeCards:numbers.filter(x=>x.length===1).length,
     uniqueCodeCandidates:new Set(numbers.filter(x=>x.length===1).map(x=>x[0][0])).size};
   });
   return {ref,visible:true,minimized,uiReadOnly:true,stable:true,...m};
  };
  const decision=windows=>selectWindow({schema:SCHEMA,host:'CAIXA_MOOCA',
   profile:'DeliveryOS-Edge-Gestor-Itaim',windows});
  const populated=await measure(first,'first');
  const empty=await measure(second,'second');
  check('Edge headless has two logical pages',ctx.pages().length>=2);
  check('20 fixture order cards parsed',populated.listChildren===20&&populated.uniqueCodeCandidates===20);
  check('blank fixture card count zero',empty.listChildren===0);
  check('one qualified of two selected',decision([populated,empty]).state==='SELECTED_READ_ONLY');
  check('selected window is correct',decision([populated,empty]).windowRef==='first');
  await second.setContent(orderHtml);
  const secondFull=await measure(second,'second');
  const ambiguous=decision([populated,secondFull]);
  check('two populated logical surfaces HOLD',ambiguous.state==='HOLD'&&ambiguous.reason==='AMBIGUOUS_WINDOWS');
  const minimized=decision([populated,{...secondFull,minimized:true}]);
  check('simulated minimized second excluded',minimized.state==='SELECTED_READ_ONLY');
  check('nonproduction no actions',minimized.ordersPublishable===0&&minimized.actionsAuthorized===false);
  check('zero external network requests',requests===0);
  console.log(JSON.stringify({schema:'deliveryos.gestor-two-surface-headless-fixture.v1',
   result:'PASS',passed:tests,total:tests,edgeHeadless:true,
   logicalPages:ctx.pages().length,nativeWindowsTested:false,
   syntheticCards:20,states:['SELECTED_READ_ONLY','HOLD_AMBIGUOUS_WINDOWS','SELECTED_READ_ONLY'],
   externalRequests:requests,originalGestorTouched:false,
   fileData:'FICTIONAL',atUtc:new Date().toISOString()}));
 }finally{
  if(ctx)await ctx.close().catch(()=>{});
  fs.rmSync(profile,{recursive:true,force:true});
 }
})().catch(e=>{
 console.error('GESTOR_TWO_SURFACE_FIXTURE_FAIL',e.name,String(e.message).slice(0,400));process.exitCode=1;
});
