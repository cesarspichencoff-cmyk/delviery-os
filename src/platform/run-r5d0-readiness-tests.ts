/**
 * GATE R5-D0 — PRONTIDAO DE EVIDENCIA, CONFIANCA E VALIDADOR
 * ============================================================================
 * Nada aqui conecta runtime. O gate prova tres coisas e so:
 *
 *   1. de quais eventos reais viriam os `input_event_ids`;
 *   2. como a confianca e representada sem precisao inventada;
 *   3. que runtime e harness chamam EXATAMENTE o mesmo validador.
 *
 * A prova de (3) e por IDENTIDADE DE REFERENCIA de funcao, nao por nome nem por
 * texto: `validarDraftShadow` importada do tradutor tem que ser o MESMO objeto
 * que a exportada pelo Shadow. Duas copias parecidas passariam em qualquer
 * comparacao textual e falham nesta.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  POLICY_VERSION,
  recomendar,
  validarDraftShadow as validadorDoShadow,
  type Recomendacao,
} from "../platform/copiloto/shadow";
import { validarDraftShadow as validadorDaFronteira } from "../product/atencao/traducao-motor-shadow";
import {
  PRODUTORES_AUTORIZADOS,
  avaliarProntidaoR5D,
  conferirConfianca,
  conferirLinhagem,
  identidadeDeEventoLegitima,
  type ConfiancaDeclarada,
  type LinhagemDeEvidencia,
  type ResultadoLinhagem,
} from "../product/atencao/prontidao-r5d";
import type { EscopoDoSujeito } from "../product/atencao/traducao-motor-shadow";

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const ARTEFATOS = [
  "src/product/atencao/prontidao-r5d.ts",
  "src/platform/copiloto/shadow.ts",
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
 * Fixtures                                                            *
 * ------------------------------------------------------------------ */

const CAUSA = "s5|sushi|enrolados_quentes|-|carga_pracas";
const ESCOPO: EscopoDoSujeito = { tipo: "subarea", subarea: "enrolados_quentes" };
const LOG = new Set(["evt-aaa", "evt-bbb", "evt-ccc"]);
const existeNoLog = (id: string): boolean => LOG.has(id);

const linhagem = (over: Partial<LinhagemDeEvidencia> = {}): LinhagemDeEvidencia => ({
  input_event_ids: ["evt-aaa", "evt-bbb"],
  signal_id: "S5",
  cause_id: CAUSA,
  observed_at: "2026-08-03T20:40:00.000Z",
  producer: "operacao-viva",
  event_schema_version: "1",
  transformations: ["projetar"],
  data_nature: "real",
  source_mode: "real",
  subject_scope: ESCOPO,
  limitations: [],
  ...over,
});

const ctx = (destino: "real" | "demonstracao" = "real") => ({
  causa_eleita: CAUSA,
  escopo: ESCOPO,
  destino,
  existeNoLog,
});

const motivo = (r: ResultadoLinhagem): string => (r.elegivel ? "<elegivel>" : r.motivo);

/* ================================================================== *
 * 1-13 · LINHAGEM DE EVENTOS                                          *
 * ================================================================== */

teste("D01 event ID real e existente e aceito", () => {
  const r = conferirLinhagem(linhagem(), ctx());
  assert.equal(r.elegivel, true, motivo(r));
  assert.deepEqual(r.elegivel && r.input_event_ids, ["evt-aaa", "evt-bbb"]);
});

teste("D02 event ID inexistente no log e recusado", () => {
  const r = conferirLinhagem(linhagem({ input_event_ids: ["evt-aaa", "evt-zzz"] }), ctx());
  assert.equal(motivo(r), "event_not_persisted");
});

teste("D03 fixture no caminho real e recusada", () => {
  assert.equal(motivo(conferirLinhagem(linhagem({ data_nature: "fixture" }), ctx())), "fixture_in_real_path");
  assert.equal(
    motivo(conferirLinhagem(linhagem({ data_nature: "demonstracao" }), ctx())),
    "fixture_in_real_path",
  );
  assert.equal(motivo(conferirLinhagem(linhagem({ source_mode: "simulated" }), ctx())), "fixture_in_real_path");
  // O par: no destino de demonstracao a mesma linhagem passa.
  const demo = conferirLinhagem(
    linhagem({ data_nature: "demonstracao", source_mode: "control" }),
    ctx("demonstracao"),
  );
  assert.equal(demo.elegivel, true, motivo(demo));
});

teste("D04 timestamp e minuto operacional NAO sao event ID", () => {
  for (const falso of ["2026-08-03T20:40:00.000Z", "1723", "t-17", "min:42", "minuto_9"]) {
    assert.equal(identidadeDeEventoLegitima(falso), false, `aceitou ${falso}`);
  }
  const r = conferirLinhagem(linhagem({ input_event_ids: ["2026-08-03T20:40:00.000Z"] }), ctx());
  assert.equal(motivo(r), "event_lineage_unavailable");
});

teste("D05 posicao, indice, id visual, fixture e hash NAO sao event ID", () => {
  for (const falso of ["indice-2", "pos_3", "#301", "B-205", "fixture-1", "sha256-abc", "hash:9"]) {
    assert.equal(identidadeDeEventoLegitima(falso), false, `aceitou ${falso}`);
  }
  // Controle positivo: sem ele a guarda passaria com uma funcao que sempre nega.
  assert.equal(identidadeDeEventoLegitima("evt-aaa"), true);
});

teste("D06 evidencia sem vinculo com o sinal e recusada", () => {
  assert.equal(motivo(conferirLinhagem(linhagem({ signal_id: "" }), ctx())), "signal_link_missing");
});

teste("D07/D08 causa diferente da temporalmente eleita e recusada", () => {
  assert.equal(motivo(conferirLinhagem(linhagem({ cause_id: "outra" }), ctx())), "cause_mismatch");
});

teste("D09 multiplos eventos preservam ordem deterministica", () => {
  const r = conferirLinhagem(linhagem({ input_event_ids: ["evt-ccc", "evt-aaa", "evt-bbb"] }), ctx());
  assert.equal(r.elegivel, true, motivo(r));
  assert.deepEqual(r.elegivel && r.input_event_ids, ["evt-ccc", "evt-aaa", "evt-bbb"]);
  // Deterministico: duas execucoes, mesmo resultado.
  const b = conferirLinhagem(linhagem({ input_event_ids: ["evt-ccc", "evt-aaa", "evt-bbb"] }), ctx());
  assert.deepEqual(b, r);
});

teste("D10 evento duplicado segue regra explicita: primeira ocorrencia vence", () => {
  const r = conferirLinhagem(
    linhagem({ input_event_ids: ["evt-bbb", "evt-aaa", "evt-bbb"] }),
    ctx(),
  );
  assert.equal(r.elegivel, true, motivo(r));
  assert.deepEqual(r.elegivel && r.input_event_ids, ["evt-bbb", "evt-aaa"]);
});

teste("D11 versao de evento desconhecida e recusada", () => {
  assert.equal(
    motivo(conferirLinhagem(linhagem({ event_schema_version: "2" }), ctx())),
    "unsupported_event_version",
  );
  assert.equal(
    motivo(conferirLinhagem(linhagem({ producer: "planilha-do-caixa" }), ctx())),
    "producer_not_authorized",
  );
  assert.ok(PRODUTORES_AUTORIZADOS.length > 0);
});

teste("D12/D13 o pacote serializa, restaura e PRESERVA o vinculo", () => {
  const l = linhagem();
  const restaurado = JSON.parse(JSON.stringify(l)) as LinhagemDeEvidencia;
  assert.deepEqual(restaurado, l, "o pacote nao sobrevive a JSON");
  const antes = conferirLinhagem(l, ctx());
  const depois = conferirLinhagem(restaurado, ctx());
  assert.deepEqual(depois, antes, "o vinculo mudou depois da restauracao");
  assert.equal(depois.elegivel, true);
  // E o vinculo continua sendo conferido: causa trocada no restaurado recusa.
  const adulterado = { ...restaurado, cause_id: "outra" };
  assert.equal(motivo(conferirLinhagem(adulterado, ctx())), "cause_mismatch");
});

teste("D-EXTRA sujeito divergente entre evidencia e escopo e recusado", () => {
  const r = conferirLinhagem(
    linhagem({ subject_scope: { tipo: "fonte", fonte_id: "carga_pracas" } }),
    ctx(),
  );
  assert.equal(motivo(r), "event_subject_mismatch");
});

/* ================================================================== *
 * 14-18 · CONFIANCA                                                   *
 * ================================================================== */

const apurada: ConfiancaDeclarada = {
  tipo: "apurada",
  valor: 0.72,
  regra: "proporcao de viagens sem posicao recente sobre viagens em rota",
};

teste("D14 confianca ausente NAO vira zero", () => {
  // R5-D0-C: `nao_estimada` passou a ser SUPORTADA — uma recomendacao nao
  // precisa inventar numero para existir. O que ela devolve e `valor: null`,
  // NUNCA zero.
  const r = conferirConfianca({ tipo: "nao_estimada", motivo: "sem apuracao" }, 2);
  assert.equal(r.suportada, true);
  assert.equal(r.suportada === true && r.valor, null, "nao estimada virou numero");
  assert.notEqual(r.suportada === true && r.valor, 0, "nao estimada virou zero");
  // E o tipo nao tem onde guardar zero: ausencia e um RAMO, nao um valor.
  const fonte = ler("src/product/atencao/prontidao-r5d.ts");
  assert.match(fonte, /tipo: "nao_estimada"; readonly motivo: string/);
  // Zero, quando APURADO, e legitimo — o par que distingue ausencia de zero.
  const zero = conferirConfianca({ ...apurada, valor: 0 }, 2);
  assert.equal(zero.suportada, true);
  assert.equal(zero.suportada && zero.valor, 0);
});

teste("D15 rotulo qualitativo NAO vira numero", () => {
  for (const regra of ["rotulo alta do motor", "label media", "converte baixa em 0.3"]) {
    const r = conferirConfianca({ tipo: "apurada", valor: 0.9, regra }, 2);
    assert.equal(r.suportada, false, `converteu com a regra "${regra}"`);
    assert.equal(r.suportada === false && r.motivo, "qualitative_label_not_convertible");
  }
});

teste("D16 severidade NAO vira confianca", () => {
  const r = conferirConfianca(
    { tipo: "apurada", valor: 0.8, regra: "severidade >= 3 vira 0.8" },
    2,
  );
  assert.equal(r.suportada, false, "severidade foi aceita como confianca");
  assert.equal(r.suportada === false && r.motivo, "severity_used_as_confidence");
});

teste("D17 confianca sem evidencia e recusada", () => {
  const r = conferirConfianca(apurada, 0);
  assert.equal(r.suportada, false);
  assert.equal(r.suportada === false && r.motivo, "confidence_without_evidence");
  // Fora de faixa tambem.
  for (const v of [-0.1, 1.4, Number.NaN]) {
    const f = conferirConfianca({ ...apurada, valor: v }, 2);
    assert.equal(f.suportada, false, `aceitou ${v}`);
  }
  // O par: com evidencia e regra legitima, passa.
  assert.equal(conferirConfianca(apurada, 2).suportada, true);
});

teste("D18 fixture nao declara confianca real: a linhagem barra antes", () => {
  const l = conferirLinhagem(linhagem({ data_nature: "fixture" }), ctx());
  const p = avaliarProntidaoR5D({
    linhagem: l,
    confianca: conferirConfianca(apurada, 2),
    validador_compartilhado: true,
  });
  assert.equal(p.status, "blocked");
  assert.ok(
    p.status === "blocked" && p.bloqueios.some((b) => b.motivo === "fixture_in_real_path"),
  );
});

/* ================================================================== *
 * 19-23 · VALIDADOR COMPARTILHADO                                     *
 * ================================================================== */

const draftValido = (): Recomendacao => ({
  recommendation_id: "rec-1",
  policy_id: "p",
  policy_version: POLICY_VERSION,
  input_event_ids: ["evt-aaa"],
  projection_version: "operacao-viva@1.0.0",
  source_mode: "real",
  confianca: {
    estado: "apurada",
    valor: 0.7,
    politica: "p",
    versao_da_politica: POLICY_VERSION,
    evidencias: ["evt-aaa"],
  },
  risk_level: "medio",
  recommended_action: "acao",
  reason: "razao",
  indisponivel: [],
  requires_human: true,
  created_at: "2026-08-03T20:40:00.000Z",
  expires_at: "2026-08-03T20:50:00.000Z",
  status: "proposed",
});

teste("D19 o validador compartilhado aceita draft valido", () => {
  assert.equal(validadorDoShadow(draftValido()).aceito, true);
});

teste("D20 o validador compartilhado rejeita draft adulterado", () => {
  const casos: [Partial<Recomendacao>, string][] = [
    [{ input_event_ids: [] }, "evidencia_vazia"],
    [
      {
        confianca: {
          estado: "apurada" as const,
          valor: 1.4,
          politica: "p",
          versao_da_politica: POLICY_VERSION,
          evidencias: ["evt-aaa"],
        },
      },
      "confianca_invalida",
    ],
    [{ status: "dismissed" }, "status_nao_proposto"],
    [{ requires_human: false }, "sem_exigencia_humana"],
    [{ policy_version: "outra@1" }, "versao_de_politica_divergente"],
    [{ expires_at: "2026-08-03T20:40:00.000Z" }, "validade_incoerente"],
  ];
  for (const [patch, m] of casos) {
    const v = validadorDoShadow({ ...draftValido(), ...patch });
    assert.equal(v.aceito, false, `aceitou ${JSON.stringify(patch)}`);
    assert.equal(v.aceito === false && v.motivo, m);
  }
});

teste("D21/D22/D23 runtime e fronteira usam a MESMA funcao — identidade, nao nome", () => {
  // A prova que texto nao consegue dar: as duas referencias sao o mesmo objeto.
  assert.equal(
    validadorDaFronteira,
    validadorDoShadow,
    "o harness voltou a ter validador proprio",
  );
  // E `recomendar()` chama esta funcao — provado por comportamento: uma proposta
  // que o validador recusa nao sai de `recomendar()`.
  const fonte = ler("src/platform/copiloto/shadow.ts");
  assert.match(fonte, /if \(!validarDraftShadow\(candidata\)\.aceito\) continue;/,
    "recomendar() deixou de chamar o validador compartilhado");
  // Controle de comportamento: politica cuja proposta nao tem evidencia nao
  // produz recomendacao nenhuma.
  const projecaoVazia = {
    projection_version: "v",
    source_mode: "real",
    viagens: [],
    dimensoes: {},
  } as unknown as Parameters<typeof recomendar>[0];
  const saida = recomendar(projecaoVazia, {
    agora: new Date("2026-08-03T20:40:00.000Z"),
    politicas: [
      {
        policy_id: "sem-evidencia",
        validade_s: 300,
        avaliar: () => ({
          recommended_action: "x",
          reason: "y",
          confidence: 0.9,
          risk_level: "medio" as const,
          input_event_ids: [],
          requires_human: true,
        }),
      },
    ],
  });
  assert.equal(saida.length, 0, "recomendar() emitiu recomendacao sem evidencia");
});

/* ================================================================== *
 * 24-30 · PREFLIGHT E AUSENCIA DE EFEITO                              *
 * ================================================================== */

teste("D24 preflight BLOQUEIA quando falta linhagem", () => {
  const p = avaliarProntidaoR5D({
    linhagem: { elegivel: false, motivo: "event_lineage_unavailable" },
    confianca: conferirConfianca(apurada, 2),
    validador_compartilhado: true,
  });
  assert.equal(p.status, "blocked");
  assert.equal(p.status === "blocked" && p.bloqueios[0]!.motivo, "event_lineage_unavailable");
});

teste("D25 preflight BLOQUEIA quando falta confianca", () => {
  const p = avaliarProntidaoR5D({
    linhagem: conferirLinhagem(linhagem(), ctx()),
    confianca: { suportada: false, motivo: "confidence_contract_missing" },
    validador_compartilhado: true,
  });
  assert.equal(p.status, "blocked");
  assert.equal(p.status === "blocked" && p.bloqueios[0]!.motivo, "confidence_contract_missing");
});

teste("D26 preflight BLOQUEIA quando os validadores divergem", () => {
  const p = avaliarProntidaoR5D({
    linhagem: conferirLinhagem(linhagem(), ctx()),
    confianca: conferirConfianca(apurada, 2),
    validador_compartilhado: false,
  });
  assert.equal(p.status, "blocked");
  assert.equal(p.status === "blocked" && p.bloqueios[0]!.motivo, "shadow_validator_divergent");
});

teste("D27 preflight fica ready SOMENTE com as tres condicoes", () => {
  const p = avaliarProntidaoR5D({
    linhagem: conferirLinhagem(linhagem(), ctx()),
    confianca: conferirConfianca(apurada, 2),
    validador_compartilhado: true,
  });
  assert.equal(p.status, "ready");
  assert.equal(p.status === "ready" && p.event_lineage, "proven");
  assert.equal(p.status === "ready" && p.confidence, "supported");
  assert.equal(p.status === "ready" && p.shadow_validator, "shared");
  // Duas verdes e uma vermelha continua bloqueado — nao existe "quase pronto".
  for (const quebra of [
    { linhagem: { elegivel: false as const, motivo: "event_not_persisted" as const } },
    { confianca: { suportada: false as const, motivo: "confidence_without_evidence" as const } },
    { validador_compartilhado: false },
  ]) {
    const q = avaliarProntidaoR5D({
      linhagem: conferirLinhagem(linhagem(), ctx()),
      confianca: conferirConfianca(apurada, 2),
      validador_compartilhado: true,
      ...quebra,
    });
    assert.equal(q.status, "blocked", `ficou ready com ${JSON.stringify(quebra)}`);
  }
});

teste("D28/D29/D30 nada e persistido, emitido ou ligado por flag", () => {
  const fonte = ler("src/product/atencao/prontidao-r5d.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const imports = [...fonte.matchAll(/(?:import[^;]*from|require\()\s*["'`]([^"'`]+)["'`]/g)].map(
    (m) => m[1]!,
  );
  for (const esp of imports) {
    for (const proibido of ["store", "outbox", "pg", "bin/", "conference-brain"]) {
      assert.ok(!esp.includes(proibido), `a prontidao importou ${esp}`);
    }
  }
  for (const efeito of [/\bput\s*\(/, /\bemit\s*\(/, /\bfetch\s*\(/, /writeFile/, /process\.env/,
    /Date\.now\s*\(/, /Math\.random\s*\(/, /randomUUID/]) {
    assert.doesNotMatch(fonte, efeito, `a prontidao ganhou um efeito: ${efeito}`);
  }
  // Nenhuma flag nasceu nesta missao.
  assert.doesNotMatch(fonte, /FEATURE_|FLAG_|enabled\s*[:=]\s*true/);
  // E o preflight nao liga nada: ele so devolve veredito.
  const p = avaliarProntidaoR5D({
    linhagem: conferirLinhagem(linhagem(), ctx()),
    confianca: conferirConfianca(apurada, 2),
    validador_compartilhado: true,
  });
  assert.equal(Object.keys(p).length, 4, "o preflight passou a devolver mais que veredito");
});

/* ================================================================== *
 * LINHAGEM REAL DOS DOIS CAMINHOS — o achado central                  *
 * ================================================================== */

teste("D-LIN o Caminho A preserva event ID e o Caminho B nao tem nenhum", () => {
  // Caminho A: a projecao carrega os eventos, e o Shadow os usa como evidencia.
  const projecao = ler("src/platform/projections/operacao-viva.ts");
  assert.match(projecao, /eventos: readonly string\[\]/, "a projecao parou de preservar event id");
  const shadow = ler("src/platform/copiloto/shadow.ts");
  assert.match(shadow, /v\.eventos\[v\.eventos\.length - 1\]/, "o Shadow parou de usar os eventos");
  // Caminho B: `sinais.ts` nao cita evento em nenhuma linha, e
  // `LeituraOperacional` nunca teve campo de evento. A identidade nao se perde
  // no meio — ela NUNCA ENTRA.
  const sinais = ler("src/product/viewmodels/sinais.ts");
  assert.doesNotMatch(sinais, /event_id|evento_id|input_event_ids/,
    "sinais.ts passou a citar evento: reavaliar a elegibilidade do Caminho B");
  const leitura = /export interface LeituraOperacional \{[\s\S]*?\n\}/.exec(sinais)![0];
  assert.doesNotMatch(leitura, /event/i, "LeituraOperacional ganhou evento — atualizar a matriz");
});

teste("D-PUR gerar ID dentro do tradutor e IMPOSSIVEL — a fronteira nao inventa identidade", () => {
  // Item 5 da lista obrigatoria. Sem esta guarda, a mutacao que injeta
  // `Date.now()` no `recommendation_id` do tradutor passava aqui em silencio:
  // ela so caia no gate de R5-C. Uma missao que fala de linhagem precisa provar,
  // ela mesma, que nenhuma identidade nasce do nada.
  const fonte = ler("src/product/atencao/traducao-motor-shadow.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const gerador of [/Date\.now\s*\(/, /Math\.random\s*\(/, /randomUUID/, /createHash/]) {
    assert.doesNotMatch(fonte, gerador, `o tradutor ganhou um gerador de identidade: ${gerador}`);
  }
  // E o id do draft e EXATAMENTE o que o chamador forneceu, sem sufixo nem sal.
  assert.match(
    fonte,
    /recommendation_id: e\.recommendation_id,/,
    "o `recommendation_id` deixou de ser o do chamador",
  );
});

teste("VISUAL diff vazio nos ativos congelados desde 27ccfd2", () => {
  const saida = execFileSync(
    "git",
    // O congelamento de R5-D0-C e CSS, motion e Figma. `home.js` e `home-vm.ts`
    // mudaram por autorizacao explicita: a correcao de severidade->confianca e
    // semantica, e a home passou a NAO APRESENTAR o campo nao estimado.
    // Layout, folha de estilo, movimento e desenho continuam intocados.
    [
      "diff",
      "--name-only",
      "27ccfd2",
      "--",
      "src/product/ui/surfaces/home.css",
      "src/product/ui/tokens/",
      "src/product/viewmodels/sinais.ts",
      "src/product/viewmodels/areas.ts",
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
  console.log(`\nR5-D0 — prontidao para R5-D: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("R5D0_READINESS_GATE_GREEN");
});
