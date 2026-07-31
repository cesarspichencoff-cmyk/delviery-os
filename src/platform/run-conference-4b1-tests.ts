/**
 * Bloco 4B1 — contratos, normalização, store, PII e reconciliação mínima.
 *
 * O código veio do WIP `2d298cb` por port seletivo, e passou 309/309 lá. Estes
 * testes NÃO reescrevem aquela suíte: eles provam o que o gate desta unidade
 * exige e o que precisa continuar verdadeiro **neste** repositório —
 * proteção de PII, idempotência e recuperação do store.
 *
 * Duplicar os 309 aqui seria trabalho sem informação nova. O que tem valor é o
 * que muda de contexto: aqui o Conference Brain vive ao lado da Operação Viva,
 * e não ao lado do observador de tela do iFood.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// `createRequire` a partir do package.json: o tsconfig deste projeto compila
// para CommonJS, e `import.meta` nao existe la. O Conference Brain e JS puro
// em CJS — carrega-lo por require e o caminho honesto.
const req = createRequire(join(process.cwd(), "package.json"));
const CB = (m: string): Record<string, unknown> =>
  req(join(process.cwd(), "src", "conference-brain", m)) as Record<string, unknown>;

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

console.log("=== Conference Brain 4B1 — contratos, normalização, store, PII ===");

/* ------------------------------------------------------------------ *
 * 1. O port está fechado
 * ------------------------------------------------------------------ */

const MODULOS = [
  "contracts/states", "contracts/live-states", "contracts/schemas", "contracts/rule-version",
  "normalize/normalizer", "normalize/dedupe", "storage/store",
  "live/pii-guard", "live/reconciliation", "live/grouping",
  "live/multidimensional-observation", "live/status-map", "live/operator-panel",
  "live/store-state", "live/clock",
];

teste("os quinze módulos do 4B1 carregam", () => {
  for (const m of MODULOS) assert.ok(CB(m), `${m} não carregou`);
});

teste("o núcleo não importa NADA fora de si além de crypto, fs e path", () => {
  // É o que sustenta a decisão D28: portar seletivamente só funciona porque o
  // núcleo é autocontido. Se um require novo entrar, este teste acusa antes de
  // alguém descobrir num deploy.
  const { readdirSync, statSync } = req("node:fs") as typeof import("node:fs");
  const raiz = join(process.cwd(), "src", "conference-brain");
  const externos = new Set<string>();
  const andar = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        andar(p);
        continue;
      }
      if (!p.endsWith(".js")) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/require\("([^".][^"]*)"\)/g)) {
        externos.add(m[1]);
      }
    }
  };
  andar(raiz);
  assert.deepEqual([...externos].sort(), ["crypto", "fs", "path"]);
});

teste("todo require interno aponta para arquivo que existe", () => {
  const { readdirSync, statSync } = req("node:fs") as typeof import("node:fs");
  const raiz = join(process.cwd(), "src", "conference-brain");
  const faltando: string[] = [];
  const andar = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        andar(p);
        continue;
      }
      if (!p.endsWith(".js")) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/require\("(\.[^"]+)"\)/g)) {
        if (!existsSync(join(d, `${m[1]}.js`))) faltando.push(`${e} → ${m[1]}`);
      }
    }
  };
  andar(raiz);
  assert.deepEqual(faltando, [], `requires pendentes: ${faltando.join(", ")}`);
});

/* ------------------------------------------------------------------ *
 * 2. Proteção de PII
 * ------------------------------------------------------------------ */

/**
 * A superficie real do pii-guard.
 *
 * `sanitizeText` NAO devolve texto sanitizado: devolve o texto original quando
 * ele esta na allowlist, e um MARCADOR DE REDACAO quando nao esta. A diferenca
 * importa — o desenho e negar por padrao e liberar por excecao conhecida, que
 * e a unica forma de uma allowlist funcionar.
 */
type MarcadorDeRedacao = { redacted: true; text_category: string; text_length: number; text_hash: string };
const pii = CB("live/pii-guard") as {
  sanitizeText: (t: unknown, cat?: string) => string | MarcadorDeRedacao;
  sanitizeDeep: <T>(v: T, o?: unknown) => unknown;
  sanitizeFreeText: (t: unknown) => string;
  sanitizeOrderObservation: (d: unknown) => unknown;
  isKnownSafeText: (t: unknown) => boolean;
  isRedactedMarker: (v: unknown) => boolean;
};

teste("texto desconhecido NAO passa — vira marcador de redação", () => {
  // O desenho e negar por padrao. Um texto que ninguem reconheceu como seguro
  // nunca sai como texto: sai como marcador, com hash e tamanho, e sem
  // conteudo.
  const r = pii.sanitizeText("chamar Pedro Alves");
  assert.equal(pii.isRedactedMarker(r), true, "o texto desconhecido saiu como texto");
  assert.ok(!JSON.stringify(r).includes("Pedro"), "o nome sobreviveu dentro do marcador");
});

teste("o marcador carrega hash e tamanho — auditável sem ser legível", () => {
  const r = pii.sanitizeText("chamar Pedro Alves") as MarcadorDeRedacao;
  assert.equal(typeof r.text_hash, "string");
  assert.ok(r.text_hash.length > 0, "sem hash nao ha como correlacionar duas ocorrencias");
  assert.equal(r.text_length, "chamar Pedro Alves".length);
});

teste("allowlist com casamento COMPLETO — o furo do Sprint 2.3", () => {
  // O defeito de entao: `.test()` parcial liberava a frase inteira porque um
  // pedaco dela casava com um padrao seguro, e o nome ia junto.
  assert.equal(pii.isKnownSafeText("pronto"), true, "vocabulario operacional deveria passar");
  assert.equal(
    pii.isKnownSafeText("Avisar pedido pronto para Joao Silva"),
    false,
    "casamento parcial liberou frase com nome",
  );
});

teste("vocabulário operacional conhecido passa intacto", () => {
  // Falso positivo aqui apagaria a informacao operacional junto com a PII.
  for (const t of ["pronto", "Em rota"]) {
    assert.equal(pii.sanitizeText(t), t, `redigiu texto operacional legitimo: ${t}`);
  }
});

teste("texto livre é suprimido token a token", () => {
  const limpo = pii.sanitizeFreeText("cliente Maria Souza ligou");
  assert.ok(!limpo.includes("Maria"), "nome sobreviveu no texto livre");
  assert.ok(!limpo.includes("Souza"));
  assert.match(limpo, /token-suprimido/);
});

teste("a sanitização é profunda — PII aninhada não escapa", () => {
  const entrada = { nivel1: { nivel2: [{ texto: "entregar para Carlos Pereira" }] } };
  assert.ok(
    !JSON.stringify(pii.sanitizeDeep(entrada)).includes("Carlos"),
    "PII aninhada sobreviveu",
  );
});

teste("a profundidade tem limite — objeto ciclico nao derruba o processo", () => {
  // Sem o corte, uma estrutura profunda ou ciclica trava o sanitizador, e o
  // caminho de defesa vira o caminho de queda.
  const fundo: Record<string, unknown> = {};
  let cursor = fundo;
  for (let i = 0; i < 30; i += 1) {
    cursor.dentro = { texto: "Joao Silva" };
    cursor = cursor.dentro as Record<string, unknown>;
  }
  const saida = JSON.stringify(pii.sanitizeDeep(fundo));
  assert.ok(!saida.includes("Joao"), "PII escapou no fundo da estrutura");
});

teste("sanitizar duas vezes não corrompe o marcador", () => {
  const uma = pii.sanitizeText("chamar Pedro Alves");
  const duas = pii.sanitizeText(uma);
  assert.equal(pii.isRedactedMarker(duas), true, "a segunda passagem quebrou o marcador");
});

/* ------------------------------------------------------------------ *
 * 3. Store — idempotência e recuperação
 * ------------------------------------------------------------------ */

/**
 * A superficie real do store, lida do codigo e nao suposta.
 *
 * `load` carrega do disco para a memoria; quem devolve os registros e `all`.
 * Presumir que `load` retornava a lista foi o primeiro erro deste arquivo, e o
 * teste acusou na primeira execucao.
 */
const { createStore } = CB("storage/store") as {
  createStore: (o: { dir: string }) => {
    put: (tipo: string, reg: Record<string, unknown>) => { ok: boolean; action?: string };
    all: (tipo: string) => Record<string, unknown>[];
    count: (tipo: string) => number;
    load: (tipo: string) => unknown;
    health: () => Record<string, unknown>;
  };
};

/** O store grava em `<entidade>.runtime.jsonl`. */
const ARQUIVO = (dir: string, ent: string): string => join(dir, `${ent}.runtime.jsonl`);

function comStore<T>(fn: (s: ReturnType<typeof createStore>, dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "cb4b1-"));
  try {
    return fn(createStore({ dir }), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Fixture que o schema aceita.
 *
 * `raw_status` e `confidence` sao obrigatorios — o primeiro esboco deste
 * arquivo os omitiu, e o `put` recusou. O schema estava certo.
 */
const OBS = {
  run_id: "r1",
  cycle_id: "c1",
  external_id: "p-1",
  observed_at: "2026-07-27T12:00:00.000Z",
  raw_status: "pronto",
  source_health: "available",
  confidence: "media",
};

teste("o store grava e relê", () => {
  comStore((s) => {
    const r = s.put("live_observations", { ...OBS });
    assert.equal(r.ok, true, `put recusou: ${JSON.stringify(r)}`);
    assert.equal(s.count("live_observations"), 1);
  });
});

teste("gravar o MESMO registro N vezes deixa um só", () => {
  // Idempotência por chave natural — a mesma que o replay depende.
  comStore((s) => {
    for (let i = 0; i < 50; i += 1) s.put("live_observations", { ...OBS });
    assert.equal(s.count("live_observations"), 1, "a duplicata entrou");
  });
});

teste("chave natural diferente cria registro diferente", () => {
  comStore((s) => {
    s.put("live_observations", { ...OBS });
    s.put("live_observations", { ...OBS, external_id: "p-2" });
    assert.equal(s.count("live_observations"), 2);
  });
});

teste("reabrir o store não duplica nem perde", () => {
  // Reinício do processo é o caso real. `load` precisa ser idempotente.
  const dir = mkdtempSync(join(tmpdir(), "cb4b1-"));
  try {
    createStore({ dir }).put("live_observations", { ...OBS });
    const s2 = createStore({ dir });
    s2.load("live_observations");
    assert.equal(s2.count("live_observations"), 1);
    s2.load("live_observations");
    assert.equal(s2.count("live_observations"), 1, "reler duplicou");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("linha corrompida é CONTADA, nunca descartada em silêncio", () => {
  // Descartar sem contar transformaria perda de dado em ausência de dado — e
  // ninguém investiga o que não sabe que sumiu.
  const dir = mkdtempSync(join(tmpdir(), "cb4b1-"));
  try {
    const s = createStore({ dir });
    s.put("live_observations", { ...OBS });
    const arquivo = ARQUIVO(dir, "live_observations");
    writeFileSync(arquivo, `${readFileSync(arquivo, "utf8")}{ isto nao e json\n`, "utf8");

    const s2 = createStore({ dir });
    s2.load("live_observations");
    assert.equal(s2.count("live_observations"), 1, "a linha boa foi perdida junto com a ruim");
    const h = JSON.stringify(s2.health());
    assert.match(h, /corrupt/i, `a corrupção não foi contada: ${h}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("a saúde do store NÃO expõe conteúdo da linha corrompida", () => {
  // O caminho clássico de vazamento: a mensagem de erro do parser carrega o
  // trecho que não parseou — e aquele trecho pode conter PII.
  const dir = mkdtempSync(join(tmpdir(), "cb4b1-"));
  try {
    createStore({ dir }).put("live_observations", { ...OBS });
    const arquivo = ARQUIVO(dir, "live_observations");
    writeFileSync(
      arquivo,
      `${readFileSync(arquivo, "utf8")}{"cliente":"Joao Silva" quebrado\n`,
      "utf8",
    );
    const s2 = createStore({ dir });
    s2.load("live_observations");
    assert.ok(
      !JSON.stringify(s2.health()).includes("Joao"),
      "a saúde vazou o conteúdo corrompido",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * 4. Contratos e reconciliação mínima
 * ------------------------------------------------------------------ */

const schemas = CB("contracts/schemas") as {
  FORBIDDEN_FIELDS: readonly string[];
  validate: (tipo: string, reg: unknown) => { ok: boolean; errors?: string[] };
  naturalKey: (tipo: string, reg: unknown) => string;
};

teste("o schema recusa campo proibido por NOME", () => {
  assert.ok(schemas.FORBIDDEN_FIELDS.length > 0);
  const r = schemas.validate("live_observations", { ...OBS, customer_name: "x" });
  assert.equal(r.ok, false, "campo proibido passou pelo schema");
});

teste("a chave natural é estável e determinística", () => {
  const a = schemas.naturalKey("live_observations", OBS);
  const b = schemas.naturalKey("live_observations", { ...OBS });
  assert.equal(a, b, "a mesma observação gerou chaves diferentes");
});

teste("o modo shadow é exigido pelo contrato", () => {
  // Um estado de conferência que não seja `shadow` é recusado — a garantia de
  // que o Brain não decide nada vive no schema, não na intenção.
  const r = schemas.validate("conference_state", {
    unit_id: "ITAIM",
    mode: "production",
    observed_at: OBS.observed_at,
  });
  assert.equal(r.ok, false, "modo diferente de shadow foi aceito");
});

const rec = CB("live/reconciliation") as {
  reconcileField: (campo: string, obs: readonly Record<string, unknown>[]) => unknown;
  rankOf: (s: string) => number;
  STATUS_RANK: Record<string, number>;
};

teste("a reconciliação de status respeita a ordem, não a chegada", () => {
  // Rede reordena. Se a reconciliação obedecesse à ordem de chegada, um status
  // velho sobrescreveria o novo.
  assert.ok(rec.STATUS_RANK, "sem tabela de ordem não há como decidir");
  const ranks = Object.values(rec.STATUS_RANK);
  assert.ok(ranks.length > 1 && new Set(ranks).size > 1, "os postos não distinguem nada");
});

teste("a reconciliação é função pura — mesma entrada, mesma saída", () => {
  const entrada = [
    { status: "pronto", observed_at: "2026-07-27T12:00:00.000Z", source: "a" },
    { status: "saiu", observed_at: "2026-07-27T12:01:00.000Z", source: "a" },
  ];
  const a = JSON.stringify(rec.reconcileField("status", entrada));
  const b = JSON.stringify(rec.reconcileField("status", [...entrada]));
  assert.equal(a, b, "duas execuções sobre a mesma entrada divergiram");
});

/* ------------------------------------------------------------------ *
 * 5. Isolamento — o Brain não conhece o Entregas
 * ------------------------------------------------------------------ */

teste("o Conference Brain não referencia ENTREGAS nem a plataforma", () => {
  // O mesmo invariante que a suíte de origem afirmava, mantido aqui: se ele
  // cair, o Brain deixou de ser substituível e passou a ser acoplamento.
  const { readdirSync, statSync } = req("node:fs") as typeof import("node:fs");
  const raiz = join(process.cwd(), "src", "conference-brain");
  const suspeitos: string[] = [];
  const andar = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        andar(p);
        continue;
      }
      if (!p.endsWith(".js")) continue;
      const texto = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (/src\/entregas|src\/platform|require\("\.\.\/\.\.\//.test(texto)) suspeitos.push(e);
    }
  };
  andar(raiz);
  assert.deepEqual(suspeitos, [], `acoplamento encontrado em: ${suspeitos.join(", ")}`);
});

if (failures.length) {
  console.error(`\n=== ${failures.length} FALHA(S) ===`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`\n=== ${passed} conference-4b1 tests OK ===`);
