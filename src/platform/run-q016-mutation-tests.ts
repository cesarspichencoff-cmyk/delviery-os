/**
 * Q-016 — SUÍTE ADVERSARIAL DO REPLAY.
 * ============================================================================
 * Cada mutação RESTAURA um defeito que a Q-016 fechou, e exige que o gate
 * acuse — pela assinatura certa. Zero mutações cegas.
 *
 * As mesmas recusas do PB19: mutação que não entrou no disco não conta; gate
 * que nem rodou não conta; reprovar por outro motivo significa que a
 * propriedade não estava sendo defendida.
 *
 * Nenhuma mutação procura palavra: todas trocam comportamento, contrato de
 * schema ou ordem de execução.
 *
 * Mutação que exercita BINÁRIO apaga `dist/` antes de reconstruir. Sem isso,
 * um asset que sobrou do build anterior deixa a mutação cega — foi o que
 * aconteceu com MP3 no PB19.
 *
 * Exige `DELIVERYOS_PG_URL`.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const falhas: string[] = [];
let passaram = 0;
let cegas = 0;

console.log("\n=== Q-016 — SUITE ADVERSARIAL DO REPLAY ===\n");

if (!(process.env.DELIVERYOS_PG_URL ?? "").trim()) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — os gates atacados precisam de PostgreSQL real.");
  process.exit(0);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function teste(nome: string, fn: () => void): void {
  try {
    fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

type Gate = "contrato" | "processos";
const SCRIPT: Record<Gate, string> = {
  contrato: "src/platform/run-q016-replay-tests.ts",
  processos: "src/platform/run-q016-processos-tests.ts",
};

function rodar(gate: Gate): { ok: boolean; saida: string } {
  if (gate === "processos") {
    try {
      rmSync(join(raiz, "dist"), { recursive: true, force: true });
      execFileSync("npm", ["run", "build:platform"], { cwd: raiz, encoding: "utf8", timeout: 600_000 });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      return { ok: false, saida: `__BUILD__${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  }
  try {
    const saida = execFileSync("npx", ["tsx", SCRIPT[gate]], {
      cwd: raiz,
      encoding: "utf8",
      timeout: 1_200_000,
      env: { ...process.env },
    });
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (saida.trim() === "") return { ok: false, saida: `__SPAWN_FALHOU__ ${err.code ?? "?"}` };
    return { ok: false, saida };
  }
}

type Edicao = { arquivo: string; de: string; para: string } | { arquivo: string; transformar: (s: string) => string };

interface Aplicada {
  arquivo: string;
  original: string;
  hash: string;
}

function aplicar(edicoes: readonly Edicao[]): Aplicada[] {
  const feitas: Aplicada[] = [];
  const porArquivo = new Map<string, string>();
  try {
    for (const e of edicoes) {
      const caminho = join(raiz, e.arquivo);
      if (!porArquivo.has(e.arquivo)) {
        const original = readFileSync(caminho, "utf8");
        porArquivo.set(e.arquivo, original);
        feitas.push({ arquivo: e.arquivo, original, hash: sha(original) });
      }
      const atual = readFileSync(caminho, "utf8");
      let novo: string;
      if ("transformar" in e) {
        novo = e.transformar(atual);
      } else {
        assert.ok(atual.includes(e.de), `MUTACAO NAO APLICADA: ancora ausente em ${e.arquivo}: ${e.de.slice(0, 60)}`);
        novo = atual.replace(e.de, () => e.para);
      }
      assert.notEqual(novo, atual, `MUTACAO NAO APLICADA: a troca nao mudou ${e.arquivo}`);
      writeFileSync(caminho, novo);
      assert.equal(readFileSync(caminho, "utf8"), novo, `MUTACAO NAO APLICADA: o disco nao confirmou ${e.arquivo}`);
    }
  } catch (err) {
    restaurar(feitas);
    throw err;
  }
  return feitas;
}

function restaurar(feitas: readonly Aplicada[]): void {
  for (const f of feitas) {
    writeFileSync(join(raiz, f.arquivo), f.original);
    assert.equal(sha(readFileSync(join(raiz, f.arquivo), "utf8")), f.hash, `RESTAURACAO FALHOU em ${f.arquivo}`);
  }
}

function mutacao(o: { id: string; propriedade: string; gate: Gate; edicoes: Edicao[]; assinatura: RegExp }): void {
  teste(`${o.id} — ${o.propriedade}`, () => {
    const feitas = aplicar(o.edicoes);
    console.log(`        aplicada · ${feitas.map((f) => `${f.arquivo.split("/").pop()} ${f.hash.slice(0, 8)}`).join(" · ")}`);
    try {
      const r = rodar(o.gate);
      assert.doesNotMatch(r.saida, /__SPAWN_FALHOU__/, "o gate nem rodou — falha de ambiente");
      if (r.ok) {
        cegas += 1;
        assert.fail(`o gate ${o.gate} ficou VERDE com o defeito restaurado — MUTACAO CEGA`);
      }
      assert.match(r.saida, o.assinatura, `reprovou, mas NAO pela assinatura esperada:\n${r.saida.slice(-700)}`);
      // A perda, com a mensagem de quem acusou — sem isto, "reprovou pela
      // assinatura" não diz se reprovou pelo MOTIVO certo.
      const linha =
        r.saida.split("\n").find((l) => /^ {2}XX \S/.test(l) && o.assinatura.test(`XX  ${l.slice(5)}`)) ??
        r.saida.split("\n").find((l) => o.assinatura.test(l)) ??
        "";
      console.log(`        perda · ${linha.trim().replace(/\s+/g, " ").slice(0, 190)}`);
    } finally {
      restaurar(feitas);
      console.log(`        restaurado · ${feitas.length} arquivo(s) == origem`);
    }
  });
}

/* ---- controle positivo ---- */
console.log("0. CONTROLE POSITIVO");
for (const g of ["contrato", "processos"] as const) {
  teste(`o gate ${g} está verde ANTES de qualquer mutação`, () => {
    const r = rodar(g);
    assert.ok(r.ok, `gate ${g} já vermelho antes de mutar:\n${r.saida.slice(-800)}`);
  });
}
if (falhas.length) {
  console.error("\nOs gates precisam estar verdes ANTES das mutacoes. Abortado.");
  for (const f of falhas) console.error(`  ${f}`);
  process.exit(1);
}

const ESCRITOR = "src/platform/persistence/pg-repositories.ts";
const MIGRATION = "src/platform/migrations/0003_event_log_source_mode.sql";
const PORTA = "src/platform/projections/replay-do-event-log.ts";
const BOOT = "src/platform/runtime/replay-no-boot.ts";
const RUNTIME = "src/platform/bin/async-runtime.ts";
const MEMORIA = "src/platform/projections/consumidor.ts";

const ESCRITOR_SEM_MODO: Edicao[] = [
  {
    arquivo: ESCRITOR,
    de: "                sequence_local, contract_version, source_mode, clock_trust)\n             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
    para: "                sequence_local, contract_version, clock_trust)\n             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
  },
  {
    arquivo: ESCRITOR,
    de: '              // Sem `?? "real"`: ausente vai como ausente, e o banco recusa.\n              f.source_mode,\n',
    para: "",
  },
];

/* ================================================================== */
console.log("\n1. A PERSISTENCIA DO MODO");

mutacao({
  id: "MQ1",
  propriedade: "o escritor deixa de gravar source_mode — o banco precisa recusar",
  gate: "contrato",
  edicoes: ESCRITOR_SEM_MODO,
  assinatura: /XX {2}C1 /,
});

mutacao({
  id: "MQ2",
  propriedade: "o escritor deixa de gravar E a obrigatoriedade some — o log volta a igualar os modos",
  gate: "contrato",
  edicoes: [
    ...ESCRITOR_SEM_MODO,
    {
      arquivo: MIGRATION,
      transformar: (s) => s.replace(/DO \$\$[\s\S]*?\$\$;\n/, ""),
    },
  ],
  assinatura: /XX {2}C5 /,
});

mutacao({
  id: "MQ3",
  propriedade: "a obrigatoriedade é criada VALIDADA — a migration morre em banco com histórico",
  gate: "contrato",
  edicoes: [{ arquivo: MIGRATION, de: "            NOT VALID;", para: "            ;" }],
  assinatura: /XX {2}H1 /,
});

/* ================================================================== */
console.log("\n2. AUSENTE NUNCA VIRA REAL");

mutacao({
  id: "MQ4",
  propriedade: "a porta defaulta modo ausente para real",
  gate: "contrato",
  edicoes: [{ arquivo: PORTA, de: "      const modo = l.source_mode;", para: '      const modo = l.source_mode ?? "real";' }],
  assinatura: /XX {2}P2 /,
});

mutacao({
  id: "MQ5",
  propriedade: "a migration nasce com DEFAULT 'real' — o histórico vira real sem ninguém dizer",
  gate: "contrato",
  edicoes: [
    {
      arquivo: MIGRATION,
      de: "ALTER TABLE platform.event_log ADD COLUMN IF NOT EXISTS source_mode TEXT;",
      para: "ALTER TABLE platform.event_log ADD COLUMN IF NOT EXISTS source_mode TEXT DEFAULT 'real';",
    },
  ],
  assinatura: /XX {2}(C3|H2) /,
});

/* ================================================================== */
console.log("\n3. MODOS SEPARADOS");

mutacao({
  id: "MQ6",
  propriedade: "a memória mistura os modos de uma unidade numa caixa só",
  gate: "contrato",
  edicoes: [{ arquivo: MEMORIA, de: "    return `${unit}|${modo}`;", para: "    return `${unit}|real`;" }],
  assinatura: /XX {2}P8 /,
});

/* ================================================================== */
console.log("\n4. A FONTE E O LOG");

mutacao({
  id: "MQ7",
  propriedade: "a porta reconstrói a partir da OUTBOX em vez do event log",
  gate: "contrato",
  edicoes: [
    {
      arquivo: PORTA,
      de: `      \`SELECT event_id, unit_id, object_type, object_id, event_type, occurred_at, origin,
              device_id, sequence_local, idempotency_key, contract_version, source_mode,
              recorded_at, clock_trust
         FROM platform.event_log
        WHERE event_type = ANY($1)\`,`,
      para: `      \`SELECT payload->>'event_id' AS event_id, payload->>'unit_id' AS unit_id,
              CASE WHEN payload ? 'trip_id' THEN 'trip' ELSE 'unit' END AS object_type,
              payload->>'trip_id' AS object_id, kind AS event_type,
              (payload->>'occurred_at')::timestamptz AS occurred_at, payload->>'origin' AS origin,
              payload->>'device_id' AS device_id, payload->>'sequence' AS sequence_local,
              idempotency_key, payload->>'event_version' AS contract_version,
              payload->>'source_mode' AS source_mode,
              (payload->>'received_at')::timestamptz AS recorded_at, payload->>'clock_trust' AS clock_trust
         FROM platform.outbox
        WHERE kind = ANY($1)\`,`,
    },
  ],
  assinatura: /XX {2}P11 /,
});

/* ================================================================== */
console.log("\n5. REPLAY NAO REEMITE");

mutacao({
  id: "MQ8",
  propriedade: "a porta tenta emitir outbox DENTRO da leitura — o READ ONLY do banco recusa",
  gate: "contrato",
  edicoes: [
    {
      arquivo: PORTA,
      de: '    await tx.query("SET TRANSACTION READ ONLY");\n',
      para:
        '    await tx.query("SET TRANSACTION READ ONLY");\n' +
        "    await tx.query(\"INSERT INTO platform.outbox (outbox_id, stream, kind, payload, idempotency_key) VALUES ('ob-r-' || gen_random_uuid(), 'x', 'x', '{}'::jsonb, 'k-r')\");\n",
    },
  ],
  assinatura: /read-only transaction/,
});

mutacao({
  id: "MQ9",
  propriedade: "o boot reemite mensagem FORA da leitura — a contagem das tabelas acusa",
  gate: "processos",
  edicoes: [
    {
      arquivo: BOOT,
      de: "  const leitura = await lerFatosParaReplay(cliente, TIPOS_DA_OPERACAO_VIVA);\n",
      para:
        "  const leitura = await lerFatosParaReplay(cliente, TIPOS_DA_OPERACAO_VIVA);\n" +
        "  await cliente.query(\"INSERT INTO platform.outbox (outbox_id, stream, kind, payload, idempotency_key) VALUES ('ob-re-' || gen_random_uuid(), 'entregas', 'trip_created', '{}'::jsonb, 'k-re')\");\n",
    },
  ],
  assinatura: /XX {2}B1 /,
});

/* ================================================================== */
console.log("\n6. A ORDEM DO BOOT");

mutacao({
  id: "MQ10",
  propriedade: "o replay passa a rodar DEPOIS de o consumo começar",
  gate: "processos",
  edicoes: [
    {
      arquivo: RUNTIME,
      transformar: (s) => {
        const ini = s.indexOf("  // Q-016: a projeção é reconstruída do event log ANTES de o runtime existir.");
        const fimMarca = "    process.exit(78);\n  }\n";
        const fim = s.indexOf(fimMarca, ini) + fimMarca.length;
        assert.ok(ini > 0 && fim > ini, "bloco do replay não localizado");
        const bloco = s.slice(ini, fim);
        const sem = s.slice(0, ini) + s.slice(fim);
        return sem.replace("  const loop = laco();\n", `  const loop = laco();\n\n${bloco}`);
      },
    },
  ],
  assinatura: /XX {2}A6 /,
});

/* ================================================================== */
console.log("\n7. DUPLICATA NAO VIRA FATO NOVO");

mutacao({
  id: "MQ11",
  propriedade: "o fato relido ganha identidade própria — a mensagem pendente é reaplicada como nova",
  gate: "processos",
  edicoes: [
    {
      arquivo: PORTA,
      de: "        idempotency_key: String(l.idempotency_key),",
      para: "        idempotency_key: `replay:${String(l.idempotency_key)}`,",
    },
  ],
  assinatura: /XX {2}A2 /,
});

/* ================================================================== */
console.log("\n8. FRESCOR CONTRA O RELOGIO DE AGORA");

mutacao({
  id: "MQ12",
  propriedade: "o replay calcula frescor com o relógio do último fato, e congela o sinal",
  gate: "processos",
  edicoes: [
    {
      arquivo: BOOT,
      de: "  const escopos = resumoDaMemoria(ponte.memoria, agora);",
      para:
        "  const escopos = resumoDaMemoria(\n" +
        "    ponte.memoria,\n" +
        "    new Date(Math.max(0, ...leitura.aptos.map((e) => Date.parse(e.occurred_at)))),\n" +
        "  );",
    },
  ],
  assinatura: /XX {2}C3 /,
});

/* ---- fechamento: dist volta a corresponder a src ---- */
rmSync(join(raiz, "dist"), { recursive: true, force: true });
execFileSync("npm", ["run", "build:platform"], { cwd: raiz, encoding: "utf8", timeout: 600_000 });

const total = passaram + falhas.length;
console.log(`\n${passaram}/${total} · ${cegas} mutacao(oes) cega(s)`);
for (const f of falhas) console.log(`  XX ${f}`);
if (cegas > 0) {
  console.error("\nMUTACAO CEGA — o gate nao protege o que diz proteger.");
  process.exit(1);
}
if (falhas.length) {
  console.error("\nQ016_MUTATIONS_RED");
  process.exit(1);
}
console.log("\nQ016_MUTATIONS_GREEN");
