/**
 * Q-018 — SUÍTE ADVERSARIAL DA CAPTURA PELA RIDER-MOBILE.
 * ============================================================================
 * Cada mutação devolve ao código um defeito que a Q-018 fechou (ou uma
 * garantia que ela promete), roda o gate que deveria acusar, e exige a
 * reprovação PELA ASSINATURA CERTA — o id do teste que guarda aquela
 * propriedade. Zero mutações cegas.
 *
 * As recusas de sempre (PB19, Q-016): mutação que não entrou no disco não
 * conta; gate que nem rodou não conta; reprovar por outro motivo significa
 * que a propriedade não estava sendo defendida. Toda mutação é restaurada
 * byte a byte (sha256), também em SIGINT/SIGTERM.
 *
 * Gates:
 *   regra     — test:entregas:rider-capture (regra pura, adaptador, nomes da ponte)
 *   navegador — test:entregas:rider-bridge  (piloto real + Chromium + ponte falsa)
 *   servidor  — test:entregas:device-api    (servidor real, compilado)
 *   android   — test:entregas:android       (estrutural: sem compilador aqui)
 *
 * O Kotlin NÃO é executado por nenhum gate daqui: o que MA1–MA3 provam é que
 * a verificação estrutural acusa a ausência da trava, não que ela roda.
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

console.log("\n=== Q-018 — SUITE ADVERSARIAL DA CAPTURA PELA RIDER-MOBILE ===\n");

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
  try {
    const linhas = execSync("ps -eo pgid,args", { encoding: "utf8" }).split("\n");
    const grupos = new Set(
      linhas
        .filter((l) => l.includes("tools/entregas_pilot_server.ts") && !l.includes("run-rider-bridge-mutation"))
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
    /* ps ausente: nada a limpar */
  }
}

type Gate = "regra" | "navegador" | "servidor" | "android";

function rodar(gate: Gate): { ok: boolean; saida: string } {
  const comando: Record<Gate, [string, string[]]> = {
    regra: ["npx", ["tsx", "src/entregas/ui/run-rider-capture-tests.ts"]],
    navegador: ["npx", ["tsx", "src/entregas/ui/run-rider-bridge-tests.ts"]],
    servidor: ["node", ["dist/src/entregas/android/run-device-api-tests.js"]],
    android: ["npx", ["tsx", "src/entregas/android/run-android-project-tests.ts"]],
  };
  if (gate === "servidor") {
    // O gate sobe o servidor COMPILADO: sem rebuild, a mutação ficaria cega.
    try {
      execFileSync("npx", ["tsc"], { cwd: raiz, encoding: "utf8", timeout: 600_000 });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      return { ok: false, saida: `__BUILD__${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  }
  const [bin, args] = comando[gate];
  try {
    const saida = execFileSync(bin, args, { cwd: raiz, encoding: "utf8", timeout: 1_200_000, env: { ...process.env } });
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (saida.trim() === "") return { ok: false, saida: `__SPAWN_FALHOU__ ${err.code ?? "?"}` };
    return { ok: false, saida };
  } finally {
    if (gate === "navegador") limparPilotos();
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

function mutacao(o: { id: string; propriedade: string; gate: Gate; edicoes: Edicao[]; assinatura: RegExp }): void {
  teste(`${o.id} — ${o.propriedade}`, () => {
    const feitas = aplicar(o.edicoes);
    console.log(`        aplicada · ${feitas.map((f) => `${f.arquivo.split("/").pop()} ${f.hash.slice(0, 8)}`).join(" · ")} · gate ${o.gate}`);
    try {
      const r = rodar(o.gate);
      assert.doesNotMatch(r.saida, /__SPAWN_FALHOU__|__BUILD__/, `o gate nem rodou:\n${r.saida.slice(-400)}`);
      if (r.ok) {
        cegas += 1;
        assert.fail(`o gate ${o.gate} ficou VERDE com o defeito devolvido — MUTACAO CEGA`);
      }
      assert.match(r.saida, o.assinatura, `reprovou, mas NAO pela assinatura esperada:\n${r.saida.slice(-900)}`);
      const linha = r.saida.split("\n").find((l) => o.assinatura.test(l)) ?? "";
      console.log(`        perda · ${linha.trim().replace(/\s+/g, " ").slice(0, 190)}`);
    } finally {
      restaurar(feitas);
      emCurso = [];
      console.log(`        restaurado · ${feitas.length} arquivo(s) == origem`);
    }
  });
}

const REGRA = "src/entregas/ui/rider-mobile/capture-rule.js";
const RIDER = "src/entregas/ui/rider-mobile/rider.js";
const API = "src/entregas/pilot/device-api.ts";
const PILOTO = "tools/entregas_pilot_server.ts";
const MAIN = "android/app/src/main/java/br/com/tata/entregas/ui/MainActivity.kt";
const PONTE = "android/app/src/main/java/br/com/tata/entregas/bridge/EntregasBridge.kt";

/* ---- controle positivo ---- */
console.log("0. CONTROLE POSITIVO — todo gate verde ANTES de mutar");
for (const g of ["regra", "navegador", "servidor", "android"] as const) {
  teste(`o gate ${g} está verde sem mutação`, () => {
    const r = rodar(g);
    assert.ok(r.ok, `gate ${g} já vermelho antes de mutar:\n${r.saida.slice(-900)}`);
  });
}
if (falhas.length) {
  console.error("\nOs gates precisam estar verdes ANTES das mutacoes. Abortado.");
  for (const f of falhas) console.error(`  ${f}`);
  process.exit(1);
}

/* ================================================================== */
console.log("\n1. QUANDO A PAGINA LIGA — a regra de captura");

mutacao({
  id: "MR1",
  propriedade: "captura antes da saída confirmada pelo domínio",
  gate: "navegador",
  edicoes: [{ arquivo: REGRA, de: '  if (!CAPTURE_TRIP_STATES.includes(trip.state)) return off("saida_nao_confirmada");\n', para: "" }],
  assinatura: /XX {2}B1 /,
});
mutacao({
  id: "MR2",
  propriedade: "termo RECUSADO vale como aceite",
  gate: "navegador",
  edicoes: [{ arquivo: REGRA, de: '  if (ack.status !== "accepted") return off("termo_recusado");\n', para: "" }],
  assinatura: /XX {2}E5 /,
});
mutacao({
  id: "MR3",
  propriedade: "captura sem a permissão do Android",
  gate: "navegador",
  edicoes: [{ arquivo: REGRA, de: '  if (permission !== "granted") return off("sem_permissao");\n', para: "" }],
  assinatura: /XX {2}D3 /,
});
mutacao({
  id: "MR4",
  propriedade: "captura na viagem de OUTRO motoboy",
  gate: "navegador",
  edicoes: [{ arquivo: REGRA, de: '  if (trip.courier_actor_id !== actor.actor_id) return off("viagem_de_outro");\n', para: "" }],
  assinatura: /XX {2}E2 /,
});
mutacao({
  id: "MR5",
  propriedade: "aceite de outro motoboy ou de outro aparelho vale aqui",
  gate: "regra",
  edicoes: [
    {
      arquivo: REGRA,
      de: '  if (ack.rider_id !== actor.actor_id || !deviceId || ack.device_id !== deviceId) return off("sem_aceite");\n',
      para: "",
    },
  ],
  assinatura: /XX {2}R3 aceite de outro aparelho/,
});
mutacao({
  id: "MR6",
  propriedade: "flag de GPS desligada no servidor liga mesmo assim",
  gate: "regra",
  edicoes: [
    {
      arquivo: REGRA,
      de: '  if (!policies || !policies.flags || policies.flags.gps_capture_enabled !== true) return off("gps_desligado");\n',
      para: '  if (!policies || !policies.flags) return off("gps_desligado");\n',
    },
  ],
  assinatura: /XX {2}R3 flag desligada/,
});

console.log("\n2. COMO A PAGINA LIGA E DESLIGA — rider.js");

mutacao({
  id: "MR7",
  propriedade: "viagem encerrada e a captura segue ligada (L6)",
  gate: "navegador",
  edicoes: [{ arquivo: RIDER, de: "    native.stopTripCapture();\n", para: "" }],
  assinatura: /XX {2}B4 /,
});
mutacao({
  id: "MR8",
  propriedade: "GPS do navegador em paralelo ao nativo",
  gate: "navegador",
  edicoes: [{ arquivo: RIDER, de: "  geolocation: nativeGeo,\n", para: "  geolocation: navigator.geolocation,\n" }],
  assinatura: /XX {2}(B2|C8) /,
});
mutacao({
  id: "MR9",
  propriedade: "captura pelo CLIQUE, antes de o domínio aceitar a saída",
  gate: "navegador",
  edicoes: [
    {
      arquivo: RIDER,
      de: '    if (!confirm("Confirmar saída da loja?")) return;\n',
      para: '    if (!confirm("Confirmar saída da loja?")) return;\n    if (native) native.startTripCapture(t.trip_id);\n',
    },
  ],
  assinatura: /XX {2}D1 /,
});
mutacao({
  id: "MR10",
  propriedade: "permissão pedida antes do termo",
  gate: "navegador",
  edicoes: [
    {
      arquivo: RIDER,
      de: "    cap.permission = permissionFromStatus(st);\n",
      para: '    cap.permission = permissionFromStatus(st);\n    if (cap.permission !== "granted") native.requestLocationPermission();\n',
    },
  ],
  assinatura: /XX {2}C2 /,
});
mutacao({
  id: "MR11",
  propriedade: "as políticas do servidor não chegam ao nativo",
  gate: "navegador",
  edicoes: [{ arquivo: RIDER, de: "      native.applyServerPolicies(body);\n", para: "" }],
  assinatura: /XX {2}C1 /,
});
mutacao({
  id: "MR12",
  propriedade: "a mesma viagem é ligada mais de uma vez",
  gate: "navegador",
  edicoes: [
    {
      arquivo: RIDER,
      de: "  if (d.capture && cap.requestedTrip !== d.trip_id && cap.blockedTrip !== d.trip_id) {\n",
      para: "  if (d.capture && cap.blockedTrip !== d.trip_id) {\n",
    },
  ],
  assinatura: /XX {2}B2 /,
});
mutacao({
  id: "MR13",
  propriedade: "reabrir o app não reconcilia com o serviço nativo",
  gate: "navegador",
  edicoes: [
    {
      arquivo: RIDER,
      de: "    cap.runningTrip = st && st.active_trip_id ? String(st.active_trip_id) : null;\n",
      para: "    cap.runningTrip = null;\n",
    },
  ],
  assinatura: /XX {2}E3 /,
});

console.log("\n3. O REGISTRO QUE A PAGINA USA — servidor");

mutacao({
  id: "MS1",
  propriedade: "caminho legado grava aceite em nome de outro (operador)",
  gate: "servidor",
  edicoes: [
    {
      arquivo: API,
      de: '  if (\n    !args.actor ||\n    args.actor.role !== "motoboy_interno" ||\n    args.input.rider_id !== args.actor.actor_id\n  ) {\n    return bad(403, "Só o próprio motoboy registra o aceite do termo.", "not_rider");\n  }\n\n  const expected',
      para: "  const expected",
    },
  ],
  assinatura: /Q018 caminho legado: operador NÃO grava/,
});
mutacao({
  id: "MS2",
  propriedade: "o servidor aceita o motoboy vindo do CORPO",
  gate: "servidor",
  edicoes: [{ arquivo: API, de: "      rider_id: args.actor.actor_id,\n", para: "      rider_id: String(args.input.rider_id ?? args.actor.actor_id),\n" }],
  assinatura: /Q018 o SERVIDOR monta o registro/,
});
mutacao({
  id: "MS3",
  propriedade: "a consulta do registro ignora o aparelho",
  gate: "servidor",
  edicoes: [
    {
      arquivo: API,
      de: "    acknowledgement = args.store.forRider(rider).find((r) => r.acknowledgement_id === id) ?? null;\n",
      para: "    acknowledgement = args.store.forRider(rider).find((r) => r.term_hash === hash) ?? null;\n",
    },
  ],
  assinatura: /Q018 \/api\/term devolve o registro DESTE motoboy/,
});
mutacao({
  id: "MS4",
  propriedade: "caminho absoluto de configuração ignorado em silêncio",
  gate: "navegador",
  edicoes: [
    {
      arquivo: PILOTO,
      de: "  const p = isAbsolute(file) ? file : join(process.cwd(), file);\n",
      para: "  const p = join(process.cwd(), file);\n",
    },
  ],
  assinatura: /term_not_publishable/,
});
mutacao({
  id: "MS5",
  propriedade: "a sessão entra DEPOIS do primeiro fetch da página",
  gate: "navegador",
  edicoes: [
    { arquivo: PILOTO, de: "    const boot = `<script>\n", para: '    const boot = `<script type="module">\n' },
    { arquivo: PILOTO, de: '    out = out.replace("<head>", "<head>\\n" + boot);\n', para: '    out = out.replace("</body>", boot + "\\n</body>");\n' },
  ],
  assinatura: /stopTitle|waitForFunction|Timeout/,
});

console.log("\n4. O LADO NATIVO — estrutural (sem compilador aqui)");

mutacao({
  id: "MA1",
  propriedade: "aceite de outro aparelho entra no Room",
  gate: "android",
  edicoes: [{ arquivo: MAIN, de: '            require(o.getString("device_id") == DeviceId.ensure(db)) { APARELHO_DIVERGENTE }\n', para: "" }],
  assinatura: /Q018 aceite com aparelho divergente/,
});
mutacao({
  id: "MA2",
  propriedade: "a ponte não expõe applyServerPolicies ao JavaScript",
  gate: "android",
  edicoes: [{ arquivo: PONTE, de: "    @JavascriptInterface\n    fun applyServerPolicies(", para: "    fun applyServerPolicies(" }],
  assinatura: /Q018 a ponte repassa/,
});
mutacao({
  id: "MA3",
  propriedade: "capacidades sem o device_id",
  gate: "android",
  edicoes: [{ arquivo: MAIN, de: '        put("device_id", runBlocking { DeviceId.ensure(db) })\n', para: "" }],
  assinatura: /Q018 capacidades levam/,
});

/* ---- fecho ---- */
try {
  // O último gate de servidor compilou código mutado: dist volta ao limpo.
  execFileSync("npx", ["tsc"], { cwd: raiz, encoding: "utf8", timeout: 600_000 });
} catch {
  falhas.push("rebuild final de dist falhou");
}
teste("nenhum arquivo mutado ficou diferente do commit", () => {
  const sujos = execFileSync("git", ["status", "--porcelain", "--", REGRA, RIDER, API, PILOTO, MAIN, PONTE], {
    cwd: raiz,
    encoding: "utf8",
  }).trim();
  assert.equal(sujos, "", `arquivos alterados depois da suíte:\n${sujos}`);
});

const total = passaram + falhas.length;
console.log(`\n${passaram}/${total} · cegas: ${cegas}`);
if (falhas.length || cegas) {
  for (const f of falhas) console.log(`  FALHA ${f.split("\n")[0]}`);
  console.log("\nRIDER_BRIDGE_MUTATIONS_RED");
  process.exit(1);
}
console.log("\nRIDER_BRIDGE_MUTATIONS_GREEN");
