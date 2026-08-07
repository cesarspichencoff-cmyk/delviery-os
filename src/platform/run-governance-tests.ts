/**
 * GOVERNANCE GATE — ENTROPY CONTROL do VÉRTICE.
 * ============================================================================
 * Por que existe. O repositorio nao falhou por falta de metodo: falhou porque
 * nada morria. Em 2026-08-07 QUATRO documentos declaravam ser o ponto de
 * partida da continuidade, `NEXT_RESUME.md` tinha 87% do corpo em bloco de
 * citacao empilhado, e `STATE.json` declarava `atualizado_em: 2026-08-03`
 * enquanto tinha sido gravado no commit `953a3fb`, de 2026-08-07. Nenhuma
 * guarda lia nada disso.
 *
 * O que esta guarda faz: verifica CICLO DE VIDA de artefato de autoridade
 * (ACTIVE / SUPERSEDED / ARCHIVED / EXPIRED), colisao de autoridade por ESCOPO,
 * coerencia entre estado declarado e evidencia VERSIONADA, e pergunta humana
 * orfa por REFERENCIA ESTRUTURADA.
 *
 * O que ela NAO faz, de proposito:
 *  - nao interpreta linguagem natural. Pergunta so e governada se tiver ID
 *    `Q-0NN` e for citada em `question_refs`. Nada de grep por interrogacao;
 *  - nao usa mtime de arquivo. Git nao preserva mtime como fonte canonica.
 *    Toda checagem estrutural usa commit: ancestralidade e ultimo commit que
 *    tocou o caminho;
 *  - nao audita conteudo. Se um documento estiver errado por dentro, o problema
 *    e de outra guarda. Esta cuida de QUEM MANDA e de QUANDO ISSO EXPIRA.
 *
 * Limite conhecido e declarado: data declarada no FUTURO nao e deriva, e
 * mentira. Guarda nenhuma pega isso, e fingir que pega seria pior.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, openSync, readSync, closeSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const HOJE = new Date().toISOString().slice(0, 10);

/** O bloco de lifecycle precisa caber no inicio do arquivo. Ler o arquivo
 *  inteiro so para descobrir se ele tem cabecalho e desperdicio em `docs/`. */
const JANELA_CABECALHO = 8192;

const STATUS_VALIDOS = ["ACTIVE", "SUPERSEDED", "ARCHIVED", "EXPIRED"] as const;
type Status = (typeof STATUS_VALIDOS)[number];

const DEFAULTS_VALIDOS = ["PAUSE", "PROCEED_REVERSIBLY", "USE_PREAPPROVED_DEFAULT"] as const;
type DefaultBehavior = (typeof DEFAULTS_VALIDOS)[number];

interface Lifecycle {
  artefato: string;
  status: Status;
  authority_scope: string;
  superseded_by: string | null;
  supersedes: string[];
  atualizado_em: string;
  state_basis: string;
  observa: string[];
  review_by: string | null;
  question_refs: string[];
}

interface Pergunta {
  id: string;
  estado: "open" | "answered";
  default_behavior: DefaultBehavior;
  autorizado_por: string | null;
  autorizacao_ref: string | null;
}

interface LedgerRegistro {
  mission_id: string;
  question_refs: string[];
  orcamento: { teto_levantado_por: string | null };
  bytes: number;
  camposLongos: string[];
}

interface Mundo {
  artefatos: Map<string, Lifecycle>;
  claudeTexto: string;
  claudeRota: string[];
  perguntas: Map<string, Pergunta>;
  ledger: LedgerRegistro[];
  citacaoRatio: Map<string, number>;
}

/* ================================================================== */
/* Leitura                                                             */
/* ================================================================== */

function cabecalho(caminho: string): string {
  const fd = openSync(caminho, "r");
  try {
    const buf = Buffer.alloc(JANELA_CABECALHO);
    const lidos = readSync(fd, buf, 0, JANELA_CABECALHO, 0);
    return buf.subarray(0, lidos).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/** YAML minimo — so a forma que este projeto escreve. Nao e parser de YAML. */
function lifecycleDeMarkdown(texto: string): Record<string, unknown> | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
  if (!m || !/^lifecycle:/m.test(m[1])) return null;
  const out: Record<string, unknown> = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const campo = /^\s{2}(\w+):\s*(.*)$/.exec(linha);
    if (!campo) continue;
    const [, chave, bruto] = campo;
    const valor = bruto.trim();
    if (valor === "null" || valor === "") out[chave] = null;
    else if (valor.startsWith("[")) out[chave] = JSON.parse(valor.replace(/'/g, '"'));
    else out[chave] = valor.replace(/^["']|["']$/g, "");
  }
  return out;
}

function lifecycleDeJson(caminho: string): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(readFileSync(caminho, "utf8")) as Record<string, unknown>;
    return (obj._lifecycle as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

function lifecycleDeJsonl(texto: string): Record<string, unknown> | null {
  const primeira = texto.split(/\r?\n/)[0];
  if (!primeira) return null;
  try {
    const obj = JSON.parse(primeira) as Record<string, unknown>;
    return (obj._lifecycle as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

function normalizar(bruto: Record<string, unknown>, caminho: string): Lifecycle {
  const s = (k: string): string | null => {
    const v = bruto[k];
    return typeof v === "string" ? v : null;
  };
  const lista = (k: string): string[] => {
    const v = bruto[k];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    return typeof v === "string" && v.length > 0 ? [v] : [];
  };
  return {
    artefato: s("artefato") ?? caminho,
    status: (s("status") ?? "") as Status,
    authority_scope: s("authority_scope") ?? "",
    superseded_by: s("superseded_by"),
    supersedes: lista("supersedes"),
    atualizado_em: s("atualizado_em") ?? "",
    state_basis: s("state_basis") ?? "",
    observa: lista("observa"),
    review_by: s("review_by"),
    question_refs: lista("question_refs"),
  };
}

function candidatos(): string[] {
  const out: string[] = ["CLAUDE.md"];
  const anda = (dir: string): void => {
    for (const nome of readdirSync(join(RAIZ, dir))) {
      const rel = `${dir}/${nome}`;
      const abs = join(RAIZ, rel);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (nome === "canonical" || nome === "node_modules") continue;
        anda(rel);
      } else if (/\.(md|json|jsonl)$/.test(nome) && st.size > 0) {
        out.push(rel);
      }
    }
  };
  anda("docs");
  return out;
}

function lerArtefatos(): Map<string, Lifecycle> {
  const mapa = new Map<string, Lifecycle>();
  for (const rel of candidatos()) {
    const abs = join(RAIZ, rel);
    if (!existsSync(abs)) continue;
    const head = cabecalho(abs);
    let bruto: Record<string, unknown> | null = null;
    if (rel.endsWith(".md")) bruto = lifecycleDeMarkdown(head);
    else if (rel.endsWith(".jsonl")) bruto = lifecycleDeJsonl(head);
    else if (rel.endsWith(".json") && head.includes('"_lifecycle"')) bruto = lifecycleDeJson(abs);
    if (bruto) mapa.set(rel, normalizar(bruto, rel));
  }
  return mapa;
}

/** A LISTA NUMERADA da secao 11 — o mesmo recorte que a guarda de ordem visual
 *  usa, e pelo mesmo motivo: mencao em prosa nao e rota. */
function rotaDoClaude(texto: string): string[] {
  const secao = texto.split("## 11.")[1];
  assert.ok(secao, "CLAUDE.md perdeu a secao 11 (ordem de leitura)");
  const lista = secao.split("\n>")[0]!;
  const caminhos = lista.match(/`([\w./-]+\.(?:md|json|jsonl))`/g) ?? [];
  return [...new Set(caminhos.map((c) => c.replace(/`/g, "")))];
}

function lerPerguntas(): Map<string, Pergunta> {
  const mapa = new Map<string, Pergunta>();
  const texto = readFileSync(join(RAIZ, "docs/execution/PERGUNTAS.jsonl"), "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const obj = JSON.parse(linha) as Partial<Pergunta> & { _lifecycle?: unknown };
    if (obj._lifecycle || !obj.id) continue;
    mapa.set(obj.id, {
      id: obj.id,
      estado: obj.estado as "open" | "answered",
      default_behavior: obj.default_behavior as DefaultBehavior,
      autorizado_por: obj.autorizado_por ?? null,
      autorizacao_ref: obj.autorizacao_ref ?? null,
    });
  }
  return mapa;
}

const LIMITE_BYTES_LINHA = 1200;
const LIMITE_CHARS_CAMPO = 240;

function lerLedger(): LedgerRegistro[] {
  const out: LedgerRegistro[] = [];
  const texto = readFileSync(join(RAIZ, "docs/execution/MISSION_LEDGER.jsonl"), "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const obj = JSON.parse(linha) as Record<string, unknown>;
    if (obj._lifecycle) continue;
    const camposLongos: string[] = [];
    const varrer = (v: unknown, caminho: string): void => {
      if (typeof v === "string") {
        if (v.length > LIMITE_CHARS_CAMPO) camposLongos.push(caminho);
      } else if (Array.isArray(v)) v.forEach((x, i) => varrer(x, `${caminho}[${i}]`));
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) varrer(x, `${caminho}.${k}`);
      }
    };
    varrer(obj, "");
    const orc = (obj.orcamento ?? {}) as { teto_levantado_por?: string | null };
    out.push({
      mission_id: String(obj.mission_id ?? "?"),
      question_refs: Array.isArray(obj.question_refs) ? (obj.question_refs as string[]) : [],
      orcamento: { teto_levantado_por: orc.teto_levantado_por ?? null },
      bytes: Buffer.byteLength(linha, "utf8"),
      camposLongos,
    });
  }
  return out;
}

/** Circuit breaker EXTERNO: mede empilhamento de resumo sem pedir ao contexto
 *  degradado que se diagnostique. `NEXT_RESUME.md` marcava 0.87. */
function razaoDeCitacao(rel: string): number {
  const linhas = readFileSync(join(RAIZ, rel), "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length === 0) return 0;
  return linhas.filter((l) => l.trimStart().startsWith(">")).length / linhas.length;
}

/* ================================================================== */
/* Git — a unica fonte de evidencia versionada usada aqui              */
/* ================================================================== */

/** stderr silenciado de proposito: a mutacao M3 passa um SHA invalido e o git
 *  reclama em voz alta. Saida barulhenta em gate verde treina a ignorar saida. */
function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

const HEAD = git("rev-parse", "HEAD");

function ehAncestralOuIgual(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const ra = git("rev-parse", a);
    const rb = git("rev-parse", b);
    if (ra === rb) return true;
    execFileSync("git", ["merge-base", "--is-ancestor", ra, rb], { cwd: RAIZ, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const cacheUltimoCommit = new Map<string, string>();
function ultimoCommit(paths: string[]): string {
  const chave = paths.join("|");
  const guardado = cacheUltimoCommit.get(chave);
  if (guardado !== undefined) return guardado;
  const v = git("log", "-1", "--format=%H", "--", ...paths);
  cacheUltimoCommit.set(chave, v);
  return v;
}

function dataUltimoCommit(path: string): string {
  return git("log", "-1", "--format=%cs", "--", path);
}

/* ================================================================== */
/* As guardas — funcoes puras sobre o Mundo, para a mutacao poder rodar */
/* ================================================================== */

type Guarda = (m: Mundo) => string[];

const GUARDAS: Record<string, Guarda> = {
  /** G1 — lifecycle bem formado. */
  G1: (m) => {
    const erros: string[] = [];
    for (const [rel, lc] of m.artefatos) {
      if (!STATUS_VALIDOS.includes(lc.status)) erros.push(`${rel}: status invalido "${lc.status}"`);
      if (lc.artefato !== rel) erros.push(`${rel}: campo artefato diz "${lc.artefato}"`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lc.atualizado_em)) erros.push(`${rel}: atualizado_em invalido`);
      if (!lc.authority_scope) erros.push(`${rel}: sem authority_scope`);
      if (!lc.state_basis) erros.push(`${rel}: sem state_basis`);
    }
    return erros;
  },

  /** G2 — toda rota ativa aponta para artefato ACTIVE com lifecycle. */
  G2: (m) => {
    const erros: string[] = [];
    for (const rel of m.claudeRota) {
      const lc = m.artefatos.get(rel);
      if (!lc) erros.push(`rota cita ${rel}, que nao tem lifecycle`);
      else if (lc.status !== "ACTIVE") erros.push(`rota cita ${rel}, que esta ${lc.status}`);
    }
    return erros;
  },

  /** G3 — nenhum aposentado reaparece como autoridade, em lugar nenhum do CLAUDE.md. */
  G3: (m) => {
    const erros: string[] = [];
    for (const [rel, lc] of m.artefatos) {
      if (lc.status === "ACTIVE") continue;
      if (m.claudeTexto.includes(rel)) erros.push(`CLAUDE.md ainda cita ${rel}, que esta ${lc.status}`);
    }
    return erros;
  },

  /** G4 — sucessor e antecessor precisam existir e ter o estado coerente. */
  G4: (m) => {
    const erros: string[] = [];
    for (const [rel, lc] of m.artefatos) {
      if (lc.status !== "ACTIVE" && !lc.superseded_by) erros.push(`${rel}: ${lc.status} sem superseded_by`);
      if (lc.superseded_by) {
        const alvo = m.artefatos.get(lc.superseded_by);
        if (!alvo) erros.push(`${rel}: superseded_by aponta para ${lc.superseded_by}, que nao existe`);
        else if (alvo.status !== "ACTIVE") erros.push(`${rel}: sucessor ${lc.superseded_by} nao esta ACTIVE`);
      }
      for (const antes of lc.supersedes) {
        const alvo = m.artefatos.get(antes);
        if (!alvo) erros.push(`${rel}: supersedes aponta para ${antes}, que nao existe`);
        else if (alvo.status === "ACTIVE") erros.push(`${rel}: ${antes} ainda esta ACTIVE`);
      }
    }
    return erros;
  },

  /** G5 — colisao de autoridade: um escopo, um dono ACTIVE. */
  G5: (m) => {
    const porEscopo = new Map<string, string[]>();
    for (const [rel, lc] of m.artefatos) {
      if (lc.status !== "ACTIVE") continue;
      porEscopo.set(lc.authority_scope, [...(porEscopo.get(lc.authority_scope) ?? []), rel]);
    }
    return [...porEscopo].filter(([, d]) => d.length > 1).map(([e, d]) => `escopo "${e}" tem ${d.length} donos ACTIVE: ${d.join(", ")}`);
  },

  /** G6a — a base declarada precisa estar nesta linha da historia. */
  G6a: (m) => {
    const erros: string[] = [];
    for (const [rel, lc] of m.artefatos) {
      if (!ehAncestralOuIgual(lc.state_basis, HEAD)) erros.push(`${rel}: state_basis ${lc.state_basis} nao e ancestral de HEAD`);
    }
    return erros;
  },

  /** G6b — base estrutural obsoleta: o escopo observado andou depois da base. */
  G6b: (m) => {
    const erros: string[] = [];
    for (const [rel, lc] of m.artefatos) {
      if (lc.observa.length === 0) continue;
      const u = ultimoCommit(lc.observa);
      if (!ehAncestralOuIgual(u, lc.state_basis)) {
        erros.push(`${rel}: observa mudou em ${u.slice(0, 7)}, depois da base declarada ${lc.state_basis}`);
      }
    }
    return erros;
  },

  /** G6c — data declarada mais velha que o ultimo commit do caminho. */
  G6c: (m) => {
    const erros: string[] = [];
    for (const [rel, lc] of m.artefatos) {
      const d = dataUltimoCommit(rel);
      if (d && lc.atualizado_em < d) erros.push(`${rel}: declara ${lc.atualizado_em}, alterado em commit de ${d}`);
    }
    return erros;
  },

  /** G7 — validade. review_by e OPCIONAL; se existir e vencer, acusa. */
  G7: (m) => {
    const erros: string[] = [];
    for (const [rel, lc] of m.artefatos) {
      if (lc.review_by && lc.review_by < HOJE) erros.push(`${rel}: review_by ${lc.review_by} venceu`);
    }
    return erros;
  },

  /** G8 — pergunta orfa, por REFERENCIA ESTRUTURADA. Zero NLP. */
  G8: (m) => {
    const erros: string[] = [];
    const checar = (refs: string[], onde: string): void => {
      for (const q of refs) {
        if (!/^Q-\d{3}$/.test(q)) erros.push(`${onde}: question_ref "${q}" nao tem forma Q-0NN`);
        else if (!m.perguntas.has(q)) erros.push(`${onde}: question_ref ${q} nao existe em PERGUNTAS.jsonl`);
      }
    };
    for (const [rel, lc] of m.artefatos) checar(lc.question_refs, rel);
    for (const r of m.ledger) checar(r.question_refs, `ledger:${r.mission_id}`);
    return erros;
  },

  /** G9 — ausencia humana nunca vira consentimento. */
  G9: (m) => {
    const erros: string[] = [];
    for (const p of m.perguntas.values()) {
      if (!DEFAULTS_VALIDOS.includes(p.default_behavior)) erros.push(`${p.id}: default_behavior invalido`);
      if (p.estado !== "open" && p.estado !== "answered") erros.push(`${p.id}: estado invalido`);
      if (p.default_behavior !== "PAUSE") {
        if (p.autorizado_por !== "cesar") erros.push(`${p.id}: ${p.default_behavior} sem autorizacao do Cesar`);
        if (!p.autorizacao_ref) erros.push(`${p.id}: ${p.default_behavior} sem autorizacao_ref`);
      }
    }
    return erros;
  },

  /** G10 — circuit breaker externo contra resumo de resumo. */
  G10: (m) => {
    const erros: string[] = [];
    for (const rel of m.claudeRota) {
      const r = m.citacaoRatio.get(rel);
      if (r !== undefined && r > 0.4) erros.push(`${rel}: ${(r * 100).toFixed(0)}% do corpo e bloco de citacao — resumo empilhado na rota ativa`);
    }
    return erros;
  },

  /** G11 — orcamento assimetrico: quem gasta nao levanta o proprio teto. */
  G11: (m) => {
    const erros: string[] = [];
    for (const r of m.ledger) {
      const quem = r.orcamento.teto_levantado_por;
      if (quem !== null && quem !== "cesar") erros.push(`ledger:${r.mission_id}: teto levantado por "${quem}", que nao e humano`);
    }
    return erros;
  },

  /** G12 — o ledger nao pode virar o novo NEXT_RESUME. */
  G12: (m) => {
    const erros: string[] = [];
    for (const r of m.ledger) {
      if (r.bytes > LIMITE_BYTES_LINHA) erros.push(`ledger:${r.mission_id}: ${r.bytes} bytes na linha, limite ${LIMITE_BYTES_LINHA}`);
      for (const c of r.camposLongos) erros.push(`ledger:${r.mission_id}: campo ${c} passa de ${LIMITE_CHARS_CAMPO} chars`);
    }
    return erros;
  },
};

/* ================================================================== */
/* Mundo legitimo                                                      */
/* ================================================================== */

function lerMundo(): Mundo {
  const artefatos = lerArtefatos();
  const claudeTexto = readFileSync(join(RAIZ, "CLAUDE.md"), "utf8");
  const claudeRota = rotaDoClaude(claudeTexto);
  const citacaoRatio = new Map<string, number>();
  for (const rel of [...artefatos.keys()]) {
    if (rel.endsWith(".md")) citacaoRatio.set(rel, razaoDeCitacao(rel));
  }
  return { artefatos, claudeTexto, claudeRota, perguntas: lerPerguntas(), ledger: lerLedger(), citacaoRatio };
}

function clonar(m: Mundo): Mundo {
  return {
    artefatos: new Map([...m.artefatos].map(([k, v]) => [k, { ...v, supersedes: [...v.supersedes], observa: [...v.observa], question_refs: [...v.question_refs] }])),
    claudeTexto: m.claudeTexto,
    claudeRota: [...m.claudeRota],
    perguntas: new Map([...m.perguntas].map(([k, v]) => [k, { ...v }])),
    ledger: m.ledger.map((r) => ({ ...r, question_refs: [...r.question_refs], orcamento: { ...r.orcamento }, camposLongos: [...r.camposLongos] })),
    citacaoRatio: new Map(m.citacaoRatio),
  };
}

function rodarTodas(m: Mundo): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [nome, g] of Object.entries(GUARDAS)) {
    const erros = g(m);
    if (erros.length > 0) out.set(nome, erros);
  }
  return out;
}

/* ================================================================== */
/* Execucao                                                            */
/* ================================================================== */

const modo = process.argv[2] ?? "gate";
const mundo = lerMundo();

console.log("=== GOVERNANCE GATE — VERTICE ENTROPY CONTROL ===");
console.log(`HEAD ${HEAD.slice(0, 7)} · ${mundo.artefatos.size} artefatos com lifecycle · rota de ${mundo.claudeRota.length} caminhos\n`);

const acusacoes = rodarTodas(mundo);

if (modo === "mutacoes") {
  /* ---- 1. caso legitimo ---- */
  console.log("1. CASO LEGITIMO");
  for (const nome of Object.keys(GUARDAS)) {
    const e = acusacoes.get(nome);
    console.log(`   ${nome.padEnd(4)} ${e ? `VERMELHO — ${e[0]}` : "verde"}`);
  }
  if (acusacoes.size > 0) {
    console.error("\nO caso legitimo precisa estar verde ANTES das mutacoes. Abortado.");
    process.exit(1);
  }

  /* ---- 2. casos negativos: guarda que nunca acusa nao e guarda ---- */
  console.log("\n2. CASOS NEGATIVOS (controle positivo de cada guarda)");
  const negativos: Array<[string, string, (m: Mundo) => void]> = [
    ["N1", "G1", (m) => { m.artefatos.get("CLAUDE.md")!.status = "VIVO" as Status; }],
    ["N2", "G9", (m) => { m.perguntas.get("Q-001")!.default_behavior = "TALVEZ" as DefaultBehavior; }],
    ["N3", "G10", (m) => { m.citacaoRatio.set(m.claudeRota[0]!, 0.87); }],
  ];
  let negOk = 0;
  for (const [id, esperada, aplicar] of negativos) {
    const c = clonar(mundo);
    aplicar(c);
    const r = rodarTodas(c);
    const ok = r.has(esperada);
    console.log(`   ${id} -> ${esperada}: ${ok ? "acusou" : "NAO ACUSOU"}`);
    if (ok) negOk += 1;
  }
  if (negOk !== negativos.length) {
    console.error("\nCaso negativo sem acusacao. Abortado.");
    process.exit(1);
  }

  /* ---- 3. mutacoes ---- */
  console.log("\n3. MUTACOES");
  const mutacoes: Array<[string, string, string, (m: Mundo) => void]> = [
    ["M1", "G6c", "data revertida para antes do ultimo commit", (m) => { m.artefatos.get("docs/execution/STATE.json")!.atualizado_em = "2026-08-03"; }],
    ["M2", "G6b", "base estrutural obsoleta com data de hoje", (m) => { m.artefatos.get("docs/execution/STATE.json")!.state_basis = "fae35c9"; }],
    ["M3", "G6a", "base fora desta linha da historia", (m) => { m.artefatos.get("CLAUDE.md")!.state_basis = "0000000000000000000000000000000000000000"; }],
    ["M4", "G3", "aposentado citado de volta no CLAUDE.md", (m) => { m.claudeTexto += "\n5. docs/execution/NEXT_RESUME.md\n"; }],
    ["M5", "G5", "segundo dono ACTIVE do mesmo escopo", (m) => { m.artefatos.get("docs/execution/NEXT_RESUME.md")!.status = "ACTIVE"; }],
    ["M6", "G8", "question_ref inexistente", (m) => { m.artefatos.get("docs/design/VISUAL_SOURCE_OF_TRUTH.md")!.question_refs = ["Q-999"]; }],
    ["M7", "G9", "PROCEED_REVERSIBLY sem autorizacao humana", (m) => { const p = m.perguntas.get("Q-001")!; p.default_behavior = "PROCEED_REVERSIBLY"; }],
    ["M8", "G7", "review_by vencido", (m) => { m.artefatos.get("docs/execution/PERGUNTAS.jsonl")!.review_by = "2020-01-01"; }],
    ["M9", "G11", "teto levantado por agente", (m) => { m.ledger[0]!.orcamento.teto_levantado_por = "agente"; }],
    ["M10", "G4", "superseded_by apontando para arquivo inexistente", (m) => { m.artefatos.get("docs/execution/HANDOFF_R5.md")!.superseded_by = "docs/execution/NAO_EXISTE.jsonl"; }],
    ["M11", "G12", "linha de ledger com narrativa acima do limite", (m) => { m.ledger[0]!.bytes = 9000; m.ledger[0]!.camposLongos = ["produto_terminado"]; }],
    ["M12", "G2", "rota citando arquivo sem lifecycle", (m) => { m.claudeRota.push("docs/execution/NEXT_RESUME_ANTIGO.md"); }],
  ];

  const linhas: string[] = [];
  let cegas = 0;
  for (const [id, esperada, desc, aplicar] of mutacoes) {
    const c = clonar(mundo);
    aplicar(c);
    const r = rodarTodas(c);
    const observadas = [...r.keys()];
    const acusouEsperada = observadas.includes(esperada);
    const incidentais = observadas.filter((g) => g !== esperada);
    if (!acusouEsperada) cegas += 1;
    linhas.push(
      `   ${id.padEnd(4)} ${esperada.padEnd(4)} ${acusouEsperada ? "ACUSADA" : "*** CEGA ***"}  ` +
        `incidentais: ${incidentais.length > 0 ? incidentais.join(",") : "nenhuma"}  · ${desc}`,
    );
  }
  console.log(linhas.join("\n"));

  console.log(`\n${mutacoes.length} mutacoes · ${mutacoes.length - cegas} acusadas pela guarda esperada · ${cegas} cegas`);
  if (cegas > 0) {
    console.error("MUTACAO CEGA — o gate nao protege o que diz proteger.");
    process.exit(1);
  }
  console.log("GOVERNANCE_MUTATIONS_GREEN");
} else {
  for (const [nome, erros] of acusacoes) {
    console.error(`${nome} FALHOU:`);
    for (const e of erros) console.error(`  - ${e}`);
  }
  if (acusacoes.size > 0) process.exit(1);
  console.log(`${Object.keys(GUARDAS).length} guardas verdes`);
  console.log("GOVERNANCE_GATE_GREEN");
}

export { GUARDAS, lerMundo };
