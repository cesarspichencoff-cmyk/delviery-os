/**
 * Bloco 4B4 — adapter semântico Operação Viva -> Conference Brain.
 *
 * O risco registrado desde a forense é o de um mapeamento que parece certo e
 * mente: as duas pontas têm nove dimensões cada e elas descrevem conceitos
 * diferentes. Por isso a maior parte deste gate não prova o que o adapter
 * PRODUZ — prova o que ele se recusa a produzir, e prova que a recusa está
 * declarada em vez de esquecida.
 *
 * As projeções usadas aqui saem de `projetar()` de verdade, a partir de
 * envelopes de evento reais. Um fixture escrito à mão provaria que o adapter
 * lê o objeto que eu imaginei; só a projeção de verdade prova que ele lê a que
 * o HEAD produz.
 */

import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { projetar, JANELAS } from "./projections/operacao-viva";
import type { Projecao } from "./projections/operacao-viva";
import type { EventEnvelope, EventType, SourceMode } from "./contracts/event-catalog";

const req = createRequire(join(process.cwd(), "package.json"));
const CB = (m: string): Record<string, unknown> =>
  req(join(process.cwd(), "src", "conference-brain", m)) as Record<string, unknown>;

let passed = 0;
const failures: string[] = [];
const pend: Promise<void>[] = [];
function teste(nome: string, fn: () => Promise<void> | void): void {
  pend.push(
    Promise.resolve().then(fn).then(
      () => {
        passed += 1;
      },
      (e: unknown) => {
        failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
      },
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Superfícies
 * ------------------------------------------------------------------ */

interface Classificado {
  valor: unknown;
  classificacao: string;
}
interface ViagemAdaptada {
  identidade: { trip_id: string | null; unit_id: string | null };
  observado: {
    ultimo_fato_em: string | null;
    ultima_posicao_em: string | null;
    ocorrencias_abertas: number | null;
    source_mode: string | null;
  };
  inferido: { frescor: string | null; expira_em: string | null; expirado: boolean | null };
  evidencia: { event_ids: string[] };
}
interface Adaptado {
  adapter_version: string;
  regra_ref: string;
  lido_em: string | null;
  escopo: { unit_id: string; source_mode: string } | null;
  orders: unknown[];
  orders_ausentes_porque: string;
  signals: {
    ordersFound: number;
    criticalFieldsMissing: readonly string[];
    operacao_viva: Record<string, unknown>;
  };
  health: { state: string; reason: string; reasons: readonly string[] };
  contexto: {
    janelas: Record<string, number> | null;
    dimensoes: Record<string, Classificado>;
    viagens: ViagemAdaptada[];
  } | null;
  procedencia: {
    projection_version: string | null;
    calculada_em: string | null;
    cursor: { event_id: string; occurred_at: string } | null;
    quarentena: unknown[];
    politica_fora_de_ordem: string;
  } | null;
  recusas: { pii: readonly string[]; identidade_de_pedido: readonly string[] };
}
interface MapaEntrada {
  campo: string;
  classificacao: string;
  destino: string | null;
  motivo: string;
}

const A = CB("ingestion/operacao-viva-adapter") as {
  ADAPTER_VERSION: string;
  REGRA_MAPEAMENTO: { ref: string; mode: string; params: Record<string, unknown> };
  CLASSIFICACAO: Record<string, string>;
  CLASSIFICACAO_LIST: readonly string[];
  MAPA_SEMANTICO: readonly MapaEntrada[];
  DIMENSOES_DO_BRAIN_NAO_ALIMENTADAS: readonly { dimensao: string; motivo: string }[];
  CAMPOS_CRITICOS_AUSENTES: readonly string[];
  SAUDE_POR_INTEGRIDADE: Record<string, { state: string; reason: string }>;
  RAZAO_PERMANENTE: string;
  adaptarProjecao: (p: unknown, o: Record<string, unknown>) => Adaptado;
  criarFetchOrders: (o: Record<string, unknown>) => () => Promise<Adaptado>;
  runIdDe: (u: string, m: string) => string;
};

const { createStore } = CB("storage/store") as {
  createStore: (o: { dir: string }) => {
    put: (t: string, r: Record<string, unknown>) => { ok: boolean };
    all: (t: string) => Record<string, unknown>[];
    count: (t: string) => number;
  };
};
const { createLiveObserver } = CB("live/observer") as {
  createLiveObserver: (o: Record<string, unknown>) => {
    runCycle: () => Promise<Record<string, unknown>>;
  };
};
const { LIVE_SOURCE_HEALTH } = CB("contracts/live-states") as {
  LIVE_SOURCE_HEALTH: Record<string, string>;
};
const { mayAffirmOperationalLoad } = CB("live/health") as {
  mayAffirmOperationalLoad: (s: string) => boolean;
};

/* ------------------------------------------------------------------ *
 * Fixtures — eventos reais, projeção real
 * ------------------------------------------------------------------ */

const T0 = "2026-07-31T12:00:00.000Z";
const LIDO_EM = "2026-07-31T12:01:00.000Z";

let seq = 0;
function ev(
  tipo: EventType,
  trip: string,
  em: string,
  extra: Partial<EventEnvelope> = {},
): EventEnvelope {
  seq += 1;
  return {
    event_id: `e-${String(seq).padStart(3, "0")}`,
    event_type: tipo,
    event_version: "entregas@1.0.0",
    unit_id: "u-tata-centro",
    trip_id: trip,
    device_id: "dev-9",
    occurred_at: em,
    origin: "device",
    source_mode: "real",
    idempotency_key: `k-${String(seq).padStart(3, "0")}`,
    payload: {},
    ...extra,
  };
}

/** Uma viagem em rota, com posição fresca; outra criada e sem posição nenhuma. */
function eventosBase(modo: SourceMode = "real"): EventEnvelope[] {
  seq = 0;
  const m = { source_mode: modo };
  return [
    ev("trip_created", "t-alfa", "2026-07-31T11:58:00.000Z", m),
    ev("trip_started", "t-alfa", "2026-07-31T11:59:00.000Z", m),
    ev("gps_batch_received", "t-alfa", "2026-07-31T12:00:30.000Z", m),
    ev("occurrence_created", "t-alfa", "2026-07-31T12:00:40.000Z", m),
    ev("trip_created", "t-beta", "2026-07-31T11:59:30.000Z", m),
  ];
}

function projecaoDe(eventos: EventEnvelope[], agora: string, modo: SourceMode = "real"): Projecao {
  return projetar(eventos, {
    agora: new Date(agora),
    unit_id: "u-tata-centro",
    source_mode: modo,
    capacidade_maxima: undefined,
  });
}

const OPCOES = { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS };

/** As nove dimensões de PEDIDO do Brain — nenhuma pode aparecer na saída. */
const DIMENSOES_DE_PEDIDO = [
  "layout",
  "visual",
  "order_state",
  "readiness",
  "courier",
  "dispatch",
  "completion",
  "fulfillment",
  "store",
];

/* ================================================================== *
 * 1 — observação direta mapeada corretamente
 * ================================================================== */

teste("1 · observação direta atravessa verbatim, no lugar certo", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, OPCOES);

  assert.equal(r.escopo?.unit_id, "u-tata-centro", "unit_id não atravessou");
  assert.equal(r.escopo?.source_mode, "real", "source_mode não atravessou");

  const alfa = r.contexto?.viagens.find((v) => v.identidade.trip_id === "t-alfa");
  assert.ok(alfa, "a viagem t-alfa sumiu");
  assert.equal(alfa.identidade.unit_id, "u-tata-centro");
  assert.equal(alfa.observado.source_mode, "real");

  // Verbatim significa byte a byte contra a projeção, não "parecido".
  const origem = p.viagens.find((v) => v.trip_id === "t-alfa");
  assert.equal(alfa.observado.ultimo_fato_em, origem?.ultimo_fato_em);
  assert.equal(alfa.observado.ultima_posicao_em, origem?.ultima_posicao_em);
  assert.equal(alfa.observado.ocorrencias_abertas, origem?.ocorrencias_abertas);
});

teste("1b · os event_id que compuseram a viagem são preservados como evidência", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, OPCOES);
  const alfa = r.contexto?.viagens.find((v) => v.identidade.trip_id === "t-alfa");
  const origem = p.viagens.find((v) => v.trip_id === "t-alfa");
  assert.deepEqual(alfa?.evidencia.event_ids, [...(origem?.eventos ?? [])]);
  assert.ok((alfa?.evidencia.event_ids.length ?? 0) >= 4, "proveniência perdida");
});

/* ================================================================== *
 * 2 — contexto operacional permanece contexto
 * ================================================================== */

teste("2 · as nove dimensões da Operação Viva não viram dimensão de pedido", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, OPCOES);

  for (const d of DIMENSOES_DE_PEDIDO) {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(r.contexto?.dimensoes ?? {}, d),
      `a dimensão de pedido ${d} apareceu entre as dimensões adaptadas`,
    );
  }

  // A varredura é sobre o que CARREGA DADO — contexto, escopo e procedência.
  // `signals.criticalFieldsMissing` cita os mesmos nomes de propósito, e citar
  // um campo para declará-lo ausente é o oposto de preenchê-lo; incluir aquele
  // bloco aqui confundiria ausência declarada com vazamento.
  const comDado = JSON.stringify({
    escopo: r.escopo,
    contexto: r.contexto,
    procedencia: r.procedencia,
  });
  for (const d of ["order_state", "readiness", "courier", "dispatch", "external_id"]) {
    assert.ok(!comDado.includes(`"${d}"`), `${d} vazou para os dados do adapter`);
  }
  // E o mesmo nome precisa continuar aparecendo onde ele DEVE aparecer: na
  // lista de campos que esta fonte não tem como fornecer.
  for (const d of ["order_state", "readiness", "courier", "dispatch", "external_id"]) {
    assert.ok(r.signals.criticalFieldsMissing.includes(d), `${d} sumiu da ausência declarada`);
  }
});

teste("2b · carga e ocorrências são rotuladas contexto_operacional, não observação", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, OPCOES);
  const dim = r.contexto?.dimensoes ?? {};
  assert.equal(dim.carga.classificacao, A.CLASSIFICACAO.CONTEXTO_OPERACIONAL);
  assert.equal(dim.ocorrencias.classificacao, A.CLASSIFICACAO.CONTEXTO_OPERACIONAL);
  assert.equal(dim.carga.valor, p.dimensoes.carga);
  assert.equal(dim.ocorrencias.valor, p.dimensoes.ocorrencias);
});

teste("2c · o adapter nunca autoriza a Conferência a afirmar carga", () => {
  // `available` é o único estado que libera `mayAffirmOperationalLoad`. Como
  // esta fonte não observa um único pedido, ela nunca pode produzi-lo — em
  // NENHUM caminho, nem com integridade `fresh`.
  for (const integridade of ["fresh", "aging", "stale", "unknown"]) {
    assert.notEqual(
      A.SAUDE_POR_INTEGRIDADE[integridade].state,
      LIVE_SOURCE_HEALTH.AVAILABLE,
      `integridade ${integridade} produziria available`,
    );
    assert.equal(mayAffirmOperationalLoad(A.SAUDE_POR_INTEGRIDADE[integridade].state), false);
  }
  const p = projecaoDe(eventosBase(), LIDO_EM);
  assert.equal(mayAffirmOperationalLoad(A.adaptarProjecao(p, OPCOES).health.state), false);
});

/* ================================================================== *
 * 3 — inferência permanece identificada como inferência
 * ================================================================== */

teste("3 · frescor vive em `inferido` e nunca em `observado`", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, OPCOES);
  for (const v of r.contexto?.viagens ?? []) {
    assert.ok("frescor" in v.inferido, "frescor saiu de inferido");
    assert.ok(!("frescor" in v.observado), "frescor foi promovido a observação");
    assert.ok(!("expira_em" in v.observado), "expiração foi promovida a observação");
  }
  const alfa = r.contexto?.viagens.find((v) => v.identidade.trip_id === "t-alfa");
  assert.equal(alfa?.inferido.frescor, p.viagens.find((v) => v.trip_id === "t-alfa")?.frescor);
});

teste("3b · toda dimensão derivada de relógio é rotulada inferência", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const dim = A.adaptarProjecao(p, OPCOES).contexto?.dimensoes ?? {};
  for (const nome of [
    "atraso",
    "mobilidade",
    "integridade_sinal",
    "saude_sincronizacao",
    "confianca_evidencia",
    "capacidade_operacional",
    "risco_envelhecimento",
  ]) {
    assert.equal(dim[nome].classificacao, A.CLASSIFICACAO.INFERENCIA, `${nome} não está marcada como inferência`);
  }
});

/* ================================================================== *
 * 4 — campo sem equivalência não é inventado
 * ================================================================== */

teste("4 · estado de viagem não vira estado de pedido — some, e a recusa está declarada", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, OPCOES);
  const bruto = JSON.stringify(r);

  // A projeção real tem `em_rota` e `criada`; nenhum dos dois pode aparecer.
  assert.ok(p.viagens.some((v) => v.estado === "em_rota"), "o fixture perdeu o estado em_rota");
  for (const e of ["em_rota", "criada", "entregue", "encerrada", "desconhecido"]) {
    assert.ok(!bruto.includes(`"${e}"`), `o estado de viagem "${e}" vazou para a saída`);
  }

  const entrada = A.MAPA_SEMANTICO.find((m) => m.campo === "viagens[].estado");
  assert.equal(entrada?.classificacao, A.CLASSIFICACAO.SEM_EQUIVALENCIA_SEGURA);
  assert.equal(entrada?.destino, null, "um campo sem equivalência ganhou destino");
  assert.ok((entrada?.motivo.length ?? 0) > 40, "recusa sem motivo legível não é recusa auditável");
});

teste("4b · as nove dimensões de pedido do Brain estão declaradas como não alimentadas", () => {
  const declaradas = A.DIMENSOES_DO_BRAIN_NAO_ALIMENTADAS.map((d) => d.dimensao).sort();
  assert.deepEqual(declaradas, [...DIMENSOES_DE_PEDIDO].sort(), "a lista de recusas divergiu das nove dimensões");
  for (const d of A.DIMENSOES_DO_BRAIN_NAO_ALIMENTADAS) {
    assert.ok(d.motivo.length > 20, `${d.dimensao} recusada sem motivo`);
  }
});

teste("4c · nenhum campo da projeção entra sem classificação explícita", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const noMapa = new Set(A.MAPA_SEMANTICO.map((m) => m.campo));

  // `viagens` e `dimensoes` são recipientes — quem precisa de classificação
  // são os filhos, verificados logo abaixo.
  for (const k of Object.keys(p)) {
    if (k === "viagens" || k === "dimensoes") continue;
    assert.ok(noMapa.has(k), `campo "${k}" da projeção não está classificado no mapa`);
  }
  for (const k of Object.keys(p.viagens[0])) {
    assert.ok(noMapa.has(`viagens[].${k}`), `campo de viagem "${k}" não está classificado`);
  }
  for (const k of Object.keys(p.dimensoes)) {
    assert.ok(noMapa.has(`dimensoes.${k}`), `dimensão "${k}" não está classificada`);
  }
  for (const m of A.MAPA_SEMANTICO) {
    assert.ok(A.CLASSIFICACAO_LIST.includes(m.classificacao), `classificação inválida em ${m.campo}`);
  }
});

teste("4d · nenhum pedido é emitido, e o motivo é legível por máquina", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, OPCOES);
  assert.deepEqual(r.orders, []);
  assert.equal(r.signals.ordersFound, 0);
  assert.equal(r.orders_ausentes_porque, "projecao_sem_identidade_de_pedido");
  assert.ok(r.health.reasons.includes(A.RAZAO_PERMANENTE), "a ausência estrutural não acompanha a leitura");
  // A causa é verificável na própria projeção: ela não carrega order_id.
  assert.ok(!Object.keys(p.viagens[0]).includes("order_id"), "a projeção passou a ter order_id — reavaliar o bloco");
});

teste("4e · identidade de pedido que aparecer é registrada, nunca usada", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const comOrderId = {
    ...p,
    viagens: p.viagens.map((v) => ({ ...v, order_id: "pedido-123" })),
  };
  const r = A.adaptarProjecao(comOrderId, OPCOES);
  assert.deepEqual(r.orders, [], "order_id presente virou pedido emitido automaticamente");
  assert.equal(r.recusas.identidade_de_pedido.length, 2);
  assert.ok(!JSON.stringify(r).includes("pedido-123"), "o order_id vazou para a saída");
  assert.ok(r.health.reasons.some((x) => x.includes("identidade_de_pedido_presente_sem_decisao")));
});

teste("4f · o adapter não fabrica sinal de tela", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, OPCOES);
  // `classifyCycleHealth` sem `containerFound` devolveria `layout_changed` —
  // uma mentira aqui, porque não existe layout nenhum. Por isso o adapter
  // entrega `health` pronta e nunca inventa estes sinais.
  const bruto = JSON.stringify(r.signals);
  for (const s of [
    "containerFound",
    "captchaDetected",
    "loginPromptDetected",
    "layoutSignatureMatch",
    "pageAgeMs",
    "emptyOrderRatio",
  ]) {
    assert.ok(!bruto.includes(s), `o adapter fabricou o sinal de tela ${s}`);
  }
  assert.notEqual(r.health.state, LIVE_SOURCE_HEALTH.LAYOUT_CHANGED);
});

/* ================================================================== *
 * 5 — real, simulado e controle não se misturam
 * ================================================================== */

teste("5 · projeção de modo divergente é recusada inteira, sem emprestar um número", () => {
  const p = projecaoDe(eventosBase("simulated"), LIDO_EM, "simulated");
  const r = A.adaptarProjecao(p, { ...OPCOES, source_mode: "real" });
  assert.equal(r.health.state, LIVE_SOURCE_HEALTH.UNAVAILABLE);
  assert.equal(r.health.reason, "source_mode_divergente");
  assert.equal(r.contexto, null, "uma leitura recusada emprestou contexto");
  assert.equal(r.escopo, null);
  assert.deepEqual(r.orders, []);
});

teste("5b · o run_id particiona por modo — real e simulado nunca ocupam a mesma linha", () => {
  const real = A.runIdDe("u-tata-centro", "real");
  const sim = A.runIdDe("u-tata-centro", "simulated");
  const ctrl = A.runIdDe("u-tata-centro", "control");
  assert.equal(new Set([real, sim, ctrl]).size, 3, "dois modos colidiram no mesmo run_id");
  for (const [id, modo] of [[real, "real"], [sim, "simulated"], [ctrl, "control"]] as const) {
    assert.ok(id.includes(modo), `${modo} não aparece no run_id`);
  }
});

teste("5c · cada modo produz sua própria leitura, e elas não se somam", () => {
  const real = A.adaptarProjecao(projecaoDe(eventosBase("real"), LIDO_EM, "real"), {
    ...OPCOES,
    source_mode: "real",
  });
  const sim = A.adaptarProjecao(projecaoDe(eventosBase("simulated"), LIDO_EM, "simulated"), {
    ...OPCOES,
    source_mode: "simulated",
  });
  assert.equal(real.escopo?.source_mode, "real");
  assert.equal(sim.escopo?.source_mode, "simulated");
  for (const v of real.contexto?.viagens ?? []) assert.equal(v.observado.source_mode, "real");
  for (const v of sim.contexto?.viagens ?? []) assert.equal(v.observado.source_mode, "simulated");
});

/* ================================================================== *
 * 6 — timestamps e identidade são preservados
 * ================================================================== */

teste("6 · os três carimbos continuam três coisas diferentes", () => {
  const p = projecaoDe(eventosBase(), "2026-07-31T12:00:45.000Z");
  const r = A.adaptarProjecao(p, OPCOES);

  assert.equal(r.procedencia?.calculada_em, p.calculada_em, "calculada_em não foi preservada");
  assert.equal(r.lido_em, LIDO_EM, "lido_em não é o instante da leitura");
  assert.notEqual(r.lido_em, r.procedencia?.calculada_em, "leitura e cálculo foram fundidos");

  const alfa = r.contexto?.viagens.find((v) => v.identidade.trip_id === "t-alfa");
  assert.equal(alfa?.observado.ultimo_fato_em, "2026-07-31T12:00:40.000Z");
  assert.notEqual(alfa?.observado.ultimo_fato_em, r.lido_em, "occurred_at virou instante de leitura");

  // O Brain chama de `observed_at` o instante em que se viu a TELA. Este
  // adapter não vê tela, então não produz o campo — produz `lido_em`.
  assert.ok(!JSON.stringify(r).includes('"observed_at"'), "o adapter inventou um observed_at");
});

teste("6b · identidade e procedência da projeção sobrevivem", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, OPCOES);
  assert.equal(r.procedencia?.projection_version, p.projection_version);
  assert.deepEqual(r.procedencia?.cursor, p.cursor);
  assert.equal(r.regra_ref, "operacao-viva-para-conference-brain-v1");
  assert.deepEqual(
    (r.contexto?.viagens ?? []).map((v) => v.identidade.trip_id),
    ["t-alfa", "t-beta"],
  );
});

/* ================================================================== *
 * 7 — duplicação é idempotente
 * ================================================================== */

teste("7 · a mesma projeção adaptada 50× produz sempre o mesmo byte", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const primeiro = JSON.stringify(A.adaptarProjecao(p, OPCOES));
  for (let i = 0; i < 50; i += 1) {
    assert.equal(JSON.stringify(A.adaptarProjecao(p, OPCOES)), primeiro, `divergiu na iteração ${i}`);
  }
  // Duas projeções construídas do zero a partir dos mesmos eventos também.
  const q = projecaoDe(eventosBase(), LIDO_EM);
  assert.equal(JSON.stringify(A.adaptarProjecao(q, OPCOES)), primeiro);
});

teste("7b · eventos duplicados na origem não inflam nada no adapter", () => {
  const base = eventosBase();
  const semDuplicata = A.adaptarProjecao(projecaoDe(base, LIDO_EM), OPCOES);
  // A projeção já descarta por idempotency_key; o adapter não pode desfazer isso.
  const comDuplicata = A.adaptarProjecao(projecaoDe([...base, ...base], LIDO_EM), OPCOES);
  assert.equal(JSON.stringify(comDuplicata), JSON.stringify(semDuplicata));
});

/* ================================================================== *
 * 8 — evento fora de ordem segue política explícita
 * ================================================================== */

teste("8 · a política herdada está declarada e o adapter não a reinterpreta", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, OPCOES);
  assert.equal(
    r.procedencia?.politica_fora_de_ordem,
    "herdada_de_operacao_viva:evento_fora_de_ordem_nao_retrocede_estado",
  );
});

teste("8b · evento fora de ordem não retrocede — e o adapter carrega o resultado, não o refaz", () => {
  const emOrdem = eventosBase();
  // `trip_started` chegando DEPOIS de `delivery_confirmed`: a projeção não
  // retrocede o estado. O adapter não vê estado nenhum, mas os carimbos que
  // ele carrega precisam continuar sendo os da projeção, não os da chegada.
  const foraDeOrdem = [
    ev("delivery_confirmed", "t-gama", "2026-07-31T12:00:20.000Z"),
    ev("trip_started", "t-gama", "2026-07-31T11:59:00.000Z"),
  ];
  const p = projecaoDe([...emOrdem, ...foraDeOrdem], LIDO_EM);
  const gama = p.viagens.find((v) => v.trip_id === "t-gama");
  assert.equal(gama?.estado, "entregue", "a projeção retrocedeu — o fixture não prova mais nada");

  const r = A.adaptarProjecao(p, OPCOES);
  const adaptada = r.contexto?.viagens.find((v) => v.identidade.trip_id === "t-gama");
  assert.equal(adaptada?.observado.ultimo_fato_em, gama?.ultimo_fato_em);
});

teste("8c · a ordem de chegada das viagens não muda a saída", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const invertida = { ...p, viagens: [...p.viagens].reverse() };
  assert.equal(
    JSON.stringify(A.adaptarProjecao(invertida, OPCOES)),
    JSON.stringify(A.adaptarProjecao(p, OPCOES)),
    "a saída depende da ordem do array de entrada",
  );
});

/* ================================================================== *
 * 9 — dado stale não vira observação atual
 * ================================================================== */

teste("9 · sinal vencido vira saúde `stale`, nunca leitura atual", () => {
  // Uma hora depois do último fato: bem além da janela de 300 s.
  const tarde = "2026-07-31T13:00:00.000Z";
  const p = projecaoDe(eventosBase(), tarde);
  assert.equal(p.dimensoes.integridade_sinal, "stale", "o fixture não envelheceu");

  const r = A.adaptarProjecao(p, { ...OPCOES, lidoEm: tarde });
  assert.equal(r.health.state, LIVE_SOURCE_HEALTH.STALE);
  assert.equal(r.health.reason, "operacao_viva_sinal_vencido");
  assert.deepEqual(r.orders, [], "dado vencido produziu pedido");

  const alfa = r.contexto?.viagens.find((v) => v.identidade.trip_id === "t-alfa");
  assert.equal(alfa?.inferido.frescor, "stale");
  assert.equal(alfa?.inferido.expirado, true, "a expiração não foi calculada");
});

teste("9b · expiração é derivada da mesma janela e da mesma base da Operação Viva", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, OPCOES);
  const alfa = r.contexto?.viagens.find((v) => v.identidade.trip_id === "t-alfa");
  const esperado = new Date(
    Date.parse("2026-07-31T12:00:30.000Z") + JANELAS.aging_ate_s * 1000,
  ).toISOString();
  assert.equal(alfa?.inferido.expira_em, esperado);
  assert.equal(alfa?.inferido.expirado, false, "ainda dentro da janela, não deveria estar expirado");
  assert.deepEqual(r.contexto?.janelas, { ...JANELAS }, "as janelas não acompanharam a leitura");
});

teste("9c · viagem sem posição nunca observada não é declarada fresca nem expirada", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const beta = A.adaptarProjecao(p, OPCOES).contexto?.viagens.find(
    (v) => v.identidade.trip_id === "t-beta",
  );
  assert.equal(beta?.observado.ultima_posicao_em, null, "t-beta ganhou posição do nada");
  assert.equal(beta?.inferido.frescor, "unknown");
  assert.equal(beta?.inferido.expira_em, null);
  assert.equal(beta?.inferido.expirado, null, "nunca observado virou 'não expirado'");
});

/* ================================================================== *
 * 10 — PII removida ou marcada conforme o contrato
 * ================================================================== */

teste("10 · chave proibida numa viagem é descartada e a recusa é registrada", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const contaminada = {
    ...p,
    viagens: p.viagens.map((v) => ({
      ...v,
      customer_name: "Joao da Silva",
      telefone: "11999998888",
    })),
  };
  const r = A.adaptarProjecao(contaminada, OPCOES);
  const bruto = JSON.stringify(r);
  assert.ok(!bruto.includes("Joao"), "nome de cliente vazou");
  assert.ok(!bruto.includes("11999998888"), "telefone vazou");
  assert.ok(!bruto.includes('"customer_name"'), "a chave proibida atravessou");
  assert.equal(r.recusas.pii.length, 4, "as recusas de PII não foram contadas");
  assert.ok(r.health.reasons.some((x) => x.startsWith("campos_proibidos_descartados:")));
});

teste("10b · device_id não atravessa a fronteira", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  assert.equal(p.viagens[0].device_id, "dev-9", "o fixture perdeu o device_id");
  const r = A.adaptarProjecao(p, OPCOES);
  assert.ok(!JSON.stringify(r).includes("dev-9"), "o identificador de aparelho vazou para o Brain");
  const entrada = A.MAPA_SEMANTICO.find((m) => m.campo === "viagens[].device_id");
  assert.equal(entrada?.classificacao, A.CLASSIFICACAO.SEM_EQUIVALENCIA_SEGURA);
  assert.equal(entrada?.destino, null);
});

teste("10c · a saída inteira passa pela guarda de campos proibidos do Brain", () => {
  const { FORBIDDEN_FIELDS } = CB("contracts/schemas") as { FORBIDDEN_FIELDS: readonly string[] };
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const bruto = JSON.stringify(A.adaptarProjecao(p, OPCOES));
  for (const f of FORBIDDEN_FIELDS) {
    assert.ok(!bruto.includes(`"${f}"`), `campo proibido ${f} presente na saída`);
  }
});

/* ================================================================== *
 * 11 — entrada incompleta não produz valor neutro falsamente preciso
 * ================================================================== */

teste("11 · campo ausente vira null declarado, nunca 0, '' ou false", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const incompleta = {
    ...p,
    viagens: p.viagens.map((v) => {
      const { ocorrencias_abertas, ultimo_fato_em, ...resto } = v;
      void ocorrencias_abertas;
      void ultimo_fato_em;
      return resto;
    }),
  };
  const r = A.adaptarProjecao(incompleta, OPCOES);
  for (const v of r.contexto?.viagens ?? []) {
    assert.equal(v.observado.ocorrencias_abertas, null, "ausência virou zero");
    assert.notEqual(v.observado.ocorrencias_abertas, 0);
    assert.equal(v.observado.ultimo_fato_em, null, "ausência virou string vazia");
  }
});

teste("11b · dimensão ausente não é preenchida com número", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const semDimensoes = { ...p, dimensoes: {} };
  const dim = A.adaptarProjecao(semDimensoes, OPCOES).contexto?.dimensoes ?? {};
  for (const nome of Object.keys(dim)) {
    assert.equal(dim[nome].valor, null, `${nome} ganhou valor inventado`);
    assert.ok(A.CLASSIFICACAO_LIST.includes(dim[nome].classificacao));
  }
});

teste("11c · capacidade 'desconhecida' atravessa como está, sem virar zero", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  assert.equal(p.dimensoes.capacidade_operacional, "desconhecida", "o fixture declarou capacidade");
  const dim = A.adaptarProjecao(p, OPCOES).contexto?.dimensoes ?? {};
  assert.equal(dim.capacidade_operacional.valor, "desconhecida");
});

teste("11d · sem janelas declaradas, a expiração é indeterminada e diz isso", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, { lidoEm: LIDO_EM, source_mode: "real" });
  for (const v of r.contexto?.viagens ?? []) {
    assert.equal(v.inferido.expira_em, null, "expiração inventada sem janela");
    assert.equal(v.inferido.expirado, null);
  }
  assert.equal(r.contexto?.janelas, null);
  assert.ok(r.health.reasons.includes("janelas_nao_declaradas_expiracao_indeterminada"));
});

teste("11e · entrada inválida é recusa declarada, nunca leitura vazia com cara de boa", () => {
  for (const [entrada, motivo] of [
    [null, "projecao_ausente_ou_invalida"],
    [[], "projecao_ausente_ou_invalida"],
    ["texto", "projecao_ausente_ou_invalida"],
    [{}, "unit_id_ausente"],
    [{ unit_id: "u-1" }, "source_mode_ausente"],
  ] as [unknown, string][]) {
    const r = A.adaptarProjecao(entrada, OPCOES);
    assert.equal(r.health.state, LIVE_SOURCE_HEALTH.UNAVAILABLE, `${motivo}: saúde errada`);
    assert.equal(r.health.reason, motivo);
    assert.equal(r.contexto, null);
    assert.deepEqual(r.orders, []);
  }
});

/* ================================================================== *
 * 12 — falha do adapter não afeta o runtime crítico
 * ================================================================== */

teste("12 · fonte que explode vira saúde declarada, não exceção", async () => {
  const fetch = A.criarFetchOrders({
    lerProjecao: () => {
      throw new Error("segredo que nao pode vazar: cliente Maria, tel 11988887777");
    },
    source_mode: "real",
    janelas: JANELAS,
    now: () => LIDO_EM,
  });
  const r = await fetch();
  assert.equal(r.health.state, LIVE_SOURCE_HEALTH.UNAVAILABLE);
  assert.equal(r.health.reason, "fonte_indisponivel");
  const bruto = JSON.stringify(r);
  assert.ok(!bruto.includes("Maria"), "a mensagem da exceção vazou dado");
  assert.ok(!bruto.includes("11988887777"), "a mensagem da exceção vazou telefone");
  assert.ok(bruto.includes("erro:Error"), "a classe do erro deveria atravessar");
});

teste("12b · o runtime crítico não conhece o Conference Brain", () => {
  for (const arquivo of [
    "src/platform/bin/critical.ts",
    "src/platform/runtime/rota-ingestao.ts",
    "src/platform/runtime/handler-operacao-viva.ts",
    "src/platform/ingest/ingest-service.ts",
    "src/platform/projections/operacao-viva.ts",
  ]) {
    const texto = readFileSync(join(process.cwd(), arquivo), "utf8").replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      "",
    );
    assert.ok(
      !texto.includes("conference-brain"),
      `${arquivo} passou a depender do Conference Brain — a seta de dependência inverteu`,
    );
  }
});

teste("12c · o adapter não persiste, não abre rede e não executa ação", () => {
  const caminho = join(process.cwd(), "src", "conference-brain", "ingestion", "operacao-viva-adapter.js");
  const texto = readFileSync(caminho, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  const requires = [...texto.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(
    requires,
    ["../contracts/live-states", "../contracts/rule-version", "../contracts/schemas"],
    "o adapter ganhou dependência fora dos contratos do Brain",
  );
  for (const proibido of ["store.put", "writeFile", "fetch(", "http", "process.exit"]) {
    assert.ok(!texto.includes(proibido), `o adapter faz "${proibido}" — deveria ser inerte`);
  }
  assert.equal(A.REGRA_MAPEAMENTO.mode, "shadow", "a regra saiu de sombra");
});

teste("12d · o relógio padrão funciona para quem não injeta nada (L24)", async () => {
  const fetch = A.criarFetchOrders({
    lerProjecao: () => projecaoDe(eventosBase(), LIDO_EM),
    source_mode: "real",
    janelas: JANELAS,
  });
  const r = await fetch();
  assert.ok(typeof r.lido_em === "string" && r.lido_em.length > 0, "o caminho padrão não produziu instante");
  assert.ok(Number.isFinite(Date.parse(r.lido_em as string)), "instante padrão inválido");
  assert.notEqual(r.health.state, LIVE_SOURCE_HEALTH.UNAVAILABLE);
});

/* ================================================================== *
 * Integração real com o observador portado
 * ================================================================== */

teste("13 · o observador do 4B3 consome o adapter e não inventa pedido nenhum", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cb4b4-"));
  try {
    const store = createStore({ dir });
    const observer = createLiveObserver({
      store,
      fetchOrders: A.criarFetchOrders({
        lerProjecao: () => projecaoDe(eventosBase(), LIDO_EM),
        source_mode: "real",
        janelas: JANELAS,
        now: () => LIDO_EM,
      }),
      runId: A.runIdDe("u-tata-centro", "real"),
      collectorVersion: A.ADAPTER_VERSION,
      now: () => LIDO_EM,
    });

    const r1 = (await observer.runCycle()) as { ok: boolean; cycle: Record<string, unknown> };
    assert.equal(r1.ok, true, "o ciclo falhou");
    assert.equal(r1.cycle.source_health, LIVE_SOURCE_HEALTH.PARTIAL);
    assert.equal(r1.cycle.orders_observed, 0);
    // A ausência declarada fica gravada no registro durável do próprio Brain.
    assert.deepEqual(r1.cycle.fields_missing, [...A.CAMPOS_CRITICOS_AUSENTES]);

    assert.equal(store.count("live_observations"), 0, "o adapter criou observação de pedido");
    assert.equal(store.count("conference_clock_events"), 0, "abriu relógio de Conferência para uma viagem");

    // Segundo ciclo: idempotente no que importa — nenhum pedido aparece do nada.
    await observer.runCycle();
    assert.equal(store.count("live_observations"), 0);
    assert.equal(store.count("conference_clock_events"), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("13b · o fecho transitivo continua fechado e sem dependência externa nova", () => {
  const { readdirSync, statSync } = req("node:fs") as typeof import("node:fs");
  const raiz = join(process.cwd(), "src", "conference-brain");
  const externos = new Set<string>();
  const andar = (d: string): void => {
    for (const nome of readdirSync(d)) {
      const p = join(d, nome);
      if (statSync(p).isDirectory()) {
        andar(p);
        continue;
      }
      if (!p.endsWith(".js")) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/require\("([^".][^"]*)"\)/g)) externos.add(m[1]);
    }
  };
  andar(raiz);
  assert.deepEqual([...externos].sort(), ["crypto", "fs", "path"]);
});

teste("13c · o 4B4 não trouxe browser adapter, Playwright nem painel", () => {
  const { readdirSync } = req("node:fs") as typeof import("node:fs");
  const live = readdirSync(join(process.cwd(), "src", "conference-brain", "live"));
  for (const fora of ["browser-adapter.js", "playwright-preflight.js", "mapping-mode.js"]) {
    assert.ok(!live.includes(fora), `${fora} entrou fora de escopo`);
  }
});

void Promise.all(pend).then(() => {
  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} conference-4b4 tests OK ===`);
});
