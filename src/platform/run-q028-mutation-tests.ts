/**
 * Mutações da Q-028 (observador local da fila) e da cadeia integrada da V1.
 * ============================================================================
 * Cada mutação devolve ao código um defeito que esta etapa fechou, roda a suíte
 * que guarda a propriedade e exige a reprovação PELA PROVA CERTA:
 *
 *   observador → src/entregas/pilot/run-observador-fila-tests.ts (R*, H*)
 *   cadeia     → src/platform/run-cadeia-v1-integrada-tests.ts (I*), binários de
 *                dist/: a mutação de código é seguida de build:platform, e a
 *                restauração também.
 *
 * Zero mutações cegas. Mutação que não entrou no disco não conta; gate que nem
 * rodou não conta; reprovar por outra prova significa propriedade indefesa.
 * Toda mutação é restaurada byte a byte (sha256), também em SIGINT/SIGTERM.
 * Exige DELIVERYOS_PG_URL (a cadeia é de banco).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const falhas: string[] = [];
let passaram = 0;
let cegas = 0;
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

function limparProcessos(): void {
  if (process.platform === "win32") return;
  try {
    const linhas = execSync("ps -eo pid,pgid,args", { encoding: "utf8" }).split("\n");
    for (const l of linhas) {
      if (!/entregas_pilot_server|product_system_server|entregas-source-ingest|async-runtime/.test(l) || l.includes("run-q028-mutation")) continue;
      const [pid] = l.trim().split(/\s+/).map(Number);
      if (Number.isInteger(pid) && pid > 1 && pid !== process.pid) { try { process.kill(pid, "SIGTERM"); } catch { /* saiu */ } }
    }
  } catch {
    /* ps indisponível */
  }
}

type Gate = "observador" | "cadeia";
const SUITE: Record<Gate, string> = {
  observador: "src/entregas/pilot/run-observador-fila-tests.ts",
  cadeia: "src/platform/run-cadeia-v1-integrada-tests.ts",
};

function construir(): void {
  execFileSync("npm", ["run", "-s", "build:platform"], { cwd: raiz, encoding: "utf8", stdio: "pipe", timeout: 600_000 });
}

function rodar(gate: Gate): { ok: boolean; saida: string } {
  try {
    const saida = execFileSync("npx", ["tsx", SUITE[gate]], { cwd: raiz, env: process.env, encoding: "utf8", timeout: 900_000 });
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (saida.trim() === "") return { ok: false, saida: `__SPAWN_FALHOU__ ${err.code ?? "?"}` };
    return { ok: false, saida };
  } finally {
    limparProcessos();
  }
}

type Edicao = { arquivo: string; de: string; para: string };
interface Aplicada { arquivo: string; original: string; hash: string }
let emCurso: Aplicada[] = [];

function restaurar(feitas: readonly Aplicada[]): void {
  for (const f of feitas) {
    writeFileSync(join(raiz, f.arquivo), f.original);
    assert.equal(sha(readFileSync(join(raiz, f.arquivo), "utf8")), f.hash, `RESTAURACAO FALHOU em ${f.arquivo}`);
  }
}

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    restaurar(emCurso);
    limparProcessos();
    console.error(`\ninterrompido por ${sinal}: ${emCurso.length} arquivo(s) restaurado(s); rode npm run build:platform`);
    process.exit(130);
  });
}

function aplicar(edicoes: readonly Edicao[]): Aplicada[] {
  const feitas: Aplicada[] = [];
  const vistos = new Set<string>();
  try {
    for (const e of edicoes) {
      const caminho = join(raiz, e.arquivo);
      const atual = readFileSync(caminho, "utf8");
      if (!vistos.has(e.arquivo)) {
        vistos.add(e.arquivo);
        feitas.push({ arquivo: e.arquivo, original: atual, hash: sha(atual) });
        emCurso = feitas;
      }
      const vezes = atual.split(e.de).length - 1;
      assert.equal(vezes, 1, `MUTACAO NAO APLICADA: ancora aparece ${vezes}x em ${e.arquivo}: ${e.de.slice(0, 70)}`);
      const novo = atual.replace(e.de, () => e.para);
      assert.notEqual(novo, atual, `MUTACAO NAO APLICADA: a troca nao mudou ${e.arquivo}`);
      writeFileSync(caminho, novo);
      assert.equal(readFileSync(caminho, "utf8"), novo, `MUTACAO NAO APLICADA: o disco nao confirmou ${e.arquivo}`);
    }
  } catch (err) {
    restaurar(feitas);
    emCurso = [];
    throw err;
  }
  return feitas;
}

const catalogo = new Set<string>();
function mutacao(o: { id: string; gate: Gate; prova: string; propriedade: string; edicoes: Edicao[]; recompilar?: boolean }): void {
  if (catalogo.has(o.id)) falhas.push(`id de mutacao duplicado: ${o.id}`);
  catalogo.add(o.id);
  const assinatura = o.gate === "cadeia" ? new RegExp(`XX  ${o.prova} `) : new RegExp(`FAIL ${o.prova} `);
  teste(`${o.id} — ${o.propriedade}`, () => {
    const feitas = aplicar(o.edicoes);
    console.log(`        aplicada · ${feitas.map((f) => `${f.arquivo.split("/").pop()} ${f.hash.slice(0, 8)}`).join(" · ")}`);
    try {
      if (o.recompilar) construir();
      const r = rodar(o.gate);
      assert.doesNotMatch(r.saida, /__SPAWN_FALHOU__/, `o gate nem rodou:\n${r.saida.slice(-400)}`);
      if (r.ok) {
        cegas += 1;
        assert.fail("a suíte ficou VERDE com o defeito devolvido — MUTACAO CEGA");
      }
      assert.match(r.saida, assinatura, `reprovou, mas NAO pela prova ${o.prova}:\n${r.saida.slice(-900)}`);
      const linha = r.saida.split("\n").find((l) => assinatura.test(l)) ?? "";
      console.log(`        perda · ${linha.trim().replace(/\s+/g, " ").slice(0, 170)}`);
    } finally {
      restaurar(feitas);
      emCurso = [];
      if (o.recompilar) construir();
      console.log(`        restaurado · ${feitas.length} arquivo(s) == origem${o.recompilar ? " · dist/ reconstruído" : ""}`);
    }
  });
}

const SV = "tools/entregas_pilot_server.ts";
const CC = "src/entregas/pilot/cloud-config.ts";
const PC = "src/entregas/pilot/pilot-config.ts";
const RO = "src/entregas/pilot/ready-queue-observation.ts";
const AU = "src/entregas/operational/auth.ts";
const PS = "tools/product_system_server.ts";
const PL = "deploy/sql/papel_leitura_produto.sql";
const ALVOS = [SV, CC, PC, RO, AU, PS, PL] as const;
const HASH_INICIAL = new Map(ALVOS.map((a) => [a, sha(readFileSync(join(raiz, a), "utf8"))]));
if (!process.env.DELIVERYOS_PG_URL?.trim()) falhas.push("sem DELIVERYOS_PG_URL: a cadeia integrada não roda e as mutações não são medidas");

console.log("\n=== Mutações da Q-028 e da cadeia integrada da V1 ===\n");
console.log("0. CONTROLES POSITIVOS");
construir();
for (const gate of ["observador", "cadeia"] as const) {
  teste(`a suíte ${gate} está verde sem mutação`, () => {
    const r = rodar(gate);
    assert.ok(r.ok, `já vermelha antes de mutar:\n${r.saida.slice(-900)}`);
  });
}

console.log("\n1. PILOTO: PAPEL DE MÁQUINA SÓ DE LEITURA");
mutacao({ id: "MQ1", gate: "observador", prova: "H2", propriedade: "sem a trava da borda, o observador lê o snapshot inteiro",
  edicoes: [{ arquivo: SV, de: "  if (actor?.role === \"observador_fila\" &&\n", para: "  if (false &&\n" }] });
mutacao({ id: "MQ2", gate: "observador", prova: "H2", propriedade: "a borda deixa o observador usar outro método na rota da fila",
  edicoes: [{ arquivo: SV, de: "      !(req.method === \"GET\" && url.pathname === \"/api/ready-orders/observation\" && !url.search)) {\n",
    para: "      !(url.pathname === \"/api/ready-orders/observation\" && !url.search)) {\n" }] });
mutacao({ id: "MQ3", gate: "observador", prova: "R1", propriedade: "token de máquina curto aceito pelo ambiente",
  edicoes: [{ arquivo: CC, de: "    if (MACHINE_ROLES.includes(u.role) && u.token.length < MIN_MACHINE_TOKEN_LENGTH) {\n", para: "    if (false) {\n" }] });
mutacao({ id: "MQ4", gate: "observador", prova: "R2b", propriedade: "papel desconhecido sobe pelo arquivo do piloto",
  edicoes: [{ arquivo: PC, de: "    if (!PAPEIS_DO_ARQUIVO.includes(String(u.role))) {\n", para: "    if (false) {\n" }] });
mutacao({ id: "MQ5", gate: "observador", prova: "R2", propriedade: "observador com token fraco sobe pelo arquivo do piloto",
  edicoes: [{ arquivo: PC, de: "    if (u.role === \"observador_fila\" &&\n", para: "    if (false &&\n" }] });
mutacao({ id: "MQ6", gate: "observador", prova: "R3", propriedade: "a fachada não reconhece o observador",
  edicoes: [{ arquivo: RO, de: "[\"gerente\", \"lider_delivery\", \"observador_fila\"]", para: "[\"gerente\", \"lider_delivery\"]" }] });
mutacao({ id: "MQ7", gate: "observador", prova: "R3", propriedade: "o domínio dá ao observador o poder de montar viagem",
  edicoes: [{ arquivo: AU, de: "const OPS_MUTATE: OperationalRole[] = [\n  \"operador_expedicao\",\n",
    para: "const OPS_MUTATE: OperationalRole[] = [\n  \"observador_fila\",\n  \"operador_expedicao\",\n" }] });

console.log("\n2. CADEIA: LEITURA QUE NÃO ESCREVE, TOKEN QUE NÃO VAZA, FILA PELO OBSERVADOR");
mutacao({ id: "MQ8", gate: "cadeia", prova: "I4", propriedade: "o papel de leitura lê o segredo do aparelho",
  edicoes: [{ arquivo: PL, de: "GRANT SELECT (device_id, unit_id, actor_id, label, registered_at, secret_bound_at,\n",
    para: "GRANT SELECT (device_id, unit_id, actor_id, label, registered_at, secret_bound_at, secret_hash,\n" }] });
mutacao({ id: "MQ9", gate: "cadeia", prova: "I4", propriedade: "o papel de leitura grava no event log",
  edicoes: [{ arquivo: PL, de: "GRANT SELECT ON platform.event_log TO deliveryos_leitura;\n",
    para: "GRANT SELECT, INSERT ON platform.event_log TO deliveryos_leitura;\n" }] });
mutacao({ id: "MQ10", gate: "cadeia", prova: "I9", propriedade: "o token do observador vai por HTTP fora do loopback", recompilar: true,
  edicoes: [{ arquivo: PS, de: "  if (alvo.protocol === \"https:\" || (alvo.protocol === \"http:\" && loopback)) return null;\n",
    para: "  return null;\n" }] });
mutacao({ id: "MQ11", gate: "cadeia", prova: "I3", propriedade: "a apresentação ignora o observador local (fila nunca observada)", recompilar: true,
  edicoes: [{ arquivo: PS, de: "        const motivo = motivoDoObservadorDaFila();\n", para: "        const motivo = \"observador_da_fila_nao_configurado\";\n" }] });

console.log("\n3. RESTAURAÇÃO");
teste("todos os alvos voltaram byte a byte à origem", () => {
  for (const a of ALVOS) assert.equal(sha(readFileSync(join(raiz, a), "utf8")), HASH_INICIAL.get(a), `${a} não voltou à origem`);
});

const total = passaram + falhas.length;
console.log(`\nQ028_MUTACOES: ${passaram}/${total} · cegas: ${cegas}`);
if (falhas.length) {
  for (const f of falhas) console.log(`  - ${f.split("\n")[0]}`);
  process.exit(1);
}
console.log("Q028_MUTACOES_GREEN");
