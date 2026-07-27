/**
 * Contratos dos eventos — schema documentado × código aplicado.
 *
 * O risco que estes testes cobrem não é "falta um validador": `checkEvent()` já
 * é o portão do runtime. O risco é **os dois divergirem** — o schema descrever
 * um acordo que o código não aplica, e alguém confiar no schema.
 *
 * Por isso metade dos testes aqui cruza um contra o outro, em vez de olhar cada
 * um sozinho.
 */

import assert from "node:assert/strict";
import { checkEvent, EVENT_TYPES, type EventEnvelope } from "./contracts/event-catalog";
import {
  carregarCatalogo,
  contratoDe,
  obrigatoriosExtraDe,
  tiposComContrato,
  tiposSemContrato,
  validarPayload,
  verificarCobertura,
} from "./contracts/event-schema";
import { traduzirLoteGps, type RegistroDeDispositivos } from "./ingest/device-ingest";
import { projetar } from "./projections/operacao-viva";
import { recomendar } from "./copiloto/shadow";

let passed = 0;
const failures: string[] = [];
const pendentes: Promise<void>[] = [];
function test(nome: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
function testeAsync(nome: string, fn: () => Promise<void>): void {
  pendentes.push(
    fn().then(
      () => {
        passed += 1;
      },
      (e: unknown) => {
        failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
      },
    ),
  );
}

const AGORA = new Date("2026-07-27T12:00:00.000Z");

function envelope(extra: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    event_id: "ev-1",
    event_type: "trip_started",
    event_version: "trip_started@1.0.0",
    unit_id: "ITAIM",
    trip_id: "t-1",
    occurred_at: "2026-07-27T11:50:00.000Z",
    origin: "device",
    source_mode: "real",
    idempotency_key: "k-1",
    payload: {},
    ...extra,
  };
}

console.log("=== Contratos dos eventos (schema × código) ===");

/* ------------------------------------------------------------------ *
 * 1. O schema existe e é honesto sobre o que cobre
 * ------------------------------------------------------------------ */

test("o catálogo carrega e declara sua versão", () => {
  const c = carregarCatalogo();
  assert.equal(c.version, "event-catalog@1.0.0");
  assert.ok(Array.isArray(c.required) && c.required.length > 0);
});

test("o validador cobre TODA palavra-chave usada no schema", () => {
  // Sem isto, alguém acrescentaria `oneOf` ao arquivo, acharia que está
  // validando, e o validador passaria por cima em silêncio.
  const naoCobertas = verificarCobertura();
  assert.deepEqual(naoCobertas, [], `palavras-chave sem suporte: ${naoCobertas.join(", ")}`);
});

test("só recebem contrato os tipos com produtor ou consumidor real", () => {
  const com = tiposComContrato();
  const sem = tiposSemContrato();
  assert.equal(com.length, 9, `esperava 9 tipos com contrato, achei ${com.length}`);
  assert.deepEqual(sem, ["order_state_changed", "source_event_received"]);
  // E os dois conjuntos juntos precisam dar exatamente o que o runtime aceita.
  assert.deepEqual([...com, ...sem].sort(), [...EVENT_TYPES].sort());
});

test("cada contrato nomeia produtor, consumidores, retenção e replay", () => {
  for (const t of tiposComContrato()) {
    const c = contratoDe(t);
    assert.ok(c, `${t} sem contrato`);
    assert.ok(c.produtor?.length > 0, `${t} sem produtor`);
    assert.ok(Array.isArray(c.consumidores) && c.consumidores.length > 0, `${t} sem consumidor`);
    assert.equal(typeof c.retencao_meses, "number", `${t} sem retenção`);
    assert.ok(c.replay?.length > 0, `${t} sem política de replay`);
    assert.ok(c.classificacao?.length > 0, `${t} sem classificação de dados`);
  }
});

/* ------------------------------------------------------------------ *
 * 2. Validação de payload — a lacuna que este módulo fecha
 * ------------------------------------------------------------------ */

const GPS_BOM = { latitude: -23.55, longitude: -46.63, accuracy_m: 12 };

test("payload válido é aceito", () => {
  assert.equal(validarPayload("gps_batch_received", GPS_BOM).ok, true);
});

test("campo obrigatório ausente é recusado, com o nome do campo", () => {
  const r = validarPayload("gps_batch_received", { latitude: -23.55, longitude: -46.63 });
  assert.equal(r.ok, false);
  assert.ok(r.ok === false && r.falhas.some((f) => f.campo === "accuracy_m"));
});

test("payload inválido é recusado — o envelope perfeito não salva o conteúdo", () => {
  // Este é o caso que passava antes: envelope impecável, payload lixo.
  const r = validarPayload("gps_batch_received", { ...GPS_BOM, latitude: "norte" });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.falhas[0].motivo : "", /esperava number/);
});

test("faixa numérica é aplicada", () => {
  for (const ruim of [{ latitude: 999 }, { longitude: -999 }, { accuracy_m: -1 }]) {
    const r = validarPayload("gps_batch_received", { ...GPS_BOM, ...ruim });
    assert.equal(r.ok, false, `aceitou ${JSON.stringify(ruim)}`);
  }
});

test("integer satisfaz number, mas texto não satisfaz nenhum dos dois", () => {
  assert.equal(validarPayload("gps_batch_received", { ...GPS_BOM, accuracy_m: 12 }).ok, true);
  assert.equal(validarPayload("gps_batch_received", { ...GPS_BOM, accuracy_m: "12" }).ok, false);
});

test("campo desconhecido NÃO é erro — é como a evolução aditiva funciona", () => {
  // Um produtor novo acrescenta campo; o consumidor antigo o ignora. Recusar
  // aqui pararia todo consumidor não atualizado.
  assert.equal(validarPayload("gps_batch_received", { ...GPS_BOM, campo_novo: 1 }).ok, true);
});

test("limite de texto na ocorrência é aplicado", () => {
  assert.equal(validarPayload("occurrence_created", { tipo: "atraso" }).ok, true);
  const r = validarPayload("occurrence_created", { tipo: "x", descricao: "a".repeat(501) });
  assert.equal(r.ok, false);
});

test("enum fora do conjunto é recusado", () => {
  assert.equal(
    validarPayload("occurrence_created", { tipo: "x", gravidade: "altissima" }).ok,
    false,
  );
  assert.equal(validarPayload("occurrence_created", { tipo: "x", gravidade: "alta" }).ok, true);
});

test("tipo SEM contrato é recusado, nunca ignorado", () => {
  // Ignorar deixaria os dois declarados-sem-contrato entrarem sem verificação
  // nenhuma de conteúdo — a porta que este módulo existe para fechar.
  for (const t of tiposSemContrato()) {
    const r = validarPayload(t, { qualquer: "coisa" });
    assert.equal(r.ok, false, `${t} passou sem contrato`);
    assert.match(r.ok === false ? r.falhas[0].motivo : "", /sem contrato/);
  }
});

/* ------------------------------------------------------------------ *
 * 3. Cruzamento com o código aplicado
 * ------------------------------------------------------------------ */

test("os tipos do schema são EXATAMENTE os de EVENT_TYPES", () => {
  const doSchema = [...((carregarCatalogo().$defs.tipos.enum ?? []) as string[])].sort();
  assert.deepEqual(doSchema, tiposComContrato());
});

test("a versão do envelope casa com o formato que o schema exige", () => {
  const padrao = new RegExp(carregarCatalogo().properties.event_version.pattern as string);
  for (const t of tiposComContrato()) {
    const versao = contratoDe(t)?.versao ?? "";
    assert.match(versao, padrao, `${t}: versão ${versao} fora do formato`);
    assert.ok(versao.startsWith(`${t}@`), `${t}: versão não começa pelo próprio nome`);
  }
});

test("os obrigatórios do schema são os mesmos que checkEvent exige", () => {
  // Divergência aqui é o defeito clássico: o schema promete uma coisa e o
  // portão do runtime aplica outra.
  for (const campo of carregarCatalogo().required) {
    const semCampo = { ...envelope() } as Record<string, unknown>;
    delete semCampo[campo];
    const r = checkEvent(semCampo);
    assert.equal(r.ok, false, `checkEvent aceitou envelope sem "${campo}", que o schema exige`);
  }
});

test("versão incompatível é recusada pelos dois lados", () => {
  const r = checkEvent(envelope({ event_type: "nao_existe" as never }));
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "unknown_type");
  assert.equal(validarPayload("nao_existe", {}).ok, false);
});

test("duplicação: a idempotency key é obrigatória e é o que a projeção usa", () => {
  assert.equal(checkEvent(envelope({ idempotency_key: "" })).ok, false);
  const e = envelope({ event_type: "occurrence_created", event_version: "occurrence_created@1.0.0", payload: { tipo: "x" } });
  const p = projetar([e, e, e], { agora: AGORA, unit_id: "ITAIM", source_mode: "real" });
  assert.equal(p.viagens[0].ocorrencias_abertas, 1, "a duplicata inflou a projeção");
});

test("real, simulado e controle são separados de ponta a ponta", () => {
  const c = carregarCatalogo();
  assert.deepEqual(c.properties.source_mode.enum, ["real", "simulated", "control"]);
  // O envelope recusa a ausência...
  assert.equal(checkEvent(envelope({ source_mode: undefined as never })).ok, false);
  // ...e a projeção não mistura os modos.
  const p = projetar(
    [
      envelope({ event_id: "a", idempotency_key: "ka" }),
      envelope({ event_id: "b", idempotency_key: "kb", trip_id: "t-2", source_mode: "simulated" }),
    ],
    { agora: AGORA, unit_id: "ITAIM", source_mode: "real" },
  );
  assert.equal(p.viagens.length, 1);
});

test("uma recomendação herda o modo da projeção que a originou", () => {
  const eventos = [
    envelope({ event_id: "a", idempotency_key: "ka", source_mode: "control", occurred_at: "2026-07-27T10:00:00Z" }),
    envelope({
      event_id: "b", idempotency_key: "kb", source_mode: "control",
      event_type: "gps_batch_received", event_version: "gps_batch_received@1.0.0",
      occurred_at: "2026-07-27T10:01:00Z", payload: GPS_BOM,
    }),
  ];
  const p = projetar(eventos, { agora: AGORA, unit_id: "ITAIM", source_mode: "control" });
  const r = recomendar(p, { agora: AGORA });
  assert.ok(r.length >= 1);
  assert.equal(r[0].source_mode, "control", "recomendação de controle apareceu como real");
});

test("PII é recusada pelo envelope, em qualquer profundidade", () => {
  for (const p of [{ customer_phone: "1" }, { a: { nome_cliente: "x" } }, { l: [{ endereco: "y" }] }]) {
    const r = checkEvent(envelope({ payload: p }));
    assert.equal(r.ok, false, `PII passou: ${JSON.stringify(p)}`);
    assert.equal(r.ok === false && r.rejection, "pii_suspected");
  }
});

/* ------------------------------------------------------------------ *
 * 4. O produtor real obedece ao contrato que produz
 * ------------------------------------------------------------------ */

const REGISTRO: RegistroDeDispositivos = {
  buscar: async (id) => (id === "dev-1" ? { device_id: "dev-1", unit_id: "ITAIM" } : null),
};

testeAsync("o que device-ingest produz passa no schema do próprio tipo", async () => {
  // O produtor real do único evento com produtor real. Se ele produzir algo que
  // o contrato recusa, o contrato está errado ou o produtor está.
  const r = await traduzirLoteGps({
    corpo: {
      points: [
        {
          point_id: "p1", idempotency_key: "gps:dev-1:t-1:1", trip_id: "t-1", device_id: "dev-1",
          latitude: -23.55, longitude: -46.63, accuracy_m: 12,
          occurred_at: "2026-07-27T11:59:00.000Z", sequence_local: 1, provider: "fused", is_mock: false,
        },
      ],
    },
    device_id_autenticado: "dev-1",
    registro: REGISTRO,
    recebido_em: AGORA,
    source_mode: "real",
  });
  assert.equal(r.fatos.length, 1);
  const fato = r.fatos[0];
  assert.equal(fato.event_type, "gps_batch_received");
  assert.equal(validarPayload(fato.event_type, fato.payload).ok, true, "o produtor viola o próprio contrato");
  // E os obrigatórios extras do contrato estão presentes no envelope.
  for (const campo of obrigatoriosExtraDe(fato.event_type)) {
    assert.ok(
      (fato as unknown as Record<string, unknown>)[campo] !== undefined,
      `o produtor não preencheu "${campo}", que o contrato exige`,
    );
  }
});

test("todo tipo consumido pela projeção tem contrato", () => {
  // Consumidor sem contrato é acordo que só uma parte conhece.
  const consumidos = [
    "trip_created", "trip_started", "arrival_detected", "delivery_confirmed",
    "trip_return_started", "trip_returned", "trip_closed",
    "gps_batch_received", "occurrence_created",
  ];
  const com = tiposComContrato();
  for (const t of consumidos) {
    assert.ok(com.includes(t), `${t} é consumido e não tem contrato`);
  }
});

void Promise.all(pendentes).then(() => {
  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} event-contract tests OK ===`);
});
