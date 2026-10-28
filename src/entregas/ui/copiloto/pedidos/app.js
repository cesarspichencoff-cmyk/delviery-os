'use strict';
(() => {
 const $=id=>document.getElementById(id),status=$('status');
 let epoch=0,controller=null,refreshTimer=null,busy=false;
 let records=[],selectedKey=null;
 const key=order=>JSON.stringify([order.source_mode,order.store_id,order.sale_ref,order.order_ref,order.opened_at]);
 function clear(keepLayout=false){clearTimeout(refreshTimer);records=[];selectedKey=null;$('orders').replaceChildren();$('detail').replaceChildren();$('record-count').textContent='';$('result-count').textContent='';if(!keepLayout)$('reading').hidden=true;$('reading').setAttribute('aria-busy',String(keepLayout));if(keepLayout)$('detail').append(text('p','Revalidando acesso e leitura…','empty'));}
 function cancel(){epoch++;controller?.abort();controller=null;clear();busy=false;buttons(false);}
 function buttons(disabled){for(const el of document.querySelectorAll('form button,#refresh'))el.disabled=disabled;}
 function access(message){clear();$('search').value='';$('state-filter').value='all';$('access').hidden=false;$('email-form').hidden=false;$('code-form').hidden=true;$('logout').hidden=true;status.textContent=message;}
 async function request(path,body){
  const token=++epoch;controller?.abort();const current=new AbortController();controller=current;
  const timeout=setTimeout(()=>current.abort(),12000);busy=true;buttons(true);
  try{const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:current.signal,
    headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
   const value=await response.json();if(token!==epoch)return null;return {status:response.status,...value};
  }catch{if(token!==epoch)return null;return {status:503,ok:false};}
  finally{clearTimeout(timeout);if(token===epoch){busy=false;buttons(false);controller=null;}}
 }
 const messages={401:'Sua sessão terminou. Entre novamente.',403:'Acesso não autorizado para esta unidade.',429:'Muitas tentativas. Aguarde alguns minutos.',503:'Não foi possível conectar. Tente novamente.'};
 function failure(r){return messages[r.status]||'Não foi possível concluir. Confira os dados e tente novamente.';}
 const states={observed:'Observado na fonte',stale:'Leitura antiga',conflict:'Dados em conflito',future_timestamp:'Horário da fonte inconsistente'};
 const modes={control:'ENSAIO CONTROLADO',simulated:'SIMULADO',real:'FONTE REAL · validação operacional pendente'};
 function text(tag,value,cls){const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;}
 const modeNames={control:'ensaio controlado',simulated:'simulado',real:'fonte real'};
 const date=value=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
 const time=value=>new Date(value).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
 function field(list,label,value){list.append(text('dt',label),text('dd',value));}
 function inspect(order){
  const panel=$('detail');panel.replaceChildren();
  if(!order){panel.append(text('p','Selecione uma comanda para investigar seus itens e a origem da leitura.','empty'));return;}
  const article=document.createElement('article'),heading=text('h3','Comanda '+order.order_ref);
  heading.tabIndex=-1;heading.id='selected-order-title';
  article.append(text('p',modes[order.source_mode],'badge'),heading,text('p',states[order.state]+' · '+date(order.source_observed_at),'detail-state'));
  article.append(text('h4','Itens na observação','items-heading'));
  if(order.state==='observed'){
   const list=document.createElement('ul');list.className='item-list';
   for(const item of order.items){
    const li=document.createElement('li'),detail=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');
    detail.className='item';detail.dataset.productCode=item.product_code;body.className='item-content';
    summary.append(text('span',item.quantity+' × produto '+item.product_code));
    body.append(text('p','Código na fonte: '+item.product_code),text('p','Quantidade observada: '+item.quantity),
     text('p','Nome do produto: catálogo ainda não conectado.'),text('p','Praça: não informada nesta leitura.'));
    detail.append(summary,body);li.append(detail);list.append(li);
   }
   article.append(list);
   if(!order.items.length)article.append(text('p','Nenhum item informado neste registro.','muted'));
  }else article.append(text('p','Itens ocultos até uma leitura válida.','muted'));
  const source=document.createElement('details'),summary=text('summary','Investigar origem da leitura'),fields=document.createElement('dl');source.className='source-detail';
  field(fields,'Unidade','Itaim');field(fields,'Origem',modeNames[order.source_mode]);
  field(fields,'Observado em',date(order.source_observed_at));
  field(fields,'Comanda',order.order_ref);
  if(typeof order.sale_ref==='string')field(fields,'Venda na fonte',order.sale_ref);
  if(typeof order.store_id==='string')field(fields,'Loja na fonte',order.store_id);
  if(typeof order.snapshot_ref==='string')field(fields,'Referência da leitura',order.snapshot_ref);
  source.append(summary,fields);article.append(source);
  article.append(text('p','Praça, pressão de produção, despacho e entrega não são confirmados por esta leitura.','boundary'));
  const back=text('button','Voltar às comandas','back-to-list');back.type='button';
  back.addEventListener('click',()=>{const selected=$('orders').querySelector('[aria-pressed="true"]');(selected||$('search')).focus();});
  article.append(back);panel.append(article);
 }
 function filterRecords(preferred=selectedKey){
  const query=$('search').value.trim().toLocaleLowerCase('pt-BR'),state=$('state-filter').value;
  const found=records.filter(order=>(state==='all'||order.state===state)&&(!query||order.order_ref.toLocaleLowerCase('pt-BR').includes(query)||
   (order.state==='observed'&&order.items.some(item=>item.product_code.toLocaleLowerCase('pt-BR').includes(query)))));
  const selected=found.find(order=>key(order)===preferred)||found[0];selectedKey=selected?key(selected):null;
  const rows=found.map(order=>{
   const button=document.createElement('button'),top=document.createElement('span'),meta=document.createElement('span');
   button.type='button';button.className='order-row';button.setAttribute('aria-controls','detail');button.setAttribute('aria-pressed',String(key(order)===selectedKey));
   button.setAttribute('aria-label','Investigar comanda '+order.order_ref+', '+states[order.state]);
   top.className='row-top';meta.className='row-meta';
   top.append(text('span','Comanda '+order.order_ref,'row-title'),text('span',time(order.source_observed_at),'row-time'));
   meta.append(text('span',states[order.state],'reading-state'),text('span',order.state==='observed'?order.items.length+' linha(s) de itens':'Itens ocultos'));
   button.append(top,meta,text('span','Origem · '+modeNames[order.source_mode],'row-mode'));
   button.addEventListener('click',()=>{
    selectedKey=key(order);for(const row of $('orders').children)row.setAttribute('aria-pressed',String(row===button));inspect(order);
    if(window.matchMedia('(max-width:760px)').matches)$('selected-order-title').focus();
   });return button;
  });
  $('orders').replaceChildren(...rows);$('empty-results').hidden=found.length!==0;
  $('result-count').textContent=found.length+' de '+records.length+' registros neste recorte';inspect(selected);
 }
 function render(feed,preferred){
  clear();
  if(!feed||feed.schema!=='deliveryos.copiloto-tata-file-feed.v1'||feed.operational_order_total!==null||feed.live_source_verified!==false)throw Error('INVALID_FEED');
  if(feed.state==='unavailable'){status.textContent='Fonte indisponível. Nenhum pedido anterior foi mantido na tela.';return;}
  const view=feed.view;
  if(!view||view.unit_id!=='ITAIM'||!Array.isArray(view.orders)||view.orders.length>250)throw Error('INVALID_VIEW');
  const seen=new Set();
  for(const order of view.orders){
   if(!order||order.unit_id!=='ITAIM'||!Object.hasOwn(states,order.state)||!Object.hasOwn(modes,order.source_mode)||
    typeof order.order_ref!=='string'||!order.order_ref||!Number.isFinite(Date.parse(order.source_observed_at))||!Array.isArray(order.items)||seen.has(key(order)))throw Error('INVALID_ORDER');
   seen.add(key(order));
   if(order.state==='observed'&&order.items.some(item=>!item||typeof item.product_code!=='string'||!item.product_code||!Number.isFinite(item.quantity)||item.quantity<=0))throw Error('INVALID_ITEM');
  }
  records=view.orders;filterRecords(preferred);$('record-count').textContent=records.length+' registro(s)';$('reading').hidden=false;
  status.textContent=records.length?'Leitura recebida. Confira origem e horário.':'Sem observações recentes. Isso não significa que não existam pedidos ativos.';
 }
 async function load(){
  if(busy)return;const preferred=selectedKey;const expanded=Array.from($('detail').querySelectorAll('.item[open]'),el=>el.dataset.productCode);const sourceOpen=!!$('detail').querySelector('.source-detail[open]');const scroll=$('orders').parentElement.scrollTop;clear(!$('reading').hidden);status.textContent='Atualizando leitura…';
  const r=await request('/api/copiloto/orders');if(!r)return;
  if(!r.ok){if(r.status===401||r.status===403){access(failure(r));if(r.status===403)$('logout').hidden=false;}else{clear();status.textContent=failure(r);}return;}
  $('access').hidden=true;$('logout').hidden=false;
  try{render(r.data,preferred);if(selectedKey&&selectedKey===preferred){for(const el of $('detail').querySelectorAll('.item'))el.open=expanded.includes(el.dataset.productCode);const source=$('detail').querySelector('.source-detail');if(source)source.open=sourceOpen;$('orders').parentElement.scrollTop=scroll;}}catch{clear();status.textContent='Leitura inválida. Nenhum pedido foi exibido.';}
  // A bounded display lease: clear and revalidate, including after returning to the tab.
  refreshTimer=setTimeout(load,30000);
 }
 $('email-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;clear();const r=await request('/api/operator/login/begin',{email:$('email').value.trim()});if(!r)return;
  if(!r.ok){status.textContent=failure(r);return;}
  $('email').value='';$('email-form').hidden=true;$('code-form').hidden=false;$('logout').hidden=false;
  status.textContent='Código solicitado. Confira seu e-mail.';$('otp').focus();
 });
 $('code-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;const otp=$('otp').value;$('otp').value='';
  const r=await request('/api/operator/login/complete',{otp});if(!r)return;
  if(!r.ok){status.textContent=failure(r);return;}await load();
 });
 $('logout').addEventListener('click',async()=>{
  cancel();$('email').value='';$('otp').value='';$('access').hidden=true;status.textContent='Encerrando acesso…';
  const r=await request('/api/operator/logout',{});if(!r)return;
  if(r.ok)access('Acesso encerrado neste dispositivo.');else{clear();status.textContent='Não foi possível confirmar a saída. Toque em Sair para tentar novamente.';}
 });
 $('refresh').addEventListener('click',load);
 $('search').addEventListener('input',()=>filterRecords());
 $('state-filter').addEventListener('change',()=>filterRecords());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();else load();});
 window.addEventListener('pagehide',cancel);
 window.addEventListener('pageshow',()=>{cancel();load();});
})();
