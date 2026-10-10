/**
 * Q-026 — fuzz DIFERENCIAL independente: `projetar` original (d0716fd) x a
 * desta arvore, sobre listas aleatorias de campos hostis.
 *
 * Origem: escrito pela auditoria independente da revisao (um agente separado,
 * que nao escreveu a otimizacao), para procurar contraexemplo fora dos
 * cenarios de `q026-cenarios.ts`: ids Unicode que empatam em `localeCompare`,
 * instantes em formatos legados, numeros, Date, lixo; sequencias +-0, +-1e308,
 * NaN, +-Infinity, texto; tipos `__proto__`; referencias repetidas; listas de
 * 64-464 fatos para exercitar os caminhos de merge/gallop da TimSort. Foi ele
 * que achou as divergencias FORA DO TIPO (Set, null, Symbol) corrigidas depois.
 *
 * Duas checagens por escopo: mesma entrada (deepStrictEqual + JSON + ordem de
 * chaves com `undefined`) e a particao da porta (nova(filtrada) x
 * original(lista inteira)) nas listas que passam a guarda. Excecao conta como
 * saida. Nenhum banco, nenhuma rede, so dados sinteticos.
 *
 * Uso: npx tsx tests/product/run-q026-replay-fuzz-diferencial.ts [semente] [casos]
 */
import { isDeepStrictEqual } from "node:util";
import { projetar as nova } from "../../src/platform/projections/operacao-viva";
import { carregarReferencia, REF_ORIGINAL } from "./q026-referencias";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const ref = carregarReferencia(REF_ORIGINAL);
if (!ref.referencia) throw new Error("referencia original nao carregou: " + (ref as Any).motivo);
const original = ref.referencia.projetar as (e: Any, o: Any) => Any;

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.argv[2] ?? 7);
const CASES = Number(process.argv[3] ?? 20000);
const r = prng(SEED);
const pick = <X>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)];

const AGORA = new Date("2026-10-09T23:00:00.000Z");
const TIPOS = ["trip_created", "trip_started", "gps_batch_received", "arrival_detected", "delivery_confirmed",
  "occurrence_created", "trip_return_started", "trip_returned", "trip_closed"];
const ISO = [
  "2026-10-09T22:58:00.000Z", "2026-10-09T22:58:00Z", "2026-10-09T19:58:00-03:00", "2026-10-09T22:58:00.000+00:00",
  "2026-10-09T22:58:00.001Z", "2026-10-09T22:58:00.0009Z", "2026-10-09T22:59:59.999Z", "2026-10-09T22:01:00.000Z",
  "2026-10-09T23:20:00.000Z", "2026-10-08T10:00:00.000Z", "2026-10-09 19:58:00", "2026-10-09", "Oct 9 2026 22:58:00 GMT",
  "+002026-10-09T22:58:00.000Z", "2026-10-09T22:58:00.000z", "Fri, 09 Oct 2026 22:58:00 GMT",
];
const WEIRD_T: unknown[] = [0, -0, 1, 2026, "0", [ "2026-10-09T22:58:00.000Z" ], [2026], "nao-e-data", "", null, undefined,
  true, {}, [], new Date("2026-10-09T22:58:00.123Z"), "2026-13-40T00:00:00Z", 1.5e12];
const SEQS: unknown[] = [undefined, undefined, null, 0, -0, 1, 2, -1, 0.5, 1e308, -1e308, 2 ** 53 + 2, 5e-324];
const WEIRD_SEQ: unknown[] = [NaN, Infinity, -Infinity, "2", true, false, "", [1]];
const IDS: unknown[] = ["a", "A", "b", "B", "á", "á", "a­", "a\u0000", "a-1", "a10", "a9", "_a", "evt-ä",
  "EVT-0", "", " ", "\ud800", "😀", "เก", "กเ", "ﬁ", "fi"];
const WEIRD_ID: unknown[] = process.env.NO_NUM_TRIPS ? ["zz"] : [42, undefined, null, 0];
const TRIPS: unknown[] = ["T1", "T2", "t1", "T­1", "T1\u0000", "", undefined, null, 0, ...(process.env.NO_NUM_TRIPS ? [] : [7]), "T3", "á", "á"];
const DEVS: unknown[] = ["D1", "D2", undefined, null, "", 0];
const UNITS: unknown[] = ["ITAIM", "ITAIM", "LAB", "ITAIM "];
const MODES: unknown[] = ["real", "simulated", "simulated", "control"];
const REC: unknown[] = ["2026-10-09T22:58:01.000Z", "2026-10-09T22:30:00.000Z", "2026-10-09T23:30:00.000Z", undefined, "lixo",
  "", null, new Date("2026-10-09T22:58:05.000Z")];
const TRUST: unknown[] = ["trusted", "trusted", "suspect", "unknown", undefined, "bogus", null];

function evento(i: number, fastBias: boolean): Record<string, unknown> {
  const tipo = r() < 0.05 ? pick(["__proto__", "toString", "constructor", "hasOwnProperty", "x"]) : pick(TIPOS);
  const weird = !fastBias && r() < 0.15;
  const ev: Record<string, unknown> = {
    event_id: weird && r() < 0.3 ? pick(WEIRD_ID) : (r() < 0.6 ? pick(IDS) : `id${i}`),
    event_type: tipo,
    event_version: r() < 0.08 ? pick(["sem-arroba", "@", "", "2.1", `${tipo}@2.0.0`, "1"]) : `${tipo}@1.0.0`,
    unit_id: pick(UNITS),
    trip_id: pick(TRIPS),
    device_id: pick(DEVS),
    occurred_at: weird && r() < 0.5 ? pick(WEIRD_T) : pick(ISO),
    received_at: pick(REC),
    clock_trust: pick(TRUST),
    origin: "device",
    source_mode: pick(MODES),
    sequence: weird && r() < 0.4 ? pick(WEIRD_SEQ) : pick(SEQS),
    idempotency_key: r() < 0.3 ? pick(["k1", "k2", "k3", undefined, null]) : `k${i}`,
    payload: {},
  };
  if (r() < 0.05) delete ev.sequence;
  if (r() < 0.03) delete ev.device_id;
  if (r() < 0.03) delete ev.trip_id;
  return ev;
}

function rodar(p: (e: Any, o: Any) => Any, e: Any, o: Any) {
  try {
    const v = p(e, o);
    return { ok: true as const, v, j: JSON.stringify(v), u: JSON.stringify(v, (_k, x) => (x === undefined ? "__UNDEF__" : x)) };
  } catch (err) {
    const x = err as Error;
    return { ok: false as const, erro: `${x?.constructor?.name}: ${x?.message}` };
  }
}

function consistente(lista: Any[]): boolean {
  return lista.every((e) => {
    const s = e.sequence ?? 0;
    return Number.isFinite(Date.parse(e.occurred_at)) && typeof s === "number" && Number.isFinite(s) && typeof e.event_id === "string";
  });
}

let comparacoes = 0, divergencias = 0, excecoesIguais = 0, consist = 0, inconsist = 0;
let portComp = 0, portDiv = 0;
let portDivInconsist = 0, portCompInconsist = 0;
const exemplos: string[] = [];
const tiposErro = new Map<string, number>();
const OPCOES_EXTRA: Any[] = [{}, {}, {}, { consumer_version: "x@1.0.0" }, { consumer_version: "2.0.0" },
  { consumer_version: "abc" }, { consumer_version: "" }, { capacidade_maxima: 3 }, { capacidade_maxima: -1 },
  { janelas: { fresh_ate_s: 30, aging_ate_s: 60 } }, { agora: new Date("2026-10-10T05:00:00.000Z") },
  { agora: new Date("2026-10-08T00:00:00.000Z") }];

for (let c = 0; c < CASES; c++) {
  const tam = r() < 0.85 ? Math.floor(r() * 40) : 64 + Math.floor(r() * 400); // include TimSort merge/gallop sizes
  const fastBias = r() < 0.6;
  const lista: Any[] = [];
  for (let i = 0; i < tam; i++) lista.push(evento(i, fastBias));
  // duplicate references and value-equal copies
  if (tam > 0 && r() < 0.2) lista.push(lista[Math.floor(r() * lista.length)]);
  if (tam > 0 && r() < 0.2) lista.push({ ...lista[Math.floor(r() * lista.length)] });
  const cons = consistente(lista);
  if (cons) consist++; else inconsist++;
  for (const unit_id of ["ITAIM", "LAB", "ITAIM "]) for (const source_mode of ["real", "simulated", "control"]) {
    const o = { agora: AGORA, unit_id, source_mode, ...pick(OPCOES_EXTRA) };
    comparacoes++;
    const a = rodar(original, lista, o);
    const b = rodar(nova, lista, o);
    let motivo: string | null = null;
    if (a.ok !== b.ok) motivo = `throw mismatch ref=${a.ok ? "ok" : a.erro} new=${b.ok ? "ok" : b.erro}`;
    else if (!a.ok && !b.ok) { if (a.erro !== b.erro) motivo = `different errors ${a.erro} | ${b.erro}`; else { excecoesIguais++; tiposErro.set(a.erro, (tiposErro.get(a.erro) ?? 0) + 1); } }
    else if (a.ok && b.ok) {
      if (!isDeepStrictEqual(a.v, b.v)) motivo = "deepStrictEqual";
      else if (a.j !== b.j) motivo = "JSON";
      else if ((a as Any).u !== (b as Any).u) motivo = "key order incl. undefined-valued keys";
    }
    if (motivo) {
      divergencias++;
      if (exemplos.length < 5) exemplos.push(`case ${c} scope ${unit_id}|${source_mode}: ${motivo}\n${JSON.stringify(lista).slice(0, 600)}`);
    }
    // port check: new(filter(L)) vs original(L)
    const filtrada = lista.filter((e) => e.unit_id === unit_id && e.source_mode === source_mode);
    const pa = a;
    const pb = rodar(nova, filtrada, o);
    const igual = pa.ok === pb.ok && (pa.ok ? (isDeepStrictEqual(pa.v, (pb as Any).v) && pa.j === (pb as Any).j) : pa.erro === (pb as Any).erro);
    if (cons) { portComp++; if (!igual) { portDiv++; if (exemplos.length < 8) exemplos.push(`PORT case ${c} ${unit_id}|${source_mode}`); } }
    else { portCompInconsist++; if (!igual) portDivInconsist++; }
  }
}
console.log(`semente=${SEED} casos=${CASES} (consistentes=${consist}, pelo caminho antigo=${inconsist})`);
console.log(`mesma entrada: ${comparacoes} comparacoes, ${divergencias} divergencias, ${excecoesIguais} com a mesma excecao`);
console.log(`particao da porta (listas consistentes): ${portComp} comparacoes, ${portDiv} divergencias`);
console.log(`particao em listas INCONSISTENTES (informativo; e para isso que a guarda existe): ${portCompInconsist} comparacoes, ${portDivInconsist} divergencias`);
for (const e of exemplos) console.log("EXEMPLO", e);
for (const [k, v] of [...tiposErro].sort((x, y) => y[1] - x[1]).slice(0, 8)) console.log("  excecao", v, k);
if (divergencias > 0 || portDiv > 0) {
  console.error("Q026_FUZZ_DIFERENCIAL_RED");
  process.exit(1);
}
if (consist < CASES / 4 || inconsist < CASES / 10 || portCompInconsist === 0 || portDivInconsist === 0) {
  // O fuzz precisa exercitar os dois caminhos e mostrar que a guarda e necessaria.
  console.error("Q026_FUZZ_DIFERENCIAL_RED: cobertura insuficiente dos dois caminhos");
  process.exit(1);
}
console.log(`Q026_FUZZ_DIFERENCIAL: ${comparacoes} + ${portComp} comparacoes, 0 divergencias`);
