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
  const consulta=href=>href.replaceAll("&amp;","&").split("ITAIM&")[1];
  const destino=html=>consulta(html.match(/href="([^"]*ficha=[^"]+)"/)?.[1]);
  const secao=(h,de,ate)=>h.slice(h.indexOf(de),ate?h.indexOf(ate):undefined);
  teste("mapa envia Caixa, Conferência e Motoboy às consultas operacionais",()=>{
    const h=tela("menu=mapa");for(const id of ["fila","sacolas","rua"])assert.match(h,new RegExp("menu="+id+'".{0,20}aria-label="Aproximar de'));});
  teste("praça soma cinco unidades em duas comandas e exclui pronto, cancelado e outra praça",()=>{
    const h=tela("area=sushi");assert.match(h,/5 × Uramaki de Salmão/);assert.match(h,/em 2 pedidos atrasados · pior 12 min/);
    assert.doesNotMatch(h,/iFood #41|Guioza|Hot Roll/);assert.match(tela("area=cozinha"),/1 × Guioza/);});
  teste("detalhe ordena as comandas e mantém a observação com a linha certa",()=>{
    const h=tela("area=sushi"); assert.ok(h.indexOf("<strong>2</strong> para Ana")<h.indexOf("<strong>3</strong> para Rui"));
    assert.match(h,/Teknisa 007 · iFood #3812 · 12 min de atraso/);assert.match(secao(h,"para Ana","para Rui"),/Sem cebolinha/);
    assert.doesNotMatch(secao(h,"para Rui"),/cebolinha/i);assert.match(h,/Teknisa 041 · iFood #3940 · 6 min de atraso/);});
  teste("toque no item abre comanda completa e sacolas; voltar reabre o produto",()=>{
    const h=tela(destino(tela("area=sushi")));assert.match(h,/Teknisa 007 · iFood #3812 · Ana/);assert.match(h,/1× Guioza/);assert.match(h,/2× Uramaki/);
    assert.match(h,/Frios e sobremesas/);const voltar=consulta(h.match(/class="turno-voltar" href="([^"]+)"/)[1]);
    assert.match(tela(voltar),/<details class="turno-produto"[^>]* open>/);});
  teste("ranking abre a identidade exata mesmo com outra comanda 007 perto do prazo",()=>{
    const h=tela("menu=atrasos");assert.match(h,/Vence em 4 min/);assert.match(h,/href="[^"]*ficha=[^"]+">Teknisa 007 · iFood #4108 · Lia/);
    assert.match(tela("menu=atrasos&ficha="+lia.chave_gestor),/2× Hot Roll/);assert.doesNotMatch(tela("menu=atrasos&ficha="+lia.chave_gestor),/Guioza|cebolinha/i);});
  teste("uma linha com três unidades mantém a composição de produção",()=>{
    assert.match(tela("menu=producao&ficha="+rui.chave_gestor),/Só Enrolados · 1 linha · 3 unidades/);});
  teste("duas linhas do mesmo SKU e da mesma comanda contam o pedido só uma vez",()=>{
    const i=o.previa_por_praca.grupos[0].itens[0];o.previa_por_praca.grupos[0].itens.push({...i,quantidade:1,observacoes:[{fonte:"iFood",texto:"Sem tarê"}]});
    const h=tela("area=sushi");assert.match(h,/6 × Uramaki/);assert.match(h,/em 2 pedidos atrasados · pior 12 min/);assert.match(h,/Sem tarê/);
    assert.match(h,/<strong>3<\/strong> para Ana/);o.previa_por_praca.grupos[0].itens.pop();});
  teste("nome e identificador ausentes ou duplicados não misturam pedidos",()=>{
    const seq=ana.teknisa.sequencia;ana.nome_cliente=null;ana.teknisa.sequencia=null;
    const h=tela("area=sushi");assert.match(h,/<strong>2<\/strong> para cliente a conferir/);assert.match(h,/Teknisa a conferir · iFood #3812/);
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

  // --- 20/11: Agora em três perguntas, praça por toque, expedição e sacolas ---
  teste("Agora responde onde agir: Enrolados com 5 Uramakis em 2 pedidos atrasados, evidência, quem, prazo, fim e o toque exato",()=>{
    const h=tela("menu=mapa");
    const i=h.indexOf("Onde agir agora"),j=h.indexOf("Quem precisa agir"),k=h.indexOf("O que pode apertar nos próximos 15 min"),m=h.indexOf("Mapa das praças");
    assert.ok(i>0&&i<j&&j<k&&k<m,"as três perguntas, nesta ordem, antes do mapa");
    const ini=h.indexOf('<li class="turno-acao"'),primeira=h.slice(ini,h.indexOf("</li>",ini));
    assert.match(primeira,/Enrolados · 5 × Uramaki de Salmão em 2 pedidos atrasados/);
    assert.match(primeira,/Teknisa 007 · iFood #3812 há 12 min; Teknisa 041 · iFood #3940 há 6 min/);
    assert.match(primeira,/Responsável por Enrolados/);assert.match(primeira,/Já vencido · pior 12 min/);assert.match(primeira,/Sai quando esses pedidos ficarem prontos/);
    assert.match(primeira,/Teknisa 007 · iFood #3812 também espera Cozinha \(1 × Guioza\)/);assert.match(primeira,/Teknisa 041 · iFood #3940 só depende de Enrolados/);
    const p=tela(consulta(primeira.match(/href="([^"]+)"/)[1]));
    assert.match(p,/<h2>Enrolados<\/h2>/);assert.match(p,/<details class="turno-produto"[^>]* open><summary><strong>5 × Uramaki de Salmão/);});
  teste("tocar em Enrolados no mapa abre só Enrolados, com 5 Uramakis em 2 pedidos atrasados primeiro, 2 para Ana sem cebolinha e 3 para Rui",()=>{
    const link=tela("menu=mapa").match(/href="([^"]*area=enrolados)" aria-label="Abrir Enrolados"/)?.[1];assert.ok(link,"Enrolados é tocável no mapa");
    const h=tela(consulta(link));assert.match(h,/<h2>Enrolados<\/h2>/);assert.doesNotMatch(h,/Guioza|Hot Roll/);
    assert.match(h,/<strong>5 × Uramaki de Salmão<\/strong><span>em 2 pedidos atrasados · pior 12 min/);
    const a=h.indexOf("<strong>2</strong> para Ana"),r=h.indexOf("<strong>3</strong> para Rui");assert.ok(a>0&&r>a);
    assert.match(h.slice(a,r),/Sem cebolinha[\s\S]*Teknisa 007 · iFood #3812 · 12 min de atraso/);assert.match(h.slice(r),/Teknisa 041 · iFood #3940 · 6 min de atraso/);
    assert.match(tela(destino(h)),/<h3>Teknisa 007 · iFood #3812 · Ana<\/h3>/);});
  teste("Sushi Quentes e Cozinha com a mesma clareza: Lia vence às 19:09 sem entrar nos atrasados; 1 Guioza da Ana; cancelado fora",()=>{
    const q=tela("area=enrolados_quentes");assert.match(q,/Vencem nos próximos 15 min · 2 itens em 1 pedido/);
    assert.match(q,/<strong>2 × Hot Roll<\/strong><span>em 1 pedido · vence às 19:09 \(em 4 min\)/);assert.match(q,/<strong>2<\/strong> para Lia/);
    assert.match(q,/Teknisa 007 · iFood #4108/);assert.doesNotMatch(q,/Em pedidos atrasados|#3812/);
    const c=tela("area=cozinha");assert.match(c,/<strong>1 × Guioza<\/strong><span>em 1 pedido atrasado · pior 12 min/);assert.match(c,/<strong>1<\/strong> para Ana/);
    assert.doesNotMatch(c,/9 × Guioza|#4055/);});
  teste("próximos 15 min: Sushi Quentes aperta às 19:09; Enrolados já vencido; plano da faixa em itens dos dois canais, sem desvio; ritmo de 2 pedidos",()=>{
    const s=secao(tela("menu=mapa"),"O que pode apertar","Mapa das praças");
    assert.match(s,/Sushi Quentes · 2 × Hot Roll em 1 pedido · primeiro vence às 19:09/);
    assert.match(s,/Enrolados pode apertar: 5 itens já vencidos; o plano desta faixa prevê cerca de 21 itens a cada 15 min nos dois canais/);
    assert.match(s,/faixa 18–20h: 713 itens nos dois canais/);assert.match(s,/não há desvio calculado/);
    assert.match(s,/cerca de <strong>2 pedidos<\/strong> nos próximos 15 min/);assert.match(s,/Capacidade das praças não é medida/);});
  teste("ordem das ações: dois vencidos empatados no atraso desempatam por unidades; o prazo de 4 min vem depois e é explicado",()=>{
    const h=tela("menu=mapa"),o2=secao(h,"Onde agir agora","Quem precisa agir");
    const e=o2.indexOf("Enrolados · 5 ×"),c=o2.indexOf("Cozinha · 1 × Guioza"),q=o2.indexOf("Sushi Quentes · 2 × Hot Roll vencem em 4 min");
    assert.ok(e>0&&c>e&&q>c,"Enrolados, Cozinha, Sushi Quentes");assert.match(o2,/Ordem: pedidos já vencidos \(maior atraso, depois mais unidades\)/);});
  teste("dois problemas ao mesmo tempo e a resolução de um: Rui pronto tira 3 Uramakis; Ana pronta retira Enrolados e Cozinha",()=>{
    rui.etapa="pronto";let h=secao(tela("menu=mapa"),"Onde agir agora","Quem precisa agir");
    assert.match(h,/Enrolados · 2 × Uramaki de Salmão em 1 pedido atrasado/);assert.match(h,/Cozinha · 1 × Guioza/);
    ana.etapa="pronto";h=secao(tela("menu=mapa"),"Onde agir agora","Quem precisa agir");
    assert.doesNotMatch(h,/Enrolados · |Cozinha · /);assert.match(h,/Sushi Quentes · 2 × Hot Roll/);
    rui.etapa=ana.etapa="em preparo";});
  teste("fonte parada suspende as ações e diz desde quando; reconectada, as ações voltam",()=>{
    o.leitura_velha=true;o.gravado_ha_min=27;o.gravado_em="2026-11-20T21:38:00.000Z";
    const h=tela("menu=mapa");assert.match(h,/data-estado="velha"/);assert.match(h,/Leitura do Gestor parada/);
    assert.match(h,/há 27 min · últimos dados válidos às 18:38/);assert.doesNotMatch(h,/Uramaki|Guioza|Hot Roll|Quem precisa agir/);
    o.leitura_velha=false;o.gravado_ha_min=1;delete o.gravado_em;assert.match(tela("menu=mapa"),/Enrolados · 5 × Uramaki/);});
  teste("dados incompletos ficam ditos no Agora, sem virar zero",()=>{
    const h=tela("menu=mapa");assert.match(h,/data-estado="parcial"/);assert.match(h,/1 pedido sem sequência Teknisa confirmada/);
    assert.match(h,/1 pedido sem nome do cliente/);assert.match(h,/não o dia inteiro/);});
  teste("expedição: entregador na loja primeiro, com tempo desde o pronto, e vira ação no Agora",()=>{
    const p4=o.pedidos[3],etapa=p4.etapa;p4.etapa="pronto · entregador na loja";p4.pronto_ha_min=6;
    const r=tela("menu=rua");assert.match(r,/Expedição · prontos aguardando saída/);assert.match(r,/iFood #4170 · Cliente a conferir/);
    assert.match(r,/pronto há 6 min<\/strong> · entregador na loja/);
    assert.match(secao(tela("menu=mapa"),"Onde agir agora","Quem precisa agir"),/Expedição · entregar 1 pedido com entregador na loja/);
    p4.etapa=etapa;delete p4.pronto_ha_min;});
  teste("sacolas: identidade completa, sacola por sacola e o motivo",()=>{
    const s=tela("menu=sacolas");assert.match(s,/1 pedido com 2 ou mais sacolas/);assert.match(s,/Teknisa 007 · iFood #3812 · Ana/);
    assert.match(s,/Sacola 1 · Quentes de cozinha<\/strong> · 1 × Guioza/);assert.match(s,/Sacola 2 · Frios e sobremesas<\/strong> · 2 × Uramaki de Salmão/);
    assert.match(s,/motivo: Quente de cozinha e itens frios/);assert.doesNotMatch(s,/#4108|Lia/);});
  teste("menu em 7 grupos; as consultas antigas continuam abrindo dentro do grupo certo",()=>{
    const nav=tela("menu=mapa").match(/<nav aria-label="Consultas do Copiloto">([\s\S]*?)<\/nav>/)[1];
    assert.deepEqual([...nav.matchAll(/>([^<]+)<\/a>/g)].map(x=>x[1]),["Agora","Praças","Pedidos","Conferência","Previsão","Entregas","Fontes"]);
    const c=tela("menu=composicao");assert.match(c,/aria-current="page">Pedidos</);assert.match(c,/class="turno-abas"[\s\S]*Combinações por praça/);
    assert.match(tela("menu=fila"),/aria-current="page">Conferência</);});
  teste("Praças lista cada praça com o trabalho desta leitura",()=>{
    const h=tela("menu=pracas");assert.match(h,/Enrolados<\/strong><\/a><span class="turno-nota">5 itens em 2 pedidos atrasados · pior 12 min/);
    assert.match(h,/Sushi Quentes<\/strong><\/a><span class="turno-nota">2 itens vencem nos próximos 15 min/);
    assert.match(h,/Cozinha<\/strong><\/a><span class="turno-nota">1 item em 1 pedido atrasado · pior 12 min/);});
  console.log(n+"/"+n+" cenários passaram.");
} finally { await rm(tmp,{recursive:true,force:true}); }
