/**
 * CONTROLES ADVERSARIAIS DA POLÍTICA DE EVIDÊNCIAS · LAB V4 (D4)
 * ============================================================================
 * A política é curta: **rodar um teste nunca destrói evidência histórica, e
 * regenerar evidência histórica é ato explícito, completo e rastreável.**
 *
 * Um gate que só lesse o código e procurasse `rmSync` provaria nada — foi
 * exatamente a classe de erro que o PB19 teve de desfazer nas guardas do C3.
 * Aqui cada controle **executa** o caminho real e mede a impressão digital do
 * diretório versionado antes e depois: SHA-256 de cada arquivo, agregado. Se
 * um byte se mexer, o controle acusa.
 *
 * Não há, em lugar nenhum, comparação pixel a pixel entre builds de Chromium.
 * Builds diferentes desenham diferente, e transformar isso em vermelho faria o
 * repositório eleger um build canônico por acidente — que é o oposto da
 * decisão tomada.
 *
 * NENHUM CONTROLE RODA O REFRESH CONTRA O REPOSITÓRIO
 * ---------------------------------------------------
 * A primeira versão desta suíte rodava dois controles do refresh com
 * `cwd` no repositório, contando que cada um falhasse antes de publicar. Um
 * deles tinha um defeito — abria o servidor de bloqueio com `listen()`, que é
 * assíncrono, e emendava um `spawnSync`, que trava o event loop antes de a
 * porta ligar. O bloqueio nunca existiu, o gate rodou inteiro, e a suíte de
 * controle **publicou por cima dos 12 PNGs versionados**: o D4, cometido pela
 * ferramenta escrita para impedi-lo.
 *
 * A lição não é "corrigir aquele controle". É que um controle que PODE
 * alcançar o patrimônio vai alcançá-lo no dia em que tiver um defeito. Todo
 * exercício do refresh acontece numa RAIZ ESPELHO — o repositório inteiro por
 * symlink, com uma CÓPIA do diretório de evidências — e o patrimônio real é
 * medido depois de cada um, como rede final.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { impressao as impressaoDe, raizEspelho as espelhoDe } from "./raiz-espelho";

const raiz = process.cwd();
const EVID = join(raiz, "labs", "operacao-viva-v4", "evidencias");
const LAB = join(raiz, "labs", "operacao-viva-v4");
const GATE = "labs/operacao-viva-v4/testes/run-lab-v4-browser.ts";
const REFRESH = "labs/operacao-viva-v4/testes/refrescar-evidencias.ts";

let passaram = 0;
let pulados = 0;
const falhas: string[] = [];
const lixo: string[] = [];

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

/** A impressão digital do PATRIMÔNIO versionado deste repositório. */
function impressao(dir = EVID): string {
  return impressaoDe(dir);
}

function temporario(prefixo: string): string {
  const d = mkdtempSync(join(tmpdir(), prefixo));
  lixo.push(d);
  return d;
}

interface Execucao {
  status: number | null;
  saida: string;
}

function rodar(script: string, env: NodeJS.ProcessEnv, cwd = raiz, limiteMs = 1_800_000): Execucao {
  const r = spawnSync("npx", ["tsx", script], {
    cwd,
    encoding: "utf8",
    timeout: limiteMs,
    env: { ...process.env, ...env },
  });
  return { status: r.status, saida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** Estágios deixados para trás por uma execução morta no meio. */
function estagios(base = LAB): string[] {
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((n) => n.startsWith(".evidencias-staging-") || n.startsWith(".evidencias-velho-"))
    .map((n) => join(base, n));
}

/** Raiz espelho deste repositório, registrada para limpeza no fim. */
function raizEspelho(): { base: string; evidencias: string; lab: string } {
  const e = espelhoDe(raiz);
  lixo.push(e.base);
  return e;
}

const COMMIT = execFileSync("git", ["rev-parse", "HEAD"], { cwd: raiz, encoding: "utf8" }).trim();

console.log("\n=== D4 — POLITICA DE EVIDENCIAS DO LAB V4 ===\n");

const REFERENCIA = impressao();
console.log(`patrimonio: ${readdirSync(EVID).length} arquivo(s) · ${REFERENCIA.slice(0, 16)}\n`);

/* ================================================================== *
 * E1 — o gate normal NÃO pode nem ser apontado para o patrimônio
 * ================================================================== */
console.log("1. A RECUSA ESTRUTURAL");

teste("E1 o gate recusa LAB_V4_EVIDENCIAS apontando para o diretorio versionado", () => {
  const r = rodar(GATE, { LAB_V4_EVIDENCIAS: EVID }, raiz, 120_000);
  assert.equal(r.status, 2, `esperava recusa (2), veio ${r.status}:\n${r.saida.slice(-600)}`);
  assert.match(r.saida, /evidence:lab:v4:refresh/, "a recusa nao aponta o caminho certo");
  assert.equal(impressao(), REFERENCIA, "o patrimonio mudou numa execucao que deveria ter sido recusada");
});

teste("E2 a recusa nao se contorna por symlink nem por caminho com ..", () => {
  const atalho = join(temporario("d4-symlink-"), "aponta-para-o-patrimonio");
  symlinkSync(EVID, atalho);
  const porSymlink = rodar(GATE, { LAB_V4_EVIDENCIAS: atalho }, raiz, 120_000);
  assert.equal(porSymlink.status, 2, `symlink contornou a recusa: ${porSymlink.status}`);

  const rodeio = join(EVID, "..", "evidencias");
  const porRodeio = rodar(GATE, { LAB_V4_EVIDENCIAS: rodeio }, raiz, 120_000);
  assert.equal(porRodeio.status, 2, `caminho com .. contornou a recusa: ${porRodeio.status}`);

  assert.equal(impressao(), REFERENCIA, "o patrimonio mudou");
});

/* ================================================================== *
 * E3 — navegador inexistente: a reprodução literal do D4
 * ================================================================== */
console.log("\n2. NAVEGADOR QUE NAO ABRE");

teste("E3 navegador inexistente reprova o gate e NAO encosta no patrimonio", () => {
  // A reproducao do D4 como ele aconteceu: o Playwright procura um build que
  // nao existe. Antes, a essa altura os 13 arquivos ja tinham sido apagados.
  const vazio = temporario("d4-sem-navegador-");
  const r = rodar(GATE, { PLAYWRIGHT_BROWSERS_PATH: vazio }, raiz, 300_000);
  assert.notEqual(r.status, 0, "o gate ficou VERDE sem navegador — controle sem valor");
  assert.match(r.saida, /Executable doesn't exist|launch/i, `falhou por outro motivo:\n${r.saida.slice(-400)}`);
  assert.equal(impressao(), REFERENCIA, "O PATRIMONIO FOI DESTRUIDO — D4 voltou");
  assert.equal(readdirSync(EVID).length, 14, "o diretorio versionado perdeu arquivo");
});

/* ================================================================== *
 * E4 — gate normal verde, e o temporário some
 * ================================================================== */
console.log("\n3. O GATE NORMAL");

let saidaDoGateVerde = "";

teste("E4 gate normal VERDE deixa o patrimonio byte a byte identico", () => {
  const r = rodar(GATE, {});
  saidaDoGateVerde = r.saida;
  assert.equal(r.status, 0, `o gate normal nao ficou verde:\n${r.saida.slice(-800)}`);
  assert.match(r.saida, /LAB_V4_BROWSER_GATE_GREEN/, "o gate nao anunciou verde");
  assert.equal(impressao(), REFERENCIA, "o gate normal mexeu no patrimonio");
});

teste("E5 o diretorio temporario do gate normal e descartado", () => {
  const m = /Capturas: \d+ em (.+)/.exec(saidaDoGateVerde);
  assert.ok(m, `o gate nao disse onde gravou:\n${saidaDoGateVerde.slice(-400)}`);
  const caminho = m[1].trim();
  assert.match(saidaDoGateVerde, /Diret[oó]rio: TEMPORARIO/, "o gate normal nao usou diretorio temporario");
  assert.ok(!caminho.startsWith(raiz), `o temporario ficou DENTRO da worktree: ${caminho}`);
  assert.equal(existsSync(caminho), false, `o temporario sobrou em disco: ${caminho}`);
});

/* ================================================================== *
 * E6 — refresh que não termina: o conjunto velho fica INTEIRO
 * ================================================================== */
console.log("\n4. REFRESH QUE NAO TERMINA");

teste("E6 refresh com geracao reprovada RECUSA e preserva o conjunto velho", () => {
  // Falha DETERMINISTICA: navegador que nao existe. Sem porta, sem `listen`
  // assincrono, sem cronometro — a primeira versao deste controle tentou
  // ocupar a porta do gate e a corrida entre `listen()` e `spawnSync()` fez o
  // bloqueio nunca existir. O gate rodou inteiro e o refresh publicou.
  const { base, evidencias } = raizEspelho();
  const antes = impressao(evidencias);
  const r = rodar(REFRESH, { DELIVERYOS_COMMIT: COMMIT, LAB_V4_CHROMIUM: "/nao/existe/chrome" }, base, 600_000);
  assert.notEqual(r.status, 0, "o refresh publicou apesar da geracao reprovada");
  assert.match(r.saida, /REFRESH RECUSADO/, `recusou sem dizer:\n${r.saida.slice(-600)}`);
  assert.equal(impressao(evidencias), antes, "o conjunto velho foi tocado numa publicacao recusada");
  assert.equal(readdirSync(evidencias).length, 14, "o conjunto velho ficou incompleto");
  assert.equal(impressao(), REFERENCIA, "o controle alcancou o patrimonio do repositorio");
});

teste("E7 refresh MORTO no meio da geracao deixa o conjunto velho inteiro", () => {
  // Morte de verdade, no meio: espera a primeira captura chegar ao estagio e
  // mata o grupo de processos. Nada de cronometro fixo, que daria falso verde
  // numa maquina lenta.
  const { base, evidencias, lab } = raizEspelho();
  const antes = impressao(evidencias);
  const filho = spawn("npx", ["tsx", REFRESH], {
    cwd: base,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DELIVERYOS_COMMIT: COMMIT },
  });
  let viuCaptura = false;
  const limite = Date.now() + 300_000;
  try {
    while (Date.now() < limite) {
      const pngs = estagios(lab).flatMap((e) =>
        existsSync(e) ? readdirSync(e).filter((f) => f.endsWith(".png")) : [],
      );
      if (pngs.length > 0) {
        viuCaptura = true;
        break;
      }
      if (filho.exitCode !== null) break;
      execFileSync("sleep", ["0.25"]);
    }
    assert.ok(viuCaptura, "nenhuma captura chegou ao estagio — o controle nao exercitou o meio da geracao");
    process.kill(-filho.pid!, "SIGKILL");
    execFileSync("sleep", ["2"]);
    assert.equal(impressao(evidencias), antes, "MORTE NO MEIO DESTRUIU O CONJUNTO VELHO");
    assert.equal(readdirSync(evidencias).length, 14, "o conjunto velho ficou incompleto");
    assert.equal(impressao(), REFERENCIA, "o controle alcancou o patrimonio do repositorio");
  } finally {
    try {
      process.kill(-filho.pid!, "SIGKILL");
    } catch {
      /* ja morreu */
    }
  }
});

teste("E8 estagio morto nao suja o git status — a regra de ignore existe", () => {
  const estagio = join(LAB, ".evidencias-staging-999999");
  const velho = join(LAB, ".evidencias-velho-999999");
  mkdirSync(estagio, { recursive: true });
  mkdirSync(velho, { recursive: true });
  try {
    for (const d of [estagio, velho]) {
      const r = spawnSync("git", ["check-ignore", "-q", join(d, "x.png")], { cwd: raiz });
      assert.equal(r.status, 0, `${d} NAO esta ignorado — execucao morta sujaria o git status`);
    }
    // CONTROLE POSITIVO: a regra nao pode ser ampla a ponto de engolir o
    // proprio patrimonio que ela existe para proteger.
    const r = spawnSync("git", ["check-ignore", "-q", join(EVID, "calma-real--desktop.png")], { cwd: raiz });
    assert.notEqual(r.status, 0, "a regra de ignore engoliu o diretorio versionado de evidencias");
  } finally {
    rmSync(estagio, { recursive: true, force: true });
    rmSync(velho, { recursive: true, force: true });
  }
});

/* ================================================================== *
 * E9 — refresh COMPLETO, numa raiz de teste, sem tocar no repositório
 * ================================================================== */
console.log("\n5. REFRESH COMPLETO");

teste("E9 refresh completo publica o conjunto inteiro, com manifesto coerente", () => {
  // Publicar por cima do patrimonio so para ver o teste passar seria regenerar
  // os 12 PNGs por conveniencia — e a decisao do Cesar e preserva-los ate um
  // refresh deliberado com procedencia completa.
  const { base, evidencias } = raizEspelho();
  const antes = impressao(evidencias);
  const r = rodar(REFRESH, { DELIVERYOS_COMMIT: COMMIT }, base);
  assert.equal(r.status, 0, `o refresh completo falhou:\n${r.saida.slice(-1200)}`);
  assert.match(r.saida, /EVIDENCIAS_REFRESCADAS/, "o refresh nao anunciou publicacao");

  const arquivos = readdirSync(evidencias).sort();
  const pngs = arquivos.filter((n) => n.endsWith(".png"));
  assert.equal(pngs.length, 12, `esperava 12 capturas, vieram ${pngs.length}`);
  assert.ok(arquivos.includes("README.md"), "publicou sem README");
  assert.ok(arquivos.includes("procedencia.json"), "publicou sem manifesto");
  assert.equal(arquivos.length, 14, `sobrou arquivo no conjunto publicado: ${arquivos.join(", ")}`);
  assert.notEqual(impressao(evidencias), antes, "o refresh nao substituiu nada — o controle seria vazio");

  const m = JSON.parse(readFileSync(join(evidencias, "procedencia.json"), "utf8")) as Record<string, unknown>;
  assert.equal(m["browser_provenance"], "MEDIDO", "o manifesto publicado nao diz que mediu");
  assert.equal(m["commit"], COMMIT, "o manifesto nao carrega a identidade de commit");
  assert.equal(m["fixture"], true, "o manifesto nao declara FIXTURE");
  assert.ok(m["publicado_por"], "o manifesto nao diz quem publicou");
  assert.ok(m["publicado_em"], "o manifesto nao diz quando");
  assert.ok(m["playwright"], "o manifesto nao registra a versao do Playwright");
  const cr = m["chromium"] as Record<string, unknown> | null;
  assert.ok(cr, "o manifesto nao tem bloco de chromium");
  assert.ok(cr!["versao_reportada"], "o manifesto nao registra a versao do Chromium");
  // O binario que RODOU, resolvido. Sem isto o manifesto diria "Chromium" e
  // nada mais — que e o estado UNKNOWN que esta missao existe para nao repetir.
  assert.ok(cr!["executavel_real"], "o manifesto nao registra o executavel que rodou");
  assert.ok(cr!["build_diretorio"], "o manifesto nao registra o build real");

  const listados = Object.keys((m["arquivos"] ?? {}) as Record<string, unknown>).sort();
  assert.deepEqual(listados, pngs, "o manifesto e o conjunto publicado discordam");
  for (const nome of pngs) {
    const registro = (m["arquivos"] as Record<string, { sha256: string; largura: number }>)[nome];
    const bytes = readFileSync(join(evidencias, nome));
    assert.equal(
      registro.sha256,
      createHash("sha256").update(bytes).digest("hex"),
      `o hash de ${nome} no manifesto nao bate com o arquivo`,
    );
    assert.equal(registro.largura, bytes.readUInt32BE(16), `a largura de ${nome} no manifesto nao bate com o PNG`);
  }

  assert.equal(impressao(), REFERENCIA, "o refresh na raiz espelho alcancou o repositorio");
  assert.equal(estagios().length, 0, "sobrou estagio na worktree do repositorio");
});

/* ================================================================== *
 * E10 — build alternativo roda, e não redefine a referência
 * ================================================================== */
console.log("\n6. BUILD ALTERNATIVO");

teste("E10 build alternativo de Chromium roda sem redefinir a referencia versionada", () => {
  const padrao = (() => {
    try {
      return execFileSync(
        process.execPath,
        ["-e", "process.stdout.write(require('playwright').chromium.executablePath())"],
        { cwd: raiz, encoding: "utf8" },
      ).trim();
    } catch {
      return "";
    }
  })();
  const candidatos = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ];
  const alternativo = candidatos.find((c) => existsSync(c) && c !== padrao);
  if (alternativo === undefined) {
    pulados += 1;
    console.log("  -- PULADO EM VOZ ALTA: nenhum binario de Chromium ALTERNATIVO neste ambiente.");
    console.log(`     padrao do Playwright: ${padrao || "(nao resolvido)"}`);
    console.log("     Sem segundo binario, a propriedade nao foi exercitada — nao conte como provada.");
    return;
  }
  const destino = temporario("d4-alternativo-");
  const r = rodar(GATE, { LAB_V4_CHROMIUM: alternativo, LAB_V4_EVIDENCIAS: destino });
  assert.equal(r.status, 0, `o gate nao rodou com o build alternativo:\n${r.saida.slice(-800)}`);

  const m = JSON.parse(readFileSync(join(destino, "procedencia.json"), "utf8")) as {
    chromium?: { executavel_real?: string; escolhido_por?: string; build_diretorio?: string };
  };
  assert.equal(m.chromium?.escolhido_por, "LAB_V4_CHROMIUM", "o manifesto nao registra a escolha declarada");
  assert.equal(
    m.chromium?.executavel_real,
    execFileSync("readlink", ["-f", alternativo], { encoding: "utf8" }).trim(),
    "o manifesto registra um executavel diferente do que rodou",
  );
  assert.equal(readdirSync(destino).filter((n) => n.endsWith(".png")).length, 12, "o build alternativo nao gerou as 12");

  // O ponto do controle: rodou, gerou, e NAO virou a nova referencia. Nenhuma
  // comparacao de pixel aconteceu — builds diferentes desenham diferente, e
  // transformar isso em vermelho elegeria um build canonico por acidente.
  assert.equal(impressao(), REFERENCIA, "o build alternativo redefiniu a referencia versionada");
});

/* ================================================================== *
 * E11 — o baseline atual continua declarado UNKNOWN
 * ================================================================== */
console.log("\n7. PROCEDENCIA DO BASELINE");

teste("E11 o manifesto do baseline declara UNKNOWN em vez de inventar procedencia", () => {
  const m = JSON.parse(readFileSync(join(EVID, "procedencia.json"), "utf8")) as Record<string, unknown>;
  assert.equal(
    m["browser_provenance"],
    "UNKNOWN_FOR_EXISTING_BASELINE",
    "o baseline passou a afirmar procedencia de navegador que ninguem mediu",
  );
  for (const campo of ["chromium", "playwright", "gerado_por", "gerado_em"]) {
    assert.equal(m[campo], null, `${campo} deixou de ser null sem medicao — isso e procedencia inventada`);
  }
  const arquivos = m["arquivos"] as Record<string, { sha256: string }>;
  const pngs = readdirSync(EVID).filter((n) => n.endsWith(".png")).sort();
  assert.deepEqual(Object.keys(arquivos).sort(), pngs, "o manifesto e o conjunto versionado discordam");
  for (const nome of pngs) {
    const real = createHash("sha256").update(readFileSync(join(EVID, nome))).digest("hex");
    assert.equal(arquivos[nome].sha256, real, `${nome} mudou sem o manifesto mudar junto`);
  }
  assert.equal(m["fixture"], true, "o baseline nao declara FIXTURE");
});

/* ---- fechamento ---- */
for (const d of lixo) rmSync(d, { recursive: true, force: true });

const total = passaram + falhas.length;
console.log(`\n${passaram}/${total} controle(s)${pulados > 0 ? ` · ${pulados} PULADO(S) EM VOZ ALTA` : ""}`);
console.log(`patrimonio no fim: ${impressao().slice(0, 16)} ${impressao() === REFERENCIA ? "== referencia" : "!! MUDOU"}`);
for (const f of falhas) console.log(`  XX ${f}`);

if (impressao() !== REFERENCIA) {
  console.error("\nD4_RED — a suite de controle destruiu o que ela existe para proteger.");
  process.exit(1);
}
if (falhas.length > 0) {
  console.error("\nD4_RED");
  process.exit(1);
}
console.log("\nD4_GREEN");
