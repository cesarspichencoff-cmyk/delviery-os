/**
 * Q-017 — SUÍTE ADVERSARIAL DO MODO DA INSTÂNCIA.
 * ============================================================================
 * Cada mutação devolve ao código uma forma de um fato virar `real` sem que
 * ninguém tenha declarado — ou de o modo de hoje reescrever o de ontem — e
 * exige que um gate acuse, pela ASSINATURA do teste certo. Zero mutações
 * cegas.
 *
 * Os mesmos cuidados do PB19 e da Q-016:
 *   - mutação que não entrou no disco não conta (âncora conferida, disco
 *     relido); gate que nem rodou não conta;
 *   - reprovar por outro motivo NÃO conta: a assinatura é o ID do teste que
 *     defende a propriedade — e, quando duas camadas deveriam acusar, a
 *     assinatura exige as DUAS, na ordem em que o gate as imprime;
 *   - mutação que exercita BINÁRIO apaga `dist/` e reconstrói — sem isso, um
 *     `dist/` velho deixaria a mutação cega (MP3 no PB19);
 *   - restauração byte a byte, conferida por SHA-256.
 *
 * Nenhum detector procura palavra no código. Todos medem comportamento: o
 * binário compilado contra PostgreSQL real (`test:platform:q017`), o
 * renderizador do próprio compose (`test:platform:q017:compose`) ou a função
 * pura chamada com a entrada que importa.
 *
 * Exige `DELIVERYOS_PG_URL` e o plugin `docker compose` (sem daemon).
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

console.log("\n=== Q-017 — SUITE ADVERSARIAL DO MODO DA INSTANCIA ===\n");

if (!(process.env.DELIVERYOS_PG_URL ?? "").trim()) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — o gate atacado precisa de PostgreSQL real.");
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

type Gate = "processos" | "compose";
const SCRIPT: Record<Gate, string> = {
  processos: "src/platform/run-q017-source-mode-tests.ts",
  compose: "src/platform/run-q017-compose-tests.ts",
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
    // Um gate que PULA sai 0 sem ter medido nada: isso não é verde.
    if (/PULADO/.test(saida)) return { ok: false, saida: `__PULADO__${saida}` };
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (saida.trim() === "") return { ok: false, saida: `__SPAWN_FALHOU__ ${err.code ?? "?"}` };
    return { ok: false, saida };
  }
}

interface Edicao {
  arquivo: string;
  de: string;
  para: string;
}

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
      const ocorrencias = atual.split(e.de).length - 1;
      assert.equal(ocorrencias, 1, `MUTACAO NAO APLICADA: âncora com ${ocorrencias} ocorrência(s) em ${e.arquivo}: ${e.de.slice(0, 70)}`);
      const novo = atual.replace(e.de, () => e.para);
      assert.notEqual(novo, atual, `MUTACAO NAO APLICADA: a troca não mudou ${e.arquivo}`);
      writeFileSync(caminho, novo);
      assert.equal(readFileSync(caminho, "utf8"), novo, `MUTACAO NAO APLICADA: o disco não confirmou ${e.arquivo}`);
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
      assert.doesNotMatch(r.saida, /__SPAWN_FALHOU__|__PULADO__|__BUILD__/, `o gate não mediu:\n${r.saida.slice(0, 600)}`);
      if (r.ok) {
        cegas += 1;
        assert.fail(`o gate ${o.gate} ficou VERDE com o defeito restaurado — MUTACAO CEGA`);
      }
      assert.match(r.saida, o.assinatura, `reprovou, mas NÃO pela assinatura esperada:\n${r.saida.slice(-900)}`);
      // Quem acusou, com a mensagem — "reprovou pela assinatura" sozinho não
      // diz se foi pelo MOTIVO certo.
      const perdas = r.saida
        .split("\n")
        .filter((l) => /^ {2}XX {2}\S/.test(l))
        .map((l) => l.trim().slice(4).split(" ")[0]);
      console.log(`        acusaram · ${perdas.join(" ")}`);
    } finally {
      restaurar(feitas);
      console.log(`        restaurado · ${feitas.length} arquivo(s) == origem`);
    }
  });
}

/* ---- controle positivo: os dois gates verdes ANTES de mutar ---- */
console.log("0. CONTROLE POSITIVO");
for (const g of ["processos", "compose"] as const) {
  teste(`o gate ${g} está verde ANTES de qualquer mutação`, () => {
    const r = rodar(g);
    assert.ok(r.ok, `gate ${g} já vermelho antes de mutar:\n${r.saida.slice(-900)}`);
  });
}
if (falhas.length) {
  console.error("\nOs gates precisam estar verdes ANTES das mutacoes. Abortado.");
  for (const f of falhas) console.error(`  ${f}`);
  process.exit(1);
}

const CRITICO = "src/platform/bin/critical.ts";
const LEITOR = "src/platform/config/modo-da-instancia.ts";
const CONFIG = "src/platform/config/platform-config.ts";
const COMPOSE = "deploy/compose.platform.yaml";
const ENVELOPE = "src/platform/ingest/device-ingest.ts";
const PORTA = "src/platform/projections/replay-do-event-log.ts";

const LINHA_DO_COMPOSE = "      DELIVERYOS_SOURCE_MODE: ${DELIVERYOS_SOURCE_MODE:?source mode obrigatorio}\n";

/* ================================================================== */
console.log("\n1. AUSENTE NAO E REAL");

mutacao({
  id: "M1",
  propriedade: "o `?? \"real\"` volta ao crítico — o defeito ORIGINAL, validação intacta",
  gate: "processos",
  edicoes: [
    {
      arquivo: CRITICO,
      de: "    modoDaInstancia = lerModoDaInstancia();\n",
      para:
        '    const bruto = (process.env.DELIVERYOS_SOURCE_MODE ?? "real").trim();\n' +
        "    modoDaInstancia = lerModoDaInstancia({ ...process.env, DELIVERYOS_SOURCE_MODE: bruto });\n",
    },
  ],
  assinatura: /XX {2}A1 /,
});

mutacao({
  id: "M2",
  propriedade: "o padrão real mora no HELPER — o leitor do modo",
  gate: "processos",
  edicoes: [{ arquivo: LEITOR, de: "  const bruto = env[VARIAVEL_DO_MODO];\n", para: '  const bruto = env[VARIAVEL_DO_MODO] ?? "real";\n' }],
  // As duas camadas: a função e o binário que a chama.
  assinatura: /XX {2}U1 [\s\S]*XX {2}A1 /,
});

mutacao({
  id: "M2b",
  propriedade: "o padrão real mora na CONFIG — loadPlatformConfig o injeta no ambiente",
  gate: "processos",
  edicoes: [
    {
      arquivo: CONFIG,
      de: "export function loadPlatformConfig(env: NodeJS.ProcessEnv = process.env): PlatformConfig {\n",
      para:
        "export function loadPlatformConfig(env: NodeJS.ProcessEnv = process.env): PlatformConfig {\n" +
        '  if (env.DELIVERYOS_SOURCE_MODE === undefined) env.DELIVERYOS_SOURCE_MODE = "real";\n',
    },
  ],
  // O teste da função NÃO vê isto (ela recebe o ambiente pronto). Só o
  // binário — que passa pela config antes do leitor — acusa.
  assinatura: /XX {2}A1 /,
});

mutacao({
  id: "M3",
  propriedade: "o compose deixa de EXIGIR — `:-real` põe o padrão na composição",
  gate: "compose",
  edicoes: [
    {
      arquivo: COMPOSE,
      de: LINHA_DO_COMPOSE,
      para: "      DELIVERYOS_SOURCE_MODE: ${DELIVERYOS_SOURCE_MODE:-real}\n",
    },
  ],
  assinatura: /XX {2}K1 /,
});

mutacao({
  id: "M3b",
  propriedade: "o compose deixa de PASSAR a variável ao crítico",
  gate: "compose",
  edicoes: [{ arquivo: COMPOSE, de: LINHA_DO_COMPOSE, para: "" }],
  assinatura: /XX {2}K1 [\s\S]*XX {2}K3 /,
});

mutacao({
  id: "M4",
  propriedade: "VAZIO cai para real",
  gate: "processos",
  edicoes: [{ arquivo: LEITOR, de: "  const valor = bruto.trim();\n", para: '  const valor = bruto.trim() || "real";\n' }],
  assinatura: /XX {2}U2 [\s\S]*XX {2}B1 /,
});

mutacao({
  id: "M5",
  propriedade: "valor DESCONHECIDO é aceito — e vira real",
  gate: "processos",
  edicoes: [
    {
      arquivo: LEITOR,
      de: "  if (!(SOURCE_MODES as readonly string[]).includes(valor)) {\n",
      para: '  if (!(SOURCE_MODES as readonly string[]).includes(valor)) return "real";\n  if (valor.length < 0) {\n',
    },
  ],
  assinatura: /XX {2}U3 [\s\S]*XX {2}C1 /,
});

/* ================================================================== */
console.log("\n2. O MODO DECLARADO CHEGA INTACTO AO FATO");

mutacao({
  id: "M6",
  propriedade: "instância simulated persiste o fato como real",
  gate: "processos",
  edicoes: [
    {
      arquivo: ENVELOPE,
      de: "      source_mode: args.source_mode,\n",
      para: '      source_mode: args.source_mode === "simulated" ? "real" : args.source_mode,\n',
    },
  ],
  assinatura: /XX {2}D\/E\/F-1 /,
});

mutacao({
  id: "M7",
  propriedade: "instância control persiste o fato como real",
  gate: "processos",
  edicoes: [
    {
      arquivo: ENVELOPE,
      de: "      source_mode: args.source_mode,\n",
      para: '      source_mode: args.source_mode === "control" ? "real" : args.source_mode,\n',
    },
  ],
  assinatura: /XX {2}D\/E\/F-1 /,
});

/* ================================================================== */
console.log("\n3. O MODO DE HOJE NAO REESCREVE O DE ONTEM");

mutacao({
  id: "M8",
  propriedade: "o replay reclassifica o fato antigo pelo modo do PROCESSO atual",
  gate: "processos",
  edicoes: [
    {
      arquivo: PORTA,
      de: "      const modo = l.source_mode;\n",
      para: "      const modo = (process.env.DELIVERYOS_SOURCE_MODE as string | undefined) || l.source_mode;\n",
    },
  ],
  assinatura: /XX {2}G1 /,
});

mutacao({
  id: "M9",
  propriedade: "histórico sem modo (NULL) é lido como real",
  gate: "processos",
  edicoes: [{ arquivo: PORTA, de: "      const modo = l.source_mode;\n", para: '      const modo = l.source_mode ?? "real";\n' }],
  assinatura: /XX {2}H1 /,
});

mutacao({
  id: "M10",
  propriedade: "a variável VAZA para serviços que não carimbam fato (x-ambiente)",
  gate: "compose",
  edicoes: [
    {
      arquivo: COMPOSE,
      de: '  DELIVERYOS_MIGRATE_ON_BOOT: "false"\n\nservices:',
      para: '  DELIVERYOS_MIGRATE_ON_BOOT: "false"\n' + LINHA_DO_COMPOSE.replace(/^ {6}/, "  ") + "\nservices:",
    },
  ],
  assinatura: /XX {2}K4 /,
});

/* ================================================================== */
console.log("\n4. A RECUSA VEM ANTES DE QUALQUER EFEITO, E O BOOT DIZ O MODO");

mutacao({
  id: "M11",
  propriedade: "o boot deixa de declarar o modo da instância",
  gate: "processos",
  edicoes: [
    {
      arquivo: CRITICO,
      de: "JSON.stringify({ ...describe(cfg), source_mode: modoDaInstancia })",
      para: "JSON.stringify(describe(cfg))",
    },
  ],
  assinatura: /XX {2}O1 /,
});

mutacao({
  id: "M12",
  propriedade: "a recusa volta para DEPOIS de conectar e migrar — a ordem antiga",
  gate: "processos",
  edicoes: [
    {
      arquivo: CRITICO,
      de: "    modoDaInstancia = lerModoDaInstancia();\n",
      para: "    modoDaInstancia = undefined as unknown as SourceMode;\n",
    },
    {
      arquivo: CRITICO,
      de: "  const escritor = new PgTransactionalWriter(cliente);\n",
      para:
        "  try {\n" +
        "    modoDaInstancia = lerModoDaInstancia();\n" +
        "  } catch (e) {\n" +
        "    console.error(`[critico] configuração recusada: ${(e as Error).message}`);\n" +
        "    await cliente.close();\n" +
        "    process.exit(78);\n" +
        "  }\n" +
        "  const escritor = new PgTransactionalWriter(cliente);\n",
    },
  ],
  // Sai 78, com o motivo certo — e ainda assim errado: depois do efeito.
  // Só A2 (banco vazio migrado) e A3 (conexão tentada) enxergam a ordem.
  assinatura: /XX {2}A2 [\s\S]*XX {2}A3 /,
});

mutacao({
  id: "M13",
  propriedade: "o erro volta a ecoar o valor inteiro — segredo fora do lugar vaza no log",
  gate: "processos",
  edicoes: [
    {
      arquivo: LEITOR,
      de: "    const visto = ECOAVEL.test(valor) ? `\"${valor}\"` : `valor de ${valor.length} caractere(s), não exibido`;\n",
      para: "    const visto = `\"${valor}\"`;\n",
    },
  ],
  assinatura: /XX {2}U6 [\s\S]*XX {2}C2 /,
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
  console.error("\nQ017_MUTATIONS_RED");
  process.exit(1);
}
console.log("\nQ017_MUTATIONS_GREEN");
