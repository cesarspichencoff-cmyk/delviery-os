/**
 * Mutações da primeira viagem real pela interface.
 * ============================================================================
 * Cada mutação devolve ao código um defeito que a correção de 2026-10-31
 * fechou, roda `run-real-trip-ui-tests.ts` e exige a reprovação PELA PROVA
 * CERTA (o id R1…R10 que guarda aquela propriedade). Zero mutações cegas.
 * Mutação que não entrou no disco não conta; gate que nem rodou não conta;
 * reprovar por outra prova significa que a propriedade não estava defendida.
 * Toda mutação é restaurada byte a byte (sha256), também em SIGINT/SIGTERM.
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
const QUANTIDADE_ESPERADA = 10;

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

/** Piloto que sobrou de um gate interrompido não pode contaminar o próximo. */
function limparPilotos(): void {
  if (process.platform === "win32") return;
  try {
    const linhas = execSync("ps -eo pgid,args", { encoding: "utf8" }).split("\n");
    const grupos = new Set(
      linhas
        .filter((l) => l.includes("tools/entregas_pilot_server.ts") && !l.includes("run-real-trip-ui-mutation"))
        .map((l) => Number(l.trim().split(/\s+/)[0]))
        .filter((g) => Number.isInteger(g) && g > 1 && g !== process.pid),
    );
    for (const g of grupos) {
      try {
        process.kill(-g, "SIGTERM");
      } catch {
        /* já saiu */
      }
    }
  } catch {
    /* melhor esforço */
  }
}

function rodar(): { ok: boolean; saida: string } {
  const [bin, args]: [string, string[]] =
    process.platform === "win32"
      ? ["cmd.exe", ["/d", "/s", "/c", "npx.cmd", "tsx", "src/entregas/ui/run-real-trip-ui-tests.ts"]]
      : ["npx", ["tsx", "src/entregas/ui/run-real-trip-ui-tests.ts"]];
  try {
    const saida = execFileSync(bin, args, { cwd: raiz, encoding: "utf8", timeout: 900_000 });
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (saida.trim() === "") return { ok: false, saida: `__SPAWN_FALHOU__ ${err.code ?? "?"}` };
    return { ok: false, saida };
  } finally {
    limparPilotos();
  }
}

type Edicao = { arquivo: string; de: string; para: string };
interface Aplicada {
  arquivo: string;
  original: string;
  hash: string;
}

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
    limparPilotos();
    console.error(`\ninterrompido por ${sinal}: ${emCurso.length} arquivo(s) restaurado(s)`);
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
      const eol = atual.includes("\r\n") ? "\r\n" : "\n";
      const de = e.de.replace(/\r?\n/g, eol);
      const para = e.para.replace(/\r?\n/g, eol);
      const vezes = atual.split(de).length - 1;
      assert.equal(vezes, 1, `MUTACAO NAO APLICADA: ancora aparece ${vezes}x em ${e.arquivo}: ${e.de.slice(0, 70)}`);
      const novo = atual.replace(de, () => para);
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
function mutacao(o: { id: string; propriedade: string; edicoes: Edicao[]; assinatura: RegExp }): void {
  if (catalogo.has(o.id)) falhas.push(`id de mutacao duplicado: ${o.id}`);
  catalogo.add(o.id);
  teste(`${o.id} — ${o.propriedade}`, () => {
    const feitas = aplicar(o.edicoes);
    console.log(`        aplicada · ${feitas.map((f) => `${f.arquivo.split("/").pop()} ${f.hash.slice(0, 8)}`).join(" · ")}`);
    try {
      const r = rodar();
      assert.doesNotMatch(r.saida, /__SPAWN_FALHOU__|falha ao executar a suíte/, `o gate nem rodou:\n${r.saida.slice(-400)}`);
      if (r.ok) {
        cegas += 1;
        assert.fail("a suíte ficou VERDE com o defeito devolvido — MUTACAO CEGA");
      }
      assert.match(r.saida, o.assinatura, `reprovou, mas NAO pela prova esperada:\n${r.saida.slice(-900)}`);
      const linha = r.saida.split("\n").find((l) => o.assinatura.test(l)) ?? "";
      console.log(`        perda · ${linha.trim().replace(/\s+/g, " ").slice(0, 190)}`);
    } finally {
      restaurar(feitas);
      emCurso = [];
      console.log(`        restaurado · ${feitas.length} arquivo(s) == origem`);
    }
  });
}

const CLIENTE = "src/entregas/ui/shared/client.js";
const CONSOLE = "src/entregas/ui/console/console.js";
const RIDER = "src/entregas/ui/rider-mobile/rider.js";
const FACHADA = "src/entregas/pilot/pilot-facade.ts";
const AUTH = "src/entregas/operational/auth.ts";
const PILOTO = "tools/entregas_pilot_server.ts";
const ALVOS = [CLIENTE, CONSOLE, RIDER, FACHADA, AUTH, PILOTO] as const;
const HASH_INICIAL = new Map(ALVOS.map((a) => [a, sha(readFileSync(join(raiz, a), "utf8"))]));

console.log("\n=== Mutações da primeira viagem real pela interface ===\n");
console.log("0. CONTROLE POSITIVO — a suíte verde ANTES de mutar");
teste("a suíte está verde sem mutação", () => {
  const r = rodar();
  assert.ok(r.ok, `já vermelha antes de mutar:\n${r.saida.slice(-900)}`);
});

console.log("\n1. IDENTIDADE DA AÇÃO");
mutacao({
  id: "MT1",
  propriedade: "o contador por página volta a ser a identidade do comando",
  edicoes: [{
    arquivo: CLIENTE,
    de: "export function newCommandId(prefix, c = globalThis.crypto) {\n",
    para: "let contadorDaPagina = 0;\nexport function newCommandId(prefix, c = globalThis.crypto) {\n  return `${String(prefix || \"cmd\")}-${++contadorDaPagina}`;\n",
  }],
  assinatura: /XX {2}R1 /,
});
mutacao({
  id: "MT2",
  propriedade: "o novo toque depois de queda de rede monta uma ação nova",
  edicoes: [{ arquivo: CLIENTE, de: "      const resent = pending.has(key);\n", para: "      const resent = false;\n" }],
  assinatura: /XX {2}R6 /,
});
mutacao({
  id: "MT3",
  propriedade: "DUPLICATE_COMMAND do reenvio vira erro na tela",
  edicoes: [{
    arquivo: CLIENTE,
    de: '        if (resent && e.payload?.result?.code === "DUPLICATE_COMMAND") {\n',
    para: "        if (false) {\n",
  }],
  assinatura: /XX {2}R7 /,
});

console.log("\n2. O MOTOBOY DA CASA");
mutacao({
  id: "MT4",
  propriedade: "o console volta a montar a viagem para rid-demo",
  edicoes: [{ arquivo: CONSOLE, de: "        courier_actor_id: rider,\n", para: '        courier_actor_id: "rid-demo",\n' }],
  assinatura: /XX {2}R1 /,
});
mutacao({
  id: "MT5",
  propriedade: "o servidor aceita viagem para motoboy fora do cadastro",
  edicoes: [{
    arquivo: FACHADA,
    de: '    if (riders && (full.type === "CreateTrip" || full.type === "AssignInternalRider") &&\n',
    para: '    if (false && riders && (full.type === "CreateTrip" || full.type === "AssignInternalRider") &&\n',
  }],
  assinatura: /XX {2}R9 /,
});

console.log("\n3. POSSE E O QUE O MOTOBOY VÊ");
mutacao({
  id: "MT6",
  propriedade: "motoboy volta a agir na viagem de outro",
  edicoes: [{
    arquivo: AUTH,
    de: '  if (actor.role === "motoboy_interno" && actor.actor_id !== String(courierActorId)) {\n',
    para: "  if (false) {\n",
  }],
  assinatura: /XX {2}R5 /,
});
mutacao({
  id: "MT7",
  propriedade: "o snapshot do motoboy volta a trazer a casa inteira",
  edicoes: [{ arquivo: FACHADA, de: "    if (rider !== null) {\n", para: "    if (false) {\n" }],
  assinatura: /XX {2}R3 /,
});
mutacao({
  id: "MT8",
  propriedade: "a tela do motoboy pega a primeira viagem que chegar",
  edicoes: [{ arquivo: RIDER, de: "      (!me || t.courier_actor_id === me),\n", para: "      true,\n" }],
  assinatura: /XX {2}R4 /,
});
mutacao({
  id: "MT9",
  propriedade: "o último erro de um terminal volta a ir para todos",
  edicoes: [{
    arquivo: FACHADA,
    de: "      last_error: this.lastErrorFor(this.activeActor).error,\n",
    para: "      last_error: this.last_error,\n",
  }],
  assinatura: /XX {2}R9 /,
});
mutacao({
  id: "MT10",
  propriedade: "a linha do tempo da viagem de outro motoboy volta a abrir",
  edicoes: [{
    arquivo: PILOTO,
    de: '      if (actor.role === "motoboy_interno") {\n        // O snapshot do motoboy só traz as viagens dele: a linha do tempo de\n',
    para: "      if (false) {\n        // O snapshot do motoboy só traz as viagens dele: a linha do tempo de\n",
  }],
  assinatura: /XX {2}R3 /,
});

/* ---- fecho ---- */
if (catalogo.size !== QUANTIDADE_ESPERADA) falhas.push(`catalogo incompleto: ${catalogo.size}/${QUANTIDADE_ESPERADA}`);
teste("nenhum arquivo mutado ficou diferente do estado inicial", () => {
  for (const a of ALVOS) assert.equal(sha(readFileSync(join(raiz, a), "utf8")), HASH_INICIAL.get(a), `não restaurado: ${a}`);
});

const total = passaram + falhas.length;
console.log(`\n${passaram}/${total} · cegas: ${cegas}`);
if (falhas.length || cegas) {
  for (const f of falhas) console.log(`  FALHA ${f.split("\n")[0]}`);
  console.log("\nREAL_TRIP_UI_MUTATIONS_RED");
  process.exit(1);
}
console.log("\nREAL_TRIP_UI_MUTATIONS_GREEN");
