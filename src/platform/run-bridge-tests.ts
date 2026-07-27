/**
 * A ponte: catálogo de eventos, ingestão, projeção e Copiloto em shadow.
 *
 * Tudo aqui é puro — sem banco, sem rede, sem relógio real. O relógio é
 * injetado justamente para que "sinal velho" seja testável sem esperar cinco
 * minutos, e para que duas execuções do mesmo teste não divirjam.
 */

import assert from "node:assert/strict";
import {
  checkEvent,
  podeLer,
  streamDe,
  EVENT_TYPES,
  type EventEnvelope,
} from "./contracts/event-catalog";
import {
  traduzirLoteGps,
  montarRecibo,
  MAX_PONTOS_POR_LOTE,
  type DispositivoConhecido,
  type PontoAndroid,
  type RegistroDeDispositivos,
} from "./ingest/device-ingest";
import {
  projetar,
  mesmoEstadoLogico,
  classificarFrescor,
  PROJECTION_VERSION,
} from "./projections/operacao-viva";
import {
  recomendar,
  invalidarSuperadas,
  envelhecer,
  exigirConfianca,
  paraPainel,
  POLITICA_SINAL_VELHO,
} from "./copiloto/shadow";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void | Promise<void>): void | Promise<void> {
  const r = (): void => {
    passed += 1;
  };
  try {
    const saida = fn();
    if (saida instanceof Promise) {
      return saida.then(r).catch((e: unknown) => {
        failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      });
    }
    r();
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const AGORA = new Date("2026-07-27T12:00:00.000Z");
const pendentes: Promise<void>[] = [];
function testeAsync(nome: string, fn: () => Promise<void>): void {
  const p = test(nome, fn);
  if (p) pendentes.push(p);
}

console.log("=== Ponte de eventos (catálogo, ingestão, projeção, shadow) ===");

/* ------------------------------------------------------------------ *
 * Catálogo
 * ------------------------------------------------------------------ */

function fato(extra: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    event_id: "ev-1",
    event_type: "trip_started",
    event_version: "trip_started@1.0.0",
    unit_id: "ITAIM",
    trip_id: "t-1",
    device_id: "dev-1",
    occurred_at: "2026-07-27T11:50:00.000Z",
    origin: "device",
    source_mode: "real",
    idempotency_key: "k-1",
    payload: {},
    ...extra,
  };
}

test("um envelope bem formado é aceito", () => {
  assert.equal(checkEvent(fato()).ok, true);
});

test("os onze tipos do catálogo estão declarados", () => {
  assert.equal(EVENT_TYPES.length, 11);
  for (const t of ["trip_created", "gps_batch_received", "trip_closed", "order_state_changed"]) {
    assert.ok((EVENT_TYPES as readonly string[]).includes(t), `tipo ausente: ${t}`);
  }
});

test("tipo desconhecido é RECUSADO, nunca ignorado", () => {
  // Ignorar em silêncio faria um deploy com tipo novo apagar eventos até o
  // consumidor que os entende subir.
  const r = checkEvent(fato({ event_type: "coisa_nova" as never }));
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "unknown_type");
});

test("source_mode ausente é recusado — não existe padrão", () => {
  // Se `real` fosse o padrão, um simulador esquecido ligado viraria histórico
  // real em silêncio.
  const r = checkEvent(fato({ source_mode: undefined as never }));
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "invalid_source_mode");
});

test("os três source_modes são aceitos, inclusive control", () => {
  for (const m of ["real", "simulated", "control"] as const) {
    assert.equal(checkEvent(fato({ source_mode: m })).ok, true, `${m} recusado`);
  }
});

test("carimbo inválido é recusado", () => {
  assert.equal(checkEvent(fato({ occurred_at: "ontem" })).ok, false);
  assert.equal(checkEvent(fato({ observed_at: "amanhã" })).ok, false);
});

test("payload acima do limite é recusado", () => {
  const r = checkEvent(fato({ payload: { grande: "x".repeat(70_000) } }));
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "payload_too_large");
});

test("PII no payload é recusada, em qualquer profundidade", () => {
  // A verificação é por NOME DE CHAVE: procurar CPF por regex dentro do valor
  // é um jogo que se perde.
  for (const p of [
    { customer_phone: "11999999999" },
    { cliente: { nome_cliente: "Fulano" } },
    { lista: [{ endereco: "Rua X" }] },
    { auth: { token: "abc" } },
  ]) {
    const r = checkEvent(fato({ payload: p }));
    assert.equal(r.ok, false, `deveria recusar: ${JSON.stringify(p)}`);
    assert.equal(r.ok === false && r.rejection, "pii_suspected");
  }
});

test("payload legítimo com nome parecido NÃO é recusado", () => {
  // `accuracy_m` não é `documento`; falso positivo aqui bloquearia o campo.
  assert.equal(checkEvent(fato({ payload: { accuracy_m: 12, provider: "fused" } })).ok, true);
});

test("compatibilidade: major igual basta, major diferente não", () => {
  // Exigir minor <= consumidor pararia todo consumidor não atualizado no
  // instante em que um produtor acrescentasse um campo opcional.
  assert.equal(podeLer("trip_started@1.9.0", "trip_started@1.0.0"), true);
  assert.equal(podeLer("trip_started@1.0.0", "trip_started@1.9.0"), true);
  assert.equal(podeLer("trip_started@2.0.0", "trip_started@1.0.0"), false);
});

test("eventos de fonte externa vão para outro stream", () => {
  assert.equal(streamDe("gps_batch_received"), "entregas");
  assert.equal(streamDe("order_state_changed"), "fontes");
});

/* ------------------------------------------------------------------ *
 * Ingestão
 * ------------------------------------------------------------------ */

const APARELHO: DispositivoConhecido = { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1" };
const REGISTRO: RegistroDeDispositivos = {
  buscar: async (id) =>
    id === "dev-1"
      ? APARELHO
      : id === "dev-revogado"
        ? { device_id: "dev-revogado", unit_id: "ITAIM", revoked_at: "2026-07-01T00:00:00Z" }
        : null,
};

function ponto(seq: number, extra: Partial<PontoAndroid> = {}): PontoAndroid {
  return {
    point_id: `gps:dev-1:t-1:${seq}`,
    idempotency_key: `gps:dev-1:t-1:${seq}`,
    trip_id: "t-1",
    device_id: "dev-1",
    latitude: -23.55,
    longitude: -46.63,
    accuracy_m: 12,
    occurred_at: new Date(AGORA.getTime() - (10 - seq) * 1000).toISOString(),
    sequence_local: seq,
    provider: "fused",
    is_mock: false,
    ...extra,
  };
}

async function traduzir(pontos: PontoAndroid[], deviceId: string | null = "dev-1") {
  return traduzirLoteGps({
    corpo: { points: pontos, correlation_id: "sync-1" },
    device_id_autenticado: deviceId,
    registro: REGISTRO,
    recebido_em: AGORA,
    source_mode: "real",
  });
}

testeAsync("um lote do Android vira fatos do catálogo sem tocar no Kotlin", async () => {
  const r = await traduzir([ponto(1), ponto(2), ponto(3)]);
  assert.equal(r.ok, true);
  assert.equal(r.fatos.length, 3);
  assert.equal(r.fatos[0].event_type, "gps_batch_received");
  assert.equal(r.fatos[0].unit_id, "ITAIM", "a unidade vem do cadastro, não do aparelho");
  assert.equal(r.fatos[0].origin, "device");
  assert.equal(r.ack_through_sequence, 3);
});

testeAsync("sem credencial não entra nada", async () => {
  const r = await traduzir([ponto(1)], null);
  assert.equal(r.ok, false);
  assert.equal(r.recusa, "sem_autenticacao");
  assert.equal(r.fatos.length, 0);
});

testeAsync("aparelho revogado é recusado ANTES de qualquer análise do lote", async () => {
  // Lote propositalmente quebrado em tudo o mais. A resposta ainda tem que ser
  // "revogado" — assim um celular perdido sai do ar sem receber dica.
  const r = await traduzirLoteGps({
    corpo: { points: "não é lista" as never },
    device_id_autenticado: "dev-revogado",
    registro: REGISTRO,
    recebido_em: AGORA,
    source_mode: "real",
  });
  assert.equal(r.ok, false);
  assert.equal(r.recusa, "dispositivo_revogado");
});

testeAsync("aparelho desconhecido é recusado", async () => {
  const r = await traduzir([ponto(1)], "dev-fantasma");
  assert.equal(r.recusa, "dispositivo_desconhecido");
});

testeAsync("um aparelho não pode mandar ponto em nome de outro", async () => {
  const r = await traduzir([ponto(1), ponto(2, { device_id: "dev-outro" })]);
  assert.equal(r.fatos.length, 1);
  assert.match(r.rejeitados[0].motivo, /device_id/);
});

testeAsync("localização simulada num lote real é recusada", async () => {
  const r = await traduzir([ponto(1, { is_mock: true })]);
  assert.equal(r.fatos.length, 0);
  assert.match(r.rejeitados[0].motivo, /simulada/);
});

testeAsync("coordenada impossível é recusada", async () => {
  const r = await traduzir([ponto(1, { latitude: 999 })]);
  assert.equal(r.fatos.length, 0);
  assert.match(r.rejeitados[0].motivo, /[Cc]oordenada/);
});

testeAsync("lote grande demais é recusado inteiro", async () => {
  const grande = Array.from({ length: MAX_PONTOS_POR_LOTE + 1 }, (_, i) => ponto(i));
  const r = await traduzir(grande);
  assert.equal(r.ok, false);
  assert.equal(r.recusa, "lote_grande_demais");
});

testeAsync("lote vazio é aceito — o aparelho pode só estar dizendo que está vivo", async () => {
  const r = await traduzir([]);
  assert.equal(r.ok, true);
  assert.equal(r.fatos.length, 0);
});

testeAsync("o recibo PARA na primeira recusa, não pula por cima dela", async () => {
  // Devolver o maior aceito faria o aparelho apagar o ponto recusado do meio,
  // e aquele buraco não voltaria nunca mais.
  const r = await traduzir([ponto(1), ponto(2, { latitude: 999 }), ponto(3), ponto(4)]);
  assert.equal(r.fatos.length, 3);
  assert.equal(r.ack_through_sequence, 1, "o recibo tem que travar na sequência 1");
});

testeAsync("o mesmo lote cem vezes produz sempre os mesmos ids de fato", async () => {
  const lote = [ponto(1), ponto(2), ponto(3)];
  const primeiro = await traduzir(lote);
  for (let i = 0; i < 99; i += 1) {
    const r = await traduzir(lote);
    assert.deepEqual(
      r.fatos.map((f) => f.event_id),
      primeiro.fatos.map((f) => f.event_id),
      `divergiu na iteração ${i}`,
    );
  }
});

testeAsync("duplicata conta como sucesso no recibo, não como erro", async () => {
  // Contá-la como erro faria o aparelho reenviar para sempre o que já chegou.
  const r = await traduzir([ponto(1), ponto(2)]);
  const recibo = montarRecibo({ resultado: r, gravados: 1, recebido_em: AGORA });
  assert.equal(recibo.accepted, 1);
  assert.equal(recibo.duplicate, 1);
  assert.equal(recibo.rejected, 0);
});

/* ------------------------------------------------------------------ *
 * Projeção
 * ------------------------------------------------------------------ */

const OPCOES = { agora: AGORA, unit_id: "ITAIM", source_mode: "real" as const };

function ev(t: EventEnvelope["event_type"], extra: Partial<EventEnvelope> = {}): EventEnvelope {
  return fato({ event_type: t, event_version: `${t}@1.0.0`, ...extra });
}

test("a projeção deriva o estado da viagem dos fatos", () => {
  const p = projetar(
    [
      ev("trip_created", { event_id: "e1", idempotency_key: "k1", occurred_at: "2026-07-27T11:00:00Z" }),
      ev("trip_started", { event_id: "e2", idempotency_key: "k2", occurred_at: "2026-07-27T11:05:00Z" }),
    ],
    OPCOES,
  );
  assert.equal(p.viagens.length, 1);
  assert.equal(p.viagens[0].estado, "em_rota");
  assert.equal(p.projection_version, PROJECTION_VERSION);
});

test("evento fora de ordem NÃO faz a viagem retroceder", () => {
  // Rede reordena. Obedecer à ordem de chegada faria uma viagem entregue
  // "voltar a sair".
  const p = projetar(
    [
      ev("delivery_confirmed", { event_id: "e2", idempotency_key: "k2", occurred_at: "2026-07-27T11:30:00Z" }),
      ev("trip_started", { event_id: "e1", idempotency_key: "k1", occurred_at: "2026-07-27T11:05:00Z" }),
    ],
    OPCOES,
  );
  assert.equal(p.viagens[0].estado, "entregue");
});

test("replay reconstrói o MESMO estado lógico", () => {
  const eventos = [
    ev("trip_created", { event_id: "e1", idempotency_key: "k1", occurred_at: "2026-07-27T11:00:00Z" }),
    ev("trip_started", { event_id: "e2", idempotency_key: "k2", occurred_at: "2026-07-27T11:05:00Z" }),
    ev("gps_batch_received", { event_id: "e3", idempotency_key: "k3", occurred_at: "2026-07-27T11:59:00Z" }),
  ];
  const a = projetar(eventos, OPCOES);
  const b = projetar([...eventos].reverse(), OPCOES);
  assert.ok(mesmoEstadoLogico(a, b), "a ordem de entrada mudou o resultado");
});

test("duplicata não infla a projeção", () => {
  const e = ev("occurrence_created", { event_id: "e1", idempotency_key: "k1" });
  const p = projetar([e, e, e], OPCOES);
  assert.equal(p.viagens[0].ocorrencias_abertas, 1);
});

test("real e simulated NUNCA se somam", () => {
  const p = projetar(
    [
      ev("trip_started", { event_id: "e1", idempotency_key: "k1" }),
      ev("trip_started", { event_id: "e2", idempotency_key: "k2", trip_id: "t-2", source_mode: "simulated" }),
    ],
    OPCOES,
  );
  assert.equal(p.viagens.length, 1, "um evento simulado entrou na projeção real");
});

test("evento de outra unidade não entra", () => {
  const p = projetar(
    [ev("trip_started", { event_id: "e1", idempotency_key: "k1", unit_id: "MOEMA" })],
    OPCOES,
  );
  assert.equal(p.viagens.length, 0);
});

test("major incompatível vai para quarentena, não para o estado", () => {
  const p = projetar(
    [ev("trip_started", { event_id: "e1", idempotency_key: "k1", event_version: "trip_started@2.0.0" })],
    { ...OPCOES, consumer_version: "trip_started@1.0.0" },
  );
  assert.equal(p.viagens.length, 0);
  assert.equal(p.quarentena.length, 1);
});

test("ausência é estado: sinal velho vira stale e unknown NUNCA vira healthy", () => {
  assert.equal(classificarFrescor(undefined, AGORA), "unknown");
  assert.equal(classificarFrescor(new Date(AGORA.getTime() - 30_000).toISOString(), AGORA), "fresh");
  assert.equal(classificarFrescor(new Date(AGORA.getTime() - 200_000).toISOString(), AGORA), "aging");
  assert.equal(classificarFrescor(new Date(AGORA.getTime() - 600_000).toISOString(), AGORA), "stale");
});

test("carimbo no futuro é relógio errado, não frescor extra", () => {
  const futuro = new Date(AGORA.getTime() + 3_600_000).toISOString();
  assert.equal(classificarFrescor(futuro, AGORA), "unknown");
});

test("a projeção envelhece sozinha: sem evento novo, o sinal degrada", () => {
  const eventos = [
    ev("trip_started", { event_id: "e1", idempotency_key: "k1", occurred_at: "2026-07-27T11:00:00Z" }),
    ev("gps_batch_received", { event_id: "e2", idempotency_key: "k2", occurred_at: "2026-07-27T11:00:30Z" }),
  ];
  const cedo = projetar(eventos, { ...OPCOES, agora: new Date("2026-07-27T11:01:00Z") });
  const tarde = projetar(eventos, { ...OPCOES, agora: new Date("2026-07-27T12:00:00Z") });
  assert.equal(cedo.viagens[0].frescor, "fresh");
  assert.equal(tarde.viagens[0].frescor, "stale", "o mesmo evento continuou fresco com o tempo");
  assert.equal(tarde.dimensoes.integridade_sinal, "stale");
});

test("as nove dimensões existem e capacidade desconhecida não vira número", () => {
  const p = projetar([ev("trip_started", { event_id: "e1", idempotency_key: "k1" })], OPCOES);
  const d = p.dimensoes;
  for (const k of [
    "carga", "atraso", "mobilidade", "integridade_sinal", "saude_sincronizacao",
    "confianca_evidencia", "capacidade_operacional", "ocorrencias", "risco_envelhecimento",
  ]) {
    assert.ok(k in d, `dimensão ausente: ${k}`);
  }
  assert.equal(d.capacidade_operacional, "desconhecida");
});

test("nenhuma viagem aberta NÃO significa confiança alta", () => {
  // "Sem dado" não é evidência de saúde.
  const p = projetar([], OPCOES);
  assert.equal(p.dimensoes.confianca_evidencia, "baixa");
  assert.equal(p.dimensoes.integridade_sinal, "unknown");
});

/* ------------------------------------------------------------------ *
 * Copiloto em shadow
 * ------------------------------------------------------------------ */

function projecaoComSinalVelho() {
  return projetar(
    [
      ev("trip_started", { event_id: "e1", idempotency_key: "k1", occurred_at: "2026-07-27T10:00:00Z" }),
      ev("gps_batch_received", { event_id: "e2", idempotency_key: "k2", occurred_at: "2026-07-27T10:01:00Z" }),
    ],
    OPCOES,
  );
}

test("o Copiloto recomenda a partir de sinal velho", () => {
  const r = recomendar(projecaoComSinalVelho(), { agora: AGORA });
  assert.ok(r.length >= 1);
  assert.equal(r[0].policy_id, "sinal-velho");
  assert.equal(r[0].status, "proposed");
  assert.equal(r[0].requires_human, true);
});

test("toda recomendação carrega evidência, versão e origem", () => {
  const r = recomendar(projecaoComSinalVelho(), { agora: AGORA })[0];
  assert.ok(r.input_event_ids.length > 0, "recomendação sem evidência é palpite");
  assert.equal(r.projection_version, PROJECTION_VERSION);
  assert.equal(r.source_mode, "real");
  assert.match(r.policy_version, /copiloto-shadow@/);
});

test("replay NÃO duplica recomendação — o id é determinístico", () => {
  const p = projecaoComSinalVelho();
  const a = recomendar(p, { agora: AGORA });
  const b = recomendar(p, { agora: new Date(AGORA.getTime() + 1000) });
  assert.deepEqual(
    a.map((x) => x.recommendation_id),
    b.map((x) => x.recommendation_id),
    "o mesmo mundo gerou recomendações diferentes",
  );
});

test("recomendação de projeção simulada nasce carimbada como simulada", () => {
  const p = projetar(
    [
      ev("trip_started", { event_id: "e1", idempotency_key: "k1", occurred_at: "2026-07-27T10:00:00Z", source_mode: "simulated" }),
      ev("gps_batch_received", { event_id: "e2", idempotency_key: "k2", occurred_at: "2026-07-27T10:01:00Z", source_mode: "simulated" }),
    ],
    { ...OPCOES, source_mode: "simulated" },
  );
  const r = recomendar(p, { agora: AGORA });
  assert.ok(r.length >= 1);
  assert.equal(r[0].source_mode, "simulated");
  // E o id difere do da projeção real, senão as duas se confundiriam no painel.
  const real = recomendar(projecaoComSinalVelho(), { agora: AGORA });
  assert.notEqual(r[0].recommendation_id, real[0].recommendation_id);
});

test("confiança ausente ou fora de faixa invalida a recomendação", () => {
  assert.equal(exigirConfianca(undefined), null);
  assert.equal(exigirConfianca(1.5), null);
  assert.equal(exigirConfianca(-0.1), null);
  assert.equal(exigirConfianca(Number.NaN), null);
  assert.equal(exigirConfianca(0.73), 0.73);

  const politicaSemConfianca = {
    ...POLITICA_SINAL_VELHO,
    policy_id: "sem-confianca",
    avaliar: (p: ReturnType<typeof projetar>) => {
      const base = POLITICA_SINAL_VELHO.avaliar(p, { agora: AGORA, indisponivel: [] });
      return base ? { ...base, confidence: Number.NaN } : null;
    },
  };
  const r = recomendar(projecaoComSinalVelho(), { agora: AGORA, politicas: [politicaSemConfianca] });
  assert.equal(r.length, 0, "recomendação sem confiança válida foi apresentada");
});

test("política que explode não derruba as outras", () => {
  const explosiva = {
    policy_id: "explosiva",
    validade_s: 60,
    avaliar: () => {
      throw new Error("boom");
    },
  };
  const r = recomendar(projecaoComSinalVelho(), {
    agora: AGORA,
    politicas: [explosiva, POLITICA_SINAL_VELHO],
  });
  assert.equal(r.length, 1, "o Copiloto inteiro caiu por causa de uma política");
});

test("recomendação vencida vira expired", () => {
  const r = recomendar(projecaoComSinalVelho(), { agora: AGORA })[0];
  const depois = envelhecer(r, new Date(AGORA.getTime() + 10 * 60_000));
  assert.equal(depois.status, "expired");
});

test("recomendação cuja base sumiu é invalidada", () => {
  // Sem isso o painel vira uma lista de coisas que já não são verdade.
  const antes = recomendar(projecaoComSinalVelho(), { agora: AGORA });
  const agoraSemProblema = projetar([], OPCOES);
  const depois = invalidarSuperadas(antes, recomendar(agoraSemProblema, { agora: AGORA }), AGORA);
  assert.equal(depois[0].status, "invalidated");
});

test("o estado `executed` NÃO existe no contrato", () => {
  // Se o tipo permitisse representá-lo, alguém eventualmente o escreveria.
  const r = recomendar(projecaoComSinalVelho(), { agora: AGORA })[0];
  const estados = ["proposed", "expired", "dismissed", "accepted_for_future", "invalidated"];
  assert.ok(estados.includes(r.status));
  assert.ok(!estados.includes("executed"));
});

test("o painel diz por que a recomendação não foi executada", () => {
  const r = recomendar(projecaoComSinalVelho(), { agora: AGORA })[0];
  const painel = paraPainel(r);
  assert.match(String(painel.porque_nao_executada), /sombra/i);
  assert.ok(Array.isArray(painel.fatos_utilizados));
  assert.ok("indisponivel" in painel, "o painel precisa dizer o que NÃO sabe");
});

/* ------------------------------------------------------------------ *
 * Encerramento
 * ------------------------------------------------------------------ */

void Promise.all(pendentes).then(() => {
  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} bridge tests OK ===`);
});
