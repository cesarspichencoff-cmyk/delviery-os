/**
 * GATE R5-D0-S — COMPATIBILIDADE DURAVEL DA CONFIANCA
 * ============================================================================
 * O dominio distingue `nao_estimada` de `apurada` desde R5-D0-C. Este gate prova
 * que o REGISTRO preserva a mesma verdade — no disco, no replay e na recuperacao
 * — sem transformar ausencia em zero e sem promover numero legado.
 *
 * O store e o do Conference Brain, de verdade: os testes gravam em diretorio
 * temporario, recarregam do disco e comparam. Nenhum runtime novo, nenhum
 * produtor, nenhuma flag.
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CONFIANCA_SCHEMA,
  deConfiancaDuravel,
  paraConfiancaDuravel,
} from "./copiloto/confianca-duravel";
import { POLICY_VERSION, type ConfiancaDaRecomendacao } from "./copiloto/shadow";
import { CONFIANCA_DURAVEL_COMPATIVEL, avaliarProntidaoR5D } from "../product/atencao/prontidao-r5d";

/**
 * FIM DO INTERVALO HISTORICO CERTIFICADO — M1A.1, decisao D-M1A1-10.
 *
 * O baseline do congelamento NAO mudou. O que entrou foi o SEGUNDO commit: sem
 * ele, `git diff <base> -- <paths>` comparava com a arvore ATUAL — intervalo
 * aberto a direita, que nunca fecha. A prova historica so continuava verde
 * enquanto o futuro nao existisse. Medido em M1A.1: UMA linha autorizada em
 * `home.css` deixava os DEZ gates de congelamento vermelhos de uma vez.
 *
 * Este e o ultimo commit em que a propriedade congelada foi verificada verde, e
 * tambem o baseline de M1. Trabalho autorizado depois dele e governado por
 * `docs/design/M1_VISUAL_CHANGE_ENVELOPE.md`, nao por esta asercao.
 *
 * Uma prova historica protege o passado. Ela nao congela o futuro autorizado.
 * Controle antifalso-positivo: `run-m1-bridge-tests.ts`, familia C, que le os
 * caminhos DESTE arquivo — os dois nao podem divergir em silencio.
 */
const FIM_HISTORICO = "f87a36dfd39c9989344f0fed6ebf8db5db1a8c35";

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const ARTEFATOS = [
  "src/platform/copiloto/confianca-duravel.ts",
  "src/conference-brain/contracts/schemas.js",
  "src/platform/copiloto/conference-bridge.ts",
  "src/product/atencao/prontidao-r5d.ts",
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
 * Store real, em diretorio temporario                                 *
 * ------------------------------------------------------------------ */

const requireCJS = createRequire(join(raiz, "package.json"));
// Mesmo carregador que o gate do Copiloto usa: o store REAL do Conference Brain,
// por caminho absoluto. Nada aqui e simulacao de armazenamento.
const { createStore } = requireCJS(join(raiz, "src", "conference-brain", "storage", "store")) as {
  createStore: (o: { dir: string }) => {
    put: (e: string, r: Record<string, unknown>) => { ok: boolean; errors?: string[] };
    all: (e: string) => Record<string, unknown>[];
    /** Recarrega a entidade DO DISCO, validando cada linha contra o schema (D31). */
    load: (e: string) => unknown;
    health: () => { invalid_lines?: unknown[] };
  };
};

/** Roda `fn` com um store novo em disco, e limpa depois. */
function comStore<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "r5d0s-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const APURADA: ConfiancaDaRecomendacao = {
  estado: "apurada",
  valor: 0.72,
  politica: "capacidade-saturada",
  versao_da_politica: POLICY_VERSION,
  evidencias: ["evt-aaa", "evt-bbb"],
};
const NAO_ESTIMADA: ConfiancaDaRecomendacao = { estado: "nao_estimada" };

/** Um registro duravel valido, com a confianca que se pedir. */
const registro = (c: ConfiancaDaRecomendacao, id: string = randomUUID()): Record<string, unknown> => ({
  recommendation_id: id,
  unit_id: "demo-unit",
  source_mode: "real",
  conclusion_ref: "cf-1",
  conclusion_version: "conference-brain-conclusion@1.0.0",
  policy_id: "p",
  policy_version: POLICY_VERSION,
  bridge_version: "copiloto-conference-bridge@1.0.0",
  escopo: "fonte",
  titulo: "t",
  descricao: "d",
  evidencias: [{ ref: "evt-aaa", tipo: "evento" }],
  evidence_grade: "sustentada",
  ...paraConfiancaDuravel(c),
  risk_level: "medio",
  recommended_action: "a",
  requires_human: true,
  shadow: true,
  created_at: "2026-08-04T18:20:00.000Z",
  expires_at: "2026-08-04T18:30:00.000Z",
  status: "proposed",
});

const erros = (r: { ok: boolean; errors?: string[] }): string[] => r.errors ?? [];

/* ================================================================== *
 * 1-3 · ROUND-TRIP                                                    *
 * ================================================================== */

teste("S01 `nao_estimada` serializa e restaura como `nao_estimada`", () => {
  const d = paraConfiancaDuravel(NAO_ESTIMADA);
  assert.equal(d.confianca_schema, CONFIANCA_SCHEMA);
  const texto = JSON.stringify(d);
  const volta = deConfiancaDuravel(JSON.parse(texto) as Record<string, unknown>);
  assert.equal(volta.tipo, "ok");
  assert.deepEqual(volta.tipo === "ok" && volta.confianca, { estado: "nao_estimada" });
});

teste("S02 `nao_estimada` NAO vira zero nem `null` ambiguo", () => {
  const d = paraConfiancaDuravel(NAO_ESTIMADA);
  // Nao ha numero nenhum no registro: nem 0, nem null, nem campo presente.
  assert.equal("confidence" in d, false, "nao estimada ganhou espelho numerico");
  assert.equal("valor" in d.confianca, false, "nao estimada ganhou valor");
  const bruto = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(bruto, "confidence"), false);
  assert.notEqual(JSON.stringify(bruto).includes('"confidence":0'), true);
  assert.notEqual(JSON.stringify(bruto).includes('"confidence":null'), true);
  // E o store aceita o registro sem numero — era exatamente isso que faltava.
  comStore((dir) => {
    const store = createStore({ dir });
    const r = store.put("copilot_recommendations", registro(NAO_ESTIMADA));
    assert.equal(r.ok, true, `o store recusou nao_estimada: ${erros(r).join(", ")}`);
  });
});

teste("S03 confianca apurada preserva TODOS os campos", () => {
  const d = paraConfiancaDuravel(APURADA);
  const volta = deConfiancaDuravel(JSON.parse(JSON.stringify(d)) as Record<string, unknown>);
  assert.equal(volta.tipo, "ok");
  assert.deepEqual(volta.tipo === "ok" && volta.confianca, APURADA);
  // O espelho existe e concorda com a verdade — nunca a substitui.
  assert.equal(d.confidence, 0.72);
});

/* ================================================================== *
 * 4-5 · REPLAY E RECUPERACAO                                          *
 * ================================================================== */

teste("S04 replay preserva o estado discriminado", () => {
  comStore((dir) => {
    const store = createStore({ dir });
    const a = registro(NAO_ESTIMADA, "rec-nao");
    const b = registro(APURADA, "rec-apu");
    assert.equal(store.put("copilot_recommendations", a).ok, true);
    assert.equal(store.put("copilot_recommendations", b).ok, true);
    // Reprocessar o MESMO registro nao altera o que esta gravado.
    assert.equal(store.put("copilot_recommendations", a).ok, true);
    const todos = store.all("copilot_recommendations");
    const nao = todos.find((r) => r["recommendation_id"] === "rec-nao")!;
    const apu = todos.find((r) => r["recommendation_id"] === "rec-apu")!;
    assert.deepEqual(deConfiancaDuravel(nao), { tipo: "ok", confianca: NAO_ESTIMADA });
    assert.deepEqual(deConfiancaDuravel(apu), { tipo: "ok", confianca: APURADA });
  });
});

teste("S05 recuperacao do DISCO preserva o estado discriminado", () => {
  comStore((dir) => {
    // Escreve com um store, LE COM OUTRO — o segundo carrega do arquivo.
    const escritor = createStore({ dir });
    assert.equal(escritor.put("copilot_recommendations", registro(NAO_ESTIMADA, "rec-nao")).ok, true);
    assert.equal(escritor.put("copilot_recommendations", registro(APURADA, "rec-apu")).ok, true);

    // O segundo store precisa CARREGAR do arquivo — e o `load` valida linha a
    // linha contra o schema, entao ele so devolve o que o contrato aceita.
    const leitor = createStore({ dir });
    leitor.load("copilot_recommendations");
    const todos = leitor.all("copilot_recommendations");
    assert.equal(todos.length, 2, "a recuperacao perdeu registro");
    const nao = todos.find((r) => r["recommendation_id"] === "rec-nao")!;
    assert.deepEqual(deConfiancaDuravel(nao), { tipo: "ok", confianca: NAO_ESTIMADA });
    assert.equal(nao["confidence"], undefined, "a recuperacao inventou numero");
    const apu = todos.find((r) => r["recommendation_id"] === "rec-apu")!;
    assert.deepEqual(deConfiancaDuravel(apu), { tipo: "ok", confianca: APURADA });
    assert.deepEqual(leitor.health().invalid_lines ?? [], [], "a recuperacao recusou linha valida");
  });
});

/* ================================================================== *
 * 6-7 · APURADA EXIGE LASTRO NO DISCO                                 *
 * ================================================================== */

teste("S06 confianca apurada SEM POLITICA e recusada pelo store", () => {
  comStore((dir) => {
    const store = createStore({ dir });
    const base = registro(APURADA);
    const semPolitica = {
      ...base,
      recommendation_id: "x1",
      confianca: { ...(base["confianca"] as object), politica: "" },
    };
    const r = store.put("copilot_recommendations", semPolitica);
    assert.equal(r.ok, false, "o store gravou apurada sem politica");
    assert.ok(erros(r).includes("confianca_apurada_sem_politica"), erros(r).join(", "));
    const semVersao = {
      ...base,
      recommendation_id: "x2",
      confianca: { ...(base["confianca"] as object), versao_da_politica: "" },
    };
    assert.ok(
      erros(store.put("copilot_recommendations", semVersao)).includes(
        "confianca_apurada_sem_versao_de_politica",
      ),
    );
  });
});

teste("S07 confianca apurada SEM EVIDENCIAS e recusada pelo store", () => {
  comStore((dir) => {
    const store = createStore({ dir });
    const base = registro(APURADA);
    const r = store.put("copilot_recommendations", {
      ...base,
      recommendation_id: "x3",
      confianca: { ...(base["confianca"] as object), evidencias: [] },
    });
    assert.equal(r.ok, false, "o store gravou apurada sem evidencias");
    assert.ok(erros(r).includes("confianca_apurada_sem_evidencias"), erros(r).join(", "));
  });
});

/* ================================================================== *
 * 8 · LEGADO                                                          *
 * ================================================================== */

teste("S08 registro legado NAO e promovido silenciosamente", () => {
  // Um numero gravado antes desta missao: sem uniao, sem schema, sem politica e
  // sem as evidencias que sustentariam a apuracao.
  const legado = { confidence: 0.9 };
  const leitura = deConfiancaDuravel(legado);
  assert.equal(leitura.tipo, "legado", "o legado foi promovido");
  assert.equal(leitura.tipo === "legado" && leitura.valor, 0.9);
  // E `legado` nao e nenhum dos dois estados do dominio.
  assert.notEqual(leitura.tipo, "ok");
  assert.equal("confianca" in leitura, false, "o legado virou confianca de dominio");
  // O store tambem nao aceita o registro antigo em silencio: ele recusa com
  // motivo, e a recusa e o que faz alguem decidir a migracao em vez de herdar.
  comStore((dir) => {
    const store = createStore({ dir });
    const base = registro(APURADA);
    const antigo = { ...base, recommendation_id: "x4" } as Record<string, unknown>;
    delete antigo["confianca_schema"];
    delete antigo["confianca"];
    antigo["confidence"] = 0.9;
    const r = store.put("copilot_recommendations", antigo);
    assert.equal(r.ok, false, "o store aceitou registro legado como se fosse novo");
    assert.ok(
      erros(r).some((e) => e.startsWith("confianca_schema_desconhecido")),
      erros(r).join(", "),
    );
  });
});

/* ================================================================== *
 * 9 · SCHEMA E DOMINIO CONCORDAM                                      *
 * ================================================================== */

teste("S09 schema e dominio concordam sobre os dois estados", () => {
  const schemas = ler("src/conference-brain/contracts/schemas.js");
  // O schema conhece exatamente os dois estados do dominio, e recusa o resto.
  assert.match(schemas, /c\.estado === "nao_estimada"/);
  assert.match(schemas, /c\.estado === "apurada"/);
  assert.match(schemas, /confianca_estado_desconhecido/);
  // `confidence` saiu de required — a ausencia dele e legitima.
  const bloco = /copilot_recommendations: \{[\s\S]*?\n  \}/.exec(schemas)![0];
  const required = /required: \[([\s\S]*?)\]/.exec(bloco)![1]!;
  assert.doesNotMatch(required, /"confidence"/, "`confidence` voltou a ser obrigatorio");
  assert.match(required, /"confianca_schema"/);
  assert.match(required, /"confianca"/);
  // E os dois estados do dominio produzem registro que o store aceita.
  comStore((dir) => {
    const store = createStore({ dir });
    for (const c of [NAO_ESTIMADA, APURADA]) {
      const r = store.put("copilot_recommendations", registro(c));
      assert.equal(r.ok, true, `o store recusou ${c.estado}: ${erros(r).join(", ")}`);
    }
  });
});

/* ================================================================== *
 * 10-12 · PREFLIGHT E FRONTEIRAS                                      *
 * ================================================================== */

teste("S10 o preflight fecha SOMENTE a compatibilidade duravel", () => {
  assert.equal(CONFIANCA_DURAVEL_COMPATIVEL, true, "a compatibilidade duravel nao foi fechada");
  // Com linhagem e confianca em ordem, o unico bloqueio que restaria seria o
  // duravel — e ele nao esta mais na lista.
  const p = avaliarProntidaoR5D({
    linhagem: { elegivel: true, input_event_ids: ["evt-aaa"] },
    confianca: { suportada: true, valor: null },
    validador_compartilhado: true,
    produtor_vivo_disponivel: true,
    pedido_qualificado: true,
    trabalho_praca_qualificado: true,
    capacidade_qualificada: true,
    caminho_de_leitura_seguro: true,
  });
  assert.equal(p.status, "ready", p.status === "blocked" ? JSON.stringify(p.bloqueios) : "");
  assert.equal(p.status === "ready" && p.durable_confidence_compatibility, "compatible");
});

teste("S11 event lineage continua BLOQUEADA — nada aqui a destravou", () => {
  // O caminho real segue sem produtor: a prontidao com a linhagem indisponivel
  // bloqueia, e o motivo continua sendo o de sempre.
  const p = avaliarProntidaoR5D({
    linhagem: { elegivel: false, motivo: "event_lineage_unavailable" },
    confianca: { suportada: true, valor: null },
    validador_compartilhado: true,
    produtor_vivo_disponivel: true,
    pedido_qualificado: true,
    trabalho_praca_qualificado: true,
    capacidade_qualificada: true,
    caminho_de_leitura_seguro: true,
  });
  assert.equal(p.status, "blocked");
  assert.deepEqual(
    p.status === "blocked" && p.bloqueios.map((b) => b.motivo),
    ["event_lineage_unavailable"],
    "sobrou bloqueio alem da linhagem",
  );
  // E o unico produtor de leitura continua sendo a fixture.
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
  assert.deepEqual(produtores, ["src/product/demo/seed-home-demonstracao.ts"]);
});

teste("S12 nenhum runtime, produtor ou flag nasceu nesta missao", () => {
  const fonte = ler("src/platform/copiloto/confianca-duravel.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const imports = [...fonte.matchAll(/(?:import[^;]*from|require\()\s*["'`]([^"'`]+)["'`]/g)].map(
    (m) => m[1]!,
  );
  assert.deepEqual(imports, ["./shadow"], `a confianca duravel ganhou dependencia: ${imports}`);
  for (const efeito of [/FEATURE_/, /FLAG_/, /\bput\s*\(/, /\bemit\s*\(/, /Date\.now\s*\(/, /randomUUID/]) {
    assert.doesNotMatch(fonte, efeito, `a confianca duravel ganhou ${efeito}`);
  }
  // Congelamento: sinais, politica temporal, home, CSS, motion, Figma e motor.
  const saida = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "2af52e1",
      FIM_HISTORICO,
      "--",
      "src/product/viewmodels/",
      "src/product/atencao/politica-temporal.ts",
      "src/product/atencao/linhagem-eventos.ts",
      "src/product/ui/",
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
  console.log(`\nR5-D0-S — compatibilidade duravel da confianca: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("R5D0_STORAGE_GATE_GREEN");
});
