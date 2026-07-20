/* ============================================================================
 * DeliveryOS · Copiloto V3.3 — superfície do organismo.
 * ----------------------------------------------------------------------------
 * Contrato: motor decide → projeção expõe → adaptador transporta → UI apresenta.
 * A interface NUNCA recalcula Calmo/Ambiente/Foco.
 * Design canônico: design-reference/copiloto-v33/ (imutável). A composição
 * daqui é o PORT fiel do HTML congelado: topologia circular do organismo
 * (células por área + ligações SVG), caption editorial, painel de atenção
 * sobreposto, banner técnico, mobile vertical. Nada de grade de cards.
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
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  const VELOCIDADES = [1, 10, 30];
  let timeline = [], i0 = 0, tocando = false, vel = 1, timer = null;
  let diasRotulo = ["30/06", "01/07"];
  let rotuloJanela = "";
  let fonteSimulada = false;
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
    areaCite: null,
    actionSince: null,
    voiceAnswer: null,
    feedbackState: null,
    cvOverlay: null
  };

  const params = new URLSearchParams(location.search);
  const QA_MODE = params.get("qa") === "1" || params.get("dev") === "1";
  const mqMobile = window.matchMedia("(max-width: 720px)");

  /* —— Fase 2C: chamadas vivas aos motores (cache por chave; re-render ao
   * chegar). A UI nunca decide — só apresenta o que os motores devolvem. —— */
  const cvCache = new Map();
  function buscarVivo(chave, url, opts, aoChegar) {
    if (cvCache.has(chave)) return cvCache.get(chave);
    cvCache.set(chave, null); // em voo
    fetch(url, opts)
      .then((r) => r.json())
      .then((d) => {
        cvCache.set(chave, d);
        if (aoChegar) aoChegar(d);
        else if (lastPonto) render(lastINFO, lastPonto);
      })
      .catch(() => { cvCache.set(chave, { indisponivel: true }); });
    return null;
  }
  const AREA_SLUG = {
    "Sushi": "sushi", "Quentes": "quentes", "Cozinha": "cozinha",
    "Conferência": "conferencia", "Entregas": "motoboy", "Caixa": "caixa"
  };
  const ROTULO_PRACA_CV = {
    sushi: "Sushi", quentes: "Quentes", cozinha: "Cozinha",
    conferencia: "Conferência", caixa: "Caixa", motoboy: "Entregas"
  };
  /* Tradução humana do estado interno (o ISF nunca vira número no produto) */
  function humanoDoEstado(estado, pracaSlug) {
    const p = ROTULO_PRACA_CV[pracaSlug] || pracaSlug || "A operação";
    if (estado === "atencao") return p + " está absorvendo o ritmo, mas perdeu margem de segurança.";
    if (estado === "proximo_limite") return p + " está perto do limite do que consegue absorver.";
    if (estado === "acima_capacidade") return p + " passou do que consegue absorver agora.";
    return "A operação está absorvendo o que entra.";
  }

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

  /* —— Leitura por área (dados reais do motor; nunca decide, só apresenta) —— */
  const AMB_ESTADO = { verde: "Tudo fluindo", amarelo: "Atenção", vermelho: "Virando foco", validacao: "Em validação" };
  function corPorSev(sev) {
    return sev >= 3 ? "vermelho" : sev >= 1 ? "amarelo" : "verde";
  }
  function pedidosDependendo(R, INFO, pracas) {
    let n = 0;
    for (const w of R.ctx.wP) {
      const I = INFO[w.id];
      if (I && I.benches && I.benches.some((p) => pracas.indexOf(p) >= 0)) n++;
    }
    return n;
  }
  /* Lógica pura das células (agregação de praças + Caixa) vive em
   * src/live/interface/celulas-operacionais.js (window.CELULAS_OP) — módulo
   * testável server-side, mesmo padrão de MOTOR / V33_ADAPTER. */
  const CEL = window.CELULAS_OP;

  /* Severidade por praça, a partir dos degraus que o motor já produziu. */
  function sevPorPracaDe(R, pracas) {
    const sp = {};
    for (const s of R.sits) {
      if (s.kind === "praca" && pracas.indexOf(s.praca) >= 0) {
        sp[s.praca] = Math.max(sp[s.praca] || 0, s.sev || 0);
      }
    }
    return sp;
  }
  /* Célula de produção (agregada ou praça única) usando a lógica pura. */
  function celulaProducao(R, INFO, pracas, nomeCelula) {
    const est = CEL.estadoAgregado(sevPorPracaDe(R, pracas), pracas, MOTOR.DISPLAY);
    return {
      nome: nomeCelula, cor: est.cor, sev: est.sev,
      n: pedidosDependendo(R, INFO, pracas),
      motivo: est.motivo
    };
  }

  function mapaAmbientes(R, INFO, NIGHT, t) {
    /* Sushi: agregação visual das três praças frias. */
    const sushi = celulaProducao(R, INFO, ["combinados", "duplas", "enrolados"], "Sushi");
    /* Quentes: praça visual ligada SOMENTE a enrolados_quentes.
     * cozinha_quentes NÃO entra aqui — pertence à célula Cozinha (sem duplicar). */
    const quentes = celulaProducao(R, INFO, ["enrolados_quentes"], "Quentes");
    /* Cozinha: praça visual ligada SOMENTE a cozinha_quentes (dado real do
     * motor; deixou de ser estado fixo de validação). */
    const cozinha = celulaProducao(R, INFO, ["cozinha_quentes"], "Cozinha");
    /* Caixa: célula derivada, leitura parcial e explicável. */
    const caixa = Object.assign({ nome: "Caixa" }, CEL.leituraCaixa(NIGHT, t));
    /* Conferência: função distinta do Caixa (verificação final, integridade,
     * itens pendentes, liberação). NÃO é alimentada por montagem_outros —
     * cuja hipótese operacional é montagem/sacolas/embalagem, não checklist.
     * Sem fonte comprovada de entrada em conferência, checklist, itens
     * pendentes, pedido conferido ou tempo aguardando, a célula declara que a
     * leitura não está conectada — nunca inventa estado, pressão ou quantidade. */
    const conf = {
      nome: "Conferência", cor: "validacao", sev: 0, n: 0,
      frase: "leitura ainda não conectada", info: "",
      motivo: "A conferência final ainda não tem fonte conectada (entrada em conferência, checklist, itens pendentes, pedido conferido)."
    };
    /* Entregas: o domínio ENTREGAS ainda não está integrado ao Copiloto.
     * Nada de motoboys, viagens, atrasos, ocorrências, retornos, handoffs,
     * carga de expedição ou fila de retirada — nenhum desses sinais existe
     * aqui, e estimativa não é dado. */
    const entregas = {
      nome: "Entregas", cor: "validacao", sev: 0, n: 0,
      frase: "aguardando integração", info: "",
      motivo: "O domínio Entregas ainda não está integrado ao Copiloto."
    };
    return [caixa, sushi, quentes, cozinha, conf, entregas].map((a) => ({
      nome: a.nome, cor: a.cor, sev: a.sev, n: a.n,
      pressao: null,
      estadoTxt: AMB_ESTADO[a.cor],
      motivo: a.motivo,
      frase: a.frase || null,
      info: a.info != null ? a.info : null
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
  /* Sinais de Fluxo (V1): seguem computados e expostos em window.__V1 para
   * inspeção/QA, mas a superfície V3.3 congelada não tem esse bloco —
   * renderizá-lo seria desvio da referência. Pendência de design registrada. */
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

  /* Sinais por pedido a partir dos carimbos REAIS da janela. Idade = tempo na
   * etapa observável (desde o pronto quando pronto; desde a chegada antes).
   * s/e não são observados por esta fonte — "parado" significa sempre "sem
   * saída OBSERVADA", nunca um evento inventado. */
  function ordersSinaisDe(t, NIGHT) {
    const out = [];
    for (const o of NIGHT) {
      if (o.r == null || o.r > t) continue;
      if (o.c != null && o.c <= t) continue;
      const pronto = o.p != null && t >= o.p;
      out.push({ id: o.curto || o.id, pronto, age_min: pronto ? t - o.p : t - o.r });
    }
    return out;
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
          const m = semTags(rec.primeiro).match(/#([A-Za-z0-9-]+)/);
          if (m) alvoId = m[1];
        }
      }
      const ambientes = mapaAmbientes(R, INFO, J.NIGHT, t);
      const cvPracas = {}; const filas = {};
      for (const a of ambientes) {
        const slug = AREA_SLUG[a.nome];
        if (!slug) continue;
        filas[slug] = a.n || 0;
        if (a.cor !== "validacao") cvPracas[slug] = { sev: a.sev || 0, n: a.n || 0 };
      }
      linha.push({
        t,
        mode: R.mode,
        emand: R.emand,
        intenso: R.intenso,
        amb: (R.ambList || []).map((a) => ({ label: semTags(a.label), sev: a.sev })),
        ambientes,
        filas,
        cv: { pracas: cvPracas, orders: ordersSinaisDe(t, J.NIGHT) },
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
    /* Previsão: motor real (copiloto.forecast) sobre o histórico REAL de fila
     * da área — progressive disclosure (nasce recolhida, nunca domina). */
    if (mode === "foco" || ui.showForecast) {
      const areaSlug = AREA_SLUG[areaHint] || "conferencia";
      const hist = historicoFila(areaSlug, ponto);
      let vivo = null;
      if (hist.length >= 2) {
        vivo = buscarVivo(
          "fc:" + ponto.t + ":" + areaSlug,
          "/api/inteligencia/forecast?area=" + areaSlug + "&hist=" + hist.join(",") +
            (fonteSimulada ? "&demo=1" : "")
        );
      }
      if (vivo && !vivo.indisponivel) {
        mocks.forecast = Object.assign({}, vivo, { expanded: ui.forecastOpen });
      } else if (hist.length >= 2) {
        mocks.forecast = {
          simulated: false,
          demoLabel: fonteSimulada ? "demonstração" : null,
          horizon: "próximos 10 a 15 min",
          conditional: "se nada mudar",
          confidence: { level: "baixa", dots: "○○○", visual: "confidence" },
          text: "Calculando estimativa do motor…",
          note: "motor de previsão · aguardando cálculo",
          expanded: ui.forecastOpen
        };
      } else if (ui.showForecast) {
        mocks.forecast = M.forecastMock(areaHint || "Conferência");
        mocks.forecast.expanded = ui.forecastOpen;
      }
    }
    /* Ação acompanhada: estado real do engine (playbooks) quando disponível */
    if (ui.actionState) {
      const areaSlug = AREA_SLUG[areaHint] || "conferencia";
      const vivo = buscarVivo(
        "at:" + ui.actionState + ":" + areaSlug,
        "/api/inteligencia/action?area=" + areaSlug + "&state=" + encodeURIComponent(ui.actionState)
      );
      mocks.actionTrack = vivo && !vivo.indisponivel ? Object.assign({}, vivo) : M.actionTrackMock(ui.actionState);
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
      evidences: evidences.slice(0, 3),
      actionLabel,
      secondaryAction,
      focoAreaHint: areaHint,
      mocks,
      calmCopy: "Nada exige você agora.",
      climateNote: null,
      meta: { janela: rotuloJanela }
    });

    // citação de área pela voz
    if (ui.areaCite) {
      vm.areas.forEach((a) => {
        if (a.nome === ui.areaCite) a.cite = true;
      });
    }
    vm.areaHint = areaHint;
    vm.alvoId = ponto.alvoId;

    /* Leitura viva da Capacidade Viva no Foco: exceções + menor intervenção
     * dos motores reais sobre degraus do motor + carimbos reais (V0.1). */
    if (mode === "foco" && ponto.cv) {
      const leitura = buscarVivo("cv:" + ponto.t, "/api/capacidade-viva/leitura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pracas: ponto.cv.pracas || {},
          orders: ponto.cv.orders || [],
          confianca: "media"
        })
      });
      vm.cvLeitura = leitura && !leitura.indisponivel ? leitura : null;
    }
    return vm;
  }

  /* Histórico REAL de fila da área (pedidos em produção dependendo dela),
   * minuto a minuto até o ponto atual — entrada do motor de previsão. */
  function historicoFila(slug, ponto) {
    const i = timeline.indexOf(ponto);
    if (i < 0) return [];
    const ini = Math.max(0, i - 30);
    return timeline.slice(ini, i + 1).map((p) => (p.filas && p.filas[slug]) || 0);
  }

  /* ================= ORGANISMO V3.3 — topologia canônica ================= */
  /* Posições e tamanhos-base do HTML congelado (defs + baseCells). */
  const CEL_DEF = [
    { id: "caixa", nome: "Caixa", x: 10, y: 52, base: 112 },
    { id: "sushi", nome: "Sushi", x: 38, y: 21, base: 126 },
    { id: "quentes", nome: "Quentes", x: 40, y: 53, base: 128 },
    { id: "cozinha", nome: "Cozinha", x: 38, y: 84, base: 112 },
    { id: "conferencia", nome: "Conferência", x: 67, y: 52, base: 128 },
    { id: "motoboy", nome: "Entregas", x: 90, y: 52, base: 122 }
  ];
  const LIGACOES = [
    ["caixa", "sushi"], ["caixa", "quentes"], ["caixa", "cozinha"],
    ["sushi", "conferencia"], ["quentes", "conferencia"], ["cozinha", "conferencia"],
    ["conferencia", "motoboy"]
  ];

  /* Frases de estado por degrau (linguagem do HTML congelado; degrau = cor
   * que o motor já produziu — a UI só traduz degrau → frase aprovada). */
  function fraseEstado(nome, cor, dominante) {
    if (dominante) return "precisa de atenção";
    if (cor === "validacao") return "ainda sem dados";
    if (cor === "vermelho") {
      if (nome === "Entregas") return "acúmulo na saída";
      if (nome === "Conferência") return "atrasando a saída";
      return "pressão subindo";
    }
    if (cor === "amarelo") {
      if (nome === "Conferência") return "começando a atrasar";
      if (nome === "Entregas") return "prontos esperando";
      return "fila crescendo";
    }
    if (nome === "Conferência") return "sem pendências";
    if (nome === "Entregas") return "sem acúmulo";
    return "no ritmo";
  }
  function infoDe(nome, cor, n) {
    if (!n) return "";
    if (nome === "Conferência") return "pedido para conferir";
    if (nome === "Entregas") return n === 1 ? "1 pronto esperando" : n + " prontos esperando";
    return cor === "verde" ? n + " em produção" : n + " esperando";
  }
  function toneCelula(cor, dominante) {
    if (dominante) return "cream";
    if (cor === "validacao") return "faint";
    if (cor === "vermelho") return "ember";
    if (cor === "amarelo") return "warm";
    return "ivory";
  }
  function tamanhoCelula(base, tone) {
    if (tone === "ember") return base + 34;
    if (tone === "cream") return base + 22;
    if (tone === "warm") return base + 12;
    return base;
  }

  function montarCelulas(vm, ponto) {
    const porNome = {};
    (ponto.ambientes || []).forEach((a) => { porNome[a.nome] = a; });
    const domNome = vm.mode === "foco" && vm.areaHint ? vm.areaHint : null;
    return CEL_DEF.map((d) => {
      const a = porNome[d.nome] || { cor: "validacao", n: 0, motivo: "" };
      const dominante = domNome === d.nome;
      const tone = toneCelula(a.cor, dominante);
      const marcas = tone === "faint"
        ? { solid: 0, open: 2 }
        : { solid: Math.min(6, a.n || 0), open: 0 };
      const dim = vm.mode === "foco" && !dominante && (tone === "ivory" || tone === "faint");
      return {
        id: d.id, nome: d.nome, x: d.x, y: d.y,
        size: tamanhoCelula(d.base, tone),
        tone,
        /* Células derivadas (Caixa, Conferência, Entregas) trazem a própria
         * frase/info honesta; as praças seguem o vocabulário congelado. */
        estado: dominante
          ? fraseEstado(d.nome, a.cor, true)
          : (a.frase || fraseEstado(d.nome, a.cor, false)),
        info: a.info != null && a.info !== null
          ? a.info
          : (dominante ? infoDe(d.nome, "vermelho", a.n) : infoDe(d.nome, a.cor, a.n)),
        motivo: a.motivo || "",
        marcas,
        pulse: tone === "ember",
        halo: dominante,
        dim,
        cite: !!(porNome[d.nome] && vm.areas.find((v) => v.nome === d.nome && v.cite)),
        cor: a.cor
      };
    });
  }

  /* Cor-base das ligações sem pressão: segue --mode-line (progressão
   * cromática do clima). Ligações com pressão real (âmbar, acima) nunca
   * usam isto — permanecem fixas independente do modo. Congelado/frozen
   * também não usa isto — estado técnico fica neutro, fora do clima. */
  function corLinhaBase() {
    const v = getComputedStyle(document.body).getPropertyValue("--mode-line").trim();
    return v || "#22402F";
  }

  /* Ligações ativas: pressão real (degrau da área, informado pelo motor)
   * atravessando o caminho do pedido — sem relação ativa, linha base fina. */
  function montarLigacoes(celulas) {
    const por = {};
    celulas.forEach((c) => { por[c.id] = c; });
    const ativa = {};
    ["sushi", "quentes", "cozinha"].forEach((id) => {
      const c = por[id];
      if (!c) return;
      if (c.cor === "vermelho") ativa[id + "-conferencia"] = { w: 2.6, c: "#C98A46", flow: true };
      else if (c.cor === "amarelo") ativa[id + "-conferencia"] = { w: 1.8, c: "#8A6E4A" };
    });
    const saidaTensa = por.motoboy && (por.motoboy.cor === "amarelo" || por.motoboy.cor === "vermelho");
    const confTensa = por.conferencia && por.conferencia.cor !== "verde" && por.conferencia.cor !== "validacao";
    if (saidaTensa || confTensa) {
      ativa["conferencia-motoboy"] = { w: saidaTensa && por.motoboy.cor === "vermelho" ? 2.8 : 2, c: "#C98A46", flow: true };
    }
    return ativa;
  }

  function svgLigacoes(celulas, opts) {
    const ativas = montarLigacoes(celulas);
    const svg = svgEl("svg", { class: "constel-links", viewBox: "0 0 100 100", preserveAspectRatio: "none" });
    const por = {};
    celulas.forEach((c) => { por[c.id] = c; });
    const base = opts && opts.frozen ? { w: 0.8, c: "#1A2A22" } : { w: 0.9, c: corLinhaBase() };
    for (const [a, b] of LIGACOES) {
      const ov = (opts && opts.frozen) ? null : ativas[a + "-" + b];
      const w = ov || base;
      const linha = svgEl("line", {
        x1: por[a].x, y1: por[a].y, x2: por[b].x, y2: por[b].y,
        stroke: w.c, "stroke-width": w.w, "stroke-linecap": "round",
        "vector-effect": "non-scaling-stroke"
      });
      if (w.flow) {
        linha.setAttribute("stroke-dasharray", "5 8");
        linha.setAttribute("class", "dosflow");
      }
      svg.appendChild(linha);
    }
    /* Âncora ao painel de atenção: só quando a célula dominante está acima
     * da região do painel (coluna direita) — como no congelado; para células
     * à esquerda, a própria ligação ativa em âmbar faz a ponte visual. */
    const dom = celulas.find((c) => c.halo);
    if (dom && dom.x >= 60 && opts && opts.anchor) {
      svg.appendChild(svgEl("line", {
        x1: dom.x, y1: dom.y + 11, x2: dom.x, y2: Math.min(96, dom.y + 36),
        stroke: "#E0A25A", "stroke-width": 1.4, "stroke-dasharray": "1.5 3.5",
        "vector-effect": "non-scaling-stroke"
      }));
    }
    return svg;
  }

  function nodeCelula(c, circular) {
    const node = el("div", "cell tone-" + c.tone +
      (c.dim ? " is-dim" : "") + (c.halo ? " is-halo" : "") + (c.cite ? " is-cite" : ""));
    if (circular) {
      node.style.width = c.size + "px";
      node.style.height = c.size + "px";
    }
    if (c.pulse) node.appendChild(el("span", "cell-pulse dospulse"));
    const marcas = el("div", "cell-marks");
    for (let i = 0; i < c.marcas.solid; i++) marcas.appendChild(el("span", "mark-solid"));
    for (let i = 0; i < c.marcas.open; i++) marcas.appendChild(el("span", "mark-open"));
    if (c.marcas.solid + c.marcas.open > 0) node.appendChild(marcas);
    node.appendChild(el("div", "cell-nome" + (c.size >= 150 ? " nome-xl" : c.size >= 126 ? " nome-lg" : ""), c.nome));
    node.appendChild(el("div", "cell-estado", c.estado));
    if (c.info) node.appendChild(el("div", "cell-info", c.info));
    if (c.motivo) node.title = c.motivo;
    return node;
  }

  /* —— Cabeçalho editorial do palco (kicker + caption + subnota) —— */
  function cabecalhoDe(vm) {
    const rotuloFonte = fonteSimulada ? "demonstração" : "replay";
    const medidas = (lastPonto && lastPonto.ambientes ? lastPonto.ambientes : [])
      .filter((a) => a.cor === "amarelo" || a.cor === "vermelho");
    if (vm.mode === "foco") {
      return { kicker: "PRECISA DE ATENÇÃO", accent: "cream", caption: "", rotuloFonte };
    }
    if (vm.mode === "ambiente") {
      let caption;
      if (medidas.length >= 3) caption = "Pressão em várias áreas ao mesmo tempo.";
      else if (medidas.length === 2) caption = "Duas pressões ao mesmo tempo.";
      else if (medidas.length === 1) {
        const CAPTION_AREA = {
          "Sushi": "A fila do Sushi está crescendo.",
          "Quentes": "A fila dos Quentes está crescendo.",
          "Cozinha": "A fila da Cozinha está crescendo.",
          "Conferência": "Pedido pedindo conferência antes de sair.",
          "Caixa": "Vários pedidos ficaram prontos quase juntos."
        };
        caption = CAPTION_AREA[medidas[0].nome] || "Pressão surgindo no organismo.";
      } else caption = "Movimento discreto no organismo.";
      return { kicker: "O CLIMA MUDA", accent: "ambar", caption, rotuloFonte };
    }
    return {
      kicker: "AGORA · " + rotuloFonte.toUpperCase(),
      accent: "verde",
      caption: "A operação está fluindo. Nada exige você agora.",
      rotuloFonte
    };
  }

  function nodeCaption(vm, cab) {
    const box = el("div", "stage-caption");
    box.appendChild(el("span", "stage-kicker accent-" + cab.accent, cab.kicker));
    if (cab.caption) box.appendChild(el("p", "stage-caption-text", cab.caption));
    box.appendChild(el("p", "stage-subnote",
      vm.emand + (vm.emand === 1 ? " pedido em andamento · " : " pedidos em andamento · ") + cab.rotuloFonte));
    return box;
  }

  /* —— Painel de atenção (Foco) — composição do HTML congelado —— */
  function nodeFocoPanel(vm, INFO, ponto) {
    const at = vm.attention;
    if (!at) return null;
    const panel = el("section", "foco-panel is-gravity-" + (at.gravity || "none"));
    panel.appendChild(el("div", "foco-notch"));
    panel.appendChild(el("span", "foco-eye",
      "PRECISA DE ATENÇÃO" + (vm.areaHint ? " · " + vm.areaHint.toUpperCase() : "")));
    panel.appendChild(el("h2", "foco-situacao", at.situation || ""));
    if (at.consequence) panel.appendChild(el("p", "foco-conseq", at.consequence));
    if (at.evidences && at.evidences.length) {
      const evs = el("div", "foco-evs");
      at.evidences.slice(0, 3).forEach((t) => {
        const linha = el("div", "foco-ev");
        linha.appendChild(el("span", "foco-tick"));
        linha.appendChild(el("span", "foco-ev-txt", t));
        evs.appendChild(linha);
      });
      panel.appendChild(evs);
    }

    /* Menor intervenção (Capacidade Viva, motores reais) — subordinada à ação
     * do motor de decisão; pausa NUNCA é automática, sempre decisão humana. */
    if (vm.cvLeitura && vm.cvLeitura.intervencao) {
      const iv = vm.cvLeitura.intervencao;
      const ehPausa = iv.action === "pausa_seletiva" || iv.action === "pausa_geral";
      const linha = el("div", "foco-intervencao" + (ehPausa ? " is-pausa" : ""));
      linha.appendChild(el("span", "foco-intervencao-rotulo", "menor intervenção"));
      let txt;
      if (iv.bloqueio_confianca) txt = iv.reason;
      else if (iv.action === "pausa_geral") txt = "Pausa geral é a última alternativa — decisão humana, nada é aplicado automaticamente.";
      else if (iv.action === "pausa_seletiva") txt = "Pause temporariamente apenas os itens desta praça — decisão humana, nada é aplicado automaticamente.";
      else txt = "Ainda não é necessário pausar — " + (iv.label || "observar").toLowerCase() + ".";
      linha.appendChild(el("span", "foco-intervencao-txt", txt));
      panel.appendChild(linha);
    }

    /* Previsão — progressive disclosure, confiança separada da gravidade */
    if (vm.forecast) {
      const f = vm.forecast;
      const box = el("div", "forecast" + (f.expanded ? "" : " is-collapsed"));
      const fh = el("div", "forecast-head");
      fh.appendChild(el("span", "forecast-horizon", f.horizon || "próximos 10 a 15 min"));
      fh.appendChild(el("span", "forecast-conf",
        (f.confidence && f.confidence.level ? "confiança " + f.confidence.level + " " : "") +
        ((f.confidence && f.confidence.dots) || "●●○")));
      box.appendChild(fh);
      box.appendChild(el("p", "forecast-text", f.text));
      const detail = el("div", "forecast-detail");
      detail.appendChild(el("p", "forecast-note", f.note || "estimativa, não certeza · demonstração"));
      if (f.conditional) detail.appendChild(el("p", "forecast-note", "condição: " + f.conditional));
      box.appendChild(detail);
      const tog = el("button", "forecast-toggle", f.expanded ? "Recolher estimativa" : "Ver estimativa (10–15 min)");
      tog.onclick = () => {
        ui.forecastOpen = !ui.forecastOpen;
        ui.showForecast = true;
        render(INFO, ponto);
      };
      box.appendChild(tog);
      panel.appendChild(box);
    }

    /* Ação acompanhada — fases + estado atual (demonstração explícita) */
    if (vm.actionTrack) {
      const atk = vm.actionTrack;
      const FASES = ["Recomendada", "Aceita", "Em andamento", "Encerrada"];
      const IDX = {
        recomendacao: 0, aceita: 1, assumiu: 1, andamento: 2, melhora: 2,
        parcial: 2, sem_resultado: 2, colateral: 2, encerramento: 3
      };
      const fi = IDX[atk.stateId] != null ? IDX[atk.stateId] : 0;
      const fases = el("div", "foco-fases");
      FASES.forEach((n, i) => {
        fases.appendChild(el("span",
          "fase-pill" + (i === fi ? " is-atual" : i < fi ? " is-feita" : ""), n));
        if (i < FASES.length - 1) fases.appendChild(el("span", "fase-seta", "→"));
      });
      panel.appendChild(fases);
      const min = ui.actionSince ? Math.max(0, Math.round((Date.now() - ui.actionSince) / 60000)) : null;
      const tempo = min == null ? "" : min === 0 ? " · agora" : " · há " + min + " min";
      const st = el("p", "foco-status status-" + atk.stateId, atk.copy + tempo);
      panel.appendChild(st);
      if (atk.responsible) {
        panel.appendChild(el("div", "foco-who",
          (atk.responsible.role || "") +
          (atk.responsible.name ? " · " + atk.responsible.name : "") +
          " · " + (atk.responsible.note || "função, não ranking")));
      }
      /* Recuperação Líquida: classificador real traduzido humanamente */
      const CASO_POR_STATE = { melhora: "liquida", parcial: "parcial", sem_resultado: "sem", colateral: "deslocou" };
      const caso = CASO_POR_STATE[atk.stateId];
      if (caso) {
        const rec = buscarVivo("rec:" + caso, "/api/capacidade-viva/recuperacao?caso=" + caso);
        if (rec && rec.copy) {
          panel.appendChild(el("p", "foco-recuperacao",
            rec.copy + (QA_MODE ? " · " + rec.outcome + " (detalhe dev)" : "")));
        }
      }
      if (atk.demoLabel) panel.appendChild(el("span", "demo-tag", atk.demoLabel));
      /* Feedback humano no encerramento — rápido, opcional, nunca no pico */
      if (atk.stateId === "encerramento") panel.appendChild(nodeFeedback());
    }

    const acoes = el("div", "foco-acoes");
    if (at.actionLabel) {
      acoes.appendChild(el("div", "acao-pill" + (at.pure ? " pure" : ""), at.actionLabel));
    }
    if (at.secondaryAction) acoes.appendChild(el("span", "acao-sec", at.secondaryAction));
    panel.appendChild(acoes);
    return panel;
  }

  /* Feedback humano — pills rápidas + observação opcional. Registrado na
   * memória da sessão do servidor (não é persistência de produção). */
  function nodeFeedback() {
    const box = el("div", "feedback-box");
    if (ui.feedbackState === "ok") {
      box.appendChild(el("span", "feedback-obrigado",
        "Registrado — ajuda o sistema a aprender. Memória da sessão, não avaliação de pessoas."));
      return box;
    }
    box.appendChild(el("span", "feedback-rotulo", "Isso ajudou? (opcional)"));
    const obs = document.createElement("input");
    obs.type = "text";
    obs.className = "feedback-obs";
    obs.placeholder = "observação (opcional)";
    const row = el("div", "feedback-row");
    [["ajudou", "Ajudou"], ["ajudou_parcialmente", "Em parte"], ["nao_ajudou", "Não ajudou"],
     ["criou_outro_problema", "Criou outro problema"], ["nao_sei", "Não sei"]].forEach(([id, rotulo]) => {
      const b = el("button", "feedback-pill", rotulo);
      b.onclick = () => {
        const fim = () => { ui.feedbackState = "ok"; if (lastPonto) render(lastINFO, lastPonto); };
        fetch("/api/capacidade-viva/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choice: id, observation: obs.value || null, action_id: ui.actionState })
        }).then(fim).catch(fim);
      };
      row.appendChild(b);
    });
    box.appendChild(row);
    box.appendChild(obs);
    return box;
  }

  /* Nota de cenário Capacidade Viva (QA/dev): tradução humana + menor
   * intervenção do motor real; detalhe técnico (ISF) só em modo dev. */
  function nodeCvNota(dados) {
    const av = dados.avaliacao || {};
    const isf = av.isf || {};
    const iv = av.intervencao || {};
    const box = el("div", "cv-nota");
    box.appendChild(el("span", "cv-nota-tag", "capacidade viva · demonstração"));
    box.appendChild(el("p", "cv-nota-humano", humanoDoEstado(isf.estado_geral, isf.praca_critica)));
    if (iv.label) {
      box.appendChild(el("p", "cv-nota-intervencao",
        "Menor intervenção: " + iv.label + (iv.reason ? " — " + iv.reason : "") +
        (iv.action && iv.action.indexOf("pausa") === 0 ? " · decisão humana, nunca automática" : "")));
    }
    if ((av.excecoes || {}).count > 0) {
      const e0 = av.excecoes.items[0];
      box.appendChild(el("p", "cv-nota-excecao",
        e0.title + (e0.order_id ? " · pedido " + e0.order_id : "") + " — verificar."));
    }
    if (QA_MODE && isf.por_praca) {
      box.appendChild(el("p", "cv-nota-dev",
        "ISF interno (dev): " + Object.values(isf.por_praca)
          .map((p) => p.praca + " " + (p.isf != null ? p.isf : "—") + " (" + p.estado + ")").join(" · ")));
    }
    return box;
  }

  function nodePill(vm) {
    if (vm.mode !== "foco") return null;
    const pill = el("div", "stage-pill");
    pill.appendChild(el("span", "pill-dot"));
    pill.appendChild(el("span", "pill-txt",
      "Atenção" + (vm.areaHint ? " · " + vm.areaHint : "") +
      (vm.alvoId ? " · " + rotuloPedido(vm.alvoId) : "")));
    return pill;
  }

  function nodeBanner(kind, texto) {
    const b = el("div", "stage-banner banner-" + kind);
    b.appendChild(el("span", "banner-dot"));
    b.appendChild(el("span", "banner-txt", texto));
    return b;
  }

  /* —— Palco desktop: constelação —— */
  function stageDesktop(vm, celulas, opts) {
    const constel = el("div", "constel");
    constel.appendChild(svgLigacoes(celulas, { frozen: opts.frozen, anchor: vm.mode === "foco" && !opts.frozen }));
    celulas.forEach((c) => {
      const wrap = el("div", "cell-wrap");
      wrap.style.left = c.x + "%";
      wrap.style.top = c.y + "%";
      wrap.appendChild(nodeCelula(c, true));
      constel.appendChild(wrap);
    });
    return constel;
  }

  /* —— Palco mobile: topologia vertical do HTML congelado —— */
  function svgFan(pontos, cls) {
    const svg = svgEl("svg", { class: "mfan" + (cls ? " " + cls : ""), viewBox: "0 0 100 20", preserveAspectRatio: "none" });
    pontos.forEach((p) => {
      const linha = svgEl("line", {
        x1: p[0], y1: p[1], x2: p[2], y2: p[3],
        stroke: p[4] || corLinhaBase(), "stroke-width": p[5] || 1
      });
      if (p[6]) { linha.setAttribute("stroke-dasharray", "4 6"); linha.setAttribute("class", "dosflow"); }
      svg.appendChild(linha);
    });
    return svg;
  }
  function stageMobile(vm, celulas, opts) {
    const por = {};
    celulas.forEach((c) => { por[c.id] = c; });
    const box = el("div", "mconstel");
    const pill = (c) => {
      const n = nodeCelula(c, false);
      n.classList.add("mcell-pill");
      return n;
    };
    const circ = (c) => {
      const n = nodeCelula(c, false);
      n.classList.add("mcell-circ", "msize-" + c.tone);
      return n;
    };
    if (vm.mode === "foco" && !opts.frozen && por[idDoNome(vm.areaHint)]) {
      /* Foco mobile: atenção dominante primeiro (composição mFoco do
       * congelado), periferia preservada no minimapa abaixo do cartão. */
      const dom = por[idDoNome(vm.areaHint)];
      const topo = el("div", "mfoco-area");
      topo.appendChild(pill(dom));
      box.appendChild(topo);
      box.appendChild(svgFan([[50, 0, 50, 18, "#E0A25A", 1.6, false]], "mfan-anchor"));
      return box;
    }
    box.appendChild(el("div", "mrow mrow-center")).appendChild(pill(por.caixa));
    box.appendChild(svgFan([
      [50, 0, 50, 6], [50, 6, 17, 20], [50, 6, 50, 20], [50, 6, 83, 20]
    ]));
    const meio = el("div", "mrow mrow-three");
    ["sushi", "quentes", "cozinha"].forEach((id) => {
      const slot = el("div", "mslot");
      slot.appendChild(circ(por[id]));
      meio.appendChild(slot);
    });
    box.appendChild(meio);
    const corDe = (id) => {
      const lig = montarLigacoes(celulas)[id + "-conferencia"];
      return lig ? [lig.c, lig.flow ? 2.4 : 1.6, !!lig.flow] : [corLinhaBase(), 1, false];
    };
    const [cS, wS, fS] = corDe("sushi");
    const [cQ, wQ, fQ] = corDe("quentes");
    const [cC, wC, fC] = corDe("cozinha");
    box.appendChild(svgFan([
      [17, 0, 50, 13, cS, wS, fS],
      [50, 0, 50, 13, cQ, wQ, fQ],
      [83, 0, 50, 13, cC, wC, fC],
      [50, 13, 50, 20, (fS || fQ || fC) ? "#C98A46" : corLinhaBase(), (fS || fQ || fC) ? 2 : 1, false]
    ]));
    box.appendChild(el("div", "mrow mrow-center")).appendChild(pill(por.conferencia));
    const ligCM = montarLigacoes(celulas)["conferencia-motoboy"];
    box.appendChild(svgFan([
      [50, 0, 50, 14, ligCM ? ligCM.c : corLinhaBase(), ligCM ? 1.6 : 1, !!(ligCM && ligCM.flow)]
    ], "mfan-short"));
    box.appendChild(el("div", "mrow mrow-center")).appendChild(pill(por.motoboy));
    return box;
  }
  function idDoNome(nome) {
    const d = CEL_DEF.find((x) => x.nome === nome);
    return d ? d.id : null;
  }
  function nodeMinimapa(celulas, domNome) {
    const box = el("div", "minimapa");
    box.appendChild(el("span", "minimapa-rotulo", "resto da operação"));
    celulas.forEach((c) => {
      const item = el("span", "minimapa-item" + (c.nome === domNome ? " is-atual" : ""));
      item.appendChild(el("span", "minimapa-dot"));
      item.appendChild(el("span", null, c.nome));
      box.appendChild(item);
    });
    return box;
  }

  /* ---------- RENDER ORGANISMO V3.3 ---------- */
  function render(INFO, ponto) {
    lastINFO = INFO;
    lastPonto = ponto;

    const vm = buildPresentation(INFO, ponto);
    const palco = $("palco");
    palco.innerHTML = "";
    palco.dataset.mode = vm.mode;
    document.body.dataset.mode = vm.mode;

    const tech = ui.techOverride ? window.V33_ADAPTER.mapearEstadoFonteV33(ui.techOverride) : null;
    const frozen = !!tech;

    const stage = el("section", "stage" + (frozen ? " is-frozen" : ""));
    const celulas = montarCelulas(vm, ponto);
    const cab = frozen
      ? { kicker: tech.label.toUpperCase(), accent: "tech", caption: tech.text, rotuloFonte: "última leitura visível como memória" }
      : cabecalhoDe(vm);
    stage.appendChild(nodeCaption(vm, cab));
    if (frozen) stage.appendChild(nodeBanner("tech", tech.text + " Última leitura permanece visível — nunca como estado atual."));

    /* Cenário Capacidade Viva ativo (QA/dev) — nota sob a legenda */
    if (ui.cvOverlay) {
      const dadosCv = cvCache.get("cvq:" + ui.cvOverlay);
      if (dadosCv && dadosCv.avaliacao) stage.appendChild(nodeCvNota(dadosCv));
    }

    const mobile = mqMobile.matches;
    stage.appendChild(mobile ? stageMobile(vm, celulas, { frozen }) : stageDesktop(vm, celulas, { frozen }));

    if (!frozen) {
      const pill = nodePill(vm);
      if (pill) stage.appendChild(pill);
      const focoPanel = nodeFocoPanel(vm, INFO, ponto);
      if (focoPanel) {
        if (mobile) focoPanel.classList.add("is-mobile");
        stage.appendChild(focoPanel);
        if (mobile) stage.appendChild(nodeMinimapa(celulas, vm.areaHint));
      }
    }
    palco.appendChild(stage);
    atualizarVivo(frozen ? tech : null);
  }

  function atualizarVivo(tech) {
    const nota = $("liveNote");
    if (!nota) return;
    if (tech) {
      nota.dataset.estado = "tech";
      nota.textContent = tech.label;
    } else {
      nota.dataset.estado = "demo";
      nota.textContent = fonteSimulada ? "demonstração" : "replay";
    }
  }

  /* Estado técnico sem janela nenhuma (boot/fonte não-ready): a topologia
   * continua presente — todas as células em leitura indisponível (tracejado),
   * banner técnico com o motivo. Nunca tela vazia, nunca erro cru no centro. */
  function renderEstadoFonte(pl) {
    const AD = window.V33_ADAPTER;
    const tech = AD.mapearEstadoFonteV33(pl.source_status, pl.source_motivo);
    const palco = $("palco");
    palco.innerHTML = "";
    document.body.dataset.mode = "calmo";

    /* Microcopy de PRODUÇÃO: sem jargão, sem comando de terminal. O detalhe
     * técnico completo (motivo, dica, desconhecidos) aparece só em modo dev. */
    const dois = (n) => String(n).padStart(2, "0");
    let horaUltima = null;
    if (pl.ultimo_confiavel && pl.ultimo_confiavel.gerado_em) {
      const d = new Date(pl.ultimo_confiavel.gerado_em);
      if (!isNaN(d)) horaUltima = dois(d.getHours()) + ":" + dois(d.getMinutes());
    }
    const stage = el("section", "stage is-frozen");
    const box = el("div", "stage-caption");
    box.appendChild(el("span", "stage-kicker accent-tech", tech.label.toUpperCase()));
    box.appendChild(el("p", "stage-caption-text",
      QA_MODE ? tech.text : "Ainda não estou recebendo dados da operação."));
    if (QA_MODE) {
      const detalhes = [];
      if (pl.source_motivo) detalhes.push("motivo: " + pl.source_motivo);
      if (pl.unknowns) {
        detalhes.push("desconhecidos declarados: " + pl.unknowns.conflitos + " em conflito, " +
          pl.unknowns.parciais + " parciais, " + pl.unknowns.suspeitos + " suspeitos");
      }
      if (pl.ultimo_confiavel) {
        detalhes.push("último estado confiável: " + pl.ultimo_confiavel.dia_local +
          " (" + pl.ultimo_confiavel.pedidos + " pedidos) · " + pl.ultimo_confiavel.aviso);
      }
      if (pl.dica) detalhes.push(pl.dica);
      box.appendChild(el("p", "stage-subnote",
        detalhes.length ? detalhes.join(" · ") : "estado técnico da fonte · não é tensão operacional"));
    } else {
      box.appendChild(el("p", "stage-subnote",
        "Acompanhe o fluxo diretamente enquanto a leitura é restabelecida." +
        (horaUltima ? " Última leitura às " + horaUltima + "." : "")));
    }
    stage.appendChild(box);
    stage.appendChild(nodeBanner("tech",
      QA_MODE ? tech.text
        : "Ainda não estou recebendo dados da operação." + (horaUltima ? " Última leitura às " + horaUltima + "." : "")));

    const celulas = CEL_DEF.map((d) => ({
      id: d.id, nome: d.nome, x: d.x, y: d.y, size: d.base,
      tone: "tech", estado: "sem leitura", info: "", motivo: "",
      marcas: { solid: 0, open: 2 }, pulse: false, halo: false, dim: false, cite: false,
      cor: "validacao"
    }));
    stage.appendChild(mqMobile.matches
      ? stageMobile({ mode: "calmo" }, celulas, { frozen: true })
      : stageDesktop({ mode: "calmo" }, celulas, { frozen: true }));
    palco.appendChild(stage);
    $("fonteDado").textContent = "Fonte: " + pl.source_status + " · técnico";
    atualizarVivo(tech);
  }

  /* ---------- Voz (demo) — composição do painel do congelado ---------- */
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
    /* Resposta: intents REAIS (copiloto.voice-intents) quando disponíveis;
     * ASR continua simulado e rotulado como demonstração. */
    const v = ui.voicePhase === "answer" && ui.voiceAnswer && ui.voiceAnswer.phase === "answer"
      ? Object.assign({}, M.voiceMock("answer"), ui.voiceAnswer)
      : M.voiceMock(ui.voicePhase);
    panel.hidden = false;
    panel.innerHTML = "";

    const mic = el("div", "voice-mic" + (v.phase === "fail" ? " is-off" : ""));
    mic.appendChild(el("span", "voice-mic-body"));
    mic.appendChild(el("span", "voice-mic-base"));
    if (v.phase === "listening") mic.appendChild(el("span", "voice-mic-pulse dospulse"));
    panel.appendChild(mic);

    const corpo = el("div", "voice-corpo");
    const faseTxt = {
      idle: "fale sobre a operação · demonstração",
      listening: "ouvindo você",
      transcript: "entendi assim",
      answer: "conclusão primeiro",
      ambiguity: "preciso de um detalhe",
      fail: "não consegui entender",
      done: "registrado"
    }[v.phase] || "voz · demonstração";
    corpo.appendChild(el("span", "voice-fase", faseTxt));
    if (v.phase === "transcript" || v.phase === "answer") {
      const perguntaMock = M.voiceMock("transcript").transcript;
      corpo.appendChild(el("p", "voice-pergunta", "“" + perguntaMock + "”"));
    }
    if (v.phase === "idle" || v.phase === "listening") {
      corpo.appendChild(el("p", "voice-resposta", "Não é gravação contínua. Toque encerra a escuta."));
    }
    if (v.phase === "answer") {
      corpo.appendChild(el("p", "voice-resposta", v.conclusion + " " + v.detail));
      ui.areaCite = v.areaCite || null;
      if (lastPonto) render(lastINFO, lastPonto);
    }
    if (v.phase === "ambiguity" || v.phase === "fail" || v.phase === "done") {
      corpo.appendChild(el("p", "voice-resposta", v.message));
    }

    const acts = el("div", "voice-acoes");
    const botao = (rotulo, cls, fn) => {
      const b = el("button", cls, rotulo);
      b.onclick = fn;
      acts.appendChild(b);
    };
    if (v.phase === "idle") {
      botao("Simular escuta", "voice-bt-main", () => {
        ui.voicePhase = "listening";
        renderVoice();
        setTimeout(() => {
          ui.voicePhase = "transcript";
          renderVoice();
          const pergunta = M.voiceMock("transcript").transcript;
          fetch("/api/inteligencia/voice?q=" + encodeURIComponent(pergunta))
            .then((r) => r.json())
            .then((d) => { ui.voiceAnswer = d; })
            .catch(() => { ui.voiceAnswer = null; })
            .finally(() => {
              setTimeout(() => {
                ui.voicePhase = "answer";
                renderVoice();
              }, 500);
            });
        }, 700);
      });
    }
    if (v.phase === "answer" && v.needsConfirm) {
      botao("Confirmar registro", "voice-bt-main", () => {
        ui.voicePhase = "done";
        renderVoice();
        setTimeout(() => {
          ui.voiceOpen = false;
          ui.voicePhase = "idle";
          ui.voiceAnswer = null;
          ui.areaCite = null;
          renderVoice();
          if (lastPonto) render(lastINFO, lastPonto);
        }, 900);
      });
      botao("Ambíguo", "voice-bt-ghost", () => { ui.voicePhase = "ambiguity"; renderVoice(); });
      botao("Falha de reconhecimento", "voice-bt-ghost", () => { ui.voicePhase = "fail"; renderVoice(); });
    }
    if (v.phase === "ambiguity" || v.phase === "fail" || v.phase === "done") {
      botao("Voltar à operação", "voice-bt-main", () => {
        ui.voiceOpen = false;
        ui.voicePhase = "idle";
        ui.areaCite = null;
        renderVoice();
        if (lastPonto) render(lastINFO, lastPonto);
      });
    }
    botao("Fechar", "voice-bt-ghost", () => {
      ui.voiceOpen = false;
      ui.voicePhase = "idle";
      ui.voiceAnswer = null;
      ui.areaCite = null;
      renderVoice();
      if (lastPonto) render(lastINFO, lastPonto);
    });
    corpo.appendChild(acts);
    panel.appendChild(corpo);
  }

  /* ---------- Fechamento de turno (demo) — cartão central do congelado ---------- */
  function renderClosing() {
    const panel = $("closingPanel");
    if (!ui.closingOpen) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    const M = window.V33_MOCKS;
    const step = ui.closingStep == null ? 0 : ui.closingStep;
    /* Fechamento REAL (copiloto.shift-closing sobre memória de turno da
     * sessão); mock só como fallback enquanto o motor responde. */
    const calmo = lastPonto && lastPonto.mode === "calmo" ? "1" : "0";
    const vivo = buscarVivo(
      "cl:" + step + ":" + calmo,
      "/api/inteligencia/closing?step=" + step + "&calm=" + calmo + "&q=1",
      null,
      () => renderClosing()
    );
    const c = vivo && !vivo.indisponivel
      ? Object.assign({}, M.closingMock(step), vivo)
      : M.closingMock(step);
    panel.hidden = false;
    panel.innerHTML = "";

    const head = el("div", "closing-head");
    head.appendChild(el("span", "closing-eye", "Fechamento do turno"));
    head.appendChild(el("span", "closing-tempo", (c.demoLabel || "demonstração") + " · " + c.timeHint));
    panel.appendChild(head);

    const acts = el("div", "closing-acoes");
    const botao = (rotulo, cls, fn) => {
      const b = el("button", cls, rotulo);
      b.onclick = fn;
      acts.appendChild(b);
    };
    if (step === 0) {
      panel.appendChild(el("h3", "closing-titulo", "O turno de hoje, em meia página."));
      panel.appendChild(el("p", "closing-body",
        c.summaryText || "Operação estável na maior parte do tempo. Picos pontuais de saída. Até dois minutos."));
      botao("Começar (1 de 2)", "closing-bt-main", () => { ui.closingStep = 1; renderClosing(); });
      botao("Pular", "closing-bt-text", () => { ui.closingOpen = false; ui.closingStep = null; renderClosing(); });
    } else if (step === 1 || step === 2) {
      if (!c.question) {
        panel.appendChild(el("h3", "closing-titulo", "Nenhuma pergunta necessária hoje."));
        panel.appendChild(el("p", "closing-body", "O resumo já cobre o turno. Bom descanso."));
        botao("Concluir", "closing-bt-main", () => { ui.closingOpen = false; ui.closingStep = null; renderClosing(); });
        panel.appendChild(acts);
        return;
      }
      panel.appendChild(el("span", "closing-num", "pergunta " + c.question.n));
      panel.appendChild(el("h3", "closing-titulo", c.question.text));
      if (c.transcript) {
        const tr = el("div", "closing-transcricao");
        tr.appendChild(el("span", "closing-tr-rotulo", "sua resposta · por áudio (demonstração)"));
        tr.appendChild(el("p", "closing-tr-txt", "“" + c.transcript + "”"));
        panel.appendChild(tr);
      }
      botao("Responder por áudio (demo)", "closing-bt-main", () => { ui.closingStep = step === 1 ? 2 : 3; renderClosing(); });
      botao("Não sei", "closing-bt-ghost", () => { ui.closingStep = step === 1 ? 2 : 3; renderClosing(); });
      botao("Pular", "closing-bt-text", () => { ui.closingStep = step === 1 ? 2 : 3; renderClosing(); });
    } else {
      panel.appendChild(el("h3", "closing-titulo", "Registrado. O turno pode se encerrar com calma."));
      panel.appendChild(el("p", "closing-body", "Transcrição de demonstração incluída no resumo."));
      botao("Concluir", "closing-bt-main", () => { ui.closingOpen = false; ui.closingStep = null; renderClosing(); });
    }
    panel.appendChild(acts);
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

    /* Configuração do turno — entrada mínima de DESENVOLVIMENTO (fora da
     * operação normal). Contagens por praça + flutuantes; NUNCA rastreia
     * pessoas individualmente. Alimenta os cenários de Capacidade Viva. */
    const catalogo = $("qaCatalog");
    const turnoBox = el("div", "qa-turno");
    turnoBox.appendChild(el("div", "qa-turno-titulo", "Turno (dev) · pessoas por praça · não rastreia indivíduos"));
    const grade = el("div", "qa-turno-grade");
    const salvo = turnoAtual();
    [["sushi", "Sushi"], ["quentes", "Quentes"], ["cozinha", "Cozinha"],
     ["conferencia", "Conf./Delivery"], ["caixa", "Caixa"], ["motoboy", "Entregas"],
     ["flutuantes", "Flutuantes"]].forEach(([k, rotulo]) => {
      const campo = el("label", "qa-turno-campo");
      campo.appendChild(el("span", "qa-turno-rotulo", rotulo));
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.placeholder = "—";
      if (salvo[k] != null) inp.value = salvo[k];
      inp.oninput = () => {
        const t = turnoAtual();
        if (inp.value === "") delete t[k]; else t[k] = Number(inp.value);
        try { localStorage.setItem("dosTurno01", JSON.stringify(t)); } catch (e) { /* sem storage */ }
        if (ui.cvOverlay) {
          cvCache.delete("cvq:" + ui.cvOverlay);
          buscarVivo("cvq:" + ui.cvOverlay, "/api/capacidade-viva/avaliar?" + paramsComTurno(CV_PARAMS[ui.cvOverlay] || ""));
        }
      };
      campo.appendChild(inp);
      grade.appendChild(campo);
    });
    turnoBox.appendChild(grade);
    catalogo.appendChild(turnoBox);
  }

  /* Parâmetros calibrados dos 20 cenários de Capacidade Viva (motor real
   * sobre fixtures demonstrativas; ver docs/CAPACIDADE_VIVA_V01.md). A base
   * "quentes=12&sushi=10&conferencia=8" deixa o fundo controlável para que o
   * elemento do cenário seja o protagonista. */
  const CTRL_CV = "quentes=12&sushi=10&conferencia=8";
  const CV_PARAMS = {
    controlavel: CTRL_CV,
    prep: CTRL_CV + "&when=prep",
    sushi: "sushi=5&quentes=12&conferencia=8",
    quentes: "quentes=4&env=2&sushi=10&conferencia=8",
    conferencia: "conferencia=2&env_conf=8&quentes=12&sushi=10",
    simples: CTRL_CV + "&pedidos=85",
    complexos: CTRL_CV + "&ex=complexos",
    antigo: CTRL_CV + "&ex=antigo",
    motoboy: CTRL_CV + "&ex=motoboy",
    alocado: CTRL_CV + "&ex=alocado",
    comanda: CTRL_CV + "&ex=comanda",
    pausa_nao: "quentes=4&sushi=10&conferencia=8",
    pausa_sel: "quentes=1&env=40&sushi=10&conferencia=8",
    pausa_geral: "quentes=1&env=40&sushi=10&conferencia=8&seletiva=0",
    conf_baixa: CTRL_CV + "&conf=baixa"
  };
  function turnoAtual() {
    try { return JSON.parse(localStorage.getItem("dosTurno01")) || {}; } catch (e) { return {}; }
  }
  function paramsComTurno(base) {
    const t = turnoAtual();
    const extras = ["sushi", "quentes", "cozinha", "conferencia", "caixa", "motoboy", "flutuantes"]
      .filter((k) => t[k] != null && t[k] !== "")
      .map((k) => k + "=" + encodeURIComponent(t[k]));
    if (!extras.length) return base;
    // turno do drawer dev sobrepõe os defaults do cenário (mesma chave vence a última)
    const q = new URLSearchParams(base);
    for (const kv of extras) { const [k, v] = kv.split("="); q.set(k, v); }
    return q.toString();
  }

  function applyQa(item) {
    ui.techOverride = null;
    ui.voiceOpen = false;
    ui.closingOpen = false;
    ui.cvOverlay = null;
    renderVoice();
    renderClosing();

    if (item.cv) {
      ui.cvOverlay = item.cv;
      const q = paramsComTurno(CV_PARAMS[item.cv] || "");
      buscarVivo("cvq:" + item.cv, "/api/capacidade-viva/avaliar?" + q);
    }

    if (item.mode === "tech") {
      ui.techOverride = item.status;
      if (lastPonto) render(lastINFO, lastPonto);
      else renderEstadoFonte({ source_status: item.status, source_motivo: "demonstração de estado técnico (QA)" });
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
    const novoEstadoAcao = item.mock === "action" ? item.state : null;
    if (novoEstadoAcao && novoEstadoAcao !== ui.actionState) {
      ui.actionSince = Date.now();
      ui.feedbackState = null;
    }
    ui.actionState = novoEstadoAcao;
    if (!novoEstadoAcao) ui.actionSince = null;

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
    // DEFAULT: o produto abre em Calmo — de preferência um Calmo VIVO
    // (pedidos em andamento), nunca tela morta; senão o primeiro Calmo.
    i0 = timeline.findIndex((p) => p.mode === "calmo" && p.emand > 0);
    if (i0 < 0) i0 = timeline.findIndex((p) => p.mode === "calmo");
    if (i0 < 0) i0 = 0;
    vel = 10;
    btVel.textContent = "10×";
    mostrar();
    $("replay").hidden = false;
  }

  mqMobile.addEventListener("change", () => {
    if (lastPonto) render(lastINFO, lastPonto);
  });

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
    fonteSimulada = J.meta.fonte === "simulada";
    rotuloJanela = rotuloFonte || "Janela real " + (J.meta.diaBase ? diasRotulo[0] : "01/07");
    $("fonteDado").textContent =
      rotuloJanela +
      ", " +
      J.meta.pedidos +
      " pedidos" +
      (fonteSimulada ? ", dados sintéticos (não é operação real)" : ", itens reais por pedido");
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
        if (!r.ok) throw new Error("janela_real_ausente");
        return r.json();
      })
    ])
      .then(([seed, J]) => {
        rodarJanela(seed, J, null);
        if (avisoFlag) $("fonteDado").textContent += " · " + avisoFlag;
      })
      .catch((e) => {
        renderEstadoFonte({
          source_status: "stopped",
          source_motivo: e.message,
          dica: "janela real fora do Git — gere com node tools/gerar_janela_v1.js (exige data/raw) ou use a fonte simulada (padrão do worktree limpo)"
        });
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
