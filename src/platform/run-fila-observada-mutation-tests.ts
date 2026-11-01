/**
 * Mutações da fila observada: a saída mínima do piloto, a leitura da
 * plataforma com origem declarada, o cliente da observação e a memória do feed.
 * ============================================================================
 * Cada mutação devolve ao código um defeito que esta entrega fechou, roda a
 * suíte que guarda a propriedade e exige a reprovação PELA PROVA CERTA:
 *
 *   piloto      → src/entregas/pilot/run-ready-queue-observation-tests.ts (Q*, H*)
 *   plataforma  → src/platform/run-fila-observada-tests.ts (O*)
 *   feed        → src/platform/run-fila-observada-custo-tests.ts, CUSTO_SO_FEED=1 (C5–C8)
 *
 * Zero mutações cegas. Mutação que não entrou no disco não conta; gate que nem
 * rodou não conta; reprovar por outra prova significa que a propriedade não
 * estava defendida. Toda mutação é restaurada byte a byte (sha256), também em
 * SIGINT/SIGTERM. Exige DELIVERYOS_PG_URL: as provas O1, O11–O13 são de banco.
 *
 * Defesa em profundidade declarada: o papel é conferido na rota E na fachada.
 * Remover só um dos dois não abre a fila (o outro recusa) — por isso a
 * mutação MP10 remove os dois, e MP4 prova a barreira da fachada sozinha.
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
        .filter((l) => l.includes("tools/entregas_pilot_server.ts") && !l.includes("run-fila-observada-mutation"))
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

type Gate = "piloto" | "plataforma" | "feed";
const SUITE: Record<Gate, string> = {
  piloto: "src/entregas/pilot/run-ready-queue-observation-tests.ts",
  plataforma: "src/platform/run-fila-observada-tests.ts",
  feed: "src/platform/run-fila-observada-custo-tests.ts",
};

function rodar(gate: Gate): { ok: boolean; saida: string } {
  const env = { ...process.env, ...(gate === "feed" ? { CUSTO_SO_FEED: "1" } : {}) };
  const [bin, args]: [string, string[]] =
    process.platform === "win32"
      ? ["cmd.exe", ["/d", "/s", "/c", "npx.cmd", "tsx", SUITE[gate]]]
      : ["npx", ["tsx", SUITE[gate]]];
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
function mutacao(o: { id: string; gate: Gate; prova: string; propriedade: string; edicoes: Edicao[] }): void {
  if (catalogo.has(o.id)) falhas.push(`id de mutacao duplicado: ${o.id}`);
  catalogo.add(o.id);
  const assinatura = new RegExp(`FAIL ${o.prova} `);
  teste(`${o.id} — ${o.propriedade}`, () => {
    const feitas = aplicar(o.edicoes);
    console.log(`        aplicada · ${feitas.map((f) => `${f.arquivo.split("/").pop()} ${f.hash.slice(0, 8)}`).join(" · ")}`);
    try {
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
      console.log(`        restaurado · ${feitas.length} arquivo(s) == origem`);
    }
  });
}

const OB = "src/entregas/pilot/ready-queue-observation.ts";
const FA = "src/entregas/pilot/pilot-facade.ts";
const SV = "tools/entregas_pilot_server.ts";
const L = "src/platform/leitura/prontos-de-entregas.ts";
const CL = "src/platform/leitura/fila-do-piloto.ts";
const FD = "src/entregas/integration/durable-event-feed.ts";
const ALVOS = [OB, FA, SV, L, CL, FD] as const;
const HASH_INICIAL = new Map(ALVOS.map((a) => [a, sha(readFileSync(join(raiz, a), "utf8"))]));
if (!process.env.DELIVERYOS_PG_URL?.trim()) {
  falhas.push("sem DELIVERYOS_PG_URL: as provas de banco (O1, O11-O13) não rodam, e as mutações não são medidas por inteiro");
}

console.log("\n=== Mutações da fila observada ===\n");
console.log("0. CONTROLES POSITIVOS — cada suíte verde ANTES de mutar");
for (const gate of ["piloto", "plataforma", "feed"] as const) {
  teste(`a suíte ${gate} está verde sem mutação`, () => {
    const r = rodar(gate);
    assert.ok(r.ok, `já vermelha antes de mutar:\n${r.saida.slice(-900)}`);
  });
}

console.log("\n1. PILOTO: SÓ OS CAMPOS PERMITIDOS, MODO, PAPEL, AUSÊNCIA, MARCA, CUSTO");
mutacao({ id: "MP1", gate: "piloto", prova: "Q1", propriedade: "a saída espalha o registro inteiro (rótulo com endereço, autor)",
  edicoes: [{ arquivo: OB, de: "    entries.push({\n      order_ref,\n", para: "    entries.push({\n      ...(o as object),\n      order_ref,\n" }] });
mutacao({ id: "MP2", gate: "piloto", prova: "Q2", propriedade: "registro sem modo sai como real",
  edicoes: [{ arquivo: OB, de: "        ? o.source_mode as ReadyQueueEntry[\"source_mode\"] : null,\n",
    para: "        ? o.source_mode as ReadyQueueEntry[\"source_mode\"] : \"real\",\n" }] });
mutacao({ id: "MP3", gate: "piloto", prova: "Q2", propriedade: "o registro deixa de guardar o modo do piloto",
  edicoes: [{ arquivo: FA, de: "      ...(this.cfg.source_mode ? { source_mode: this.cfg.source_mode } : {}),\n", para: "" }] });
mutacao({ id: "MP4", gate: "piloto", prova: "Q3", propriedade: "a fachada entrega a fila a qualquer papel (motoboy incluído)",
  edicoes: [{ arquivo: FA, de: "    if (!READY_QUEUE_OBSERVER_ROLES.includes(viewer.role)) {\n", para: "    if (false) {\n" }] });
mutacao({ id: "MP5", gate: "piloto", prova: "Q4", propriedade: "fila ilegível vira zero",
  edicoes: [{ arquivo: OB, de: "    return { ...base, availability: \"unavailable\", reason: input.read.reason, total: null,\n",
    para: "    return { ...base, availability: \"unavailable\", reason: input.read.reason, total: 0,\n" }] });
mutacao({ id: "MP6", gate: "piloto", prova: "Q5", propriedade: "linha com instante ilegível some sem ser contada",
  edicoes: [{ arquivo: OB, de: "    if (!order_ref || registered_at === null) { invalid += 1; continue; }\n",
    para: "    if (!order_ref || registered_at === null) { continue; }\n" }] });
mutacao({ id: "MP7", gate: "piloto", prova: "Q6", propriedade: "a marca ignora a saída publicada depois do pronto",
  edicoes: [{ arquivo: FA, de: "            if (FACTS_WATERMARK_TYPES.includes(outbox[i].event.event_type)) {\n",
    para: "            if (outbox[i].event.event_type === \"delivery_ready\") {\n" }] });
mutacao({ id: "MP8", gate: "piloto", prova: "Q8", propriedade: "com backend externo, a marca varre a outbox inteira",
  edicoes: [{ arquivo: FA, de: "      if (this.storage.kind === \"file\") {\n", para: "      if (true) {\n" }] });
mutacao({ id: "MP9", gate: "piloto", prova: "H3", propriedade: "a rota aceita parâmetro (unidade ou token na URL)",
  edicoes: [{ arquivo: SV, de: "      if (req.method !== \"GET\") return reply(405, { ok: false, code: \"read_only\" });\n      if (url.search) return reply(400, { ok: false, code: \"no_query_parameters\" });\n      const r = await facade.observeReadyQueue({\n",
    para: "      if (req.method !== \"GET\") return reply(405, { ok: false, code: \"read_only\" });\n      const r = await facade.observeReadyQueue({\n" }] });
mutacao({ id: "MP10", gate: "piloto", prova: "H2", propriedade: "rota e fachada entregam a fila ao motoboy e ao operador",
  edicoes: [
    { arquivo: SV, de: "    if (url.pathname === \"/api/ready-orders/observation\") {\n      if (!actor) return reply(401, { ok: false, code: \"session_required\" });\n      if (![\"gerente\", \"lider_delivery\"].includes(actor.role))\n",
      para: "    if (url.pathname === \"/api/ready-orders/observation\") {\n      if (!actor) return reply(401, { ok: false, code: \"session_required\" });\n      if (false)\n" },
    { arquivo: FA, de: "    if (!READY_QUEUE_OBSERVER_ROLES.includes(viewer.role)) {\n", para: "    if (false) {\n" },
  ] });

console.log("\n2. PLATAFORMA: ORIGEM DECLARADA, PRIVACIDADE, UNIDADE, MODO, RELÓGIO, ATRASO");
mutacao({ id: "MO1", gate: "plataforma", prova: "O1", propriedade: "sem origem declarada, a tabela vazia vira fila vazia (falso zero)",
  edicoes: [{ arquivo: L, de: "    } else if (declarada?.origem === \"postgres\") {\n", para: "    } else if (declarada?.origem === \"postgres\" || declarada === undefined) {\n" }] });
mutacao({ id: "MO2", gate: "plataforma", prova: "O3", propriedade: "campo fora da lista (rótulo, autor) é aceito",
  edicoes: [{ arquivo: L, de: "  if (ks.some((k) => !esperadas.includes(k))) return \"campos_nao_permitidos\";\n", para: "" }] });
mutacao({ id: "MO3", gate: "plataforma", prova: "O4", propriedade: "observação de outra loja entra",
  edicoes: [{ arquivo: L, de: "  if (observacao.unit_id !== opcoes.unit_id) return recusa(\"unidade_divergente\");\n", para: "" }] });
mutacao({ id: "MO4", gate: "plataforma", prova: "O5", propriedade: "modo fora do vocabulário é aceito",
  edicoes: [{ arquivo: L, de: "    const modoValido = e.source_mode === null || (SOURCE_MODES as readonly unknown[]).includes(e.source_mode);\n",
    para: "    const modoValido = true;\n" }] });
mutacao({ id: "MO5", gate: "plataforma", prova: "O2", propriedade: "linha sem modo vira real na plataforma",
  edicoes: [{ arquivo: L, de: "      source_mode: e.source_mode === null ? \"nao_declarado\" : e.source_mode as SourceMode,\n",
    para: "      source_mode: e.source_mode === null ? \"real\" : e.source_mode as SourceMode,\n" }] });
mutacao({ id: "MO6", gate: "plataforma", prova: "O5", propriedade: "a fila soma todos os modos num grupo só",
  edicoes: [{ arquivo: L, de: "      const modo: ModoDaLinha = l.source_mode !== undefined && (SOURCE_MODES as readonly string[]).includes(l.source_mode)\n        ? l.source_mode : \"nao_declarado\";\n",
    para: "      const modo: ModoDaLinha = \"nao_declarado\";\n" }] });
mutacao({ id: "MO7", gate: "plataforma", prova: "O6", propriedade: "a espera conta da consulta, não do registro",
  edicoes: [{ arquivo: L, de: "      doModo.push({ order_ref: pedido, registrado_em: l.registered_at, registrado: r, espera_s: espera(r) });\n",
    para: "      doModo.push({ order_ref: pedido, registrado_em: entrada.fila.observado_em ?? l.registered_at, registrado: r, espera_s: espera(ms(entrada.fila.observado_em) ?? r) });\n" }] });
mutacao({ id: "MO8", gate: "plataforma", prova: "O7", propriedade: "observação no futuro é aceita",
  edicoes: [{ arquivo: L, de: "  if (observado - agora > TOLERANCIA_DO_RELOGIO_MS) return { disponivel: false, motivo: \"observacao_no_futuro\", origem };\n", para: "" }] });
mutacao({ id: "MO9", gate: "plataforma", prova: "O8", propriedade: "sem marca, a leitura afirma fatos em dia",
  edicoes: [{ arquivo: L, de: "  if (fila.marca_dos_fatos === undefined) return \"desconhecida\";\n", para: "  if (fila.marca_dos_fatos === undefined) return \"fatos_em_dia\";\n" }] });
mutacao({ id: "MO10", gate: "plataforma", prova: "O8", propriedade: "marca que não cobre saída e retirada vale como consistência",
  edicoes: [{ arquivo: L, de: "    && TIPOS_COBERTOS_PELA_MARCA.every((t) => (m.covered_types as unknown[]).includes(t));\n", para: "    && true;\n" }] });
mutacao({ id: "MO11", gate: "plataforma", prova: "O12", propriedade: "no banco, a marca é dada como chegada sem conferir",
  edicoes: [{ arquivo: L, de: "          fila = { ...observada, marca_ingerida: achou.length > 0 };\n", para: "          fila = { ...observada, marca_ingerida: true };\n" }] });
mutacao({ id: "MO12", gate: "plataforma", prova: "O10", propriedade: "fila declarada ilegível pelo piloto vira fila vazia",
  edicoes: [{ arquivo: L, de: "  if (observacao.availability === \"unavailable\") {\n",
    para: "  if (observacao.availability === \"unavailable\") {\n    return { disponivel: true, linhas: [], origem, observado_em };\n" }] });
mutacao({ id: "MO13", gate: "plataforma", prova: "O14", propriedade: "o cliente lança exceção quando o piloto está fora do ar",
  edicoes: [{ arquivo: CL, de: "    return indisponivel(controle.signal.aborted ? \"piloto_sem_resposta_no_prazo\" : \"piloto_inalcancavel\");\n",
    para: "    throw new Error(\"rede\");\n" }] });
mutacao({ id: "MO14", gate: "plataforma", prova: "O14", propriedade: "credencial recusada some no meio dos outros erros",
  edicoes: [{ arquivo: CL, de: "    if (resposta.status === 401 || resposta.status === 403) return indisponivel(\"piloto_recusou_a_credencial\");\n", para: "" }] });

console.log("\n3. FEED DO CONSUMIDOR: MEMÓRIA SEM DADO VELHO");
mutacao({ id: "MF1", gate: "feed", prova: "C6", propriedade: "a memória ignora a assinatura do arquivo (commit novo não é visto)",
  edicoes: [{ arquivo: FD, de: "    if (antes !== null && memoria !== null && memoria.chave === antes.chave) {\n", para: "    if (antes !== null && memoria !== null) {\n" }] });
mutacao({ id: "MF2", gate: "feed", prova: "C7b", propriedade: "arquivo recém-escrito fica em memória (corrida do tique do relógio de arquivo)",
  edicoes: [{ arquivo: FD, de: "        && agora() - antes.mtimeMs >= estabilidade) {\n", para: "        ) {\n" }] });
mutacao({ id: "MF3", gate: "feed", prova: "C7", propriedade: "leitura feita durante uma escrita fica em memória com a assinatura nova",
  edicoes: [
    { arquivo: FD, de: "    if (antes !== null && depois !== null && depois.chave === antes.chave\n", para: "    if (antes !== null && depois !== null\n" },
    { arquivo: FD, de: "      memoria = { chave: antes.chave, registros };\n", para: "      memoria = { chave: depois.chave, registros };\n" },
  ] });
mutacao({ id: "MF4", gate: "feed", prova: "C8", propriedade: "o feed devolve o evento da memória sem copiar",
  edicoes: [{ arquivo: FD, de: "    return all.slice(start, end).map((r) => structuredClone(r.event));\n", para: "    return all.slice(start, end).map((r) => r.event);\n" }] });
mutacao({ id: "MF5", gate: "feed", prova: "C5", propriedade: "o feed relê o arquivo inteiro a cada ciclo ocioso",
  edicoes: [{ arquivo: FD, de: "      memoria = { chave: antes.chave, registros };\n", para: "      memoria = null;\n" }] });

console.log("\n4. RESTAURAÇÃO");
teste("todos os alvos voltaram byte a byte à origem", () => {
  for (const a of ALVOS) {
    assert.equal(sha(readFileSync(join(raiz, a), "utf8")), HASH_INICIAL.get(a), `${a} não voltou à origem`);
  }
});

const total = passaram + falhas.length;
console.log(`\nFILA_OBSERVADA_MUTACOES: ${passaram}/${total} · cegas: ${cegas}`);
if (falhas.length) {
  for (const f of falhas) console.log(`  - ${f.split("\n")[0]}`);
  process.exit(1);
}
console.log("FILA_OBSERVADA_MUTACOES_GREEN");
