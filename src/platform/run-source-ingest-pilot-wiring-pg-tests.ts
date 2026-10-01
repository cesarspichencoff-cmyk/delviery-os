/**
 * Wiring local/piloto do source-ingest, ainda sem ativação de serviço.
 *
 * Prova o caminho real:
 * ApplicationService -> store.json -> durable feed -> kill switch
 * -> EntregasLiveConsumer -> PgTransactionalWriter sob papel mínimo -> PG.
 *
 * Usa SET LOCAL ROLE somente no harness para medir privilégios sem criar senha.
 */

import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

import { asInternalRiderActorId } from "../entregas/foundation/brands";
import { createPilotPolicy } from "../entregas/foundation/policy";
import { createFileEntregasEventFeed } from "../entregas/integration/durable-event-feed";
import { EntregasApplicationService } from "../entregas/operational/application-service";
import { openFileUnitOfWork } from "../entregas/persistence/file-store";
import {
  bancoIsolado,
  urlCom,
  type BancoIsolado,
} from "./banco-isolado";
import { PgTransactionalWriter } from "./persistence/pg-repositories";
import {
  createPgClient,
  type SqlClient,
} from "./persistence/sql-client";
import {
  EntregasLiveConsumer,
  FileConsumerStateStore,
  FileLiveConsumerControl,
} from "./runtime/entregas-live-consumer";

const PG_URL = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const ROOT = process.cwd();

let passed = 0;
const failures: string[] = [];

async function testCase(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (e) {
    failures.push(
      name + ": " + (e instanceof Error ? e.message : String(e)),
    );
    console.log(
      "  XX  " +
        name +
        ": " +
        (e instanceof Error ? e.message.split("\n")[0] : String(e)),
    );
  }
}

function ident(v: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(v)) {
    throw new Error("identificador SQL inválido");
  }
  return v;
}

async function main(): Promise<void> {
  console.log("\n=== SOURCE INGEST — WIRING LOCAL/PILOTO ===\n");

  if (!PG_URL) {
    console.log(
      "PULADO: DELIVERYOS_PG_URL não definida — wiring local/piloto NÃO foi provado.",
    );
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "source-ingest-pilot-"));
  const sourceFile = join(dir, "store.json");
  const stateFile = join(dir, "checkpoint.json");
  const controlFile = join(dir, "control");

  let banco: BancoIsolado | null = null;
  const suffix =
    process.pid.toString(36) +
    "_" +
    Date.now().toString(36).slice(-7);
  const CRIT = ident("wire_crit_" + suffix);
  const ASY = ident("wire_async_" + suffix);
  const SRC = ident("wire_source_" + suffix);
  const roles = [CRIT, ASY, SRC];

  try {
    const rider = asInternalRiderActorId("rider-wire");
    const uow = openFileUnitOfWork(sourceFile);
    const app = new EntregasApplicationService(
      uow,
      createPilotPolicy(),
      "simulated",
    );

    assert.equal(
      (
        await app.execute({
          type: "CreateTrip",
          command_id: "wire-c1",
          occurred_at: "2026-09-30T23:00:00.000Z",
          unit_id: "ITAIM",
          trip_id: "WIRE-T1",
          courier_actor_id: rider,
          actor: {
            actor_id: "ops-wire",
            role: "operador_expedicao",
          },
          deliveries: [
            {
              delivery_id: "WIRE-D1",
              order_ref: "WIRE-P1",
              channel: "proprio",
            },
          ],
        })
      ).ok,
      true,
    );

    assert.equal(
      (
        await app.execute({
          type: "ConfirmTripDeparture",
          command_id: "wire-c2",
          occurred_at: "2026-09-30T23:01:00.000Z",
          unit_id: "ITAIM",
          trip_id: "WIRE-T1",
          actor: {
            actor_id: "rider-wire",
            role: "motoboy_interno",
          },
        })
      ).ok,
      true,
    );

    const publicEvents = await createFileEntregasEventFeed(
      sourceFile,
    ).list();
    assert.deepEqual(
      publicEvents.map((e) => e.event_type),
      ["trip_created", "delivery_added", "trip_started"],
    );
    assert.ok(
      publicEvents.every((e) => e.source_mode === "simulated"),
    );

    banco = await bancoIsolado(
      PG_URL,
      undefined,
      "source_ingest_wire",
    );

    const rolesSql = readFileSync(
      join(ROOT, "deploy/sql/papeis_minimos.sql"),
      "utf8",
    )
      .replaceAll("deliveryos_critical", CRIT)
      .replaceAll("deliveryos_async", ASY)
      .replaceAll("deliveryos_source_ingest", SRC);

    await banco.cliente.query(rolesSql);
    // O administrador de um PostgreSQL hospedado pode ter CREATEROLE sem ser
    // SUPERUSER. Membership aqui é só do HARNESS para permitir SET LOCAL ROLE;
    // não concede nada novo ao papel SRC e não existe no deploy real.
    await banco.cliente.query("GRANT " + SRC + " TO CURRENT_USER");

    const roleWriter = new PgTransactionalWriter({
      transaction: async <T>(
        fn: (tx: SqlClient) => Promise<T>,
      ): Promise<T> =>
        banco!.cliente.transaction(async (tx) => {
          await tx.query("SET LOCAL ROLE " + SRC);
          return fn(tx);
        }),
    });

    const makeConsumer = () =>
      new EntregasLiveConsumer({
        enabled: true,
        feed: createFileEntregasEventFeed(sourceFile),
        writer: roleWriter,
        state: new FileConsumerStateStore(stateFile),
        control: new FileLiveConsumerControl(controlFile),
        batch_size: 50,
        now: () => new Date("2026-09-30T23:05:00.000Z"),
      });

    async function platformCounts(): Promise<{
      facts: number;
      outbox: number;
    }> {
      const [f, o] = await Promise.all([
        banco!.cliente.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM platform.event_log",
        ),
        banco!.cliente.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM platform.outbox",
        ),
      ]);
      return {
        facts: Number(f[0]?.n ?? 0),
        outbox: Number(o[0]?.n ?? 0),
      };
    }

    await testCase(
      "WI1 kill switch ausente é OFF real: zero poll-effect e zero PG",
      async () => {
        const r = await makeConsumer().tick();
        assert.equal(r.status, "killed");
        assert.deepEqual(await platformCounts(), {
          facts: 0,
          outbox: 0,
        });
      },
    );

    await testCase(
      "WI2 STOP explícito continua sem escrever nem criar checkpoint útil",
      async () => {
        writeFileSync(controlFile, "STOP\n", "utf8");
        const r = await makeConsumer().tick();
        assert.equal(r.status, "killed");
        assert.deepEqual(await platformCounts(), {
          facts: 0,
          outbox: 0,
        });
        const s = await new FileConsumerStateStore(stateFile).load();
        assert.equal(s.checkpoint, null);
      },
    );

    await testCase(
      "WI3 RUN consome store.json real; lifecycle entra e delivery_added fica isolado",
      async () => {
        writeFileSync(controlFile, "RUN\n", "utf8");
        const r = await makeConsumer().tick();
        assert.equal(r.status, "worked");
        assert.equal(r.pulled, 3);
        assert.equal(r.ingested, 2);
        assert.equal(r.isolated, 1);
        assert.deepEqual(await platformCounts(), {
          facts: 2,
          outbox: 2,
        });

        const facts = await banco!.cliente.query<{
          event_type: string;
          source_mode: string;
        }>(
          "SELECT event_type, source_mode FROM platform.event_log " +
            "ORDER BY occurred_at, event_type",
        );
        assert.deepEqual(
          facts.map((x) => x.event_type).sort(),
          ["trip_created", "trip_started"],
        );
        assert.ok(
          facts.every((x) => x.source_mode === "simulated"),
        );

        const state = await new FileConsumerStateStore(stateFile).load();
        assert.equal(
          state.checkpoint,
          publicEvents[publicEvents.length - 1].event_id,
        );
        assert.equal(state.isolated_count, 1);
        assert.equal(
          state.last_isolation?.reason,
          "tipo_sem_equivalencia_segura",
        );
      },
    );

    await testCase(
      "WI4 restart no mesmo checkpoint fica idle e não duplica PG",
      async () => {
        const before = await platformCounts();
        const r = await makeConsumer().tick();
        assert.equal(r.status, "idle");
        assert.deepEqual(await platformCounts(), before);
      },
    );

    await testCase(
      "WI5 evento novo acumula no feed durante STOP e entra só após RUN",
      async () => {
        const uow2 = openFileUnitOfWork(sourceFile);
        const app2 = new EntregasApplicationService(
          uow2,
          createPilotPolicy(),
          "simulated",
        );
        assert.equal(
          (
            await app2.execute({
              type: "CreateTrip",
              command_id: "wire-c3",
              occurred_at: "2026-09-30T23:10:00.000Z",
              unit_id: "ITAIM",
              trip_id: "WIRE-T2",
              courier_actor_id: asInternalRiderActorId("rider-wire-2"),
              actor: {
                actor_id: "ops-wire",
                role: "operador_expedicao",
              },
              deliveries: [
                {
                  delivery_id: "WIRE-D2",
                  order_ref: "WIRE-P2",
                  channel: "proprio",
                },
              ],
            })
          ).ok,
          true,
        );

        writeFileSync(controlFile, "STOP\n", "utf8");
        const before = await platformCounts();
        const stopped = await makeConsumer().tick();
        assert.equal(stopped.status, "killed");
        assert.deepEqual(await platformCounts(), before);

        writeFileSync(controlFile, "RUN\n", "utf8");
        const resumed = await makeConsumer().tick();
        assert.equal(resumed.status, "worked");
        assert.equal(resumed.ingested, 1);
        assert.equal(resumed.isolated, 1);
        assert.deepEqual(await platformCounts(), {
          facts: before.facts + 1,
          outbox: before.outbox + 1,
        });
      },
    );

    await testCase(
      "WI6 o source role continua sem leitura da verdade após wiring",
      async () => {
        const msg = await banco!.cliente
          .transaction(async (tx) => {
            await tx.query("SET LOCAL ROLE " + SRC);
            await tx.query(
              "SELECT event_id FROM platform.event_log LIMIT 1",
            );
          })
          .then(
            () => "",
            (e: Error) => e.message,
          );
        assert.match(msg, /permission denied/);
      },
    );
  } finally {
    if (banco) await banco.descartar().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });

    if (PG_URL) {
      const admin = await createPgClient({
        url: urlCom(PG_URL, "postgres"),
        max: 1,
      });
      try {
        for (const role of roles) {
          await admin.query("DROP ROLE IF EXISTS " + role);
        }
      } finally {
        await admin.close();
      }
    }
  }

  if (failures.length) {
    console.error("\n=== " + failures.length + " FALHA(S) ===");
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }

  console.log(
    "\nSOURCE_INGEST_PILOT_WIRING_PG: " +
      passed +
      "/6 PASS",
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
