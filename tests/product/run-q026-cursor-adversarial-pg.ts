/**
 * Q-026 SHADOW — o CURSOR do PR #37 contra entradas adversariais.
 *
 * Somente testes. Nenhum arquivo de runtime, Product UI, Android ou migration
 * muda. PostgreSQL DESCARTAVEL, migrations reais; o historico UNKNOWN nasce
 * como nasceu na operacao: gravado ANTES da 0003 (`bancoIsolado` ate a 0002,
 * depois `migrarTudo`).
 *
 * Quatro leitores sobre o MESMO banco:
 *
 *  - CANONICO: `lerFatosParaReplay` -> escopo (unidade, modo) -> `projetar`,
 *    como a porta de Entregas faz hoje. E a referencia; nao e reescrito aqui.
 *    Onde a porta inteira importa, `lerRealidadeDeEntregas` de verdade.
 *  - PR #37 @43b6ad8 (REPLICA FIEL de `tests/product/run-q026-compact-view-shadow.ts`,
 *    o leitor que ainda mede memoria no A/B de `dc0cd2f`): filtro de dois
 *    tipos, `ORDER BY unit_id,source_mode,object_type,object_id`, chave em
 *    texto (`unidade|modo|viagem`), mesmos asserts. A opcao `generalizado`
 *    tira SO os dois asserts de fixture, para separar falha alta de desenho.
 *  - PR #37 @dc0cd2f (REPLICA FIEL de `tests/product/run-q026-mixed-cursor-full-ui-shadow.ts`,
 *    o leitor "misto"): todos os tipos da Operacao Viva, UNKNOWN e invalido
 *    contados, chave JSON, escopo para fato sem viagem, `ORDER BY unit_id,
 *    source_mode NULLS LAST,object_type,object_id` na colacao da coluna, e o
 *    `aparelhos` emprestado da porta canonica lida ANTES do cursor.
 *  - SEGURO (candidato): `REPEATABLE READ, READ ONLY`, os MESMOS tipos do
 *    replay, `ORDER BY` com a chave inteira do grupo em colacao `"C"` e
 *    `event_id COLLATE "C"` por ultimo, chave comparada campo a campo, e cada
 *    grupo decodificado pelo PROPRIO `lerFatosParaReplay` (num cliente que
 *    devolve as linhas do grupo) — o mesmo decodificador e a mesma quarentena
 *    do canonico, sem copia.
 *
 * NEG      o desenho inseguro FALHA (alto: lanca; ou silencioso: diverge do
 *          canonico num campo apontado). O teste passa quando a falha aparece.
 * POS      o candidato seguro e IGUAL ao canonico em todos os campos da
 *          viagem, em UNKNOWN e na quarentena — sobre dados NAO vazios, com
 *          cada categoria adversarial presente e contada.
 * CONTROLE em dado benigno a replica e igual ao canonico: as divergencias vem
 *          da entrada adversarial, nao de uma replica torta.
 * ACHADO   comportamento ATUAL do codigo canonico, travado como evidencia.
 *
 * Alcancavel x latente: o relatorio classifica cada caso. Os produtores do
 * repositorio geram `event_id` ASCII (`ev-<hex>` no GPS do aparelho,
 * `randomUUID()` nos eventos publicos de Entregas) e o aparelho sempre manda
 * `sequence_local` inteiro >= 0 com `trip_id`; o contrato generico
 * (`checkEvent`) aceita qualquer `event_id` nao vazio.
 *
 * Uso: DELIVERYOS_PG_URL=postgres://<admin>@<host>/postgres \
 *        npx tsx tests/product/run-q026-cursor-adversarial-pg.ts
 * Sem DELIVERYOS_PG_URL: sai 78, PULADO em voz alta — nunca verde.
 */

import assert from "node:assert/strict";

import type { UiSnapshot } from "../../src/entregas/ui/adapters/UiApplicationFacade";
import { bancoIsolado, type BancoIsolado } from "../../src/platform/banco-isolado";
import { SOURCE_MODES, type EventEnvelope, type SourceMode } from "../../src/platform/contracts/event-catalog";
import {
  lerRealidadeDeEntregas,
  type RealidadeDeEntregas,
  type ViagensDeUmModo,
} from "../../src/platform/leitura/realidade-de-entregas";
import {
  createPgClient,
  type SqlClient,
  type SqlRow,
  type TransactionalSqlClient,
} from "../../src/platform/persistence/sql-client";
import { envelopeDaMensagem } from "../../src/platform/projections/consumidor";
import { lerFatosParaReplay, type LinhaFora } from "../../src/platform/projections/replay-do-event-log";
import { projetar, type ViagemProjetada } from "../../src/platform/projections/operacao-viva";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
import { entregasVM } from "../../src/product/viewmodels/entregas-vm";
import { numSoInstantaneo } from "./q026-adversarial-comum";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhuma prova de cursor rodou — isto nao e verde.");
  process.exit(78);
}

const AGORA = new Date("2026-10-10T15:00:00.000Z");
const ha = (s: number): string => new Date(AGORA.getTime() - s * 1000).toISOString();
const PAGINA = 4096;

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
 * A forma compacta (a mesma do PR #37) e a comparacao
 * ------------------------------------------------------------------ */

function compacto(v: ViagemProjetada) {
  return {
    trip_id: v.trip_id,
    unit_id: v.unit_id,
    estado: v.estado,
    device_id: v.device_id,
    ultimo_fato_em: v.ultimo_fato_em,
    ocorrencias_abertas: v.ocorrencias_abertas,
    source_mode: v.source_mode,
    ultima_posicao_em: v.ultima_posicao_em,
    frescor: v.frescor,
    fatos: v.eventos.length,
  };
}
type Compacta = ReturnType<typeof compacto>;

/**
 * Ordem TOTAL por (unidade, modo, viagem), em bytes. O PR #37 ordena so por
 * `trip_id` com `localeCompare`: com a mesma viagem em dois modos ou duas
 * unidades, o empate deixa a comparacao depender da ordem de chegada.
 */
const chaveDe = (v: Compacta): string => JSON.stringify([v.unit_id, v.source_mode, v.trip_id]);
const porBytes = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const ordenar = (xs: Compacta[]): Compacta[] => [...xs].sort((a, b) => porBytes(chaveDe(a), chaveDe(b)));
const ordenarFora = (xs: readonly LinhaFora[]): LinhaFora[] => [...xs].sort((a, b) => porBytes(a.event_id, b.event_id));

interface Leitura {
  viagens: Compacta[];
  sem_modo: number;
  corrompidas: LinhaFora[];
  /** Fatos aptos SEM viagem (objeto `device`, `order`, `unit`): nao projetam viagem. */
  sem_viagem: number;
  /**
   * Os escopos (unidade, modo) com algum fato apto, em JSON e ordem de bytes —
   * inclusive o escopo que so tem fato sem viagem: a porta o entrega com
   * `viagens: []`, e perde-lo e divergencia de CONTRATO mesmo quando a tela
   * nao muda.
   */
  escopos: string[];
}

/* ------------------------------------------------------------------ *
 * Leitor CANONICO — o que a porta de Entregas faz hoje
 * ------------------------------------------------------------------ */

async function canonica(c: TransactionalSqlClient): Promise<Leitura> {
  const l = await lerFatosParaReplay(c, TIPOS_DA_OPERACAO_VIVA);
  const escopos = new Map<string, { unit_id: string; source_mode: EventEnvelope["source_mode"]; fatos: EventEnvelope[] }>();
  for (const f of l.aptos) {
    const k = JSON.stringify([f.unit_id, f.source_mode]);
    const e = escopos.get(k);
    if (e) e.fatos.push(f);
    else escopos.set(k, { unit_id: f.unit_id, source_mode: f.source_mode, fatos: [f] });
  }
  const viagens = [...escopos.values()].flatMap((e) =>
    projetar(e.fatos, { agora: AGORA, unit_id: e.unit_id, source_mode: e.source_mode }).viagens.map(compacto),
  );
  return {
    viagens: ordenar(viagens),
    sem_modo: l.sem_modo,
    corrompidas: ordenarFora(l.corrompidas),
    sem_viagem: l.aptos.filter((f) => !f.trip_id).length,
    escopos: [...escopos.keys()].sort(porBytes),
  };
}

/** A porta inteira, compactada por escopo na ordem em que ela entrega. */
function escoposCompactos(projecoes: readonly ViagensDeUmModo[]) {
  return projecoes.map((p) => ({ unit_id: p.unit_id, source_mode: p.source_mode, viagens: p.viagens.map(compacto) }));
}

/* ------------------------------------------------------------------ *
 * REPLICA FIEL do leitor do PR #37 @ 43b6ad8
 * ------------------------------------------------------------------ */

const SQL_PR37 = [
  "DECLARE q026_shadow_cursor NO SCROLL CURSOR FOR",
  "SELECT event_id,unit_id,object_type,object_id,event_type,occurred_at,",
  "origin,device_id,sequence_local,idempotency_key,contract_version,",
  "source_mode,recorded_at,clock_trust FROM platform.event_log",
  "WHERE event_type IN ('trip_started','gps_batch_received')",
  "ORDER BY unit_id,source_mode,object_type,object_id",
].join(" ");

function envelopePr37(l: SqlRow, generalizado: boolean): EventEnvelope | null {
  if (!generalizado) assert.equal(l.source_mode, "simulated");
  const sequence = l.sequence_local === null || l.sequence_local === undefined ? undefined : Number(l.sequence_local);
  assert.ok(sequence === undefined || Number.isSafeInteger(sequence));
  const time = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
  const e = envelopeDaMensagem({
    outbox_id: "cursor:" + String(l.event_id),
    kind: String(l.event_type),
    idempotency_key: String(l.idempotency_key),
    payload: {
      event_id: String(l.event_id),
      event_type: String(l.event_type),
      event_version: String(l.contract_version),
      unit_id: String(l.unit_id),
      trip_id: l.object_type === "trip" ? String(l.object_id) : undefined,
      device_id: (l.device_id as string | null) ?? undefined,
      occurred_at: time(l.occurred_at),
      received_at: time(l.recorded_at),
      clock_trust: (l.clock_trust as string | null) ?? undefined,
      origin: l.origin as string,
      source_mode: l.source_mode as string,
      sequence,
    },
  });
  if (!generalizado) assert.ok(e, "event_log nao produziu envelope valido");
  return e;
}

async function leitorPr37(
  c: TransactionalSqlClient,
  opcoes: { generalizado?: boolean; ordem?: string } = {},
): Promise<{ viagens: Compacta[]; grupos: number }> {
  const generalizado = opcoes.generalizado === true;
  const saida: Compacta[] = [];
  let grupos = 0;
  await c.transaction(async (tx) => {
    await tx.query("SET TRANSACTION READ ONLY");
    await tx.query(opcoes.ordem ? SQL_PR37.replace(/ORDER BY .*$/, opcoes.ordem) : SQL_PR37);
    let active = "";
    let buffer: EventEnvelope[] = [];
    const flush = () => {
      if (buffer.length === 0) return;
      const e = buffer[0]!;
      const p = projetar(buffer, { agora: AGORA, unit_id: e.unit_id, source_mode: e.source_mode });
      if (!generalizado) assert.equal(p.viagens.length, 1, "esperada uma viagem por grupo");
      saida.push(...(generalizado ? p.viagens : p.viagens.slice(0, 1)).map(compacto));
      grupos += 1;
      buffer = [];
    };
    for (;;) {
      const rows = await tx.query(`FETCH FORWARD ${PAGINA} FROM q026_shadow_cursor`);
      if (rows.length === 0) break;
      for (const row of rows) {
        const e = envelopePr37(row, generalizado);
        if (!e) continue;
        const key = e.unit_id + "|" + e.source_mode + "|" + e.trip_id;
        if (active !== "" && active !== key) flush();
        active = key;
        buffer.push(e);
      }
    }
    flush();
    await tx.query("CLOSE q026_shadow_cursor");
  });
  return { viagens: ordenar(saida), grupos };
}

/* ------------------------------------------------------------------ *
 * REPLICA FIEL do leitor "misto" do PR #37 @ dc0cd2f
 * ------------------------------------------------------------------ */

function semIds(n: number): readonly string[] {
  return new Proxy(
    { length: n },
    {
      get(t, p) {
        if (p === "length") return t.length;
        throw Error("VM acessou ID forense " + String(p));
      },
      ownKeys() {
        throw Error("VM enumerou IDs forenses");
      },
    },
  ) as unknown as readonly string[];
}

function toIsoMix(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v));
  assert.ok(Number.isFinite(d.getTime()), "timestamp invalido no cursor");
  return d.toISOString();
}

function fromRowMix(l: SqlRow): EventEnvelope | null {
  if (!SOURCE_MODES.includes(l.source_mode as SourceMode)) return null;
  let sequence: number | undefined;
  if (l.sequence_local !== null && l.sequence_local !== undefined) {
    const n = Number(l.sequence_local);
    if (!Number.isSafeInteger(n) || n < 0) return null;
    sequence = n;
  }
  const event_id = String(l.event_id);
  return envelopeDaMensagem({
    outbox_id: "q026-shadow:" + event_id,
    kind: String(l.event_type),
    idempotency_key: String(l.idempotency_key),
    payload: {
      event_id,
      event_type: String(l.event_type),
      event_version: String(l.contract_version),
      unit_id: String(l.unit_id),
      trip_id: l.object_type === "trip" ? String(l.object_id) : undefined,
      device_id: l.device_id ?? undefined,
      occurred_at: toIsoMix(l.occurred_at),
      received_at: l.recorded_at === null || l.recorded_at === undefined ? undefined : toIsoMix(l.recorded_at),
      clock_trust: l.clock_trust ?? undefined,
      origin: l.origin,
      source_mode: l.source_mode,
      sequence,
    },
  });
}

interface LeituraMix {
  /** Ja na ordem em que o PR #37 monta a sombra. */
  projecoes: ViagensDeUmModo[];
  unknown: number;
  invalid: number;
  nonTrip: number;
  seen: number;
  groups: number;
  maxGroup: number;
  batches: number;
}

async function leitorMix(c: TransactionalSqlClient, fetch = 3): Promise<LeituraMix> {
  let seen = 0, unknown = 0, invalid = 0, nonTrip = 0, maxGroup = 0, groups = 0, batches = 0;
  const scopes = new Map<string, { unit_id: string; source_mode: SourceMode; viagens: ViagemProjetada[] }>();
  await c.transaction(async (tx) => {
    await tx.query("SET TRANSACTION READ ONLY");
    const list = TIPOS_DA_OPERACAO_VIVA.map((t) => "'" + t.replace(/'/g, "''") + "'").join(",");
    await tx.query(
      [
        "DECLARE q026_mixed NO SCROLL CURSOR FOR",
        "SELECT event_id,unit_id,object_type,object_id,event_type,occurred_at,origin,",
        "device_id,sequence_local,idempotency_key,contract_version,source_mode,recorded_at,clock_trust",
        "FROM platform.event_log WHERE event_type IN (" + list + ")",
        "ORDER BY unit_id,source_mode NULLS LAST,object_type,object_id",
      ].join(" "),
    );
    let buffer: EventEnvelope[] = [];
    let active: string | null = null;
    const flush = () => {
      if (!buffer.length) return;
      const first = buffer[0]!;
      maxGroup = Math.max(maxGroup, buffer.length);
      const p = projetar(buffer, { agora: AGORA, unit_id: first.unit_id, source_mode: first.source_mode });
      assert.equal(p.viagens.length, 1, "cursor deve gerar 1 viagem por grupo");
      const scope = JSON.stringify([first.unit_id, first.source_mode]);
      const bucket = scopes.get(scope) ?? { unit_id: first.unit_id, source_mode: first.source_mode, viagens: [] };
      const item = p.viagens[0]!;
      bucket.viagens.push({ ...item, eventos: semIds(item.eventos.length) });
      scopes.set(scope, bucket);
      groups++;
      buffer = [];
    };
    for (;;) {
      const rows = await tx.query(`FETCH FORWARD ${fetch} FROM q026_mixed`);
      if (!rows.length) break;
      batches++;
      for (const row of rows) {
        if (row.source_mode === null || row.source_mode === undefined) {
          unknown++;
          continue;
        }
        const e = fromRowMix(row);
        if (!e) {
          invalid++;
          continue;
        }
        seen++;
        const scopeKey = JSON.stringify([e.unit_id, e.source_mode]);
        if (!scopes.has(scopeKey)) scopes.set(scopeKey, { unit_id: e.unit_id, source_mode: e.source_mode, viagens: [] });
        if (!e.trip_id) {
          nonTrip++;
          continue;
        }
        const key = JSON.stringify([e.unit_id, e.source_mode, e.trip_id]);
        if (active !== null && key !== active) flush();
        active = key;
        buffer.push(e);
      }
    }
    flush();
    await tx.query("CLOSE q026_mixed");
  });
  const projecoes = [...scopes.values()]
    .sort((a, b) => (a.unit_id + "|" + a.source_mode).localeCompare(b.unit_id + "|" + b.source_mode))
    .map((p) => ({ ...p, viagens: p.viagens.sort((a, b) => a.trip_id.localeCompare(b.trip_id)) }));
  return { projecoes, unknown, invalid, nonTrip, seen, groups, maxGroup, batches };
}

/** A sombra do PR #37 @dc0cd2f: `aparelhos` e o resto vem da porta canonica; projecoes e UNKNOWN, do cursor. */
function composicaoMix(original: RealidadeDeEntregas, mix: LeituraMix): RealidadeDeEntregas {
  return { ...original, historico_sem_modo: mix.unknown, projecoes: mix.projecoes };
}

/** O mesmo `snap` vazio que o PR #37 passa a view model. */
const SNAP_VAZIO = { trips: [], occurrences: [], connection: "online", pending_sync: 0, last_error: null } as unknown as UiSnapshot;

/* ------------------------------------------------------------------ *
 * Candidato SEGURO
 * ------------------------------------------------------------------ */

const SQL_SEGURO = `DECLARE q026_seguro NO SCROLL CURSOR FOR
  SELECT event_id, unit_id, object_type, object_id, event_type, occurred_at, origin,
         device_id, sequence_local, idempotency_key, contract_version, source_mode,
         recorded_at, clock_trust
    FROM platform.event_log
   WHERE event_type = ANY($1)
   ORDER BY unit_id COLLATE "C", source_mode COLLATE "C" NULLS FIRST,
            object_type COLLATE "C", object_id COLLATE "C", event_id COLLATE "C"`;

/** O decodificador e a quarentena CANONICOS, aplicados as linhas de UM grupo. */
async function decodificarComoOCanonico(linhas: readonly SqlRow[]) {
  const deUmGrupo: TransactionalSqlClient = {
    query: async <T extends SqlRow = SqlRow>() => [] as T[],
    close: async () => undefined,
    transaction: async <T>(fn: (tx: SqlClient) => Promise<T>) =>
      fn({ query: async <R extends SqlRow = SqlRow>(sql: string) => (/^\s*SELECT/i.test(sql) ? (linhas as R[]) : ([] as R[])) }),
  };
  return lerFatosParaReplay(deUmGrupo, TIPOS_DA_OPERACAO_VIVA);
}

interface LeituraSegura extends Leitura {
  maior_grupo: number;
  maior_vetor_de_eventos: number;
  paginas: number;
  grupos: number;
  /** O que a consulta companheira (mesma transacao, depois do cursor) contou. */
  companheira: number | null;
}

async function leitorSeguro(
  c: TransactionalSqlClient,
  opcoes: {
    /** `null`: ja dentro de uma transacao aberta por quem chama (nao fixa o nivel). */
    isolamento?: string | null;
    entrePaginas?: (pagina: number) => Promise<void>;
    antesDoPrimeiroFetch?: () => Promise<void>;
    companheira?: (tx: SqlClient) => Promise<number>;
  } = {},
): Promise<LeituraSegura> {
  return c.transaction(async (tx) => {
    if (opcoes.isolamento !== null) {
      await tx.query(`SET TRANSACTION ISOLATION LEVEL ${opcoes.isolamento ?? "REPEATABLE READ"}, READ ONLY`);
    }
    await tx.query(SQL_SEGURO, [TIPOS_DA_OPERACAO_VIVA]);
    await opcoes.antesDoPrimeiroFetch?.();
    const out: LeituraSegura = {
      viagens: [],
      sem_modo: 0,
      corrompidas: [],
      sem_viagem: 0,
      escopos: [],
      maior_grupo: 0,
      maior_vetor_de_eventos: 0,
      paginas: 0,
      grupos: 0,
      companheira: null,
    };
    let chave: readonly unknown[] | null = null;
    let grupo: SqlRow[] = [];
    const escopos = new Set<string>();
    const mesma = (a: readonly unknown[], b: readonly unknown[]) => a.every((x, i) => x === b[i]);
    const fechar = async () => {
      if (grupo.length === 0) return;
      out.grupos += 1;
      out.maior_grupo = Math.max(out.maior_grupo, grupo.length);
      const d = await decodificarComoOCanonico(grupo);
      out.sem_modo += d.sem_modo;
      out.corrompidas.push(...d.corrompidas);
      if (d.aptos.length > 0) {
        const f = d.aptos[0]!;
        escopos.add(JSON.stringify([f.unit_id, f.source_mode]));
        if (!f.trip_id) out.sem_viagem += d.aptos.length;
        else {
          const p = projetar(d.aptos, { agora: AGORA, unit_id: f.unit_id, source_mode: f.source_mode });
          assert.ok(p.viagens.length <= 1, "um grupo projetou mais de uma viagem");
          for (const v of p.viagens) out.maior_vetor_de_eventos = Math.max(out.maior_vetor_de_eventos, v.eventos.length);
          out.viagens.push(...p.viagens.map(compacto));
        }
      }
      grupo = [];
    };
    for (;;) {
      const rows = await tx.query(`FETCH FORWARD ${PAGINA} FROM q026_seguro`);
      if (rows.length === 0) break;
      out.paginas += 1;
      for (const r of rows) {
        const k = [r.unit_id, r.source_mode ?? null, r.object_type, r.object_id];
        if (chave !== null && !mesma(chave, k)) await fechar();
        chave = k;
        grupo.push(r);
      }
      await opcoes.entrePaginas?.(out.paginas);
    }
    await fechar();
    await tx.query("CLOSE q026_seguro");
    if (opcoes.companheira) out.companheira = await opcoes.companheira(tx);
    out.viagens = ordenar(out.viagens);
    out.corrompidas = ordenarFora(out.corrompidas);
    out.escopos = [...escopos].sort(porBytes);
    return out;
  });
}

function igualAoCanonico(a: Leitura, canon: Leitura, rotulo: string): void {
  assert.ok(canon.viagens.length > 0, `${rotulo}: referencia vazia — comparacao sem valor`);
  assert.deepEqual(a.viagens, canon.viagens, `${rotulo}: viagens divergem`);
  assert.equal(JSON.stringify(a.viagens), JSON.stringify(canon.viagens), `${rotulo}: JSON das viagens diverge`);
  assert.equal(a.sem_modo, canon.sem_modo, `${rotulo}: UNKNOWN diverge`);
  assert.deepEqual(a.corrompidas, canon.corrompidas, `${rotulo}: quarentena diverge`);
  assert.equal(a.sem_viagem, canon.sem_viagem, `${rotulo}: fatos sem viagem divergem`);
  assert.deepEqual(a.escopos, canon.escopos, `${rotulo}: escopos (unidade, modo) divergem`);
}

/** O primeiro campo que difere entre duas listas de viagens, para o relato. */
function primeiraDiferenca(a: Compacta[], b: Compacta[]): string {
  const porChave = new Map(b.map((v) => [chaveDe(v), v] as const));
  for (const v of a) {
    const w = porChave.get(chaveDe(v));
    if (!w) return `${chaveDe(v)} so de um lado`;
    for (const k of Object.keys(v) as (keyof Compacta)[]) {
      if (JSON.stringify(v[k]) !== JSON.stringify(w[k])) return `${chaveDe(v)}.${k}: ${JSON.stringify(v[k])} x ${JSON.stringify(w[k])}`;
    }
  }
  for (const w of b) if (!a.some((v) => chaveDe(v) === chaveDe(w))) return `${chaveDe(w)} so de um lado`;
  return "nenhuma";
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

interface Fato {
  event_id: string;
  unit_id?: string;
  object_type?: string;
  object_id: string;
  event_type: string;
  occurred_at: string;
  recorded_at?: string;
  device_id?: string | null;
  sequence_local?: number | string | null;
  source_mode?: string;
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
      f.recorded_at ?? f.occurred_at,
      `k-${f.event_id}`,
      `${f.event_type}@1.0.0`,
      f.device_id === undefined ? "dev-1" : f.device_id,
      f.sequence_local ?? null,
      f.source_mode ?? "simulated",
    ],
  );
}

/** Historico de antes da 0003: sem `source_mode` — UNKNOWN de verdade. */
async function gravarLegado(c: SqlClient, f: Fato): Promise<void> {
  await c.query(
    `INSERT INTO platform.event_log
       (event_id, unit_id, object_type, object_id, event_type, payload, occurred_at, recorded_at,
        origin, idempotency_key, contract_version, device_id, sequence_local)
     VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,$6,$7,'device',$8,$9,$10,$11)`,
    [
      f.event_id,
      f.unit_id ?? "ITAIM",
      f.object_type ?? "trip",
      f.object_id,
      f.event_type,
      f.occurred_at,
      f.recorded_at ?? f.occurred_at,
      `k-${f.event_id}`,
      `${f.event_type}@1.0.0`,
      f.device_id === undefined ? "dev-1" : f.device_id,
      f.sequence_local ?? null,
    ],
  );
}

/** Viagens benignas no formato do PR #37: uma unidade, `simulated`, `trip_started` + GPS. */
async function semearBenigno(c: SqlClient, viagens = 3, lotes = 50): Promise<void> {
  for (let v = 1; v <= viagens; v += 1) {
    await gravar(c, { event_id: `b-${v}-0`, object_id: `T-B${v}`, event_type: "trip_started", occurred_at: ha(5000 + v), sequence_local: 1 });
    await c.query(
      `INSERT INTO platform.event_log
         (event_id, unit_id, object_type, object_id, event_type, payload, occurred_at, recorded_at,
          origin, idempotency_key, contract_version, device_id, sequence_local, source_mode, clock_trust)
       SELECT 'b-'||$1||'-'||g, 'ITAIM', 'trip', 'T-B'||$1, 'gps_batch_received', '{}'::jsonb,
              $2::timestamptz + g * interval '7 seconds', $2::timestamptz + g * interval '7 seconds',
              'device', 'k-b-'||$1||'-'||g, 'gps_batch_received@1.0.0', 'dev-'||$1, g + 1, 'simulated', 'trusted'
         FROM generate_series(1, $3::integer) AS g`,
      [String(v), ha(4000), lotes],
    );
  }
}

/** A loja da suite de instantaneo: cadastro de um aparelho e uma viagem em rota com o ultimo lote ha 9 min. */
async function semearLoja(c: SqlClient): Promise<void> {
  await c.query(`INSERT INTO identity.unit(unit_id, display_name) VALUES ('ITAIM','Itaim')`);
  await c.query(
    `INSERT INTO identity.device(device_id, unit_id, label, registered_at, secret_bound_at, last_session_at)
     VALUES ('dev-1','ITAIM','Moto 01 · celular A',$1,$1,$2)`,
    [ha(86400), ha(600)],
  );
  await gravar(c, { event_id: "ini-1", object_id: "T-1", event_type: "trip_created", occurred_at: ha(1500), sequence_local: 1 });
  await gravar(c, { event_id: "ini-2", object_id: "T-1", event_type: "trip_started", occurred_at: ha(1400), sequence_local: 2 });
  await gravar(c, { event_id: "gps-1", object_id: "T-1", event_type: "gps_batch_received", occurred_at: ha(540), recorded_at: ha(538), sequence_local: 3 });
}

async function bancoCom(
  legado: readonly Fato[],
  moderno: (c: SqlClient) => Promise<void>,
  prefixo = "q026cur",
): Promise<BancoIsolado> {
  if (legado.length === 0) {
    const b = await bancoIsolado(URL_BASE, undefined, prefixo);
    await moderno(b.cliente);
    return b;
  }
  const b = await bancoIsolado(URL_BASE, "0002_event_log_contexto_dispositivo", prefixo);
  for (const f of legado) await gravarLegado(b.cliente, f);
  await b.migrarTudo();
  await moderno(b.cliente);
  return b;
}

const NAO_SEGURO = "9007199254740993"; // 2^53 + 1: cabe no BIGINT, nao cabe num `number`

/**
 * O banco adversarial INTEIRO: duas unidades (e um par de ids com o
 * separador do PR #37), tres modos, UNKNOWN de antes da 0003, fatos sem
 * viagem, tipos fora do filtro do PR #37 e fora da Operacao Viva, quarentena
 * (sequencia negativa, sequencia acima de 2^53 e — com `infinito` — um
 * `occurred_at` infinito), a mesma viagem em dois modos e duas unidades,
 * empates de instante, e uma viagem que atravessa tres paginas de FETCH.
 */
async function bancoAdversarial(opcoes: { infinito?: boolean } = {}): Promise<BancoIsolado> {
  const legado: Fato[] = [
    { event_id: "leg-1", object_id: "T-S1", event_type: "trip_started", occurred_at: ha(90000), sequence_local: 1 },
    { event_id: "leg-2", object_id: "T-S1", event_type: "gps_batch_received", occurred_at: ha(89990), sequence_local: 2 },
    { event_id: "leg-3", object_id: "T-L1", event_type: "trip_created", occurred_at: ha(95000), sequence_local: 1 },
  ];
  return bancoCom(legado, async (c) => {
    // ITAIM / simulated — ciclo completo, com tipos que o filtro do PR #37 nao le.
    await gravar(c, { event_id: "s1-a", object_id: "T-S1", event_type: "trip_created", occurred_at: ha(3000), sequence_local: 10 });
    await gravar(c, { event_id: "s1-b", object_id: "T-S1", event_type: "trip_started", occurred_at: ha(2900), sequence_local: 11 });
    await gravar(c, { event_id: "s1-c", object_id: "T-S1", event_type: "gps_batch_received", occurred_at: ha(2000), sequence_local: 12 });
    await gravar(c, { event_id: "s1-d", object_id: "T-S1", event_type: "delivery_confirmed", occurred_at: ha(1500), sequence_local: 13 });
    await gravar(c, { event_id: "s1-e", object_id: "T-S1", event_type: "occurrence_created", occurred_at: ha(1400), sequence_local: 14 });
    await gravar(c, { event_id: "s1-f", object_id: "T-S1", event_type: "trip_closed", occurred_at: ha(1000), sequence_local: 15 });
    // Fora de TIPOS_DA_OPERACAO_VIVA: ninguem le.
    await gravar(c, { event_id: "s1-x", object_id: "T-S1", event_type: "order_ready", occurred_at: ha(1200), sequence_local: 16 });
    // Quarentena: o canonico conta, nao projeta.
    await gravar(c, { event_id: "s1-neg", object_id: "T-S1", event_type: "gps_batch_received", occurred_at: ha(900), sequence_local: -1 });
    await gravar(c, { event_id: "s1-big", object_id: "T-S1", event_type: "gps_batch_received", occurred_at: ha(800), sequence_local: NAO_SEGURO });
    if (opcoes.infinito !== false) {
      await gravar(c, { event_id: "s3-inf", object_id: "T-S3", event_type: "gps_batch_received", occurred_at: "infinity", recorded_at: ha(700), sequence_local: 30 });
    }
    // Viagem grande: 9.000 lotes atravessam tres paginas de 4.096; um par empata no instante.
    await gravar(c, { event_id: "s2-0", object_id: "T-S2", event_type: "trip_started", occurred_at: ha(60000), device_id: "dev-2", sequence_local: 1 });
    await c.query(
      `INSERT INTO platform.event_log
         (event_id, unit_id, object_type, object_id, event_type, payload, occurred_at, recorded_at,
          origin, idempotency_key, contract_version, device_id, sequence_local, source_mode, clock_trust)
       SELECT 's2-'||g, 'ITAIM', 'trip', 'T-S2', 'gps_batch_received', '{}'::jsonb,
              $1::timestamptz + g * interval '5 seconds', $1::timestamptz + g * interval '5 seconds',
              'device', 'k-s2-'||g, 'gps_batch_received@1.0.0', 'dev-2', g + 1, 'simulated', 'trusted'
         FROM generate_series(1, 9000) AS g`,
      [ha(50000)],
    );
    await gravar(c, { event_id: "s2-empate-a", object_id: "T-S2", event_type: "gps_batch_received", occurred_at: ha(400), device_id: "dev-2b", sequence_local: null });
    await gravar(c, { event_id: "s2-empate-b", object_id: "T-S2", event_type: "gps_batch_received", occurred_at: ha(400), device_id: "dev-2c", sequence_local: null });
    await gravar(c, { event_id: "s3-gps", object_id: "T-S3", event_type: "gps_batch_received", occurred_at: ha(600), device_id: "dev-3", sequence_local: 31 });
    // Sem viagem: GPS de aparelho parado vira objeto `device` na ingestao (`objetoDe`).
    for (const i of [1, 2, 3]) {
      await gravar(c, { event_id: `dev9-${i}`, object_type: "device", object_id: "dev-9", event_type: "gps_batch_received", occurred_at: ha(300 + i), device_id: "dev-9", sequence_local: i });
    }
    // ITAIM / real e control; a viagem T-S1 tambem em `real`.
    await gravar(c, { event_id: "r1-a", object_id: "T-R1", event_type: "trip_started", occurred_at: ha(2500), source_mode: "real", device_id: "dev-4", sequence_local: 1 });
    await gravar(c, { event_id: "r1-b", object_id: "T-R1", event_type: "gps_batch_received", occurred_at: ha(90), source_mode: "real", device_id: "dev-4", sequence_local: 2 });
    await gravar(c, { event_id: "r1-c", object_id: "T-R1", event_type: "occurrence_created", occurred_at: ha(80), source_mode: "real", device_id: "dev-4", sequence_local: 3 });
    await gravar(c, { event_id: "rs1-a", object_id: "T-S1", event_type: "gps_batch_received", occurred_at: ha(70), source_mode: "real", device_id: "dev-4", sequence_local: 4 });
    await gravar(c, { event_id: "c1-a", object_id: "T-C1", event_type: "trip_started", occurred_at: ha(500), source_mode: "control", device_id: "dev-5", sequence_local: 1 });
    await gravar(c, { event_id: "c1-b", object_id: "T-C1", event_type: "gps_batch_received", occurred_at: ha(50), source_mode: "control", device_id: "dev-5", sequence_local: 2 });
    await gravar(c, { event_id: "dev9-r", object_type: "device", object_id: "dev-9", event_type: "gps_batch_received", occurred_at: ha(40), source_mode: "real", device_id: "dev-9", sequence_local: 4 });
    // Outra unidade, mesma viagem T-S1.
    await gravar(c, { event_id: "v1-a", unit_id: "VILA", object_id: "T-S1", event_type: "gps_batch_received", occurred_at: ha(30), device_id: "dev-6", sequence_local: 1 });
    // Escopo (VILA, real) SO com fato sem viagem: a porta o entrega com `viagens: []`.
    await gravar(c, { event_id: "v-dev", unit_id: "VILA", object_type: "device", object_id: "dev-6", event_type: "gps_batch_received", occurred_at: ha(25), source_mode: "real", device_id: "dev-6", sequence_local: 2 });
    // Ids com o separador do PR #37: (A, T 'B|simulated|C') e (A|simulated|B, T 'C').
    await gravar(c, { event_id: "sep-1", unit_id: "A", object_id: "B|simulated|C", event_type: "trip_started", occurred_at: ha(20), device_id: "dev-7", sequence_local: 1 });
    await gravar(c, { event_id: "sep-2", unit_id: "A|simulated|B", object_id: "C", event_type: "trip_started", occurred_at: ha(10), device_id: "dev-8", sequence_local: 1 });
  });
}

/* ------------------------------------------------------------------ *
 * Casos
 * ------------------------------------------------------------------ */

void (async () => {
  console.log(`\nQ-026 — CURSOR CONTRA ENTRADAS ADVERSARIAIS (PostgreSQL descartavel, migrations reais)`);

  await teste("C0 CONTROLE dado benigno no formato do PR #37: as replicas fieis sao iguais ao canonico (nao vazio)", async () => {
    const b = await bancoCom([], (c) => semearBenigno(c));
    try {
      const canon = await canonica(b.cliente);
      const pr = await leitorPr37(b.cliente);
      assert.equal(canon.viagens.length, 3);
      assert.equal(canon.viagens.reduce((n, v) => n + v.fatos, 0), 153);
      assert.equal(JSON.stringify(pr.viagens), JSON.stringify(canon.viagens), primeiraDiferenca(pr.viagens, canon.viagens));
      const mix = await leitorMix(b.cliente);
      const porta = await lerRealidadeDeEntregas(b.cliente, { agora: AGORA });
      assert.equal(JSON.stringify(escoposCompactos(mix.projecoes)), JSON.stringify(escoposCompactos(porta.projecoes)));
      const seguro = await leitorSeguro(b.cliente);
      igualAoCanonico(seguro, canon, "seguro/benigno");
    } finally {
      await b.descartar();
    }
  });

  const casosAltos: { nome: string; legado: Fato[]; moderno: Fato[]; espera: RegExp; canonico: (l: Leitura) => void }[] = [
    {
      nome: "fato `real`",
      legado: [],
      moderno: [{ event_id: "r", object_id: "T-R", event_type: "gps_batch_received", occurred_at: ha(100), source_mode: "real", sequence_local: 1 }],
      espera: /real|simulated|Expected values/,
      canonico: (l) => assert.ok(l.viagens.some((v) => v.source_mode === "real")),
    },
    {
      nome: "UNKNOWN de antes da 0003",
      legado: [{ event_id: "u", object_id: "T-U", event_type: "gps_batch_received", occurred_at: ha(90000), sequence_local: 1 }],
      moderno: [],
      espera: /simulated|null|Expected values/,
      canonico: (l) => assert.equal(l.sem_modo, 1),
    },
    {
      nome: "GPS de aparelho parado (objeto `device`, sem viagem)",
      legado: [],
      moderno: [{ event_id: "d", object_type: "device", object_id: "dev-1", event_type: "gps_batch_received", occurred_at: ha(100), sequence_local: 1 }],
      espera: /uma viagem por grupo/,
      canonico: (l) => assert.equal(l.sem_viagem, 1),
    },
    {
      nome: "sequence_local acima de 2^53",
      legado: [],
      moderno: [{ event_id: "q", object_id: "T-B1", event_type: "gps_batch_received", occurred_at: ha(100), sequence_local: NAO_SEGURO }],
      espera: /isSafeInteger/,
      canonico: (l) => assert.ok(l.corrompidas.some((x) => x.event_id === "q" && /sequence_local/.test(x.motivo))),
    },
    {
      nome: "occurred_at infinito",
      legado: [],
      moderno: [{ event_id: "i", object_id: "T-B1", event_type: "gps_batch_received", occurred_at: "infinity", recorded_at: ha(100), sequence_local: 99 }],
      espera: /Invalid time value|RangeError/,
      canonico: (l) => assert.ok(l.corrompidas.some((x) => x.event_id === "i" && /occurred_at/.test(x.motivo))),
    },
  ];
  for (const k of casosAltos) {
    await teste(`C1 NEG o leitor do PR #37 @43b6ad8 cai (falha alta) diante de ${k.nome}; o canonico le e declara`, async () => {
      const b = await bancoCom(k.legado, async (c) => {
        await semearBenigno(c, 1, 5);
        for (const f of k.moderno) await gravar(c, f);
      });
      try {
        let erro = "";
        await assert.rejects(
          () => leitorPr37(b.cliente),
          (e: unknown) => {
            erro = e instanceof Error ? e.message.split("\n").join(" ") : String(e);
            return k.espera.test(erro);
          },
        );
        k.canonico(await canonica(b.cliente));
        console.log(`      PR #37: "${erro.slice(0, 90)}"`);
      } finally {
        await b.descartar();
      }
    });
  }

  await teste("C2 NEG silencioso (@43b6ad8): o filtro de dois tipos ignora fim de viagem e ocorrencia — estado e contagem divergem", async () => {
    const b = await bancoCom([], async (c) => {
      await semearBenigno(c, 2, 5);
      await gravar(c, { event_id: "fim", object_id: "T-B1", event_type: "trip_closed", occurred_at: ha(100), sequence_local: 50 });
      await gravar(c, { event_id: "oc", object_id: "T-B1", event_type: "occurrence_created", occurred_at: ha(110), sequence_local: 49 });
    });
    try {
      const canon = await canonica(b.cliente);
      const pr = await leitorPr37(b.cliente);
      const c1 = canon.viagens.find((v) => v.trip_id === "T-B1")!;
      const p1 = pr.viagens.find((v) => v.trip_id === "T-B1")!;
      assert.equal(c1.estado, "encerrada");
      assert.equal(p1.estado, "em_rota", "o PR #37 viu o fim da viagem");
      assert.equal(c1.ocorrencias_abertas, 1);
      assert.equal(p1.ocorrencias_abertas, 0);
      assert.equal(c1.fatos - p1.fatos, 2);
      console.log(`      ${primeiraDiferenca(pr.viagens, canon.viagens)}`);
    } finally {
      await b.descartar();
    }
  });

  await teste("C3 NEG silencioso (@43b6ad8): sequence_local negativa — o canonico poe em quarentena, o PR #37 projeta como fato valido", async () => {
    const b = await bancoCom([], async (c) => {
      await semearBenigno(c, 1, 5);
      await gravar(c, { event_id: "neg", object_id: "T-B1", event_type: "gps_batch_received", occurred_at: ha(60), sequence_local: -1 });
    });
    try {
      const canon = await canonica(b.cliente);
      const pr = await leitorPr37(b.cliente);
      assert.ok(canon.corrompidas.some((x) => x.event_id === "neg"));
      const c1 = canon.viagens[0]!;
      const p1 = pr.viagens[0]!;
      assert.equal(p1.fatos, c1.fatos + 1, "o PR #37 deveria ter contado o fato em quarentena");
      assert.equal(p1.ultima_posicao_em, ha(60), "a posicao do fato em quarentena virou a ultima posicao");
      assert.notEqual(c1.ultima_posicao_em, ha(60));
      console.log(`      ${primeiraDiferenca(pr.viagens, canon.viagens)}`);
    } finally {
      await b.descartar();
    }
  });

  await teste("C4 NEG silencioso (@43b6ad8): ids com o separador '|' fundem dois grupos — uma viagem de outra unidade some sem erro", async () => {
    const b = await bancoCom([], async (c) => {
      await gravar(c, { event_id: "sep-1", unit_id: "A", object_id: "B|simulated|C", event_type: "trip_started", occurred_at: ha(20), sequence_local: 1 });
      await gravar(c, { event_id: "sep-2", unit_id: "A|simulated|B", object_id: "C", event_type: "trip_started", occurred_at: ha(10), sequence_local: 1 });
    });
    try {
      const canon = await canonica(b.cliente);
      const pr = await leitorPr37(b.cliente);
      assert.equal(canon.viagens.length, 2);
      assert.equal(pr.grupos, 1, "os dois grupos nao se fundiram");
      assert.equal(pr.viagens.length, 1);
      assert.ok(!pr.viagens.some((v) => v.unit_id === "A|simulated|B"), "a viagem da segunda unidade sobreviveu");
      igualAoCanonico(await leitorSeguro(b.cliente), canon, "seguro/separador");
    } finally {
      await b.descartar();
    }
  });

  await teste("C5 NEG silencioso (@43b6ad8): sem os asserts de fixture, o desenho nao conta UNKNOWN (0 em vez de 2)", async () => {
    const legado: Fato[] = [
      { event_id: "u1", object_id: "T-B1", event_type: "trip_started", occurred_at: ha(90000), sequence_local: 1 },
      { event_id: "u2", object_id: "T-B1", event_type: "gps_batch_received", occurred_at: ha(89990), sequence_local: 2 },
    ];
    const b = await bancoCom(legado, (c) => semearBenigno(c, 1, 5));
    try {
      const canon = await canonica(b.cliente);
      assert.equal(canon.sem_modo, 2);
      const pr = await leitorPr37(b.cliente, { generalizado: true });
      // O desenho nao tem onde contar UNKNOWN: a linha sem modo vira envelope nulo e e pulada.
      assert.equal(JSON.stringify(pr.viagens), JSON.stringify(canon.viagens));
      assert.equal((pr as { sem_modo?: number }).sem_modo, undefined, "o desenho passou a contar UNKNOWN — atualizar o achado");
    } finally {
      await b.descartar();
    }
  });

  await teste("C6 colacao: ORDER BY com colacao NAO deterministica fragmenta grupos; com \"C\" a mesma consulta preserva", async () => {
    const b = await bancoCom([], async (c) => {
      for (let i = 0; i < 6; i += 1) {
        await gravar(c, { event_id: `x-${i}`, object_id: i % 2 === 0 ? "T-x" : "T-X", event_type: "gps_batch_received", occurred_at: ha(600 - i * 10), sequence_local: i + 1 });
      }
    });
    try {
      await b.cliente.query(`CREATE COLLATION q026_ci (provider = icu, locale = 'und-u-ks-level2', deterministic = false)`);
      const canon = await canonica(b.cliente);
      assert.equal(canon.viagens.length, 2);
      const fragil = await leitorPr37(b.cliente, {
        generalizado: true,
        ordem: "ORDER BY unit_id,source_mode,object_type,object_id COLLATE q026_ci,occurred_at",
      });
      assert.ok(fragil.grupos > 2, `esperados grupos fragmentados, vieram ${fragil.grupos}`);
      assert.notEqual(JSON.stringify(fragil.viagens), JSON.stringify(canon.viagens));
      const firme = await leitorPr37(b.cliente, {
        generalizado: true,
        ordem: `ORDER BY unit_id,source_mode,object_type,object_id COLLATE "C",occurred_at`,
      });
      assert.equal(firme.grupos, 2);
      assert.equal(JSON.stringify(firme.viagens), JSON.stringify(canon.viagens));
      console.log(`      colacao nao deterministica: ${fragil.grupos} grupos para 2 viagens · "C": ${firme.grupos}`);
    } finally {
      await b.descartar();
    }
  });

  await teste("C7 POS o candidato seguro e IGUAL ao canonico no banco adversarial inteiro (todas as categorias presentes e contadas)", async () => {
    const b = await bancoAdversarial();
    try {
      const [{ colacao }] = await b.cliente.query<{ colacao: string }>(
        `SELECT datcollate AS colacao FROM pg_database WHERE datname = current_database()`,
      );
      const canon = await canonica(b.cliente);
      const seguro = await leitorSeguro(b.cliente);
      igualAoCanonico(seguro, canon, "seguro/adversarial");
      // Nao vazio, e cada categoria presente — nao e digest de saida vazia.
      const modos = new Set(canon.viagens.map((v) => v.source_mode));
      assert.deepEqual([...modos].sort(), ["control", "real", "simulated"]);
      assert.deepEqual([...new Set(canon.viagens.map((v) => v.unit_id))].sort(), ["A", "A|simulated|B", "ITAIM", "VILA"]);
      assert.equal(canon.sem_modo, 3, "UNKNOWN");
      assert.deepEqual(canon.corrompidas.map((x) => x.event_id), ["s1-big", "s1-neg", "s3-inf"]);
      assert.equal(canon.sem_viagem, 5, "fatos sem viagem");
      assert.ok(canon.escopos.includes(JSON.stringify(["VILA", "real"])), "escopo so com fato sem viagem");
      assert.equal(canon.escopos.length, 7, "escopos (unidade, modo)");
      assert.equal(canon.viagens.filter((v) => v.trip_id === "T-S1").length, 3, "T-S1 em simulated, real e VILA");
      assert.equal(canon.viagens.find((v) => v.trip_id === "T-S1" && v.unit_id === "ITAIM" && v.source_mode === "simulated")!.estado, "encerrada");
      assert.ok(seguro.paginas >= 3, `a viagem grande nao atravessou paginas (${seguro.paginas})`);
      assert.equal(seguro.maior_grupo, 9003, "a viagem grande inteira num grupo");
      console.log(`      colacao do banco: ${colacao} · ${canon.viagens.length} viagens · ${canon.viagens.reduce((n, v) => n + v.fatos, 0)} fatos projetados · UNKNOWN ${canon.sem_modo} · quarentena ${canon.corrompidas.length} · sem viagem ${canon.sem_viagem} · ${canon.escopos.length} escopos (1 so com fato sem viagem) · ${seguro.paginas} paginas de ${PAGINA}`);
    } finally {
      await b.descartar();
    }
  });

  await teste("C8 NEG o leitor do PR #37 @43b6ad8 diante do banco adversarial inteiro: cai na primeira linha fora da fixture", async () => {
    const b = await bancoAdversarial();
    try {
      const estrito = await leitorPr37(b.cliente).catch((e: unknown) => e);
      assert.ok(estrito instanceof Error, "o leitor estrito leu o banco adversarial sem cair");
      const geral = await leitorPr37(b.cliente, { generalizado: true }).catch((e: unknown) => e);
      // Sem os asserts de fixture, cai na primeira linha que o decodificador
      // recusa. Na ordem do cursor o grupo T-S1 (s1-big, 2^53 + 1) vem antes
      // do T-S3 (s3-inf): e o assert de sequencia que derruba.
      assert.ok(geral instanceof Error && /isSafeInteger/.test(geral.message), `esperado o assert de sequencia, veio ${String(geral)}`);
      console.log(`      estrito: "${(estrito as Error).message.split("\n")[0]!.slice(0, 70)}" · generalizado: assert de sequencia (s1-big)`);
    } finally {
      await b.descartar();
    }
  });

  await teste("C9 escritor concorrente durante o cursor: o cursor guarda o instante do DECLARE nos dois niveis; a consulta COMPANHEIRA na mesma transacao so concorda em REPEATABLE READ", async () => {
    const b = await bancoAdversarial();
    const w = await createPgClient({ url: b.url, max: 1 });
    try {
      let n = 0;
      const novoLote = (id: string) => {
        n += 1;
        return gravar(w, { event_id: id, object_id: "T-S2", event_type: "gps_batch_received", occurred_at: ha(1), device_id: "dev-2", sequence_local: 100000 + n });
      };
      const contarS2 = async (tx: SqlClient) => {
        const [{ total }] = await tx.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM platform.event_log
            WHERE event_type = ANY($1) AND unit_id = 'ITAIM' AND source_mode = 'simulated'
              AND object_type = 'trip' AND object_id = 'T-S2'`,
          [TIPOS_DA_OPERACAO_VIVA],
        );
        return total;
      };
      const s2 = (l: Leitura) => l.viagens.find((v) => v.trip_id === "T-S2" && v.unit_id === "ITAIM" && v.source_mode === "simulated")!;
      const inicio = await canonica(b.cliente);
      const rodada = async (isolamento: string) => {
        // A referencia e o canonico IMEDIATAMENTE antes desta rodada.
        const antes = await canonica(b.cliente);
        const durante = await leitorSeguro(b.cliente, {
          isolamento,
          antesDoPrimeiroFetch: () => novoLote(`tarde-declare-${n + 1}`),
          entrePaginas: async (p) => (p === 1 ? novoLote(`tarde-pagina-${n + 1}`) : undefined),
          companheira: contarS2,
        });
        igualAoCanonico(durante, antes, `cursor/${isolamento} com escrita depois do DECLARE`);
        return { antes, durante };
      };
      const rc = await rodada("READ COMMITTED");
      assert.equal(rc.durante.companheira, s2(rc.antes).fatos + 2, "NEG: em READ COMMITTED a consulta companheira deveria ver as duas escritas que o cursor nao viu");
      const rr = await rodada("REPEATABLE READ");
      assert.equal(rr.durante.companheira, s2(rr.antes).fatos, "POS: em REPEATABLE READ a consulta companheira deveria ver o mesmo instante do cursor");
      const relato = [
        `READ COMMITTED: cursor ${s2(rc.durante).fatos} x companheira ${String(rc.durante.companheira)}`,
        `REPEATABLE READ: cursor ${s2(rr.durante).fatos} x companheira ${String(rr.durante.companheira)}`,
      ];
      const depois = await canonica(b.cliente);
      assert.equal(s2(depois).fatos, s2(inicio).fatos + 4, "as quatro escritas do teste nao confirmaram");
      assert.equal(s2(depois).ultima_posicao_em, ha(1));
      console.log(`      ${relato.join(" · ")} · depois: ${s2(depois).fatos}`);
    } finally {
      await w.close();
      await b.descartar();
    }
  });

  await teste("C10 ACHADO o desempate do projetar usa localeCompare: ids distintos em bytes empatam e o aparelho da viagem depende da ordem fisica; o candidato (event_id \"C\") nao", async () => {
    const nfc = "é-1";
    const nfd = "é-1";
    assert.notEqual(nfc, nfd);
    assert.equal(nfc.localeCompare(nfd), 0, "este Node nao empata NFC/NFD — o achado nao se reproduz aqui");
    const escolha = async (ordem: readonly (readonly [string, string])[]) => {
      const b = await bancoCom([], async (c) => {
        for (const [id, dev] of ordem) {
          await gravar(c, { event_id: id, object_id: "T-E", event_type: "gps_batch_received", occurred_at: ha(100), device_id: dev, sequence_local: 7 });
        }
      });
      try {
        return {
          canonico: (await canonica(b.cliente)).viagens[0]!.device_id,
          seguro: (await leitorSeguro(b.cliente)).viagens[0]!.device_id,
        };
      } finally {
        await b.descartar();
      }
    };
    const um = await escolha([[nfc, "dev-A"], [nfd, "dev-B"]]);
    const outro = await escolha([[nfd, "dev-B"], [nfc, "dev-A"]]);
    console.log(`      mesmo conjunto de fatos: gravado NFC,NFD -> canonico ${String(um.canonico)} · gravado NFD,NFC -> canonico ${String(outro.canonico)} · candidato: ${String(um.seguro)} e ${String(outro.seguro)}`);
    assert.notEqual(um.canonico, outro.canonico, "o replay canonico ficou independente da ordem fisica nesta medida");
    assert.equal(um.seguro, outro.seguro, "o candidato dependeu da ordem fisica");
  });

  await teste("C11 memoria (estrutural, sem benchmark): o candidato guarda o grupo inteiro e o projetar devolve o vetor inteiro da maior viagem", async () => {
    const b = await bancoAdversarial();
    try {
      const seguro = await leitorSeguro(b.cliente);
      assert.equal(seguro.maior_grupo, 9003);
      assert.equal(seguro.maior_vetor_de_eventos, 9003, "trip_started + 9.000 lotes + o par empatado");
      const mix = await leitorMix(b.cliente, PAGINA).catch((e: unknown) => e);
      assert.ok(mix instanceof Error, "o leitor misto leu o instante infinito");
      const total = seguro.viagens.reduce((m, v) => m + v.fatos, 0);
      console.log(`      maior grupo em memoria: ${seguro.maior_grupo} linhas · maior eventos[]: ${seguro.maior_vetor_de_eventos} ids · saida: ${seguro.viagens.length} viagens (${total} fatos contados)`);
    } finally {
      await b.descartar();
    }
  });

  await teste("C12 CONTROLE o leitor misto do PR #37 @dc0cd2f e IGUAL a porta canonica no banco adversarial sem instante infinito (fecha C2, C3, C4 e C5), VM inteiro igual", async () => {
    const b = await bancoAdversarial({ infinito: false });
    try {
      const porta = await lerRealidadeDeEntregas(b.cliente, { agora: AGORA });
      const canon = await canonica(b.cliente);
      const vazios = porta.projecoes.filter((p) => p.viagens.length === 0).map((p) => JSON.stringify([p.unit_id, p.source_mode]));
      assert.deepEqual(vazios, [JSON.stringify(["VILA", "real"])], "a porta deveria entregar o escopo so com fato sem viagem");
      const relato: string[] = [];
      for (const fetch of [3, PAGINA]) {
        const mix = await leitorMix(b.cliente, fetch);
        assert.equal(JSON.stringify(escoposCompactos(mix.projecoes)), JSON.stringify(escoposCompactos(porta.projecoes)), `FETCH ${fetch}: escopos divergem`);
        assert.equal(mix.unknown, porta.historico_sem_modo);
        assert.equal(mix.unknown, 3);
        assert.equal(mix.invalid, canon.corrompidas.length);
        assert.equal(mix.invalid, 2);
        assert.equal(mix.nonTrip, canon.sem_viagem);
        assert.equal(mix.nonTrip, 5);
        assert.deepEqual(
          mix.projecoes.filter((p) => p.viagens.length === 0).map((p) => JSON.stringify([p.unit_id, p.source_mode])),
          vazios,
          `FETCH ${fetch}: escopo sem viagem perdido`,
        );
        const sombra = composicaoMix(porta, mix);
        for (const unidade of [null, "ITAIM", "VILA", "A", "A|simulated|B", "SEM-UNIDADE"]) {
          const base = entregasVM(SNAP_VAZIO, AGORA.toISOString(), null, { disponivel: true, realidade: porta }, { unidade });
          const cand = entregasVM(SNAP_VAZIO, AGORA.toISOString(), null, { disponivel: true, realidade: sombra }, { unidade });
          assert.equal(JSON.stringify(cand), JSON.stringify(base), `FETCH ${fetch}: VM diverge em ${String(unidade)}`);
        }
        relato.push(`FETCH ${fetch}: ${mix.batches} lotes, ${mix.groups} grupos, maior ${mix.maxGroup}`);
      }
      // A replica @43b6ad8 (generalizada) diverge no mesmo banco — o misto corrigiu de fato.
      const antigo = await leitorPr37(b.cliente, { generalizado: true }).catch((e: unknown) => e);
      assert.ok(antigo instanceof Error, "a replica antiga leu sequencia acima de 2^53");
      console.log(`      ${relato.join(" · ")} · UNKNOWN 3 · invalidos 2 (so contagem: sem event_id nem motivo) · sem viagem ${canon.sem_viagem} · escopos ${porta.projecoes.length} (vazio: ${vazios.join("")})`);
    } finally {
      await b.descartar();
    }
  });

  await teste("C13 NEG (latente) o leitor misto @dc0cd2f cai diante de occurred_at infinito; o canonico poe em quarentena e segue", async () => {
    const b = await bancoAdversarial();
    try {
      await assert.rejects(() => leitorMix(b.cliente, PAGINA), /timestamp invalido no cursor/);
      const canon = await canonica(b.cliente);
      assert.ok(canon.corrompidas.some((x) => x.event_id === "s3-inf" && /occurred_at/.test(x.motivo)));
      assert.ok(canon.viagens.length > 0);
    } finally {
      await b.descartar();
    }
  });

  await teste("C14 NEG (condicional) colacao NAO deterministica na COLUNA: o leitor misto, sem COLLATE, fragmenta e duplica viagens; o candidato \"C\" segue igual ao canonico", async () => {
    const b = await bancoCom([], async (c) => {
      for (let i = 0; i < 6; i += 1) {
        await gravar(c, { event_id: `x-${i}`, object_id: i % 2 === 0 ? "T-x" : "T-X", event_type: "gps_batch_received", occurred_at: ha(600 - i * 10), sequence_local: i + 1 });
      }
    });
    try {
      await b.cliente.query(`CREATE COLLATION q026_ci (provider = icu, locale = 'und-u-ks-level2', deterministic = false)`);
      await b.cliente.query(`ALTER TABLE platform.event_log ALTER COLUMN object_id TYPE text COLLATE q026_ci`);
      const canon = await canonica(b.cliente);
      assert.equal(canon.viagens.length, 2);
      const mix = await leitorMix(b.cliente, PAGINA);
      const viagensMix = mix.projecoes.flatMap((p) => p.viagens);
      assert.ok(viagensMix.length > 2, `esperadas viagens duplicadas, vieram ${viagensMix.length}`);
      const ids = viagensMix.map((v) => v.trip_id);
      assert.ok(new Set(ids).size < ids.length, "nenhuma viagem apareceu duas vezes");
      igualAoCanonico(await leitorSeguro(b.cliente), canon, "seguro/colacao-da-coluna");
      console.log(`      2 viagens no canonico · ${viagensMix.length} entradas no misto (${ids.join(", ")}) · candidato igual ao canonico`);
    } finally {
      await b.descartar();
    }
  });

  await teste("C15 NEG composicao do PR #37 @dc0cd2f: `aparelhos` lido ANTES do cursor, outra transacao — a viagem esta fresca e o aparelho dela parou ha 9 min; POS: os dois num so instantaneo", async () => {
    const LOTE: Fato = { event_id: "gps-2", object_id: "T-1", event_type: "gps_batch_received", occurred_at: ha(5), sequence_local: 4 };
    // NEG: a ordem exata do PR (porta canonica, depois cursor), com o lote confirmando no meio.
    const b = await bancoCom([], semearLoja);
    const w = await createPgClient({ url: b.url, max: 1 });
    try {
      const original = await lerRealidadeDeEntregas(b.cliente, { agora: AGORA });
      await gravar(w, LOTE);
      const sombra = composicaoMix(original, await leitorMix(b.cliente, PAGINA));
      const v = sombra.projecoes.flatMap((p) => p.viagens).find((x) => x.trip_id === "T-1")!;
      const a = sombra.aparelhos.find((x) => x.device_id === "dev-1")!;
      assert.equal(v.ultima_posicao_em, ha(5), "o cursor nao viu o lote novo — a janela nao abriu");
      assert.equal(v.frescor, "fresh");
      assert.equal(a.ultimo_lote?.occurred_at, ha(540), "o cadastro emprestado viu o lote novo — a janela nao abriu");
      assert.equal(a.fatos_por_modo.simulated, 1);
      assert.equal(v.eventos.length, 4, "trip_created + trip_started + 2 lotes");
      const vm = entregasVM(SNAP_VAZIO, AGORA.toISOString(), null, { disponivel: true, realidade: sombra }, {});
      assert.equal(vm.leitura.disponivel, true);
      if (vm.leitura.disponivel !== true) return;
      const vv = vm.leitura.viagens.na_rua.find((x) => x.viagem_id === "T-1");
      const ap = vm.leitura.aparelhos.find((x) => x.device_id === "dev-1");
      assert.ok(vv && vv.posicao.observado === true && vv.posicao.segundos === 5, "a tela nao mostrou a viagem com posicao de 5 s");
      assert.ok(ap && ap.ultima_posicao.observado === true && ap.ultima_posicao.segundos === 540, "a tela nao mostrou o aparelho parado ha 9 min");
      console.log(`      tela: viagem T-1 posicao "${vv.posicao.idade}" (fresca) · aparelho dev-1 (o telefone dela): ultima posicao "${ap.ultima_posicao.idade}", ${a.fatos_por_modo.simulated} lote`);
    } finally {
      await w.close();
      await b.descartar();
    }
    // POS: o mesmo arranjo dentro de UMA transacao REPEATABLE READ.
    const b2 = await bancoCom([], semearLoja);
    const w2 = await createPgClient({ url: b2.url, max: 1 });
    try {
      const sombra = await numSoInstantaneo(b2.cliente, async (preso) => {
        const original = await lerRealidadeDeEntregas(preso, { agora: AGORA });
        await gravar(w2, LOTE);
        return composicaoMix(original, await leitorMix(preso, PAGINA));
      });
      const v = sombra.projecoes.flatMap((p) => p.viagens).find((x) => x.trip_id === "T-1")!;
      const a = sombra.aparelhos.find((x) => x.device_id === "dev-1")!;
      assert.equal(v.ultima_posicao_em, ha(540));
      assert.equal(a.ultimo_lote?.occurred_at, ha(540), "cadastro e cursor viram mundos diferentes");
      assert.equal(a.fatos_por_modo.simulated, 1);
      // A escrita existiu: a leitura seguinte, tambem num so instantaneo, ve as duas pontas novas.
      const depois = await numSoInstantaneo(b2.cliente, async (preso) =>
        composicaoMix(await lerRealidadeDeEntregas(preso, { agora: AGORA }), await leitorMix(preso, PAGINA)),
      );
      assert.equal(depois.projecoes.flatMap((p) => p.viagens).find((x) => x.trip_id === "T-1")!.ultima_posicao_em, ha(5));
      assert.equal(depois.aparelhos.find((x) => x.device_id === "dev-1")!.ultimo_lote?.occurred_at, ha(5));
      assert.equal(depois.aparelhos.find((x) => x.device_id === "dev-1")!.fatos_por_modo.simulated, 2);
    } finally {
      await w2.close();
      await b2.descartar();
    }
  });

  await teste("C16 ACHADO (latente) com empate de localeCompare, o leitor misto e a porta canonica escolhem aparelhos DIFERENTES para a mesma viagem no MESMO banco", async () => {
    const nfc = "é-1";
    const nfd = "é-1";
    const tentativas: string[] = [];
    let divergiu: string | null = null;
    // O sort do PostgreSQL nao e estavel: com algumas linhas intercaladas, ele
    // inverte o par empatado em relacao a ordem fisica que o canonico le.
    for (const k of [10, 9, 11, 12, 14, 16]) {
      const b = await bancoCom([], async (c) => {
        for (let i = 0; i < k; i += 1) {
          await gravar(c, { event_id: `e-${i}`, object_id: "T-E", event_type: "gps_batch_received", occurred_at: ha(1000 + i), device_id: "dev-X", sequence_local: i });
          await gravar(c, { event_id: `f-${i}`, object_id: "T-F", event_type: "gps_batch_received", occurred_at: ha(1000 + i), device_id: "dev-Y", sequence_local: i });
        }
        await gravar(c, { event_id: nfc, object_id: "T-E", event_type: "gps_batch_received", occurred_at: ha(100), device_id: "dev-A", sequence_local: 7 });
        await gravar(c, { event_id: nfd, object_id: "T-E", event_type: "gps_batch_received", occurred_at: ha(100), device_id: "dev-B", sequence_local: 7 });
      });
      try {
        const porta = await lerRealidadeDeEntregas(b.cliente, { agora: AGORA });
        const mix = await leitorMix(b.cliente, PAGINA);
        const dePorta = porta.projecoes.flatMap((p) => p.viagens).find((v) => v.trip_id === "T-E")!.device_id;
        const doMix = mix.projecoes.flatMap((p) => p.viagens).find((v) => v.trip_id === "T-E")!.device_id;
        tentativas.push(`${k}: porta ${String(dePorta)} x misto ${String(doMix)}`);
        if (dePorta !== doMix) {
          divergiu = `${2 * k + 2} linhas: porta ${String(dePorta)} x misto ${String(doMix)}`;
          break;
        }
      } finally {
        await b.descartar();
      }
    }
    console.log(`      ${divergiu ?? "nenhuma divergencia"} · tentativas: ${tentativas.join("; ")}`);
    assert.ok(divergiu, "o sort do cursor preservou a ordem fisica em todas as tentativas — o achado nao se reproduziu nesta versao");
  });

  const total = passaram + falhas.length;
  if (falhas.length) {
    console.error(`\nQ026_CURSOR_ADVERSARIAL: ${passaram}/${total} PASS`);
    for (const f of falhas) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\nQ026_CURSOR_ADVERSARIAL: ${passaram}/${total} PASS`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
