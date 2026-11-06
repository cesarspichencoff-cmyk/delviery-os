'use strict';
/* Optional Edge fixture: test is offline and never visits iFood.
 * PLAYWRIGHT_CORE_PATH can point to already installed playwright-core.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const probe=path.resolve(__dirname,'../../runtime/reporting/gestor_visible_detail_probe_v1.js');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'deliveryos-fixture-'));
const html=[
 '<!doctype html><html><head><title>LAB FIXTURE</title></head><body>',
 '<header>Loja fictícia</header><div data-testid="customer">Cliente TESTE 11999990000</div>',
 '<main><div role="list">Pedido #1234 concluído</div>',
 '<dialog open style="display:block" data-testid="order-details">',
 '<div data-testid="order-item"><span data-testid="item-name">Combinado de sushi</span>',
 '<span data-testid="item-quantity">2</span><div data-testid="item-option">Sem cebolinha</div></div>',
 '<div data-testid="order-item"><span data-testid="item-name">Hot roll</span>',
 '<span data-testid="item-quantity">1</span></div>',
 '<div data-testid="customer">Cliente SIMULADO 11999990000</div></dialog></main></body></html>'
].join('');
(async()=>{
 let context,requests=0,checks=0;
 const test=(label,ok)=>{assert.ok(ok,label);checks++};
 try{
  context=await chromium.launchPersistentContext(profile,{headless:true,
   executablePath:process.env.EDGE_EXE||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
   args:['--disable-extensions'],acceptDownloads:false});
  context.on('request',()=>requests++);
  const page=context.pages()[0]||await context.newPage();
  await page.setContent(html);
  await page.addScriptTag({path:probe});
  const run=()=>page.evaluate(()=>globalThis.DeliveryGestorDetailReadOnly.readVisibleDetail(document));
  const a=await run();
  test('detail state',a.state==='DETAIL_CANDIDATE_UNVERIFIED');
  test('two items',a.itemLines===2);
  test('one option',a.optionLines===1);
  test('product name',a.items[0].name==='Combinado de sushi');
  test('quantity',a.items[0].quantity===2);
  test('no merchant claim',a.merchantVerified===false);
  test('no UI actions',a.actionsExecuted===0);
  test('no phone copied',!JSON.stringify(a).includes('11999990000'));
  test('no short ID copied',!JSON.stringify(a).includes('1234'));
  await page.evaluate(()=>{
    const el=document.querySelector('dialog [data-testid="item-name"]');
    const secret=document.createElement('span');
    secret.hidden=true;secret.textContent=' Cliente OCULTO 11999990000';
    el.appendChild(secret);
  });
  const shown=await run();
  test('hidden nested text excluded from product',shown.items[0].name==='Combinado de sushi');
  test('nested hidden phone excluded',!JSON.stringify(shown).includes('11999990000'));

  await page.evaluate(()=>{document.querySelector('[data-testid="item-quantity"]').textContent='3'});
  test('in-place detail change', (await run()).items[0].quantity===3);
  await page.evaluate(()=>document.querySelector('dialog').removeAttribute('open'));
  test('closed detail refused',(await run()).state==='DETAIL_NOT_OPEN');
  await page.evaluate(()=>{
   const el=document.querySelector('dialog');el.setAttribute('open','');
   el.querySelector('[data-testid="item-name"]').textContent='Contato 11999990000';
  });
  test('personal text refused',(await run()).state==='HOLD_AMBIGUOUS_ITEM');
  await page.evaluate(()=>{
    const el=document.querySelector('dialog');el.querySelector('[data-testid="item-name"]').textContent='Sushi';
    const hidden=document.createElement('div');hidden.setAttribute('data-testid','order-item');
    hidden.setAttribute('hidden','');hidden.innerHTML='<span data-testid="item-name">Extra oculto</span><span data-testid="item-quantity">1</span>';
    el.appendChild(hidden);
  });
  test('hidden line forces HOLD',(await run()).state==='HOLD_HIDDEN_ITEM_ROWS');
  await page.evaluate(()=>{
    document.querySelector('dialog [data-testid="order-item"][hidden]').remove();
    const line=document.querySelector('dialog [data-testid="order-item"]');
    const dup=document.createElement('span');dup.setAttribute('data-testid','item-quantity');
    dup.textContent='99';line.appendChild(dup);
  });
  test('ambiguous quantity forces HOLD',(await run()).state==='HOLD_AMBIGUOUS_ITEM_FIELDS');
  await page.evaluate(()=>{
    const line=document.querySelector('dialog [data-testid="order-item"]');
    const duplicates=line.querySelectorAll('[data-testid="item-quantity"]');
    duplicates[duplicates.length-1].remove();
    line.setAttribute('aria-hidden','true');
  });
  test('aria-hidden line forces HOLD',(await run()).state==='HOLD_HIDDEN_ITEM_ROWS');
  await page.evaluate(()=>document.querySelector('dialog [data-testid="order-item"]').removeAttribute('aria-hidden'));
  test('no outbound requests',requests===0);
  console.log('GESTOR_VISIBLE_DETAIL_EDGE_FIXTURE_PASS '+checks+'/'+checks+' OFFLINE');
 }finally{
  if(context)await context.close().catch(()=>{});
  fs.rmSync(profile,{recursive:true,force:true});
 }
})().catch(e=>{console.error('GESTOR_VISIBLE_DETAIL_EDGE_FIXTURE_FAIL',e.name,String(e.message).slice(0,500));process.exitCode=1});
