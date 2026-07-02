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

  // bloco da AÇÃO RECOMENDADA (criado dinamicamente — nenhum redesenho da tela)
  const fdec=document.createElement("div");
  fdec.id="fdecide";
  fdec.style.cssText="margin-top:10px;padding-top:8px;border-top:1px solid rgba(0,0,0,.08);font-size:.82em;line-height:1.45;opacity:.92";
  if (fcmd && fcmd.parentNode) fcmd.parentNode.insertBefore(fdec, fcmd.nextSibling);
  function renderDecisao(rec){
    if(!rec){ fdec.innerHTML=""; return; }
    fdec.innerHTML =
      '<div style="font-weight:700;letter-spacing:.04em">AÇÃO RECOMENDADA — '+rec.acao+'</div>'+
      '<div>porquê: '+rec.porque+'</div>'+
      '<div>primeiro olhar: '+rec.primeiro+' · impacto: '+rec.impacto+'</div>'+
      '<div style="opacity:.7">confiança: '+rec.confianca+' · '+rec.dados+'</div>';
  }

  function render(t,m){
    clk.textContent=hhmm(t);
    S.dataset.mode=m.mode; S.style.setProperty("--bd",m.intenso?"4.4s":"6s");
    const dir=m.foco?m.foco.dir:null;
    S.classList.toggle("dir-top",dir==="top"); S.classList.toggle("dir-bottom",dir==="bottom");
    if(m.mode==="foco"&&m.foco){
      const f=m.foco, meta=SEV[f.sev]||SEV[2];
      S.style.setProperty("--sevc",meta.c); S.style.setProperty("--warm","0");
      sevlbl.textContent=meta.r; fhead.textContent=f.head;
      fimpacts.innerHTML=(f.impactos||[]).filter(Boolean).map(x=>"<li>"+x+"</li>").join("");
      fconseq.textContent=f.conseq?("↳ "+f.conseq):"";
      fcmd.textContent=f.cmd;
      // foco = situação + recomendação: a Camada de Decisão ranqueia a melhor próxima ação
      renderDecisao(m.sits ? DEC.decidir(m, INFO, {fonteReal:FONTE_REAL}) : (m.decisao||null));
    } else if(m.mode==="ambiente"){
      renderDecisao(null);
      const topSev=Math.max(1,...(m.ambList||[]).map(a=>a.sev||1));
      S.style.setProperty("--sevc",(SEV[topSev]||SEV[1]).c);
      S.style.setProperty("--warm",(0.28+0.22*(topSev-1)).toFixed(2));
      ambLines.innerHTML=(m.ambList||[]).map(a=>'<div class="wl"><span class="wd" style="background:rgba('+(SEV[a.sev]||SEV[1]).c+',.9)"></span>'+a.label+'</div>').join("");
    } else { S.style.setProperty("--warm","0"); vital.textContent=(m.emand||0)+" em andamento"; renderDecisao(null); }
  }

  /* ===== replay da noite real ===== */
  const START=18*60, END=24*60-1, TICK=360; let t=START;

  /* DEMO invisível (revisão): toque cicla os diagnósticos ricos. Não é produto. */
  const DEMO=[ null,
   {mode:"calmo",emand:16,intenso:false},
   {mode:"ambiente",intenso:true,ambList:[{label:"Quentes carregando",sev:2},{label:"saída lenta",sev:1}]},
   {mode:"foco",intenso:true,foco:{sev:3,dir:"top",head:"QUENTES EM RISCO",impactos:["<b>8</b> pedidos na praça","<b>3</b> sairiam se Quentes liberar"],conseq:"se continuar, a expedição seca",cmd:"liberar prontos pra bancada"},
    decisao:{acao:"Priorizar Quentes",porque:"3 pedidos saem se Quentes liberar agora",primeiro:"Pedido #1234 (combinado — segura o pedido inteiro)",impacto:"libera 3 saídas · reduz risco de atraso",confianca:"média",dados:"tempos reais (iFood) · cardápio real (199 itens) · composição sintética"}},
   {mode:"foco",foco:{sev:2,dir:"top",head:"COMBINADOS SEGURANDO FLUXO",impactos:["<b>6</b> pedidos dependem de combinados","<b>2</b> já completos nas outras praças"],conseq:"combinado trava o pedido inteiro",cmd:"priorizar combinados que liberam saída"},
    decisao:{acao:"Fechar pedidos simples agora",porque:"3 pedidos dependem de uma única praça (ex.: Quentes) e já esperam",primeiro:"#4421, #4480, #4512",impacto:"desafoga a bancada · 3 pedidos saem da fila",confianca:"média",dados:"tempos reais (iFood) · cardápio real (199 itens) · composição sintética"}},
   {mode:"foco",foco:{sev:2,dir:"top",head:"ENROLADOS QUENTES EM RISCO",impactos:["Hot Roll / Ebiten concentrando a fila","praça acima do ritmo"],conseq:"trava o fechamento de pedidos",cmd:"priorizar bancada dos enrolados quentes"}},
   {mode:"foco",foco:{sev:1,dir:"top",head:"FECHAMENTO · #4421",impactos:["só depende de Quentes","sem frios pendentes"],conseq:"pronto pra fechar quando Quentes sair",cmd:"verificar se já dá pra fechar #4421"}},
   {mode:"foco",foco:{sev:2,dir:"top",head:"CONFERÊNCIA · #5012",impactos:["<b>2</b> sacolas · <b>11</b> itens","obrigatório: bebida + kit"],conseq:"risco de faltar item / 2ª sacola esquecida",cmd:"separar 2ª sacola e conferir item a item"},
    decisao:{acao:"Conferência reforçada",porque:"Pedido #5012 tem 2 sacolas, bebida, kit e observação",primeiro:"Pedido #5012 — obs: “sem cebolinha”",impacto:"alto risco de esquecimento (item / 2ª sacola / observação)",confianca:"média",dados:"tempos reais (iFood) · cardápio real (199 itens) · composição sintética"}},
   {mode:"foco",foco:{sev:2,dir:"bottom",head:"SAÍDA TRAVADA",impactos:["<b>14</b> prontos sem sair","motoboy é o gargalo"],conseq:"pedidos vão atrasar na entrega",cmd:"chamar motoboy / conferir saída"},
    decisao:{acao:"Chamar motoboy agora",porque:"14 pedidos prontos há mais de 30 min",primeiro:"Pedido #8606 (pronto há 53 min)",impacto:"14 prontos virando atraso na entrega",confianca:"alta",dados:"tempos reais (iFood) · cardápio real (199 itens) · composição sintética"}}
  ];
  let di=0, forced=null;
  S.addEventListener("click",()=>{ di=(di+1)%DEMO.length; forced=DEMO[di]; if(forced) render(t,forced); });
  function loop(){ if(!forced){ render(t,step(t)); t++; if(t>END){t=START; SESS=M.novaSessao();} } setTimeout(loop,TICK); }
  (async()=>{try{if('wakeLock'in navigator)await navigator.wakeLock.request('screen');}catch(e){}})();
  loop();
})();
