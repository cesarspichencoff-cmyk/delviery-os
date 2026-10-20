/**
 * LAB ONLY — fronteira de procedência do produtor em PostgreSQL EFÊMERO.
 *
 * Estende `run-pilot-copiloto-outbox-e2e-lab-tests.ts` (13/13): o mesmo
 * caminho PgEntregasUnitOfWork -> public_outbox -> consumidor -> event_log ->
 * Entregas -> Copiloto, agora com o produtor ASSINANDO (`pa1`), a fronteira
 * julgando antes do adapter, e registro/livro/escritor rodando sob o papel
 * mínimo `deliveryos_source_ingest` aplicado a partir de
 * deploy/sql/papeis_minimos.sql (nomes com sufixo, removidos no fim).
 *
 * Chaves Ed25519 geradas em memória. Nada de fonte real, TATÁ, produtor real
 * ou modo real; o lab recusa rodar fora do PG próprio do runner do GitHub.
 * NÃO prova: aparelho físico, custódia de chave, transporte, RLS por unidade,
 * nem o feed em arquivo do runtime (aqui o feed lê a outbox PG).
 */
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  criarAssinanteDeProdutor,
  type AssinanteDeProdutor,
} from "../../src/entregas/contracts/producer-attestation";
import type { EntregasPublicEvent } from "../../src/entregas/contracts/events/types";
import { asInternalRiderActorId } from "../../src/entregas/foundation/brands";
import { createPilotPolicy } from "../../src/entregas/foundation/policy";
import { CommittedOutboxAttestableFeed } from "../../src/entregas/integration/durable-event-feed";
import { buildSignalEvent } from "../../src/entregas/integration/public-event-builder";
import { EntregasApplicationService } from "../../src/entregas/operational/application-service";
import { PgEntregasUnitOfWork } from "../../src/entregas/persistence/pg-uow";
import { uowComAtestacao } from "../../src/entregas/pilot/producer-signing";
import { PgProducerAdminStore, planRegister } from "../../src/platform/admin/producer-admin";
import { bancoIsolado, urlCom } from "../../src/platform/banco-isolado";
import { FronteiraDeProcedencia } from "../../src/platform/ingest/fronteira-de-procedencia";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import {
  PgLivroDeAdmissoes,
  PgRegistroDeProdutores,
} from "../../src/platform/persistence/pg-producer-attestation";
import {
  createPgClient,
  type PgSqlClient,
  type SqlClient,
  type TransactionalSqlClient,
} from "../../src/platform/persistence/sql-client";
import {
  EntregasLiveConsumer,
  type ConsumerCheckpointState,
} from "../../src/platform/runtime/entregas-live-consumer";
import { copilotoEntregasLeitura } from "../../src/product/viewmodels/copiloto-entregas-leitura";

const ROOT = process.env.DELIVERYOS_PG_URL ?? "";
function safeRunnerUrl(): boolean {
  if (process.env.GITHUB_ACTIONS !== "true") return false;
  try {
    const u = new URL(ROOT);
    const socket = u.searchParams.get("host") ?? "";
    return ["postgres:", "postgresql:"].includes(u.protocol)
      && u.hostname === "localhost"
      && u.port === "55434"
      && socket.includes("deliveryos-sock-")
      && socket.startsWith("/home/runner/work/_temp/")
      && u.pathname === "/postgres";
  } catch { return false; }
}
if (!safeRunnerUrl()) {
  console.error("LAB_REFUSED: requires owned ephemeral GitHub Actions PG socket; never operational DB");
  process.exit(78);
}

const UNIT = "ITAIM";
let passed = 0;
function ok(cond: unknown, label: string) {
  assert.ok(cond, label);
  passed++;
  console.log("ok PRODUCER-PG-" + passed + " " + label);
}
async function recusa(p: Promise<unknown>, re: RegExp, label: string) {
  let erro = "";
  try { await p; } catch (e) { erro = e instanceof Error ? e.message : String(e); }
  ok(re.test(erro), label + (erro ? "" : " (NAO RECUSOU)"));
}
function ident(v: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(v)) throw new Error("identificador SQL invalido");
  return v;
}
/** Tudo o que passar por aqui roda com SET LOCAL ROLE — privilégio real do papel. */
function comoPapel(c: PgSqlClient, role: string): TransactionalSqlClient {
  return {
    query: (sql, params) => c.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE " + role);
      return tx.query(sql, params);
    }),
    transaction: <T>(fn: (tx: SqlClient) => Promise<T>) => c.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE " + role);
      return fn(tx);
    }),
    close: async () => undefined,
  } as TransactionalSqlClient;
}

async function main() {
  const sfx = process.pid.toString(36) + "_" + Date.now().toString(36).slice(-6);
  const CRIT = ident("pa_crit_" + sfx);
  const ASY = ident("pa_async_" + sfx);
  const SRC = ident("pa_src_" + sfx);
  const PIL = ident("pa_pilot_" + sfx);
  const roles = [CRIT, ASY, SRC, PIL];
  const db = await bancoIsolado(ROOT, undefined, "lab_producer_attestation");
  try {
    const papeis = readFileSync(resolve("deploy/sql/papeis_minimos.sql"), "utf8")
      .replaceAll("deliveryos_entregas_pilot", PIL)
      .replaceAll("deliveryos_critical", CRIT)
      .replaceAll("deliveryos_async", ASY)
      .replaceAll("deliveryos_source_ingest", SRC);
    await db.cliente.query(papeis);
    for (const r of [SRC, PIL]) await db.cliente.query("GRANT " + r + " TO CURRENT_USER");
    await db.cliente.query(
      "INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Lab Itaim'),('VILA-LAB','Lab Vila')");
    await db.cliente.query(
      "INSERT INTO identity.actor(actor_id,unit_id,role,label) VALUES ('pa-rider','ITAIM','motoboy_interno','Rider Ficticio')");

    const cols = await db.cliente.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='entregas' AND table_name='public_outbox' AND column_name='attestation'");
    ok(cols[0]?.n === 1, "migration 0010 aplicada pelo runner real: public_outbox.attestation existe");

    // ---------------------------------------------------- travas do banco
    await recusa(db.cliente.query(
      `INSERT INTO platform.producer_key(producer_id,key_id,unit_id,public_key,allowed_event_types,allowed_modes,not_before,not_after,registered_by)
       VALUES ('LAB_X','k1','ITAIM',$1,ARRAY['trip_started'],ARRAY['simulated','real'],now(),now()+interval '1 day','lab')`,
      [randomBytes(32)]), /check|violates/i, "CHECK do banco recusa conceder real mesmo ao dono");

    // ---------------------------------------------------- registro (dono)
    const admin = new PgProducerAdminStore(db.cliente);
    async function registrar(producer_id: string, unit_id: string): Promise<{ assinante: AssinanteDeProdutor; nonceFixo: (n: string) => AssinanteDeProdutor }> {
      const par = generateKeyPairSync("ed25519");
      const agora = Date.now();
      const { plan, public_key } = await planRegister(admin, {
        producer_id, key_id: "k1", unit_id,
        public_key_spki_b64: par.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
        event_types: "trip_created,trip_started,delivery_added,delivery_ready", modes: "simulated",
        not_before: new Date(agora - 3_600_000).toISOString(),
        not_after: new Date(agora + 30 * 86_400_000).toISOString(), registered_by: "lab",
      });
      assert.equal(plan.can_apply, true, plan.conflicts.join(","));
      const t = plan.target as Record<string, unknown>;
      assert.ok(await admin.register({
        producer_id, key_id: "k1", unit_id, public_key,
        allowed_event_types: t.allowed_event_types as string[], allowed_modes: t.allowed_modes as string[],
        not_before: String(t.not_before), not_after: String(t.not_after), registered_by: "lab",
      }));
      return {
        assinante: criarAssinanteDeProdutor({ producer_id, kid: "k1", privateKey: par.privateKey }),
        nonceFixo: (n) => criarAssinanteDeProdutor({ producer_id, kid: "k1", privateKey: par.privateKey, nonce: () => n }),
      };
    }
    const itaim = await registrar("LAB_PILOTO_ITAIM", "ITAIM");
    const vila = await registrar("LAB_PILOTO_VILA", "VILA-LAB");

    await recusa(db.cliente.query(
      "UPDATE platform.producer_key SET allowed_modes=ARRAY['control'] WHERE producer_id='LAB_PILOTO_ITAIM'"),
      /mao unica/, "chave registrada nao muda concessao: so revogacao de mao unica");
    await recusa(db.cliente.query("DELETE FROM platform.producer_key WHERE producer_id='LAB_PILOTO_VILA'"),
      /mao unica/, "chave registrada nao se apaga");

    // ---------------------------------------------------- produtor real
    let cmd = 0;
    async function viagem(trip: string, assinante: AssinanteDeProdutor) {
      const occurred = new Date(Date.now() - 60_000).toISOString();
      for (const c of [
        { type: "CreateTrip", trip_id: trip, courier_actor_id: asInternalRiderActorId("pa-rider"),
          actor: { actor_id: "pa-ops", role: "operador_expedicao" },
          deliveries: [{ delivery_id: trip + "-D1", order_ref: trip + "-P1", channel: "proprio" }] },
        { type: "ConfirmTripDeparture", trip_id: trip, actor: { actor_id: "pa-rider", role: "motoboy_interno" } },
      ]) {
        const app = new EntregasApplicationService(
          uowComAtestacao(new PgEntregasUnitOfWork(db.cliente, UNIT), assinante), createPilotPolicy(), "simulated");
        const r = await app.execute({ ...c, command_id: "pa-" + (++cmd), occurred_at: occurred, unit_id: UNIT } as Parameters<EntregasApplicationService["execute"]>[0]);
        assert.equal(r.ok, true, JSON.stringify(r));
      }
    }
    async function sinal(id: string, assinante: AssinanteDeProdutor) {
      const e: EntregasPublicEvent = buildSignalEvent({
        event_type: "delivery_ready", unit_id: UNIT, trip_id: "PA-T1",
        occurred_at: new Date().toISOString(), recorded_at: new Date().toISOString(),
        idempotency_key: "PA_SIGNAL_" + id, source_mode: "simulated", payload: { lab_only: true },
      });
      const u = uowComAtestacao(new PgEntregasUnitOfWork(db.cliente, UNIT), assinante);
      await u.outbox.enqueue({ outbox_id: "obx_" + randomUUID(), event: e, status: "pending", attempts: 0, created_at: new Date().toISOString() });
      await u.commit();
    }
    await viagem("PA-T1", itaim.assinante);
    await sinal("S1", itaim.assinante);
    const assinadas = await db.cliente.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM entregas.public_outbox WHERE unit_id=$1 AND attestation LIKE 'pa1.%'", [UNIT]);
    ok(assinadas[0]?.n === 4, "piloto real (ApplicationService + PgUnitOfWork) gravou 4 registros atestados na outbox");

    // ---------------------------------------------------- consumidor
    let estado: ConsumerCheckpointState = { version: 1, checkpoint: null, isolated_count: 0, updated_at: null };
    let falharSave = false;
    const src = comoPapel(db.cliente, SRC);
    const consumidor = new EntregasLiveConsumer({
      enabled: true,
      feed: { list: async () => [], poll: async () => { throw new Error("feed sem atestacao nao deve ser lido"); } },
      writer: { commit: async () => { throw new Error("writer sem admissao nao deve ser usado"); } },
      state: {
        load: async () => structuredClone(estado),
        save: async (s) => { if (falharSave) { falharSave = false; throw new Error("disco"); } estado = structuredClone(s); },
      },
      control: { canRun: async () => true },
      procedencia: new FronteiraDeProcedencia({
        feed: new CommittedOutboxAttestableFeed(() => new PgEntregasUnitOfWork(db.cliente, UNIT).outbox),
        registro: new PgRegistroDeProdutores(src),
        livro: new PgLivroDeAdmissoes(src),
      }),
    });
    const contar = async (sql: string, p: unknown[] = []) =>
      (await db.cliente.query<{ n: number }>(sql, p))[0]?.n ?? -1;
    const fatos = () => contar("SELECT count(*)::int AS n FROM platform.event_log");
    const admissoes = (d: string, motivo?: string) => contar(
      "SELECT count(*)::int AS n FROM platform.producer_admission WHERE decision=$1 AND ($2::text IS NULL OR reason=$2)", [d, motivo ?? null]);

    const t1 = await consumidor.tick();
    ok(t1.status === "worked" && t1.ingested === 2 && t1.isolated === 2 && t1.quarantined === 0,
      "fronteira sob papel minimo admite 2 fatos de Trip e isola delivery_added + sinal");
    ok(await contar("SELECT count(*)::int AS n FROM platform.event_log WHERE unit_id=$1 AND source_mode='simulated'", [UNIT]) === 2,
      "platform.event_log tem so os 2 fatos simulated");
    ok(await admissoes("admitted") === 4, "4 admissoes na MESMA transacao dos fatos ou sozinhas (sinal sem domain_event)");

    // Copiloto le o mesmo resultado, so como simulated, so na unidade certa.
    const realidade = await lerRealidadeDeEntregas(db.cliente, { agora: new Date(), unit_id: UNIT });
    const semEventos = { ...realidade, projecoes: realidade.projecoes.map((g) => ({ ...g, viagens: g.viagens.map((v) => ({ ...v, eventos: { length: v.eventos.length } })) })) };
    const visto = copilotoEntregasLeitura({ disponivel: true, realidade: semEventos }, UNIT);
    ok(visto.estado === "observado" && visto.grupos.length === 1 && visto.grupos[0].source_mode === "simulated" && visto.nenhuma_acao_executada,
      "Copiloto read-only mostra a Trip atestada estritamente como simulated, sem acao");
    ok(copilotoEntregasLeitura({ disponivel: true, realidade: semEventos }, "VILA-LAB").grupos.length === 0,
      "segunda unidade nao ve a Trip de Itaim");

    // ---------------------------------------------------- adulteração (R10)
    await viagem("PA-T2", itaim.assinante);
    const alvo = await db.cliente.query<{ event_id: string }>(
      "SELECT event_id FROM entregas.public_outbox WHERE event->>'event_type'='trip_started' AND event->>'trip_id'='PA-T2'");
    await comoPapel(db.cliente, PIL).query(
      "UPDATE entregas.public_outbox SET event=jsonb_set(event,'{source_mode}','\"control\"') WHERE event_id=$1", [alvo[0].event_id]);
    ok(true, "papel do piloto CONSEGUE reescrever a outbox (UPDATE concedido) — a assinatura e quem pega");
    const t2 = await consumidor.tick();
    ok(t2.status === "worked" && t2.ingested === 1 && t2.quarantined === 1 &&
       await admissoes("quarantined", "evento_divergente_da_assinatura") === 1 && await fatos() === 3,
      "registro adulterado vai a quarentena; o resto do lote segue");

    // ---------------------------------------------------- replay e unidade
    const nonce = randomBytes(16).toString("hex");
    await sinal("S2", itaim.nonceFixo(nonce));
    await sinal("S3", itaim.nonceFixo(nonce));
    // Chave valida de VILA-LAB assinando evento de ITAIM: assinatura confere, concessao nao.
    await sinal("S4", vila.assinante);
    const t3 = await consumidor.tick();
    ok(t3.status === "worked" && t3.quarantined === 2 &&
       await admissoes("quarantined", "nonce_reutilizado") === 1 &&
       await admissoes("quarantined", "unidade_nao_concedida") === 1,
      "nonce reusado e chave de outra unidade vao a quarentena com motivo");

    // ---------------------------------------------------- queda entre commit e checkpoint
    await viagem("PA-T3", itaim.assinante);
    falharSave = true;
    const t4 = await consumidor.tick();
    ok(t4.status === "failed" && /checkpoint_write_failed/.test(t4.error ?? ""), "queda simulada depois do commit");
    const t5 = await consumidor.tick();
    ok(t5.status === "worked" && t5.duplicates === 1 && await fatos() === 5 &&
       await contar("SELECT count(*)::int AS n FROM platform.producer_admission WHERE decision='admitted' AND event_type='trip_created' AND event_id IN (SELECT event_id FROM entregas.public_outbox WHERE event->>'trip_id'='PA-T3')") === 1,
      "releitura: um fato e UMA admissao por evento; sem replay falso");

    // ---------------------------------------------------- registro indisponível
    await viagem("PA-T4", itaim.assinante);
    const antes = { fatos: await fatos(), linhas: await contar("SELECT count(*)::int AS n FROM platform.producer_admission"), cursor: estado.checkpoint };
    await db.cliente.query("REVOKE SELECT ON platform.producer_key FROM " + SRC);
    const t6 = await consumidor.tick();
    ok(t6.status === "failed" && /^procedencia_indisponivel:/.test(t6.error ?? "") &&
       await fatos() === antes.fatos && estado.checkpoint === antes.cursor &&
       await contar("SELECT count(*)::int AS n FROM platform.producer_admission") === antes.linhas,
      "registro ilegivel: nada gravado, nada em quarentena, cursor parado");
    await db.cliente.query("GRANT SELECT ON platform.producer_key TO " + SRC);
    const t7 = await consumidor.tick();
    ok(t7.status === "worked" && t7.ingested === 2 && await fatos() === 7, "registro de volta: o mesmo lote entra, sem perda");

    // ---------------------------------------------------- revogação
    assert.ok(await admin.revoke({ producer_id: "LAB_PILOTO_ITAIM", key_id: "k1", revoked_by: "lab", reason: "lab" }));
    await recusa(db.cliente.query("UPDATE platform.producer_key SET revoked_at=now() WHERE producer_id='LAB_PILOTO_ITAIM'"),
      /mao unica/, "revogacao nao se reescreve");
    await viagem("PA-T5", itaim.assinante);
    const t8 = await consumidor.tick();
    ok(t8.status === "worked" && t8.ingested === 0 && t8.quarantined === 3 &&
       await admissoes("quarantined", "chave_revogada") === 3 && await fatos() === 7,
      "chave revogada: tudo depois dela em quarentena, nenhum fato");

    // ---------------------------------------------------- privilégios
    const priv = async (role: string, tabela: string, p: string) =>
      (await db.cliente.query<{ v: boolean }>("SELECT has_table_privilege($1,$2,$3) AS v", [role, tabela, p]))[0]?.v === true;
    ok(await priv(SRC, "platform.producer_key", "SELECT") && !(await priv(SRC, "platform.producer_key", "INSERT")) &&
       !(await priv(SRC, "platform.producer_key", "UPDATE")) && await priv(SRC, "platform.producer_admission", "INSERT") &&
       !(await priv(SRC, "platform.producer_admission", "UPDATE")) && !(await priv(SRC, "platform.producer_admission", "DELETE")) &&
       !(await priv(SRC, "platform.producer_admission", "TRUNCATE")),
      "source-ingest: le o registro, so INSERE admissao; nunca concede, altera ou apaga");
    let ninguem = true;
    for (const r of [PIL, CRIT, ASY]) {
      for (const t of ["platform.producer_key", "platform.producer_admission"]) {
        for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) if (await priv(r, t, p)) ninguem = false;
      }
    }
    ok(ninguem, "piloto, critico e assincrono nao tocam registro nem livro");
    await recusa(src.query("UPDATE platform.producer_admission SET reason='x'"), /permission denied/i,
      "papel source-ingest nao reescreve o livro (privilegio, antes da trigger)");
    await recusa(src.query(
      `INSERT INTO platform.producer_key(producer_id,key_id,unit_id,public_key,allowed_event_types,allowed_modes,not_before,not_after,registered_by)
       VALUES ('LAB_AUTO','k1','ITAIM',$1,ARRAY['trip_started'],ARRAY['simulated'],now(),now()+interval '1 day','lab')`, [randomBytes(32)]),
      /permission denied/i, "papel source-ingest nao se auto-concede chave");
    await recusa(comoPapel(db.cliente, PIL).query("SELECT 1 FROM platform.producer_key"), /permission denied/i,
      "papel do piloto nao le o registro de produtores");
    await recusa(db.cliente.query("TRUNCATE platform.producer_admission"), /append-only/,
      "livro de admissoes recusa TRUNCATE ate do dono");
    await recusa(db.cliente.query("DELETE FROM platform.producer_admission"), /append-only/,
      "livro de admissoes recusa DELETE ate do dono");

    ok(await contar("SELECT count(*)::int AS n FROM platform.event_log WHERE source_mode='real'") === 0 &&
       await contar("SELECT count(*)::int AS n FROM platform.event_log WHERE unit_id='VILA-LAB'") === 0,
      "nenhum fato real e nenhum fato da segunda unidade em todo o lab");
    console.log("PRODUCER_ATTESTATION_PG_COPILOTO_LAB: " + passed + "/" + passed +
      " PASS (EPHEMERAL PG, FICTITIOUS KEYS, MINIMAL ROLE, SIMULATED ONLY / NO OPERATION)");
  } finally {
    await db.descartar();
    const adm = await createPgClient({ url: urlCom(ROOT, "postgres"), max: 1 });
    try {
      for (const r of roles) await adm.query("DROP ROLE IF EXISTS " + r).catch(() => undefined);
    } finally {
      await adm.close();
    }
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
