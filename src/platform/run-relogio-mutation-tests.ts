/**
 * RELÓGIO DO APARELHO — SUÍTE ADVERSARIAL.
 *
 * Cada mutação devolve um defeito que a regra do relógio existe para impedir,
 * e `test:platform:relogio` tem de cair PELA PROPRIEDADE atacada — a
 * assinatura exige o teste que a guarda. Mutação que deixa o gate verde é
 * CEGA, e cega é vermelho aqui.
 *
 * Mesma mecânica de `run-cadeia-mutation-tests.ts`: âncora com ocorrência
 * ÚNICA, disco relido, `dist/` reconstruído quando a mutação toca código que o
 * binário carrega, restauração byte a byte conferida por SHA-256.
 *
 *   M1  +24 h continua trusted
 *   M2  ponto futuro fabrica frescor
 *   M3  o replay volta a confiar num relógio já classificado como não confiável
 *   M4  ponto temporalmente suspeito é descartado
 *   M5  o occurred_at original é reescrito e a evidência se perde
 *   M6  relógio correto (ponto offline antigo) classificado como não confiável
 *   M7  ausência de classificação cai para trusted (o padrão da coluna)
 *   M8  o último lote volta a ser escolhido pelo relógio do aparelho
 *   M9  Entregas volta a medir o frescor pelo relógio do aparelho
 *   M10 o carimbo padrão do histórico volta a dar autoridade ao relógio
 *   M11 a mensagem da outbox perde os carimbos do servidor
 *   M12 o replay perde os carimbos do servidor
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
let passaram = 0;
let cegas = 0;
const falhas: string[] = [];

console.log("\n=== RELOGIO DO APARELHO — SUITE ADVERSARIAL ===\n");

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

const GATE = "src/platform/run-relogio-tests.ts";

function construir(): void {
  execFileSync("npm", ["run", "-s", "build:platform"], { cwd: raiz, encoding: "utf8", timeout: 600_000, stdio: ["ignore", "pipe", "pipe"] });
}

function rodar(): { ok: boolean; saida: string } {
  try {
    const saida = execFileSync("npx", ["tsx", GATE], { cwd: raiz, encoding: "utf8", timeout: 900_000, env: { ...process.env } });
    if (/PULADO/.test(saida)) return { ok: false, saida: `__PULADO__${saida}` };
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (saida.trim() === "") return { ok: false, saida: `__SPAWN_FALHOU__ ${err.code ?? "?"}` };
    return { ok: false, saida };
  }
}

interface Edicao { arquivo: string; de: string; para: string }
interface Aplicada { arquivo: string; original: string; hash: string }

function aplicar(edicoes: readonly Edicao[]): Aplicada[] {
  const feitas: Aplicada[] = [];
  const vistos = new Set<string>();
  try {
    for (const e of edicoes) {
      const caminho = join(raiz, e.arquivo);
      if (!vistos.has(e.arquivo)) {
        const original = readFileSync(caminho, "utf8");
        vistos.add(e.arquivo);
        feitas.push({ arquivo: e.arquivo, original, hash: sha(original) });
      }
      const atual = readFileSync(caminho, "utf8");
      const n = atual.split(e.de).length - 1;
      assert.equal(n, 1, `MUTACAO NAO APLICADA: âncora com ${n} ocorrência(s) em ${e.arquivo}: ${e.de.slice(0, 70)}`);
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

/** O binário carrega estes diretórios: mutação neles exige reconstruir `dist/`. */
const NO_BINARIO = /^src\/platform\/(auth|ingest|bin|runtime|persistence|projections|contracts)\//;

/** `RELOGIO_MUT=M2,M4` roda só estas. */
const SOMENTE = (process.env.RELOGIO_MUT ?? "").split(",").map((x) => x.trim()).filter(Boolean);

function mutacao(o: { id: string; propriedade: string; edicoes: Edicao[]; assinatura: RegExp }): void {
  if (SOMENTE.length && !SOMENTE.includes(o.id)) return;
  teste(`${o.id} — ${o.propriedade}`, () => {
    const feitas = aplicar(o.edicoes);
    const precisaBuild = o.edicoes.some((e) => NO_BINARIO.test(e.arquivo));
    console.log(`        aplicada · ${feitas.map((f) => `${f.arquivo.split("/").pop()} ${f.hash.slice(0, 8)}`).join(" · ")}${precisaBuild ? " · dist/ reconstruído" : ""}`);
    try {
      if (precisaBuild) construir();
      const r = rodar();
      assert.doesNotMatch(r.saida, /__SPAWN_FALHOU__|__PULADO__/, `o gate não mediu:\n${r.saida.slice(0, 600)}`);
      if (r.ok) {
        cegas += 1;
        assert.fail("o gate relogio ficou VERDE com o defeito restaurado — MUTACAO CEGA");
      }
      assert.match(r.saida, o.assinatura, `reprovou, mas NÃO pela assinatura esperada:\n${r.saida.slice(-900)}`);
      const perdas = r.saida.split("\n").filter((l) => /^ {2}XX {2}\S/.test(l)).map((l) => l.trim().slice(4).split(" ")[0]);
      console.log(`        acusaram · ${perdas.join(" ")}`);
    } finally {
      restaurar(feitas);
      if (precisaBuild) construir();
      console.log(`        restaurado · ${feitas.length} arquivo(s) == origem${precisaBuild ? " · dist/ reconstruído" : ""}`);
    }
  });
}

/* ---- controle positivo ---- */
console.log("0. CONTROLE POSITIVO");
teste("dist/ é desta árvore e o gate relogio está verde ANTES de qualquer mutação", () => {
  construir();
  const r = rodar();
  assert.ok(r.ok, `gate já vermelho antes de mutar:\n${r.saida.slice(-900)}`);
});
if (falhas.length) {
  console.error("\nO gate precisa estar verde ANTES das mutacoes. Abortado.");
  process.exit(1);
}

const RELOGIO = "src/platform/contracts/relogio.ts";
const PROJECAO = "src/platform/projections/operacao-viva.ts";
const REPLAY = "src/platform/projections/replay-do-event-log.ts";
const INGESTAO = "src/platform/ingest/ingest-service.ts";
const ESCRITOR = "src/platform/persistence/pg-repositories.ts";
const PORTA = "src/platform/leitura/realidade-de-entregas.ts";
const VM = "src/product/viewmodels/entregas-vm.ts";

/* ================================================================== */
console.log("\n1. O JULGAMENTO");

mutacao({
  id: "M1",
  propriedade: "+24 h continua trusted — a tolerância engole o dia",
  edicoes: [{ arquivo: RELOGIO, de: "export const TOLERANCIA_DO_RELOGIO_MS = 120_000;\n", para: "export const TOLERANCIA_DO_RELOGIO_MS = 120_000 * 1000;\n" }],
  assinatura: /XX {2}R2 /,
});

mutacao({
  id: "M6",
  propriedade: "relógio correto classificado como não confiável — a regra simétrica do piloto julga o ponto offline antigo",
  edicoes: [{
    arquivo: RELOGIO,
    de: '  return ocorreu - recebeu > tolerancia_ms ? "suspect" : "trusted";\n',
    para: '  return Math.abs(ocorreu - recebeu) > tolerancia_ms ? "suspect" : "trusted";\n',
  }],
  assinatura: /XX {2}R2 /,
});

mutacao({
  id: "M7",
  propriedade: "ausência de classificação cai para trusted — o escritor omite a coluna e o padrão da 0001 carimba",
  edicoes: [
    {
      arquivo: ESCRITOR,
      de: "                sequence_local, contract_version, source_mode, clock_trust)\n             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)\n",
      para: "                sequence_local, contract_version, source_mode)\n             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)\n",
    },
    {
      arquivo: ESCRITOR,
      de: '              // Sem `?? "trusted"`: o padrão da coluna era exatamente o defeito.\n              f.clock_trust,\n',
      para: "",
    },
  ],
  assinatura: /XX {2}R2 /,
});

/* ================================================================== */
console.log("\n2. A EVIDENCIA");

mutacao({
  id: "M4",
  propriedade: "ponto temporalmente suspeito é descartado completamente",
  edicoes: [{
    arquivo: INGESTAO,
    de: "  const r = await o.escritor.commit(paraGravar, mensagens);\n",
    para:
      "  const r = await o.escritor.commit(\n" +
      '    paraGravar.filter((f) => f.clock_trust !== "suspect"),\n' +
      '    mensagens.filter((m) => m.payload.clock_trust !== "suspect"),\n' +
      "  );\n",
  }],
  assinatura: /XX {2}R1 /,
});

mutacao({
  id: "M5",
  propriedade: "o occurred_at original é reescrito com a hora do servidor e a evidência se perde",
  edicoes: [{
    arquivo: INGESTAO,
    de: "      payload: e.payload,\n      occurred_at: e.occurred_at,\n",
    para: '      payload: e.payload,\n      occurred_at: relogioDe(e) === "suspect" ? recebidoEm : e.occurred_at,\n',
  }],
  assinatura: /XX {2}R3 /,
});

/* ================================================================== */
console.log("\n3. O FRESCOR");

mutacao({
  id: "M2",
  propriedade: "ponto futuro fabrica frescor — a projeção volta a usar o occurred_at do aparelho",
  edicoes: [{ arquivo: PROJECAO, de: "    const instante = ehPosicao ? instanteConfiavel(ev) : undefined;\n", para: "    const instante = ehPosicao ? ev.occurred_at : undefined;\n" }],
  assinatura: /XX {2}R5 /,
});

mutacao({
  id: "M3",
  propriedade: "o replay volta a confiar num relógio já classificado como não confiável",
  edicoes: [
    {
      arquivo: REPLAY,
      de: "          received_at: l.recorded_at instanceof Date ? l.recorded_at.toISOString() : l.recorded_at ?? undefined,\n",
      para: "          received_at: instante.toISOString(),\n",
    },
    { arquivo: REPLAY, de: "          clock_trust: l.clock_trust ?? undefined,\n", para: '          clock_trust: "trusted",\n' },
  ],
  assinatura: /XX {2}R6 /,
});

mutacao({
  id: "M10",
  propriedade: "o carimbo padrão do histórico volta a dar autoridade ao relógio — o consumidor para de conferir os instantes",
  edicoes: [{
    arquivo: RELOGIO,
    de: '  if (carimbo === "suspect" || medido === "suspect") return "suspect";\n',
    para: '  if (carimbo === "suspect") return "suspect";\n',
  }],
  assinatura: /XX {2}R8 /,
});

/* ================================================================== */
console.log("\n4. A FRONTEIRA DA INGESTAO");

mutacao({
  id: "M11",
  propriedade: "a mensagem da outbox perde os carimbos do servidor — o consumidor ao vivo cai no caminho sem julgamento",
  edicoes: [{ arquivo: INGESTAO, de: "      received_at: recebidoEm,\n      clock_trust: relogioDe(e),\n", para: "" }],
  assinatura: /XX {2}R9 /,
});

mutacao({
  id: "M12",
  propriedade: "o replay perde os carimbos do servidor — a reconstrução cai no caminho sem julgamento",
  edicoes: [{
    arquivo: REPLAY,
    de: "          received_at: l.recorded_at instanceof Date ? l.recorded_at.toISOString() : l.recorded_at ?? undefined,\n          clock_trust: l.clock_trust ?? undefined,\n",
    para: "",
  }],
  assinatura: /XX {2}R9 /,
});

/* ================================================================== */
console.log("\n5. A SUPERFICIE");

mutacao({
  id: "M8",
  propriedade: "o último lote volta a ser escolhido pelo relógio do aparelho",
  edicoes: [{
    arquivo: PORTA,
    de: "        ORDER BY device_id, recorded_at DESC, sequence_local DESC NULLS LAST`,\n",
    para: "        ORDER BY device_id, occurred_at DESC, sequence_local DESC NULLS LAST`,\n",
  }],
  assinatura: /XX {2}R7 /,
});

mutacao({
  id: "M9",
  propriedade: "Entregas volta a medir o frescor do GPS pelo relógio do aparelho",
  edicoes: [{
    arquivo: VM,
    de: "      ? observado(classificarFrescor(instanteDoGps, agora), PROCEDENCIA_DO_MODO[modo], lidaEm)\n",
    para: "      ? observado(classificarFrescor(a.ultimo_lote.occurred_at, agora), PROCEDENCIA_DO_MODO[modo], lidaEm)\n",
  }],
  assinatura: /XX {2}R7 /,
});

const total = passaram + falhas.length;
console.log(`\n${passaram}/${total} · ${cegas} mutacao(oes) cega(s)`);
for (const f of falhas) console.log(`  XX ${f}`);
if (cegas > 0) {
  console.error("\nMUTACAO CEGA — o gate nao protege o que diz proteger.");
  process.exit(1);
}
if (falhas.length) {
  console.error("\nRELOGIO_MUTATIONS_RED");
  process.exit(1);
}
console.log("\nRELOGIO_MUTATIONS_GREEN");
