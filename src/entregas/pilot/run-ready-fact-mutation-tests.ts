/**
 * Mutações do "pronto vira fato".
 * ============================================================================
 * Cada mutação devolve ao código um defeito que esta entrega fechou, roda
 * test:entregas:ready-fact e exige a reprovação PELA PROVA CERTA (o id F/H que
 * guarda aquela propriedade). Zero mutações cegas.
 * Mutação que não entrou no disco não conta; gate que nem rodou não conta;
 * reprovar por outra prova significa que a propriedade não estava defendida.
 * Toda mutação é restaurada byte a byte (sha256), também em SIGINT/SIGTERM.
 * Com DELIVERYOS_PG_URL, as provas de PostgreSQL entram em toda rodada; a
 * mutação da arbitragem do PostgreSQL (MR20) EXIGE o banco — sem ele, ela é
 * contada como não medida, nunca como aprovada.
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
const FS = "src/entregas/persistence/file-store.ts";
const PG = "src/entregas/persistence/pg-uow.ts";
const ALVOS = [SVC, FAC, TL, FS, PG] as const;
const COM_PG = Boolean(process.env.DELIVERYOS_PG_URL?.trim());
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
  edicoes: [{ arquivo: SVC, de: "    this.logReady(log, cmd.unit_id, cmd.trip_id, cmd.deliveries, ready);\n", para: "" }],
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
  propriedade: "chave idempotente por entrega, não por registro: o mesmo registro cabe em duas entregas",
  edicoes: [{ arquivo: SVC, de: "        idempotency_key: `delivery_ready:${unit_id}:${d.order_ref}:${reg.registered_at}`,\n",
    para: "        idempotency_key: `delivery_ready:${trip_id}:${d.delivery_id}`,\n" }],
});
mutacao({
  id: "MR6", prova: "F4",
  propriedade: "AddDeliveryToTrip volta a perder o instante",
  edicoes: [{ arquivo: SVC,
    de: "    this.logReady(\n      log,\n      cmd.unit_id,\n      cmd.trip_id,\n      [{ delivery_id: cmd.delivery_id, order_ref: cmd.order_ref }],\n      ready,\n    );\n",
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
  propriedade: "identidade de quem registrou vaza para o evento público",
  edicoes: [{ arquivo: SVC, de: "          prepared_by: null,\n", para: "          prepared_by: null,\n          registered_by: reg.registered_by_actor_id,\n" }],
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
  edicoes: [{ arquivo: FAC, de: "        const bloqueio = await this.bloqueiosDeConsumo(\n",
    para: "        await this.readyOrders.removeByOrderRefs(ready.map((r) => r.order_ref));\n        const bloqueio = await this.bloqueiosDeConsumo(\n" }],
});
mutacao({
  id: "MR13", prova: "F8",
  propriedade: "fila velha depois de queda deixa o mesmo registro sair em segunda viagem",
  edicoes: [{ arquivo: FAC, de: "        if (bloqueio.filaVelha.length || bloqueio.jaConsumidos.length) {\n",
    para: "        if (bloqueio.jaConsumidos.length) {\n" }],
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

console.log("\n6. CONSUMO EXCLUSIVO, AUTOR E REENVIO");
mutacao({
  id: "MR16", prova: "F2",
  propriedade: "o ato de registrar é atribuído a quem montou a viagem",
  edicoes: [{ arquivo: FAC, de: "                  ? { registered_by_actor_id: o.registered_by.actor_id }\n",
    para: "                  ? { registered_by_actor_id: actor.actor_id }\n" }],
});
mutacao({
  id: "MR17", prova: "F2",
  propriedade: "quem registrou passa a ser apresentado como quem preparou",
  edicoes: [{ arquivo: SVC, de: "          prepared_by: null,\n", para: "          prepared_by: reg.registered_by_actor_id ?? null,\n" }],
});
mutacao({
  id: "MR18", prova: "C1",
  propriedade: "pedido já levado por outro operador entra como avulso numa segunda viagem",
  edicoes: [{ arquivo: FAC, de: "        if (bloqueio.filaVelha.length || bloqueio.jaConsumidos.length) {\n",
    para: "        if (bloqueio.filaVelha.length) {\n" }],
});
mutacao({
  id: "MR19", prova: "F16",
  propriedade: "armazenamento em arquivo aceita o mesmo registro em duas entregas",
  edicoes: [{ arquivo: FS, de: "          if (e.event_type === \"delivery_ready\" &&\n",
    para: "          if (false && e.event_type === \"delivery_ready\" &&\n" }],
});
if (COM_PG) {
  mutacao({
    id: "MR20", prova: "C3a",
    propriedade: "PostgreSQL deixa duas transações confirmarem o mesmo registro",
    edicoes: [{ arquivo: PG, de: "        if (e.event_type === \"delivery_ready\" && gravado.length === 0) {\n",
      para: "        if (false) {\n" }],
  });
} else {
  falhas.push("MR20 — NAO MEDIDA: exige DELIVERYOS_PG_URL (arbitragem entre processos no PostgreSQL)");
  console.log("  XX  MR20 — não medida: sem DELIVERYOS_PG_URL");
}
mutacao({
  id: "MR21", prova: "F15",
  propriedade: "criar viagem com id existente volta a sobrescrever no arquivo",
  edicoes: [{ arquivo: FS, de: "        if ((expected === null || expected === undefined) && cur) {\n",
    para: "        if (false && cur) {\n" }],
});
mutacao({
  id: "MR22", prova: "F13",
  propriedade: "o reenvio do próprio comando é tratado como rival e recusado",
  edicoes: [{ arquivo: FAC, de: "      const propria = typeof trip_id === \"string\" && proprias.has(`${trip_id}\\u0000${e.object_id}`);\n",
    para: "      const propria = false;\n" }],
});
mutacao({
  id: "MR23", prova: "F18",
  propriedade: "registro já consumido vira resultado incerto e o aparelho reenvia para sempre",
  edicoes: [{ arquivo: SVC, de: "          !(e instanceof Error && e.name === \"ReadyRegistrationConsumedError\")) {\n",
    para: "          true) {\n" }],
});

console.log("\n7. RESTAURAÇÃO");
teste("todos os alvos voltaram byte a byte à origem", () => {
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
