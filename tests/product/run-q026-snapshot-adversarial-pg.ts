/**
 * Q-026 SHADOW — INSTANTANEO, TRANSACOES E VISIBILIDADE na leitura de Entregas.
 *
 * Somente testes. Nenhum arquivo de runtime, Product UI, Android ou migration
 * muda. Cada caso cria um PostgreSQL DESCARTAVEL com as migrations reais
 * (`banco-isolado.ts`), um ESCRITOR numa conexao propria e o LEITOR de
 * verdade (`lerRealidadeDeEntregas`, `lerFatosParaReplay`), sem copia.
 *
 * A concorrencia e real: duas sessoes no servidor. O PONTO em que o escritor
 * confirma e deterministico — um gancho no cliente do leitor dispara a escrita
 * entre as duas transacoes da porta, ou entre duas consultas da mesma
 * transacao. Nada de `sleep` disputando corrida.
 *
 * NEG      demonstra que a hipotese insegura FALHA (o teste passa quando a
 *          falha aparece, com o valor exato).
 * POS      a alternativa segura NAO falha sob o MESMO gancho — e a escrita
 *          aparece numa leitura seguinte (nao foi perdida nem ignorada).
 * CONTROLE sem escrita concorrente nao ha divergencia: prova que ela vem da
 *          concorrencia, e nao do arranjo do teste.
 * ACHADO   comportamento ATUAL da porta canonica que este teste trava como
 *          evidencia. Quando a porta mudar, o teste muda junto, de proposito.
 *
 * Uso: DELIVERYOS_PG_URL=postgres://<admin>@<host>/postgres \
 *        npx tsx tests/product/run-q026-snapshot-adversarial-pg.ts
 * Sem DELIVERYOS_PG_URL: sai 78, PULADO em voz alta — nunca verde.
 */

import assert from "node:assert/strict";

import { bancoIsolado, type BancoIsolado } from "../../src/platform/banco-isolado";
import {
  createPgClient,
  type SqlClient,
  type SqlRow,
  type TransactionalSqlClient,
} from "../../src/platform/persistence/sql-client";
import {
  lerRealidadeDeEntregas,
  type RealidadeDeEntregas,
} from "../../src/platform/leitura/realidade-de-entregas";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
import { entregasVM } from "../../src/product/viewmodels/entregas-vm";
import { montarEntregasDemo } from "../../src/product/demo/seed-demonstracao";
import { comGanchos, numSoInstantaneo } from "./q026-adversarial-comum";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhuma prova de instantaneo rodou — isto nao e verde.");
  process.exit(78);
}

const AGORA = new Date("2026-10-10T15:00:00.000Z");
const ha = (s: number): string => new Date(AGORA.getTime() - s * 1000).toISOString();

let passaram = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message.split("\n").slice(0, 4).join(" | ") : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

/* ------------------------------------------------------------------ *
 * Banco, escrita e leitura
 * ------------------------------------------------------------------ */

interface Fato {
  event_id: string;
  object_type?: string;
  object_id: string;
  event_type: string;
  occurred_at: string;
  recorded_at: string;
  device_id?: string | null;
  sequence_local?: number | string | null;
  source_mode?: string;
  unit_id?: string;
}

async function gravar(c: SqlClient, f: Fato): Promise<void> {
  await c.query(
    `INSERT INTO platform.event_log
       (event_id, unit_id, object_type, object_id, event_type, payload, occurred_at, recorded_at,
        origin, idempotency_key, contract_version, device_id, sequence_local, source_mode, clock_trust)
     VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,$6,$7,'device',$8,$9,$10,$11,$12,'trusted')`,
    [
      f.event_id,
      f.unit_id ?? "ITAIM",
      f.object_type ?? "trip",
      f.object_id,
      f.event_type,
      f.occurred_at,
      f.recorded_at,
      `k-${f.event_id}`,
      `${f.event_type}@1.0.0`,
      f.device_id === undefined ? "dev-1" : f.device_id,
      f.sequence_local ?? null,
      f.source_mode ?? "simulated",
    ],
  );
}

/**
 * Uma viagem em rota cujo ultimo lote tem 9 minutos: o caso em que a tela
 * pede conferencia ("sem posicao recente"). Todo fato `simulated`.
 */
async function semear(c: SqlClient): Promise<void> {
  await c.query(`INSERT INTO identity.unit(unit_id, display_name) VALUES ('ITAIM','Itaim')`);
  await c.query(
    `INSERT INTO identity.device(device_id, unit_id, label, registered_at, secret_bound_at, last_session_at)
     VALUES ('dev-1','ITAIM','Moto 01 · celular A',$1,$1,$2)`,
    [ha(86400), ha(600)],
  );
  await gravar(c, { event_id: "ini-1", object_id: "T-1", event_type: "trip_created", occurred_at: ha(1500), recorded_at: ha(1500), sequence_local: 1 });
  await gravar(c, { event_id: "ini-2", object_id: "T-1", event_type: "trip_started", occurred_at: ha(1400), recorded_at: ha(1400), sequence_local: 2 });
  await gravar(c, { event_id: "gps-1", object_id: "T-1", event_type: "gps_batch_received", occurred_at: ha(540), recorded_at: ha(538), sequence_local: 3 });
}

/** O lote que chega "agora": 5 segundos antes da leitura. */
const LOTE_NOVO: Fato = {
  event_id: "gps-2",
  object_id: "T-1",
  event_type: "gps_batch_received",
  occurred_at: ha(5),
  recorded_at: ha(5),
  sequence_local: 4,
};

async function novoBanco(): Promise<BancoIsolado> {
  return bancoIsolado(URL_BASE, undefined, "q026snap");
}

/** Uma conexao so para o escritor: a escrita confirma em OUTRA sessao do servidor. */
async function escritorDe(b: BancoIsolado): Promise<TransactionalSqlClient> {
  return createPgClient({ url: b.url, max: 1 });
}

function viagem(r: RealidadeDeEntregas, id: string) {
  const v = r.projecoes.flatMap((p) => p.viagens).find((x) => x.trip_id === id);
  assert.ok(v, `viagem ${id} ausente da projecao`);
  return v;
}
function aparelho(r: RealidadeDeEntregas, id: string) {
  const a = r.aparelhos.find((x) => x.device_id === id);
  assert.ok(a, `aparelho ${id} ausente do cadastro lido`);
  return a;
}
const gpsNaProjecao = (r: RealidadeDeEntregas, id: string): number =>
  viagem(r, id).eventos.filter((e) => e.startsWith("gps-")).length;

/** A view model REAL de Entregas sobre a leitura. */
async function vmDe(r: RealidadeDeEntregas) {
  const f = await montarEntregasDemo();
  return entregasVM(await f.snapshot(), AGORA.toISOString(), f.getPolicyMaxStops(), { disponivel: true, realidade: r }, {});
}

/* ------------------------------------------------------------------ *
 * Casos
 * ------------------------------------------------------------------ */

void (async () => {
  console.log(`\nQ-026 — INSTANTANEO E TRANSACOES (PostgreSQL descartavel, migrations reais)`);
  const sonda = await novoBanco();
  try {
    const [r] = await sonda.cliente.query(
      `SELECT version() AS v, current_setting('default_transaction_isolation') AS iso,
              (SELECT datcollate FROM pg_database WHERE datname = current_database()) AS colacao`,
    );
    console.log(`  ${String(r!.v).split(" on ")[0]} · isolamento padrao: ${String(r!.iso)} · colacao: ${String(r!.colacao)}`);
  } finally {
    await sonda.descartar();
  }

  await teste("S1 CONTROLE sem escrita concorrente, viagem e aparelho contam a mesma historia", async () => {
    const b = await novoBanco();
    try {
      await semear(b.cliente);
      const r = await lerRealidadeDeEntregas(b.cliente, { agora: AGORA });
      assert.equal(viagem(r, "T-1").ultima_posicao_em, ha(540));
      assert.equal(aparelho(r, "dev-1").ultimo_lote?.occurred_at, ha(540));
      assert.equal(aparelho(r, "dev-1").fatos_por_modo.simulated, gpsNaProjecao(r, "T-1"));
    } finally {
      await b.descartar();
    }
  });

  await teste("S1 NEG duas transacoes: na MESMA leitura a viagem esta 'sem posicao ha 9 min' e o aparelho dela mandou lote ha 5 s", async () => {
    const b = await novoBanco();
    const w = await escritorDe(b);
    try {
      await semear(b.cliente);
      // O lote chega depois que os fatos foram lidos e antes do cadastro.
      const leitor = comGanchos(b.cliente, { depoisDaTransacao: async (n) => (n === 1 ? gravar(w, LOTE_NOVO) : undefined) });
      const r = await lerRealidadeDeEntregas(leitor, { agora: AGORA });
      const v = viagem(r, "T-1");
      const a = aparelho(r, "dev-1");
      assert.equal(v.ultima_posicao_em, ha(540), "a projecao viu o lote novo — a janela nao abriu");
      assert.equal(v.frescor, "stale");
      assert.equal(a.ultimo_lote?.occurred_at, ha(5), "o cadastro nao viu o lote novo — a janela nao abriu");
      assert.equal(gpsNaProjecao(r, "T-1"), 1);
      assert.equal(a.fatos_por_modo.simulated, 2, "contagem do aparelho");
      // O que a pessoa le: a mesma tela, duas verdades sobre o mesmo telefone.
      const vm = await vmDe(r);
      assert.equal(vm.leitura.disponivel, true);
      if (vm.leitura.disponivel !== true) return;
      const conferir = vm.leitura.conferir.find((c) => c.chave === "viagem:T-1");
      assert.ok(conferir, "a tela nao pediu conferencia da viagem");
      assert.match(conferir.titulo, /sem posicao recebida ha 9 min/);
      const ap = vm.leitura.aparelhos.find((x) => x.device_id === "dev-1");
      assert.ok(ap && ap.ultima_posicao.observado === true, "aparelho sem posicao na tela");
      assert.equal(ap.ultima_posicao.observado === true ? ap.ultima_posicao.segundos : -1, 5);
      console.log(`      tela: "${conferir.titulo}" · aparelho dev-1 (o telefone dessa viagem): ultima posicao "${ap.ultima_posicao.observado === true ? ap.ultima_posicao.idade : "?"}"`);
    } finally {
      await w.close();
      await b.descartar();
    }
  });

  await teste("S1 POS uma transacao REPEATABLE READ envolvendo as duas leituras: o mesmo gancho nao separa os mundos", async () => {
    const b = await novoBanco();
    const w = await escritorDe(b);
    try {
      await semear(b.cliente);
      const r = await numSoInstantaneo(b.cliente, (c) =>
        lerRealidadeDeEntregas(
          comGanchos(c, { depoisDaTransacao: async (n) => (n === 1 ? gravar(w, LOTE_NOVO) : undefined) }),
          { agora: AGORA },
        ),
      );
      assert.equal(viagem(r, "T-1").ultima_posicao_em, ha(540));
      assert.equal(aparelho(r, "dev-1").ultimo_lote?.occurred_at, ha(540), "o cadastro viu um mundo diferente da projecao");
      assert.equal(aparelho(r, "dev-1").fatos_por_modo.simulated, gpsNaProjecao(r, "T-1"));
      // A escrita existiu e confirmou: a leitura SEGUINTE a ve, inteira.
      const depois = await numSoInstantaneo(b.cliente, (c) => lerRealidadeDeEntregas(c, { agora: AGORA }));
      assert.equal(viagem(depois, "T-1").ultima_posicao_em, ha(5));
      assert.equal(aparelho(depois, "dev-1").ultimo_lote?.occurred_at, ha(5));
      assert.equal(aparelho(depois, "dev-1").fatos_por_modo.simulated, gpsNaProjecao(depois, "T-1"));
    } finally {
      await w.close();
      await b.descartar();
    }
  });

  await teste("S2 NEG dentro da segunda transacao, READ COMMITTED da um instantaneo por SELECT: contagem nova, ultimo lote velho", async () => {
    const b = await novoBanco();
    const w = await escritorDe(b);
    try {
      await semear(b.cliente);
      const leitor = comGanchos(b.cliente, {
        antesDaConsulta: async (sql, n) => (n === 2 && /count\(\*\)/.test(sql) ? gravar(w, LOTE_NOVO) : undefined),
      });
      const r = await lerRealidadeDeEntregas(leitor, { agora: AGORA });
      const a = aparelho(r, "dev-1");
      assert.equal(a.ultimo_lote?.occurred_at, ha(540), "o ultimo lote deveria ser o velho (consulta anterior)");
      assert.equal(a.fatos_por_modo.simulated, 2, "a contagem deveria incluir o lote novo (consulta seguinte)");
      assert.notEqual(a.fatos_por_modo.simulated, gpsNaProjecao(r, "T-1"));
    } finally {
      await w.close();
      await b.descartar();
    }
  });

  await teste("S2 POS em REPEATABLE READ as tres consultas do cadastro veem o mesmo instante", async () => {
    const b = await novoBanco();
    const w = await escritorDe(b);
    try {
      await semear(b.cliente);
      const r = await numSoInstantaneo(b.cliente, (c) =>
        lerRealidadeDeEntregas(
          comGanchos(c, { antesDaConsulta: async (sql) => (/count\(\*\)/.test(sql) ? gravar(w, LOTE_NOVO) : undefined) }),
          { agora: AGORA },
        ),
      );
      const a = aparelho(r, "dev-1");
      assert.equal(a.ultimo_lote?.occurred_at, ha(540));
      assert.equal(a.fatos_por_modo.simulated, 1);
      assert.equal(a.fatos_por_modo.simulated, gpsNaProjecao(r, "T-1"));
      const [{ n }] = await b.cliente.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM platform.event_log WHERE event_type = 'gps_batch_received'`,
      );
      assert.equal(n, 2, "a escrita do gancho nao confirmou");
    } finally {
      await w.close();
      await b.descartar();
    }
  });

  await teste("S3 cursor: o cursor guarda o instante do DECLARE tambem em READ COMMITTED, mas ali o SELECT seguinte da mesma transacao ja ve outro mundo", async () => {
    const b = await novoBanco();
    const w = await escritorDe(b);
    const leitor = await createPgClient({ url: b.url, max: 1 });
    try {
      await semear(b.cliente);
      const contarTudo = async (c: SqlClient) => {
        const [{ n }] = await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM platform.event_log WHERE event_type = ANY($1)`,
          [TIPOS_DA_OPERACAO_VIVA],
        );
        return n;
      };
      const medir = async (isolamento: string, rodada: string) => {
        // O que estava confirmado ANTES desta rodada, medido fora dela.
        const base = await contarTudo(b.cliente);
        return leitor.transaction(async (tx) => {
          await tx.query(`SET TRANSACTION ISOLATION LEVEL ${isolamento}, READ ONLY`);
          await tx.query(
            `DECLARE q026_c NO SCROLL CURSOR FOR
               SELECT event_id FROM platform.event_log WHERE event_type = ANY($1)
               ORDER BY unit_id, source_mode, object_type, object_id, event_id`,
            [TIPOS_DA_OPERACAO_VIVA],
          );
          // Uma escrita ENTRE o DECLARE e o primeiro FETCH, outra depois dele.
          await gravar(w, { ...LOTE_NOVO, event_id: `gps-${rodada}-declare` });
          const primeiro = await tx.query(`FETCH FORWARD 1 FROM q026_c`);
          await gravar(w, { ...LOTE_NOVO, event_id: `gps-${rodada}-fetch` });
          const resto = await tx.query(`FETCH FORWARD 4096 FROM q026_c`);
          await tx.query(`CLOSE q026_c`);
          return { base, pelo_cursor: primeiro.length + resto.length, pelo_select: await contarTudo(tx) };
        });
      };
      const rc = await medir("READ COMMITTED", "rc");
      assert.equal(rc.pelo_cursor, rc.base, "o cursor viu linha confirmada depois do DECLARE");
      assert.equal(rc.pelo_select, rc.base + 2, "o SELECT seguinte nao viu as duas linhas novas");
      const rr = await medir("REPEATABLE READ", "rr");
      assert.equal(rr.base, rc.base + 2, "as escritas da rodada anterior nao confirmaram");
      assert.equal(rr.pelo_cursor, rr.base, "o cursor viu linha confirmada depois do DECLARE");
      assert.equal(rr.pelo_select, rr.base, "em REPEATABLE READ cursor e SELECT deveriam ver o mesmo instante");
      assert.equal(await contarTudo(b.cliente), rr.base + 2, "as escritas da segunda rodada nao confirmaram");
      console.log(`      confirmadas antes: ${rc.base} · READ COMMITTED: cursor ${rc.pelo_cursor} x SELECT seguinte ${rc.pelo_select} · REPEATABLE READ: confirmadas antes ${rr.base}, cursor ${rr.pelo_cursor} x SELECT ${rr.pelo_select}`);
    } finally {
      await leitor.close();
      await w.close();
      await b.descartar();
    }
  });

  await teste("S4 duas conexoes: instantaneos independentes divergem; o MESMO instante exportado (pg_export_snapshot) nao", async () => {
    const b = await novoBanco();
    const w = await escritorDe(b);
    const a = await createPgClient({ url: b.url, max: 1 });
    const c = await createPgClient({ url: b.url, max: 1 });
    try {
      await semear(b.cliente);
      const contar = (tx: SqlClient) =>
        tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM platform.event_log WHERE event_type = 'gps_batch_received'`);
      const rodada = async (exportar: boolean, id: string) =>
        a.transaction(async (txA) => {
          await txA.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
          const [{ s }] = await txA.query<{ s: string }>("SELECT pg_export_snapshot() AS s");
          const [{ n: nA }] = await contar(txA);
          await gravar(w, { ...LOTE_NOVO, event_id: id });
          const nC = await c.transaction(async (txC) => {
            await txC.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
            if (exportar) {
              assert.match(s, /^[0-9A-F-]+$/i, "identificador de instantaneo inesperado");
              await txC.query(`SET TRANSACTION SNAPSHOT '${s}'`);
            }
            const [{ n }] = await contar(txC);
            return n;
          });
          return { nA, nC };
        });
      const independentes = await rodada(false, "gps-9a");
      assert.equal(independentes.nC, independentes.nA + 1, "sem instante compartilhado, a segunda conexao deveria ver o lote novo");
      const compartilhado = await rodada(true, "gps-9b");
      assert.equal(compartilhado.nC, compartilhado.nA, "com o instante exportado, as duas conexoes veem o mesmo mundo");
    } finally {
      await a.close();
      await c.close();
      await w.close();
      await b.descartar();
    }
  });

  await teste("S5 NEG recorded_at NAO e ordem de visibilidade: marca d'agua por recorded_at perde um fato que confirmou tarde", async () => {
    const b = await novoBanco();
    const w1 = await escritorDe(b);
    const w2 = await escritorDe(b);
    try {
      await semear(b.cliente);
      let liberar: () => void = () => undefined;
      const segurar = new Promise<void>((r) => {
        liberar = r;
      });
      let gravou: () => void = () => undefined;
      const gravado = new Promise<void>((r) => {
        gravou = r;
      });
      // W1 carimba recorded_at ANTES (como a ingestao: hora da aplicacao) e
      // confirma DEPOIS.
      const lento = w1.transaction(async (tx) => {
        await gravar(tx, { ...LOTE_NOVO, event_id: "gps-tarde", occurred_at: ha(30), recorded_at: ha(30) });
        gravou();
        await segurar;
      });
      await gravado;
      await gravar(w2, { ...LOTE_NOVO, event_id: "gps-cedo", occurred_at: ha(10), recorded_at: ha(10) });
      // Primeira leitura incremental: tudo que esta visivel, e a marca d'agua.
      const visivel1 = await b.cliente.query<{ event_id: string; recorded_at: Date }>(
        `SELECT event_id, recorded_at FROM platform.event_log WHERE event_type = 'gps_batch_received' ORDER BY recorded_at`,
      );
      const marca = visivel1.reduce((m, l) => (l.recorded_at.getTime() > m ? l.recorded_at.getTime() : m), 0);
      assert.equal(visivel1.some((l) => l.event_id === "gps-tarde"), false, "o fato lento ja estava visivel");
      liberar();
      await lento;
      const incremental = await b.cliente.query<{ event_id: string }>(
        `SELECT event_id FROM platform.event_log WHERE event_type = 'gps_batch_received' AND recorded_at > $1`,
        [new Date(marca).toISOString()],
      );
      const completa = await b.cliente.query<{ event_id: string }>(
        `SELECT event_id FROM platform.event_log WHERE event_type = 'gps_batch_received'`,
      );
      assert.deepEqual(incremental.map((l) => l.event_id), [], "a releitura incremental deveria vir vazia");
      assert.ok(completa.some((l) => l.event_id === "gps-tarde"), "o fato lento nao existe");
      console.log(`      marca d'agua ${new Date(marca).toISOString()} · releitura incremental: 0 · fato 'gps-tarde' (recorded_at ${ha(30)}) so na releitura completa`);
    } finally {
      await w1.close();
      await w2.close();
      await b.descartar();
    }
  });

  await teste("S6 ACHADO 'ultimo lote' com recorded_at empatado e sem sequence_local: o MESMO conjunto, gravado em outra ordem, escolhe outra viagem", async () => {
    const escolha = async (ordem: readonly string[]) => {
      const b = await novoBanco();
      try {
        await semear(b.cliente);
        await b.cliente.query(
          `INSERT INTO identity.device(device_id, unit_id, label, registered_at, secret_bound_at) VALUES ('dev-2','ITAIM','Moto 02',$1,$1)`,
          [ha(86400)],
        );
        for (const id of ordem) {
          await gravar(b.cliente, {
            event_id: `empate-${id}`,
            object_id: id,
            event_type: "gps_batch_received",
            occurred_at: ha(60),
            recorded_at: ha(58),
            device_id: "dev-2",
            sequence_local: null,
          });
        }
        const r = await lerRealidadeDeEntregas(b.cliente, { agora: AGORA });
        return aparelho(r, "dev-2").ultimo_lote?.trip_id ?? null;
      } finally {
        await b.descartar();
      }
    };
    const ab = await escolha(["T-A", "T-B"]);
    const ba = await escolha(["T-B", "T-A"]);
    console.log(`      gravado A,B -> ultimo lote em ${String(ab)} · gravado B,A -> ${String(ba)}`);
    assert.notEqual(ab, ba, "o desempate nao dependeu da ordem fisica nesta medida — o achado nao se reproduziu");
  });

  await teste("S7 ACHADO a porta canonica conta UNKNOWN mas SILENCIA linha corrompida: nenhum campo da leitura nem da tela a declara", async () => {
    const b = await novoBanco();
    try {
      await semear(b.cliente);
      await gravar(b.cliente, { ...LOTE_NOVO, event_id: "gps-seq-negativa", sequence_local: -1 });
      const bruto = await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA);
      assert.equal(bruto.corrompidas.length, 1, "o leitor canonico deveria por a linha em quarentena");
      assert.match(bruto.corrompidas[0]!.motivo, /sequence_local/);
      const r = await lerRealidadeDeEntregas(b.cliente, { agora: AGORA });
      const texto = JSON.stringify(r);
      assert.equal(texto.includes("gps-seq-negativa"), false);
      assert.equal(/corromp|quarenten/i.test(texto), false, "a leitura passou a declarar a quarentena — atualizar o achado");
      const vm = await vmDe(r);
      assert.equal(/corromp|quarenten|ilegi/i.test(JSON.stringify(vm.leitura)), false, "a tela passou a declarar a quarentena — atualizar o achado");
      assert.equal(gpsNaProjecao(r, "T-1"), 1, "a linha corrompida entrou na projecao");
    } finally {
      await b.descartar();
    }
  });

  await teste("S8 custo da alternativa segura: REPEATABLE READ segura o horizonte do VACUUM (backend_xmin) do primeiro comando ao COMMIT; o cursor em READ COMMITTED ja segurava do DECLARE ao CLOSE", async () => {
    const b = await novoBanco();
    const w = await escritorDe(b);
    const leitor = await createPgClient({ url: b.url, max: 1 });
    try {
      await semear(b.cliente);
      const xminDe = async (pid: number): Promise<string | null> => {
        const [r] = await b.cliente.query<{ x: string | null }>(
          `SELECT backend_xmin::text AS x FROM pg_stat_activity WHERE pid = $1`,
          [pid],
        );
        assert.ok(r, "sessao do leitor ausente de pg_stat_activity");
        return r.x;
      };
      const medir = (isolamento: string, rodada: string) =>
        leitor.transaction(async (tx) => {
          await tx.query(`SET TRANSACTION ISOLATION LEVEL ${isolamento}, READ ONLY`);
          const [{ pid }] = await tx.query<{ pid: number }>(`SELECT pg_backend_pid() AS pid`);
          const aposPrimeiro = await xminDe(pid);
          await tx.query(`DECLARE q026_x NO SCROLL CURSOR FOR SELECT event_id FROM platform.event_log`);
          const aposDeclare = await xminDe(pid);
          await gravar(w, { ...LOTE_NOVO, event_id: `gps-xmin-${rodada}` });
          await tx.query(`FETCH FORWARD 1 FROM q026_x`);
          const comEscrita = await xminDe(pid);
          await tx.query(`CLOSE q026_x`);
          const aposClose = await xminDe(pid);
          return { pid, aposPrimeiro, aposDeclare, comEscrita, aposClose };
        });
      const rc = await medir("READ COMMITTED", "rc");
      assert.equal(rc.aposPrimeiro, null, "READ COMMITTED segurou instantaneo depois de um SELECT terminado");
      assert.ok(rc.aposDeclare !== null, "o cursor aberto nao segurou o horizonte");
      assert.equal(rc.comEscrita, rc.aposDeclare, "o horizonte andou com o cursor aberto");
      assert.equal(rc.aposClose, null, "o horizonte ficou preso depois do CLOSE");
      assert.equal(await xminDe(rc.pid), null);
      const rr = await medir("REPEATABLE READ", "rr");
      assert.ok(rr.aposPrimeiro !== null, "REPEATABLE READ nao segurou o instantaneo do primeiro comando");
      assert.equal(rr.aposDeclare, rr.aposPrimeiro);
      assert.equal(rr.comEscrita, rr.aposPrimeiro, "o horizonte andou dentro do instantaneo");
      assert.equal(rr.aposClose, rr.aposPrimeiro, "o horizonte foi liberado antes do COMMIT");
      assert.equal(await xminDe(rr.pid), null, "o horizonte ficou preso depois do COMMIT");
      console.log(`      READ COMMITTED: depois do SELECT ${String(rc.aposPrimeiro)} · cursor aberto ${String(rc.aposDeclare)} (com escrita ${String(rc.comEscrita)}) · depois do CLOSE ${String(rc.aposClose)} · REPEATABLE READ: ${String(rr.aposPrimeiro)} do primeiro comando ate o COMMIT (depois do CLOSE ${String(rr.aposClose)})`);
    } finally {
      await leitor.close();
      await w.close();
      await b.descartar();
    }
  });

  const total = passaram + falhas.length;
  if (falhas.length) {
    console.error(`\nQ026_SNAPSHOT_ADVERSARIAL: ${passaram}/${total} PASS`);
    for (const f of falhas) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\nQ026_SNAPSHOT_ADVERSARIAL: ${passaram}/${total} PASS`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
