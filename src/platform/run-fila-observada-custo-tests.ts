/**
 * CUSTO DA OBSERVAÇÃO DA FILA COM HISTÓRICO CRESCENTE — medido, não suposto.
 *
 * Três consultas, cada uma com o histórico crescendo e a fila parada:
 *
 *  1. PILOTO (modo arquivo): `snapshot()` (o que `/api/snapshot` serve) contra
 *     a saída mínima (`observeReadyQueue`). A fila fica com o mesmo tamanho; só
 *     as viagens passadas crescem.
 *  2. CONSUMIDOR em execução (`entregas-source-ingest`): o ciclo OCIOSO do feed
 *     do arquivo, com o cursor já no fim — nada novo para ler.
 *  3. PLATAFORMA (PostgreSQL): a leitura do estado atual sobre um event log de
 *     viagens sintéticas com GPS, e a conferência da marca pela chave.
 *
 * O que vira asserção é só o que é determinístico: bytes da resposta, linhas
 * visitadas e páginas lidas pelo PostgreSQL (EXPLAIN ANALYZE, BUFFERS),
 * aberturas do arquivo. Tempo de relógio é impresso, nunca afirmado.
 *
 * Dados sintéticos, banco isolado e descartado. PostgreSQL: DELIVERYOS_PG_URL;
 * sem ele, a parte 3 é PULADA EM VOZ ALTA.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";

import { asInternalRiderActorId } from "../entregas/foundation/brands";
import { createFileEntregasEventFeed } from "../entregas/integration/durable-event-feed";
import { openFileUnitOfWork } from "../entregas/persistence/file-store";
import type { PilotConfig } from "../entregas/pilot/pilot-config";
import { PilotApplicationFacade } from "../entregas/pilot/pilot-facade";
import { createPilotLogger } from "../entregas/pilot/pilot-log";
import { FilePilotReadyOrderStore } from "../entregas/pilot/ready-orders";

const UNIT = "ITAIM";
let passed = 0;
const failures: string[] = [];
async function teste(nome: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  OK   ${nome}`);
  } catch (e) {
    failures.push(nome);
    console.error(`  FAIL ${nome}\n       ${(e as Error).message.split("\n").slice(0, 6).join("\n       ")}`);
  }
}

async function mediana(n: number, fn: () => Promise<unknown>): Promise<number> {
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = performance.now();
    await fn();
    t.push(performance.now() - a);
  }
  t.sort((x, y) => x - y);
  return Math.round(t[Math.floor(t.length / 2)]! * 100) / 100;
}

const DEGRAUS_PILOTO = [0, 150, 450];
const FILA_PARADA = 20;
const DEGRAUS_BANCO = [100, 1_000, 10_000];
const GPS_POR_VIAGEM = 40;

interface MedidaPiloto { viagens: number; store_bytes: number; snapshot_ms: number; snapshot_bytes: number;
  observacao_ms: number; observacao_bytes: number; feed_ocioso_ms: number }

async function piloto(): Promise<MedidaPiloto[]> {
  const dir = mkdtempSync(join(tmpdir(), "custo-fila-"));
  const cfg = {
    mode: "pilot", unit_id: UNIT, unit_name: "T", timezone: "America/Sao_Paulo", port: 5199, bind: "127.0.0.1",
    data_dir: dir, max_stops: 5, banner: "PILOTO {unit_name}", source_mode: "simulated",
    users: [
      { actor_id: "ops-1", role: "operador_expedicao", label: "Ops", token: "tok-ops" },
      { actor_id: "rid-1", role: "motoboy_interno", label: "Rider", token: "tok-rider" },
      { actor_id: "ger-1", role: "gerente", label: "Gerente", token: "tok-ger" },
    ],
    features: { demo_seed: false, demo_controls: false, map_poc: false, gps_production: false,
      auto_assignment: false, copiloto: false, shell: false },
  } as PilotConfig;
  const facade = new PilotApplicationFacade(cfg, createPilotLogger(dir), undefined,
    new FilePilotReadyOrderStore(join(dir, "ready_orders.json")), { internalRiders: () => new Set(["rid-1"]) });
  const ops = { actor_id: "ops-1", role: "operador_expedicao" as const };
  const rid = { actor_id: "rid-1", role: "motoboy_interno" as const };
  const ger = { actor_id: "ger-1", role: "gerente" as const };
  const registrar = (ref: string) => facade.withActor(ops, () => facade.registerReadyOrder(ref, `Pedido ${ref} · Rua Sintética 9`, "proprio"));
  for (let i = 0; i < FILA_PARADA; i++) assert.equal((await registrar(`Q-${i}`)).ok, true);
  const medidas: MedidaPiloto[] = [];
  let feitas = 0;
  try {
    for (const alvo of DEGRAUS_PILOTO) {
      while (feitas < alvo) {
        const k = feitas;
        for (const s of ["a", "b"]) assert.equal((await registrar(`V-${k}-${s}`)).ok, true);
        const agora = () => new Date().toISOString();
        const ct = await facade.executeAs(ops, { type: "CreateTrip", command_id: `c-${k}`, occurred_at: agora(), unit_id: UNIT,
          trip_id: `T-${k}`, courier_actor_id: asInternalRiderActorId("rid-1"), actor: ops,
          deliveries: [{ delivery_id: `D-${k}-a`, order_ref: `V-${k}-a` }, { delivery_id: `D-${k}-b`, order_ref: `V-${k}-b` }] });
        assert.equal(ct.ok, true, JSON.stringify(ct));
        const dep = await facade.executeAs(rid, { type: "ConfirmTripDeparture", command_id: `d-${k}`, occurred_at: agora(),
          unit_id: UNIT, trip_id: `T-${k}`, actor: rid });
        assert.equal(dep.ok, true, JSON.stringify(dep));
        feitas += 1;
      }
      const snap = await facade.withActor(ger, () => facade.snapshot());
      const obs = await facade.withActor(ger, () => facade.observeReadyQueue({ storage_backend: "file", process_started_at: "2026-11-01T09:00:00.000Z" }));
      assert.equal(obs.ok, true);
      const feed = createFileEntregasEventFeed(join(dir, "store.json"));
      let cursor: string | null = null;
      for (;;) { const p = await feed.poll(cursor, 500); if (!p.events.length) break; cursor = p.next_cursor; }
      // Ocioso de verdade: nada escrito há mais que a estabilidade exigida.
      await new Promise((r) => setTimeout(r, 3_200));
      await feed.poll(cursor, 50);
      medidas.push({
        viagens: alvo,
        store_bytes: existsSync(join(dir, "store.json")) ? statSync(join(dir, "store.json")).size : 0,
        snapshot_ms: await mediana(5, () => facade.withActor(ger, () => facade.snapshot())),
        snapshot_bytes: Buffer.byteLength(JSON.stringify(snap)),
        observacao_ms: await mediana(5, () => facade.withActor(ger, () => facade.observeReadyQueue({ storage_backend: "file", process_started_at: "2026-11-01T09:00:00.000Z" }))),
        // Instante e marca mudam de valor, não de natureza: medidos como constantes.
        observacao_bytes: Buffer.byteLength(JSON.stringify((obs as { observation: { observed_at: string } }).observation,
          (k, v) => (k === "observed_at" || k === "last_event_id" ? "-" : v))),
        feed_ocioso_ms: await mediana(5, () => feed.poll(cursor, 50)),
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return medidas;
}

interface MedidaBanco { viagens: number; linhas_da_unidade: number; leitura_ms: number;
  fatos_linhas_visitadas: number; fatos_paginas: number; marca_paginas: number; marca_no: string;
  indice?: string }

function noDoPlano(plano: Record<string, unknown>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [plano];
  for (const f of (plano.Plans as Array<Record<string, unknown>> | undefined) ?? []) out.push(...noDoPlano(f));
  return out;
}

/** Mede a consulta dos fatos (páginas lidas, linhas visitadas, tempo) no estado atual do banco. */
async function medirFatos(cliente: import("./persistence/sql-client").PgSqlClient, obs: unknown, viagens: number,
  indice: string | undefined): Promise<MedidaBanco> {
  const { lerProntosDeEntregas } = await import("./leitura/prontos-de-entregas");
  const leitura_ms = await mediana(3, () => lerProntosDeEntregas(cliente, { agora: new Date(), unit_id: UNIT,
    fila: { origem: "observacao_do_piloto", observacao: obs } }));
  const planoFatos = (await cliente.query<{ "QUERY PLAN": unknown }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
     SELECT event_id, event_type, unit_id, object_type, object_id, occurred_at, idempotency_key, source_mode, payload
       FROM platform.event_log WHERE unit_id = $1 AND event_type = ANY($2)`,
    [UNIT, ["delivery_ready", "delivery_removed", "trip_started"]]))[0]!["QUERY PLAN"] as Array<{ Plan: Record<string, unknown> }>;
  const nos = noDoPlano(planoFatos[0]!.Plan);
  const visitadas = nos.reduce((acc, n) => acc + Number(n["Actual Rows"] ?? 0) + Number(n["Rows Removed by Filter"] ?? 0)
    + Number(n["Rows Removed by Index Recheck"] ?? 0), 0);
  const paginas = (n: Record<string, unknown>) => Number(n["Shared Hit Blocks"] ?? 0) + Number(n["Shared Read Blocks"] ?? 0);
  const ultimo = `ts-${viagens - 1}`;
  const planoMarca = (await cliente.query<{ "QUERY PLAN": unknown }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT 1 FROM platform.event_log WHERE event_id = $1 AND unit_id = $2`,
    [ultimo, UNIT]))[0]!["QUERY PLAN"] as Array<{ Plan: Record<string, unknown> }>;
  const linhas = await cliente.query<{ n: string }>(`SELECT count(*)::text AS n FROM platform.event_log WHERE unit_id=$1`, [UNIT]);
  return {
    viagens, linhas_da_unidade: Number(linhas[0]!.n), leitura_ms,
    fatos_linhas_visitadas: visitadas, fatos_paginas: paginas(planoFatos[0]!.Plan),
    marca_paginas: paginas(planoMarca[0]!.Plan),
    marca_no: String(planoMarca[0]!.Plan["Node Type"]) + " " + String(planoMarca[0]!.Plan["Index Name"] ?? ""),
    ...(indice ? { indice } : {}),
  };
}

async function banco(url: string): Promise<MedidaBanco[]> {
  const { bancoIsolado } = await import("./banco-isolado");
  const { lerProntosDeEntregas } = await import("./leitura/prontos-de-entregas");
  const db = await bancoIsolado(url, undefined, "custo_fila");
  const medidas: MedidaBanco[] = [];
  try {
    await db.cliente.query(`INSERT INTO identity.unit(unit_id,display_name) VALUES ($1,'Teste')`, [UNIT]);
    let feitas = 0;
    for (const alvo of DEGRAUS_BANCO) {
      // Viagens sintéticas: criação, 2 prontos, saída, GPS e encerramento.
      await db.cliente.query(
        `WITH v AS (SELECT g AS k, timestamptz '2026-10-01T10:00:00Z' + (g || ' minutes')::interval AS t
                      FROM generate_series($2::int, $3::int - 1) g),
              linhas AS (
                SELECT 'tc-'||k AS id, 'trip_created' AS tipo, t AS em, k, '{}'::jsonb AS p FROM v
                UNION ALL SELECT 'dr-'||k||'-'||s, 'delivery_ready', t - interval '3 minutes', k,
                  jsonb_build_object('source_event_type','delivery_ready','public_recorded_at', t,
                    'delivery_id','D-'||k||'-'||s,'order_ref','V-'||k||'-'||s,'ready_kind','registro_expedicao')
                  FROM v, (VALUES ('a'),('b')) x(s)
                UNION ALL SELECT 'ts-'||k, 'trip_started', t + interval '2 minutes', k,
                  jsonb_build_object('source_event_type','trip_started','public_recorded_at', t + interval '2 minutes') FROM v
                UNION ALL SELECT 'gp-'||k||'-'||n, 'gps_batch_received', t + (n || ' seconds')::interval, k,
                  jsonb_build_object('latitude', -23.58, 'longitude', -46.67) FROM v, generate_series(1, $4::int) n
                UNION ALL SELECT 'cl-'||k, 'trip_closed', t + interval '40 minutes', k, '{}'::jsonb FROM v)
         INSERT INTO platform.event_log (event_id, event_type, occurred_at, recorded_at, unit_id, object_type, object_id,
           origin, idempotency_key, payload, source_mode, contract_version)
         SELECT id, tipo, em, em, $1, 'trip', 'T-'||k, 'entregas', 'k-'||id, p, 'simulated', 'teste' FROM linhas
          ORDER BY em`,
        [UNIT, feitas, alvo, GPS_POR_VIAGEM]);
      feitas = alvo;
      await db.cliente.query("ANALYZE platform.event_log");
      const obs = {
        schema: "deliveryos.ready-queue-observation.v1", unit_id: UNIT,
        origin: { system: "entregas-pilot", storage_backend: "file", process_started_at: "2026-11-01T09:00:00.000Z" },
        observed_at: new Date().toISOString(), availability: "available", reason: null, total: 1, invalid_entries: 0,
        entries: [{ order_ref: "Q-1", registered_at: "2026-11-01T09:59:00.000Z", channel: "proprio", source_mode: "simulated" }],
        facts_watermark: { availability: "available", covered_types: ["delivery_ready", "delivery_removed", "trip_started"],
          last_event_id: `ts-${alvo - 1}` },
      };
      const r = await lerProntosDeEntregas(db.cliente, { agora: new Date(), unit_id: UNIT,
        fila: { origem: "observacao_do_piloto", observacao: obs } });
      assert.equal((r.estado_atual as { consistencia_dos_fatos: string }).consistencia_dos_fatos, "fatos_em_dia");
      medidas.push(await medirFatos(db.cliente, obs, alvo, undefined));
      if (alvo === DEGRAUS_BANCO[DEGRAUS_BANCO.length - 1]) {
        // SÓ NESTE BANCO DESCARTÁVEL: o índice que uma migration teria de criar. Mede o ganho real.
        await db.cliente.query(`CREATE INDEX medida_unidade_tipo_idx ON platform.event_log (unit_id, event_type, occurred_at)`);
        await db.cliente.query("ANALYZE platform.event_log");
        medidas.push(await medirFatos(db.cliente, obs, alvo, "(unit_id, event_type, occurred_at) — só no banco descartável"));
      }
    }
  } finally {
    await db.descartar();
  }
  return medidas;
}

async function main(): Promise<void> {
  console.log("CUSTO — observação da fila, ciclo do consumidor e leitura da plataforma, com histórico crescente");
  // Rodada curta das mutações do feed: só a memória do feed, e as outras partes PULADAS em voz alta.
  if (process.env.CUSTO_SO_FEED === "1") {
    console.log("  PULADO (CUSTO_SO_FEED=1): C1-C4 e C9 NAO rodaram nesta rodada");
    await memoriaDoFeed();
    const total = passed + failures.length;
    console.log(`CUSTO_FILA_OBSERVADA: ${passed}/${total} PASS (somente feed)`);
    if (failures.length) { console.log(`CUSTO_FILA_OBSERVADA_RED: ${failures.map((f) => f.split(" ")[0]).join(" ")}`); process.exit(1); }
    return;
  }
  // Cada parte vira prova isolada: uma falha na medição do piloto não esconde as outras.
  let p: MedidaPiloto[] = [];
  let erroPiloto: Error | null = null;
  try { p = await piloto(); console.table(p); } catch (e) { erroPiloto = e as Error; }
  await teste("C1 a saída mínima tem o MESMO tamanho com 0, 150 e 450 viagens no histórico: ela lê a fila, não o passado", () => {
    if (erroPiloto) throw erroPiloto;
    assert.equal(new Set(p.map((m) => m.observacao_bytes)).size, 1, JSON.stringify(p.map((m) => m.observacao_bytes)));
  });
  await teste("C2 o snapshot cresce com o histórico (por isso não serve de fonte da fila)", () => {
    if (erroPiloto) throw erroPiloto;
    for (let i = 1; i < p.length; i++) assert.ok(p[i]!.snapshot_bytes > p[i - 1]!.snapshot_bytes, JSON.stringify(p.map((m) => m.snapshot_bytes)));
  });

  const url = process.env.DELIVERYOS_PG_URL?.trim();
  if (!url) {
    console.log("  PULADO PostgreSQL: DELIVERYOS_PG_URL ausente — C3 e C4 NAO rodaram");
  } else {
    let todas: MedidaBanco[] = [];
    let erroBanco: Error | null = null;
    try { todas = await banco(url); console.table(todas); } catch (e) { erroBanco = e as Error; }
    const b = todas.filter((m) => !m.indice);
    const comIndice = todas.find((m) => m.indice);
    const exigirBanco = () => { if (erroBanco) throw erroBanco; };
    await teste("C3 a marca é conferida pela CHAVE: as mesmas poucas páginas com 100, 1.000 e 10.000 viagens", () => {
      exigirBanco();
      for (const m of b) assert.match(m.marca_no, /Index/, m.marca_no);
      assert.ok(Math.max(...b.map((m) => m.marca_paginas)) <= 8, JSON.stringify(b.map((m) => m.marca_paginas)));
    });
    await teste("C9 MEDIDA PARA DECISÃO: um índice por tipo NÃO resolve — com o GPS intercalado, as páginas lidas quase não caem", () => {
      exigirBanco();
      assert.ok(comIndice, "a medida com índice não foi feita");
      const sem = b[b.length - 1]!;
      console.log(`       sem índice: ${sem.fatos_paginas} páginas, ${sem.leitura_ms} ms · com índice: ${comIndice!.fatos_paginas} páginas, ${comIndice!.leitura_ms} ms`);
      assert.ok(comIndice!.fatos_linhas_visitadas < sem.fatos_linhas_visitadas, "o índice não reduziu as linhas visitadas");
      // Os três tipos estão em quase toda página (uma viagem ≈ uma página, com GPS no meio):
      // o índice poupa linhas, não páginas. Migration de índice não é a resposta.
      assert.ok(comIndice!.fatos_paginas >= sem.fatos_paginas * 0.7,
        `o índice reduziu as páginas mais do que o esperado: ${sem.fatos_paginas} → ${comIndice!.fatos_paginas}`);
    });

    await teste("C4 LIMITE MEDIDO: os fatos do estado atual leem as páginas da unidade inteira (GPS incluído) — crescem com o histórico", () => {
      exigirBanco();
      for (let i = 1; i < b.length; i++) {
        const linhas = b[i]!.linhas_da_unidade / b[0]!.linhas_da_unidade;
        const paginas = b[i]!.fatos_paginas / b[0]!.fatos_paginas;
        assert.ok(paginas >= linhas * 0.9, `as páginas não acompanharam o histórico: ${JSON.stringify(b)}`);
      }
    });
  }

  await memoriaDoFeed();

  const total = passed + failures.length;
  console.log(`CUSTO_FILA_OBSERVADA: ${passed}/${total} PASS`);
  if (failures.length) {
    console.log(`CUSTO_FILA_OBSERVADA_RED: ${failures.map((f) => f.split(" ")[0]).join(" ")}`);
    process.exit(1);
  }
  console.log("CUSTO_FILA_OBSERVADA_GREEN");
}

/** O feed do arquivo reabre a loja só quando ela muda — e nunca entrega dado velho. */
async function memoriaDoFeed(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "custo-feed-"));
  try {
    const cfg = {
      mode: "pilot", unit_id: UNIT, unit_name: "T", timezone: "America/Sao_Paulo", port: 5199, bind: "127.0.0.1",
      data_dir: dir, max_stops: 5, banner: "PILOTO {unit_name}", source_mode: "simulated",
      users: [{ actor_id: "ops-1", role: "operador_expedicao", label: "Ops", token: "tok-ops" },
        { actor_id: "rid-1", role: "motoboy_interno", label: "Rider", token: "tok-rider" }],
      features: { demo_seed: false, demo_controls: false, map_poc: false, gps_production: false,
        auto_assignment: false, copiloto: false, shell: false },
    } as PilotConfig;
    const facade = new PilotApplicationFacade(cfg, createPilotLogger(dir), undefined,
      new FilePilotReadyOrderStore(join(dir, "ready_orders.json")), { internalRiders: () => new Set(["rid-1"]) });
    const ops = { actor_id: "ops-1", role: "operador_expedicao" as const };
    const viagem = async (k: string) => {
      assert.equal((await facade.withActor(ops, () => facade.registerReadyOrder(`P-${k}`, `Pedido ${k}`, "proprio"))).ok, true);
      const r = await facade.executeAs(ops, { type: "CreateTrip", command_id: `c-${k}`, occurred_at: new Date().toISOString(),
        unit_id: UNIT, trip_id: `T-${k}`, courier_actor_id: asInternalRiderActorId("rid-1"), actor: ops,
        deliveries: [{ delivery_id: `D-${k}`, order_ref: `P-${k}` }] });
      assert.equal(r.ok, true, JSON.stringify(r));
    };
    const arquivo = join(dir, "store.json");
    await viagem("1");
    let aberturas = 0;
    let duranteALeitura: (() => void) | null = null;
    // Relógio do teste: "parado há tempo bastante" sem esperar segundos reais.
    let adiante = 60_000;
    const feed = createFileEntregasEventFeed(arquivo, { agora: () => Date.now() + adiante, abrir: () => {
      aberturas += 1;
      const outbox = openFileUnitOfWork(arquivo).outbox;
      return { all: async () => { const r = await outbox.all(); duranteALeitura?.(); return r; } };
    } });
    let cursor: string | null = null;
    for (;;) { const p = await feed.poll(cursor, 50); if (!p.events.length) break; cursor = p.next_cursor; }

    await teste("C5 ciclo ocioso: com o arquivo igual, o feed NÃO reabre a loja", async () => {
      assert.ok(aberturas >= 1, "o feed não usou o abridor: a medida de reabertura seria vazia");
      const antes = aberturas;
      for (let i = 0; i < 5; i++) assert.equal((await feed.poll(cursor, 50)).events.length, 0);
      assert.equal(aberturas - antes, 0, `reabriu ${aberturas - antes} vezes sem mudança`);
    });

    await teste("C6 commit novo: o feed reabre uma vez, entrega o evento novo e volta a ficar ocioso", async () => {
      await viagem("2");
      const antes = aberturas;
      const p = await feed.poll(cursor, 50);
      assert.ok(p.events.some((e) => e.trip_id === "T-2"), "o evento novo não veio");
      assert.equal(aberturas - antes, 1);
      cursor = p.next_cursor;
      for (let i = 0; i < 3; i++) assert.equal((await feed.poll(cursor, 50)).events.length, 0);
      assert.equal(aberturas - antes, 1, "voltou a reler sem mudança");
    });

    await teste("C7 arquivo que muda durante a leitura não fica em memória: a próxima leitura reabre e vê o commit", async () => {
      // Força a releitura e, NO MEIO dela, reescreve o arquivo no lugar.
      writeFileSync(arquivo, readFileSync(arquivo, "utf8"));
      duranteALeitura = () => { duranteALeitura = null; writeFileSync(arquivo, readFileSync(arquivo, "utf8") + " "); };
      const a0 = aberturas;
      await feed.poll(cursor, 50);
      assert.equal(aberturas - a0, 1, "a mudança antes da leitura não forçou releitura");
      await feed.poll(cursor, 50);
      assert.equal(aberturas - a0, 2, "a leitura feita durante a escrita ficou em memória");
      await viagem("3");
      const p = await feed.poll(cursor, 50);
      assert.equal(aberturas - a0, 3);
      assert.ok(p.events.some((e) => e.trip_id === "T-3"), "o commit seguinte se perdeu");
    });

    await teste("C7b arquivo mexido agora (dentro do tique do relógio de arquivo) é sempre relido, mesmo sem mudar de assinatura", async () => {
      adiante = 0; // relógio real: o arquivo acabou de ser escrito
      writeFileSync(arquivo, readFileSync(arquivo, "utf8"));
      const a0 = aberturas;
      await feed.poll(cursor, 50);
      await feed.poll(cursor, 50);
      await feed.poll(cursor, 50);
      assert.equal(aberturas - a0, 3, "arquivo recém-escrito ficou em memória: a corrida do tique ficaria aberta");
      adiante = 60_000;
    });

    await teste("C8 o que sai da memória é cópia: mexer no evento devolvido não muda a próxima leitura", async () => {
      const todos = await feed.poll(null, 500);
      (todos.events[0] as unknown as Record<string, unknown>).trip_id = "ADULTERADO";
      const de_novo = await feed.poll(null, 500);
      assert.notEqual(de_novo.events[0]!.trip_id, "ADULTERADO");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
