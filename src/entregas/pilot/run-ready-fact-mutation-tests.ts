/**
 * Mutações do "pronto vira fato".
 * ============================================================================
 * Cada mutação devolve ao código um defeito que esta entrega fechou, roda
 * test:entregas:ready-fact e exige a reprovação PELA PROVA CERTA (o id F/H que
 * guarda aquela propriedade). Zero mutações cegas.
 * Mutação que não entrou no disco não conta; gate que nem rodou não conta;
 * reprovar por outra prova significa que a propriedade não estava defendida.
 * Toda mutação é restaurada byte a byte (sha256), também em SIGINT/SIGTERM.
 * As provas de PostgreSQL ficam fora daqui (DELIVERYOS_PG_URL é removida): o
 * gate de mutação mede as provas de arquivo e de processo.
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

function limparPilotos(): void {
  if (process.platform === "win32") return;
  try {
    const linhas = execSync("ps -eo pgid,args", { encoding: "utf8" }).split("\n");
    const grupos = new Set(
      linhas
        .filter((l) => l.includes("tools/entregas_pilot_server.ts") && !l.includes("run-ready-fact-mutation"))
        .map((l) => Number(l.trim().split(/\s+/)[0]))
        .filter((g) => Number.isInteger(g) && g > 1 && g !== process.pid),
    );
    for (const g of grupos) {
      try { process.kill(-g, "SIGTERM"); } catch { /* já saiu */ }
    }
  } catch {
    /* ps indisponível */
  }
}

function rodar(): { ok: boolean; saida: string } {
  const env = { ...process.env };
  delete env.DELIVERYOS_PG_URL;
  const [bin, args]: [string, string[]] =
    process.platform === "win32"
      ? ["cmd.exe", ["/d", "/s", "/c", "npx.cmd", "tsx", "src/entregas/pilot/run-ready-fact-tests.ts"]]
      : ["npx", ["tsx", "src/entregas/pilot/run-ready-fact-tests.ts"]];
  try {
    const saida = execFileSync(bin, args, { cwd: raiz, env, encoding: "utf8", timeout: 600_000 });
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

const catalogo = new Set<string>();
function mutacao(o: { id: string; propriedade: string; edicoes: Edicao[]; prova: string }): void {
  if (catalogo.has(o.id)) falhas.push(`id de mutacao duplicado: ${o.id}`);
  catalogo.add(o.id);
  const assinatura = new RegExp(`FAIL ${o.prova} `);
  teste(`${o.id} — ${o.propriedade}`, () => {
    const feitas = aplicar(o.edicoes);
    console.log(`        aplicada · ${feitas.map((f) => `${f.arquivo.split("/").pop()} ${f.hash.slice(0, 8)}`).join(" · ")}`);
    try {
      const r = rodar();
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
      console.log(`        restaurado · ${feitas.length} arquivo(s) == origem`);
    }
  });
}

const SVC = "src/entregas/operational/application-service.ts";
const FAC = "src/entregas/pilot/pilot-facade.ts";
const TL = "src/entregas/pilot/trip-timeline.ts";
const ALVOS = [SVC, FAC, TL] as const;
const HASH_INICIAL = new Map(ALVOS.map((a) => [a, sha(readFileSync(join(raiz, a), "utf8"))]));

console.log("\n=== Mutações do pronto vira fato ===\n");
console.log("0. CONTROLE POSITIVO — a suíte verde ANTES de mutar");
teste("a suíte está verde sem mutação", () => {
  const r = rodar();
  assert.ok(r.ok, `já vermelha antes de mutar:\n${r.saida.slice(-900)}`);
});

console.log("\n1. O FATO EXISTE, NA ENTREGA, COM O INSTANTE ORIGINAL");
mutacao({
  id: "MR1", prova: "F1",
  propriedade: "CreateTrip volta a não gravar o pronto",
  edicoes: [{ arquivo: SVC, de: "    this.logReady(log, cmd.trip_id, cmd.deliveries, ready);\n", para: "" }],
});
mutacao({
  id: "MR2", prova: "F1",
  propriedade: "segundo horário artificial: instante da gravação no lugar do created_at da fila",
  edicoes: [{ arquivo: SVC, de: "        occurred_at: reg.registered_at,\n", para: "        occurred_at: new Date().toISOString(),\n" }],
});
mutacao({
  id: "MR3", prova: "F1",
  propriedade: "fato gravado só com order_ref: invisível para a linha do tempo, que busca por delivery_id",
  edicoes: [{ arquivo: SVC, de: "        object_id: d.delivery_id,\n", para: "        object_id: d.order_ref,\n" }],
});
mutacao({
  id: "MR4", prova: "F1",
  propriedade: "linha do tempo sem o rótulo humano do pronto",
  edicoes: [{ arquivo: TL, de: "  delivery_ready: { label: \"Pronto registrado pela expedição\", author: \"operacao\" },\n", para: "" }],
});
mutacao({
  id: "MR5", prova: "F1",
  propriedade: "chave idempotente por pedido, não por viagem e entrega",
  edicoes: [{ arquivo: SVC, de: "        idempotency_key: `delivery_ready:${trip_id}:${d.delivery_id}`,\n",
    para: "        idempotency_key: `delivery_ready:${d.order_ref}`,\n" }],
});
mutacao({
  id: "MR6", prova: "F4",
  propriedade: "AddDeliveryToTrip volta a perder o instante",
  edicoes: [{ arquivo: SVC,
    de: "    this.logReady(\n      log,\n      cmd.trip_id,\n      [{ delivery_id: cmd.delivery_id, order_ref: cmd.order_ref }],\n      ready,\n    );\n",
    para: "" }],
});

console.log("\n2. SEMÂNTICA E IDENTIDADE");
mutacao({
  id: "MR7", prova: "F2",
  propriedade: "registro de pronto afirmado como produção concluída",
  edicoes: [{ arquivo: SVC, de: "          production_completed_at: null,\n", para: "          production_completed_at: reg.registered_at,\n" }],
});
mutacao({
  id: "MR8", prova: "F2",
  propriedade: "identidade de quem registrou inventada",
  edicoes: [{ arquivo: SVC, de: "          registered_by: null,\n", para: "          registered_by: \"ops-1\",\n" }],
});

console.log("\n3. SEM ASSOCIAÇÃO INVENTADA, SÓ O RELÓGIO DO SERVIDOR");
mutacao({
  id: "MR9", prova: "F5",
  propriedade: "pedido fora da fila ganha pronto fabricado",
  edicoes: [{ arquivo: FAC, de: "          return o === undefined\n            ? []\n",
    para: "          return o === undefined\n            ? [{ order_ref: d.order_ref, registered_at: new Date().toISOString() }]\n" }],
});
mutacao({
  id: "MR10", prova: "F6",
  propriedade: "instante enviado pelo navegador passa a valer",
  edicoes: [{ arquivo: FAC, de: "                registered_at: o.created_at,\n",
    para: "                registered_at: String((d as { ready_registered_at?: string }).ready_registered_at ?? o.created_at),\n" }],
});
mutacao({
  id: "MR11", prova: "F12",
  propriedade: "instante corrompido na fila é aceito",
  edicoes: [{ arquivo: SVC, de: "      if (!instanteCanonico(reg.registered_at)) {\n", para: "      if (false) {\n" }],
});

console.log("\n4. FALHA, RECUPERAÇÃO E DUPLICIDADE");
mutacao({
  id: "MR12", prova: "F7",
  propriedade: "fila consumida antes do commit: a falha de gravação perde o instante",
  edicoes: [{ arquivo: FAC, de: "        const consumidos = await this.registrosJaConsumidos(ready);\n",
    para: "        await this.readyOrders.removeByOrderRefs(ready.map((r) => r.order_ref));\n        const consumidos = await this.registrosJaConsumidos(ready);\n" }],
});
mutacao({
  id: "MR13", prova: "F8",
  propriedade: "fila velha depois de queda deixa o mesmo registro sair em segunda viagem",
  edicoes: [{ arquivo: FAC, de: "        if (consumidos.length) {\n", para: "        if (false && consumidos.length) {\n" }],
});

console.log("\n5. PRIVACIDADE E MODO");
mutacao({
  id: "MR14", prova: "F10",
  propriedade: "rótulo da fila (pode ter endereço) entra no fato",
  edicoes: [
    { arquivo: FAC, de: "                registered_at: o.created_at,\n", para: "                registered_at: o.created_at,\n                label: o.label,\n" },
    { arquivo: SVC, de: "          order_ref: d.order_ref,\n          ...(reg.channel", para: "          order_ref: d.order_ref,\n          ...reg,\n          ...(reg.channel" },
  ],
});
mutacao({
  id: "MR15", prova: "F10",
  propriedade: "modo ausente vira real na outbox",
  edicoes: [{ arquivo: SVC,
    de: "        correlation_id: agg.trip.trip_id,\n        source_mode: this.publicSourceMode,\n",
    para: "        correlation_id: agg.trip.trip_id,\n        source_mode: this.publicSourceMode ?? \"real\",\n" }],
});

console.log("\n6. RESTAURAÇÃO");
teste("os três alvos voltaram byte a byte à origem", () => {
  for (const a of ALVOS) {
    assert.equal(sha(readFileSync(join(raiz, a), "utf8")), HASH_INICIAL.get(a), `${a} não voltou à origem`);
  }
});

const total = passaram + falhas.length;
console.log(`\nREADY_FACT_MUTACOES: ${passaram}/${total} · cegas: ${cegas}`);
if (falhas.length) {
  for (const f of falhas) console.log(`  - ${f.split("\n")[0]}`);
  process.exit(1);
}
console.log("READY_FACT_MUTACOES_GREEN");
