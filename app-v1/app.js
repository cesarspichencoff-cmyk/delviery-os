/* ============================================================================
 * DeliveryOS · Copiloto V3.3 — superfície do organismo.
 * ----------------------------------------------------------------------------
 * Contrato: motor decide → projeção expõe → adaptador transporta → UI apresenta.
 * A interface NUNCA recalcula Calmo/Ambiente/Foco.
 * Design canônico: design-reference/copiloto-v33/ (imutável).
 * Mocks (previsão, ação, voz, fechamento) são DEMONSTRAÇÃO explícita.
 * ==========================================================================*/
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const semTags = (s) => String(s == null ? "" : s).replace(/<[^>]*>/g, "");
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };

  const VELOCIDADES = [1, 10, 30];
  let timeline = [], i0 = 0, tocando = false, vel = 1, timer = null;
  let diasRotulo = ["30/06", "01/07"];
  let rotuloJanela = "";
  let CURTO = {};
  let ultimoModo = null;
  let lastINFO = null;
  let lastPonto = null;

  /* Estado de UI (mocks / demos) — nunca decide modo do motor */
  const ui = {
    forecastOpen: false,
    showForecast: false,
    actionState: null,
    voicePhase: "idle",
    voiceOpen: false,
    closingStep: null,
    closingOpen: false,
    forceMode: null, // QA only
    techOverride: null,
    qaOpen: false,
    areaCite: null
  };

  const params = new URLSearchParams(location.search);
  const QA_MODE = params.get("qa") === "1" || params.get("dev") === "1";

  function hhmm(t) {
    const d = Math.floor(t / 1440), m = t % 1440;
    const dia = diasRotulo[Math.min(d, diasRotulo.length - 1)] || diasRotulo[diasRotulo.length - 1];
    return dia + " " + String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }

  /* ====================== CAMADA DE APRESENTAÇÃO (copy) ====================== */
  function frase(s) {
    s = semTags(s)
      .replace(/\s*·\s*/g, ". ")
      .replace(/\s*[—–]\s*/g, ", ")
      .replace(/→/g, "")
      .replace(/(\d+)\s*min\b/g, "$1 minutos")
      .replace(/\s+/g, " ")
      .trim();
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
  function tituloAcao(rec) {
    switch (rec.tipo) {
      case "priorizar_praca": return frase(rec.acao);
      case "fechar_simples": return "Fechar os pedidos simples agora.";
      case "chamar_motoboy": return "Chamar motoboy agora.";
      case "conferencia": return "Conferir este pedido antes de sair.";
      case "conferir_saida": return "Conferir a saída deste pedido.";
      case "olhar_pedido": return "Olhar este pedido agora.";
      default: return frase(rec.acao || rec.head);
    }
  }
  function traduzPorque(rec) {
    const s = semTags(rec.porque).trim();
    let m;
    if ((m = s.match(/^(\d+) pedidos? saem? se (.+) liberar$/i)))
      return m[1] + (m[1] === "1" ? " pedido sai" : " pedidos saem") + " na hora se " + m[2] + " liberar.";
    if ((m = s.match(/^(\d+) pedido sae se (.+) liberar$/i))) return "1 pedido sai na hora se " + m[2] + " liberar.";
    if ((m = s.match(/^(\d+) pedidos na praça, acima do normal$/i))) return "Tem " + m[1] + " pedidos esperando, mais que o normal.";
    if ((m = s.match(/^(\d+) pedidos dependem só de (.+), sem mais pendências$/i)))
      return m[1] + " pedidos dependem só de " + m[2] + " e já podem fechar.";
    if ((m = s.match(/^(\d+) prontos há mais de (\d+) min$/i)))
      return m[1] + " pedidos prontos esperando há mais de " + m[2] + " minutos.";
    if ((m = s.match(/^pronto há (\d+) min sem sair$/i))) return "Pronto há " + m[1] + " minutos sem sair.";
    if ((m = s.match(/^(\d+) min sem ficar pronto/i))) return "Há " + m[1] + " minutos sem ficar pronto, fora do padrão.";
    if (rec.tipo === "conferencia") return "Este pedido tem " + listaHumana(s.split(" · ").map((x) => x.trim())) + ".";
    return frase(s);
  }
  function traduzImpacto(rec) {
    const s = semTags(rec.impacto).trim();
    let m;
    if ((m = s.match(/^libera (\d+) saídas?/i)))
      return "Libera " + m[1] + (m[1] === "1" ? " saída" : " saídas") + " e reduz o atraso.";
    if (/^desafoga a bancada$/i.test(s)) return "Desafoga a bancada.";
    if (/^todos viram atraso de entrega$/i.test(s)) return "Se ninguém olhar, viram atraso na entrega.";
    return frase(s);
  }
  function linhaPuro(s) {
    s = semTags(s).trim();
    let m;
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
  function tituloSituacao(foco, sitKind) {
    const h = semTags(foco.head).trim();
    let m;
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
    if ((m = h.match(/PRESO EM (.+)$/i))) {
      const p = m[1].toLowerCase();
      return "Pedido preso em " + p.charAt(0).toUpperCase() + p.slice(1) + ".";
    }
    if (/TRAVADO$/i.test(h)) return "Pedido travado na produção.";
    return tituloPuro(foco, sitKind);
  }
  const rotuloPedido = (id) => "#" + (CURTO[id] || id);

  /* Som opcional */
  let som = false, audioCtx = null;
  function chime() {
    if (!som) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      [[660, 0], [880, 0.12]].forEach(([f, dt]) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.linearRampToValueAtTime(0.05, t0 + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.25);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t0 + dt);
        o.stop(t0 + dt + 0.3);
      });
    } catch (e) { /* áudio bloqueado */ }
  }

  function evidenciasDe(R, sit, INFO) {
    if (!sit) return null;
    if (sit.kind === "praca") {
      const rel = R.ctx.wP
        .filter((w) => {
          const I = INFO[w.id];
          return I && I.benches.indexOf(sit.praca) >= 0;
        })
        .sort((a, b) => b.min - a.min);
      return {
        titulo: "Pedidos que puxam esta atenção",
        tipo: "pedidos",
        linhas: rel.slice(0, 3).map((w) => {
          const I = INFO[w.id];
          const it = I ? I.itens.find((x) => x.praca === sit.praca) || I.itens[0] : null;
          const outras =
            I && I.benches && I.benches.length > 1
              ? I.benches.filter((p) => p !== sit.praca).map((p) => MOTOR.DISPLAY[p] || p)
              : [];
          return { id: w.id, min: Math.round(w.min), item: it ? it.nome : null, deps: outras };
        }),
        resto: Math.max(0, rel.length - 3),
        restoTexto: "pedidos também dependem desta praça"
      };
    }
    if (sit.kind === "saida") {
      const rel = R.ctx.wE.filter((x) => x.min > MOTOR.FLOORS.EXPED).sort((a, b) => b.min - a.min);
      return {
        titulo: "Prontos esperando saída",
        tipo: "pedidos",
        linhas: rel.slice(0, 3).map((w) => {
          const I = INFO[w.id];
          return { id: w.id, min: Math.round(w.min), item: I && I.itens[0] ? I.itens[0].nome : null };
        }),
        resto: Math.max(0, rel.length - 3),
        restoTexto: "pedidos prontos esperando"
      };
    }
    const I = INFO[sit.id];
    if (!I || !I.itens.length) return null;
    return {
      titulo: "Itens deste pedido",
      tipo: "itens",
      linhas: I.itens.slice(0, 3).map((x) => ({ item: x.nome, qtd: x.qtd })),
      resto: Math.max(0, I.itens.length - 3),
      restoTexto: "itens neste pedido"
    };
  }

  const AMB_ESTADO = { verde: "Tudo fluindo", amarelo: "Atenção", vermelho: "Virando foco", validacao: "Em validação" };
  function piorPraca(R, pracas) {
    let sev = 0, pr = null;
    for (const s of R.sits)
      if (s.kind === "praca" && pracas.indexOf(s.praca) >= 0 && s.sev > sev) {
        sev = s.sev;
        pr = s.praca;
      }
    return { sev, pr };
  }
  function corPorSev(sev) {
    return sev >= 3 ? "vermelho" : sev >= 1 ? "amarelo" : "verde";
  }
  function pressaoPorRatio(R, pracas) {
    let maxRatio = 0;
    for (const p of pracas) {
      const load = (R.ctx.load && R.ctx.load[p]) || 0;
      const base = MOTOR.BASELINE[p];
      if (!base) continue;
      const ratio = load / base;
      if (ratio > maxRatio) maxRatio = ratio;
    }
    return Math.max(0, Math.min(100, Math.round(maxRatio * 50)));
  }
  function pressaoPorSeveridade(sev) {
    if (!sev) return 15;
    if (sev === 1) return 35;
    if (sev === 2) return 60;
    return 90;
  }
  function mapaAmbientes(R) {
    const su = piorPraca(R, ["combinados", "duplas", "enrolados"]);
    const suCor = corPorSev(su.sev);
    const sushi = {
      nome: "Sushi",
      cor: suCor,
      pressao: pressaoPorRatio(R, ["combinados", "duplas", "enrolados"]),
      motivo: su.pr
        ? MOTOR.DISPLAY[su.pr] + (suCor === "vermelho" ? " segurando o fluxo" : " com pedidos acumulando")
        : "Sushi em ritmo normal"
    };
    const qu = piorPraca(R, ["enrolados_quentes"]);
    const quCor = corPorSev(qu.sev);
    const quentes = {
      nome: "Quentes",
      cor: quCor,
      pressao: pressaoPorRatio(R, ["enrolados_quentes"]),
      motivo: qu.sev
        ? "Enrolados quentes " + (quCor === "vermelho" ? "segurando o fluxo" : "puxando espera")
        : "Quentes em ritmo normal"
    };
    const confSit = R.sits.find((s) => s.kind === "conferencia");
    const conf = {
      nome: "Conferência",
      cor: confSit ? "amarelo" : "verde",
      pressao: pressaoPorSeveridade(confSit ? confSit.sev : 0),
      motivo: confSit ? "Pedido pedindo conferência reforçada" : "Nada pendente para conferir"
    };
    const saida = R.sits.find((s) => s.kind === "saida");
    const moCor = saida ? corPorSev(saida.sev) : "verde";
    const motoboy = {
      nome: "Motoboy",
      cor: moCor,
      pressao: pressaoPorSeveridade(saida ? saida.sev : 0),
      motivo: saida ? (moCor === "vermelho" ? "Saída travando, prontos parados" : "Prontos esperando saída") : "Despacho sem acúmulo"
    };
    const caixa = { nome: "Caixa", cor: "validacao", pressao: null, motivo: "Fonte atual ainda não mede esta fila" };
    const cozinha = {
      nome: "Cozinha",
      cor: "validacao",
      pressao: null,
      motivo: "Separação fina ainda depende do mapa operacional"
    };
    return [caixa, sushi, quentes, cozinha, conf, motoboy].map((a) => ({
      nome: a.nome,
      cor: a.cor,
      pressao: a.pressao,
      estadoTxt: AMB_ESTADO[a.cor],
      motivo: a.motivo
    }));
  }

  function classificarCategoriaOperacionalV0(nome, praca) {
    const n = String(nome || "").toLowerCase();
    if (praca === "combinados") return nome;
    if (/temaki/.test(n)) return "Temaki";
    if (/uramaki/.test(n)) return "Uramaki";
    if (/hoss?omaki/.test(n)) return "Hosomaki";
    if (/hot ?roll/.test(n)) return "Hot Roll";
    if (/\bdyo\b/.test(n)) return "Dyo";
    if (/sashimi/.test(n)) return "Sashimi";
    if (/batt?er[aá]/.test(n)) return "Battera";
    if (/carpaccio/.test(n)) return "Carpaccio";
    if (/tirashi/.test(n)) return "Tirashi";
    if (/guioza/.test(n)) return "Guioza";
    if (/edamame/.test(n)) return "Edamame";
    if (/misso/.test(n)) return "Missoshiru";
    if (/tempur[aá]/.test(n)) return "Tempurá";
    if (/tartar/.test(n)) return "Tartar";
    if (/tuna shis[oô]/.test(n)) return "Tuna Shiso";
    if (/ceviche/.test(n)) return "Ceviche";
    if (/sunomono/.test(n)) return "Sunomono";
    if (/mochi/.test(n)) return "Mochi";
    if (praca === "sobremesa") return "Sobremesa";
    if (praca === "bar_bebidas") return "Bebida";
    if (praca === "cozinha_quentes") return "Prato quente";
    return null;
  }
  function detectarDuasSacolasV0(I) {
    if (!I || !I.itens.length) return false;
    if (I.temQuente && I.temFrio) return true;
    const bebidaGrande = I.itens.some((x) => x.praca === "bar_bebidas" && /720\s*ml|vinho|saqu[eê]/i.test(x.nome));
    if (bebidaGrande) return true;
    const latas = I.itens.filter((x) => x.praca === "bar_bebidas" && /lata/i.test(x.nome)).reduce((a, x) => a + (x.qtd || 1), 0);
    return latas >= 6;
  }
  function detectarSoQuenteV0(I) {
    return !!(I && I.itens.length && I.soQuentes);
  }
  function detectarSoSobremesaV0(I) {
    return !!(I && I.itens.length && I.itens.every((x) => x.praca === "sobremesa"));
  }
  function sinaisDeFluxo(R, INFO) {
    const ids = Array.from(new Set(R.ctx.wP.map((x) => x.id).concat(R.ctx.wE.map((x) => x.id))));
    const duasSacolas = [], soQuente = [], soSobremesa = [];
    for (const id of ids) {
      const I = INFO[id];
      if (!I) continue;
      if (detectarDuasSacolasV0(I)) duasSacolas.push(id);
      if (detectarSoQuenteV0(I)) soQuente.push(id);
      if (detectarSoSobremesaV0(I)) soSobremesa.push(id);
    }
    const contagem = {};
    for (const w of R.ctx.wP) {
      const I = INFO[w.id];
      if (!I) continue;
      for (const it of I.itens) {
        const cat = classificarCategoriaOperacionalV0(it.nome, it.praca);
        if (!cat) continue;
        contagem[cat] = (contagem[cat] || 0) + (it.qtd || 1);
      }
    }
    const itensPuxando = Object.entries(contagem)
      .sort((a, b) => b[1] - a[1])
      .map(([nome, qtd]) => ({ nome, qtd }));
    return { duasSacolas, soQuente, soSobremesa, itensPuxando };
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
        if (!alvoId && rec && rec.primeiro) {
          const m = semTags(rec.primeiro).match(/#([A-Za-z0-9]+)/);
          if (m) alvoId = m[1];
        }
      }
      linha.push({
        t,
        mode: R.mode,
        emand: R.emand,
        intenso: R.intenso,
        amb: (R.ambList || []).map((a) => ({ label: semTags(a.label), sev: a.sev })),
        ambientes: mapaAmbientes(R),
        sinais: R.mode === "calmo" ? sinaisDeFluxo(R, INFO) : null,
        foco: R.foco
          ? {
              sev: R.foco.sev,
              head: semTags(R.foco.head),
              impactos: (R.foco.impactos || []).map(semTags),
              conseq: semTags(R.foco.conseq),
              cmd: semTags(R.foco.cmd)
            }
          : null,
        sitKind: sit ? sit.kind : null,
        sitId: sit ? sit.id || null : null,
        sitPraca: sit ? sit.praca || null : null,
        alvoId,
        evid,
        rec: rec
          ? {
              tipo: rec.tipo,
              acao: semTags(rec.acao),
              head: semTags(rec.head),
              porque: semTags(rec.porque),
              primeiro: semTags(rec.primeiro),
              impacto: semTags(rec.impacto),
              confianca: rec.confianca,
              dados: rec.dados
            }
          : null
      });
    }
    return linha;
  }

  /* ---------- montagem view-model V3.3 ---------- */
  function buildPresentation(INFO, ponto) {
    const AD = window.V33_ADAPTER;
    const M = window.V33_MOCKS;
    let mode = ponto.mode;
    if (ui.forceMode === "force-calmo") mode = "calmo";
    if (ui.forceMode === "force-ambiente") mode = "ambiente";
    if (ui.forceMode === "force-foco") mode = "foco";

    const areaHint = AD.areaHintFromSit(ponto.sitKind, ponto.sitPraca, MOTOR.DISPLAY);
    let situation = null, consequence = null, evidences = [], actionLabel = null, secondaryAction = null;
    if (mode === "foco" && ponto.foco) {
      situation = tituloSituacao(ponto.foco, ponto.sitKind);
      if (ponto.rec) {
        consequence = traduzImpacto(ponto.rec);
        evidences.push(traduzPorque(ponto.rec));
        if (ponto.alvoId) evidences.push("Olhar primeiro o pedido " + rotuloPedido(ponto.alvoId) + ".");
        actionLabel = tituloAcao(ponto.rec).replace(/\.$/, "");
      } else {
        consequence = linhaPuro(ponto.foco.conseq);
        (ponto.foco.impactos || []).forEach((im) => evidences.push(linhaPuro(im)));
        actionLabel = ponto.sitKind === "fechamento" ? "Conferir se já pode fechar" : frase(ponto.foco.cmd).replace(/\.$/, "");
        secondaryAction = "Sem ação prescrita — o foco mostra onde olhar";
      }
      if (ponto.evid && ponto.evid.linhas) {
        ponto.evid.linhas.forEach((l) => {
          if (ponto.evid.tipo === "pedidos") {
            evidences.push(
              "Pedido " + rotuloPedido(l.id) + (l.item ? " · " + l.item : "") + " · " + l.min + " min"
            );
          } else {
            evidences.push(l.item + (l.qtd > 1 ? " (" + l.qtd + ")" : ""));
          }
        });
      }
    }

    const mocks = { demo: true };
    if (ui.showForecast || (mode === "foco" && ui.forecastOpen !== false && params.get("forecast") === "1")) {
      mocks.forecast = M.forecastMock(areaHint || "Conferência");
      mocks.forecast.expanded = ui.forecastOpen;
    }
    if (ui.showForecast) {
      mocks.forecast = M.forecastMock(areaHint || "Conferência");
      mocks.forecast.expanded = ui.forecastOpen;
    }
    if (ui.actionState) {
      mocks.actionTrack = M.actionTrackMock(ui.actionState);
      if (ui.actionState === "colateral") mocks.actionTrack.tense = true;
    }

    const vm = AD.montarViewModelV33({
      mode,
      emand: ponto.emand,
      ambientes: ponto.ambientes || [],
      foco: ponto.foco,
      rec: ponto.rec,
      situation,
      consequence,
      evidences: evidences.slice(0, 5),
      actionLabel,
      secondaryAction,
      focoAreaHint: areaHint,
      mocks,
      calmCopy: "Nada exige você agora.",
      climateNote: mode === "ambiente" ? climateFromAmb(ponto) : null,
      meta: { janela: rotuloJanela }
    });

    // citação de área pela voz
    if (ui.areaCite) {
      vm.areas.forEach((a) => {
        if (a.nome === ui.areaCite) a.cite = true;
      });
    }
    return vm;
  }

  function climateFromAmb(ponto) {
    const tensas = (ponto.ambientes || []).filter((a) => a.cor === "amarelo" || a.cor === "vermelho");
    if (!tensas.length) return "Movimento discreto no organismo.";
    return tensas[0].nome + " começa a pressionar. Contexto preservado.";
  }

  /* ---------- RENDER ORGANISMO V3.3 ---------- */
  function render(INFO, ponto) {
    lastINFO = INFO;
    lastPonto = ponto;
    if (ui.techOverride) {
      renderTechOnly(ui.techOverride);
      return;
    }

    const vm = buildPresentation(INFO, ponto);
    const palco = $("palco");
    palco.innerHTML = "";
    palco.dataset.mode = vm.mode;
    document.body.dataset.mode = vm.mode;

    const root = el("div", "organismo");

    const head = el("div", "organismo-head");
    const left = el("div", "");
    if (vm.mode === "calmo") {
      left.appendChild(el("h1", "calm-title", "Em fluxo"));
      left.appendChild(el("p", "calm-copy", vm.calmCopy || "Nada exige você agora."));
    } else if (vm.mode === "ambiente") {
      left.appendChild(el("h1", "calm-title", "Operação em movimento"));
      if (vm.climateNote) left.appendChild(el("p", "climate-note", vm.climateNote));
    } else {
      left.appendChild(el("h1", "calm-title", "Atenção no organismo"));
    }
    head.appendChild(left);
    head.appendChild(
      el(
        "div",
        "emand-chip",
        vm.emand + (vm.emand === 1 ? " pedido em andamento" : " pedidos em andamento")
      )
    );
    root.appendChild(head);

    const areas = el("div", "areas");
    vm.areas.forEach((a) => {
      const node = el(
        "div",
        "area tone-" +
          a.tone +
          (a.dominant && vm.mode === "foco" ? " area-dominant" : "") +
          (a.cite ? " area-cite" : "")
      );
      node.appendChild(el("div", "area-name", a.nome));
      node.appendChild(el("div", "area-state", a.estadoTxt));
      node.appendChild(el("div", "area-motivo", a.motivo));
      if (a.pressao != null && !a.tech) {
        const bar = el("div", "area-press");
        const i = document.createElement("i");
        i.style.width = a.pressao + "%";
        bar.appendChild(i);
        node.appendChild(bar);
      }
      areas.appendChild(node);
    });
    root.appendChild(areas);

    if (vm.attention) {
      const att = el(
        "section",
        "attention is-gravity-" + (vm.attention.gravity || "none")
      );
      att.appendChild(el("div", "att-eye", vm.attention.eyebrow));
      att.appendChild(el("h2", "att-situation", vm.attention.situation));
      if (vm.attention.consequence) att.appendChild(el("p", "att-consequence", vm.attention.consequence));
      if (vm.attention.evidences && vm.attention.evidences.length) {
        const ev = el("div", "att-evidences");
        vm.attention.evidences.forEach((t) => ev.appendChild(el("div", "att-ev fact", t)));
        att.appendChild(ev);
      }
      const acoes = el("div", "acao-area");
      if (vm.attention.actionLabel) {
        const pill = el("div", "acao-pill" + (vm.attention.pure ? " pure" : ""));
        pill.textContent = vm.attention.actionLabel;
        acoes.appendChild(pill);
      }
      if (vm.attention.secondaryAction) {
        acoes.appendChild(el("button", "acao-sec", vm.attention.secondaryAction));
      }
      att.appendChild(acoes);

      /* Previsão — progressive disclosure, secondary */
      if (vm.forecast) {
        const f = vm.forecast;
        const box = el("div", "forecast" + (f.expanded ? "" : " is-collapsed"));
        const fh = el("div", "forecast-head");
        fh.appendChild(el("span", "forecast-horizon", f.horizon || "próximos 10 a 15 min"));
        fh.appendChild(
          el("span", "forecast-conf", (f.confidence && f.confidence.level ? "confiança " + f.confidence.level + " " : "") + ((f.confidence && f.confidence.dots) || "●●○"))
        );
        fh.appendChild(el("span", "forecast-demo", f.demoLabel || "demonstração"));
        box.appendChild(fh);
        box.appendChild(el("p", "forecast-text", f.text));
        const detail = el("div", "forecast-detail");
        detail.appendChild(el("p", "forecast-note", f.note || "estimativa, não certeza · demonstração"));
        if (f.conditional) detail.appendChild(el("p", "forecast-note", f.conditional));
        box.appendChild(detail);
        const tog = el("button", "forecast-toggle", f.expanded ? "Recolher estimativa" : "Ver estimativa (10–15 min)");
        tog.onclick = () => {
          ui.forecastOpen = !ui.forecastOpen;
          ui.showForecast = true;
          render(INFO, ponto);
        };
        box.appendChild(tog);
        att.appendChild(box);
      }

      /* Ação acompanhada — estado atual */
      if (vm.actionTrack) {
        const at = vm.actionTrack;
        const box = el("div", "action-track" + (at.tense || at.stateId === "colateral" || at.stateId === "sem_resultado" ? " is-tense" : ""));
        const lab = el("div", "action-track-label", "Ação acompanhada");
        lab.appendChild(el("span", "demo-tag", at.demoLabel || "demonstração"));
        box.appendChild(lab);
        box.appendChild(el("div", "action-track-state", at.stateLabel));
        box.appendChild(el("p", "action-track-copy", at.copy));
        if (at.responsible) {
          box.appendChild(
            el(
              "div",
              "action-track-who",
              (at.responsible.role || "") +
                (at.responsible.name ? " · " + at.responsible.name : "") +
                " · " +
                (at.responsible.note || "função, não ranking")
            )
          );
        }
        att.appendChild(box);
      }

      root.appendChild(att);
    }

    palco.appendChild(root);
    updateTechBadge(null);
  }

  function updateTechBadge(tech) {
    const badge = $("techBadge");
    if (!tech || tech.status === "ready") {
      badge.hidden = true;
      return;
    }
    badge.hidden = false;
    badge.dataset.form = tech.form || "dashed";
    $("techLabel").textContent = tech.label || tech.status;
  }

  function renderTechOnly(status) {
    const AD = window.V33_ADAPTER;
    const tech = AD.mapearEstadoFonteV33(status);
    const palco = $("palco");
    palco.innerHTML = "";
    document.body.dataset.mode = "calmo";
    const s = el("section", "tech-screen");
    s.appendChild(el("div", "tech-screen-label", tech.label));
    s.appendChild(el("h1", "tech-screen-text", tech.text));
    s.appendChild(
      el(
        "p",
        "tech-screen-detail",
        "Estado técnico da fonte — não é tensão operacional nem culpa da equipe. Texto + forma (tracejado), cor só como apoio."
      )
    );
    palco.appendChild(s);
    updateTechBadge(tech);
  }

  function renderEstadoFonte(pl) {
    const AD = window.V33_ADAPTER;
    const tech = AD.mapearEstadoFonteV33(pl.source_status, pl.source_motivo);
    const palco = $("palco");
    palco.innerHTML = "";
    document.body.dataset.mode = "calmo";
    const s = el("section", "tech-screen");
    s.appendChild(el("div", "tech-screen-label", tech.label));
    s.appendChild(el("h1", "tech-screen-text", tech.text));
    if (pl.unknowns) {
      s.appendChild(
        el(
          "p",
          "tech-screen-detail",
          "Desconhecidos declarados: " +
            pl.unknowns.conflitos +
            " em conflito, " +
            pl.unknowns.parciais +
            " parciais, " +
            pl.unknowns.suspeitos +
            " suspeitos."
        )
      );
    }
    if (pl.ultimo_confiavel) {
      s.appendChild(
        el(
          "p",
          "tech-screen-detail",
          "Último estado confiável: " +
            pl.ultimo_confiavel.dia_local +
            " (" +
            pl.ultimo_confiavel.pedidos +
            " pedidos). " +
            pl.ultimo_confiavel.aviso +
            "."
        )
      );
    }
    palco.appendChild(s);
    $("fonteDado").textContent = "Fonte: " + pl.source_status + " · técnico";
    updateTechBadge(tech);
  }

  /* ---------- Voz (demo) ---------- */
  function renderVoice() {
    const panel = $("voicePanel");
    if (!ui.voiceOpen) {
      panel.hidden = true;
      panel.innerHTML = "";
      $("btMic").classList.remove("is-on");
      return;
    }
    $("btMic").classList.add("is-on");
    const M = window.V33_MOCKS;
    const v = M.voiceMock(ui.voicePhase);
    panel.hidden = false;
    panel.innerHTML = "";
    panel.appendChild(el("div", "panel-demo", "voz · demonstração"));
    if (v.phase === "idle" || v.phase === "listening") {
      panel.appendChild(el("div", "panel-title", v.hint || "Ouvindo…"));
      panel.appendChild(el("p", "panel-body", "Não é gravação contínua. Toque encerra a escuta."));
    } else if (v.phase === "transcript") {
      panel.appendChild(el("div", "panel-title", "Você disse"));
      panel.appendChild(el("p", "panel-body", "“" + v.transcript + "”"));
    } else if (v.phase === "answer") {
      panel.appendChild(el("div", "panel-title", v.conclusion));
      panel.appendChild(el("p", "panel-body", v.detail));
      ui.areaCite = v.areaCite || null;
      if (lastPonto) render(lastINFO, lastPonto);
    } else if (v.phase === "ambiguity" || v.phase === "fail" || v.phase === "done") {
      panel.appendChild(el("div", "panel-title", v.message));
    }
    const acts = el("div", "panel-actions");
    if (v.phase === "idle") {
      const b = el("button", "acao-pill", "Simular escuta");
      b.onclick = () => {
        ui.voicePhase = "listening";
        renderVoice();
        setTimeout(() => {
          ui.voicePhase = "transcript";
          renderVoice();
          setTimeout(() => {
            ui.voicePhase = "answer";
            renderVoice();
          }, 700);
        }, 700);
      };
      acts.appendChild(b);
    }
    if (v.phase === "answer" && v.needsConfirm) {
      const ok = el("button", "acao-pill", "Confirmar registro");
      ok.onclick = () => {
        ui.voicePhase = "done";
        renderVoice();
        setTimeout(() => {
          ui.voiceOpen = false;
          ui.voicePhase = "idle";
          ui.areaCite = null;
          renderVoice();
          if (lastPonto) render(lastINFO, lastPonto);
        }, 900);
      };
      acts.appendChild(ok);
      const amb = el("button", "acao-sec", "Ambíguo");
      amb.onclick = () => {
        ui.voicePhase = "ambiguity";
        renderVoice();
      };
      acts.appendChild(amb);
      const fail = el("button", "acao-sec", "Falha de reconhecimento");
      fail.onclick = () => {
        ui.voicePhase = "fail";
        renderVoice();
      };
      acts.appendChild(fail);
    }
    if (v.phase === "ambiguity" || v.phase === "fail" || v.phase === "done") {
      const back = el("button", "acao-pill", "Voltar à operação");
      back.onclick = () => {
        ui.voiceOpen = false;
        ui.voicePhase = "idle";
        ui.areaCite = null;
        renderVoice();
        if (lastPonto) render(lastINFO, lastPonto);
      };
      acts.appendChild(back);
    }
    const close = el("button", "acao-sec", "Fechar");
    close.onclick = () => {
      ui.voiceOpen = false;
      ui.voicePhase = "idle";
      ui.areaCite = null;
      renderVoice();
      if (lastPonto) render(lastINFO, lastPonto);
    };
    acts.appendChild(close);
    panel.appendChild(acts);
  }

  /* ---------- Fechamento de turno (demo) ---------- */
  function renderClosing() {
    const panel = $("closingPanel");
    if (!ui.closingOpen) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    const M = window.V33_MOCKS;
    const step = ui.closingStep == null ? 0 : ui.closingStep;
    const c = M.closingMock(step);
    panel.hidden = false;
    panel.innerHTML = "";
    panel.appendChild(el("div", "panel-demo", "fechamento · demonstração · " + c.timeHint));
    if (step === 0) {
      panel.appendChild(el("div", "panel-title", "Resumo do turno pronto"));
      panel.appendChild(
        el("p", "panel-body", "Operação estável na maior parte do tempo. Picos pontuais de saída. Até dois minutos.")
      );
      const acts = el("div", "panel-actions");
      const go = el("button", "acao-pill", "Começar (1 de 2)");
      go.onclick = () => {
        ui.closingStep = 1;
        renderClosing();
      };
      acts.appendChild(go);
      const skip = el("button", "acao-sec", "Pular");
      skip.onclick = () => {
        ui.closingOpen = false;
        ui.closingStep = null;
        renderClosing();
      };
      acts.appendChild(skip);
      panel.appendChild(acts);
    } else if (step === 1 || step === 2) {
      panel.appendChild(el("div", "panel-title", "Pergunta " + c.question.n));
      panel.appendChild(el("p", "panel-body", c.question.text));
      if (c.transcript) panel.appendChild(el("p", "panel-body", "Áudio simulado: “" + c.transcript + "”"));
      const acts = el("div", "panel-actions");
      const audio = el("button", "acao-pill", "Responder por áudio (demo)");
      audio.onclick = () => {
        ui.closingStep = step === 1 ? 2 : 3;
        renderClosing();
      };
      acts.appendChild(audio);
      const ns = el("button", "acao-sec", "Não sei");
      ns.onclick = () => {
        ui.closingStep = step === 1 ? 2 : 3;
        renderClosing();
      };
      acts.appendChild(ns);
      const pl = el("button", "acao-sec", "Pular");
      pl.onclick = () => {
        ui.closingStep = step === 1 ? 2 : 3;
        renderClosing();
      };
      acts.appendChild(pl);
      panel.appendChild(acts);
    } else {
      panel.appendChild(el("div", "panel-title", "Registrado no resumo"));
      panel.appendChild(el("p", "panel-body", "Transcrição de demonstração incluída. O turno pode se encerrar com calma."));
      const acts = el("div", "panel-actions");
      const done = el("button", "acao-pill", "Concluir");
      done.onclick = () => {
        ui.closingOpen = false;
        ui.closingStep = null;
        renderClosing();
      };
      acts.appendChild(done);
      panel.appendChild(acts);
    }
  }

  /* ---------- QA Catalog ---------- */
  function setupQa() {
    if (!QA_MODE) {
      $("qaCatalog").hidden = true;
      $("btQa").hidden = true;
      $("btCloseShift").hidden = true;
      return;
    }
    $("btQa").hidden = false;
    $("btCloseShift").hidden = false;
    const list = $("qaList");
    list.innerHTML = "";
    window.V33_MOCKS.QA_CATALOG.forEach((item) => {
      const b = el("button", "qa-item", item.name);
      b.type = "button";
      b.onclick = () => applyQa(item);
      list.appendChild(b);
    });
    $("btQa").onclick = () => {
      ui.qaOpen = !ui.qaOpen;
      $("qaCatalog").hidden = !ui.qaOpen;
    };
    $("qaClose").onclick = () => {
      ui.qaOpen = false;
      $("qaCatalog").hidden = true;
    };
  }

  function applyQa(item) {
    ui.techOverride = null;
    ui.voiceOpen = false;
    ui.closingOpen = false;
    renderVoice();
    renderClosing();

    if (item.mode === "tech") {
      ui.techOverride = item.status;
      if (lastPonto) render(lastINFO, lastPonto);
      else renderTechOnly(item.status);
      return;
    }
    if (item.mode === "voice") {
      ui.voiceOpen = true;
      ui.voicePhase = "idle";
      renderVoice();
      return;
    }
    if (item.mode === "closing") {
      ui.closingOpen = true;
      ui.closingStep = 0;
      renderClosing();
      return;
    }

    ui.forceMode = item.mode.indexOf("force-") === 0 ? item.mode : null;
    ui.showForecast = item.mock === "forecast";
    ui.forecastOpen = item.mock === "forecast";
    ui.actionState = item.mock === "action" ? item.state : null;

    // pular timeline para minuto compatível quando possível
    if (timeline.length) {
      if (ui.forceMode === "force-calmo") {
        const i = timeline.findIndex((p) => p.mode === "calmo");
        if (i >= 0) i0 = i;
      } else if (ui.forceMode === "force-ambiente") {
        const i = timeline.findIndex((p) => p.mode === "ambiente");
        if (i >= 0) i0 = i;
      } else if (ui.forceMode === "force-foco") {
        const i = timeline.findIndex((p) => p.mode === "foco");
        if (i >= 0) i0 = i;
      }
      if (lastINFO) render(lastINFO, timeline[i0] || lastPonto);
      $("linha").value = String(i0);
      $("relogio").textContent = timeline[i0] ? hhmm(timeline[i0].t) : "";
    }
  }

  /* ---------- controles replay ---------- */
  function ligarControles(INFO) {
    const linha = $("linha"),
      bt = $("btPlay"),
      btVel = $("btVel"),
      btSom = $("btSom"),
      rel = $("relogio");
    linha.max = String(timeline.length - 1);
    const mostrar = () => {
      const p = timeline[i0];
      if (tocando && p.mode === "foco" && ultimoModo !== "foco") chime();
      ultimoModo = p.mode;
      // ao avançar no replay natural, limpa forceMode de QA se não estiver no catálogo aberto de propósito
      render(INFO, p);
      rel.textContent = hhmm(p.t);
      linha.value = String(i0);
    };
    const passo = () => {
      if (i0 < timeline.length - 1) {
        i0++;
        mostrar();
      } else pausar();
    };
    const tocar = () => {
      tocando = true;
      bt.textContent = "❚❚";
      clearInterval(timer);
      timer = setInterval(passo, 1000 / vel);
    };
    const pausar = () => {
      tocando = false;
      bt.textContent = "▶";
      clearInterval(timer);
    };
    bt.onclick = () => (tocando ? pausar() : tocar());
    btVel.onclick = () => {
      vel = VELOCIDADES[(VELOCIDADES.indexOf(vel) + 1) % VELOCIDADES.length];
      btVel.textContent = vel + "×";
      if (tocando) tocar();
    };
    btSom.onclick = () => {
      som = !som;
      btSom.textContent = som ? "Som ligado" : "Som desligado";
      if (som) chime();
    };
    linha.oninput = () => {
      i0 = +linha.value;
      ultimoModo = null;
      mostrar();
    };
    // DEFAULT: primeiro minuto CALMO
    i0 = Math.max(0, timeline.findIndex((p) => p.mode === "calmo"));
    if (i0 < 0) i0 = 0;
    vel = 10;
    btVel.textContent = "10×";
    mostrar();
    $("replay").hidden = false;
  }

  function rodarJanela(seed, J, rotuloFonte) {
    const SEED = seed.itens;
    MOTOR.setNomes(Object.fromEntries(SEED.map((x) => [x.id, x.nome])));
    const FONTE = MOTOR.makeFonteItensFromRows(J.rows, SEED);
    const INFO = {};
    for (const o of J.NIGHT) INFO[o.id] = MOTOR.resolver(FONTE(o.id));
    for (const o of J.NIGHT) if (o.curto) CURTO[o.id] = o.curto;
    if (J.meta.diaBase) {
      const d = +J.meta.diaBase.slice(-2);
      diasRotulo = [d + "/06", d + 1 + "/06"];
    } else if (J.meta.dia_local) {
      const dl = J.meta.dia_local.slice(8, 10) + "/" + J.meta.dia_local.slice(5, 7);
      diasRotulo = [dl, dl];
    }
    rotuloJanela = rotuloFonte || "Janela real " + (J.meta.diaBase ? diasRotulo[0] : "01/07");
    $("fonteDado").textContent =
      rotuloJanela +
      ", " +
      J.meta.pedidos +
      " pedidos" +
      (J.meta.fonte === "simulada" ? ", dados sintéticos (não é operação real)" : ", itens reais por pedido");
    timeline = precomputar(J, INFO);
    window.__V1 = { timeline, INFO, meta: J.meta };
    window.__V33 = { ui, version: "v3.3" };
    ligarControles(INFO);
  }

  function bootAtual(avisoFlag) {
    const qj = new URLSearchParams(location.search).get("j");
    const arqJanela = qj
      ? "../data/generated/v1_janela_real_" + qj + ".json"
      : "../data/generated/v1_janela_real.json";
    Promise.all([
      fetch("../data/cardapio_knowledge_seed.json").then((r) => r.json()),
      fetch(arqJanela).then((r) => {
        if (!r.ok)
          throw new Error(
            "Janela real não encontrada. Rode: node tools/gerar_janela_v1.js" + (qj ? " " + +qj.slice(-2) : "")
          );
        return r.json();
      })
    ])
      .then(([seed, J]) => {
        rodarJanela(seed, J, null);
        if (avisoFlag) $("fonteDado").textContent += " · " + avisoFlag;
      })
      .catch((e) => {
        const palco = $("palco");
        palco.innerHTML = "";
        const s = el("section", "estado carregando");
        s.appendChild(el("p", "sussurro", "Não consegui carregar a janela real. " + e.message));
        palco.appendChild(s);
        $("fonteDado").textContent = "Sem dado";
      });
  }

  function bootSimulador() {
    const q = new URLSearchParams(location.search);
    const url =
      "/api/fonte" +
      (q.get("cenario") ? "?cenario=" + q.get("cenario") : "") +
      (q.get("estado") ? (q.get("cenario") ? "&" : "?") + "estado=" + q.get("estado") : "");
    Promise.all([
      fetch("../data/cardapio_knowledge_seed.json").then((r) => r.json()),
      fetch(url).then((r) => r.json())
    ])
      .then(([seed, pl]) => {
        if (pl.source_status === "ready" && pl.janela && pl.janela.NIGHT.length > 0) {
          rodarJanela(seed, pl.janela, "Fonte simulada (D4A), dia " + (pl.operational_day_key || "?"));
        } else {
          renderEstadoFonte(pl);
        }
      })
      .catch((e) => renderEstadoFonte({ source_status: "failed", source_motivo: e.message }));
  }

  /* boot UI chrome */
  $("btMic").onclick = () => {
    ui.voiceOpen = !ui.voiceOpen;
    ui.voicePhase = "idle";
    renderVoice();
  };
  $("btCloseShift").onclick = () => {
    ui.closingOpen = true;
    ui.closingStep = 0;
    renderClosing();
  };
  setupQa();

  fetch("/api/config")
    .then((r) => {
      if (!r.ok) throw new Error("sem config");
      return r.json();
    })
    .then((cfg) => {
      if (cfg && cfg.fonte === "simulator") bootSimulador();
      else bootAtual(cfg && cfg.degraded_state === "flag_invalida" ? "flag inválida, usando fonte padrão" : null);
    })
    .catch(() => bootAtual(null));
})();
