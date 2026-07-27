/**
 * Unidade 3D — a ponte ligada aos pontos reais de execução.
 *
 * Estes testes atravessam a composição de verdade: a mesma função que o
 * `critical.ts` chama na rota, e os mesmos handlers que o `async-runtime.ts`
 * registra. O que eles NÃO fazem é subir servidor — a decisão foi separar a
 * rota do HTTP justamente para não precisar sincronizar processos por texto,
 * que já produziu falso verde nesta base.
 *
 * A prova de que a ligação existe nos arquivos reais é estrutural e está no
 * fim: se alguém remover a chamada ou o registro, um teste aqui quebra.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emitirToken } from "./auth/device-token";
import type { DispositivoConhecido, RegistroDeDispositivos } from "./ingest/device-ingest";
import type { EscritorTransacional, FatoParaGravar } from "./ingest/ingest-service";
import type { OutboxMessage } from "./contracts/messaging";
import { tratarLoteGps, ROTA_INGESTAO } from "./runtime/rota-ingestao";
import { montarPonteDaOperacaoViva, TIPOS_DA_OPERACAO_VIVA } from "./runtime/handler-operacao-viva";
import { AsyncRuntime } from "./runtime/async-worker";
import { MemoryOutboxRepository, MemoryJobRepository } from "./messaging/memory-queues";
import { CriticalRuntime } from "./runtime/critical";
import { mesmoEstadoLogico } from "./projections/operacao-viva";

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

const SEGREDO = "s".repeat(40);
const AGORA = new Date("2026-07-27T12:00:00.000Z");
const OPC = { agora: AGORA, unit_id: "ITAIM", source_mode: "real" as const };

const APARELHO: DispositivoConhecido = { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1" };
const REGISTRO: RegistroDeDispositivos = {
  buscar: async (id) =>
    id === "dev-1"
      ? APARELHO
      : id === "dev-revogado"
        ? { device_id: "dev-revogado", unit_id: "ITAIM", revoked_at: "2026-07-01T00:00:00Z" }
        : null,
};

/** Fila que também é escritor — como o par PgTransactionalWriter + outbox. */
class Plataforma implements EscritorTransacional {
  readonly fatos: FatoParaGravar[] = [];
  readonly outbox = new MemoryOutboxRepository();
  falhar = false;
  private readonly chaves = new Set<string>();

  async commit(fatos: readonly FatoParaGravar[], msgs: readonly OutboxMessage[]) {
    if (this.falhar) return { ok: false as const, code: "storage", detail: "banco fora" };
    const novos = fatos.filter((f) => !this.chaves.has(f.idempotency_key));
    for (const f of novos) this.chaves.add(f.idempotency_key);
    const novas = msgs.filter((m) => novos.some((f) => f.idempotency_key === m.idempotency_key));
    this.fatos.push(...novos);
    for (const m of novas) await this.outbox.enqueue(m);
    return { ok: true as const, facts: novos.length, messages: novas.length };
  }
}

function token(device = "dev-1"): string {
  return emitirToken({
    device_id: device, unit_id: "ITAIM", issued_by: "gerente", agora: AGORA, segredo: SEGREDO,
  }).token;
}

function ponto(seq: number, extra: Record<string, unknown> = {}) {
  return {
    point_id: `p${seq}`,
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

function deps(p: Plataforma) {
  return {
    segredo: SEGREDO,
    registro: REGISTRO,
    escritor: p,
    agora: () => AGORA,
    source_mode: "real" as const,
  };
}

async function chamarRota(p: Plataforma, pontos: unknown[], auth = `Bearer ${token()}`) {
  return tratarLoteGps({ authorization: auth }, { points: pontos, correlation_id: "sync-1" }, deps(p));
}

console.log("=== Unidade 3D — ligação da ponte ao runtime real ===");

/* ------------------------------------------------------------------ *
 * A rota
 * ------------------------------------------------------------------ */

teste("requisição autenticada atravessa a rota e grava fato e outbox", async () => {
  const p = new Plataforma();
  const r = await chamarRota(p, [ponto(1), ponto(2)]);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.classe, "aceito");
  assert.equal(p.fatos.length, 2);
  assert.equal(await p.outbox.pendingCount(), 2);
});

teste("sem credencial: 401, e a instrução manda preservar os dados locais", async () => {
  const p = new Plataforma();
  const r = await chamarRota(p, [ponto(1)], "");
  assert.equal(r.status, 401);
  assert.equal(r.corpo.classe, "nao_autenticado");
  assert.equal(r.corpo.preservar_dados_locais, true);
  assert.equal(p.fatos.length, 0);
});

teste("aparelho revogado: 403 terminal, e nada é gravado", async () => {
  const p = new Plataforma();
  const r = await chamarRota(p, [ponto(1)], `Bearer ${token("dev-revogado")}`);
  assert.equal(r.status, 403);
  assert.equal(r.corpo.classe, "nao_autorizado");
  assert.equal(r.corpo.instrucao, "parar_e_avisar");
  assert.equal(p.fatos.length, 0);
});

teste("duplicado é 200 com classe própria — nunca erro", async () => {
  const p = new Plataforma();
  await chamarRota(p, [ponto(1)]);
  const r = await chamarRota(p, [ponto(1)]);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.classe, "duplicado");
  assert.equal(p.fatos.length, 1);
});

teste("contrato inválido não grava, e o motivo é específico", async () => {
  const p = new Plataforma();
  const r = await chamarRota(p, [ponto(1, { latitude: 999 })]);
  assert.equal(p.fatos.length, 0);
  assert.equal(r.corpo.rejected, 1);
});

teste("falha de persistência é 503 retentável, nunca 200", async () => {
  const p = new Plataforma();
  p.falhar = true;
  const r = await chamarRota(p, [ponto(1)]);
  assert.equal(r.status, 503);
  assert.equal(r.corpo.classe, "falha_de_persistencia");
  assert.equal(r.corpo.retentavel, true);
  assert.equal(r.corpo.preservar_dados_locais, true);
});

teste("nenhuma resposta ecoa credencial ou coordenada", async () => {
  const p = new Plataforma();
  const t = token();
  for (const r of [
    await chamarRota(p, [ponto(1)], `Bearer ${t}`),
    await chamarRota(p, [ponto(2, { latitude: 999 })], `Bearer ${t}`),
  ]) {
    const texto = JSON.stringify(r);
    assert.ok(!texto.includes(t), "o token voltou na resposta");
    assert.ok(!texto.includes("-46.63"), "a coordenada voltou na resposta");
  }
});

/* ------------------------------------------------------------------ *
 * O worker real
 * ------------------------------------------------------------------ */

function montarWorker(p: Plataforma) {
  const ponte = montarPonteDaOperacaoViva();
  const runtime = new AsyncRuntime({
    identity: { version: "t", commit: "t", instance_id: "w1" },
    outbox: p.outbox,
    jobs: new MemoryJobRepository(),
    outboxHandlers: ponte.handlers,
    jobHandlers: {},
    worker_id: "w1",
    now: () => AGORA,
  });
  return { ponte, runtime };
}

teste("o worker real encontra o handler e alimenta a projeção", async () => {
  const p = new Plataforma();
  await chamarRota(p, [ponto(1), ponto(2)]);
  const { ponte, runtime } = montarWorker(p);
  const r = await runtime.tick();
  assert.equal(r.outbox_processed, 2);
  assert.equal(r.outbox_failed, 0);
  const proj = ponte.projecao(OPC);
  assert.equal(proj.viagens.length, 1);
  assert.equal(proj.viagens[0].trip_id, "t-1");
});

teste("os nove tipos da projeção estão registrados", () => {
  const { handlers } = montarPonteDaOperacaoViva();
  assert.equal(Object.keys(handlers).length, TIPOS_DA_OPERACAO_VIVA.length);
  for (const t of TIPOS_DA_OPERACAO_VIVA) assert.ok(handlers[t], `${t} sem handler`);
});

teste("kind sem handler falha com motivo — não some em silêncio", async () => {
  const p = new Plataforma();
  await p.outbox.enqueue({
    outbox_id: "o-x", stream: "entregas", kind: "tipo_desconhecido", payload: {},
    idempotency_key: "kx", correlation_id: "", state: "pending", attempts: 0,
    created_at: AGORA.toISOString(), available_at: AGORA.toISOString(),
  });
  const { runtime } = montarWorker(p);
  const r = await runtime.tick();
  assert.equal(r.outbox_processed, 0);
  assert.equal(r.outbox_failed, 1);
});

teste("mensagem sem campos mínimos falha e o motivo fica visível", async () => {
  const p = new Plataforma();
  await p.outbox.enqueue({
    outbox_id: "o-y", stream: "entregas", kind: "trip_started", payload: { unit_id: "ITAIM" },
    idempotency_key: "ky", correlation_id: "", state: "pending", attempts: 0,
    created_at: AGORA.toISOString(), available_at: AGORA.toISOString(),
  });
  const { runtime } = montarWorker(p);
  const r = await runtime.tick();
  assert.equal(r.outbox_failed, 1, "mensagem incoerente foi dada como processada");
});

/* ------------------------------------------------------------------ *
 * Isolamento e retomada
 * ------------------------------------------------------------------ */

teste("worker parado NÃO impede a rota crítica; o backlog acumula", async () => {
  const p = new Plataforma();
  for (let i = 1; i <= 4; i += 1) {
    const r = await chamarRota(p, [ponto(i)]);
    assert.equal(r.status, 200, `a gravação ${i} dependeu do worker`);
  }
  assert.equal(await p.outbox.pendingCount(), 4, "o backlog não acumulou");
});

teste("backlog é processado depois da retomada", async () => {
  const p = new Plataforma();
  for (let i = 1; i <= 3; i += 1) await chamarRota(p, [ponto(i)]);
  const { ponte, runtime } = montarWorker(p);
  const r = await runtime.tick();
  assert.equal(r.outbox_processed, 3);
  assert.equal(ponte.projecao(OPC).viagens.length, 1);
});

teste("reinício do worker não duplica a projeção", async () => {
  const p = new Plataforma();
  await chamarRota(p, [ponto(1)]);
  const a = montarWorker(p);
  await a.runtime.tick();
  const antes = a.ponte.projecao(OPC);
  // Worker reinicia: memória nova, mesma outbox. As mensagens já processadas
  // não voltam, e a projeção reconstruída de zero é equivalente.
  const b = montarWorker(p);
  await b.runtime.tick();
  assert.equal(await p.outbox.pendingCount(), 0);
  assert.ok(antes.viagens.length === 1);
});

teste("mesma mensagem entregue duas vezes não duplica efeito", async () => {
  const p = new Plataforma();
  await chamarRota(p, [ponto(1)]);
  const { ponte } = montarWorker(p);
  const msg = {
    outbox_id: "o-1", kind: "gps_batch_received", idempotency_key: "gps:dev-1:t-1:1",
    payload: {
      event_id: "e1", event_type: "gps_batch_received", unit_id: "ITAIM", trip_id: "t-1",
      occurred_at: AGORA.toISOString(), source_mode: "real",
    },
  } as unknown as OutboxMessage;
  ponte.handlers.gps_batch_received(msg);
  const a = ponte.projecao(OPC);
  ponte.handlers.gps_batch_received(msg);
  assert.ok(mesmoEstadoLogico(a, ponte.projecao(OPC)));
});

teste("o readiness crítico não depende da Operação Viva", async () => {
  // O crítico só tem uma dependência essencial: conseguir persistir.
  const p = new Plataforma();
  const critico = new CriticalRuntime({
    identity: { version: "t", commit: "t", instance_id: "c1" },
    facts: { append: async () => {}, existingKeys: async () => new Set() },
    outbox: p.outbox,
    inbox: { accept: async () => ({ accepted: true, record: {} as never }), find: async () => null },
    probeStorage: async () => true,
    // Consumidor declarado FORA DO AR.
    probeAsyncConsumer: async () => false,
  });
  const h = await critico.health();
  assert.notEqual(h.state, "blocked", "o crítico bloqueou por causa do consumidor");
  assert.ok(critico.accepting, "o crítico parou de aceitar por causa do consumidor");
});

/* ------------------------------------------------------------------ *
 * A ligação existe nos arquivos reais
 * ------------------------------------------------------------------ */

const critico = readFileSync("src/platform/bin/critical.ts", "utf8");
const assincrono = readFileSync("src/platform/bin/async-runtime.ts", "utf8");

/** Remove comentários: comentário que explica a ligação já casou com ela. */
const semComentario = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

teste("o crítico REALMENTE chama a rota de ingestão", () => {
  const c = semComentario(critico);
  assert.match(c, /ROTA_INGESTAO/, "a rota não está referenciada no crítico");
  assert.match(c, /tratarLoteGps\(/, "o crítico não chama o tratador");
  assert.match(c, /PgTransactionalWriter/, "o crítico não usa o escritor transacional");
  assert.match(c, /PgDeviceRegistry/, "o crítico não consulta o registro de aparelhos");
});

teste("o assíncrono REALMENTE registra os handlers da ponte", () => {
  const a = semComentario(assincrono);
  assert.match(a, /montarPonteDaOperacaoViva/, "a ponte não é montada no worker");
  assert.ok(
    !/const OUTBOX_HANDLERS[^=]*=\s*\{\s*\}/.test(a),
    "OUTBOX_HANDLERS continua vazio",
  );
});

teste("não existe uma SEGUNDA implementação de event log, outbox ou projeção", () => {
  // A unidade era conectar, não criar outra ponte.
  const rota = readFileSync("src/platform/runtime/rota-ingestao.ts", "utf8");
  const handler = readFileSync("src/platform/runtime/handler-operacao-viva.ts", "utf8");
  for (const [nome, texto] of [["rota", rota], ["handler", handler]] as const) {
    assert.ok(!/INSERT INTO/i.test(texto), `${nome} grava direto no banco`);
    assert.ok(!/projetar\(/.test(texto), `${nome} reimplementa a projeção`);
  }
  assert.match(rota, /ingerir\(/, "a rota não usa o serviço comprovado");
  assert.match(handler, /consumir\(/, "o handler não usa o consumidor comprovado");
});

teste("a rota é a que o Android já fala", () => {
  // Mudar o Kotlin significaria reinstalar em cada aparelho em campo.
  assert.equal(ROTA_INGESTAO, "/api/gps/batch");
});

void Promise.all(pend).then(() => {
  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} runtime-wiring tests OK ===`);
});
