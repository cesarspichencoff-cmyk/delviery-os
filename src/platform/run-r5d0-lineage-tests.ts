/**
 * GATE R5-D0-L — LINHAGEM REAL DE EVENTOS
 * ============================================================================
 * Prova o CAMINHO INTEIRO da identidade, com eventos reais do catalogo:
 *
 *   EventEnvelope -> LeituraOperacional -> Sinal -> CausaCandidata -> Foco
 *
 * E prova, no mesmo gate, o que a missao mais precisava saber: **o mecanismo
 * existe e nenhum sinal fica elegivel**, porque o unico produtor de leitura no
 * repositorio e a fixture. Um tipo que aceita ids nao produz ids.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { EventEnvelope } from "./contracts/event-catalog";
import {
  CATALOGOS_SUPORTADOS,
  elegibilidadeParaShadow,
  eventIdLegitimo,
  linhagemDeEventos,
  linhagemDeFixture,
  type LinhagemDeEventos,
} from "../product/atencao/linhagem-eventos";
import {
  ESTADO_INICIAL,
  elegerModo,
  identidadeDaCausa,
  type CausaCandidata,
  type EstadoTemporal,
} from "../product/atencao/politica-temporal";
import { sinaisDe, type LeituraOperacional } from "../product/viewmodels/sinais";
import { cenaFoco } from "../product/demo/seed-home-demonstracao";

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const ARTEFATOS = [
  "src/product/atencao/linhagem-eventos.ts",
  "src/product/viewmodels/sinais.ts",
  "src/product/atencao/politica-temporal.ts",
  "src/product/atencao/prontidao-r5d.ts",
  "src/product/atencao/traducao-motor-shadow.ts",
] as const;

let passed = 0;
const failures: string[] = [];
function teste(nome: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ------------------------------------------------------------------ *
 * Eventos REAIS do catalogo                                           *
 * ------------------------------------------------------------------ */

const OBSERVADO = "2026-08-04T18:20:00.000Z";

const evt = (id: string, source_mode: "real" | "simulated" | "control" = "real"): EventEnvelope =>
  ({
    event_id: id,
    event_type: "delivery_confirmed",
    event_version: 1,
    unit_id: "demo-unit",
    idempotency_key: `k-${id}`,
    occurred_at: OBSERVADO,
    source_mode,
  }) as unknown as EventEnvelope;

const LOG = new Set(["evt-aaa", "evt-bbb", "evt-ccc"]);
const existeNoLog = (id: string): boolean => LOG.has(id);

const META = {
  observado_em: OBSERVADO,
  produtor: "operacao-viva",
  transformacoes: ["projetar", "leitura-operacional"],
};

/** Uma leitura com linhagem REAL, montada a partir de envelopes do catalogo. */
function leituraComLinhagem(eventos: readonly EventEnvelope[]): LeituraOperacional {
  return { ...cenaFoco(), procedencia: "real", linhagem: linhagemDeEventos(eventos, META) };
}

const CTX_REAL = (l: LinhagemDeEventos | null, causa: string | null) => ({
  destino: "real" as const,
  existeNoLog,
  vinculo_causa: causa,
  causa_da_linhagem: causa,
});

const razao = (e: ReturnType<typeof elegibilidadeParaShadow>): string =>
  e.eligible_for_shadow ? "<elegivel>" : e.reason;

/* ================================================================== *
 * O CAMINHO DOS IDS                                                   *
 * ================================================================== */

teste("L01 evento persistido real chega a leitura", () => {
  const l = leituraComLinhagem([evt("evt-aaa"), evt("evt-bbb")]);
  assert.deepEqual(l.linhagem!.input_event_ids, ["evt-aaa", "evt-bbb"]);
  assert.equal(l.linhagem!.natureza, "real");
  assert.equal(l.linhagem!.produtor, "operacao-viva");
  assert.equal(l.linhagem!.event_catalog_version, CATALOGOS_SUPORTADOS[0]);
});

teste("L02 a leitura PRESERVA o id ate sinal, causa e Foco", () => {
  const l = leituraComLinhagem([evt("evt-aaa"), evt("evt-bbb")]);
  // 1. sinal
  const sinais = sinaisDe(l);
  assert.ok(sinais.length > 0, "a cena nao produziu sinal");
  for (const s of sinais) {
    assert.deepEqual(s.linhagem!.input_event_ids, ["evt-aaa", "evt-bbb"], `sinal ${s.codigo}`);
  }
  // 2. causa candidata — a linhagem viaja junto, sem entrar na identidade
  const alvo = sinais[0]!;
  const causa: CausaCandidata = {
    codigo: alvo.codigo,
    severidade: alvo.severidade,
    ambiente: alvo.ambiente,
    subarea: alvo.subarea,
    pedido_id: alvo.pedido_id,
    fonte_id: null,
    evidencias: alvo.evidencias.length,
    linhagem: alvo.linhagem,
  };
  assert.deepEqual(causa.linhagem!.input_event_ids, ["evt-aaa", "evt-bbb"]);
  // 3. Foco — a eleicao temporal devolve a linhagem da causa eleita, intacta
  let estado: EstadoTemporal = ESTADO_INICIAL;
  let eleito = null as ReturnType<typeof elegerModo> | null;
  for (let t = 0; t <= 3; t += 1) {
    eleito = elegerModo({
      estado,
      agora_min: t,
      candidatas: [{ ...causa, severidade: 3 }],
      fontes: [{ id: "carga_pracas", estado: "saudavel" }],
      idade_da_leitura_min: 0,
    });
    estado = eleito.estado;
  }
  assert.equal(eleito!.modo, "foco");
  assert.deepEqual(eleito!.linhagem!.input_event_ids, ["evt-aaa", "evt-bbb"], "o Foco perdeu os ids");
});

teste("L03 a identidade da causa NAO muda com a linhagem", () => {
  const base: CausaCandidata = {
    codigo: "s5",
    severidade: 3,
    ambiente: "sushi",
    subarea: null,
    pedido_id: null,
    fonte_id: "carga_pracas",
    evidencias: 2,
  };
  const comA = { ...base, linhagem: linhagemDeEventos([evt("evt-aaa")], META) };
  const comB = { ...base, linhagem: linhagemDeEventos([evt("evt-bbb")], META) };
  // Trocar de evento nao troca a causa: a mesma tensao observada por outros
  // eventos continua sendo a mesma tensao — senao o debounce reiniciaria sempre.
  assert.equal(identidadeDaCausa(comA), identidadeDaCausa(base));
  assert.equal(identidadeDaCausa(comB), identidadeDaCausa(comA));
});

/* ================================================================== *
 * ORDEM, DUPLICATA, RECUSAS                                           *
 * ================================================================== */

teste("L04 multiplos eventos permanecem deterministicos, na ordem do LOG", () => {
  const eventos = [evt("evt-ccc"), evt("evt-aaa"), evt("evt-bbb")];
  const a = linhagemDeEventos(eventos, META);
  const b = linhagemDeEventos(eventos, META);
  assert.deepEqual(a.input_event_ids, ["evt-ccc", "evt-aaa", "evt-bbb"], "houve reordenacao");
  assert.deepEqual(b, a, "duas execucoes produziram linhagens diferentes");
});

teste("L05 duplicata segue regra explicita: a PRIMEIRA ocorrencia vence", () => {
  const l = linhagemDeEventos([evt("evt-bbb"), evt("evt-aaa"), evt("evt-bbb")], META);
  assert.deepEqual(l.input_event_ids, ["evt-bbb", "evt-aaa"]);
});

teste("L06 evento inexistente no log e recusado", () => {
  const l = linhagemDeEventos([evt("evt-aaa"), evt("evt-zzz")], META);
  assert.equal(razao(elegibilidadeParaShadow(l, CTX_REAL(l, "c"))), "event_not_persisted");
});

teste("L07 fixture nao passa como real", () => {
  const f = linhagemDeFixture(OBSERVADO);
  assert.equal(f.natureza, "fixture");
  assert.equal(razao(elegibilidadeParaShadow(f, CTX_REAL(f, "c"))), "event_lineage_unavailable");
  // E uma linhagem com evento simulado tambem nao: a natureza inteira degrada.
  const sim = linhagemDeEventos([evt("evt-aaa"), evt("evt-bbb", "simulated")], META);
  assert.equal(sim.natureza, "demonstracao");
  assert.equal(razao(elegibilidadeParaShadow(sim, CTX_REAL(sim, "c"))), "fixture_in_real_path");
  // O par: no destino de demonstracao, a mesma linhagem passa.
  const demo = elegibilidadeParaShadow(sim, {
    ...CTX_REAL(sim, "c"),
    destino: "demonstracao",
  });
  assert.equal(demo.eligible_for_shadow, true, razao(demo));
});

teste("L08 timestamp, texto, indice e id novo NAO passam como event id", () => {
  for (const falso of [
    "2026-08-04T18:20:00.000Z",
    "1723",
    "t-17",
    "indice-2",
    "pos_3",
    "#301",
    "B-205",
    "fixture-1",
    "sha256-abc",
    "",
    "   ",
  ]) {
    assert.equal(eventIdLegitimo(falso), false, `aceitou ${JSON.stringify(falso)}`);
  }
  // Controle positivo: sem ele a guarda passaria com uma funcao que sempre nega.
  assert.equal(eventIdLegitimo("evt-aaa"), true);
  // E um id ilegitimo dentro da linhagem e simplesmente DESCARTADO na origem —
  // ele nunca vira `input_event_id`.
  const l = linhagemDeEventos([evt("evt-aaa"), evt("2026-08-04T18:20:00.000Z")], META);
  assert.deepEqual(l.input_event_ids, ["evt-aaa"]);
});

teste("L09 causa diferente da linhagem e recusada", () => {
  const l = linhagemDeEventos([evt("evt-aaa")], META);
  const r = elegibilidadeParaShadow(l, {
    destino: "real",
    existeNoLog,
    vinculo_causa: "s5|sushi|-|-|carga",
    causa_da_linhagem: "s1|motoboy|-|-|ifood",
  });
  assert.equal(razao(r), "cause_without_event_link");
});

teste("L10 produtor nao autorizado e versao desconhecida sao recusados", () => {
  const p = linhagemDeEventos([evt("evt-aaa")], { ...META, produtor: "planilha-do-caixa" });
  assert.equal(razao(elegibilidadeParaShadow(p, CTX_REAL(p, "c"))), "producer_not_authorized");
  const v = { ...linhagemDeEventos([evt("evt-aaa")], META), event_catalog_version: "event-catalog@9" };
  assert.equal(razao(elegibilidadeParaShadow(v, CTX_REAL(v, "c"))), "unsupported_event_version");
});

/* ================================================================== *
 * SERIALIZACAO E REPLAY                                               *
 * ================================================================== */

teste("L11 serializacao e replay preservam os ids e o vinculo", () => {
  const l = linhagemDeEventos([evt("evt-aaa"), evt("evt-bbb")], META);
  const restaurado = JSON.parse(JSON.stringify(l)) as LinhagemDeEventos;
  assert.deepEqual(restaurado, l, "a linhagem nao sobrevive a JSON");
  assert.deepEqual(
    elegibilidadeParaShadow(restaurado, CTX_REAL(restaurado, "c")),
    elegibilidadeParaShadow(l, CTX_REAL(l, "c")),
  );
  // E o vinculo continua sendo CONFERIDO depois da restauracao.
  const adulterado = { ...restaurado, input_event_ids: ["evt-zzz"] };
  assert.equal(razao(elegibilidadeParaShadow(adulterado, CTX_REAL(adulterado, "c"))), "event_not_persisted");
});

/* ================================================================== *
 * O QUE NAO MUDOU — e e o resultado da missao                         *
 * ================================================================== */

teste("L12 caminho SEM linhagem continua bloqueado, e as fixtures sao esse caminho", () => {
  // A cena de demonstracao nao tem linhagem: o sinal tambem nao tem.
  const sinais = sinaisDe(cenaFoco());
  assert.ok(sinais.length > 0);
  for (const s of sinais) {
    assert.equal(s.linhagem, null, `sinal ${s.codigo} ganhou linhagem sem produtor`);
    assert.equal(
      razao(elegibilidadeParaShadow(s.linhagem, CTX_REAL(null, "c"))),
      "event_lineage_unavailable",
    );
  }
});

teste("L13 elegibilidade exige PRODUTOR REAL — o tipo aceitar id nao basta", () => {
  // A prova estrutural: o unico produtor de `LeituraOperacional` e a fixture.
  let produtores: string[] = [];
  try {
    produtores = execFileSync(
      "git",
      ["grep", "-l", "--untracked", "): LeituraOperacional", "--", "src/", "tools/"],
      { cwd: raiz, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => l.split("\\").join("/"))
      .filter((l) => !/\/run-[a-z0-9-]+-tests\.ts$/.test(l));
  } catch {
    produtores = [];
  }
  assert.deepEqual(
    produtores,
    ["src/product/demo/seed-home-demonstracao.ts"],
    `apareceu produtor fora da fixture — reavaliar a elegibilidade: ${produtores.join(", ")}`,
  );
  // E o catalogo de eventos nao descreve a leitura operacional: nenhum tipo fala
  // de carga por praca, baseline ou chegadas. Enquanto isso valer, nao ha como
  // um produtor real existir sem inventar semantica.
  const catalogo = ler("src/platform/contracts/event-catalog.ts");
  const tipos = /export const EVENT_TYPES = \[([\s\S]*?)\] as const;/.exec(catalogo)![1]!;
  for (const inexistente of ["carga", "praca", "baseline", "chegada", "producao"]) {
    assert.doesNotMatch(tipos, new RegExp(inexistente, "i"), `o catalogo ganhou ${inexistente}`);
  }
});

/* ================================================================== *
 * FRONTEIRAS PRESERVADAS                                              *
 * ================================================================== */

teste("L14 o tradutor NAO busca nem cria eventos", () => {
  const fonte = ler("src/product/atencao/traducao-motor-shadow.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const proibido of [
    /linhagem-eventos/,
    /existeNoLog/,
    /linhagemDeEventos\s*\(/,
    /Date\.now\s*\(/,
    /randomUUID/,
    /Math\.random\s*\(/,
  ]) {
    assert.doesNotMatch(fonte, proibido, `o tradutor passou a buscar ou criar evento: ${proibido}`);
  }
  // A linhagem chega a ele por ENTRADA TIPADA, como qualquer outra evidencia.
  assert.match(fonte, /readonly evidencias: PacoteDeEvidencias \| null;/);
});

teste("L15 nenhum runtime, flag ou conexao nasceu nesta missao", () => {
  const linhagem = ler("src/product/atencao/linhagem-eventos.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const imports = [...linhagem.matchAll(/(?:import[^;]*from|require\()\s*["'`]([^"'`]+)["'`]/g)].map(
    (m) => m[1]!,
  );
  for (const esp of imports) {
    for (const proibido of ["store", "outbox", "pg", "bin/", "conference-brain", "perfil-delivery"]) {
      assert.ok(!esp.includes(proibido), `a linhagem importou ${esp}`);
    }
  }
  for (const efeito of [/FEATURE_/, /FLAG_/, /\bput\s*\(/, /\bemit\s*\(/, /\bfetch\s*\(/, /Date\.now\s*\(/]) {
    assert.doesNotMatch(linhagem, efeito, `a linhagem ganhou ${efeito}`);
  }
  // E o congelamento desta missao: confianca, visual, CSS, motion, Figma, motor.
  const saida = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "ced38da",
      "--",
      "src/product/ui/",
      "src/product/viewmodels/areas.ts",
      "src/perfil-delivery/",
      "docs/figma/",
    ],
    { cwd: raiz, encoding: "utf8" },
  ).trim();
  assert.equal(saida, "", `ativo congelado foi alterado:\n${saida}`);
});

/* ================================================================== */

void Promise.resolve().then(() => {
  const marcas = Object.fromEntries(ARTEFATOS.map((a) => [a, sha(ler(a)).slice(0, 16)]));
  console.log(`\nARTEFATOS ${JSON.stringify(marcas)}`);
  console.log(`\nR5-D0-L — linhagem real de eventos: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("R5D0_LINEAGE_GATE_GREEN");
});
