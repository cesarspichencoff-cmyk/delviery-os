/* ============================================================================
 * DeliveryOS · Perfil Delivery · MOTOR (cérebro desacoplado)
 * ----------------------------------------------------------------------------
 * Fonte única de regra. Roda em Node (Auto Teste) e no protótipo (browser).
 * Fluxo oficial:  cardápio real (seed) → adapter → resolver → sinais → atenção → interface
 *
 * SEPARAÇÃO EXPLÍCITA DE TRÊS MOTORES:
 *   (A) motor de TEMPO/ESTADO   → REAL   (vem do relatório iFood: recebido/pronto/saiu/cancel)
 *   (B) motor de PRAÇA          → SINTÉTICO enquanto não houver itens reais por pedido
 *                                 (composição do pedido é fabricada em makeFonteSintetica)
 *   (C) motor de CONHECIMENTO   → REAL   (cardapio_knowledge_seed.json, 199 itens, 8 praças)
 *
 * Nada aqui faz tuning ou calibração. BASELINE/TEMPO_PRACA são PROVISÓRIOS e rotulados.
 * ==========================================================================*/
(function (root) {
  "use strict";

  // ---- vocabulário oficial das 8 praças ----
  const PRACAS = ["combinados","duplas","enrolados","enrolados_quentes","cozinha_quentes","sobremesa","bar_bebidas","montagem_outros"];
  // praças que PRODUZEM (podem gerar sobrecarga de produção)
  const PRODUCAO = ["combinados","duplas","enrolados","enrolados_quentes","cozinha_quentes"];
  // praças de CONFERÊNCIA/MONTAGEM (geram esquecimento/fechamento/conferência/sacola — não sobrecarga)
  const CONFERENCIA = ["sobremesa","bar_bebidas","montagem_outros"];
  // rótulo para a operação (interface)
  const DISPLAY = {
    combinados:"Combinados", duplas:"Duplas", enrolados:"Enrolados",
    enrolados_quentes:"Enrolados Quentes", cozinha_quentes:"Quentes",
    sobremesa:"Sobremesa", bar_bebidas:"Bar", montagem_outros:"Montagem"
  };

  // ---- PROVISÓRIO · NÃO CALIBRADO (tuning é passo futuro; só existe p/ o motor rodar) ----
  const BASELINE   = { combinados:3, duplas:6, enrolados:5, enrolados_quentes:3, cozinha_quentes:4 }; // nº de pedidos "normal" na praça
  const TEMPO_PRACA= { combinados:22, duplas:9, enrolados:8, enrolados_quentes:12, cozinha_quentes:12 }; // min "normal" na praça
  const FLOORS = { EXPED:30, PROD:45, SURGE:3, COOLDOWN:45, MAXFOCUS:8, DEBOUNCE:3 };

  const cap = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : s;
  const uniq = a => Array.from(new Set(a));

  /* ---------- ADAPTER: item do seed (conhecimento real) → item do resolver ----------
     Único ponto que conhece o SHAPE do seed. Se o seed mudar de forma, muda só aqui. */
  function adaptarItem(s) {
    return {
      id: s.id, nome: s.nome,
      praca: s.praca_principal,                     // pode ser null (não-produção)
      dep: s.pracas_dependentes || [],
      temp: s.temperatura,
      sac: (typeof s.sacolas_esperadas === "number") ? s.sacolas_esperadas : 1,
      cat: s.categoria_operacional,
      trava: !!s.trava_fechamento,
      produzSozinho: s.produz_sozinho,
      pausavel: !!s.pausavel,
      risco: s.risco_de_erro || "baixo",
      contemBebida: !!s.contem_bebida,
      contemSobremesa: !!s.contem_sobremesa,
      contemKit: !!s.contem_kit,
      sinais: s.sinais_que_pode_gerar || []
    };
  }

  /* ---------- RESOLVER: itens de UM pedido → conhecimento operacional do pedido ----------
     Estável e agnóstico de fonte. Não muda quando a fonte de itens virar real. */
  function resolver(itensAdapt) {
    const it = itensAdapt;
    const prodPr = uniq(it.filter(x => PRODUCAO.includes(x.praca)).map(x => x.praca));
    const depRaw = uniq([].concat.apply([], it.map(x => x.dep || [])));
    const depPr  = uniq(depRaw.filter(p => PRODUCAO.includes(p)));
    const benches = uniq(prodPr.concat(depPr));               // bancadas de produção que o pedido precisa
    const confPr = uniq(it.filter(x => CONFERENCIA.includes(x.praca)).map(x => x.praca));
    const temQuente = it.some(x => x.temp === "quente");
    const temFrio   = it.some(x => x.temp === "frio");
    const nItens = it.length;
    const sacolas = Math.max(1, it.reduce((a,x)=>a+(x.sac||0),0));
    const ancora = it.some(x => x.cat === "combinado" || x.cat === "menu_composto");
    const segundaSacola = sacolas >= 2 || ancora || nItens >= 8;
    const contemBebida = it.some(x => x.praca === "bar_bebidas" || x.contemBebida);
    const contemSobremesa = it.some(x => x.praca === "sobremesa" || x.contemSobremesa);
    // kit não é SKU de cardápio → proxy sintético/regra-de-negócio (talher/hashi obrigatório em combo/2 sacolas)
    const contemKit = it.some(x => x.contemKit) || ancora || sacolas >= 2;
    const riscoConfAlto = it.some(x => x.risco === "alto") || segundaSacola || (contemBebida && contemKit);
    const facilEsquecer = confPr.length > 0 || contemBebida || contemSobremesa;
    const itemPorPraca = {};
    it.forEach(x => { if (PRODUCAO.includes(x.praca)) { (itemPorPraca[x.praca] = itemPorPraca[x.praca] || []).push(x.id); } });
    return {
      nItens, benches, prodPr, depPr, confPr, nBenches: benches.length,
      pracaUnica: benches.length === 1 ? benches[0] : null,
      temQuente, temFrio, soQuentes: temQuente && !temFrio,
      sacolas, segundaSacola, trava: it.some(x => x.trava),
      contemBebida, contemSobremesa, contemKit, riscoConfAlto, facilEsquecer, ancora,
      itemPorPraca,
      itens: it.map(x => ({ id:x.id, nome:x.nome, praca:x.praca }))
    };
  }

  /* ---------- SEAM: fonte de itens por pedido (SINTÉTICA — motor B) ----------
     ÚNICO ponto a trocar quando houver KDS/impressora/API iFood.
     Pesos de popularidade são PROVISÓRIOS e NÃO fazem parte do conhecimento (seed).
     Popularidade real deve vir de venda real; aqui é só para o motor girar. */
  function makeFonteSintetica(seedItens) {
    const W = { combinado:5, menu_composto:1, dupla:5, enrolado:3, enrolado_quente:2,
                prato_quente:3, entrada:2, sobremesa:2, bebida:3, complemento:0,
                acompanhamento:1, nao_producao:0, outros:0 };
    const peso = i => (W[i.categoria_operacional] != null ? W[i.categoria_operacional] : 1);
    const mains = seedItens.filter(i => PRODUCAO.includes(i.praca_principal) && peso(i) > 0);
    const beb   = seedItens.filter(i => i.praca_principal === "bar_bebidas");
    const sob   = seedItens.filter(i => i.praca_principal === "sobremesa");
    const rng = s => { let h=2166136261; for (let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return () => { h=Math.imul(h^(h>>>15),2246822519); return (h>>>0)/4294967296; }; };
    const pick = (arr,r) => { const t=arr.reduce((x,b)=>x+peso(b),0); let v=r()*t; for (const i of arr){ v-=peso(i); if (v<=0) return i; } return arr[arr.length-1]; };
    return function FONTE_ITENS_sintetica(id) {
      const r = rng("p"+id);
      const out = [ pick(mains,r) ];
      const c0 = out[0].categoria_operacional;
      if (c0 !== "combinado" && c0 !== "menu_composto" && r() < 0.40) out.push(pick(mains,r));
      if (beb.length && r() < 0.35) out.push(pick(beb,r));
      if (sob.length && r() < 0.15) out.push(pick(sob,r));
      return out;
    };
  }

  /* ---------- índice de pedidos: id → conhecimento (via fonte + adapter + resolver) ---------- */
  function indexar(NIGHT, seedItens, fonte) {
    const byId = {}; seedItens.forEach(i => byId[i.id] = i);
    const F = fonte || makeFonteSintetica(seedItens);
    const INFO = {};
    for (const o of NIGHT) INFO[o.id] = resolver(F(o.id).map(adaptarItem));
    return INFO;
  }

  /* ---------- sessão de atenção (debounce + janela + refratário) ---------- */
  function novaSessao() { return { active:null, pending:null, firedAt:{} }; }

  /* ---------- STEP: fotografa o minuto t e produz situações classificadas + diagnósticos ---------- */
  function step(t, NIGHT, INFO, sess) {
    const wE=[], wP=[], load={}, maxmin={}, domCount={};
    for (const o of NIGHT) {
      if (o.c != null && o.c <= t) continue;      // cancelado
      if (o.r > t) continue;                       // ainda não chegou
      if (o.p != null && o.p <= t) {               // já ficou pronto → expedição
        const up = o.s != null ? o.s : o.e;
        if (up == null || up <= t) { wE.push({ id:o.id, min: t-o.p }); }
      } else {                                      // em produção
        const up = o.p != null ? o.p : o.c;
        if (up == null) continue;
        const wait = t - o.r;
        wP.push({ id:o.id, min: wait });
        const I = INFO[o.id];
        if (I) I.benches.forEach(p => {
          load[p] = (load[p]||0) + 1;
          maxmin[p] = Math.max(maxmin[p]||0, wait);
          (I.itemPorPraca[p]||[]).forEach(iid => { domCount[p]=domCount[p]||{}; domCount[p][iid]=(domCount[p][iid]||0)+1; });
        });
      }
    }
    const inProd = wP.map(x => x.id);
    const dominante = p => { const m=domCount[p]; if(!m) return null; let best=null,bn=0; for(const k in m){ if(m[k]>bn){bn=m[k];best=k;} } return {id:best,n:bn}; };
    // quantos pedidos SAIRIAM se a praça p liberar = em produção cuja única bancada é p
    const unblockDe = p => inProd.filter(id => { const I=INFO[id]; return I && I.pracaUnica === p; }).length;

    const sits = [];
    // (1) sobrecarga de PRODUÇÃO (só praças de produção)
    for (const p of PRODUCAO) {
      const n = load[p]||0;
      if (n > BASELINE[p]) {
        const ratio = n / BASELINE[p];
        sits.push({ key:"pr:"+p, kind:"praca", praca:p, n,
          maxmin: Math.round(maxmin[p]||0), unblock: unblockDe(p), dom: dominante(p),
          sev: ratio>=2 ? 3 : (ratio>=1.4 ? 2 : 1) });
      }
    }
    // (2) saída travada (surge de prontos parados)
    const ew = wE.filter(x => x.min > FLOORS.EXPED);
    if (ew.length >= FLOORS.SURGE) sits.push({ key:"saida", kind:"saida", n:ew.length, sev: ew.length>=6?3:2 });
    // (3) pedido preso na produção / na expedição (1 outlier)
    for (const [zona, floor] of [["Expedição",FLOORS.EXPED],["Produção",FLOORS.PROD]]) {
      const over = (zona==="Expedição"?wE:wP).filter(x => x.min > floor);
      if (over.length === 1) { const mx=over[0], peak=Math.round(mx.min);
        sits.push({ key:"od:"+mx.id, kind:"order", zona, id:mx.id, peak, sev: peak>=(zona==="Expedição"?55:85)?3:2 }); }
    }
    // (4) DIAGNÓSTICO: fechamento — pedido em produção que depende de UMA só praça, esperando
    {
      const cand = wP.filter(x => x.min > FLOORS.PROD*0.6).map(x=>({x, I:INFO[x.id]}))
                     .filter(o => o.I && o.I.pracaUnica);
      if (cand.length) { cand.sort((a,b)=>b.x.min-a.x.min); const o=cand[0];
        sits.push({ key:"fech:"+o.x.id, kind:"fechamento", id:o.x.id, praca:o.I.pracaUnica,
          temFrio:o.I.temFrio, peak:Math.round(o.x.min), sev: 2 }); }
    }
    // (5) DIAGNÓSTICO: conferência — pedido grande / 2 sacolas / bebida+kit, esperando
    {
      const cand = wP.concat(wE).map(x=>({x, I:INFO[x.id]}))
                     .filter(o => o.I && (o.I.segundaSacola || o.I.riscoConfAlto) && o.x.min > 20);
      if (cand.length) { cand.sort((a,b)=> (b.I.nItens - a.I.nItens) || (b.x.min-a.x.min)); const o=cand[0];
        sits.push({ key:"conf:"+o.x.id, kind:"conferencia", id:o.x.id, I:o.I, sev: o.I.segundaSacola?2:1 }); }
    }

    sits.sort((a,b)=> b.sev-a.sev || ((b.n||b.peak||b.unblock||0)-(a.n||a.peak||a.unblock||0)));
    const top = sits[0] || null;

    // gerente de atenção
    if (top && top.sev>=2) { if (!sess.pending || sess.pending.key!==top.key) sess.pending={key:top.key, since:t}; } else sess.pending=null;
    const sustained = (sess.pending && (t-sess.pending.since)>=FLOORS.DEBOUNCE) ? top : null;
    if (sess.active) { const cur = sits.find(s=>s.key===sess.active.key);
      if (!cur) sess.active=null; else { sess.active.sit=cur; if (t>=sess.active.until){ sess.firedAt[sess.active.key]=t; sess.active=null; } } }
    if (!sess.active && sustained) { const elig = sess.firedAt[sustained.key]==null || (t-sess.firedAt[sustained.key])>FLOORS.COOLDOWN;
      if (elig) { sess.active={key:sustained.key, sit:sustained, until:t+FLOORS.MAXFOCUS}; sess.firedAt[sustained.key]=t; } }

    const inFoco = !!sess.active, inAmb = !inFoco && sits.length>0, mode = inFoco?"foco":(inAmb?"ambiente":"calmo");
    const foco = sess.active ? buildFoco(sess.active.sit, {wE, load}, INFO) : null;
    const ambList = sits.filter(s=> !sess.active || s.key!==sess.active.key).slice(0,2).map(s=>({ label: rotuloAmb(s), sev:s.sev }));
    let emand=0, cheg=0;
    for (const o of NIGHT) { if (o.r<=t && !(o.e!=null&&o.e<=t) && !(o.c!=null&&o.c<=t)) emand++; if (o.r>t-20 && o.r<=t) cheg++; }
    return { mode, foco, ambList, emand, intenso: cheg>=12, sev: foco?foco.sev:0, sits };
  }

  function rotuloAmb(s) {
    if (s.kind==="praca") return DISPLAY[s.praca] + (s.sev>=2?" carregando":" acima do normal");
    if (s.kind==="saida") return "saída lenta";
    if (s.kind==="fechamento") return "pedido quase fechável";
    if (s.kind==="conferencia") return "conferência reforçada";
    return s.zona==="Expedição" ? "saída lenta" : "produção lenta";
  }

  /* ---------- buildFoco: situação → diagnóstico legível (estado+situação+causa+ação+impacto) ---------- */
  function buildFoco(s, ctx, INFO) {
    if (s.kind === "praca") {
      const P = DISPLAY[s.praca];
      const acima = Math.max(0, (s.maxmin||0) - (TEMPO_PRACA[s.praca]||12));
      const domNome = s.dom && s.dom.id ? nomeDoItem(s.dom.id) : null;
      // combinados: linguagem de "segurando fluxo"
      if (s.praca === "combinados") {
        return { sev:s.sev, dir:"top", head: s.sev>=3?"COMBINADOS SEGURANDO FLUXO":"COMBINADOS CARREGANDO",
          impactos: [ "<b>"+s.n+"</b> pedidos dependem de combinados",
                      s.unblock>0 ? ("<b>"+s.unblock+"</b> sairiam se combinados liberar") : (acima>0?("<b>+"+acima+" min</b> acima do normal"):"tempo acima do normal") ],
          conseq: "combinado trava o pedido inteiro", cmd: "priorizar combinados que liberam saída" };
      }
      const causa = domNome ? (domNome + " concentrando a fila") : ("+"+acima+" min acima do normal");
      return { sev:s.sev, dir:"top", head: P + (s.sev>=3?" EM RISCO":" CARREGANDO"),
        impactos: [ "<b>"+s.n+"</b> pedidos na praça",
                    s.unblock>0 ? ("<b>"+s.unblock+"</b> sairiam se "+P+" liberar") : (acima>0?("<b>+"+acima+" min</b> acima do normal"):causa) ],
        conseq: s.praca==="cozinha_quentes" ? "se continuar, a expedição seca" : "trava o fechamento de pedidos",
        cmd: domNome ? ("priorizar "+P.toLowerCase()+" · olhar "+domNome) : ("priorizar bancada de "+P.toLowerCase()) };
    }
    if (s.kind === "fechamento") {
      const P = DISPLAY[s.praca];
      return { sev:s.sev, dir:"top", head:"FECHAMENTO · #"+s.id,
        impactos: [ "só depende de <b>"+P+"</b>", s.temFrio ? "ainda tem item frio" : "sem frios pendentes" ],
        conseq: "pronto pra fechar assim que "+P+" sair", cmd: "verificar se já dá pra fechar #"+s.id };
    }
    if (s.kind === "conferencia") {
      const I = s.I, extras = [];
      if (I.contemBebida) extras.push("bebida"); if (I.contemKit) extras.push("kit"); if (I.contemSobremesa) extras.push("sobremesa");
      return { sev:s.sev, dir:"top", head:"CONFERÊNCIA · #"+s.id,
        impactos: [ "<b>"+I.sacolas+"</b> sacolas · <b>"+I.nItens+"</b> itens", extras.length?("obrigatório: "+extras.join(" + ")):"conferir item a item" ],
        conseq: "risco de faltar item / 2ª sacola esquecida", cmd: "separar 2ª sacola e conferir item a item" };
    }
    if (s.kind === "saida") {
      return { sev:s.sev, dir:"bottom", head: s.sev>=3?"SAÍDA TRAVADA":"SAÍDA LENTA",
        impactos: ["<b>"+s.n+"</b> prontos sem sair","motoboy é o gargalo"],
        conseq: "pedidos vão atrasar na entrega", cmd: "chamar motoboy / conferir saída" };
    }
    if (s.zona === "Expedição") {
      const mais = ctx.wE.filter(x => x.id!==s.id && x.min>15).length;
      return { sev:s.sev, dir:"bottom", head:"#"+s.id+" SEM SAIR",
        impactos: ["pronto há <b>"+s.peak+" min</b>", mais>0?("<b>+"+mais+"</b> podem atrasar"):"aguardando motoboy"],
        conseq:"atraso na entrega · cliente pode reclamar", cmd:"conferir saída" };
    }
    const I = INFO[s.id]||{}, pr = I.prodPr && I.prodPr[0] ? I.prodPr[0] : (I.benches&&I.benches[0]);
    return { sev:s.sev, dir:"top", head:"#"+s.id+(pr?(" PRESO EM "+DISPLAY[pr].toUpperCase()):" TRAVADO"),
      impactos: ["<b>"+s.peak+" min</b> sem ficar pronto", I.nBenches>1?("depende de <b>"+I.nBenches+"</b> praças"):("praça: "+(pr?DISPLAY[pr]:"—"))],
      conseq: I.trava?"segura o pedido inteiro":((ctx.load[pr]||0)>1?("+"+((ctx.load[pr]||1)-1)+" esperando "+DISPLAY[pr]):"fila crescendo"),
      cmd: pr?("olhar "+DISPLAY[pr].toLowerCase()):"olhar produção" };
  }

  // nomeDoItem: preenchido por quem inicializa (mapa id→nome do seed)
  let NOMES = {};
  function setNomes(map){ NOMES = map || {}; }
  function nomeDoItem(id){ return NOMES[id] || id; }

  const API = { PRACAS, PRODUCAO, CONFERENCIA, DISPLAY, BASELINE, TEMPO_PRACA, FLOORS,
    adaptarItem, resolver, makeFonteSintetica, indexar, novaSessao, step, buildFoco, setNomes };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (root) root.MOTOR = API;
})(typeof window !== "undefined" ? window : null);
