/**
 * Q-026: demonstra que event_log nao fornece cursor de commit seguro.
 * Banco REAL mas isolado e descartado ao final. Fatos 100% simulated.
 *
 * Este teste NAO cria migracao nem implementa um novo cursor.
 * Sem DELIVERYOS_PG_URL, falha fechada (78, nao um verde ficticio).
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";

const url = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!url) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente, nenhum PostgreSQL exercitado.");
  process.exit(78);
}

const b = await bancoIsolado(url, undefined, "q026cur");
let aprovados = 0;
async function caso(nome: string, fn: () => Promise<void>) {
  await fn();
  console.log("  ok " + nome);
  aprovados += 1;
}
const ocorreu = "2026-10-09T12:00:00.000Z";
let num = 0;
function inserir(id: string, recordedAt?: string) {
  const stamp = recordedAt ? ", recorded_at" : "";
  const params = [id, ocorreu, ...(recordedAt ? [recordedAt] : [])];
  return {
    sql: "INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload, occurred_at, origin, idempotency_key, contract_version, source_mode" +
      stamp + ") VALUES ($1,'ITAIM','trip','TRIP-Q026','trip_created','{}'::jsonb,$2,'system',$1,'trip_created@1.0.0','simulated'" +
      (recordedAt ? ",$3" : "") + ")",
    params,
  };
}
async function gravar(id: string, recordedAt?: string) {
  const q = inserir(id, recordedAt);
  return b.cliente.query(q.sql, q.params);
}

try {
  await caso("P1: duas linhas da mesma transacao compartilham recorded_at DEFAULT now()", async () => {
    await b.cliente.transaction(async (tx) => {
      for (const id of ["q026-mesma-tx-a", "q026-mesma-tx-b"]) {
        const q = inserir(id);
        await tx.query(q.sql, q.params);
      }
    });
    const r = await b.cliente.query(
      "SELECT DISTINCT recorded_at FROM platform.event_log WHERE event_id LIKE 'q026-mesma-tx-%'",
    );
    assert.equal(r.length, 1, "recorded_at nao fornece ordem total/unica");
  });

  await caso("P2: transacao antiga confirma depois da nova e escapa de cursor de timestamp", async () => {
    let liberar!: () => void;
    let inserido!: () => void;
    const aguardarLiberacao = new Promise<void>((r) => (liberar = r));
    const aguardarInsercao = new Promise<void>((r) => (inserido = r));
    // Conexao reservada A: insere primeiro, continua aberta e NAO confirmada.
    const a = b.cliente.transaction(async (tx) => {
      const q = inserir("q026-commit-a");
      await tx.query(q.sql, q.params);
      inserido();
      await aguardarLiberacao;
    });
    try {
      await aguardarInsercao;
      // Conexao B: confirma antes. A ainda nao esta visivel a outras conexoes.
      await gravar("q026-commit-b");
      const visivel = await b.cliente.query(
        "SELECT event_id, recorded_at FROM platform.event_log WHERE event_id LIKE 'q026-commit-%' ORDER BY recorded_at",
      );
      assert.deepEqual(visivel.map((x) => String(x.event_id)), ["q026-commit-b"]);
      // Uma leitura incremental usaria esse watermark e declararia captura completa.
      const cursor = visivel[0].recorded_at;
      liberar();
      await a;
      const apos = await b.cliente.query(
        "SELECT event_id, recorded_at FROM platform.event_log WHERE event_id LIKE 'q026-commit-%' ORDER BY recorded_at",
      );
      assert.deepEqual(apos.map((x) => String(x.event_id)), ["q026-commit-a", "q026-commit-b"]);
      // A linha A confirma POR ULTIMO mas possui timestamp ANTERIOR a B.
      const delta = await b.cliente.query(
        "SELECT event_id FROM platform.event_log WHERE event_id LIKE 'q026-commit-%' AND recorded_at > $1",
        [cursor],
      );
      assert.equal(delta.some((x) => x.event_id === "q026-commit-a"), false);
    } finally {
      liberar();
      await a;
    }
  });

  await caso("P3: event_id TEXT tambem nao guarda ordem causal sob carimbo igual", async () => {
    const carimbo = "2026-10-09T12:34:56.000Z";
    await gravar("q026-zz-antes", carimbo);
    await gravar("q026-aa-depois", carimbo);
    const r = await b.cliente.query(
      "SELECT event_id FROM platform.event_log WHERE event_id IN ($1,$2) ORDER BY recorded_at, event_id",
      ["q026-zz-antes", "q026-aa-depois"],
    );
    assert.deepEqual(r.map((x) => String(x.event_id)), ["q026-aa-depois", "q026-zz-antes"]);
    // Um cursor em (recorded_at,event_id) apos ZZ perderia AA.
    const delta = await b.cliente.query(
      "SELECT event_id FROM platform.event_log WHERE (recorded_at,event_id) > ($1,$2)",
      [carimbo, "q026-zz-antes"],
    );
    assert.equal(delta.some((x) => x.event_id === "q026-aa-depois"), false);
  });

  console.log("\nQ026_INGEST_CURSOR_PG: " + aprovados + "/3 PASS.");
  console.log("LIMITACAO: prova a INSEGURANCA dos cursores ingenuos, NAO uma solucao.");
} finally {
  await b.descartar();
}
