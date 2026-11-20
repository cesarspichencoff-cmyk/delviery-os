import assert from "node:assert/strict";
import {mkdtemp,cp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import caso from "./caso.cjs";
const raiz=fileURLToPath(new URL("../../",import.meta.url));
const tmp=await mkdtemp(join(tmpdir(),"copiloto-itaim-"));
let n=0;
function teste(nome,fn){ fn(); n++; console.log("OK "+nome); }
try {
  await cp(join(raiz,"src/product/ui"),tmp,{recursive:true});
  await writeFile(join(tmp,"package.json"),'{"type":"module"}');
  const {telaHome}=await import(pathToFileURL(join(tmp,"surfaces/home.js")));
  const dados=caso.montar(), o=dados.operacao_ifood, v=dados.home_operacional;
  const rota="/copiloto?unidade=ITAIM";
  function tela(q){globalThis.location={hash:"#"+rota+"&"+q};return telaHome({...v,rota_home:rota,operacao_ifood:o});}
  const [ana,rui,lia]=o.pedidos;
  const destino=html=>html.match(/href="([^"]*ficha=[^"]+)"/)?.[1].replaceAll("&amp;","&").split("ITAIM&")[1];
  teste("mapa envia Caixa, Conferência e Motoboy às consultas operacionais",()=>{
    const h=tela("menu=mapa");for(const id of ["fila","sacolas","rua"])assert.match(h,new RegExp("menu="+id+'".{0,20}aria-label="Aproximar de'));});
  teste("praça soma cinco unidades em duas comandas e exclui pronto, cancelado e outra praça",()=>{
    const h=tela("area=sushi");assert.match(h,/5 × Uramaki de Salmão/);assert.match(h,/2 pedidos · 12 min/);
    assert.doesNotMatch(h,/iFood #41|Guioza|Hot Roll/);assert.match(tela("area=cozinha"),/1 × Guioza/);});
  teste("detalhe ordena as comandas e mantém a observação com a linha certa",()=>{
    const h=tela("area=sushi"); assert.ok(h.indexOf("Teknisa 007 · iFood #3812 · Ana")<h.indexOf("Teknisa 041 · iFood #3940 · Rui"));
    assert.match(h,/2 unidades · 12 min de atraso/);assert.match(h,/sem cebolinha/i);assert.match(h,/3 unidades · 6 min de atraso/);});
  teste("toque no item abre comanda completa e sacolas; voltar reabre o produto",()=>{
    const h=tela(destino(tela("area=sushi")));assert.match(h,/Teknisa 007 · iFood #3812 · Ana/);assert.match(h,/1× Guioza/);assert.match(h,/2× Uramaki/);
    assert.match(h,/Frios e sobremesas/);const voltar=h.match(/class="turno-voltar" href="([^"]+)"/)[1].replaceAll("&amp;","&").split("ITAIM&")[1];
    assert.match(tela(voltar),/<details class="turno-produto"[^>]* open>/);});
  teste("ranking abre a identidade exata mesmo com outra comanda 007 perto do prazo",()=>{
    const h=tela("menu=atrasos");assert.match(h,/Vence em 4 min/);assert.match(h,/href="[^"]*ficha=[^"]+">Teknisa 007 · iFood #4108 · Lia/);
    assert.match(tela("menu=atrasos&ficha="+lia.chave_gestor),/2× Hot Roll/);assert.doesNotMatch(tela("menu=atrasos&ficha="+lia.chave_gestor),/Guioza|cebolinha/i);});
  teste("uma linha com três unidades mantém a composição de produção",()=>{
    assert.match(tela("menu=producao&ficha="+rui.chave_gestor),/Só Enrolados · 1 linha · 3 unidades/);});
  teste("duas linhas do mesmo SKU e da mesma comanda contam o pedido só uma vez",()=>{
    const i=o.previa_por_praca.grupos[0].itens[0];o.previa_por_praca.grupos[0].itens.push({...i,quantidade:1,observacoes:[{fonte:"iFood",texto:"Sem tarê"}]});
    const h=tela("area=sushi");assert.match(h,/6 × Uramaki/);assert.match(h,/2 pedidos · 12 min/);assert.match(h,/Sem tarê/);
    o.previa_por_praca.grupos[0].itens.pop();});
  teste("nome e identificador ausentes ou duplicados não misturam pedidos",()=>{
    const seq=ana.teknisa.sequencia;ana.nome_cliente=null;ana.teknisa.sequencia=null;
    assert.match(tela("area=sushi"),/Teknisa a conferir · iFood #3812 · Cliente a conferir/);
    ana.nome_cliente="Ana";ana.teknisa.sequencia=seq;o.pedidos.push({...ana});assert.doesNotMatch(tela("area=sushi"),/#3812/);
    assert.match(tela("menu=atrasos&ficha="+ana.chave_gestor),/Comanda indisponível/);o.pedidos.pop();});
  teste("leitura vencida retira dados da ficha e do produto",()=>{
    o.leitura_velha=true;assert.match(tela("area=sushi"),/Sem leitura atual/);assert.doesNotMatch(tela("menu=atrasos&ficha="+ana.chave_gestor),/Guioza|cebolinha/i);o.leitura_velha=false;});
  teste("V77 reconcilia por dia e converte 4 chegadas em 30 minutos em ritmo de 2 para os próximos 15",()=>{
    const v2=v.previsao_turno,p=v2.plano;assert.equal(p.produtos.length,182);assert.equal(p.produtos.reduce((a,i)=>a+i.dia,0),2029);
    assert.equal(v2.faixa,2);assert.deepEqual(v2.ritmo,{ultimos_30:4,proximos_15:2});assert.equal(v2.perto_do_prazo,1);
    assert.equal(v2.prazo_por_praca[0].rotulo,"Sushi Quentes");assert.match(tela("menu=previsao"),/358 pedidos iFood/);});
  teste("data de São Paulo, feriado e falta de cobertura preservam incerteza",()=>{
    const previsao=t=>caso.previsaoDoTurnoItaim(Date.parse(t));assert.equal(previsao("2026-11-20T01:00Z").dia,"2026-11-19");
    assert.equal(previsao("2026-11-20T01:00Z").faixa,-1);assert.equal(previsao("2026-11-21T12:00Z").plano,null);
    assert.equal(previsao("2026-11-20T19:26Z").ritmo,null);assert.equal(previsao("2026-11-20T19:26Z").perto_do_prazo,null);});
  console.log(n+"/"+n+" cenários passaram.");
} finally { await rm(tmp,{recursive:true,force:true}); }
