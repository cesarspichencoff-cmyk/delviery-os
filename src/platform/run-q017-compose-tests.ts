/**
 * Q-017 — Fase 6: a composição oficial EXIGE o modo, e só no crítico.
 * ============================================================================
 * Prova pelo RENDERIZADOR do próprio compose (`docker compose config`), nunca
 * por leitura do YAML: o que importa é o ambiente que cada container recebe
 * depois da interpolação, e só o compose sabe calculá-lo — âncoras, `<<:`,
 * `:?`, `:-` e precedência de fontes incluídas.
 *
 * O que a composição garante e o que o crítico garante são camadas
 * diferentes, e as duas são provadas:
 *   - o compose garante PRESENÇA: sem valor, `config` recusa (`:?`);
 *   - o crítico garante VALIDADE: `REAL`, `prod`… passam pelo compose e o
 *     crítico sai 78 no boot (`test:platform:q017`, C1).
 *
 * ISOLAMENTO, medido antes de escrever esta suíte (e travado em K6):
 *   - `--env-file` SUBSTITUI o `.env` do diretório do projeto. Sem ele, um
 *     `deploy/.env` local — ignorado pelo Git, diferente em cada máquina —
 *     entraria na conta;
 *   - variável EXPORTADA no shell vence o `--env-file`. Por isso o compose
 *     roda aqui com ambiente de processo SANEADO: só PATH e HOME. Sem isso, um
 *     `export DELIVERYOS_SOURCE_MODE=real` na máquina de quem roda faria o caso
 *     "ausente" medir outra coisa.
 *
 * Não precisa do daemon: `config` só interpola e valida. Sem o plugin
 * `docker compose`, PULA EM VOZ ALTA.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raiz = process.cwd();
const COMPOSE = join(raiz, "deploy/compose.platform.yaml");
const EXEMPLO = join(raiz, "deploy/.env.platform.example");
const VARIAVEL = "DELIVERYOS_SOURCE_MODE";
const MODOS = ["real", "simulated", "control"] as const;

console.log("\n=== Q-017 — A COMPOSICAO EXIGE O MODO, SO NO CRITICO ===\n");

const ambienteSaneado = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };

const versao = spawnSync("docker", ["compose", "version"], { encoding: "utf8", env: ambienteSaneado });
if (versao.status !== 0) {
  console.log("PULADO: `docker compose` indisponível — nenhuma composição foi renderizada.");
  console.log(`  ${(versao.stderr || String(versao.error ?? "")).trim().slice(0, 200)}`);
  process.exit(0);
}
console.log(`  ${versao.stdout.trim()}\n`);

let passaram = 0;
const falhas: string[] = [];
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

const tmp = mkdtempSync(join(tmpdir(), "q017-compose-"));

/** Tudo que a composição exige ALÉM do modo — fixtures, nunca valores reais. */
const BASE: Record<string, string> = {
  POSTGRES_PASSWORD: "fixture-senha-q017",
  DELIVERYOS_COMMIT: "abcdef1234567",
  DELIVERYOS_DEVICE_TOKEN_SECRET: "fixture-q017-".padEnd(48, "x"),
};

interface Render {
  codigo: number | null;
  erro: string;
  /** Ambiente de cada serviço, depois da interpolação. */
  servicos: Record<string, Record<string, string>> | null;
}

let arquivos = 0;
/**
 * Renderiza a composição oficial com EXATAMENTE este arquivo de ambiente.
 * `conteudo` é o texto cru, para que vazio e espaço sejam o que o operador
 * escreveria no `.env`.
 */
function renderizar(conteudo: string, opcoes: { projeto?: string; semEnvFile?: boolean } = {}): Render {
  arquivos += 1;
  const arquivo = join(tmp, `ambiente-${arquivos}.env`);
  writeFileSync(arquivo, conteudo);
  const args = ["compose"];
  if (opcoes.projeto) args.push("--project-directory", opcoes.projeto);
  args.push("-f", COMPOSE);
  if (!opcoes.semEnvFile) args.push("--env-file", arquivo);
  args.push("config", "--format", "json");
  const r = spawnSync("docker", args, { cwd: raiz, encoding: "utf8", env: ambienteSaneado, timeout: 60_000 });
  let servicos: Render["servicos"] = null;
  if (r.status === 0) {
    const d = JSON.parse(r.stdout) as { services: Record<string, { environment?: Record<string, string> }> };
    servicos = Object.fromEntries(Object.entries(d.services).map(([k, v]) => [k, v.environment ?? {}]));
  }
  return { codigo: r.status, erro: r.stderr ?? "", servicos };
}

const linhas = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
const com = (modo?: string) => linhas(modo === undefined ? BASE : { ...BASE, [VARIAVEL]: modo });
const RECUSA = new RegExp(`required variable ${VARIAVEL} is missing a value`);

/** Os serviços cujo ambiente final contém a variável. */
const quemRecebe = (r: Render): string[] =>
  Object.entries(r.servicos ?? {})
    .filter(([, env]) => VARIAVEL in env)
    .map(([nome]) => nome)
    .sort();

try {
  teste("K1 AUSENTE: `config` recusa, nomeando a variável; CONTROLE: o mesmo arquivo com o modo passa", () => {
    const r = renderizar(com(undefined));
    assert.notEqual(r.codigo, 0, "a composição renderizou sem o modo");
    assert.match(r.erro, RECUSA, `recusou por outro motivo:\n${r.erro}`);
    const controle = renderizar(com("simulated"));
    assert.equal(controle.codigo, 0, `o controle não renderizou — a recusa acima não isola o modo:\n${controle.erro}`);
  });

  teste("K2 VAZIO e SÓ ESPAÇO: `config` recusa — o compose apara e o `:?` pega", () => {
    for (const v of ["", "   ", "\t"]) {
      const r = renderizar(com(v));
      assert.notEqual(r.codigo, 0, `${JSON.stringify(v)} renderizou`);
      assert.match(r.erro, RECUSA, `${JSON.stringify(v)} recusou por outro motivo:\n${r.erro}`);
    }
  });

  teste("K3 real, simulated e control: o crítico recebe EXATAMENTE o valor declarado", () => {
    for (const m of MODOS) {
      const r = renderizar(com(m));
      assert.equal(r.codigo, 0, `${m} não renderizou:\n${r.erro}`);
      assert.equal(r.servicos?.["deliveryos-critical"]?.[VARIAVEL], m, `o crítico não recebeu ${m}`);
    }
  });

  teste("K4 ESCOPO: só o crítico recebe a variável — migrate, assíncrono, backup e banco não", () => {
    for (const m of MODOS) {
      const r = renderizar(com(m));
      assert.equal(r.codigo, 0);
      const servicos = Object.keys(r.servicos ?? {}).sort();
      assert.deepEqual(
        servicos,
        ["deliveryos-async", "deliveryos-backup", "deliveryos-critical", "deliveryos-migrate", "deliveryos-postgres"],
        "a composição mudou de serviços — a régua de escopo precisa ser revista, não ignorada",
      );
      assert.deepEqual(quemRecebe(r), ["deliveryos-critical"], `com ${m}, a variável chegou a: ${quemRecebe(r).join(", ")}`);
    }
  });

  teste("K5 CAMADAS: valor inválido passa pelo compose SEM normalização — quem recusa é o crítico", () => {
    for (const v of ["REAL", "prod"]) {
      const r = renderizar(com(v));
      assert.equal(r.codigo, 0, `o compose recusou ${v}:\n${r.erro}`);
      assert.equal(r.servicos?.["deliveryos-critical"]?.[VARIAVEL], v, `o compose reescreveu ${v}`);
    }
  });

  teste("K6 ISOLAMENTO: `.env` hostil no projeto não entra com `--env-file`; CONTROLE: sem ele, entra", () => {
    const projeto = mkdtempSync(join(tmp, "projeto-"));
    writeFileSync(join(projeto, ".env"), com("real"));
    const isolado = renderizar(com(undefined), { projeto });
    assert.notEqual(isolado.codigo, 0, "o `.env` do projeto supriu o modo — o gate mediria a máquina, não o repositório");
    assert.match(isolado.erro, RECUSA);
    const controle = renderizar("", { projeto, semEnvFile: true });
    assert.equal(controle.codigo, 0, `controle não renderizou:\n${controle.erro}`);
    assert.equal(controle.servicos?.["deliveryos-critical"]?.[VARIAVEL], "real", "o `.env` hostil nem é lido — K6 não provaria nada");
  });

  teste("K7 o EXEMPLO versionado traz a variável VAZIA e, preenchido o resto, a composição recusa", () => {
    const texto = readFileSync(EXEMPLO, "utf8");
    const atribuicoes = new Map<string, string>();
    for (const l of texto.split("\n")) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(l);
      if (m) atribuicoes.set(m[1], m[2]);
    }
    assert.ok(atribuicoes.has(VARIAVEL), "o exemplo não traz a variável — quem copia não sabe que ela existe");
    assert.equal(atribuicoes.get(VARIAVEL)?.trim(), "", "o exemplo traz o modo PREENCHIDO — copiado, vira padrão");
    // O exemplo como um operador o usaria: preenche o que é obrigatório e
    // não é o modo. Se o exemplo trouxesse um modo, isto renderizaria.
    const preenchido = texto
      .split("\n")
      .map((l) => {
        const m = /^([A-Z_][A-Z0-9_]*)=\s*$/.exec(l);
        return m && m[1] in BASE ? `${m[1]}=${BASE[m[1]]}` : l;
      })
      .join("\n");
    const r = renderizar(preenchido);
    assert.notEqual(r.codigo, 0, "o exemplo renderiza sem o operador declarar o modo");
    assert.match(r.erro, RECUSA, `o exemplo recusou por outro motivo:\n${r.erro}`);
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const total = passaram + falhas.length;
console.log(`\n${passaram}/${total} provas pelo renderizador do compose`);
for (const f of falhas) console.log(`  XX ${f}`);
if (falhas.length) {
  console.error("\nQ017_COMPOSE_RED");
  process.exit(1);
}
console.log("\nQ017_COMPOSE_GREEN");
