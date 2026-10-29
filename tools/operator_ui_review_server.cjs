'use strict';
// Internal visual QA only. Fixed synthetic records; never connects to TATA,
// an identity provider, a database or the installed pilot. Not a deployment entrypoint.
if(process.env.READER_UI_LAB!=='1')throw Error('READER_UI_LAB_OPT_IN_REQUIRED');
const http=require('node:http'),path=require('node:path');
const {loadOperatorUiAssets}=require('../dist/src/platform/auth/operator-ui-assets.js');
const appRoot=path.resolve(__dirname,'..');
const scenes=new Set(['observed','empty','unavailable','conflict','invalid','session','long']);
function feed(scene){
 const now=new Date().toISOString();
 const orders=Array.from({length:scene==='long'?250:8},(_,i)=>({unit_id:'ITAIM',source_unit_id:'LAB',source_mode:'simulated',store_id:'01',sale_ref:'ENSAIO-'+i,
  order_ref:String(204+i),opened_at:'2026-10-28T14:00:00.000Z',source_observed_at:now,snapshot_ref:'a'.repeat(64),state:scene==='conflict'?'conflict':'observed',
  items:Array.from({length:i===0?4:2},(_,j)=>({product_code:scene==='long'?'CODIGO-EXTENSO-DE-ENSAIO-SEM-CATALOGO-'+String(j).repeat(45):'P'+(104+j+i),quantity:j%2+1}))}));
 return {schema:'deliveryos.copiloto-tata-file-feed.v1',operational_order_total:null,live_source_verified:false,
  state:scene==='unavailable'?'unavailable':scene==='empty'?'no_evidence':'observed_records',view:scene==='unavailable'?null:{unit_id:scene==='invalid'?'OUTRA':'ITAIM',orders:scene==='empty'?[]:orders}};
}
const server=http.createServer((req,res)=>{
 const cookie=(req.headers.cookie||'').match(/(?:^|; )ui_lab_scene=([a-z]+)/)?.[1],scene=scenes.has(cookie)?cookie:'observed';
 const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(req.url.startsWith('/lab/')){const target=req.url.slice(5);if(!scenes.has(target))return json(404,{});res.writeHead(302,{'Location':'/copiloto/pedidos/','Set-Cookie':'ui_lab_scene='+target+'; HttpOnly; SameSite=Strict; Path=/'});res.end();return;}
 if(req.url==='/api/operator/logout'){res.setHeader('Set-Cookie','ui_lab_scene=session; HttpOnly; SameSite=Strict; Path=/');return json(200,{ok:true});}
 if(req.url==='/api/operator/login/begin')return json(200,{ok:true});
 if(req.url==='/api/operator/login/complete'){res.setHeader('Set-Cookie','ui_lab_scene=observed; HttpOnly; SameSite=Strict; Path=/');return json(200,{ok:true});}
 if(req.url==='/api/copiloto/orders')return json(scene==='session'?401:200,scene==='session'?{ok:false}:{ok:true,data:feed(scene)});
 const assets=loadOperatorUiAssets(appRoot);
 if(req.url==='/review/mobile'||req.url==='/review/narrow'){const width=req.url.endsWith('narrow')?320:390;res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="pt-BR"><title>Ensaio responsivo</title><body style="margin:0;background:#202823;color:white;font:14px system-ui"><p>Ensaio responsivo '+width+' × 844 · dados simulados</p><iframe title="Leitor em largura móvel" src="/copiloto/pedidos/" style="display:block;width:'+width+'px;height:844px;border:0"></iframe></body></html>');return;}
 if(req.url==='/copiloto/pedidos/app.css'){res.setHeader('Content-Type','text/css');res.end(assets.css+'\n.lab-notice{padding:12px 20px;border-bottom:1px dashed #9aa7b0;font:12px system-ui;background:#152119;color:#f2ebd9}.lab-notice a{display:inline-block;margin:4px 10px;color:inherit}');return;}
 if(req.url==='/copiloto/pedidos/app.js'){res.setHeader('Content-Type','text/javascript');res.end(assets.js);return;}
 if(req.url==='/'||req.url==='/copiloto/pedidos/'){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(assets.html.replace('<body>','<body><aside class="lab-notice">PRÉVIA DE TESTE · dados simulados · não é o caixa instalado<nav aria-label="Cenários de teste">'+[...scenes].map(s=>'<a href="/lab/'+s+'">'+s+'</a>').join('')+'</nav></aside>'));return;
 }
 json(404,{});
});
server.listen(Number((process.argv.includes('--port')?process.argv[process.argv.indexOf('--port')+1]:process.env.PORT)||3000),'0.0.0.0',()=>console.log('Internal synthetic reader UI review ready'));
