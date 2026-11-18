'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net');
const {fixture,key,renderCopiloto}=require('./fixture.cjs'),S=require('../../runtime/reader-v3/store.cjs');const {buildCapture}=require('../../runtime/reader-v3/capture.cjs'),{project}=require('../../runtime/reader-v3/projection.cjs'),{Consumer}=require('../../runtime/reader-v3/engine.cjs');
const {lerPedidosReaderV3}=require('../../dist/src/platform/leitura/pedidos-reader-v3.js');const {conciliarGestorTeknisa}=require('../../dist/src/platform/leitura/conciliacao-gestor-teknisa.js');
const port=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'v3-home-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const now=new Date(),f=fixture();f.headerRows[0].DTHRABERMESA=new Date(now.getTime()-3*3600000).toISOString().slice(0,23);S.directory(path.join(root,'events'));
 const e=buildCapture(f,key(f),now,{turno:'ALMOCO',versao:'LAB'});S.atomic(path.join(root,'events',S.eventName(1)),{seq:1,event:e});S.atomic(path.join(root,'watcher.json'),{seq:1,outbox:null,holds:{},failures:0});
 const out=path.join(root,'projection'),c=new Consumer({root:out,sourceRoot:root,project});c.tick();c.close();return {root,out,f,now};}
test('real HTTP Home receives V3 child data from incremental consumer; no native IDs or secrets',async t=>{const x=setup(t),p=await port();const child=cp.spawn(process.execPath,['dist/tools/product_system_server.js'],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,PRODUCT_UI_PORT:String(p),DELIVERYOS_READER_V3_PROJECTION_DIR:x.out,DELIVERYOS_READER_V3_UNIT_ID:'LAB_V3',DELIVERYOS_DATABASE_URL:'',TATA_READER_INSTALL_ROOT:'',DELIVERYOS_GESTOR_LOCAL_DIR:''},windowsHide:true,stdio:'ignore'});t.after(async()=>{child.kill();await new Promise(r=>child.once('exit',r));});
 let body;for(let n=0;n<80&&!body;n++){try{const r=await fetch(`http://127.0.0.1:${p}/api/home`);if(r.ok)body=await r.json();}catch{}if(!body)await new Promise(r=>setTimeout(r,100));}
 a.ok(body,'Home HTTP required');const v=body.pedidos_teknisa;a.equal(v.disponivel,true);a.equal(v.contagens.pedidos,1);a.ok(v.pedidos[0].itens[0].observacoes.some(v=>v.includes('Componente:')&&v.includes('FICT_CHILD_NOTE')));a.ok(v.pedidos[0].itens[0].observacoes.some(v=>v.includes('Complemento:')));a.doesNotMatch(JSON.stringify(body),/0000010001|PII_CANARY|SECRET_CANARY/);
 const url=`http://127.0.0.1:${p}/api/copiloto`;
 const request=async unit=>{const response=await fetch(url+'?unit_id='+unit);a.equal(response.status,200);return response.json();};
 const cockpit=await request('LAB_V3'),cash=cockpit.celulas_operacionais.celulas.find(cell=>cell.id==='caixa');
 a.equal(cash.estado,'historico_real_parcial');a.match(cash.descricao,/1 pedido lido/);a.equal(cash.pressao,null);
 a.doesNotMatch(JSON.stringify(cockpit),/FICT_CHILD_NOTE|0000010001/);
 a.match(await renderCopiloto(cockpit),/Reader V3 em sombra/);
 const foreign=await request('OUTRA_UNIDADE');a.doesNotMatch(JSON.stringify(foreign),/Reader V3 em sombra/);

});
test('stale source heartbeat, invalid digest and partial publication fail closed',t=>{const x=setup(t);a.equal(lerPedidosReaderV3(x.out).estado,'lido');const sf=path.join(x.out,'source-status.json'),s=S.read(sf);S.atomic(sf,{...s,at:'2000-01-01T00:00:00Z'});a.equal(lerPedidosReaderV3(x.out).estado,'indisponivel');S.atomic(sf,{...s,seq:2});a.equal(lerPedidosReaderV3(x.out).estado,'indisponivel');S.atomic(sf,s);const file=path.join(x.out,'consumer.json');fs.writeFileSync(file,'{}');a.equal(lerPedidosReaderV3(x.out).estado,'indisponivel');});
test('held or lagged revision cannot become correspondence proven in Copiloto',t=>{const x=setup(t),sf=path.join(x.out,'source-status.json'),s=S.read(sf);S.atomic(sf,{...s,holds:{[key(x.f)]:{code:'LOCK_TIMEOUT'}}});const l=lerPedidosReaderV3(x.out);a.equal(l.estado,'lido');a.equal(l.pedidos[0].retido,true);
 const p=l.pedidos[0],g={codigo_curto:p.codigo_curto,criado_em:x.now.toISOString(),eventos:{PLACED:x.now.toISOString()},itens:p.itens.map(i=>({codigo_externo:i.codigo_arvore,quantidade:i.quantidade,opcoes:[],observacao:null})),itens_cancelados:0,itens_alterados:0};a.equal(conciliarGestorTeknisa([g],[p],x.now).pares[0].classe,'revisao_retida');
 S.atomic(sf,{...s,producerSeq:2});a.equal(lerPedidosReaderV3(x.out).pedidos[0].retido,true);
});
test('NMO uses V3 native-line review; historic N2 origin contract stays intact',()=>{const f=fixture();f.headerRows[0].IDORGCMDVENDA='DLV_NMO';a.equal(buildCapture(f,key(f),new Date(),{turno:'ALMOCO'}).order.IDORGCMDVENDA,'DLV_NMO');});
function pair(p,now){return {codigo_curto:p.codigo_curto,criado_em:now.toISOString(),eventos:{PLACED:now.toISOString()},itens:p.itens.map(i=>({codigo_externo:i.codigo_arvore,quantidade:i.quantidade,opcoes:[],observacao:null})),itens_cancelados:0,itens_alterados:0};}
test('matching aggregate items cannot attest child-to-parent relations in Copiloto',t=>{const x=setup(t),p=lerPedidosReaderV3(x.out).pedidos[0],g=pair(p,x.now);a.equal(conciliarGestorTeknisa([g],[p],x.now).pares[0].classe,'relacoes_nao_confirmadas');});
test('V3 note requires exact text on one unique item; order text and repeated SKU do not prove association',t=>{const x=setup(t),p=lerPedidosReaderV3(x.out).pedidos[0],g=pair(p,x.now);g.itens[0].observacao='FICT_NO_CILANTRO';a.equal(conciliarGestorTeknisa([g],[p],x.now).pares[0].classe,'relacoes_nao_confirmadas');p.itens[0].observacoes=[];p.observacoes_do_pedido=['FICT_NO_CILANTRO'];a.equal(conciliarGestorTeknisa([g],[p],x.now).pares[0].classe,'observacao_divergente');p.itens[0].observacoes=['FICT_NO_CILANTRO_SUFFIX'];a.equal(conciliarGestorTeknisa([g],[p],x.now).pares[0].classe,'observacao_divergente');p.itens[0].observacoes=['FICT_NO_CILANTRO'];p.itens[1].codigo_arvore=p.itens[0].codigo_arvore;g.itens[1].codigo_externo=g.itens[0].codigo_externo;a.equal(conciliarGestorTeknisa([g],[p],x.now).pares[0].classe,'observacao_divergente');});

test('captured child relations remain unconfirmed when the Gestor sends options',t=>{
 const x=setup(t),p=lerPedidosReaderV3(x.out).pedidos[0],g=pair(p,x.now);
 g.itens[0].opcoes.push({codigo_externo:'FICT_OPTION',quantidade:1});
 a.equal(conciliarGestorTeknisa([g],[p],x.now).pares[0].classe,'relacoes_nao_confirmadas');
});
