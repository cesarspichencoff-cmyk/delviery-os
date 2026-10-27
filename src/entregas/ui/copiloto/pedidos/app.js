'use strict';
(() => {
 const $=id=>document.getElementById(id),status=$('status');
 let epoch=0,controller=null,refreshTimer=null,busy=false;
 function clear(){clearTimeout(refreshTimer);$('orders').replaceChildren();$('reading').hidden=true;}
 function cancel(){epoch++;controller?.abort();controller=null;clear();busy=false;buttons(false);}
 function buttons(disabled){for(const el of document.querySelectorAll('form button,#refresh'))el.disabled=disabled;}
 function access(message){clear();$('access').hidden=false;$('email-form').hidden=false;$('code-form').hidden=true;$('logout').hidden=true;status.textContent=message;}
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
 function render(feed){
  clear();
  if(!feed||feed.schema!=='deliveryos.copiloto-tata-file-feed.v1'||feed.operational_order_total!==null||feed.live_source_verified!==false)throw Error('INVALID_FEED');
  if(feed.state==='unavailable'){status.textContent='Fonte indisponível. Nenhum pedido anterior foi mantido na tela.';return;}
  const view=feed.view;
  if(!view||view.unit_id!=='ITAIM'||!Array.isArray(view.orders)||view.orders.length>250)throw Error('INVALID_VIEW');
  const cards=[];
  for(const order of view.orders){
   if(order.unit_id!=='ITAIM'||!Object.hasOwn(states,order.state)||!Object.hasOwn(modes,order.source_mode)||!Array.isArray(order.items))throw Error('INVALID_ORDER');
   const card=document.createElement('article');
   card.append(text('p',modes[order.source_mode],'badge'),text('h3','Comanda '+order.order_ref),text('p',states[order.state]));
   card.append(text('p','Observação da fonte: '+new Date(order.source_observed_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})));
   if(order.state==='observed'){
    const list=document.createElement('ul');for(const item of order.items)list.append(text('li',item.quantity+' × produto '+item.product_code));card.append(list);
   }else card.append(text('p','Itens ocultos até uma leitura válida.'));
   cards.push(card);
  }
  $('orders').replaceChildren(...cards);$('reading').hidden=false;
  status.textContent=cards.length?'Leitura recebida. Confira a origem e o horário de cada registro.':'Sem observações recentes. Isso não significa que não existam pedidos ativos.';
 }
 async function load(){
  if(busy)return;clear();status.textContent='Atualizando leitura…';
  const r=await request('/api/copiloto/orders');if(!r)return;
  if(!r.ok){if(r.status===401||r.status===403){access(failure(r));if(r.status===403)$('logout').hidden=false;}else status.textContent=failure(r);return;}
  $('access').hidden=true;$('logout').hidden=false;
  try{render(r.data);}catch{clear();status.textContent='Leitura inválida. Nenhum pedido foi exibido.';}
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
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();else load();});
 window.addEventListener('pagehide',cancel);
 window.addEventListener('pageshow',()=>{cancel();load();});
})();
