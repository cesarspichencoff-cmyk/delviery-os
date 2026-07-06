/* ============================================================================
 * DeliveryOS · Interface V1 — camada de LEITURA, nunca de decisão.
 * ----------------------------------------------------------------------------
 * Contrato: docs/Contrato_Estado_Cognitivo_V1.md
 *  - um estado por minuto: calmo | ambiente | foco (derivado de MOTOR.step);
 *  - foco: DECISAO.decidir(R, INFO, { fonteReal, active: sess.active }) —
 *    SEMPRE com active (gate 11 do Plano V1). rec=null → foco puro (buildFoco),
 *    apresentado com a mesma dignidade, sem bloco de ação;
 *  - a interface nunca recalcula, nunca lê `todas`, nunca troca causa raiz;
 *  - textos do motor podem conter <b> (E4): aqui tudo vira texto puro;
 *  - observação do cliente NUNCA fica truncada em silêncio (E2): quando o foco
 *    tem pedido com observação, o texto COMPLETO vem de INFO (fonte primária),
 *    com aviso para conferir a comanda.
 * ==========================================================================*/
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const semTags = s => String(s == null ? "" : s).replace(/<[^>]*>/g, "");
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  const VELOCIDADES = [1, 10, 30];           // minutos de operação por segundo de replay
  let timeline = [], i0 = 0, tocando = false, vel = 1, timer = null;
  let diasRotulo = ["30/06", "01/07"];       // ajustado pela meta da janela carregada
  let rotuloJanela = "";                     // ex.: "janela real 01/07" — contexto, não dado novo

  function hhmm(t) { const d = Math.floor(t / 1440), m = t % 1440; const dia = diasRotulo[Math.min(d, diasRotulo.length - 1)] || diasRotulo[diasRotulo.length - 1]; return dia + " " + String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }

  /* ---------- pré-computa a linha do tempo com o cérebro real ---------- */
  function precomputar(J, INFO) {
    const sess = MOTOR.novaSessao();
    const linha = [];
    for (let t = J.T0; t <= J.T1; t++) {
      const R = MOTOR.step(t, J.NIGHT, INFO, sess);
      let rec = null, sit = null;
      if (R.mode === "foco" && sess.active) {
        sit = sess.active.sit;
        rec = DECISAO.decidir(R, INFO, { fonteReal: true, active: sess.active });
      }
      linha.push({
        t, mode: R.mode, emand: R.emand, intenso: R.intenso,
        amb: (R.ambList || []).map(a => ({ label: semTags(a.label), sev: a.sev })),
        foco: R.foco ? { sev: R.foco.sev, head: semTags(R.foco.head), impactos: (R.foco.impactos || []).map(semTags), conseq: semTags(R.foco.conseq), cmd: semTags(R.foco.cmd) } : null,
        sitId: sit ? (sit.id || null) : null,
        rec: rec ? { head: semTags(rec.head), porque: semTags(rec.porque), primeiro: semTags(rec.primeiro), impacto: semTags(rec.impacto), confianca: rec.confianca, dados: rec.dados } : null
      });
    }
    return linha;
  }

  /* ---------- blocos de observação do cliente (texto COMPLETO, nunca truncado) ---------- */
  function blocoObservacao(INFO, sitId) {
    if (!sitId || !INFO[sitId] || !INFO[sitId].temObservacao) return null;
    const b = el("div", "obs");
    b.appendChild(el("div", "obs-rotulo", "Observação do cliente — conferir na comanda"));
    for (const o of INFO[sitId].observacoes) b.appendChild(el("p", "obs-texto", "“" + o + "”"));
    return b;
  }

  /* ---------- render de cada estado (um por vez, nunca lista) ----------
     Mobile: uma coluna — estado como cabeçalho, cartão soberano abaixo.
     Desktop (≥1080px): só no Foco, três colunas — eco tipográfico à esquerda,
     cartão SOBERANO no centro, "Por que agora" à direita. As laterais são a
     MESMA informação re-hierarquizada, nunca dado novo (regra da coluna central). */
  function render(INFO, ponto) {
    const palco = $("palco");
    palco.innerHTML = "";
    palco.dataset.mode = ponto.mode;

    if (ponto.mode === "calmo") {
      const s = el("section", "estado calmo");
      s.appendChild(el("div", "olho", "Calmo"));
      const pulso = el("div", "pulso" + (ponto.intenso ? " pulso-intenso" : ""));
      pulso.appendChild(el("div", "pulso-anel"));
      s.appendChild(pulso);
      s.appendChild(el("h1", "titulo", "Fluxo estável"));
      s.appendChild(el("p", "apoio", ponto.emand + (ponto.emand === 1 ? " pedido em andamento" : " pedidos em andamento")));
      palco.appendChild(s);
      return;
    }

    if (ponto.mode === "ambiente") {
      const s = el("section", "estado ambiente");
      s.appendChild(el("div", "olho", "Ambiente"));
      const lista = el("div", "clima");
      for (const a of ponto.amb.slice(0, 2)) lista.appendChild(el("div", "clima-rotulo sev" + a.sev, a.label));
      s.appendChild(lista);
      s.appendChild(el("p", "apoio", "Acompanhando. Nada precisa de você agora."));
      palco.appendChild(s);
      return;
    }

    // FOCO — com ação dominante, ou foco puro (mesma dignidade)
    const sev3 = ponto.foco && ponto.foco.sev >= 3;
    const s = el("section", "estado foco-comp" + (sev3 ? " sev3" : ""));

    // cabeçalho do estado (mobile) / eco tipográfico (desktop)
    const eco = el("header", "eco");
    eco.appendChild(el("div", "eco-estado", "Foco"));
    eco.appendChild(el("div", "eco-sub", rotuloJanela));
    eco.appendChild(el("h2", "eco-titulo", ponto.rec ? ponto.rec.head : (ponto.foco ? ponto.foco.head : "")));
    s.appendChild(eco);

    // cartão soberano — a decisão inteira mora aqui
    const c = el("div", "cartao");
    if (ponto.rec) {
      c.appendChild(el("h1", "titulo acao", ponto.rec.head));
      const li = el("div", "linhas");
      li.appendChild(el("p", "linha-info porque", ponto.rec.porque));
      li.appendChild(el("p", "linha-info", "Primeiro olhar: " + ponto.rec.primeiro));
      li.appendChild(el("p", "linha-info impacto", ponto.rec.impacto));
      c.appendChild(li);
      const obs = blocoObservacao(INFO, ponto.sitId); if (obs) c.appendChild(obs);
      if (ponto.rec.confianca !== "alta") c.appendChild(el("p", "sussurro", "confiança " + ponto.rec.confianca + " — " + ponto.rec.dados));
    } else if (ponto.foco) {
      c.appendChild(el("h1", "titulo", ponto.foco.head));
      const li = el("div", "linhas");
      for (const im of ponto.foco.impactos) li.appendChild(el("p", "linha-info", im));
      li.appendChild(el("p", "linha-info conseq", ponto.foco.conseq));
      c.appendChild(li);
      const obs = blocoObservacao(INFO, ponto.sitId); if (obs) c.appendChild(obs);
      c.appendChild(el("p", "comando", "→ " + ponto.foco.cmd));
    }
    s.appendChild(c);

    // "Por que agora" (desktop) — reapresenta o que o cartão já diz, sem dado novo
    const ctx = el("aside", "contexto");
    ctx.appendChild(el("div", "ctx-rotulo", "Por que agora"));
    if (ponto.rec) {
      ctx.appendChild(el("p", "ctx-linha", ponto.rec.porque + "."));
      ctx.appendChild(el("p", "ctx-linha", ponto.rec.impacto + "."));
      ctx.appendChild(el("p", "ctx-fonte", ponto.rec.dados));
    } else if (ponto.foco) {
      ctx.appendChild(el("p", "ctx-linha", ponto.foco.conseq + "."));
      ctx.appendChild(el("p", "ctx-linha", "Sem ação prescrita — o foco mostra onde olhar."));
      ctx.appendChild(el("p", "ctx-fonte", "tempos reais (iFood) · itens reais por pedido"));
    }
    s.appendChild(ctx);

    palco.appendChild(s);
  }

  /* ---------- controles do replay (demo sobre janela histórica, não produto) ---------- */
  function ligarControles(INFO) {
    const linha = $("linha"), bt = $("btPlay"), btVel = $("btVel"), rel = $("relogio");
    linha.max = String(timeline.length - 1);
    const mostrar = () => { const p = timeline[i0]; render(INFO, p); rel.textContent = hhmm(p.t); linha.value = String(i0); };
    const passo = () => { if (i0 < timeline.length - 1) { i0++; mostrar(); } else pausar(); };
    const tocar = () => { tocando = true; bt.textContent = "❚❚"; clearInterval(timer); timer = setInterval(passo, 1000 / vel); };
    const pausar = () => { tocando = false; bt.textContent = "▶"; clearInterval(timer); };
    bt.onclick = () => tocando ? pausar() : tocar();
    btVel.onclick = () => { vel = VELOCIDADES[(VELOCIDADES.indexOf(vel) + 1) % VELOCIDADES.length]; btVel.textContent = vel + "×"; if (tocando) tocar(); };
    linha.oninput = () => { i0 = +linha.value; mostrar(); };
    // abre no primeiro minuto calmo para o foco poder EMERGIR da calma
    i0 = Math.max(0, timeline.findIndex(p => p.mode === "calmo"));
    vel = 10; btVel.textContent = "10×";
    mostrar();
    $("replay").hidden = false;
  }

  /* ---------- boot: dados reais + cérebro real, nada mais ----------
     ?j=2026-06-23 carrega outra janela real já gerada (ex.: a que tem foco puro). */
  const qj = new URLSearchParams(location.search).get("j");
  const arqJanela = qj ? "../data/generated/v1_janela_real_" + qj + ".json" : "../data/generated/v1_janela_real.json";
  Promise.all([
    fetch("../data/cardapio_knowledge_seed.json").then(r => r.json()),
    fetch(arqJanela).then(r => { if (!r.ok) throw new Error("janela real não encontrada — rode: node tools/gerar_janela_v1.js" + (qj ? " " + (+qj.slice(-2)) : "")); return r.json(); })
  ]).then(([seed, J]) => {
    const SEED = seed.itens;
    MOTOR.setNomes(Object.fromEntries(SEED.map(x => [x.id, x.nome])));
    const FONTE = MOTOR.makeFonteItensFromRows(J.rows, SEED);
    const INFO = {}; for (const o of J.NIGHT) INFO[o.id] = MOTOR.resolver(FONTE(o.id));
    if (J.meta.diaBase) { const d = +J.meta.diaBase.slice(-2); diasRotulo = [d + "/06", (d + 1) + "/06"]; }
    rotuloJanela = "janela real · " + (J.meta.diaBase ? diasRotulo[0] : "01/07");
    $("fonteDado").textContent = "janela real " + J.meta.janela + " · " + J.meta.pedidos + " pedidos · itens reais por pedido";
    timeline = precomputar(J, INFO);
    window.__V1 = { timeline, INFO, meta: J.meta };   // alça de leitura p/ validação — não é UI
    ligarControles(INFO);
  }).catch(e => {
    const palco = $("palco"); palco.innerHTML = "";
    const s = el("section", "estado carregando");
    s.appendChild(el("p", "sussurro", "Não consegui carregar a janela real. " + e.message));
    palco.appendChild(s);
    $("fonteDado").textContent = "sem dado";
  });
})();
