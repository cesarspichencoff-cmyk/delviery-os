/* ============================================================================
 * Servidor da Interface V1 · Copiloto V3.3. Zero dependências.
 * ----------------------------------------------------------------------------
 * Serve a RAIZ do repo (o app carrega o cérebro real de src/perfil-delivery/
 * e os dados de data/ — nada é duplicado dentro da interface) e expõe:
 *   GET /api/config → fonte efetiva (flag DELIVERYOS_LIVE_SOURCE + realidade)
 *   GET /api/fonte  → payload do adaptador D4A sobre cenário simulado
 *                     ?cenario=foco|ambiente (cenários de volume, motor real)
 *                     ou id do catálogo certificado 3A · ?seed=<seed>
 *
 * EXECUÇÃO REPRODUTÍVEL (correção da "janela real não encontrada"):
 * data/generated/v1_janela_real.json é DADO REAL e fica fora do Git — num
 * worktree limpo ele NÃO existe, e tools/gerar_janela_v1.js também não roda
 * (depende de data/raw/** e node_modules/xlsx, ambos fora do Git). Por isso:
 *   - flag ausente + janela real presente  → fonte atual (comportamento
 *     histórico preservado, byte-idêntico);
 *   - flag ausente + janela real AUSENTE   → simulador certificado, com
 *     fallback REGISTRADO no /api/config e rótulo de demonstração na UI
 *     (dado sintético nunca aparece como real);
 *   - flag explícita "current"             → fonte atual sempre (se faltar a
 *     janela, a interface mostra o estado técnico com a instrução);
 *   - flag explícita "simulator"           → simulador sempre.
 * Uso: node tools/servir_v1.js  →  http://localhost:5179/
 *      (porta alternativa: PORT=5199 node tools/servir_v1.js)
 * ==========================================================================*/
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const DIR = path.join(__dirname, "..");
const PORT = parseInt(process.env.PORT || "5179", 10);
/* Bind seguro por padrão: localhost apenas. Este servidor serve a RAIZ do repo
 * (src/, docs/, data/) por design — expô-lo em todas as interfaces de rede
 * (0.0.0.0) deixa o repositório inteiro legível por qualquer um na mesma LAN.
 * Para testar no celular na rede local, ligue explicitamente: HOST=0.0.0.0.
 * (Auditoria 2026-07-20 — endurecimento P2, capacidade de celular preservada
 * via opt-in.) */
const HOST = process.env.HOST || "127.0.0.1";
const TZ = "America/Sao_Paulo";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".jsonl": "application/json", ".css": "text/css", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

const { executarCenario } = require("./live/simulator/executor");
const { CENARIO_AMBIENTE, CENARIO_FOCO } = require("./live/simulator/investigacao_volume/cenarios_volume");
const { montarPayloadInterface } = require(path.join(DIR, "src", "live", "interface", "adaptador.js"));
const { selecionarFonteDoAmbiente } = require(path.join(DIR, "src", "live", "interface", "fonte.js"));

const JANELA_REAL = path.join(DIR, "data", "generated", "v1_janela_real.json");

/* ---------------------------------------------------------------------------
 * Fase 2E.1 — Capacidade Viva human-v2 em MODO SOMBRA (ver docs/CAPACIDADE_VIVA_SHADOW.md).
 * Roda em paralelo ao Copiloto, só para leitura/registro técnico. NUNCA
 * altera o payload de /api/fonte nem qualquer outra resposta HTTP — é
 * sempre um efeito colateral disparado DEPOIS de `json(...)` já ter
 * respondido ao navegador, e sempre dentro de try/catch que nunca propaga.
 * ------------------------------------------------------------------------- */
const ShadowFlags = require(path.join(DIR, "src", "capacidade-viva", "shadow", "flags.js"));
const ShadowConfig = require(path.join(DIR, "src", "capacidade-viva", "shadow", "config.js"));
const ShadowAdapter = require(path.join(DIR, "src", "capacidade-viva", "shadow", "adapter.js"));
const { createObservationLog } = require(path.join(DIR, "src", "capacidade-viva", "shadow", "observation-log.js"));

const shadowLog = createObservationLog();
let SEED_ITENS_CACHE = null;
function seedItensCarregado() {
  if (SEED_ITENS_CACHE) return SEED_ITENS_CACHE;
  try {
    const seed = require(path.join(DIR, "data", "cardapio_knowledge_seed.json"));
    SEED_ITENS_CACHE = Array.isArray(seed.itens) ? seed.itens : [];
  } catch (e) {
    SEED_ITENS_CACHE = [];
  }
  return SEED_ITENS_CACHE;
}

/**
 * Roda a leitura sombra sobre o MESMO payload já enviado ao operador — nunca
 * o altera, nunca é aguardada pela resposta HTTP (chamar sempre depois de
 * `json(payload)`). Fail-safe por construção (§9): qualquer problema vira
 * registro no canal técnico, nunca uma exceção, nunca pressão operacional.
 */
function rodarLeituraSombra(payload) {
  if (!ShadowFlags.isShadowEnabled()) return;
  try {
    if (!payload || !payload.janela) return; // sem janela pronta, nada a observar ainda
    const shadowConfig = ShadowConfig.loadShadowConfig();
    if (!shadowConfig.ready) {
      shadowLog.registerFailure(shadowConfig.error || "config_nao_pronta", shadowConfig.error_detail);
      return;
    }
    const janela = payload.janela;
    const resultado = ShadowAdapter.observeSnapshot({
      NIGHT: janela.NIGHT,
      rows: janela.rows,
      seedItens: seedItensCarregado(),
      t: janela.T1,
      sourceStatus: payload.source_status,
      contextoOperacional: janela.meta ? janela.meta.dia_local : null,
      shadowConfig
    });
    if (resultado.ok) {
      shadowLog.register(resultado.observation);
    } else {
      shadowLog.registerFailure(resultado.error, resultado.detail);
    }
  } catch (e) {
    try { shadowLog.registerFailure("excecao_nao_tratada", String((e && e.message) || e)); } catch (_) { /* nunca propagar */ }
  }
}

/* Cenários de volume (motor real produz Calmo→Ambiente→Foco legitimamente —
 * ver docs/preloja/Investigacao_Cenarios_Volume_Ambiente_Foco_V0.md). */
const CENARIOS_VOLUME = { ambiente: CENARIO_AMBIENTE, foco: CENARIO_FOCO };

function selecaoEfetiva() {
  const selecao = selecionarFonteDoAmbiente(process.env);
  const temJanelaReal = fs.existsSync(JANELA_REAL);
  if (selecao.flag_bruta === "current") return { ...selecao, fonte: "current" };
  if (selecao.fonte === "simulator") return selecao;
  if (temJanelaReal) return selecao; // fonte atual, comportamento histórico
  return {
    ...selecao,
    fonte: "simulator",
    fallback: "janela_real_ausente_usando_simulador_rotulado"
  };
}

function payloadDaFonte(query) {
  const nome = query.get("cenario") || "foco";
  const cenario = CENARIOS_VOLUME[nome] || nome; // objeto (volume) ou id do catálogo 3A
  const r = executarCenario({ cenario, seed: query.get("seed") || "copiloto-v33", storeTimeZone: TZ });
  /* ?estado= demonstra degradação HONESTA (mesma semântica do servir_d4a):
   * o snapshot real do cenário vira "último confiável" datado — nunca janela
   * atual. Fora de ready a interface mostra o estado técnico, nunca Calmo. */
  const estadoForcado = query.get("estado");
  if (estadoForcado && estadoForcado !== "ready") {
    const forca = {
      initializing: { inicializando: true, snapshot: null },
      replaying: { replayStatus: { em_andamento: true, eventos_relidos: 0 } },
      failed: { erro: new Error("falha_demonstracao"), snapshot: null },
      stopped: { parada: true, snapshot: null },
      degraded: { degradedState: "degradacao_demonstracao" },
      stale: { degradedState: "fonte_atrasada_demonstracao" },
      disconnected: { degradedState: "conexao_perdida_demonstracao" }
    }[estadoForcado] || {};
    return montarPayloadInterface(Object.assign({
      snapshot: r.snapshot, storeTimeZone: TZ, origem: "simulator",
      agoraIso: r.snapshot.gerado_em
    }, forca));
  }
  return montarPayloadInterface({
    snapshot: r.snapshot, storeTimeZone: TZ, origem: "simulator",
    replayStatus: { em_andamento: false, ultimo: r.replay }, agoraIso: r.snapshot.gerado_em
  });
}

function lerBody(req) {
  return new Promise((resolve, reject) => {
    let dados = "";
    req.on("data", (c) => { dados += c; if (dados.length > 1e6) req.destroy(); });
    req.on("end", () => resolve(dados));
    req.on("error", reject);
  });
}

/* ---------------------------------------------------------------------------
 * Fase 2C — Capacidade Viva conectada aos SINAIS REAIS do motor/fonte.
 * Decisão de honestidade documentada: o ISF completo exige complexidade por
 * item, e a classificação do cardápio real TATÁ não está fechada (limitação
 * V0.1). Por isso a leitura VIVA usa os DEGRAUS que o motor já produziu
 * (sev 0..3 → controlavel/atencao/proximo_limite/acima_capacidade) + exceções
 * derivadas de carimbos reais — nunca uma carga ponderada inventada. O ISF
 * numérico com complexidade permanece demonstrativo (/avaliar, fixtures).
 * ------------------------------------------------------------------------- */
const ORDEM_ESTADOS_CV = ["controlavel", "atencao", "proximo_limite", "acima_capacidade"];
const ESTADO_POR_SEV = { 0: "controlavel", 1: "atencao", 2: "proximo_limite", 3: "acima_capacidade" };

const COPY_RECUPERACAO = {
  recuperacao_liquida: "A praça voltou ao ritmo sem criar nova pressão.",
  melhora_parcial: "A fila diminuiu, mas ainda exige atenção.",
  sem_resultado: "A ação não produziu o efeito esperado.",
  deslocou_problema: "Uma praça melhorou, mas outra começou a pressionar.",
  dados_insuficientes: "Ainda não há leitura suficiente para avaliar o resultado.",
  acao_nao_executada: "A ação não chegou a ser executada."
};

function isfDeDegraus(pracas, confianca) {
  const por = {};
  for (const [praca, info] of Object.entries(pracas || {})) {
    const estado = info.estado || ESTADO_POR_SEV[info.sev] || "controlavel";
    por[praca] = {
      praca, estado,
      isf: null, // sem complexidade de item não existe ISF numérico honesto
      origem: "degrau_do_motor",
      n: info.n != null ? info.n : null,
      not_ranking: true,
      explanation: praca + ": " + estado.replace(/_/g, " ") + " (degrau do motor)"
    };
  }
  let critica = null;
  for (const row of Object.values(por)) {
    if (!critica || ORDEM_ESTADOS_CV.indexOf(row.estado) > ORDEM_ESTADOS_CV.indexOf(critica.estado)) critica = row;
  }
  return {
    schema_version: "0.1-degrau",
    por_praca: por,
    praca_critica: critica ? critica.praca : null,
    estado_geral: critica ? critica.estado : "insufficient",
    confidence: confianca || "media",
    insufficient_data: Object.keys(por).length === 0,
    fonte_isf: "degraus_do_motor_sem_complexidade_de_item",
    temporal: { tags: [] },
    not_employee_score: true
  };
}

const FEEDBACKS_SESSAO = []; // memória da sessão do servidor — NÃO é persistência de produção

const servidor = http.createServer(async (req, res) => {
  const [rota, qs] = req.url.split("?");
  const query = new URLSearchParams(qs || "");
  const json = (obj, code) => { res.writeHead(code || 200, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  try {
    if (rota === "/") { res.writeHead(302, { Location: "/app-v1/index.html" }); res.end(); return; }
    if (rota === "/api/config") { json(selecaoEfetiva()); return; }
    if (rota === "/api/fonte") {
      const sel = selecaoEfetiva();
      if (sel.fonte !== "simulator") { json({ erro: "fonte_simulada_desligada", selecao: sel }, 409); return; }
      const payload = payloadDaFonte(query);
      json(payload);
      // Efeito colateral, sempre DEPOIS da resposta já enviada — modo sombra
      // nunca atrasa nem altera o que o navegador recebe (§3/§8).
      rodarLeituraSombra(payload);
      return;
    }
    /* Fase 2B — inteligência e Capacidade Viva (sem redesenhar UI) */
    if (rota === "/api/inteligencia/forecast") {
      const intel = require(path.join(DIR, "src", "live", "interface", "adaptador-inteligencia.js"));
      const hist = String(query.get("hist") || "2,3,4,5,6,7,8,9,10,11,12")
        .split(",").map(Number).filter((n) => !Number.isNaN(n));
      json(intel.buildForecastForArea({
        area: query.get("area") || "conferencia",
        queue_history: hist,
        horizon_min: Number(query.get("horizon") || 15),
        demo: query.get("demo") === "1"
      }));
      return;
    }
    if (rota === "/api/inteligencia/action") {
      const intel = require(path.join(DIR, "src", "live", "interface", "adaptador-inteligencia.js"));
      const pb = intel.suggestPlaybookForArea(query.get("area") || "conferencia");
      json(intel.adaptActionTrack({
        stateId: query.get("state") || "recomendacao",
        playbook: pb,
        from_engine: true
      }));
      return;
    }
    if (rota === "/api/inteligencia/closing") {
      const intel = require(path.join(DIR, "src", "live", "interface", "adaptador-inteligencia.js"));
      const mem = intel.newShiftMemory({
        pressures: query.get("calm") === "1" ? [] : [{ area: "conferencia" }],
        unexplained: query.get("q") === "1"
          ? [{ id: "u1", observation: "queda sem causa", unknown: "ação manual?", question: "Houve apoio não registrado?", importance: 0.8, info_gain: 0.8 }]
          : []
      });
      json(intel.adaptClosing(mem, Number(query.get("step") || 0)));
      return;
    }
    if (rota === "/api/inteligencia/voice") {
      const intel = require(path.join(DIR, "src", "live", "interface", "adaptador-inteligencia.js"));
      json(intel.adaptVoiceIntent(query.get("q") || "Como está a Conferência?", {
        focus_conclusion: "Conferência sob leitura atual.",
        focus_detail: "Sinais no organismo.",
        focus_area: "Conferência"
      }));
      return;
    }
    if (rota === "/api/capacidade-viva/avaliar") {
      const CV = require(path.join(DIR, "src", "capacidade-viva"));
      const demo = require(path.join(DIR, "data", "capacidade-viva", "fixtures", "items-demo.json"));
      const items = (demo.items || []).filter((it) => it.praca === (query.get("praca") || "sushi"));
      const EX_DEMO = {
        motoboy: [{ id: "D-1", motoboy_esperando: true, age_min: 12, pronto: true }],
        comanda: [{ id: "D-4", comanda_ausente: true, age_min: 6 }],
        alocado: [{ id: "D-3", entregador_alocado_sem_retirada: true, age_min: 9 }],
        antigo: [{ id: "D-2", age_min: 55 }]
      };
      const config = CV.loadDefaultConfig();
      if (query.get("seletiva") === "0") {
        config.pausa = Object.assign({}, config.pausa, { seletiva_antes_geral: false });
      }
      const av = CV.avaliar({
        config,
        turno: {
          equipe: {
            sushi: Number(query.get("sushi") || 8),
            quentes: Number(query.get("quentes") || 3),
            conferencia: Number(query.get("conferencia") || 5),
            caixa: Number(query.get("caixa") || 3),
            cozinha: Number(query.get("cozinha") || 2),
            motoboy: Number(query.get("motoboy") || 4),
            flutuantes: Number(query.get("flutuantes") || 1)
          }
        },
        por_praca: {
          sushi: { items: items.length ? items : demo.items.filter((i) => i.praca === "sushi"), envelhecimento: Number(query.get("env_sushi") || 0) },
          quentes: { items: demo.items.filter((i) => i.praca === "quentes"), envelhecimento: Number(query.get("env") || 0) },
          conferencia: { items: demo.items.filter((i) => i.praca === "conferencia"), envelhecimento: Number(query.get("env_conf") || 0) }
        },
        n_pedidos: Number(query.get("pedidos") || 45),
        when: query.get("when") === "prep" ? "2026-07-17T18:10:00" : undefined,
        orders: EX_DEMO[query.get("ex")] || [],
        praca_congestionada_complexa: query.get("ex") === "complexos" ? "quentes" : undefined,
        confianca: query.get("conf") || "media"
      });
      // ORDEM DE VERDADE: confiança insuficiente bloqueia recomendação
      if ((query.get("conf") || "media") === "baixa") {
        av.intervencao = {
          action: "observar", label: "Observar",
          reason: "Não tenho leitura suficiente para recomendar.",
          bloqueio_confianca: true, confidence: "baixa",
          auto_apply: false, requires_human_confirmation: true
        };
        av.mode_hint = "technical_or_unknown";
      }
      json({ avaliacao: av, v33: CV.toV33ViewHints(av), simulated_fixtures: true });
      return;
    }
    /* Fase 2C — leitura VIVA: exceções + menor intervenção dos motores REAIS
     * da Capacidade Viva sobre degraus reais do motor e carimbos reais dos
     * pedidos (nunca complexidade inventada; ver bloco de honestidade acima). */
    if (rota === "/api/capacidade-viva/leitura" && req.method === "POST") {
      const CV = require(path.join(DIR, "src", "capacidade-viva"));
      const body = JSON.parse((await lerBody(req)) || "{}");
      const config = CV.loadDefaultConfig();
      const confianca = body.confianca || "media";
      const isf = isfDeDegraus(body.pracas, confianca);
      const excecoes = CV.detectarExcecoes({
        orders: body.orders || [], config, source: body.source || {}
      });
      let intervencao;
      if (confianca === "baixa") {
        intervencao = {
          action: "observar", label: "Observar",
          reason: "Não tenho leitura suficiente para recomendar.",
          bloqueio_confianca: true, confidence: "baixa",
          auto_apply: false, requires_human_confirmation: true
        };
      } else {
        intervencao = CV.sugerirMenorIntervencao({ isf, excecoes, config });
      }
      json({
        isf, excecoes, intervencao,
        base: "degraus_do_motor + carimbos_reais_dos_pedidos",
        complexidade_itens: "nao_avaliada_v01"
      });
      return;
    }
    /* Recuperação Líquida: classificador REAL sobre antes/depois DEMONSTRATIVOS
     * (não há ISF vivo antes/depois até a calibração do cardápio). */
    if (rota === "/api/capacidade-viva/recuperacao") {
      const CV = require(path.join(DIR, "src", "capacidade-viva"));
      const antes = {
        praca_critica: "quentes",
        por_praca: { quentes: { praca: "quentes", estado: "acima_capacidade", isf: 1.4 } },
        confidence: "media"
      };
      const CASOS = {
        liquida: {
          after: { praca_critica: "quentes", por_praca: { quentes: { praca: "quentes", estado: "controlavel", isf: 0.5 } }, signals: { fila_parou_crescer: true, erros_nao_aumentaram: true }, confidence: "media" },
          elapsed: 12
        },
        parcial: {
          after: { praca_critica: "quentes", por_praca: { quentes: { praca: "quentes", estado: "atencao", isf: 0.9 } }, signals: { fila_parou_crescer: true, erros_nao_aumentaram: true }, confidence: "media" },
          elapsed: 12
        },
        sem: {
          after: { praca_critica: "quentes", por_praca: { quentes: { praca: "quentes", estado: "acima_capacidade", isf: 1.45 } }, signals: {}, confidence: "media" },
          elapsed: 14
        },
        deslocou: {
          after: { praca_critica: "sushi", por_praca: { quentes: { praca: "quentes", estado: "atencao", isf: 0.8 }, sushi: { praca: "sushi", estado: "acima_capacidade", isf: 1.5 } }, signals: { erros_nao_aumentaram: true }, confidence: "media" },
          elapsed: 12
        },
        insuficiente: { after: { insufficient_data: true, confidence: "baixa" }, elapsed: 8 },
        nao_executada: { executed: false, after: null, elapsed: 0 }
      };
      const c = CASOS[query.get("caso") || "liquida"] || CASOS.liquida;
      const r = CV.classificarRecuperacao({
        before: antes, after: c.after,
        executed: c.executed !== false,
        elapsed_min: c.elapsed,
        config: CV.loadDefaultConfig()
      });
      json(Object.assign({}, r, {
        copy: COPY_RECUPERACAO[r.outcome] || r.explanation,
        simulated_scenario: true,
        engine: "capacidade-viva.recuperacao"
      }));
      return;
    }
    /* Feedback humano — memória da sessão, nunca persistência de produção */
    if (rota === "/api/capacidade-viva/feedback" && req.method === "POST") {
      const CV = require(path.join(DIR, "src", "capacidade-viva"));
      const body = JSON.parse((await lerBody(req)) || "{}");
      const r = CV.registrarFeedback(body);
      if (r.ok) FEEDBACKS_SESSAO.push(r.feedback);
      json(Object.assign({}, r, {
        total_sessao: FEEDBACKS_SESSAO.length,
        persistence: "memoria_da_sessao_do_servidor"
      }), r.ok ? 200 : 400);
      return;
    }
    const p = decodeURIComponent(rota);
    const f = path.join(DIR, p);
    if (!f.startsWith(DIR)) { res.writeHead(403); res.end("403"); return; }
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); res.end("404"); return; }
      // Cache-Control: no-store — arquivo servido em dev muda a cada iteração;
      // sem isso o navegador pode reter uma versão antiga (app.js/style.css)
      // e a UI parece "não atualizar" mesmo com o servidor correto no ar.
      res.writeHead(200, {
        "Content-Type": types[path.extname(f)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      res.end(d);
    });
  } catch (erro) {
    json(montarPayloadInterface({
      snapshot: null, storeTimeZone: TZ, origem: "simulator", erro,
      agoraIso: new Date().toISOString()
    }), 500);
  }
});

/* Nunca falhar em silêncio: se a porta já estiver ocupada (ex.: um servidor
 * órfão de OUTRO worktree/repo ainda rodando), o processo padrão do Node
 * simplesmente morre sem explicação — e quem abre o navegador continua
 * vendo o conteúdo antigo do processo antigo, sem nenhum sinal de erro.
 * Isso já causou confusão real: um `servir_v1.js` de outro checkout ficou
 * preso na porta 5179 e o app.js atual nunca chegou a ser servido. */
servidor.on("error", (erro) => {
  if (erro.code === "EADDRINUSE") {
    console.error(
      "\nERRO: porta " + PORT + " já está em uso por outro processo.\n" +
      "Isso costuma ser um servidor antigo (talvez de outro worktree/repo) ainda rodando.\n" +
      "Windows:  netstat -ano | findstr :" + PORT + "   (pega o PID)  →  taskkill /PID <pid> /F\n" +
      "Ou rode noutra porta:  PORT=5199 node tools/servir_v1.js\n"
    );
    process.exit(1);
  }
  throw erro;
});

servidor.listen(PORT, HOST, () => {
  const sel = selecaoEfetiva();
  const naLan = HOST === "0.0.0.0";
  const ips = naLan
    ? [].concat(...Object.values(os.networkInterfaces())).filter(i => i && i.family === "IPv4" && !i.internal).map(i => i.address)
    : [];
  console.log("Copiloto V3.3: http://localhost:" + PORT + "/  fonte=" + sel.fonte +
    (sel.fallback ? " (" + sel.fallback + ")" : "") +
    (naLan && ips.length ? "  ·  no celular: http://" + ips[0] + ":" + PORT + "/" : "") +
    (!naLan ? "  ·  (só localhost — para celular: HOST=0.0.0.0 node tools/servir_v1.js)" : ""));
});

