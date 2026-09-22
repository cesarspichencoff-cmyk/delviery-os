/**
 * MUTAÇÕES DA POLÍTICA DE EVIDÊNCIAS · LAB V4 (D4)
 * ============================================================================
 * Controle verde não prova nada sozinho. Cada mutação aqui **restaura o
 * defeito** no disco e exige que a propriedade se perca de forma observável —
 * se ela continua valendo com o defeito de volta, o controle correspondente
 * era decorativo.
 *
 * TODA mutação é exercitada contra uma RAIZ ESPELHO, onde o diretório de
 * evidências é CÓPIA. Isso não é zelo: a primeira versão da suíte de controle
 * rodava dois casos contra o repositório, um deles tinha um defeito, e ela
 * **publicou por cima dos 12 PNGs versionados** — o D4, cometido pela
 * ferramenta escrita para impedi-lo. Aqui o patrimônio nunca é o alvo, e é
 * medido no fim assim mesmo.
 *
 * Nenhuma mutação procura palavra em arquivo. Todas trocam **comportamento**.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { impressao, raizEspelho } from "./raiz-espelho";

const raiz = process.cwd();
const EVID = join(raiz, "labs", "operacao-viva-v4", "evidencias");
const GATE_ARQ = "labs/operacao-viva-v4/testes/run-lab-v4-browser.ts";
const REFRESH_ARQ = "labs/operacao-viva-v4/testes/refrescar-evidencias.ts";

const falhas: string[] = [];
let passaram = 0;
let cegas = 0;

const REFERENCIA = impressao(EVID);

console.log("\n=== D4 — MUTACOES DA POLITICA DE EVIDENCIAS ===\n");
console.log(`patrimonio: ${REFERENCIA.slice(0, 16)} (nunca e o alvo, e e conferido no fim)\n`);

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

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

interface Aplicacao {
  original: string;
  hashAntes: string;
}

function aplicar(rel: string, de: string, para: string): Aplicacao {
  const caminho = join(raiz, rel);
  const original = readFileSync(caminho, "utf8");
  const hashAntes = sha(original);
  assert.ok(original.includes(de), `MUTACAO NAO APLICADA: ancora ausente em ${rel}`);
  const mutado = original.replace(de, () => para);
  assert.notEqual(mutado, original, "MUTACAO NAO APLICADA: a troca nao mudou nada");
  writeFileSync(caminho, mutado);
  const noDisco = readFileSync(caminho, "utf8");
  assert.notEqual(sha(noDisco), hashAntes, "MUTACAO NAO APLICADA: o disco nao confirmou");
  return { original, hashAntes };
}

function restaurar(rel: string, a: Aplicacao): void {
  writeFileSync(join(raiz, rel), a.original);
  assert.equal(
    sha(readFileSync(join(raiz, rel), "utf8")),
    a.hashAntes,
    `RESTAURACAO FALHOU em ${rel} — o repositorio ficou mutado`,
  );
}

function rodar(script: string, cwd: string, env: NodeJS.ProcessEnv, limiteMs = 1_800_000) {
  const r = spawnSync("npx", ["tsx", script], {
    cwd,
    encoding: "utf8",
    timeout: limiteMs,
    env: { ...process.env, ...env },
  });
  return { status: r.status, saida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/**
 * Aplica a mutação, exercita, e exige que `perdeu()` confirme a perda da
 * propriedade. `perdeu()` roda na RAIZ ESPELHO e devolve `true` quando o
 * defeito voltou a doer — nunca lendo o código, sempre medindo o efeito.
 */
function mutacao(o: {
  id: string;
  propriedade: string;
  arquivo: string;
  de: string;
  para: string;
  perdeu: (e: ReturnType<typeof raizEspelho>) => { perdeu: boolean; como: string };
}): void {
  teste(`${o.id} — ${o.propriedade}`, () => {
    const a = aplicar(o.arquivo, o.de, o.para);
    console.log(`        aplicada · ${o.arquivo} · ${a.hashAntes.slice(0, 10)}`);
    try {
      const espelho = raizEspelho(raiz);
      const r = o.perdeu(espelho);
      if (!r.perdeu) {
        cegas += 1;
        assert.fail(`a propriedade SOBREVIVEU ao defeito restaurado — CONTROLE CEGO (${r.como})`);
      }
      console.log(`        perda observada · ${r.como}`);
    } finally {
      restaurar(o.arquivo, a);
      console.log(`        restaurado · ${a.hashAntes.slice(0, 10)} == origem`);
    }
  });
}

/* ================================================================== */
console.log("1. A ORDEM — apagar antes de abrir o navegador");

mutacao({
  id: "MD1",
  propriedade: "voltar a limpar ANTES do launch destroi evidencia quando o navegador nao abre",
  arquivo: GATE_ARQ,
  de: `    browser = await chromium.launch(EXECUTAVEL !== "" ? { executablePath: EXECUTAVEL } : {});
    procedencia = await procedenciaMedida(browser);

    rmSync(EVID, { recursive: true, force: true });
    mkdirSync(EVID, { recursive: true });`,
  para: `    rmSync(EVID, { recursive: true, force: true });
    mkdirSync(EVID, { recursive: true });

    browser = await chromium.launch(EXECUTAVEL !== "" ? { executablePath: EXECUTAVEL } : {});
    procedencia = await procedenciaMedida(browser);`,
  perdeu: (e) => {
    // Destino DECLARADO, com uma copia das evidencias dentro — e nao o
    // `evidencias/` do espelho. A primeira versao apontou para o proprio
    // `evidencias/` e a RECUSA disparou primeiro (saida 2), salvando a copia:
    // o exercicio media a recusa, nao a ordem, e dava controle cego por
    // engano. Cada mutacao precisa exercitar UMA propriedade.
    const destino = join(e.base, "copia-de-evidencias");
    cpSync(e.evidencias, destino, { recursive: true });
    const antes = impressao(destino);
    const r = rodar(GATE_ARQ, e.base, {
      LAB_V4_EVIDENCIAS: destino,
      LAB_V4_CHROMIUM: "/nao/existe/chrome",
    }, 600_000);
    assert.notEqual(r.status, 0, "o gate ficou verde sem navegador — o exercicio nao valeu");
    const sobrou = existsSync(destino) ? readdirSync(destino).length : 0;
    const igual = existsSync(destino) && impressao(destino) === antes;
    return { perdeu: !igual, como: `restaram ${sobrou} de 14 arquivo(s) no destino declarado` };
  },
});

/* ================================================================== */
console.log("\n2. O PADRAO — diretorio versionado como destino do gate normal");

mutacao({
  id: "MD2",
  propriedade: "voltar o padrao para o diretorio versionado faz o gate normal reescrever evidencia",
  arquivo: GATE_ARQ,
  de: `const EVID = EVID_E_TEMPORARIO
  ? mkdtempSync(join(tmpdir(), "lab-v4-evidencias-"))
  : resolve(EVID_DECLARADO);`,
  para: `const EVID = EVID_E_TEMPORARIO ? EVIDENCIAS_VERSIONADAS : resolve(EVID_DECLARADO);`,
  perdeu: (e) => {
    // Sem variavel nenhuma: exatamente `npm run test:lab:v4:browser`. Na raiz
    // espelho, `EVIDENCIAS_VERSIONADAS` e a COPIA.
    const antes = impressao(e.evidencias);
    const r = rodar(GATE_ARQ, e.base, { DELIVERYOS_COMMIT: "mutacao" });
    assert.equal(r.status, 0, `o gate nao rodou:\n${r.saida.slice(-500)}`);
    // Sumir conta como perda, e foi o que aconteceu: com o padrao revertido, o
    // proprio descarte do "temporario" no fim do gate apaga o diretorio
    // versionado inteiro. Medir so por hash estourava em `scandir` e virava
    // erro de instrumento em vez de defeito observado.
    if (!existsSync(e.evidencias)) {
      return { perdeu: true, como: "o gate normal APAGOU o diretorio versionado inteiro" };
    }
    return {
      perdeu: impressao(e.evidencias) !== antes,
      como: `o gate normal reescreveu o conjunto (${readdirSync(e.evidencias).length} arquivo(s))`,
    };
  },
});

/* ================================================================== */
console.log("\n3. A RECUSA — apontar o gate normal para o patrimonio");

mutacao({
  id: "MD3",
  propriedade: "remover a recusa deixa LAB_V4_EVIDENCIAS escrever no diretorio versionado",
  arquivo: GATE_ARQ,
  de: `    process.exit(2);`,
  para: `    void 0;`,
  perdeu: (e) => {
    const antes = impressao(e.evidencias);
    const r = rodar(GATE_ARQ, e.base, { LAB_V4_EVIDENCIAS: e.evidencias, DELIVERYOS_COMMIT: "mutacao" });
    return {
      perdeu: r.status !== 2 && impressao(e.evidencias) !== antes,
      como: `saiu ${r.status} e reescreveu o conjunto versionado`,
    };
  },
});

/* ================================================================== */
console.log("\n4. O REFRESH — publicar sem geracao completa");

mutacao({
  id: "MD4",
  propriedade: "ignorar o codigo de saida do gate publica em cima de geracao reprovada",
  arquivo: REFRESH_ARQ,
  de: `if (r.status !== 0) {
  morrer(\`o gate de navegador terminou em \${r.status} — geração incompleta ou prova vermelha\`);
}`,
  para: `if (r.status !== 0) {
  console.log("[refresh] gate reprovado, seguindo assim mesmo (mutacao)");
}`,
  perdeu: (e) => {
    // O caso que torna esta guarda carga, e nao enfeite: geracao COMPLETA e
    // prova VERMELHA. Com navegador ausente a geracao nem comeca, e a
    // conferencia de manifesto barra sozinha — a primeira versao media isso e
    // acusava controle cego por engano, quando o que havia era um segundo
    // guarda. Aqui as 12 capturas existem, o manifesto existe, e so o codigo
    // de saida separa uma publicacao provada de uma nao provada.
    const gate = join(raiz, GATE_ARQ);
    const orig = readFileSync(gate, "utf8");
    const tardia = orig.replace(
      "assert.equal(await requisitar(m, `${BASE}/api/cenas`), 405, `${m} não deu 405`);",
      "assert.equal(await requisitar(m, `${BASE}/api/cenas`), 406, `${m} não deu 406`);",
    );
    assert.notEqual(tardia, orig, "nao consegui quebrar uma prova TARDIA — exercicio invalido");
    writeFileSync(gate, tardia);
    try {
      const antes = impressao(e.evidencias);
      const r = rodar(REFRESH_ARQ, e.base, { DELIVERYOS_COMMIT: "mutacao" });
      const n = readdirSync(e.evidencias).filter((f) => f.endsWith(".png")).length;
      return {
        perdeu: r.status === 0 && n === 12 && impressao(e.evidencias) !== antes,
        como: `saiu ${r.status} e publicou ${n} captura(s) de uma execucao com prova VERMELHA`,
      };
    } finally {
      writeFileSync(gate, orig);
      assert.equal(sha(readFileSync(gate, "utf8")), sha(orig), "restauracao do gate falhou");
    }
  },
});

mutacao({
  id: "MD5",
  propriedade: "remover a conferencia nome a nome publica conjunto incompleto",
  arquivo: REFRESH_ARQ,
  de: `if (faltando.length > 0) morrer(\`faltam \${faltando.length} captura(s): \${faltando.join(", ")}\`);`,
  para: `if (faltando.length > 999) morrer("nunca");`,
  perdeu: (e) => {
    // Cenas reduzidas: o gate gera menos que o manifesto declara. Com a
    // conferencia no lugar o refresh recusa; sem ela, publica um conjunto
    // que nao esta inteiro.
    const antes = impressao(e.evidencias);
    const gate = join(raiz, GATE_ARQ);
    const orig = readFileSync(gate, "utf8");
    const menos = orig.replace(
      `const CENAS_CAPTURADAS = [
  "calma-real",
  "sushi-quentes-isolado",
  "ausencia-de-dados",
  "recomendacao-corrigida",
] as const;`,
      `const CENAS_CAPTURADAS = ["calma-real", "sushi-quentes-isolado", "ausencia-de-dados"] as const;`,
    );
    assert.notEqual(menos, orig, "nao consegui reduzir as cenas — exercicio invalido");
    writeFileSync(gate, menos);
    try {
      const r = rodar(REFRESH_ARQ, e.base, { DELIVERYOS_COMMIT: "mutacao" });
      const n = readdirSync(e.evidencias).filter((f) => f.endsWith(".png")).length;
      return {
        perdeu: r.status === 0 && n !== 12 && impressao(e.evidencias) !== antes,
        como: `saiu ${r.status} e publicou ${n} captura(s) em vez de 12`,
      };
    } finally {
      writeFileSync(gate, orig);
      assert.equal(sha(readFileSync(gate, "utf8")), sha(orig), "restauracao do gate falhou");
    }
  },
});

/* ================================================================== */
console.log("\n5. O FILTRO DE CONSOLE — build alternativo vira vermelho");

mutacao({
  id: "MD6",
  propriedade: "filtrar o console so pelo texto reprova o gate conforme o BUILD do navegador",
  arquivo: GATE_ARQ,
  de: `  if (/favicon/i.test(texto) || /\\/favicon\\.ico(\\?|$)/i.test(url)) return false;`,
  para: `  if (/favicon/i.test(texto)) return false;`,
  perdeu: (e) => {
    const alternativo = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
    if (!existsSync(alternativo)) return { perdeu: true, como: "PULADO: sem binario alternativo neste ambiente" };
    const destino = join(e.base, "saida-alternativa");
    const r = rodar(GATE_ARQ, e.base, {
      LAB_V4_CHROMIUM: alternativo,
      LAB_V4_EVIDENCIAS: destino,
      DELIVERYOS_COMMIT: "mutacao",
    });
    return {
      perdeu: r.status !== 0 && /404/.test(r.saida),
      como: `o build alternativo reprovou o gate (saida ${r.status}) por 404 de favicon`,
    };
  },
});

/* ---- fechamento ---- */
const total = passaram + falhas.length;
console.log(`\n${passaram}/${total} · ${cegas} controle(s) cego(s)`);
console.log(
  `patrimonio no fim: ${impressao(EVID).slice(0, 16)} ${impressao(EVID) === REFERENCIA ? "== referencia" : "!! MUDOU"}`,
);
for (const f of falhas) console.log(`  XX ${f}`);

if (impressao(EVID) !== REFERENCIA) {
  console.error("\nD4_MUTACOES_RED — as mutacoes alcancaram o patrimonio.");
  process.exit(1);
}
if (cegas > 0) {
  console.error("\nCONTROLE CEGO — a suite de D4 nao protege o que diz proteger.");
  process.exit(1);
}
if (falhas.length > 0) {
  console.error("\nD4_MUTACOES_RED");
  process.exit(1);
}
console.log("\nD4_MUTACOES_GREEN");
