/**
 * Bloco 3A — persistência crítica e outbox.
 *
 * O que estes testes protegem não é "o código roda". É que a aceitação de um
 * fato só existe DEPOIS de uma gravação durável, e que fato e mensagem vivem
 * ou morrem juntos.
 *
 * O escritor é falso aqui de propósito: falha injetada em ponto exato não se
 * consegue provocar contra PostgreSQL real sem truque. A prova contra o banco
 * de verdade está em `run-pg-repository-tests.ts`, que exercita
 * `PgTransactionalWriter`. Os dois se complementam — este cobre a DECISÃO, o
 * outro cobre a TRANSAÇÃO.
 */

import assert from "node:assert/strict";
import type { EventEnvelope } from "./contracts/event-catalog";
import type { OutboxMessage } from "./contracts/messaging";
import {
  ingerir,
  ehRoteavel,
  type EscritorTransacional,
  type FatoParaGravar,
} from "./ingest/ingest-service";

let passed = 0;
const failures: string[] = [];
const pendentes: Promise<void>[] = [];
function teste(nome: string, fn: () => Promise<void>): void {
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

/* ------------------------------------------------------------------ *
 * Escritor falso, com transação de verdade
 * ------------------------------------------------------------------ */

/**
 * Simula a semântica que o PostgreSQL garante: ou os dois lados entram, ou
 * nenhum entra. `falharApos` permite quebrar exatamente entre os dois.
 */
class EscritorEmMemoria implements EscritorTransacional {
  readonly fatos: FatoParaGravar[] = [];
  readonly mensagens: OutboxMessage[] = [];
  falharApos: "fatos" | "nada" | "tudo" = "nada";

  async commit(
    fatos: readonly FatoParaGravar[],
    mensagens: readonly OutboxMessage[],
  ): Promise<
    { ok: true; facts: number; messages: number } | { ok: false; code: string; detail: string }
  > {
    // Trabalho em área separada: nada toca o estado confirmado antes do fim.
    const fatosTx: FatoParaGravar[] = [];
    const chaves = new Set(this.fatos.map((f) => f.idempotency_key));

    if (this.falharApos === "tudo") {
      return { ok: false, code: "storage", detail: "banco indisponível" };
    }

    for (const f of fatos) {
      if (chaves.has(f.idempotency_key)) continue; // duplicata: ON CONFLICT DO NOTHING
      fatosTx.push(f);
      chaves.add(f.idempotency_key);
    }

    if (this.falharApos === "fatos") {
      // Falhou DEPOIS de inserir os fatos e ANTES da outbox. O rollback
      // desfaz tudo — é o caso que separa transação de dual-write.
      return { ok: false, code: "storage", detail: "falha ao enfileirar" };
    }

    const jaEnfileiradas = new Set(this.mensagens.map((m) => m.idempotency_key));
    const novas = mensagens.filter(
      (m) => !jaEnfileiradas.has(m.idempotency_key) && fatosTx.some((f) => f.idempotency_key === m.idempotency_key),
    );

    this.fatos.push(...fatosTx);
    this.mensagens.push(...novas);
    return { ok: true, facts: fatosTx.length, messages: novas.length };
  }
}

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

async function ingerirCom(e: EscritorEmMemoria, fatos: EventEnvelope[]) {
  return ingerir(fatos, { escritor: e, recebido_em: AGORA });
}

console.log("=== Bloco 3A — persistência crítica e outbox ===");

/* ------------------------------------------------------------------ *
 * 1-2. Fato e mensagem, na mesma unidade
 * ------------------------------------------------------------------ */

teste("evento válido cria event log E outbox", async () => {
  const w = new EscritorEmMemoria();
  const r = await ingerirCom(w, [fato()]);
  assert.equal(r.aceito, true);
  assert.equal(r.gravados, 1);
  assert.equal(r.mensagens, 1);
  assert.equal(w.fatos.length, 1);
  assert.equal(w.mensagens.length, 1);
});

teste("a mensagem carrega a MESMA chave do fato que a causou", async () => {
  // É essa igualdade que faz a deduplicação do fato deduplicar a mensagem
  // junto — e o que permite auditar de onde veio cada aviso.
  const w = new EscritorEmMemoria();
  await ingerirCom(w, [fato()]);
  assert.equal(w.mensagens[0].idempotency_key, w.fatos[0].idempotency_key);
});

teste("a mensagem leva o source_mode — simulado não vira real na ponte", async () => {
  const w = new EscritorEmMemoria();
  await ingerirCom(w, [fato({ source_mode: "simulated" })]);
  assert.equal(w.mensagens[0].payload.source_mode, "simulated");
});

/* ------------------------------------------------------------------ *
 * 3-4. Rollback
 * ------------------------------------------------------------------ */

teste("falha entre o fato e a outbox NÃO deixa fato órfão", async () => {
  // O caso que separa transação real de dual-write.
  const w = new EscritorEmMemoria();
  w.falharApos = "fatos";
  const r = await ingerirCom(w, [fato()]);
  assert.equal(r.aceito, false);
  assert.equal(w.fatos.length, 0, "o fato sobreviveu sem a mensagem");
  assert.equal(w.mensagens.length, 0);
});

teste("falha de persistência NUNCA responde aceito", async () => {
  // Responder sucesso aqui faria o aparelho apagar a fila local de um ponto
  // que nunca chegou.
  const w = new EscritorEmMemoria();
  w.falharApos = "tudo";
  const r = await ingerirCom(w, [fato()]);
  assert.equal(r.aceito, false);
  assert.equal(r.gravados, 0);
  assert.equal(r.erro?.code, "storage");
});

teste("a resposta de erro não vaza payload nem credencial", async () => {
  const w = new EscritorEmMemoria();
  w.falharApos = "tudo";
  const r = await ingerirCom(w, [fato({ payload: { latitude: -23.5 } })]);
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes("-23.5"), "o payload voltou na resposta de erro");
  assert.ok(!/bearer|token/i.test(texto));
});

/* ------------------------------------------------------------------ *
 * 5. Duplicata
 * ------------------------------------------------------------------ */

teste("evento duplicado não duplica fato nem outbox", async () => {
  const w = new EscritorEmMemoria();
  await ingerirCom(w, [fato()]);
  const r = await ingerirCom(w, [fato()]);
  assert.equal(r.aceito, true, "duplicata virou erro operacional");
  assert.equal(r.gravados, 0);
  assert.equal(r.duplicados, 1);
  assert.equal(w.fatos.length, 1);
  assert.equal(w.mensagens.length, 1, "a mensagem saiu duas vezes");
});

teste("o mesmo lote cem vezes deixa exatamente um fato", async () => {
  const w = new EscritorEmMemoria();
  for (let i = 0; i < 100; i += 1) await ingerirCom(w, [fato()]);
  assert.equal(w.fatos.length, 1);
  assert.equal(w.mensagens.length, 1);
});

/* ------------------------------------------------------------------ *
 * 6-7. Contrato e roteabilidade
 * ------------------------------------------------------------------ */

teste("contrato inválido não grava", async () => {
  const w = new EscritorEmMemoria();
  const r = await ingerirCom(w, [
    fato({ source_mode: undefined as never }),
    fato({ event_id: "ev-2", idempotency_key: "k-2", occurred_at: "ontem" }),
  ]);
  assert.equal(w.fatos.length, 0);
  assert.equal(r.recusados.length, 2);
  assert.ok(r.recusados.every((x) => x.motivo === "envelope_invalido"));
});

teste("payload inválido é recusado com o campo que falhou", async () => {
  const w = new EscritorEmMemoria();
  const r = await ingerirCom(w, [
    fato({
      event_type: "gps_batch_received",
      event_version: "gps_batch_received@1.0.0",
      payload: { latitude: 999, longitude: -46.6, accuracy_m: 12 },
    }),
  ]);
  assert.equal(w.fatos.length, 0);
  assert.equal(r.recusados[0].motivo, "payload_invalido");
  assert.match(r.recusados[0].detalhe, /latitude/);
});

teste("tipo NÃO ROTEÁVEL é recusado antes de gravar — nunca entra em retry", async () => {
  // Aceitá-lo criaria trabalho que ninguém consegue concluir, e o sintoma
  // apareceria dias depois como uma dead-letter que ninguém sabe explicar.
  assert.equal(ehRoteavel("gps_batch_received"), true);
  assert.equal(ehRoteavel("source_event_received"), false);
  assert.equal(ehRoteavel("order_state_changed"), false);

  const w = new EscritorEmMemoria();
  const r = await ingerirCom(w, [
    fato({ event_type: "source_event_received", event_version: "source_event_received@1.0.0" }),
  ]);
  assert.equal(w.fatos.length, 0, "gravou um fato sem destino");
  assert.equal(w.mensagens.length, 0, "enfileirou trabalho que ninguém consome");
  assert.equal(r.recusados[0].motivo, "nao_roteavel");
});

teste("recusa individual não derruba o resto do lote", async () => {
  // Um ponto inválido no meio de cinquenta não pode fazer os outros quarenta
  // e nove voltarem para a fila do aparelho.
  const w = new EscritorEmMemoria();
  const r = await ingerirCom(w, [
    fato({ event_id: "a", idempotency_key: "ka" }),
    fato({ event_id: "b", idempotency_key: "kb", occurred_at: "invalido" }),
    fato({ event_id: "c", idempotency_key: "kc" }),
  ]);
  assert.equal(r.aceito, true);
  assert.equal(r.gravados, 2);
  assert.equal(r.recusados.length, 1);
});

/* ------------------------------------------------------------------ *
 * 8-9. Isolamento e ordem da resposta
 * ------------------------------------------------------------------ */

teste("o crítico grava sem nenhum consumidor existir", async () => {
  // Não há consumidor neste teste — e a gravação acontece assim mesmo. É a
  // definição operacional do isolamento.
  const w = new EscritorEmMemoria();
  const r = await ingerirCom(w, [fato()]);
  assert.equal(r.aceito, true);
  assert.equal(w.mensagens.length, 1, "a mensagem espera na fila, e isso basta");
});

teste("aceito é verdadeiro SOMENTE depois do commit", async () => {
  // Ordem de causalidade: o escritor registra a chamada; o resultado só pode
  // ser aceito se ela já aconteceu.
  const w = new EscritorEmMemoria();
  let commitOcorreu = false;
  const espiao: EscritorTransacional = {
    commit: async (f, m) => {
      commitOcorreu = true;
      return w.commit(f, m);
    },
  };
  const r = await ingerir([fato()], { escritor: espiao, recebido_em: AGORA });
  assert.equal(commitOcorreu, true);
  assert.equal(r.aceito, true);
});

teste("lote sem nada aprovado responde processado, não falha de persistência", async () => {
  // O lote FOI processado e o resultado é conhecido. Chamar isso de falha
  // faria o aparelho reenviar para sempre o que nunca vai ser aceito.
  const w = new EscritorEmMemoria();
  const r = await ingerirCom(w, [fato({ occurred_at: "invalido" })]);
  assert.equal(r.aceito, true);
  assert.equal(r.gravados, 0);
  assert.equal(r.erro, undefined);
});

/* ------------------------------------------------------------------ *
 * 10. Carimbo do servidor
 * ------------------------------------------------------------------ */

teste("recorded_at é do SERVIDOR, não do produtor", async () => {
  // Deixar o produtor preenchê-lo permitiria a ele mentir sobre a própria
  // demora — e a latência de sincronização deixaria de ser mensurável.
  const w = new EscritorEmMemoria();
  await ingerirCom(w, [fato({ occurred_at: "2026-07-27T10:00:00.000Z" })]);
  assert.equal(w.fatos[0].recorded_at, AGORA.toISOString());
  assert.equal(w.fatos[0].occurred_at, "2026-07-27T10:00:00.000Z");
  assert.notEqual(w.fatos[0].recorded_at, w.fatos[0].occurred_at);
});

teste("o objeto do fato é derivado da viagem, do pedido ou do aparelho", async () => {
  const w = new EscritorEmMemoria();
  await ingerirCom(w, [fato()]);
  assert.equal(w.fatos[0].object_type, "trip");
  assert.equal(w.fatos[0].object_id, "t-1");
});

void Promise.all(pendentes).then(() => {
  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} ingest-service tests OK ===`);
});
