/**
 * Q-026 — o leitor INCREMENTAL contra a porta CANÔNICA, por propriedade, sem banco.
 *
 * Um cliente SQL falso serve as MESMAS linhas, na MESMA ordem física, às duas
 * portas reais: `lerRealidadeDeEntregas` (lê tudo e chama `projetar`) e
 * `lerRealidadeDeEntregasIncremental` (cursor + acumulador). Nada é copiado
 * das portas para cá: o teste só fabrica linhas como o driver `pg` as devolve
 * (timestamptz como Date, BIGINT como texto, 'infinity' como Infinity).
 *
 * Propriedades:
 *  P1 mesma leitura: aparelhos, UNKNOWN, escopos e cada campo de cada viagem
 *     (os ids de `eventos` comparados pela contagem) — e a view model inteira;
 *  P2 o tamanho do lote não muda nada (1, 2, 3, 7, 64, 1024);
 *  P3 sem empate de `localeCompare`, a ordem física não muda nada;
 *  P4 com empate (NFC x NFD), as duas portas continuam iguais NA MESMA ordem;
 *  P5 `eventos` só responde `length`; id, iteração e JSON falham alto;
 *  P6 lote ou `agora` inválidos falham antes de qualquer SQL.
 *
 * Uso: npx tsx tests/product/run-q026-leitor-incremental-propriedades.ts
 */

import assert from "node:assert/strict";
import { inspect } from "node:util";

import { EVENT_TYPES, SOURCE_MODES } from "../../src/platform/contracts/event-catalog";
import { lerRealidadeDeEntregas, type RealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import {
  IDS_FORENSES_NAO_CARREGADOS,
  LOTE_MAXIMO,
  lerRealidadeDeEntregasIncremental,
  type MedidasDaLeituraIncremental,
} from "../../src/platform/leitura/realidade-de-entregas-incremental";
import type { SqlClient, SqlRow, TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
import { forma, iguais as iguaisNaForma } from "./q026-leitor-incremental-comparacao";
import { prng } from "./q026-replay-fixture";

const AGORA = new Date("2026-10-10T15:00:00.000Z");

let passaram = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message.split("\n").slice(0, 6).join(" | ") : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

/* ------------------------------------------------------------------ *
 * O banco falso: as linhas como o driver `pg` as entrega
 * ------------------------------------------------------------------ */

interface Banco {
  fatos: SqlRow[];
  aparelhos: SqlRow[];
}

/** `GROUP BY device_id, source_mode` e `DISTINCT ON (device_id)` calculados como o PostgreSQL. */
function consultasDeAparelho(fatos: readonly SqlRow[]) {
  const gps = fatos.filter((l) => l.event_type === "gps_batch_received" && l.device_id !== null && l.device_id !== undefined);
  const contagem = new Map<string, number>();
  for (const l of gps) {
    const k = JSON.stringify([l.device_id, l.source_mode ?? null]);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  const contagens = [...contagem].map(([k, n]) => {
    const [device_id, source_mode] = JSON.parse(k) as [string, string | null];
    return { device_id, source_mode, n };
  });
  const ultimoPor = new Map<string, SqlRow>();
  const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Number(v));
  const seq = (v: unknown) => (v === null || v === undefined ? -Infinity : Number(v));
  for (const l of gps) {
    const u = ultimoPor.get(String(l.device_id));
    if (!u || ms(l.recorded_at) > ms(u.recorded_at) || (ms(l.recorded_at) === ms(u.recorded_at) && seq(l.sequence_local) > seq(u.sequence_local))) {
      ultimoPor.set(String(l.device_id), l);
    }
  }
  const ultimos = [...ultimoPor.values()].map((l) => ({
    device_id: l.device_id,
    occurred_at: l.occurred_at,
    recorded_at: l.recorded_at,
    object_type: l.object_type,
    object_id: l.object_id,
    source_mode: l.source_mode,
    correlation_id: null,
    clock_trust: l.clock_trust,
  }));
  return { contagens, ultimos };
}

function clienteFalso(banco: Banco): TransactionalSqlClient & { consultas: string[] } {
  const consultas: string[] = [];
  const doTipo = (tipos: unknown) => banco.fatos.filter((l) => (tipos as string[]).includes(String(l.event_type)));
  return {
    consultas,
    query: async () => {
      throw new Error("consulta fora de transação");
    },
    close: async () => undefined,
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      let cursor: SqlRow[] | null = null;
      let pos = 0;
      const { contagens, ultimos } = consultasDeAparelho(banco.fatos);
      const tx: SqlClient = {
        query: async <R extends SqlRow = SqlRow>(sql: string, params?: readonly unknown[]): Promise<R[]> => {
          consultas.push(sql);
          const s = sql.trim();
          if (/^SET TRANSACTION/i.test(s)) return [] as R[];
          if (/^DECLARE /i.test(s)) {
            cursor = doTipo(params?.[0]);
            pos = 0;
            return [] as R[];
          }
          const fetch = /^FETCH FORWARD (\d+) FROM /i.exec(s);
          if (fetch) {
            assert.ok(cursor, "FETCH sem cursor");
            const pagina = cursor.slice(pos, pos + Number(fetch[1]));
            pos += pagina.length;
            return pagina as R[];
          }
          if (/^CLOSE /i.test(s)) {
            cursor = null;
            return [] as R[];
          }
          if (/FROM identity\.device/i.test(s)) {
            const unidade = params?.[0];
            return banco.aparelhos.filter((a) => unidade === undefined || a.unit_id === unidade) as R[];
          }
          if (/DISTINCT ON \(device_id\)/i.test(s)) return ultimos as unknown as R[];
          if (/count\(\*\)::int AS n/i.test(s)) return contagens as unknown as R[];
          if (/^SELECT[\s\S]*FROM platform\.event_log[\s\S]*= ANY\(\$1\)/i.test(s)) return doTipo(params?.[0]) as R[];
          throw new Error(`consulta inesperada: ${s.slice(0, 90)}`);
        },
      };
      return fn(tx);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Gerador de log adversarial (semente fixa)
 * ------------------------------------------------------------------ */

const NFC = "\u00e9";
const NFD = "e\u0301";

interface Perfil {
  semente: number;
  fatos: number;
  /** Ids e viagens com empate de localeCompare (NFC x NFD). */
  empates_de_texto: boolean;
}

function gerar(p: Perfil): Banco {
  const r = prng(p.semente);
  const escolhe = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const unidades = ["ITAIM", "VILA", "A", "A|real|B"];
  const viagens = p.empates_de_texto
    ? ["T-1", "T-2", `T-${NFC}`, `T-${NFD}`, "T-x", "T-X", ""]
    : ["T-1", "T-2", "T-3", "T-x", "T-X", "T|real|1", ""];
  const aparelhos = ["dev-1", "dev-2", "dev-3", null];
  const base = Date.parse("2026-10-10T14:00:00.000Z");
  const fatos: SqlRow[] = [];
  for (let i = 0; i < p.fatos; i += 1) {
    const ocorrido = base + Math.floor(r() * 40) * 30_000 + (r() < 0.2 ? 0 : Math.floor(r() * 3) * 7);
    const recebido = ocorrido + (r() < 0.15 ? 600_000 : Math.floor(r() * 2_000));
    const modo = r() < 0.08 ? null : r() < 0.03 ? "bogus" : escolhe(SOURCE_MODES);
    let sequence: string | null = r() < 0.25 ? null : String(Math.floor(r() * 4));
    if (r() < 0.02) sequence = "-1";
    if (r() < 0.02) sequence = "9007199254740993";
    let occurred_at: Date | number = new Date(ocorrido);
    if (r() < 0.01) occurred_at = Infinity;
    const viagem = escolhe(viagens);
    const tipoObjeto = r() < 0.1 ? "device" : r() < 0.03 ? "order" : "trip";
    const id = p.empates_de_texto && r() < 0.3 ? `e-${escolhe([NFC, NFD])}-${Math.floor(r() * 3)}-${i % 7}` : `e-${i}`;
    fatos.push({
      event_id: fatos.some((f) => f.event_id === id) ? `${id}#${i}` : id,
      unit_id: escolhe(unidades),
      object_type: tipoObjeto,
      object_id: tipoObjeto === "trip" ? viagem : "dev-1",
      event_type: escolhe(EVENT_TYPES),
      occurred_at,
      origin: "device",
      device_id: escolhe(aparelhos),
      sequence_local: sequence,
      idempotency_key: `k-${i}`,
      contract_version: "x@1.0.0",
      source_mode: modo,
      recorded_at: new Date(recebido),
      clock_trust: r() < 0.6 ? "trusted" : r() < 0.5 ? "suspect" : null,
    });
  }
  const aparelhosDoCadastro: SqlRow[] = [
    { device_id: "dev-1", unit_id: "ITAIM", actor_id: null, label: "Moto 1", registered_at: new Date(base - 86_400_000), secret_bound_at: null, last_session_at: null, app_version: null, revoked_at: null, queue_pending_points: null, queue_pending_events: null, queue_depth_reported_at: null },
    { device_id: "dev-2", unit_id: "VILA", actor_id: "a-2", label: "Moto 2", registered_at: new Date(base - 86_400_000), secret_bound_at: new Date(base - 3_600_000), last_session_at: new Date(base - 60_000), app_version: "2026.10", revoked_at: null, queue_pending_points: 3, queue_pending_events: 1, queue_depth_reported_at: new Date(base - 30_000) },
    { device_id: "dev-9", unit_id: "ITAIM", actor_id: null, label: "Sem GPS", registered_at: new Date(base - 86_400_000), secret_bound_at: null, last_session_at: null, app_version: null, revoked_at: new Date(base - 1_000), queue_pending_points: null, queue_pending_events: null, queue_depth_reported_at: null },
  ];
  return { fatos, aparelhos: aparelhosDoCadastro };
}

function embaralhar<T>(xs: readonly T[], semente: number): T[] {
  const r = prng(semente);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Comparação
 * ------------------------------------------------------------------ */

/** Falhar também é resultado: as duas portas têm de falhar IGUAL, nunca uma devolver o que a outra recusa. */
let ambasFalharam = 0;
class FalhaIgual extends Error {}

async function ambas(banco: Banco, opcoes: { unit_id?: string; lote?: number } = {}) {
  const erroDe = async <T,>(f: () => Promise<T>): Promise<{ ok: T } | { erro: string }> => {
    try {
      return { ok: await f() };
    } catch (e) {
      return { erro: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
    }
  };
  let medidas: MedidasDaLeituraIncremental | null = null;
  const c = await erroDe(() => lerRealidadeDeEntregas(clienteFalso(banco), { agora: AGORA, unit_id: opcoes.unit_id }));
  const i = await erroDe(() =>
    lerRealidadeDeEntregasIncremental(clienteFalso(banco), {
      agora: AGORA,
      unit_id: opcoes.unit_id,
      lote: opcoes.lote,
      medir: (m) => {
        medidas = m;
      },
    }),
  );
  if ("erro" in c || "erro" in i) {
    assert.equal("erro" in i ? i.erro : "devolveu leitura", "erro" in c ? c.erro : "devolveu leitura", "as portas não falharam igual");
    ambasFalharam += 1;
    throw new FalhaIgual("erro" in c ? c.erro : "falha igual");
  }
  return { canonica: c.ok, incremental: i.ok, medidas: medidas as MedidasDaLeituraIncremental | null };
}

/** Roda um cenário; falha igual nas duas portas conta, mas não vira comparação vazia. */
async function cenario(f: () => Promise<void>): Promise<boolean> {
  try {
    await f();
    return true;
  } catch (e) {
    if (e instanceof FalhaIgual) return false;
    throw e;
  }
}

const UNIDADES = [null, "ITAIM", "VILA", "A", "SEM-UNIDADE"] as const;
function iguais(canonica: RealidadeDeEntregas, incremental: RealidadeDeEntregas, rotulo: string): void {
  iguaisNaForma(canonica, incremental, rotulo, AGORA, UNIDADES);
}

/* ------------------------------------------------------------------ *
 * Casos
 * ------------------------------------------------------------------ */

void (async () => {
  console.log("\nQ-026 — LEITOR INCREMENTAL x PORTA CANÔNICA, POR PROPRIEDADE (sem banco)");
  let cenarios = 0;
  let viagensVistas = 0;
  let quarentenaVista = 0;
  let unknownVisto = 0;

  await teste("P1 400 logs adversariais: mesma leitura e mesma view model que a porta canônica", async () => {
    for (let s = 1; s <= 400; s += 1) {
      const banco = gerar({ semente: s, fatos: 20 + (s % 7) * 40, empates_de_texto: false });
      await cenario(async () => {
        const { canonica, incremental, medidas } = await ambas(banco);
        iguais(canonica, incremental, `semente ${s}`);
        assert.ok(medidas, "medidas ausentes");
        cenarios += 1;
        viagensVistas += canonica.projecoes.reduce((n, p) => n + p.viagens.length, 0);
        quarentenaVista += medidas.corrompidas;
        unknownVisto += medidas.sem_modo;
        assert.equal(medidas.linhas, medidas.aptos + medidas.sem_modo + medidas.corrompidas);
      });
    }
    assert.ok(cenarios >= 350, `só ${cenarios} de 400 logs chegaram a comparar leitura`);
    assert.ok(viagensVistas > 2000 && quarentenaVista > 100 && unknownVisto > 300, `cobertura fraca: ${viagensVistas} viagens, ${quarentenaVista} quarentena, ${unknownVisto} UNKNOWN`);
    console.log(`      ${cenarios} logs comparados · ${viagensVistas} viagens · ${quarentenaVista} linhas em quarentena · ${unknownVisto} UNKNOWN · ${ambasFalharam} logs em que as duas portas falharam igual`);
  });

  await teste("P1b filtro de unidade: aparelhos e projeções filtrados, UNKNOWN global — igual à porta canônica", async () => {
    for (let s = 401; s <= 480; s += 1) {
      const banco = gerar({ semente: s, fatos: 200, empates_de_texto: false });
      for (const unidade of ["ITAIM", "VILA", "A|real|B", "NAO-EXISTE"]) {
        await cenario(async () => {
          const { canonica, incremental } = await ambas(banco, { unit_id: unidade });
          iguais(canonica, incremental, `semente ${s} unidade ${unidade}`);
        });
      }
    }
  });

  await teste("P2 o tamanho do lote não muda a leitura (1, 2, 3, 7, 64, 1024) e cada FETCH respeita o lote", async () => {
    for (let s = 500; s <= 560; s += 1) {
      const banco = gerar({ semente: s, fatos: 150, empates_de_texto: s % 2 === 0 });
      await cenario(async () => {
        const referencia = JSON.stringify(forma((await ambas(banco)).incremental));
        for (const lote of [1, 2, 3, 7, 64, 1024]) {
          const { incremental, medidas } = await ambas(banco, { lote });
          assert.equal(JSON.stringify(forma(incremental)), referencia, `semente ${s}, lote ${lote}`);
          assert.ok(medidas && medidas.maior_lote <= lote && medidas.lote === lote);
          assert.equal(medidas.lotes, Math.ceil(medidas.linhas / lote));
        }
      });
    }
  });

  await teste("P3 sem empate de texto, a ordem física das linhas não muda nada (nas duas portas)", async () => {
    for (let s = 600; s <= 680; s += 1) {
      const banco = gerar({ semente: s, fatos: 180, empates_de_texto: false });
      await cenario(async () => {
        const referencia = JSON.stringify(forma((await ambas(banco)).canonica));
        for (const k of [1, 2, 3]) {
          const outro = { ...banco, fatos: embaralhar(banco.fatos, s * 10 + k) };
          const { canonica, incremental } = await ambas(outro);
          assert.equal(JSON.stringify(forma(canonica)), referencia, `semente ${s}: a porta canônica dependeu da ordem`);
          iguais(canonica, incremental, `semente ${s} permutação ${k}`);
        }
      });
    }
  });

  await teste("P4 com empate de localeCompare (NFC x NFD em ids e viagens), as duas portas concordam na MESMA ordem física", async () => {
    assert.equal(NFC.localeCompare(NFD), 0, "este Node não empata NFC/NFD");
    let ordemImportou = 0;
    for (let s = 700; s <= 900; s += 1) {
      const banco = gerar({ semente: s, fatos: 120, empates_de_texto: true });
      await cenario(async () => {
        const { canonica, incremental } = await ambas(banco);
        iguais(canonica, incremental, `semente ${s}`);
        const outro = { ...banco, fatos: embaralhar(banco.fatos, s) };
        const b = await ambas(outro);
        iguais(b.canonica, b.incremental, `semente ${s} embaralhada`);
        if (JSON.stringify(forma(b.canonica)) !== JSON.stringify(forma(canonica))) ordemImportou += 1;
      });
    }
    // Não é o que se quer de uma projeção — é o que a porta canônica faz hoje
    // (achado C10 da auditoria anterior). O incremental acompanha, não corrige.
    console.log(`      em ${ordemImportou} de 201 logs com empate de texto, a ordem física mudou a leitura canônica — e o incremental mudou junto`);
  });

  await teste("P4b empates construídos: aparelho, ordem de viagens e de escopos acompanham a porta canônica nas duas ordens físicas", async () => {
    const linha = (o: Partial<SqlRow> & { event_id: string }): SqlRow => ({
      unit_id: "ITAIM",
      object_type: "trip",
      object_id: "T-1",
      event_type: "gps_batch_received",
      occurred_at: new Date("2026-10-10T14:50:00.000Z"),
      origin: "device",
      device_id: "dev-1",
      sequence_local: "3",
      idempotency_key: `k-${o.event_id}`,
      contract_version: "x@1.0.0",
      source_mode: "simulated",
      recorded_at: new Date("2026-10-10T14:50:01.000Z"),
      clock_trust: "trusted",
      ...o,
    });
    const casos: { nome: string; fatos: SqlRow[]; mudaComAOrdem: (r: RealidadeDeEntregas) => string }[] = [
      {
        // Mesmo instante, mesma sequência, ids que `localeCompare` empata:
        // o aparelho é o do ÚLTIMO na ordem de aplicação.
        nome: "aparelho",
        fatos: [linha({ event_id: `e-${NFC}`, device_id: "dev-A" }), linha({ event_id: `e-${NFD}`, device_id: "dev-B" })],
        mudaComAOrdem: (r) => String(r.projecoes[0]!.viagens[0]!.device_id),
      },
      {
        // Viagens cujo `trip_id` empata: vence a ordem do primeiro fato aplicado de cada uma.
        nome: "ordem de viagens",
        fatos: [
          linha({ event_id: "v-1", object_id: `T-${NFC}`, occurred_at: new Date("2026-10-10T14:40:00.000Z") }),
          linha({ event_id: "v-2", object_id: `T-${NFD}`, occurred_at: new Date("2026-10-10T14:30:00.000Z") }),
        ],
        mudaComAOrdem: (r) => r.projecoes[0]!.viagens.map((v) => v.trip_id.normalize("NFD") === v.trip_id ? "NFD" : "NFC").join(","),
      },
      {
        // Unidades cujo nome empata: ordenação estável pela primeira aparição.
        nome: "ordem de escopos",
        fatos: [linha({ event_id: "u-1", unit_id: `U${NFC}` }), linha({ event_id: "u-2", unit_id: `U${NFD}` })],
        mudaComAOrdem: (r) => r.projecoes.map((p) => (p.unit_id === `U${NFC}` ? "NFC" : "NFD")).join(","),
      },
    ];
    const relato: string[] = [];
    for (const k of casos) {
      const vistos: string[] = [];
      for (const ordem of [k.fatos, [...k.fatos].reverse()]) {
        const { canonica, incremental } = await ambas({ fatos: ordem, aparelhos: [] });
        iguais(canonica, incremental, `${k.nome}`);
        vistos.push(k.mudaComAOrdem(canonica));
      }
      relato.push(`${k.nome}: ${vistos.join(" | ")}`);
      if (k.nome === "aparelho") assert.notEqual(vistos[0], vistos[1], "o empate de aparelho deixou de depender da ordem física — rever o achado");
    }
    console.log(`      porta canônica nas duas ordens (o incremental igual em cada uma): ${relato.join(" · ")}`);
  });

  await teste("P5 eventos: só length responde; id, iteração, JSON e cópia falham alto; inspect é legível", async () => {
    const banco = gerar({ semente: 7, fatos: 300, empates_de_texto: false });
    const { incremental } = await ambas(banco);
    const v = incremental.projecoes.flatMap((p) => p.viagens).find((x) => x.eventos.length > 1);
    assert.ok(v, "fixture sem viagem com mais de um fato");
    assert.ok(v.eventos.length > 1);
    for (const tentativa of [
      () => v.eventos[0],
      () => [...v.eventos],
      () => v.eventos.map((x) => x),
      () => JSON.stringify(incremental),
      () => Object.keys(v.eventos),
      () => structuredClone(v.eventos),
    ]) {
      assert.throws(tentativa, (e: unknown) => e instanceof Error && (e.message.includes(IDS_FORENSES_NAO_CARREGADOS) || e.name === "DataCloneError"));
    }
    // `util.inspect` não aciona armadilhas de Proxy: mostra o alvo, sem lançar.
    assert.equal(inspect(v.eventos), `{ length: ${v.eventos.length} }`);
  });

  await teste("P6 lote ou agora inválidos falham antes de qualquer SQL", async () => {
    const banco = gerar({ semente: 9, fatos: 20, empates_de_texto: false });
    for (const lote of [0, -1, 1.5, LOTE_MAXIMO + 1, Number.NaN, Infinity]) {
      const c = clienteFalso(banco);
      await assert.rejects(() => lerRealidadeDeEntregasIncremental(c, { agora: AGORA, lote }), RangeError);
      assert.equal(c.consultas.length, 0, `lote ${lote} chegou ao banco`);
    }
    const c = clienteFalso(banco);
    await assert.rejects(() => lerRealidadeDeEntregasIncremental(c, { agora: new Date(Number.NaN) }), RangeError);
    assert.equal(c.consultas.length, 0);
  });

  await teste("P7 a transação abre com REPEATABLE READ, READ ONLY e o cursor fecha antes das consultas de aparelho", async () => {
    const banco = gerar({ semente: 11, fatos: 100, empates_de_texto: false });
    const c = clienteFalso(banco);
    await lerRealidadeDeEntregasIncremental(c, { agora: AGORA, lote: 16 });
    assert.equal(c.consultas[0], "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    assert.match(c.consultas[1]!, /^DECLARE q026_leitura_incremental NO SCROLL CURSOR FOR/);
    assert.doesNotMatch(c.consultas[1]!, /ORDER BY/i, "o cursor voltou a ordenar no banco");
    const fechou = c.consultas.findIndex((q) => /^CLOSE /.test(q));
    const cadastro = c.consultas.findIndex((q) => /identity\.device/.test(q));
    assert.ok(fechou > 1 && cadastro > fechou, "cadastro lido antes de fechar o cursor");
    const linhasDosTipos = banco.fatos.filter((f) => TIPOS_DA_OPERACAO_VIVA.includes(String(f.event_type))).length;
    // SET + DECLARE + FETCHes (o último volta vazio) + CLOSE + cadastro + último lote + contagens.
    assert.equal(c.consultas.length, 2 + Math.ceil(linhasDosTipos / 16) + 1 + 1 + 3);
  });

  const total = passaram + falhas.length;
  if (falhas.length) {
    console.error(`\nQ026_LEITOR_INCREMENTAL_PROPRIEDADES: ${passaram}/${total} PASS`);
    for (const f of falhas) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\nQ026_LEITOR_INCREMENTAL_PROPRIEDADES: ${passaram}/${total} PASS`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
