/* ============================================================================
 * DeliveryOS · Interface V1 — camada de LEITURA e APRESENTAÇÃO, nunca de decisão.
 * ----------------------------------------------------------------------------
 * Contrato: docs/Contrato_Estado_Cognitivo_V1.md
 *  - um estado por minuto: calmo | ambiente | foco (derivado de MOTOR.step);
 *  - foco: DECISAO.decidir(R, INFO, { fonteReal, active: sess.active }) —
 *    SEMPRE com active (gate 11 do Plano V1). rec=null → foco puro (buildFoco),
 *    apresentado com a mesma dignidade, sem bloco de ação;
 *  - a interface nunca recalcula, nunca lê `todas`, nunca troca causa raiz.
 *
 * Camada de copy (pacote de correções V1): o texto visível ao operador não usa
 * travessão, meia-risca, seta nem ponto médio; frases começam com maiúscula;
 * linguagem simples de operação. A tradução é SÓ apresentação: nunca muda a
 * causa raiz, nunca inventa informação, nunca altera a decisão.
 *
 * Observação do cliente NUNCA fica truncada em silêncio: o texto COMPLETO vem
 * de INFO (fonte primária), com aviso para conferir a comanda.
 * ==========================================================================*/
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const semTags = s => String(s == null ? "" : s).replace(/<[^>]*>/g, "");
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  const VELOCIDADES = [1, 10, 30];           // minutos de operação por segundo de replay
  let timeline = [], i0 = 0, tocando = false, vel = 1, timer = null;
  let diasRotulo = ["30/06", "01/07"];       // ajustado pela meta da janela carregada
  let rotuloJanela = "";                     // ex.: "Janela real 01/07"
  let CURTO = {};                            // id interno → nº curto real do iFood
  let ultimoModo = null;                     // p/ som só na ENTRADA em foco

  function hhmm(t) { const d = Math.floor(t / 1440), m = t % 1440; const dia = diasRotulo[Math.min(d, diasRotulo.length - 1)] || diasRotulo[diasRotulo.length - 1]; return dia + " " + String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }

  /* ====================== CAMADA DE APRESENTAÇÃO (copy) ======================
     Nada aqui decide. Só traduz texto técnico do motor em linguagem de bancada. */
  function frase(s) {
    s = semTags(s)
      .replace(/\s*·\s*/g, ". ")
      .replace(/\s*[—–]\s*/g, ", ")
      .replace(/→/g, "")
      .replace(/(\d+)\s*min\b/g, "$1 minutos")
      .replace(/\s+/g, " ").trim();
    if (!s) return s;
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!/[.!?…”"]$/.test(s)) s += ".";
    return s;
  }
  function listaHumana(partes) {
    const p = partes.filter(Boolean);
    if (!p.length) return "";
    if (p.length === 1) return p[0];
    return p.slice(0, -1).join(", ") + " e " + p[p.length - 1];
  }
  // rótulos de Ambiente (vêm de rotuloAmb no motor) → linguagem simples
  function traduzAmb(label) {
    label = semTags(label).trim();
    let m;
    if ((m = label.match(/^(.+) carregando$/i))) {
      const p = m[1];
      if (/combinados/i.test(p)) return "Combinados com pedidos acumulando";
      if (/duplas/i.test(p)) return "Duplas precisam de atenção";
      return p + " com pedidos esperando";
    }
    if ((m = label.match(/^(.+) acima do normal$/i))) return m[1] + " com mais pedidos que o normal";
    if (/^saída lenta$/i.test(label)) return "Saída está demorando";
    if (/^produção lenta$/i.test(label)) return "Produção está demorando";
    if (/^pedido quase fechável$/i.test(label)) return "Pedido quase pronto para fechar";
    if (/^conferência reforçada$/i.test(label)) return "Pedido pedindo conferência";
    return frase(label).replace(/\.$/, "");
  }
  // título da ação dominante, por tipo de candidato (rec.tipo é dado, não decisão)
  function tituloAcao(rec) {
    switch (rec.tipo) {
      case "priorizar_praca": return frase(rec.acao);                   // "Priorizar Duplas."
      case "fechar_simples": return "Fechar os pedidos simples agora.";
      case "chamar_motoboy": return "Chamar motoboy agora.";
      case "conferencia": return "Conferir este pedido antes de sair.";
      case "conferir_saida": return "Conferir a saída deste pedido.";
      case "olhar_pedido": return "Olhar este pedido agora.";
      default: return frase(rec.acao || rec.head);
    }
  }
  // "por quê" concreto (Correção 5): o que está acontecendo, em linguagem simples
  function traduzPorque(rec) {
    const s = semTags(rec.porque).trim(); let m;
    if ((m = s.match(/^(\d+) pedidos? saem? se (.+) liberar$/i))) return m[1] + (m[1] === "1" ? " pedido sai" : " pedidos saem") + " na hora se " + m[2] + " liberar.";
    if ((m = s.match(/^(\d+) pedido sae se (.+) liberar$/i))) return "1 pedido sai na hora se " + m[2] + " liberar.";
    if ((m = s.match(/^(\d+) pedidos na praça, acima do normal$/i))) return "Tem " + m[1] + " pedidos esperando, mais que o normal.";
    if ((m = s.match(/^(\d+) pedidos dependem só de (.+), sem mais pendências$/i))) return m[1] + " pedidos dependem só de " + m[2] + " e já podem fechar.";
    if ((m = s.match(/^(\d+) prontos há mais de (\d+) min$/i))) return m[1] + " pedidos prontos esperando há mais de " + m[2] + " minutos.";
    if ((m = s.match(/^pronto há (\d+) min sem sair$/i))) return "Pronto há " + m[1] + " minutos sem sair.";
    if ((m = s.match(/^(\d+) min sem ficar pronto/i))) return "Há " + m[1] + " minutos sem ficar pronto, fora do padrão.";
    if (rec.tipo === "conferencia") return "Este pedido tem " + listaHumana(s.split(" · ").map(x => x.trim())) + ".";
    return frase(s);
  }
  // impacto → consequência de não agir, em linguagem simples
  function traduzImpacto(rec) {
    const s = semTags(rec.impacto).trim(); let m;
    if ((m = s.match(/^libera (\d+) saídas?/i))) return "Libera " + m[1] + (m[1] === "1" ? " saída" : " saídas") + " e reduz o atraso.";
    if (/^desafoga a bancada$/i.test(s)) return "Desafoga a bancada.";
    if (/^todos viram atraso de entrega$/i.test(s)) return "Se ninguém olhar, viram atraso na entrega.";
    return frase(s);
  }
  // linhas do foco puro (fechamento e afins) → linguagem simples
  function linhaPuro(s) {
    s = semTags(s).trim(); let m;
    if ((m = s.match(/^só depende de (.+)$/i))) return "Só depende de " + m[1] + ".";
    if (/^ainda tem item frio$/i.test(s)) return "Ainda tem item frio pendente.";
    if (/^sem frios pendentes$/i.test(s)) return "Sem itens frios pendentes.";
    if ((m = s.match(/^pronto pra fechar assim que (.+) sair$/i))) return "Pronto para fechar assim que " + m[1] + " sair.";
    return frase(s);
  }
  function tituloPuro(foco, sitKind) {
    if (sitKind === "fechamento") return "Pedido aguardando fechamento.";
    if (sitKind === "conferencia") return "Conferir antes de sair.";
    if (sitKind === "saida") return "Saída está demorando.";
    if (sitKind === "order") return "Pedido precisando de atenção.";
    return frase(foco.head.toLowerCase());
  }
  // título de SITUAÇÃO do cartão (como nas referências: o cartão diz o que está
  // acontecendo; a ação vive na pílula dominante). Tradução do head do motor.
  function tituloSituacao(foco, sitKind) {
    const h = semTags(foco.head).trim(); let m;
    if (/SEGURANDO FLUXO/i.test(h)) return "Combinados segurando o fluxo.";
    if ((m = h.match(/^(.+) EM RISCO$/i))) return m[1] + " em risco, pedidos acumulando.";
    if ((m = h.match(/^(.+) CARREGANDO$/i))) {
      if (/combinados/i.test(m[1])) return "Combinados com pedidos acumulando.";
      if (/duplas/i.test(m[1])) return "Duplas precisam de atenção.";
      return m[1] + " com pedidos esperando.";
    }
    if (/^SAÍDA TRAVADA$/i.test(h)) return "Saída travada, prontos esperando.";
    if (/^SAÍDA LENTA$/i.test(h)) return "Saída está demorando.";
    if (/^FECHAMENTO/i.test(h)) return "Pedido aguardando fechamento.";
    if (/^CONFERÊNCIA/i.test(h)) return "Pedido pedindo conferência antes de sair.";
    if (/SEM SAIR$/i.test(h)) return "Pedido pronto sem sair.";
    if ((m = h.match(/PRESO EM (.+)$/i))) { const p = m[1].toLowerCase(); return "Pedido preso em " + p.charAt(0).toUpperCase() + p.slice(1) + "."; }
    if (/TRAVADO$/i.test(h)) return "Pedido travado na produção.";
    return tituloPuro(foco, sitKind);
  }
  const rotuloPedido = id => "#" + (CURTO[id] || id);

  /* ====================== SOM DISCRETO (opcional, padrão desligado) ======================
     Só na ENTRADA em foco, só durante o replay tocando. WebAudio, sem arquivo,
     sem dependência. O toque no botão é o gesto que desbloqueia o áudio. */
  let som = false, audioCtx = null;
  function chime() {
    if (!som) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      [[660, 0], [880, 0.12]].forEach(([f, dt]) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.linearRampToValueAtTime(0.05, t0 + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.25);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0 + dt); o.stop(t0 + dt + 0.3);
      });
    } catch (e) { /* áudio bloqueado: nunca trava a interface */ }
  }

  /* ---------- pré-computa a linha do tempo com o cérebro real ---------- */
  function evidenciasDe(R, sit, INFO) {
    // Contexto do foco para a web (Correção 4): máximo 3 evidências + resumo.
    // Só seleciona e ordena dados que o motor já produziu. Nada novo, nada decidido.
    if (!sit) return null;
    if (sit.kind === "praca") {
      const rel = R.ctx.wP.filter(w => { const I = INFO[w.id]; return I && I.benches.indexOf(sit.praca) >= 0; })
        .sort((a, b) => b.min - a.min);
      return {
        titulo: "Pedidos que puxam esta atenção", tipo: "pedidos",
        linhas: rel.slice(0, 3).map(w => {
          const I = INFO[w.id];
          const it = I ? (I.itens.find(x => x.praca === sit.praca) || I.itens[0]) : null;
          // praças além da que abriu o foco (deixa claro que o pedido é multi-praça, não erro de praça)
          const outras = (I && I.benches && I.benches.length > 1) ? I.benches.filter(p => p !== sit.praca).map(p => MOTOR.DISPLAY[p] || p) : [];
          return { id: w.id, min: Math.round(w.min), item: it ? it.nome : null, deps: outras };
        }),
        resto: Math.max(0, rel.length - 3), restoTexto: "pedidos também dependem desta praça"
      };
    }
    if (sit.kind === "saida") {
      const rel = R.ctx.wE.filter(x => x.min > MOTOR.FLOORS.EXPED).sort((a, b) => b.min - a.min);
      return {
        titulo: "Prontos esperando saída", tipo: "pedidos",
        linhas: rel.slice(0, 3).map(w => { const I = INFO[w.id]; return { id: w.id, min: Math.round(w.min), item: I && I.itens[0] ? I.itens[0].nome : null }; }),
        resto: Math.max(0, rel.length - 3), restoTexto: "pedidos prontos esperando"
      };
    }
    const I = INFO[sit.id]; if (!I || !I.itens.length) return null;
    return {
      titulo: "Itens deste pedido", tipo: "itens",
      linhas: I.itens.slice(0, 3).map(x => ({ item: x.nome, qtd: x.qtd })),
      resto: Math.max(0, I.itens.length - 3), restoTexto: "itens neste pedido"
    };
  }

  function precomputar(J, INFO) {
    const sess = MOTOR.novaSessao();
    const linha = [];
    for (let t = J.T0; t <= J.T1; t++) {
      const R = MOTOR.step(t, J.NIGHT, INFO, sess);
      let rec = null, sit = null, evid = null, alvoId = null;
      if (R.mode === "foco" && sess.active) {
        sit = sess.active.sit;
        rec = DECISAO.decidir(R, INFO, { fonteReal: true, active: sess.active });
        evid = evidenciasDe(R, sit, INFO);
        alvoId = sit.id || null;
        if (!alvoId && rec && rec.primeiro) { const m = semTags(rec.primeiro).match(/#([A-Za-z0-9]+)/); if (m) alvoId = m[1]; }
      }
      linha.push({
        t, mode: R.mode, emand: R.emand, intenso: R.intenso,
        amb: (R.ambList || []).map(a => ({ label: semTags(a.label), sev: a.sev })),
        foco: R.foco ? { sev: R.foco.sev, head: semTags(R.foco.head), impactos: (R.foco.impactos || []).map(semTags), conseq: semTags(R.foco.conseq), cmd: semTags(R.foco.cmd) } : null,
        sitKind: sit ? sit.kind : null, sitId: sit ? (sit.id || null) : null, sitPraca: sit ? (sit.praca || null) : null, alvoId, evid,
        rec: rec ? { tipo: rec.tipo, acao: semTags(rec.acao), head: semTags(rec.head), porque: semTags(rec.porque), primeiro: semTags(rec.primeiro), impacto: semTags(rec.impacto), confianca: rec.confianca, dados: rec.dados } : null
      });
    }
    return linha;
  }

  /* ---------- blocos reutilizáveis ---------- */
  function blocoObservacao(INFO, sitId) {
    if (!sitId || !INFO[sitId] || !INFO[sitId].temObservacao) return null;
    const b = el("div", "obs");
    b.appendChild(el("div", "obs-rotulo", "Observação do cliente"));
    for (const o of INFO[sitId].observacoes) b.appendChild(el("p", "obs-texto", "“" + o + "”"));
    b.appendChild(el("p", "obs-aviso", "Conferir o texto completo na comanda."));
    return b;
  }
  const pracasDisplay = benches => (benches || []).map(p => MOTOR.DISPLAY[p] || p);
  // linha de dependência: quando o pedido depende de VÁRIAS bancadas, explicar isso —
  // usando só I.benches (dado real do motor). Nunca atribui item a praça errada.
  function blocoDependencia(INFO, alvoId, sitKind, sitPraca) {
    const I = INFO[alvoId];
    if (!I || !I.benches || I.benches.length <= 1) return null;   // 1 bancada só: nada a explicar
    if (sitKind === "praca" && sitPraca && I.benches.indexOf(sitPraca) >= 0) {
      const foco = MOTOR.DISPLAY[sitPraca] || sitPraca;
      const outras = pracasDisplay(I.benches.filter(p => p !== sitPraca));
      return el("p", "pedido-dep", "Atenção agora em " + foco + ". Pedido também depende de " + listaHumana(outras) + ".");
    }
    return el("p", "pedido-dep", "Pedido depende de " + listaHumana(pracasDisplay(I.benches)) + ".");
  }
  function blocoPedido(INFO, alvoId, sitKind, sitPraca) {
    if (!alvoId) return null;
    const b = el("div", "pedido");
    const topo = el("div", "pedido-topo");
    topo.appendChild(el("div", "pedido-num", "Pedido " + rotuloPedido(alvoId)));
    topo.appendChild(el("div", "pedido-comanda", "Comanda não informada"));
    b.appendChild(topo);
    const dep = blocoDependencia(INFO, alvoId, sitKind, sitPraca);
    if (dep) b.appendChild(dep);
    return b;
  }
  function blocoEvidencias(evid) {
    if (!evid || !evid.linhas.length) return null;
    const b = el("div", "evid");
    b.appendChild(el("div", "ctx-rotulo", evid.titulo));
    for (const l of evid.linhas) {
      const e = el("div", "evid-item");
      if (evid.tipo === "pedidos") {
        e.appendChild(el("div", "evid-ped", "Pedido " + rotuloPedido(l.id)));
        e.appendChild(el("div", "evid-det", (l.item ? l.item + " " : "") + "esperando há " + l.min + " minutos"));
        if (l.deps && l.deps.length) e.appendChild(el("div", "evid-dep", "Também passa por " + listaHumana(l.deps) + "."));
      } else {
        e.appendChild(el("div", "evid-ped", l.item + (l.qtd > 1 ? " (" + l.qtd + ")" : "")));
      }
      b.appendChild(e);
    }
    if (evid.resto > 0) b.appendChild(el("p", "evid-resto", "Mais " + evid.resto + " " + evid.restoTexto + "."));
    return b;
  }

  /* ---------- render de cada estado (um por vez, nunca lista) ---------- */
  function render(INFO, ponto) {
    const palco = $("palco");
    palco.innerHTML = "";
    palco.dataset.mode = ponto.mode;
    document.body.dataset.mode = ponto.mode;

    if (ponto.mode === "calmo") {
      const s = el("section", "estado calmo");
      s.appendChild(el("h1", "titulo display", "Em fluxo"));
      const pulso = el("div", "pulso" + (ponto.intenso ? " pulso-intenso" : ""));
      const anel = el("div", "pulso-anel");
      anel.appendChild(el("div", "pulso-num", String(ponto.emand)));
      anel.appendChild(el("div", "pulso-cap", ponto.emand === 1 ? "pedido em andamento" : "pedidos em andamento"));
      pulso.appendChild(anel);
      s.appendChild(pulso);
      s.appendChild(el("p", "apoio", "Operação fluindo. Nada precisa de você agora."));
      palco.appendChild(s);
      return;
    }

    if (ponto.mode === "ambiente") {
      const s = el("section", "estado ambiente");
      s.appendChild(el("div", "olho", "Ambiente"));
      const lista = el("div", "clima");
      for (const a of ponto.amb.slice(0, 2)) lista.appendChild(el("div", "clima-rotulo sev" + a.sev, traduzAmb(a.label)));
      s.appendChild(lista);
      s.appendChild(el("p", "apoio", "Acompanhando. Nada precisa de você agora."));
      palco.appendChild(s);
      return;
    }

    // FOCO — com ação dominante, ou foco puro (mesma dignidade)
    const sev3 = ponto.foco && ponto.foco.sev >= 3;
    const s = el("section", "estado foco-comp" + (sev3 ? " sev3" : ""));
    const situacao = ponto.foco ? tituloSituacao(ponto.foco, ponto.sitKind) : "";

    // cabeçalho do estado (mobile) / eco tipográfico (desktop)
    const eco = el("header", "eco");
    eco.appendChild(el("div", "eco-estado", "Foco"));
    eco.appendChild(el("div", "eco-sub", rotuloJanela));
    eco.appendChild(el("h2", "eco-titulo", situacao.replace(/\.$/, "")));
    s.appendChild(eco);

    // cartão soberano — a SITUAÇÃO mora aqui (a ação vive na pílula dominante)
    const c = el("div", "cartao");
    const cab = el("div", "cartao-cab");
    cab.appendChild(el("span", "cab-estado", "Foco"));
    cab.appendChild(el("span", "cab-janela", rotuloJanela));
    c.appendChild(cab);
    c.appendChild(el("h1", "titulo", situacao));
    const li = el("div", "linhas");
    if (ponto.rec) {
      li.appendChild(el("p", "linha-info porque", traduzPorque(ponto.rec)));
      li.appendChild(el("p", "linha-info", traduzImpacto(ponto.rec)));
    } else if (ponto.foco) {
      for (const im of ponto.foco.impactos) li.appendChild(el("p", "linha-info", linhaPuro(im)));
      li.appendChild(el("p", "linha-info porque", linhaPuro(ponto.foco.conseq)));
    }
    c.appendChild(li);
    const ped = blocoPedido(INFO, ponto.alvoId, ponto.sitKind, ponto.sitPraca); if (ped) c.appendChild(ped);
    const obs = blocoObservacao(INFO, ponto.sitId); if (obs) c.appendChild(obs);
    if (ponto.rec && ponto.rec.confianca !== "alta") c.appendChild(el("p", "sussurro", "Confiança " + ponto.rec.confianca + ". Baseado em " + ponto.rec.dados.replace(/·/g, "e") + "."));
    s.appendChild(c);

    // ação dominante — comando VISUAL (não é botão: sem clique, sem controle)
    const acaoArea = el("div", "acao-area");
    acaoArea.appendChild(el("p", "acao-hint", "Uma ação agora"));
    const pilula = el("div", ponto.rec ? "acao-pill" : "acao-pill pill-pura");
    pilula.textContent = ponto.rec ? tituloAcao(ponto.rec).replace(/\.$/, "")
      : (ponto.sitKind === "fechamento" ? "Conferir se já pode fechar" : frase(ponto.foco.cmd).replace(/\.$/, ""));
    acaoArea.appendChild(pilula);
    s.appendChild(acaoArea);

    // "Por que agora" + evidências (desktop) — reapresenta, nunca acrescenta
    const ctx = el("aside", "contexto");
    ctx.appendChild(el("div", "ctx-rotulo", "Por que agora"));
    if (ponto.rec) {
      ctx.appendChild(el("p", "ctx-linha", traduzPorque(ponto.rec)));
      ctx.appendChild(el("p", "ctx-linha", traduzImpacto(ponto.rec)));
      if (ponto.alvoId) ctx.appendChild(el("p", "ctx-linha", "Olhar primeiro o pedido " + rotuloPedido(ponto.alvoId) + "."));
    } else if (ponto.foco) {
      ctx.appendChild(el("p", "ctx-linha", linhaPuro(ponto.foco.conseq)));
      if (ponto.alvoId) ctx.appendChild(el("p", "ctx-linha", "Olhar primeiro o pedido " + rotuloPedido(ponto.alvoId) + "."));
      ctx.appendChild(el("p", "ctx-linha", "Sem ação prescrita. O foco mostra onde olhar."));
    }
    const ev = blocoEvidencias(ponto.evid); if (ev) ctx.appendChild(ev);
    ctx.appendChild(el("p", "ctx-fonte", "Tempos reais do iFood e itens reais por pedido. " + rotuloJanela + "."));
    s.appendChild(ctx);

    palco.appendChild(s);
  }

  /* ---------- controles do replay (demo sobre janela histórica, não produto) ---------- */
  function ligarControles(INFO) {
    const linha = $("linha"), bt = $("btPlay"), btVel = $("btVel"), btSom = $("btSom"), rel = $("relogio");
    linha.max = String(timeline.length - 1);
    const mostrar = () => {
      const p = timeline[i0];
      if (tocando && p.mode === "foco" && ultimoModo !== "foco") chime();   // som só na ENTRADA em foco
      ultimoModo = p.mode;
      render(INFO, p); rel.textContent = hhmm(p.t); linha.value = String(i0);
    };
    const passo = () => { if (i0 < timeline.length - 1) { i0++; mostrar(); } else pausar(); };
    const tocar = () => { tocando = true; bt.textContent = "❚❚"; clearInterval(timer); timer = setInterval(passo, 1000 / vel); };
    const pausar = () => { tocando = false; bt.textContent = "▶"; clearInterval(timer); };
    bt.onclick = () => tocando ? pausar() : tocar();
    btVel.onclick = () => { vel = VELOCIDADES[(VELOCIDADES.indexOf(vel) + 1) % VELOCIDADES.length]; btVel.textContent = vel + "×"; if (tocando) tocar(); };
    btSom.onclick = () => { som = !som; btSom.textContent = som ? "Som ligado" : "Som desligado"; if (som) chime(); };
    linha.oninput = () => { i0 = +linha.value; ultimoModo = null; mostrar(); };
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
    fetch(arqJanela).then(r => { if (!r.ok) throw new Error("Janela real não encontrada. Rode: node tools/gerar_janela_v1.js" + (qj ? " " + (+qj.slice(-2)) : "")); return r.json(); })
  ]).then(([seed, J]) => {
    const SEED = seed.itens;
    MOTOR.setNomes(Object.fromEntries(SEED.map(x => [x.id, x.nome])));
    const FONTE = MOTOR.makeFonteItensFromRows(J.rows, SEED);
    const INFO = {}; for (const o of J.NIGHT) INFO[o.id] = MOTOR.resolver(FONTE(o.id));
    for (const o of J.NIGHT) if (o.curto) CURTO[o.id] = o.curto;
    if (J.meta.diaBase) { const d = +J.meta.diaBase.slice(-2); diasRotulo = [d + "/06", (d + 1) + "/06"]; }
    rotuloJanela = "Janela real " + (J.meta.diaBase ? diasRotulo[0] : "01/07");
    $("fonteDado").textContent = rotuloJanela + ", " + J.meta.pedidos + " pedidos, itens reais por pedido";
    timeline = precomputar(J, INFO);
    window.__V1 = { timeline, INFO, meta: J.meta };   // alça de leitura p/ validação — não é UI
    ligarControles(INFO);
  }).catch(e => {
    const palco = $("palco"); palco.innerHTML = "";
    const s = el("section", "estado carregando");
    s.appendChild(el("p", "sussurro", "Não consegui carregar a janela real. " + e.message));
    palco.appendChild(s);
    $("fonteDado").textContent = "Sem dado";
  });
})();
