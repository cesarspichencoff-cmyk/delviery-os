/* AUTO TESTE v2 — motor de 8 praças rodando sobre o cardápio REAL (seed) e timing REAL.
   3 motores separados: (A) tempo/estado REAL · (B) praça SINTÉTICA · (C) conhecimento REAL.
   Usa o MESMO cérebro do protótipo: src/perfil-delivery/motor.js (nenhuma regra duplicada).

   Fonte do relatório iFood (nenhuma depende de máquina específica), em ordem de prioridade:
     1) variável de ambiente DELIVERYOS_RELATORIO_IFOOD (ver .env.example)
     2) padrão do projeto: data/raw/relatorio_pedidos_ifood.xlsx
   Ver docs/Politica_Dados.md. */
const XLSX=require("xlsx"), fs=require("fs"), path=require("path");
const REPO=path.join(__dirname,"..");
const MOTOR=require(path.join(REPO,"src/perfil-delivery/motor.js"));
const DECISAO=require(path.join(REPO,"src/perfil-delivery/decisao.js"));
const SEED=require(path.join(REPO,"data/cardapio_knowledge_seed.json")).itens;
const FONTE_REAL=false;   // composição sintética → confiança das decisões de composição fica média/baixa
const ARQ=process.env.DELIVERYOS_RELATORIO_IFOOD || path.join(REPO,"data/raw/relatorio_pedidos_ifood.xlsx");
const OUT=path.join(REPO,"docs/AutoTeste_Operacional_8pracas.md");

if(!fs.existsSync(ARQ)){
  console.log(`\nERRO: relatório não encontrado em "${ARQ}".`);
  console.log("Coloque o export do iFood em data/raw/relatorio_pedidos_ifood.xlsx, ou defina DELIVERYOS_RELATORIO_IFOOD no seu .env (veja .env.example / docs/Politica_Dados.md).");
  process.exit(1);
}
const wb=XLSX.readFile(ARQ,{cellDates:false}); const ws=wb.Sheets["Página 1"]||wb.Sheets[wb.SheetNames[0]];
const rows=XLSX.utils.sheet_to_json(ws,{defval:null});
// parser da linha (nomes de coluna, data/hora, reconstrução de "saiu") vive em um só lugar —
// ver src/ingest/parserRelatorioIfood.js (antes duplicado aqui; ver Auditoria_Nivel2 §3.3).
const PARSER=require(path.join(REPO,"src/ingest/parserRelatorioIfood.js"));

/* ===== (C) conhecimento real + (B) fonte sintética + adapter + resolver — tudo via MOTOR ===== */
MOTOR.setNomes(Object.fromEntries(SEED.map(i=>[i.id,i.nome])));
const fonte=MOTOR.makeFonteSintetica(SEED);
const F=MOTOR.FLOORS;

/* ===== (A) parse pedidos — timing REAL ===== */
const peds=[];
for(const r of rows){
  const o=PARSER.linhaParaRegistro(r);
  if(!o)continue;
  o.prodWait=o.p!=null?o.p-o.r:(o.c!=null?o.c-o.r:0);
  const up=o.s!=null?o.s:o.e; o.expedWait=(o.p!=null&&up!=null)?up-o.p:0;
  o.bad=o.cancel||o.atraso>15||o.problema;
  o.risco=o.bad||o.prodWait>F.PROD||o.expedWait>F.EXPED;
  peds.push(o);
}
/* INFO global: id → conhecimento do pedido (composição sintética, timing real) */
const INFO={}; for(const o of peds) INFO[o.id]=MOTOR.resolver(fonte(o.id));   // fonte já devolve itens adaptados
const dias=[...new Set(peds.map(p=>p.dia))].sort((a,b)=>{const A=a.split("/"),B=b.split("/");return (A[2]+A[1]+A[0]).localeCompare(B[2]+B[1]+B[0]);});

/* ===== roda o motor por dia (via MOTOR.step) ===== */
function runDay(O){
  const sess=MOTOR.novaSessao();
  const mode=new Array(24*60).fill("calmo"); const focos=[]; const recs=[]; const surge={}; let fMin=0,aMin=0,cMin=0,run=0,maxRun=0;
  let prevKey=null;
  for(let t=11*60;t<=24*60-1;t++){
    const R=MOTOR.step(t,O,INFO,sess);
    mode[t]=R.mode;
    for(const s of R.sits){ if(s.kind==="praca") surge[s.praca]=(surge[s.praca]||0)+1; }
    const curKey=sess.active?sess.active.key:null;
    if(curKey&&curKey!==prevKey){ const st=sess.active.sit; focos.push({t,kind:st.kind,key:curKey,sev:st.sev,id:st.id,praca:st.praca});
      // CAMADA DE DECISÃO: no onset de cada foco (quando a tela mostraria), qual a ação recomendada?
      const rec=DECISAO.decidir(R,INFO,{fonteReal:FONTE_REAL,active:sess.active});
      if(rec) recs.push({t,tipo:rec.tipo,acao:rec.acao,confianca:rec.confianca,dependeComposicao:rec.dependeComposicao}); }
    prevKey=curKey;
    if(R.mode==="foco"){fMin++;run++;maxRun=Math.max(maxRun,run);}else{run=0;R.mode==="ambiente"?aMin++:cMin++;}
  }
  return {mode,focos,recs,surge,fMin,aMin,cMin,maxRun};
}

/* ===== agrega 30 dias ===== */
let totFoco=0,ordFoco=0,useful=0,exager=0;
const byKind={praca:0,order:0,saida:0,fechamento:0,conferencia:0};
let badTot=0,silentMiss=0,riscoTot=0;
const recTipo={}, recConf={alta:0,media:0,baixa:0}; let recTot=0, recComp=0;
const surgeAll={}, byDay=[], horaFoco=new Array(24).fill(0); let fAll=0,aAll=0,cAll=0,maxRunAll=0;
for(const dia of dias){
  const O=peds.filter(p=>p.dia===dia); const R=runDay(O);
  fAll+=R.fMin;aAll+=R.aMin;cAll+=R.cMin;maxRunAll=Math.max(maxRunAll,R.maxRun);
  for(const p of MOTOR.PRODUCAO) surgeAll[p]=(surgeAll[p]||0)+(R.surge[p]||0);
  const upOf=o=>o.s!=null?o.s:(o.e!=null?o.e:(o.c!=null?o.c:o.r+30));
  for(const f of R.focos){ totFoco++; horaFoco[Math.floor(f.t/60)]++; byKind[f.kind]=(byKind[f.kind]||0)+1;
    if(f.kind==="order") ordFoco++;
    const live=O.some(o=>o.bad&&o.r<=f.t&&upOf(o)>=f.t);   // havia pedido ruim de fato vivo neste minuto?
    live?useful++:exager++; }
  for(const r of R.recs){ recTot++; recTipo[r.tipo]=(recTipo[r.tipo]||0)+1;
    recConf[r.confianca==="média"?"media":r.confianca]=(recConf[r.confianca==="média"?"media":r.confianca]||0)+1;
    if(r.dependeComposicao) recComp++; }
  const dayBad=O.filter(o=>o.bad); badTot+=dayBad.length; riscoTot+=O.filter(o=>o.risco).length;
  for(const o of dayBad){ const up=o.s!=null?o.s:(o.e!=null?o.e:(o.c!=null?o.c:o.r+30)); let cov=false;
    for(let t=Math.max(11*60,o.r);t<=Math.min(24*60-1,up);t++){ if(R.mode[t]!=="calmo"){cov=true;break;} } if(!cov)silentMiss++; }
  const tot=R.fMin+R.aMin+R.cMin;
  byDay.push({dia,foco:R.fMin,gargalo:(R.fMin+R.aMin)/tot,nFoco:R.focos.length,nBad:dayBad.length,nPed:O.length});
}
const totalPed=peds.length, totMin=fAll+aAll+cAll;
const precisao=totFoco?useful/totFoco:0, coberturaBad=badTot?1-silentMiss/badTot:1, focoShare=fAll/totMin;
const calmAprop=focoShare<=0.12?1:(focoShare<=0.20?0.7:(focoShare<=0.30?0.4:0.2));
const nota=Math.max(0,Math.min(10,10*(0.40*precisao+0.40*coberturaBad+0.20*calmAprop)));
const pct=x=>(100*x).toFixed(0)+"%";

/* exemplos de diagnóstico REAIS: pega o 1º foco de cada tipo e reconstrói o texto */
function exemploDe(kind){
  for(const dia of dias){ const O=peds.filter(p=>p.dia===dia); const sess=MOTOR.novaSessao();
    for(let t=11*60;t<=24*60-1;t++){ const R=MOTOR.step(t,O,INFO,sess);
      if(R.foco && sess.active && sess.active.sit.kind===kind){ return {dia,t,foco:R.foco}; } } }
  return null;
}
const hhmm=t=>String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0");
function fmtFoco(e){ if(!e)return "_(não ocorreu no mês)_"; const f=e.foco;
  return `\`\`\`\n${f.head}\n${f.impactos.map(x=>"• "+x.replace(/<\/?b>/g,"")).join("\n")}\n${f.conseq}\n→ ${f.cmd}\n\`\`\`  \n_(${e.dia} ${hhmm(e.t)})_`; }

/* exemplo REAL de recomendação da Camada de Decisão (1º de cada tipo no mês) */
function exemploRecDe(tipo){
  for(const dia of dias){ const O=peds.filter(p=>p.dia===dia); const sess=MOTOR.novaSessao(); let prevKey=null;
    for(let t=11*60;t<=24*60-1;t++){ const R=MOTOR.step(t,O,INFO,sess);
      const curKey=sess.active?sess.active.key:null;
      if(curKey&&curKey!==prevKey){ const rec=DECISAO.decidir(R,INFO,{fonteReal:FONTE_REAL,active:sess.active});
        if(rec&&rec.tipo===tipo) return {dia,t,rec}; }
      prevKey=curKey; } }
  return null;
}
function fmtRec(e){ if(!e)return "_(não ocorreu no mês)_"; const r=e.rec;
  return `\`\`\`\nAÇÃO RECOMENDADA — ${r.acao}\npor quê: ${r.porque}\nprimeiro olhar: ${r.primeiro}\nimpacto: ${r.impacto}\nconfiança: ${r.confianca}\ndados: ${r.dados}\n\`\`\`  \n_(${e.dia} ${hhmm(e.t)})_`; }

/* ===== relatório ===== */
const L=[];
L.push("# Auto Teste Operacional v2 — motor de 8 praças\n");
L.push(`> Backtest sobre **${dias.length} dias reais** (${dias[0]}→${dias[dias.length-1]}), ${totalPed} pedidos.`);
L.push("> **Mesmo cérebro do protótipo** (`src/perfil-delivery/motor.js`) — nenhuma regra duplicada.\n");
L.push("### Três motores, separados de propósito");
L.push("| Motor | Estado | Fonte |");
L.push("|---|---|---|");
L.push("| (A) tempo / estado do pedido | **REAL** | relatório iFood (recebido/pronto/saiu/cancelado) |");
L.push("| (B) praça (qual bancada / carga) | **SINTÉTICO** | composição pedido→itens fabricada (`makeFonteSintetica`) |");
L.push("| (C) conhecimento do cardápio | **REAL** | `cardapio_knowledge_seed.json` (199 itens, 8 praças) |\n");
L.push(`## Nota do motor (desfecho real): **${nota.toFixed(1)} / 10**`);
L.push(`*(0,40×precisão ${pct(precisao)} + 0,40×cobertura ${pct(coberturaBad)} + 0,20×calma ${calmAprop}) — precisão/cobertura usam só desfecho REAL; números de praça são ilustrativos.*\n`);
L.push("---\n");
L.push("## 1. As 8 praças no motor (quantos itens entraram)");
L.push("| Praça | Classe | Itens no cardápio |");
L.push("|---|---|---|");
const cntPraca={}; SEED.forEach(i=>{ if(i.praca_principal) cntPraca[i.praca_principal]=(cntPraca[i.praca_principal]||0)+1; });
for(const p of MOTOR.PRACAS){ const classe=MOTOR.PRODUCAO.includes(p)?"produção":"conferência/montagem"; L.push(`| ${MOTOR.DISPLAY[p]} (\`${p}\`) | ${classe} | ${cntPraca[p]||0} |`); }
L.push("");
L.push("## 2. Diagnósticos que o motor agora emite (não só alerta)");
L.push("O motor deixou de dizer só \"tem atraso\". Exemplos REAIS gerados no backtest:\n");
L.push("**Praça de produção sobrecarregada (com causa + quanto libera):**"); L.push(fmtFoco(exemploDe("praca")));
L.push("\n**Fechamento (pedido que depende de uma só praça):**"); L.push(fmtFoco(exemploDe("fechamento")));
L.push("\n**Conferência (pedido grande / 2 sacolas / bebida+kit):**"); L.push(fmtFoco(exemploDe("conferencia")));
L.push("\n**Saída travada (motoboy é o gargalo):**"); L.push(fmtFoco(exemploDe("saida")));
L.push("");
L.push("## 3. Volume de focos por tipo (mês)");
L.push(`- praça: **${byKind.praca}** · pedido preso: **${byKind.order}** · saída: **${byKind.saida}** · fechamento: **${byKind.fechamento}** · conferência: **${byKind.conferencia}**`);
L.push(`- total **${totFoco}** (~${(totFoco/dias.length).toFixed(1)}/dia) · tempo: 🟢 ${pct(cAll/totMin)} calmo · 🌫️ ${pct(aAll/totMin)} ambiente · 🔶 ${pct(focoShare)} foco\n`);
L.push("## 3b. CAMADA DE DECISÃO — recomendações geradas (novo)");
L.push("A cada foco, a camada de decisão ranqueia a **melhor próxima ação** (\"se você olhar uma coisa agora, olhe isso\"):\n");
L.push(`- Recomendações geradas no mês: **${recTot}** (uma por onset de foco)`);
L.push(`- Por tipo: ${Object.entries(recTipo).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} **${v}**`).join(" · ")}`);
L.push(`- Confiança: alta **${recConf.alta}** · média **${recConf.media}** · baixa **${recConf.baixa}**`);
L.push(`- Dependem de composição (sintética hoje → confiança limitada a média): **${recComp}** (${pct(recTot?recComp/recTot:0)})`);
L.push(`- Só de tempo/estado real (confiança alta já hoje): **${recTot-recComp}** (${pct(recTot?(recTot-recComp)/recTot:0)})\n`);
L.push("Exemplos REAIS gerados no backtest:\n");
L.push("**Priorizar praça (release impact):**"); L.push(fmtRec(exemploRecDe("priorizar_praca")));
L.push("\n**Chamar motoboy (timing 100% real):**"); L.push(fmtRec(exemploRecDe("chamar_motoboy")));
L.push("\n**Fechar pedidos simples:**"); L.push(fmtRec(exemploRecDe("fechar_simples")));
L.push("\n**Conferência reforçada:**"); L.push(fmtRec(exemploRecDe("conferencia")));
L.push("");
L.push("## 4. Precisão dos focos (desfecho real)");
L.push(`- **${useful}/${totFoco} (${pct(precisao)})** dos focos aconteceram com um pedido **ruim de fato vivo** naquele minuto (cancelado/atraso>15/problema). Fora de janela ruim: ${exager}.`);
L.push(`- Focos de pedido preso especificamente: ${ordFoco}. *(fechamento/conferência são ações úteis, não previsões de risco.)*\n`);
L.push("## 5. Cobertura dos pedidos ruins");
L.push(`- **${badTot}** pedidos ruins no mês; **${silentMiss}** passaram 100% em calmo (ponto cego). Cobertura **${pct(coberturaBad)}**.`);
L.push(`- Pedidos que cruzaram risco: **${riscoTot}** (${pct(riscoTot/totalPed)}).\n`);
L.push("## 6. Praças que mais travaram *(SINTÉTICO — ilustrativo, baseline provisório não calibrado)*");
Object.entries(surgeAll).sort((a,b)=>b[1]-a[1]).forEach(([p,m])=>L.push(`- ${MOTOR.DISPLAY[p]} (\`${p}\`): **${m}** min de sobrecarga`));
L.push("");
L.push("## 7. Dias com mais gargalo");
[...byDay].sort((a,b)=>b.gargalo-a.gargalo).slice(0,5).forEach(d=>L.push(`- ${d.dia}: gargalo **${pct(d.gargalo)}** · ${d.nFoco} focos · ${d.nPed} pedidos · ${d.nBad} ruins`));
L.push("");
L.push("## 8. Horários mais críticos");
horaFoco.map((n,h)=>({h,n})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,6).forEach(x=>L.push(`- **${String(x.h).padStart(2,"0")}h** — ${x.n} focos`));
L.push("");
L.push("## 9. O que é REAL vs SINTÉTICO neste resultado");
L.push("- **REAL e confiável:** todo o eixo de tempo/estado — atraso, pronto sem sair, cancelamento, problema; precisão e cobertura acima.");
L.push("- **SINTÉTICO (ilustrativo):** quais itens cada pedido teve → logo, qual praça carregou, item dominante, 2ª sacola, bebida/kit. Vira REAL quando ligar KDS/impressora/API iFood (trocar só `makeFonteSintetica`).");
L.push("- **REAL mas não calibrado:** o cardápio (199 itens/8 praças) é real; os BASELINE por praça são PROVISÓRIOS (tuning é passo futuro).\n");
L.push("## 10. Próximos ajustes (quando liberar tuning)");
Object.entries(surgeAll).filter(([,m])=>m>(totMin/dias.length)*0.5).forEach(([p])=>L.push(`- Rever baseline de **${MOTOR.DISPLAY[p]}** (satura tempo demais — provável baseline subestimado, sobretudo Duplas por concentrar sushi/sashimi/dyo).`));
if(exager/Math.max(1,ordFoco)>0.5) L.push(`- Subir piso de expedição/produção (exagero ${pct(exager/ordFoco)}).`);
if(maxRunAll>F.MAXFOCUS+2) L.push(`- Reforçar demote→ambiente (sequência de foco chegou a ${maxRunAll} min).`);
L.push("- Só calibrar baseline DEPOIS de ligar a composição real — antes disso é calibrar no escuro.\n");
L.push("---");
L.push("*Determinístico. Trocar a fonte de itens (sintética→real) NÃO muda nenhuma regra — basta re-rodar.*");
fs.writeFileSync(OUT,L.join("\n"),"utf8");

console.log(`AUTO TESTE v2: ${dias.length} dias, ${totalPed} pedidos`);
console.log(`Nota ${nota.toFixed(1)}/10 · precisão ${pct(precisao)} · cobertura ${pct(coberturaBad)} · foco ${pct(focoShare)}`);
console.log(`focos ${totFoco} → praça ${byKind.praca} / preso ${byKind.order} / saída ${byKind.saida} / fechamento ${byKind.fechamento} / conferência ${byKind.conferencia}`);
console.log(`DECISÕES ${recTot} → ${Object.entries(recTipo).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+" "+v).join(" / ")}`);
console.log(`confiança: alta ${recConf.alta} · média ${recConf.media} · baixa ${recConf.baixa} · dependem de composição ${recComp}/${recTot}`);
console.log(`ruins ${badTot} · silenciosos ${silentMiss} · maxRun ${maxRunAll}min`);
console.log("relatório: "+OUT);
