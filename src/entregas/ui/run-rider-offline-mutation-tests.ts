/**
 * Mutações dos comandos offline nativos da rider-mobile (C5).
 * ============================================================================
 * Cada mutação devolve ao código um defeito que o C5 fechou, roda a suíte
 * test:entregas:rider-offline e exige a reprovação PELA PROVA CERTA (o id
 * O0…O9 que guarda aquela propriedade). Zero mutações cegas.
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
const QUANTIDADE_ESPERADA = 7;

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
        .filter((l) => l.includes("tools/entregas_pilot_server.ts") && !l.includes("run-rider-offline-mutation"))
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
      ? ["cmd.exe", ["/d", "/s", "/c", "npx.cmd", "tsx", "src/entregas/ui/run-rider-offline-commands-tests.ts"]]
      : ["npx", ["tsx", "src/entregas/ui/run-rider-offline-commands-tests.ts"]];
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

const RIDER = "src/entregas/ui/rider-mobile/rider.js";
const PILOTO = "tools/entregas_pilot_server.ts";
const ALVOS = [RIDER, PILOTO] as const;
const HASH_INICIAL = new Map(ALVOS.map((a) => [a, sha(readFileSync(join(raiz, a), "utf8"))]));

console.log("\n=== Mutações dos comandos offline nativos (C5) ===\n");
console.log("0. CONTROLE POSITIVO — a suíte verde ANTES de mutar");
teste("a suíte está verde sem mutação", () => {
  const r = rodar();
  assert.ok(r.ok, `já vermelha antes de mutar:\n${r.saida.slice(-900)}`);
});

console.log("\n1. A AÇÃO ENTRA NA FILA DO APARELHO");
mutacao({
  id: "MC1",
  propriedade: "a ação do motoboy volta a ir só online, mesmo com a fila anunciada",
  edicoes: [{
    arquivo: RIDER,
    de: "  return deviceQueueOn() ? queueOnDevice(key, build) : pending.run(key, build);\n",
    para: "  return pending.run(key, build);\n",
  }],
  assinatura: /XX {2}O1 /,
});
mutacao({
  id: "MC2",
  propriedade: "toque repetido numa intenção pendente vira segunda intenção",
  edicoes: [{
    arquivo: RIDER,
    de: "  if (deviceEvents().some((e) => OPEN_STATES.has(e.state) && intentKey(e) === key)) {\n",
    para: "  if (false) {\n",
  }],
  assinatura: /XX {2}O3 /,
});
mutacao({
  id: "MC3",
  propriedade: "sem a camada das intenções, a sequência offline para na primeira ação",
  edicoes: [{ arquivo: RIDER, de: "  if (!trip || !deviceQueueOn()) return trip;\n", para: "  return trip;\n" }],
  assinatura: /XX {2}O2 /,
});
mutacao({
  id: "MC4",
  propriedade: "ação guardada sem rede aparece como erro na tela",
  edicoes: [{ arquivo: RIDER, de: "      if (res?.result?.queued && e?.transport) render();\n", para: "      if (false) render();\n" }],
  assinatura: /XX {2}O1 /,
});
mutacao({
  id: "MC5",
  propriedade: "a tela não diz que a ação está guardada no aparelho",
  edicoes: [{ arquivo: RIDER, de: "    line.hidden = false;\n  } else {\n", para: "    line.hidden = true;\n  } else {\n" }],
  assinatura: /XX {2}O1 /,
});
mutacao({
  id: "MC6",
  propriedade: "recusa do domínio some da tela em vez de ficar visível",
  edicoes: [{ arquivo: RIDER, de: "    rejected.hidden = false;\n", para: "    rejected.hidden = true;\n" }],
  assinatura: /XX {2}O9 /,
});

console.log("\n2. O SERVIDOR SÓ ANUNCIA O QUE CONSEGUE ACEITAR");
mutacao({
  id: "MC7",
  propriedade: "fila anunciada sem chave de delegação ou recibo durável",
  edicoes: [{
    arquivo: PILOTO,
    de: "        device_events_accepted:\n          Boolean(persistenceBackend?.native_inbound_receipts.available) && pilotDelegationPublicKey !== null,\n",
    para: "        device_events_accepted: true,\n",
  }],
  assinatura: /XX {2}O7 /,
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
  console.log("\nRIDER_OFFLINE_MUTATIONS_RED");
  process.exit(1);
}
console.log("\nRIDER_OFFLINE_MUTATIONS_GREEN");
