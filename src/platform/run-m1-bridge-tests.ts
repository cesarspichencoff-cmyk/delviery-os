/**
 * GUARDA DA PONTE M1A.1 — canone, sucessao, congelamento e magnitude.
 * ============================================================================
 * Esta guarda NAO implementa M1B. Ela fecha as incompatibilidades canonicas e
 * estruturais que M1A encontrou, e falha quando alguma delas volta a se abrir.
 *
 * Cinco famílias de asercao, cada uma com controle positivo:
 *
 *   A. SUPERFICIE ALVO   — Home `/` e a experiencia aprovada; `/copiloto` e Shadow.
 *   B. SUCESSAO VISUAL   — quem e ancestral, quem e atual, quem e historico.
 *   C. CONGELAMENTO      — a prova historica protege o passado sem congelar o futuro.
 *   D. MAGNITUDE         — `carga_por_praca` medido na fonte, nunca no rotulo visual.
 *   E. DISCIPLINA        — skill lida inteira, capacidade Figma provada, sem
 *                          dependencia nova, sem autocertificacao.
 *
 * POR QUE ELA EXISTE SEPARADA DOS GATES R5. Os dez gates R5 sao prova HISTORICA
 * de missoes fechadas. Reescreve-los aqui apagaria a evidencia que eles sao. Esta
 * guarda acrescenta a representacao que faltava — intervalo fechado + envelope —
 * sem tocar naquilo que ja foi provado.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { projetarLeitura, type LeituraProjetada } from "../product/eventos/projetar-leitura";
import { VERSOES_SUPORTADAS } from "../product/eventos/catalogo-operacional";
import { AMBIENTES } from "../product/viewmodels/areas";
import type { PracaId } from "../product/viewmodels/areas";
import type { LeituraOperacional } from "../product/viewmodels/sinais";
import { homeVM, type OrigemDaLeitura } from "../product/viewmodels/home-vm";

/** A home exige origem declarada. Fixture se identifica como fixture (I9). */
const ORIGEM_DEMO: OrigemDaLeitura = {
  tipo: "demonstracao",
  motivo: "fixture da ponte M1A.1 — nenhuma fonte viva",
};

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: raiz, encoding: "utf8" }).trim();

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
 * Artefatos canonicos desta ponte                                     *
 * ------------------------------------------------------------------ */

const SUCESSAO = "docs/design/M1_CANONICAL_SUCCESSION.md";
const ENVELOPE = "docs/design/M1_VISUAL_CHANGE_ENVELOPE.md";
const GRAMATICA = "docs/design/M1_MOTION_GRAMMAR.md";
const HIERARQUIA = "docs/design/VISUAL_REFERENCE_HIERARCHY.md";
const MANIFESTO = "docs/design/CANONICAL_VISUAL_MANIFEST.json";

/**
 * O ZIP canonico e imutavel e o manifesto declara o hash dele. O extract em
 * `extracted/` precisa continuar sendo o extract DESSE zip — nao de uma variante
 * de pacote parecida. Comparacao por conteudo normalizado de fim de linha,
 * porque o checkout no Windows reescreve CRLF e isso nao e divergencia semantica.
 */
const ORGANISMO_EXTRACT =
  "docs/design/canonical/deliveryos-visual-v2/extracted/DeliveryOS Organismo Operacional.dc.html";
/** Hash do conteudo (LF) registrado em `extract_hashes.txt` na entrada do acervo. */
const ORGANISMO_LF_SHA = "434294036f86ff6976b48fb3ec4b58d5c4cecefe272feea181e9a167e7b19fbc";

const semCR = (s: string): string => s.split("\r\n").join("\n");

/* ================================================================== *
 * A. SUPERFICIE ALVO                                                  *
 * ================================================================== */

teste("A1 a Home `/` esta declarada como a experiencia aprovada de M1", () => {
  const s = ler(SUCESSAO);
  assert.match(
    s,
    /M1_TARGET_SURFACE\s*=\s*`?\/`?\s*\(Home\)/,
    `${SUCESSAO} nao declara M1_TARGET_SURFACE = / (Home)`,
  );
});

teste("A2 `/copiloto` continua declarada Shadow, e nao a experiencia aprovada", () => {
  const s = ler(SUCESSAO);
  assert.match(s, /M1_SHADOW_SURFACE\s*=\s*`?\/copiloto`?/, "a rota Shadow nao esta declarada");
  // A confusao que M1A encontrou: tratar `/copiloto` como a superficie aprovada.
  assert.doesNotMatch(
    s,
    /M1_TARGET_SURFACE\s*=\s*`?\/copiloto/,
    "M-A: `/copiloto` foi promovida a superficie alvo de M1",
  );
});

teste("A3 o runtime concorda: `/copiloto` e modulo shadow, `/` e a home", () => {
  // A canonizacao nao pode divergir do que o codigo declara. Se alguem trocar o
  // papel no runtime, o documento acima vira mentira e este teste acusa.
  const modulos = ler("src/product/viewmodels/modulos.ts");
  const bloco = modulos.split('id: "copiloto"')[1] ?? "";
  assert.match(bloco.slice(0, 400), /rota: "\/copiloto"/, "o modulo copiloto perdeu a rota");
  assert.match(bloco.slice(0, 400), /estado: "shadow"/, "o modulo copiloto deixou de ser shadow");
  const app = ler("src/product/ui/app.js");
  assert.match(app, /"\/": \{ api: "\/api\/home"/, "a rota `/` deixou de ser a home operacional");
});

teste("A4 controle positivo: um texto sem a declaracao de alvo reprova", () => {
  const falso = "# sucessao\n\nM1_SHADOW_SURFACE = `/copiloto`\n";
  assert.equal(/M1_TARGET_SURFACE\s*=\s*`?\/`?\s*\(Home\)/.test(falso), false);
});

/* ================================================================== *
 * B. SUCESSAO VISUAL                                                  *
 * ================================================================== */

/** Uma linha da tabela de sucessao, com os campos que a missao exige. */
const CAMPOS_SUCESSAO = [
  "ARTIFACT",
  "STATUS",
  "SUPERSEDES",
  "SUPERSEDED_BY",
  "WHAT_REMAINS_VALID",
  "WHAT_NO_LONGER_GOVERNS",
  "APPROVAL_PROVENANCE",
] as const;

teste("B1 a tabela de sucessao carrega todos os campos obrigatorios", () => {
  const s = ler(SUCESSAO);
  for (const c of CAMPOS_SUCESSAO) {
    assert.ok(s.includes(c), `a sucessao nao declara o campo ${c}`);
  }
});

teste("B2 o Sprint Visual V2 continua ancestral ativo, nunca rebaixado a historico", () => {
  const s = ler(SUCESSAO);
  const linha = s.split("\n").find((l) => l.includes("Sprint Visual DeliveryOS V2") && l.includes("|"));
  assert.ok(linha, "a sucessao perdeu a linha do Sprint Visual V2");
  assert.match(linha, /ACTIVE_ANCESTOR/, "o Sprint V2 deixou de ser ACTIVE_ANCESTOR");
});

teste("B3 M-D: promover o pacote novo a autoridade total exige inspecao registrada", () => {
  const s = ler(SUCESSAO);
  // O pacote novo so pode governar se a sucessao nomear o que ele supera E o que
  // ele NAO supera. Promocao cega e uma tabela que diz apenas "novo, entao manda".
  assert.match(s, /PACKAGE_SHA256\s*=\s*[0-9a-f]{64}/, "o pacote entrou sem hash de inspecao");
  assert.match(
    s,
    /INSPECTED_ARTIFACTS\s*=\s*\d+/,
    "a sucessao nao registra quantos artefatos foram realmente inspecionados",
  );
  assert.ok(
    s.includes("NOT_INSPECTED"),
    "nenhum artefato foi marcado NOT_INSPECTED — inspecao total e afirmacao suspeita",
  );
});

teste("B4 M-E: o V3.3 do repositorio continua o extract do ZIP imutavel", () => {
  // Escolher variante por hash mais novo ou por nome de arquivo e exatamente a
  // mutacao M-E. A ancora e o ZIP registrado no manifesto, nao a recencia.
  const conteudo = semCR(ler(ORGANISMO_EXTRACT));
  assert.equal(
    sha(conteudo),
    ORGANISMO_LF_SHA,
    "o extract do V3.3 deixou de ser o extract do ZIP canonico imutavel",
  );
  const m = JSON.parse(ler(MANIFESTO)) as { immutable_original: boolean; archive_sha256: string };
  assert.equal(m.immutable_original, true, "o manifesto deixou de declarar o original imutavel");
  const zip = readFileSync(
    join(raiz, "docs/design/canonical/deliveryos-visual-v2/Sprint Visual DeliveryOS V2 (1).zip"),
  );
  assert.equal(
    createHash("sha256").update(zip).digest("hex"),
    m.archive_sha256.toLowerCase(),
    "o ZIP canonico divergiu do hash declarado no manifesto",
  );
});

teste("B5 a divergencia do V3.3 esta explicada, nao resolvida em silencio", () => {
  const s = ler(SUCESSAO);
  assert.match(s, /V33_VERDICT\s*=\s*[A-Z_]+/, "a sucessao nao emite veredito sobre o V3.3");
  assert.ok(
    s.includes("A mesma superfície em onze cenários") &&
      s.includes("A mesma superfície, cenário a cenário"),
    "a diferenca textual exata do V3.3 nao esta registrada",
  );
});

teste("B6 controle positivo: uma tabela sem SUPERSEDED_BY reprova", () => {
  const falso = "| ARTIFACT | STATUS | SUPERSEDES |\n";
  assert.equal(CAMPOS_SUCESSAO.every((c) => falso.includes(c)), false);
});

/* ================================================================== *
 * C. CONGELAMENTO — passado protegido, futuro possivel                *
 * ================================================================== */

/**
 * Os DEZ gates de congelamento, lidos da PROPRIA FONTE.
 *
 * Nada aqui e transcrito a mao. Se um gate mudar de baseline, de fim ou de
 * pathspec, esta familia le a mudanca e continua afirmando sobre o que o gate
 * realmente faz — em vez de sobre uma copia que envelhece em silencio.
 */
const GATES_CONGELAMENTO = [
  "run-r5a-temporal-tests.ts",
  "run-r5b-invariant-tests.ts",
  "run-r5c-translation-tests.ts",
  "run-r5d0-readiness-tests.ts",
  "run-r5d0-confidence-tests.ts",
  "run-r5d0-lineage-tests.ts",
  "run-r5d0-storage-tests.ts",
  "run-r5d1-event-lineage-tests.ts",
  "run-r5d2-producer-qualification-tests.ts",
  "run-r5d3-shadow-path-tests.ts",
] as const;

/** Baseline de M1: fim do intervalo historico certificado (D-M1A1-10). */
const M1_BASELINE = "f87a36dfd39c9989344f0fed6ebf8db5db1a8c35";
/**
 * Primeiro commit do repositorio. Serve de intervalo SABIDAMENTE adulterado:
 * entre ele e o baseline, todos os caminhos protegidos mudaram. E o controle
 * antifalso-positivo de cada gate — sem ele, um pathspec que nao casa com nada
 * produziria diff vazio e passaria por prova.
 */
const RAIZ_HISTORICA = "fcfc21db8fa7e505e4d7879a1c2b103ef7b33c17";

interface GateCongelado {
  readonly arquivo: string;
  readonly base: string;
  readonly caminhos: readonly string[];
}

/** Extrai baseline e pathspec do codigo do gate, sem executa-lo. */
function lerGate(arquivo: string): GateCongelado {
  // R9 do gate de evidencia: comentario nao e codigo. Os pathspecs sao lidos de
  // uma fonte SEM comentarios — um caminho citado dentro de `//` ja entrou por
  // engano em varredura estatica nesta base antes.
  const fonte = ler(`src/platform/${arquivo}`)
    .split("\n")
    .map((l) => l.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");
  const chamada =
    /"diff",\s*"--name-only",\s*([A-Z_]+|"[0-9a-f]{7}"),\s*FIM_HISTORICO,\s*"--",([\s\S]*?)\]/.exec(
      fonte,
    );
  assert.ok(chamada, `${arquivo}: nao achei a chamada de diff em forma FECHADA`);

  /** Resolve `NOME` para o literal declarado com `const NOME = "..."`. */
  const literalDe = (nome: string, padrao: string): RegExpExecArray => {
    const r = new RegExp(`const ${nome}\\s*=\\s*${padrao}`).exec(fonte);
    assert.ok(r, `${arquivo}: constante ${nome} sem declaracao`);
    return r;
  };

  let base = chamada[1]!;
  base = base.startsWith('"')
    ? base.slice(1, -1)
    : literalDe(base, '"([0-9a-f]{7,40})"')[1]!;

  // Pathspec inline, ou espalhado de uma constante (`...CONGELADOS`).
  let bruto = chamada[2]!;
  const espalha = /\.\.\.([A-Z_]+)/.exec(bruto);
  if (espalha) bruto = literalDe(espalha[1]!, "\\[([\\s\\S]*?)\\]")[1]!;
  const caminhos = [...bruto.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  assert.ok(caminhos.length > 0, `${arquivo}: pathspec vazio`);
  return { arquivo, base, caminhos };
}

const GATES = GATES_CONGELAMENTO.map(lerGate);

teste("C1 os dez gates existem e usam INTERVALO FECHADO", () => {
  assert.equal(GATES.length, 10, "o inventario de gates de congelamento mudou de tamanho");
  for (const g of GATES) {
    const fonte = ler(`src/platform/${g.arquivo}`);
    assert.ok(
      fonte.includes(`const FIM_HISTORICO = "${M1_BASELINE}"`),
      `${g.arquivo}: o fim historico nao e o baseline de M1`,
    );
    // A forma ABERTA nao pode voltar: `"<sha>", "--"` sem o fim no meio.
    assert.doesNotMatch(
      fonte,
      /"--name-only",\s*(?:[A-Z_]+|"[0-9a-f]{7}"),\s*"--"/,
      `${g.arquivo}: voltou a forma aberta, que congela o futuro`,
    );
  }
});

teste("C2 cada baseline continua sendo o original, e ancestral do fim", () => {
  // D-M1A1-10: preservar cada baseline. Reancorar historia e proibido.
  const ORIGINAIS: Readonly<Record<string, string>> = {
    "run-r5a-temporal-tests.ts": "4365c61",
    "run-r5b-invariant-tests.ts": "bd1ad55",
    "run-r5c-translation-tests.ts": "ad3b1bc",
    "run-r5d0-readiness-tests.ts": "27ccfd2",
    "run-r5d0-confidence-tests.ts": "b100943",
    "run-r5d0-lineage-tests.ts": "ced38da",
    "run-r5d0-storage-tests.ts": "2af52e1",
    "run-r5d1-event-lineage-tests.ts": "73f2f0b",
    "run-r5d2-producer-qualification-tests.ts": "f1fe480",
    "run-r5d3-shadow-path-tests.ts": "1a35ebe",
  };
  for (const g of GATES) {
    assert.equal(g.base, ORIGINAIS[g.arquivo], `${g.arquivo}: o baseline historico foi reancorado`);
    // E precisa estar mesmo nesta linha da historia, antes do fim.
    const merge = git("merge-base", "--is-ancestor", g.base, M1_BASELINE);
    assert.equal(merge, "", `${g.arquivo}: ${g.base} nao e ancestral do fim certificado`);
  }
});

teste("C3 o intervalo historico de cada gate continua com diff vazio", () => {
  for (const g of GATES) {
    const saida = git("diff", "--name-only", g.base, M1_BASELINE, "--", ...g.caminhos);
    assert.equal(saida, "", `${g.arquivo}: o intervalo historico foi adulterado:\n${saida}`);
  }
});

teste("C4 CONTROLE: cada gate acusa um intervalo sabidamente adulterado", () => {
  // Remova a garantia e exija a falha. Se este teste ficar verde com o pathspec
  // quebrado, o vazio de C3 nao prova nada.
  for (const g of GATES) {
    const saida = git("diff", "--name-only", RAIZ_HISTORICA, M1_BASELINE, "--", ...g.caminhos);
    assert.notEqual(
      saida,
      "",
      `${g.arquivo}: a asercao nao acusa nem um intervalo que mudou os caminhos`,
    );
  }
});

teste("C5 o envelope M1 declara baseline, caminhos e estado de aprovacao", () => {
  const e = ler(ENVELOPE);
  for (const campo of [
    "BASELINE",
    "AUTHORIZED_PATHS",
    "AUTHORIZED_CHANGE_CLASSES",
    "FORBIDDEN_PATHS",
    "FORBIDDEN_CHANGE_CLASSES",
    "INVARIANTS",
    "REQUIRED_TESTS",
    "ROLLBACK",
    "HUMAN_APPROVAL_STATE",
  ]) {
    assert.ok(e.includes(campo), `o envelope M1 nao declara ${campo}`);
  }
  assert.ok(e.includes(M1_BASELINE), "o envelope nao ancora no baseline real desta worktree");
});

teste("C6 a metade do FUTURO: mudanca pos-baseline so passa dentro do envelope", () => {
  // A afirmacao que os gates deixaram de fazer, agora feita UMA vez e no lugar
  // certo. Uniao de todos os caminhos protegidos, comparada com HEAD.
  const todos = [...new Set(GATES.flatMap((g) => g.caminhos))];
  const mudou = git("diff", "--name-only", M1_BASELINE, "--", ...todos)
    .split("\n")
    .filter((l) => l !== "");
  const envelope = ler(ENVELOPE);
  const foraDoEnvelope = mudou.filter((p) => !envelope.includes(p));
  assert.deepEqual(
    foraDoEnvelope,
    [],
    `caminho protegido mudou depois do baseline sem estar no envelope:\n${foraDoEnvelope.join("\n")}`,
  );
});

teste("C7 o envelope inventaria os dez gates com o baseline que eles usam", () => {
  const e = ler(ENVELOPE);
  for (const g of GATES) {
    assert.ok(e.includes(g.arquivo), `o envelope nao inventaria o gate ${g.arquivo}`);
    assert.ok(e.includes(g.base), `o envelope nao registra o baseline ${g.base}`);
  }
});

teste("C8 controle positivo: um envelope sem HUMAN_APPROVAL_STATE reprova", () => {
  const falso = "BASELINE: x\nAUTHORIZED_PATHS: y\n";
  assert.equal(falso.includes("HUMAN_APPROVAL_STATE"), false);
});

/* ================================================================== *
 * D. MAGNITUDE — `carga_por_praca`                                    *
 * ================================================================== */

const TENANT = "tata";
const UNIDADE = "demo-unit";
const AGORA = "2026-08-04T19:00:00.000Z";
const OPC = { agora_iso: AGORA, tenant_id: TENANT, unit_id: UNIDADE };

let seq = 0;
const env = (
  tipo: "pedido_ciclo_observado" | "trabalho_praca_observado",
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  seq += 1;
  const t = `2026-08-04T18:${String(10 + (seq % 40)).padStart(2, "0")}:00.000Z`;
  return {
    event_id: `m1-${String(seq).padStart(4, "0")}`,
    event_type: tipo,
    event_version: VERSOES_SUPORTADAS[tipo],
    tenant_id: TENANT,
    unit_id: UNIDADE,
    source: "registro-operacao",
    source_event_id: `m1src-${String(seq).padStart(4, "0")}`,
    occurred_at: t,
    observed_at: t,
    ingested_at: AGORA,
    correlation_id: `m1cor-${String(seq).padStart(4, "0")}`,
    payload,
  };
};

/** Grava no ledger real e projeta — o mesmo caminho que o R5-D1 exercita. */
function projetar(eventos: readonly unknown[]): LeituraProjetada {
  const dir = mkdtempSync(join(tmpdir(), "m1-"));
  const arquivo = join(dir, "ledger.jsonl");
  try {
    appendFileSync(arquivo, "");
    for (const e of eventos) appendFileSync(arquivo, JSON.stringify(e) + "\n");
    const linhas: unknown[] = [];
    for (const l of readFileSync(arquivo, "utf8").split("\n")) {
      if (l.trim() !== "") linhas.push(JSON.parse(l));
    }
    return projetarLeitura(linhas, OPC);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cargaDe = (l: LeituraProjetada, p: PracaId): number =>
  l.carga_por_praca.find((c) => c.praca_id === p)?.abertos ?? 0;

/** UM pedido com CINCO itens, registrados como cinco trabalhos distintos. */
const CINCO_TRABALHOS = [
  env("pedido_ciclo_observado", { pedido_id: "P-1", estado: "aceito", source_revision: 1 }),
  ...[1, 2, 3, 4, 5].map((i) =>
    env("trabalho_praca_observado", {
      trabalho_id: `w:demo-unit:enrolados:P-1:item-${i}`,
      pedido_id: "P-1",
      praca_id: "enrolados",
      referencia: `item-${i}`,
      quantidade: 1,
      estado: "aguardando",
      source_revision: 1,
    }),
  ),
];

/** UM pedido com CINCO itens, registrados como UM trabalho com quantidade 5. */
const UM_TRABALHO_QTD5 = [
  env("pedido_ciclo_observado", { pedido_id: "P-2", estado: "aceito", source_revision: 1 }),
  env("trabalho_praca_observado", {
    trabalho_id: "w:demo-unit:enrolados:P-2:grupo-unico",
    pedido_id: "P-2",
    praca_id: "enrolados",
    referencia: "grupo-unico",
    quantidade: 5,
    estado: "aguardando",
    source_revision: 1,
  }),
];

teste("D1 EXPERIMENTO 1 pedido / 5 itens — cinco trabalhos viram carga 5", () => {
  const l = projetar(CINCO_TRABALHOS);
  assert.equal(cargaDe(l, "enrolados"), 5, "cinco trabalhos abertos deveriam somar carga 5");
  assert.equal(l.pedidos_ativos.length, 1, "continua sendo UM pedido");
});

teste("D2 EXPERIMENTO 1 pedido / 5 itens — um trabalho com quantidade 5 vira carga 1", () => {
  const l = projetar(UM_TRABALHO_QTD5);
  assert.equal(
    cargaDe(l, "enrolados"),
    1,
    "o projetor conta REGISTROS de trabalho; `quantidade` nao multiplica",
  );
});

teste("D3 a magnitude e decidida pelo PRODUTOR, nao pelo projetor nem pelo desenho", () => {
  // A prova negativa das duas anteriores: a mesma realidade operacional — um
  // pedido com cinco itens — produz 5 ou 1 conforme o granulo do registro. Logo
  // a unidade NAO esta definida no runtime; ela esta em aberto na fonte.
  const cinco = cargaDe(projetar(CINCO_TRABALHOS), "enrolados");
  const um = cargaDe(projetar(UM_TRABALHO_QTD5), "enrolados");
  assert.notEqual(cinco, um, "as duas granularidades convergiram — a experiencia perdeu o sentido");
});

teste("D4 M-F: o veredito de unidade vem da linhagem, nunca do rotulo visual", () => {
  const s = ler(SUCESSAO);
  assert.match(
    s,
    /CARGA_UNIT_VERDICT\s*=\s*(PROVEN_ORDERS|PROVEN_ITEMS|PROVEN_WEIGHTED_LOAD|PROVEN_OTHER|CALIBRATED_DERIVED_VALUE|CALIBRATION_PENDING|UNKNOWN)/,
    "a sucessao nao emite veredito de unidade para carga_por_praca",
  );
  // Fabricar a unidade a partir do rotulo do desenho e a mutacao M-F. O veredito
  // so pode ser PROVEN_ITEMS se o projetor usar `quantidade`, e ele nao usa.
  const projetor = ler("src/product/eventos/projetar-leitura.ts");
  const usaQuantidade = /abertos:\s*[^,\n]*quantidade/.test(projetor);
  if (/CARGA_UNIT_VERDICT\s*=\s*PROVEN_ITEMS/.test(s)) {
    assert.ok(usaQuantidade, "M-F: o canone afirma ITENS, e o projetor nao le `quantidade`");
  }
});

teste("D5 o contrato de area nao foi mudado para caber na linguagem visual", () => {
  // O pacote visual diz "Caixa e Motoboy medem pedidos". O dominio diz que a
  // Caixa nao tem medicao automatica nenhuma. A divergencia e legitima e fica
  // registrada; o que nao pode e o dominio ceder em silencio.
  const caixa = AMBIENTES.find((a) => a.id === "caixa");
  assert.ok(caixa, "o ambiente caixa sumiu");
  assert.equal(
    caixa.medicao,
    "sem_medicao_automatica",
    "a Caixa ganhou medicao automatica sem decisao de dominio registrada",
  );
  const s = ler(SUCESSAO);
  assert.ok(
    s.includes("CARGA_DOMAIN_DIVERGENCE"),
    "a divergencia entre o pacote visual e o dominio nao esta registrada",
  );
});

teste("D6 a cadeia sinal -> view model preserva a unidade sem inventar numero", () => {
  const l: LeituraOperacional = {
    procedencia: "simulado",
    observado_em: AGORA,
    pedidos: [],
    carga_por_praca: { enrolados: 5 },
    baseline_por_praca: { enrolados: 3 },
    chegadas_na_hora: null,
    chegadas_normais: null,
    fontes: [
      {
        id: "registro-operacao",
        rotulo: "Registro da bancada",
        estado: "saudavel",
        detalhe: "fixture",
        ambientes: ["sushi"],
      },
    ],
  };
  const vm = homeVM(l, ORIGEM_DEMO);
  const sushi = vm.ambientes.find((a) => a.id === "sushi");
  assert.ok(sushi, "o ambiente sushi sumiu do view model");
  const sub = sushi.subareas.find((x) => x.id === "enrolados");
  assert.ok(sub, "a subarea enrolados sumiu");
  // 5 sobre baseline 3, na escala do produto: round(5/3*50) = 83.
  assert.equal(sub.pressao.observado, true, "carga observada com baseline deveria virar pressao");
  assert.equal(sub.pressao.observado ? sub.pressao.valor : -1, 83);
});

teste("D7 sem baseline a carga NAO vira pressao — ausencia nunca vira zero", () => {
  const l: LeituraOperacional = {
    procedencia: "simulado",
    observado_em: AGORA,
    pedidos: [],
    carga_por_praca: { enrolados: 5 },
    baseline_por_praca: {},
    chegadas_na_hora: null,
    chegadas_normais: null,
    fontes: [],
  };
  const vm = homeVM(l, ORIGEM_DEMO);
  const sub = vm.ambientes
    .find((a) => a.id === "sushi")
    ?.subareas.find((x) => x.id === "enrolados");
  assert.ok(sub, "a subarea enrolados sumiu");
  assert.equal(sub.pressao.observado, false, "carga sem baseline virou numero");
});

/* ================================================================== *
 * E. DISCIPLINA                                                       *
 * ================================================================== */

const SKILLS = [
  "deliveryos-adversarial-review",
  "deliveryos-architecture-guardrails",
  "deliveryos-evidence-gate",
  "deliveryos-execution-loop",
  "deliveryos-figma-code-sync",
  "deliveryos-release-readiness",
  "tata-product-system",
] as const;

teste("E1 M-J: skill marcada INSPECTED prova leitura inteira, nao frontmatter", () => {
  const s = ler(SUCESSAO);
  for (const nome of SKILLS) {
    const caminho = `.claude/skills/${nome}/SKILL.md`;
    assert.ok(existsSync(join(raiz, caminho)), `${caminho} nao existe`);
    const corpo = ler(caminho);
    // Contagem no mesmo criterio de `wc -l`: linhas terminadas, sem contar o
    // vazio depois do ultimo `\n`.
    const linhas = corpo.split("\n").length - (corpo.endsWith("\n") ? 1 : 0);
    // A prova de leitura e a contagem de linhas do arquivo INTEIRO. Quem leu so
    // o frontmatter nao consegue escrever esse numero.
    assert.ok(
      s.includes(`${nome}`) && s.includes(`${linhas} linhas`),
      `M-J: ${nome} esta marcada como lida sem a contagem de linhas do arquivo inteiro (${linhas})`,
    );
  }
});

teste("E2 M-K: escrita no Figma so pode ser VERIFIED com probe executado", () => {
  const s = ler(SUCESSAO);
  const m = /FIGMA_WRITE_CAPABILITY\s*=\s*(VERIFIED|NOT_EXPOSED|UNKNOWN|NOT_PROVEN)/.exec(s);
  assert.ok(m, "a matriz Figma nao declara a capacidade de escrita em termos verificaveis");
  // A mutacao M-K nao e escrever a palavra errada: e AFIRMAR capacidade sem ter
  // medido. A primeira versao desta guarda aceitava `VERIFIED` como valor
  // legitimo e ficou verde na mutacao — ela media vocabulario, nao evidencia.
  if (m[1] === "VERIFIED") {
    const probe = /CREATE_RESULT\s*=\s*(\S+)/.exec(s);
    assert.ok(probe, "M-K: escrita declarada VERIFIED sem registro de probe");
    assert.notEqual(
      probe[1],
      "NOT_RUN",
      "M-K: escrita declarada VERIFIED com o probe registrado como NOT_RUN",
    );
    assert.match(s, /DELETE_RESULT\s*=\s*(?!NOT_RUN)\S+/, "M-K: probe sem prova de remocao");
    assert.match(s, /RESIDUE_CHECK/, "M-K: probe sem verificacao de residuo");
  }
  // E o assento nunca e a base do veredito, em nenhuma direcao.
  assert.doesNotMatch(
    s,
    /FIGMA_WRITE_CAPABILITY\s*=\s*\w+\s*\(?(por assento|pelo assento|seat implies)/i,
    "M-K: a capacidade de escrita foi inferida do assento",
  );
});

teste("E3 M-M: nenhuma biblioteca de design ou motion foi instalada", () => {
  const pkg = JSON.parse(ler("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const todas = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const proibida of [
    "gsap",
    "originkit",
    "framer-motion",
    "motion",
    "animejs",
    "lottie",
    "hallmark",
    "@gsap/react",
  ]) {
    assert.ok(
      !todas.includes(proibida),
      `M-M: a dependencia ${proibida} entrou sem necessidade provada`,
    );
  }
});

teste("E4 M-H: existe exatamente UMA autoridade de movimento ativa", () => {
  const g = ler(GRAMATICA);
  assert.match(g, /MOTION_AUTHORITY_ACTIVE\s*=\s*\S+/, "a gramatica nao nomeia a autoridade ativa");
  const ativas = [...g.matchAll(/MOTION_AUTHORITY_ACTIVE\s*=\s*(\S+)/g)].map((m) => m[1]);
  assert.equal(ativas.length, 1, `M-H: ${ativas.length} autoridades de movimento ativas`);
  // O canone antigo continua existindo — como historico ligado, nunca apagado.
  assert.ok(
    g.includes("docs/figma/MOTION_SYSTEM.md"),
    "a gramatica nova nao diz o que acontece com o MOTION_SYSTEM antigo",
  );
  assert.match(
    g,
    /STILL_VALID_LAW|SUPERSEDED_EXPRESSION|NEEDS_RECONCILIATION/,
    "as leis antigas nao foram classificadas",
  );
});

teste("E5 M-I: porcentagem de demonstracao nao virou constante de runtime", () => {
  const g = ler(GRAMATICA);
  assert.ok(
    /^CALIBRATION_PENDING\s*=\s*\S+/m.test(g),
    // A DECLARACAO, nao a palavra solta. A primeira versao aceitava a ocorrencia
    // em qualquer lugar do texto e ficou verde quando a mutacao apagou justamente
    // a linha que declara — havia outra mencao em prosa logo abaixo.
    "a gramatica nao DECLARA a duracao absoluta como pendente de calibracao",
  );
  // E o codigo nao pode ter ganhado os numeros da demo.
  const css = ler("src/product/ui/tokens/organismo-tokens.css");
  for (const demo of ["26s", "24%", "16%", "14%", "12%", "6%"]) {
    assert.ok(!css.includes(demo), `M-I: o valor de demonstracao ${demo} entrou no CSS do produto`);
  }
});

teste("E6 M-P: a ponte nao se declara auditoria independente", () => {
  for (const doc of [SUCESSAO, ENVELOPE, GRAMATICA]) {
    const t = ler(doc).toLowerCase();
    for (const frase of ["auditoria independente", "independent audit", "certificacao independente"]) {
      // A unica ocorrencia aceita e a NEGACAO explicita da propria independencia.
      const i = t.indexOf(frase);
      if (i >= 0) {
        const janela = t.slice(Math.max(0, i - 90), i + 90);
        assert.match(
          janela,
          /nao e|nao houve|não é|não houve|sem /,
          `M-P: ${doc} reivindica ${frase}`,
        );
      }
    }
  }
});

teste("E7 M-O: aprovacao humana posterior vence marcador de arquivo obsoleto", () => {
  const s = ler(SUCESSAO);
  for (const campo of ["FILE_INTERNAL_STATE", "LATER_HUMAN_DECISION", "CURRENT_AUTHORITY_EFFECT"]) {
    assert.ok(s.includes(campo), `a procedencia de aprovacao nao declara ${campo}`);
  }
  // Os marcadores obsoletos precisam continuar CITADOS — apagar a divergencia
  // seria reescrever historia para deixar a narrativa limpa.
  assert.ok(
    s.includes("AWAITING_CESAR_MOTION_NORTH_STAR_DECISION"),
    "o marcador obsoleto do Motion North Star foi apagado em vez de registrado",
  );
});

teste("E8 a hierarquia visual continua declarando quem NAO pode definir direcao", () => {
  const h = ler(HIERARQUIA);
  assert.match(h, /historical_reference_only/);
  const nivel5 = h.split("\n").find((l) => l.includes("app-v1") && l.includes("|"));
  assert.ok(nivel5, "a hierarquia perdeu a linha do Nivel 5");
  assert.match(nivel5, /\*\*NÃO\*\*|\*\*NAO\*\*/);
});

/* ================================================================== */

void Promise.resolve().then(() => {
  console.log(`\nM1A.1 — ponte canonica e estrutural: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("M1_BRIDGE_GATE_GREEN");
});
