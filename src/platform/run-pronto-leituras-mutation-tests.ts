/**
 * Mutações das duas leituras do pronto e da entrada do fato da entrega na plataforma.
 * ============================================================================
 * Cada mutação devolve ao código um defeito que esta entrega fechou, roda
 * test:platform:pronto-leituras e exige a reprovação PELA PROVA CERTA (o id F/H que
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
        .filter((l) => l.includes("tools/entregas_pilot_server.ts") && !l.includes("run-pronto-leituras-mutation"))
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
      ? ["cmd.exe", ["/d", "/s", "/c", "npx.cmd", "tsx", "src/platform/run-pronto-leituras-tests.ts"]]
      : ["npx", ["tsx", "src/platform/run-pronto-leituras-tests.ts"]];
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

const L = "src/platform/leitura/prontos-de-entregas.ts";
const AD = "src/platform/ingest/entregas-shadow-adapter.ts";
const OV = "src/platform/runtime/handler-operacao-viva.ts";
const HT = "src/platform/runtime/handler-trajetoria-pronto.ts";
const RT = "src/platform/bin/async-runtime.ts";
const SC = "docs/contracts/eventos.schema.json";
const ALVOS = [L, AD, OV, HT, RT, SC] as const;
const HASH_INICIAL = new Map(ALVOS.map((a) => [a, sha(readFileSync(join(raiz, a), "utf8"))]));
if (!process.env.DELIVERYOS_PG_URL?.trim()) {
  falhas.push("sem DELIVERYOS_PG_URL: o fluxo isolado (W1-W5) não roda, e as mutações não são medidas por inteiro");
}

console.log("\n=== Mutações das leituras do pronto ===\n");
console.log("0. CONTROLE POSITIVO — a suíte verde ANTES de mutar");
teste("a suíte está verde sem mutação", () => {
  const r = rodar();
  assert.ok(r.ok, `já vermelha antes de mutar:\n${r.saida.slice(-900)}`);
});

console.log("\n1. ESTADO ATUAL: NÃO MISTURAR, NÃO DUPLICAR, AUSÊNCIA NÃO É ZERO");
mutacao({ id: "ML1", prova: "R2", propriedade: "linha velha da fila conta de novo junto com o fato",
  edicoes: [{ arquivo: L, de: "      if (consumidos.has(chaveDoRegistro(pedido, r))) { velhas += 1; continue; }\n", para: "" }] });
mutacao({ id: "ML2", prova: "R3", propriedade: "fila indisponível vira zero",
  edicoes: [{ arquivo: L, de: "      total: null, mais_antigo_desde: null, pedidos: [] };\n", para: "      total: 0, mais_antigo_desde: null, pedidos: [] };\n" }] });
mutacao({ id: "ML3", prova: "R3", propriedade: "fatos indisponíveis viram 'nada aguardando'",
  edicoes: [{ arquivo: L, de: "    aguardando_saida = { estado: \"indisponivel\", motivo: entrada.eventos.motivo, grupos: [] };\n",
    para: "    aguardando_saida = { estado: \"observado\", motivo: null, grupos: [] };\n" }] });
mutacao({ id: "ML12", prova: "R1", propriedade: "a fila, que não tem modo, passa a se declarar real",
  edicoes: [{ arquivo: L, de: "      estado: \"observado\", motivo: null, source_mode: \"nao_declarado\", total: pedidos.length,\n",
    para: "      estado: \"observado\", motivo: null, source_mode: \"real\" as \"nao_declarado\", total: pedidos.length,\n" }] });

console.log("\n2. TRAJETÓRIA: RETIRADA, ACRÉSCIMO, RELÓGIO, ORDEM");
mutacao({ id: "ML4", prova: "R5", propriedade: "entrega retirada antes da saída herda a saída da viagem",
  edicoes: [{ arquivo: L, de: "    if (retirada && (!saida || retirada.servidor < saida.servidor)) {\n", para: "    if (retirada && !saida) {\n" }] });
mutacao({ id: "ML5", prova: "R6", propriedade: "entrega acrescentada depois da saída herda a saída da viagem",
  edicoes: [{ arquivo: L, de: "    if (saida.servidor < r.associado) {\n", para: "    if (false) {\n" }] });
mutacao({ id: "ML6", prova: "R4", propriedade: "o trecho associação → saída começa no registro",
  edicoes: [{ arquivo: L, de: "      associacao_ate_saida_s: segundos(r.associado, saida.declarado),\n",
    para: "      associacao_ate_saida_s: segundos(r.registrado, saida.declarado),\n" }] });
mutacao({ id: "ML7", prova: "R12", propriedade: "intervalo negativo pelo relógio do aparelho é publicado",
  edicoes: [{ arquivo: L, de: "    if (saida.declarado < r.associado) {\n", para: "    if (false) {\n" }] });
mutacao({ id: "ML8", prova: "R8", propriedade: "a ordem de chegada dos fatos muda a leitura",
  edicoes: [{ arquivo: L, de: "  entregas.sort((a, b) => (ms(a.registrado_em)! - ms(b.registrado_em)!) || a.delivery_id.localeCompare(b.delivery_id));\n", para: "" }] });

console.log("\n3. MODO E UNIDADE");
mutacao({ id: "ML10", prova: "R10", propriedade: "fato sem modo entra na leitura",
  edicoes: [{ arquivo: L, de: "    if (f.source_mode === null || !SOURCE_MODES.includes(f.source_mode)) {\n", para: "    if (false) {\n" }] });
mutacao({ id: "ML11", prova: "R11", propriedade: "fato de outra loja entra na leitura",
  edicoes: [{ arquivo: L, de: "    if (f.unit_id !== unit_id || !tipos.has(f.event_type)) continue;\n", para: "    if (!tipos.has(f.event_type)) continue;\n" }] });

console.log("\n4. ENTRADA NA PLATAFORMA: PRIVACIDADE, VÍNCULO, SEMÂNTICA, VIAGEM");
mutacao({ id: "MA1", prova: "A1", propriedade: "o adaptador copia o payload público inteiro (rótulo, autor)",
  edicoes: [{ arquivo: AD, de: "    campos = { delivery_id, order_ref };\n", para: "    campos = { ...fonte, delivery_id, order_ref };\n" }] });
mutacao({ id: "MA2", prova: "A5", propriedade: "fato da entrega sem delivery_id entra",
  edicoes: [{ arquivo: AD, de: "    if (!delivery_id) return recusa(\"delivery_id_ausente\");\n", para: "" }] });
mutacao({ id: "MA3", prova: "A5", propriedade: "sinal solto sem a semântica de registro vira fato da plataforma",
  edicoes: [{ arquivo: AD, de: "    if (daEntrega === \"delivery_ready\" && fonte.ready_kind !== \"registro_expedicao\") {\n",
    para: "    if (false) {\n" }] });
mutacao({ id: "MA4", prova: "V1", propriedade: "a Operação Viva passa a consumir o fato da entrega (viagem afetada)",
  edicoes: [{ arquivo: OV, de: "  \"trip_closed\",\n];\n", para: "  \"trip_closed\",\n  \"delivery_ready\",\n];\n" }] });
mutacao({ id: "MA5", prova: "H2", propriedade: "o runtime assíncrono deixa de ligar o consumidor (dead-letter)",
  edicoes: [{ arquivo: RT, de: "  ...montarHandlersDaTrajetoriaDoPronto(),\n", para: "" }] });
mutacao({ id: "MA6", prova: "H1", propriedade: "o consumidor aceita mensagem de outro tipo",
  edicoes: [{ arquivo: HT, de: "      if (msg.kind !== tipo || p.event_type !== tipo || typeof p.event_id !== \"string\" || !p.event_id) {\n",
    para: "      if (false) {\n" }] });
mutacao({ id: "MK1", prova: "K1", propriedade: "o contrato deixa de exigir delivery_id",
  edicoes: [{ arquivo: SC, de: "      \"required\": [\"source_event_type\", \"public_recorded_at\", \"delivery_id\", \"order_ref\", \"ready_kind\"],\n",
    para: "      \"required\": [\"source_event_type\", \"public_recorded_at\", \"order_ref\", \"ready_kind\"],\n" }] });

console.log("\n5. RESTAURAÇÃO");
teste("todos os alvos voltaram byte a byte à origem", () => {
  for (const a of ALVOS) {
    assert.equal(sha(readFileSync(join(raiz, a), "utf8")), HASH_INICIAL.get(a), `${a} não voltou à origem`);
  }
});

const total = passaram + falhas.length;
console.log(`\nPRONTO_LEITURAS_MUTACOES: ${passaram}/${total} · cegas: ${cegas}`);
if (falhas.length) {
  for (const f of falhas) console.log(`  - ${f.split("\n")[0]}`);
  process.exit(1);
}
console.log("PRONTO_LEITURAS_MUTACOES_GREEN");
