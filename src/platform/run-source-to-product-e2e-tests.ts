/**
 * Ensaio local ponta a ponta:
 * PostgreSQL fonte -> source-ingest compilado -> platform.event_log ->
 * Product System compilado -> APIs read-only.
 *
 * Nada de produção, nenhuma credencial real e nenhum fallback para admin na
 * superfície: o Product System usa deliveryos_product_reader.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EntregasPublicEvent } from "../entregas/contracts/events/types";
import {
  bancoIsolado,
  urlCom,
  type BancoIsolado,
} from "./banco-isolado";
import { createPgClient } from "./persistence/sql-client";
import { FileConsumerStateStore } from "./runtime/entregas-live-consumer";

const PG_URL = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const ROOT = process.cwd();

const SOURCE_SECRET = "E2E_SOURCE_SECRET_SENTINEL";
const WRITER_SECRET = "E2E_WRITER_SECRET_SENTINEL";
const PRODUCT_SECRET = "E2E_PRODUCT_SECRET_SENTINEL";

function ident(v: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(v)) {
    throw new Error("identificador SQL inválido");
  }
  return v;
}

function sqlLiteral(v: string): string {
  return "'" + v.replaceAll("'", "''") + "'";
}

function asRole(url: string, role: string, password: string): string {
  const u = new URL(url);
  u.username = role;
  u.password = password;
  return u.toString();
}

function event(
  id: string,
  unit: string,
  type: EntregasPublicEvent["event_type"],
  at: string,
  tripId: string,
): EntregasPublicEvent {
  return {
    event_id: id,
    event_type: type,
    schema_version: "1.0.0",
    occurred_at: at,
    recorded_at: at,
    idempotency_key: "idem:" + id,
    source: "entregas",
    source_health: "ok",
    confidence: "observed",
    unit_id: unit,
    source_mode: "simulated",
    trip_id: tripId,
    payload: {},
    correlation_id: tripId,
    contract_version: "COR-ENTREGAS-V1@1.0.3",
  };
}

async function insertPublic(
  banco: BancoIsolado,
  e: EntregasPublicEvent,
): Promise<void> {
  await banco.cliente.query(
    `INSERT INTO entregas.public_outbox
      (outbox_id,unit_id,event_id,idempotency_key,event,status,attempts,created_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,'pending',0,$6::timestamptz)`,
    [
      "out:" + e.event_id,
      e.unit_id,
      e.event_id,
      e.idempotency_key,
      JSON.stringify(e),
      e.recorded_at,
    ],
  );
}

function capture(child: ChildProcess): { text: () => string } {
  let out = "";
  child.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
  child.stderr?.on("data", (d: Buffer) => { out += d.toString(); });
  return { text: () => out };
}

async function waitFor(
  name: string,
  fn: () => Promise<boolean>,
  timeoutMs = 12_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error("timeout: " + name);
}

async function jsonGet(url: string): Promise<{ status: number; raw: string; body: any }> {
  const r = await fetch(url);
  const raw = await r.text();
  return { status: r.status, raw, body: JSON.parse(raw) };
}

async function expectDenied(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    assert.fail(label + " deveria ser recusado");
  } catch (e: any) {
    assert.equal(e?.code, "42501", label + " falhou por motivo diferente de privilégio");
  }
}

async function main(): Promise<void> {
  console.log("\n=== SOURCE -> PRODUCT SYSTEM E2E ===\n");

  if (!PG_URL) {
    console.log(
      "PULADO: DELIVERYOS_PG_URL não definida — cadeia source->product NÃO foi provada.",
    );
    return;
  }

  const ingestBinary = join(
    ROOT,
    "dist",
    "src",
    "platform",
    "bin",
    "entregas-source-ingest.js",
  );
  const productBinary = join(ROOT, "dist", "tools", "product_system_server.js");
  assert.ok(existsSync(ingestBinary), "source-ingest compilado ausente");
  assert.ok(existsSync(productBinary), "Product System compilado ausente");

  const dir = mkdtempSync(join(tmpdir(), "source-product-e2e-"));
  const stateFile = join(dir, "checkpoint.json");
  const controlFile = join(dir, "control");
  writeFileSync(controlFile, "RUN\n", "utf8");

  let sourceDb: BancoIsolado | null = null;
  let targetDb: BancoIsolado | null = null;
  let ingest: ChildProcess | null = null;
  let product: ChildProcess | null = null;

  const suffix =
    process.pid.toString(36) + "_" + Date.now().toString(36).slice(-7);
  const SRC_READER = ident("e2e_feed_" + suffix);
  const CRIT = ident("e2e_crit_" + suffix);
  const ASY = ident("e2e_async_" + suffix);
  const WRITER = ident("e2e_writer_" + suffix);
  const PILOT = ident("e2e_pilot_" + suffix);
  const PRODUCT = ident("e2e_product_" + suffix);
  const roles = [SRC_READER, CRIT, ASY, WRITER, PILOT, PRODUCT];

  let passed = 0;
  const pass = (label: string) => {
    passed += 1;
    console.log("  ok  " + label);
  };

  try {
    sourceDb = await bancoIsolado(PG_URL, undefined, "e2e_source");
    targetDb = await bancoIsolado(PG_URL, undefined, "e2e_target");

    const sourceReaderSql = readFileSync(
      join(ROOT, "deploy/sql/entregas_feed_reader.sql"),
      "utf8",
    ).replaceAll("deliveryos_entregas_feed_reader", SRC_READER);
    await sourceDb.cliente.query(sourceReaderSql);
    await sourceDb.cliente.query(
      "ALTER ROLE " + SRC_READER + " PASSWORD " + sqlLiteral(SOURCE_SECRET),
    );

    const targetRoles = readFileSync(
      join(ROOT, "deploy/sql/papeis_minimos.sql"),
      "utf8",
    )
      .replaceAll("deliveryos_critical", CRIT)
      .replaceAll("deliveryos_async", ASY)
      .replaceAll("deliveryos_source_ingest", WRITER)
      .replaceAll("deliveryos_entregas_pilot", PILOT);
    await targetDb.cliente.query(targetRoles);
    await targetDb.cliente.query(
      "ALTER ROLE " + WRITER + " PASSWORD " + sqlLiteral(WRITER_SECRET),
    );

    const productReaderSql = readFileSync(
      join(ROOT, "deploy/sql/product_system_reader.sql"),
      "utf8",
    ).replaceAll("deliveryos_product_reader", PRODUCT);
    await targetDb.cliente.query(productReaderSql);
    await targetDb.cliente.query(
      "ALTER ROLE " + PRODUCT + " PASSWORD " + sqlLiteral(PRODUCT_SECRET),
    );

    await targetDb.cliente.query(
      `INSERT INTO identity.unit(unit_id,display_name,timezone,active)
       VALUES
         ('ITAIM','Itaim','America/Sao_Paulo',true),
         ('PINHEIROS','Pinheiros','America/Sao_Paulo',true),
         ('HOUSE','House','America/Sao_Paulo',false)
       ON CONFLICT (unit_id) DO NOTHING`,
    );

    const e1 = event(
      "e2e-it-created-" + suffix,
      "ITAIM",
      "trip_created",
      "2026-10-05T10:00:00.000Z",
      "trip-it-" + suffix,
    );
    const e2 = event(
      "e2e-it-started-" + suffix,
      "ITAIM",
      "trip_started",
      "2026-10-05T10:01:00.000Z",
      "trip-it-" + suffix,
    );
    const e3 = event(
      "e2e-pin-started-" + suffix,
      "PINHEIROS",
      "trip_started",
      "2026-10-05T10:02:00.000Z",
      "trip-pin-" + suffix,
    );
    for (const e of [e1, e2, e3]) await insertPublic(sourceDb, e);

    const sourceUrl = asRole(sourceDb.url, SRC_READER, SOURCE_SECRET);
    const writerUrl = asRole(targetDb.url, WRITER, WRITER_SECRET);
    const productUrl = asRole(targetDb.url, PRODUCT, PRODUCT_SECRET);

    ingest = spawn(process.execPath, [ingestBinary], {
      cwd: ROOT,
      env: {
        PATH: process.env.PATH,
        DELIVERYOS_ENV: "local",
        DELIVERYOS_DATABASE_URL: writerUrl,
        DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "true",
        DELIVERYOS_ENTREGAS_SOURCE_BACKEND: "postgres",
        DELIVERYOS_ENTREGAS_SOURCE_DATABASE_URL: sourceUrl,
        DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE: stateFile,
        DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE: controlFile,
        DELIVERYOS_ENTREGAS_SOURCE_TICK_MS: "50",
        DELIVERYOS_ENTREGAS_SOURCE_BATCH_SIZE: "50",
        DELIVERYOS_COMMIT: "source-product-e2e",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ingestLog = capture(ingest);

    await waitFor("3 fatos no destino", async () => {
      const rows = await targetDb!.cliente.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM platform.event_log",
      );
      return Number(rows[0]?.n ?? 0) >= 3;
    });

    const facts = await targetDb.cliente.query<{
      event_type: string;
      unit_id: string;
      source_mode: string;
    }>(
      "SELECT event_type,unit_id,source_mode FROM platform.event_log " +
        "ORDER BY occurred_at,event_type",
    );
    assert.equal(facts.length, 3);
    assert.deepEqual(
      facts.map((f) => [f.event_type, f.unit_id, f.source_mode]),
      [
        ["trip_created", "ITAIM", "simulated"],
        ["trip_started", "ITAIM", "simulated"],
        ["trip_started", "PINHEIROS", "simulated"],
      ],
    );
    pass("E2E1 source-ingest compilado gravou 3/3 fatos preservando unidade e modo");

    const state = await new FileConsumerStateStore(stateFile).load();
    assert.equal(state.checkpoint, e3.event_id);
    assert.equal(state.isolated_count, 0);
    pass("E2E2 checkpoint avançou até o último evento sem isolamento");

    const sourceCount = await sourceDb.cliente.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM entregas.public_outbox",
    );
    assert.equal(Number(sourceCount[0]?.n), 3);
    pass("E2E3 fonte permaneceu intacta com 3 eventos");

    const reader = await createPgClient({ url: productUrl, max: 1 });
    try {
      const units = await reader.query<{ unit_id: string }>(
        "SELECT unit_id FROM identity.unit WHERE active=true ORDER BY unit_id",
      );
      assert.deepEqual(units.map((u) => u.unit_id), ["ITAIM", "PINHEIROS"]);

      await expectDenied("reader INSERT", () =>
        reader.query(
          "INSERT INTO identity.unit(unit_id,display_name,timezone,active) " +
            "VALUES ('NOPE','Nope','America/Sao_Paulo',true)",
        ),
      );
      await expectDenied("reader UPDATE", () =>
        reader.query(
          "UPDATE identity.unit SET display_name=display_name WHERE unit_id='ITAIM'",
        ),
      );
      await expectDenied("reader DELETE", () =>
        reader.query("DELETE FROM identity.unit WHERE unit_id='NOPE'"),
      );
      await expectDenied("reader secret_hash", () =>
        reader.query("SELECT secret_hash FROM identity.device LIMIT 1"),
      );
    } finally {
      await reader.close();
    }
    pass("E2E4 Product System reader lê só o necessário e escrita/secret_hash são recusados");

    const port = 5400 + (process.pid % 200);
    product = spawn(process.execPath, [productBinary], {
      cwd: ROOT,
      env: {
        PATH: process.env.PATH,
        PRODUCT_UI_PORT: String(port),
        DELIVERYOS_DATABASE_URL: productUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const productLog = capture(product);

    await waitFor("Product System health", async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/health`);
        return r.status === 200;
      } catch {
        return false;
      }
    });

    const nav = await jsonGet(`http://127.0.0.1:${port}/api/navegacao`);
    assert.equal(nav.status, 200);
    assert.equal(nav.body.fonte_unidades, "identity.unit");
    assert.deepEqual(
      nav.body.unidades.map((u: any) => u.unit_id),
      ["ITAIM", "PINHEIROS"],
    );
    pass("E2E5 navegação lê duas unidades ativas e exclui HOUSE inativa");

    const itaim = await jsonGet(
      `http://127.0.0.1:${port}/api/entregas?unit_id=ITAIM`,
    );
    assert.equal(itaim.status, 200);
    assert.equal(itaim.body.realidade.fonte.observado, true);
    assert.equal(itaim.body.realidade.fonte.valor.includes("platform.event_log"), true);
    const tripsIt = itaim.body.realidade.viagens;
    assert.equal(tripsIt.some((v: any) => v.viagem_id === e1.trip_id), true);
    assert.equal(tripsIt.every((v: any) => v.unidade === "ITAIM"), true);
    assert.equal(tripsIt.some((v: any) => v.viagem_id === e3.trip_id), false);
    const tripIt = tripsIt.find((v: any) => v.viagem_id === e1.trip_id);
    assert.equal(tripIt.procedencia, "simulado");
    assert.equal(tripIt.estado, "em_rota");
    pass("E2E6 /api/entregas projeta ITAIM em_rota sem misturar PINHEIROS");

    const pin = await jsonGet(
      `http://127.0.0.1:${port}/api/entregas?unit_id=PINHEIROS`,
    );
    assert.equal(pin.status, 200);
    assert.equal(pin.body.realidade.viagens.every((v: any) => v.unidade === "PINHEIROS"), true);
    assert.equal(pin.body.realidade.viagens.some((v: any) => v.viagem_id === e3.trip_id), true);
    assert.equal(pin.body.realidade.viagens.some((v: any) => v.viagem_id === e1.trip_id), false);
    pass("E2E7 seleção de PINHEIROS troca a fonte real sem cross-unit bleed");

    const hist = await jsonGet(
      `http://127.0.0.1:${port}/api/historico?unit_id=ITAIM`,
    );
    assert.equal(hist.status, 200);
    assert.equal(hist.body.operacao_viva.disponivel, true);
    assert.ok(hist.body.operacao_viva.eventos.length >= 2);
    assert.equal(
      hist.body.operacao_viva.eventos.every((e: any) => e.unit_id === "ITAIM"),
      true,
    );
    assert.equal(
      hist.body.operacao_viva.eventos.every((e: any) => e.source_mode === "simulated"),
      true,
    );
    assert.equal(hist.raw.includes('"payload"'), false);
    assert.equal(itaim.raw.includes('"payload"'), false);
    pass("E2E8 histórico e realidade finais não expõem payload bruto");

    const semUnidade = await jsonGet(
      `http://127.0.0.1:${port}/api/entregas`,
    );
    assert.equal(semUnidade.status, 200);
    assert.equal(semUnidade.body.realidade.fonte.observado, false);
    assert.equal(semUnidade.body.realidade.fonte.motivo, "integracao_pendente");

    const post = await fetch(
      `http://127.0.0.1:${port}/api/entregas?unit_id=ITAIM`,
      { method: "POST" },
    );
    assert.equal(post.status, 405);
    pass("E2E9 superfície exige unidade e continua estruturalmente read-only");

    const allLogs = ingestLog.text() + "\n" + productLog.text();
    for (const secret of [SOURCE_SECRET, WRITER_SECRET, PRODUCT_SECRET]) {
      assert.equal(allLogs.includes(secret), false, "segredo sentinela vazou no log");
    }
    assert.equal(allLogs.includes(SRC_READER), false, "nome do papel source vazou no log");
    assert.equal(allLogs.includes(WRITER), false, "nome do writer vazou no log");
    assert.equal(allLogs.includes(PRODUCT), false, "nome do reader do produto vazou no log");
    pass("E2E10 logs dos processos não vazam credenciais nem nomes dos papéis de ensaio");

    console.log("\nSOURCE_TO_PRODUCT_E2E: " + passed + "/10 PASS");
  } finally {
    if (ingest && ingest.exitCode === null) ingest.kill();
    if (product && product.exitCode === null) product.kill();

    if (sourceDb) await sourceDb.descartar().catch(() => undefined);
    if (targetDb) await targetDb.descartar().catch(() => undefined);
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
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
