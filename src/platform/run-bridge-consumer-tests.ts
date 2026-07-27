/**
 * Blocos 3B e 3C — consumidor, projeção, replay e isolamento.
 *
 * A ponte inteira, ponta a ponta, sem banco: ingestão → outbox → consumidor →
 * projeção → replay. O que se prova aqui é que ela sobrevive ao que a realidade
 * faz com sistemas distribuídos — mensagem repetida, ordem trocada, worker que
 * morre no pior momento, e o consumidor inteiro fora do ar.
 */

import assert from "node:assert/strict";
import type { EventEnvelope } from "./contracts/event-catalog";
import type { OutboxMessage } from "./contracts/messaging";
import {
  ingerir,
  type EscritorTransacional,
  type FatoParaGravar,
} from "./ingest/ingest-service";
import {
  consumir,
  projecaoAtual,
  reconstruirPorReplay,
  envelopeDaMensagem,
  MemoriaDaProjecao,
  type MensagemDaPonte,
} from "./projections/consumidor";
import { mesmoEstadoLogico } from "./projections/operacao-viva";
import { recomendar } from "./copiloto/shadow";

let passed = 0;
const failures: string[] = [];
const pendentes: Promise<void>[] = [];
function teste(nome: string, fn: () => Promise<void> | void): void {
  pendentes.push(
    Promise.resolve()
      .then(fn)
      .then(
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
const OPC = { agora: AGORA, unit_id: "ITAIM", source_mode: "real" as const };

/* ------------------------------------------------------------------ *
 * Fila de verdade: o que a ingestão produz é o que o consumidor lê
 * ------------------------------------------------------------------ */

class Fila implements EscritorTransacional {
  readonly fatos: FatoParaGravar[] = [];
  readonly pendentes: OutboxMessage[] = [];
  private readonly chaves = new Set<string>();

  async commit(fatos: readonly FatoParaGravar[], msgs: readonly OutboxMessage[]) {
    const novos = fatos.filter((f) => !this.chaves.has(f.idempotency_key));
    for (const f of novos) this.chaves.add(f.idempotency_key);
    const novasMsgs = msgs.filter((m) => novos.some((f) => f.idempotency_key === m.idempotency_key));
    this.fatos.push(...novos);
    this.pendentes.push(...novasMsgs);
    return { ok: true as const, facts: novos.length, messages: novasMsgs.length };
  }

  /** O que o worker pega da fila. Esvazia, como um claim faria. */
  claim(): MensagemDaPonte[] {
    const lote = this.pendentes.splice(0, this.pendentes.length);
    return lote.map((m) => ({
      outbox_id: m.outbox_id,
      kind: m.kind,
      idempotency_key: m.idempotency_key,
      payload: m.payload,
    }));
  }
}

function evento(extra: Partial<EventEnvelope> = {}): EventEnvelope {
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

const gps = (id: string, quando: string, extra: Partial<EventEnvelope> = {}): EventEnvelope =>
  evento({
    event_id: id,
    idempotency_key: `k-${id}`,
    event_type: "gps_batch_received",
    event_version: "gps_batch_received@1.0.0",
    occurred_at: quando,
    payload: { latitude: -23.55, longitude: -46.63, accuracy_m: 12 },
    ...extra,
  });

async function pontaAPonta(eventos: EventEnvelope[], memoria = new MemoriaDaProjecao()) {
  const fila = new Fila();
  await ingerir(eventos, { escritor: fila, recebido_em: AGORA });
  const r = consumir(fila.claim(), { memoria });
  return { fila, memoria, consumo: r };
}

console.log("=== Blocos 3B e 3C — consumidor, projeção, replay, isolamento ===");

/* ------------------------------------------------------------------ *
 * 3B — consumo
 * ------------------------------------------------------------------ */

teste("a ponte anda: ingestão → outbox → consumidor → projeção", async () => {
  const { memoria, consumo } = await pontaAPonta([
    evento({ event_id: "a", idempotency_key: "ka", event_type: "trip_created", event_version: "trip_created@1.0.0" }),
    evento({ event_id: "b", idempotency_key: "kb" }),
  ]);
  assert.equal(consumo.aplicados, 2);
  const p = projecaoAtual(memoria, OPC);
  assert.equal(p.viagens.length, 1);
  assert.equal(p.viagens[0].estado, "em_rota");
});

teste("processar a mesma mensagem de novo é idempotente", async () => {
  const memoria = new MemoriaDaProjecao();
  const fila = new Fila();
  await ingerir([evento()], { escritor: fila, recebido_em: AGORA });
  const lote = fila.claim();
  const a = consumir(lote, { memoria });
  const b = consumir(lote, { memoria });
  assert.equal(a.aplicados, 1);
  assert.equal(b.aplicados, 0);
  assert.equal(b.duplicados, 1);
  assert.equal(memoria.tamanho, 1);
});

teste("dois workers com o mesmo lote não aplicam o efeito duas vezes", async () => {
  // Um claim mal configurado entrega a mesma mensagem a dois workers. A
  // projeção não pode depender de o claim estar certo.
  const memoria = new MemoriaDaProjecao();
  const fila = new Fila();
  await ingerir(
    [evento({ event_type: "occurrence_created", event_version: "occurrence_created@1.0.0", payload: { tipo: "atraso" } })],
    { escritor: fila, recebido_em: AGORA },
  );
  const lote = fila.claim();
  consumir(lote, { memoria });
  consumir(lote, { memoria });
  assert.equal(projecaoAtual(memoria, OPC).viagens[0].ocorrencias_abertas, 1);
});

teste("crash DEPOIS do efeito e ANTES da confirmação não duplica na retomada", async () => {
  // O caso mais incômodo de todos. Na retomada a mensagem volta, é
  // reconhecida, e o estado não muda.
  const memoria = new MemoriaDaProjecao();
  const fila = new Fila();
  await ingerir([evento()], { escritor: fila, recebido_em: AGORA });
  const lote = fila.claim();
  consumir(lote, { memoria }); // efeito aplicado
  // ...worker morre antes de confirmar; a mensagem volta para a fila...
  const antes = projecaoAtual(memoria, OPC);
  consumir(lote, { memoria }); // retomada
  assert.ok(mesmoEstadoLogico(antes, projecaoAtual(memoria, OPC)));
});

teste("mensagem de tipo que não é desta projeção é ignorada, com motivo", () => {
  // Diferente da recusa na ingestão: aqui é uma mensagem que OUTRO consumidor
  // entende, e ela segue o caminho dela.
  const r = consumir([{ outbox_id: "o1", kind: "copilot_recommendation", idempotency_key: "k", payload: {} }], {
    memoria: new MemoriaDaProjecao(),
  });
  assert.equal(r.aplicados, 0);
  assert.equal(r.ignorados.length, 1);
  assert.match(r.ignorados[0].motivo, /não é desta projeção/);
});

teste("mensagem sem os campos mínimos é ignorada, não aplicada pela metade", () => {
  const r = consumir([{ outbox_id: "o1", kind: "trip_started", idempotency_key: "k", payload: { unit_id: "ITAIM" } }], {
    memoria: new MemoriaDaProjecao(),
  });
  assert.equal(r.aplicados, 0);
  assert.equal(r.ignorados.length, 1);
  assert.equal(envelopeDaMensagem({ outbox_id: "o", kind: "x", idempotency_key: "k", payload: {} }), null);
});

/* ------------------------------------------------------------------ *
 * 3B — ordem, expiração, modos
 * ------------------------------------------------------------------ */

teste("evento fora de ordem não faz a viagem retroceder", async () => {
  const { memoria } = await pontaAPonta([
    evento({ event_id: "b", idempotency_key: "kb", event_type: "delivery_confirmed", event_version: "delivery_confirmed@1.0.0", occurred_at: "2026-07-27T11:55:00.000Z" }),
    evento({ event_id: "a", idempotency_key: "ka", occurred_at: "2026-07-27T11:00:00.000Z" }),
  ]);
  assert.equal(projecaoAtual(memoria, OPC).viagens[0].estado, "entregue");
});

teste("evento velho NÃO substitui estado mais novo, e fica registrado", async () => {
  const { memoria } = await pontaAPonta([
    evento({ event_id: "novo", idempotency_key: "kn", event_type: "trip_closed", event_version: "trip_closed@1.0.0", occurred_at: "2026-07-27T11:59:00.000Z" }),
    evento({ event_id: "velho", idempotency_key: "kv", occurred_at: "2026-07-27T10:00:00.000Z" }),
  ]);
  const p = projecaoAtual(memoria, OPC);
  assert.equal(p.viagens[0].estado, "encerrada");
  // O fato velho não some: ele entra no histórico da viagem.
  assert.equal(p.viagens[0].eventos.length, 2, "o evento velho foi descartado em vez de registrado");
});

teste("sinal expira sozinho: sem evento novo, o frescor degrada", async () => {
  const { memoria } = await pontaAPonta([
    evento({ event_id: "a", idempotency_key: "ka", occurred_at: "2026-07-27T11:00:00.000Z" }),
    gps("g1", "2026-07-27T11:00:30.000Z"),
  ]);
  const cedo = projecaoAtual(memoria, { ...OPC, agora: new Date("2026-07-27T11:01:00Z") });
  const tarde = projecaoAtual(memoria, { ...OPC, agora: new Date("2026-07-27T12:00:00Z") });
  assert.equal(cedo.viagens[0].frescor, "fresh");
  assert.equal(tarde.viagens[0].frescor, "stale");
  assert.equal(tarde.dimensoes.integridade_sinal, "stale");
});

teste("viagem encerrada some da carga — estado derivado não fica eterno", async () => {
  const { memoria } = await pontaAPonta([
    evento({ event_id: "a", idempotency_key: "ka" }),
    evento({ event_id: "b", idempotency_key: "kb", event_type: "trip_closed", event_version: "trip_closed@1.0.0", occurred_at: "2026-07-27T11:58:00.000Z" }),
  ]);
  const p = projecaoAtual(memoria, OPC);
  assert.equal(p.viagens[0].estado, "encerrada");
  assert.equal(p.dimensoes.carga, 0, "viagem encerrada continua pesando na carga");
});

teste("real, simulado e controle NUNCA se misturam na projeção", async () => {
  const memoria = new MemoriaDaProjecao();
  await pontaAPonta(
    [
      evento({ event_id: "r", idempotency_key: "kr" }),
      evento({ event_id: "s", idempotency_key: "ks", trip_id: "t-2", source_mode: "simulated" }),
      evento({ event_id: "c", idempotency_key: "kc", trip_id: "t-3", source_mode: "control" }),
    ],
    memoria,
  );
  assert.equal(projecaoAtual(memoria, OPC).viagens.length, 1);
  assert.equal(projecaoAtual(memoria, { ...OPC, source_mode: "simulated" }).viagens.length, 1);
  assert.equal(projecaoAtual(memoria, { ...OPC, source_mode: "control" }).viagens.length, 1);
});

teste("um fato simulado permanece identificado até a recomendação", async () => {
  const memoria = new MemoriaDaProjecao();
  await pontaAPonta(
    [
      evento({ event_id: "s", idempotency_key: "ks", source_mode: "simulated", occurred_at: "2026-07-27T10:00:00.000Z" }),
      gps("gs", "2026-07-27T10:01:00.000Z", { source_mode: "simulated" }),
    ],
    memoria,
  );
  const p = projecaoAtual(memoria, { ...OPC, source_mode: "simulated" });
  const r = recomendar(p, { agora: AGORA });
  assert.ok(r.length >= 1);
  assert.equal(r[0].source_mode, "simulated");
});

/* ------------------------------------------------------------------ *
 * 3B — isolamento
 * ------------------------------------------------------------------ */

teste("consumidor fora do ar: o crítico grava e a fila acumula", async () => {
  const fila = new Fila();
  for (let i = 0; i < 5; i += 1) {
    const r = await ingerir([evento({ event_id: `e${i}`, idempotency_key: `k${i}`, trip_id: `t-${i}` })], {
      escritor: fila,
      recebido_em: AGORA,
    });
    assert.equal(r.aceito, true, `a gravação ${i} dependeu do consumidor`);
  }
  assert.equal(fila.fatos.length, 5);
  assert.equal(fila.pendentes.length, 5, "o backlog não acumulou");
});

teste("consumidor que explode não impede a gravação seguinte", async () => {
  const fila = new Fila();
  await ingerir([evento()], { escritor: fila, recebido_em: AGORA });
  const memoria = new MemoriaDaProjecao();
  try {
    consumir(fila.claim(), { memoria, suportados: null as never });
  } catch {
    /* o consumidor caiu — e é justamente o ponto */
  }
  const r = await ingerir([evento({ event_id: "depois", idempotency_key: "kd", trip_id: "t-9" })], {
    escritor: fila,
    recebido_em: AGORA,
  });
  assert.equal(r.aceito, true);
});

teste("backlog é processado depois da retomada", async () => {
  const fila = new Fila();
  for (let i = 0; i < 3; i += 1) {
    await ingerir([evento({ event_id: `e${i}`, idempotency_key: `k${i}`, trip_id: `t-${i}` })], {
      escritor: fila,
      recebido_em: AGORA,
    });
  }
  const memoria = new MemoriaDaProjecao();
  const r = consumir(fila.claim(), { memoria }); // worker volta
  assert.equal(r.aplicados, 3);
  assert.equal(projecaoAtual(memoria, OPC).viagens.length, 3);
});

/* ------------------------------------------------------------------ *
 * 3C — replay
 * ------------------------------------------------------------------ */

const LOG: EventEnvelope[] = [
  evento({ event_id: "a", idempotency_key: "ka", event_type: "trip_created", event_version: "trip_created@1.0.0", occurred_at: "2026-07-27T11:00:00.000Z" }),
  evento({ event_id: "b", idempotency_key: "kb", occurred_at: "2026-07-27T11:05:00.000Z" }),
  gps("g1", "2026-07-27T11:59:00.000Z"),
  evento({ event_id: "o", idempotency_key: "ko", event_type: "occurrence_created", event_version: "occurrence_created@1.0.0", occurred_at: "2026-07-27T11:30:00.000Z", payload: { tipo: "atraso" } }),
];

teste("projeção vazia é reconstruída a partir do event log", () => {
  const m = new MemoriaDaProjecao();
  const r = reconstruirPorReplay(LOG, m, OPC);
  assert.equal(r.modo, "replay");
  assert.equal(r.fatos_relidos, 4);
  assert.equal(r.aplicados, 4);
  assert.equal(r.reconstruida.viagens.length, 1);
});

teste("o reconstruído equivale ao processado normalmente", async () => {
  const { memoria } = await pontaAPonta([...LOG]);
  const normal = projecaoAtual(memoria, OPC);
  const r = reconstruirPorReplay(LOG, new MemoriaDaProjecao(), OPC);
  assert.ok(mesmoEstadoLogico(normal, r.reconstruida), "replay divergiu do processamento normal");
});

teste("replay repetido produz o mesmo estado", () => {
  const m = new MemoriaDaProjecao();
  const a = reconstruirPorReplay(LOG, m, OPC);
  const b = reconstruirPorReplay(LOG, m, OPC);
  assert.ok(mesmoEstadoLogico(a.reconstruida, b.reconstruida));
  assert.equal(m.tamanho, 4, "o replay acumulou fatos em vez de reconstruir");
});

teste("duplicatas no log não duplicam o resultado", () => {
  const r = reconstruirPorReplay([...LOG, ...LOG], new MemoriaDaProjecao(), OPC);
  assert.equal(r.duplicados, 4);
  assert.equal(r.reconstruida.viagens[0].ocorrencias_abertas, 1);
});

teste("log embaralhado dá resultado determinístico", () => {
  const a = reconstruirPorReplay(LOG, new MemoriaDaProjecao(), OPC);
  const b = reconstruirPorReplay([...LOG].reverse(), new MemoriaDaProjecao(), OPC);
  assert.ok(mesmoEstadoLogico(a.reconstruida, b.reconstruida));
});

teste("replay NÃO ressuscita estado vencido", () => {
  // A expiração é recalculada contra o relógio de agora, não contra o do
  // evento. Um sinal que já estava velho continua velho depois do replay.
  const r = reconstruirPorReplay(LOG, new MemoriaDaProjecao(), { ...OPC, agora: new Date("2026-07-28T12:00:00Z") });
  assert.equal(r.reconstruida.viagens[0].frescor, "stale");
});

teste("replay não cria mensagem crítica nova para fato antigo", async () => {
  // Emitir outbox de novo faria um fato de ontem disparar efeito hoje.
  const fila = new Fila();
  await ingerir(LOG, { escritor: fila, recebido_em: AGORA });
  const antes = fila.pendentes.length;
  reconstruirPorReplay(LOG, new MemoriaDaProjecao(), OPC);
  assert.equal(fila.pendentes.length, antes, "o replay enfileirou trabalho crítico");
});

teste("a observabilidade distingue processamento normal de replay", () => {
  const m = new MemoriaDaProjecao();
  assert.equal(consumir([], { memoria: m }).modo, "normal");
  assert.equal(consumir([], { memoria: m, modo: "replay" }).modo, "replay");
  assert.equal(reconstruirPorReplay([], m, OPC).modo, "replay");
});

void Promise.all(pendentes).then(() => {
  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} bridge-consumer tests OK ===`);
});
