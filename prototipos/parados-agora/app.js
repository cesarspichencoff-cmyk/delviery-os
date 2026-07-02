/* ============================================================================
 * DeliveryOS · protótipo "Parados Agora" — SHELL DE RENDER (não é o cérebro)
 * ----------------------------------------------------------------------------
 * NÃO inventa cardápio nem regra de decisão.
 *   cardápio real  = window.CARDAPIO_SEED  (cardapio_knowledge_seed.json injetado)
 *   cérebro        = window.MOTOR          (src/perfil-delivery/motor.js)
 * Fluxo: seed → adapter → resolver → sinais → atenção → (aqui) interface.
 * ==========================================================================*/
(function () {
  "use strict";
  const NIGHT = window.NIGHT || [];
  const M = window.MOTOR;
  const SEED = (window.CARDAPIO_SEED && window.CARDAPIO_SEED.itens) ? window.CARDAPIO_SEED.itens : (window.CARDAPIO_SEED || []);

  // (C) conhecimento real → nomes; (B) fonte sintética (SEAM único p/ trocar por itens reais)
  M.setNomes(Object.fromEntries(SEED.map(i => [i.id, i.nome])));
  const FONTE_ITENS = M.makeFonteSintetica(SEED);   // ← trocar por makeFonteItensFromCsv/Json (KDS/impressora/API iFood)
  const FONTE_REAL = !!FONTE_ITENS.stats;           // fontes reais expõem .stats; a sintética não
  const INFO = {}; for (const o of NIGHT) INFO[o.id] = M.resolver(FONTE_ITENS(o.id));   // fonte já devolve itens adaptados
  let SESS = M.novaSessao();
  function step(t) { return M.step(t, NIGHT, INFO, SESS); }
  const DEC = window.DECISAO;                       // camada de decisão (decisao.js)

  // mapa severidade → cor/rótulo (só interface)
  const SEV = { 3:{c:"192,57,43",r:"CRÍTICO"}, 2:{c:"204,122,31",r:"ATENÇÃO"}, 1:{c:"181,154,42",r:"MONITORAR"} };
  const S=document.getElementById("screen"), clk=document.getElementById("clock");
  const sevlbl=document.getElementById("sevlbl"), fhead=document.getElementById("fhead"),
        fimpacts=document.getElementById("fimpacts"), fconseq=document.getElementById("fconseq"), fcmd=document.getElementById("fcmd");
  const ambLines=document.getElementById("ambLines"), vital=document.getElementById("vital");
  const hhmm=t=>String(Math.floor(t/60)%24).padStart(2,"0")+":"+String(t%60).padStart(2,"0");

  // sussurro de honestidade: uma linha minúscula, só quando o sistema NÃO está 100% seguro.
  // (dados usados, scores e ranking ficam no objeto rec / backtest — NUNCA na tela)
  const fdec=document.createElement("div");
  fdec.id="fdecide";
  fdec.style.cssText="margin-top:12px;font-size:.6em;letter-spacing:.08em;text-transform:uppercase;opacity:.42";
  if (fcmd && fcmd.parentNode) fcmd.parentNode.insertBefore(fdec, fcmd.nextSibling);

  function render(t,m){
    clk.textContent=hhmm(t);
    S.dataset.mode=m.mode; S.style.setProperty("--bd",m.intenso?"4.4s":"6s");
    const dir=m.foco?m.foco.dir:null;
    S.classList.toggle("dir-top",dir==="top"); S.classList.toggle("dir-bottom",dir==="bottom");
    if(m.mode==="foco"&&m.foco){
      const f=m.foco, meta=SEV[f.sev]||SEV[2];
      S.style.setProperty("--sevc",meta.c); S.style.setProperty("--warm","0");
      sevlbl.textContent=meta.r;
      const real=(m.fonteReal!==undefined)?m.fonteReal:FONTE_REAL;
      const rec=m.rec || (m.sits ? DEC.decidir(m, INFO, {fonteReal:real}) : null);
      if(rec){
        // HIERARQUIA DO FOCO: 1 ação · 2 onde olhar · 3 porquê · 4 impacto · 5 confiança (sussurro)
        fhead.textContent=rec.head||rec.acao.toUpperCase();
        fimpacts.innerHTML="<li>"+rec.porque+"</li><li>Primeiro olhar: <b>"+rec.primeiro+"</b></li>";
        fconseq.textContent="↳ "+rec.impacto;
        fcmd.textContent="";   // a ação JÁ É o título — nada duplica
        const incerto=rec.confianca!=="alta"||(rec.dependeComposicao&&!real);
        fdec.textContent=incerto?("confiança "+rec.confianca+(rec.dependeComposicao&&!real?" · composição sintética":"")):"";
      } else {
        fhead.textContent=f.head;
        fimpacts.innerHTML=(f.impactos||[]).filter(Boolean).map(x=>"<li>"+x+"</li>").join("");
        fconseq.textContent=f.conseq?("↳ "+f.conseq):"";
        fcmd.textContent=f.cmd; fdec.textContent="";
      }
    } else if(m.mode==="ambiente"){
      fdec.textContent="";
      const topSev=Math.max(1,...(m.ambList||[]).map(a=>a.sev||1));
      S.style.setProperty("--sevc",(SEV[topSev]||SEV[1]).c);
      S.style.setProperty("--warm",(0.28+0.22*(topSev-1)).toFixed(2));
      ambLines.innerHTML=(m.ambList||[]).map(a=>'<div class="wl"><span class="wd" style="background:rgba('+(SEV[a.sev]||SEV[1]).c+',.9)"></span>'+a.label+'</div>').join("");
    } else { S.style.setProperty("--warm","0"); vital.textContent=(m.emand||0)+" em andamento"; fdec.textContent=""; }
  }

  /* ===== replay da noite real ===== */
  const START=18*60, END=24*60-1, TICK=360; let t=START;

  /* DEMO invisível (revisão): toque cicla os 10 estados principais. Não é produto.
     Ordem: vivo → calmo → ambiente → exped → praça(sintético) → fechamento → conferência
            → item pausado(futuro) → confiança média → dado real (footer some) */
  const DEMO=[ null,
   {mode:"calmo",emand:16,intenso:false},
   {mode:"ambiente",intenso:true,ambList:[{label:"Quentes carregando",sev:2},{label:"saída lenta",sev:1}]},
   {mode:"foco",intenso:true,foco:{sev:3,dir:"bottom"},
    rec:{head:"CHAME MOTOBOY",porque:"7 prontos há mais de 30 min",primeiro:"#7006 · pronto há 55 min",impacto:"todos viram atraso de entrega",confianca:"alta",dependeComposicao:false}},
   {mode:"foco",foco:{sev:2,dir:"top"},
    rec:{head:"PRIORIZE DUPLAS",porque:"6 pedidos saem se Duplas liberar",primeiro:"#8565 (combinado)",impacto:"libera 6 saídas · reduz atraso",confianca:"média",dependeComposicao:true}},
   {mode:"foco",foco:{sev:2,dir:"top"},
    rec:{head:"FECHE PEDIDOS SIMPLES",porque:"3 pedidos dependem só de Quentes, sem mais pendências",primeiro:"#4421, #4480, #4512",impacto:"3 pedidos saem da fila",confianca:"média",dependeComposicao:true}},
   {mode:"foco",foco:{sev:2,dir:"top"},
    rec:{head:"CONFIRA O #5012",porque:"2 sacolas · bebida · kit · observação",primeiro:"obs: “sem cebolinha”",impacto:"evita item esquecido e 2ª sacola perdida",confianca:"média",dependeComposicao:true}},
   {mode:"foco",foco:{sev:2,dir:"top"},
    rec:{head:"PAUSE O SALMÃO SKIN",porque:"saiu em 4 pedidos em 15 min — deveria estar pausado",primeiro:"#8123",impacto:"evita 4 erros de conferência",confianca:"baixa",dependeComposicao:true}},
   {mode:"foco",foco:{sev:2,dir:"top"},
    rec:{head:"OLHE O #7223",porque:"78 min sem ficar pronto — fora do padrão",primeiro:"#7223",impacto:"destrava o mais atrasado da produção",confianca:"média",dependeComposicao:true}},
   {mode:"foco",foco:{sev:2,dir:"top"},fonteReal:true,
    rec:{head:"PRIORIZE DUPLAS",porque:"6 pedidos saem se Duplas liberar",primeiro:"#8565 (combinado)",impacto:"libera 6 saídas · reduz atraso",confianca:"alta",dependeComposicao:true}}
  ];
  let di=0, forced=null;
  S.addEventListener("click",()=>{ di=(di+1)%DEMO.length; forced=DEMO[di]; if(forced) render(t,forced); });
  function loop(){ if(!forced){ render(t,step(t)); t++; if(t>END){t=START; SESS=M.novaSessao();} } setTimeout(loop,TICK); }
  (async()=>{try{if('wakeLock'in navigator)await navigator.wakeLock.request('screen');}catch(e){}})();
  loop();
})();
