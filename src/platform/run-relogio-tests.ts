/**
 * RELÓGIO DO APARELHO — CAPTURADO ≠ HORÁRIO CONFIÁVEL.
 *
 * Um ponto com relógio errado continua sendo um ponto: a coordenada, o
 * `occurred_at` que o aparelho mandou e a hora em que o servidor recebeu ficam
 * preservados. O relógio dele perde a autoridade sobre o tempo, e um
 * `occurred_at` sem autoridade NUNCA fabrica frescor.
 *
 * Reproduzido antes da correção (binário crítico e assíncrono de `dist/`,
 * PostgreSQL real): um ponto com `occurred_at` +24 h entrava aceito, com
 * `clock_trust = 'trusted'` (o padrão da coluna, na 0001), virava a última
 * posição da viagem e da porta de Entregas, lia `unknown` agora e `fresh`
 * daqui a 24 h sem ponto novo — e o replay reconstruía a mesma distorção.
 *
 * O que esta suíte prova, com os mesmos binários e banco isolado:
 *
 *   V1      vocabulário e tolerância = os do contrato de Entregas
 *   U1–U3   a regra, pura: julgamento, relógio efetivo, instante confiável
 *   R1      todo ponto é ACEITO — o suspeito não é descartado
 *   R2      o event log guarda o julgamento: adiantado `suspect`; o resto `trusted`
 *   R3      a evidência fica intacta: `occurred_at` exato, coordenada, hora do servidor
 *   R4      o aparelho não declara o próprio relógio nem a hora do servidor
 *   R5      frescor: o ponto de amanhã NÃO fica fresco amanhã; clock ruim ≠ sem GPS
 *   R6      ao vivo (outbox) e replay (event log) chegam ao MESMO frescor
 *   R7      Entregas: último lote pelo relógio do servidor, GPS pelo instante
 *           confiável, selo que diz por quê
 *   R8      histórico carimbado pelo padrão `trusted` não fabrica frescor
 *   R9      todo fato ingerido leva os dois carimbos do servidor, na outbox e
 *           no replay — o que confina o caminho "fora da ingestão" (U3)
 *
 * Sem PostgreSQL, PULA EM VOZ ALTA.
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bancoIsolado } from "./banco-isolado";
import { emitirToken } from "./auth/device-token";
import {
  CONFIANCAS_DO_RELOGIO,
  TOLERANCIA_DO_RELOGIO_MS,
  classificarRelogio,
  relogioEfetivo,
  instanteConfiavel,
} from "./contracts/relogio";
import { lerFatosParaReplay } from "./projections/replay-do-event-log";
import { projetar, classificarFrescor, type ViagemProjetada } from "./projections/operacao-viva";
import { TIPOS_DA_OPERACAO_VIVA } from "./runtime/handler-operacao-viva";
import { lerRealidadeDeEntregas } from "./leitura/realidade-de-entregas";
import { entregasVM } from "../product/viewmodels/entregas-vm";
import { montarEntregasDemo } from "../product/demo/seed-demonstracao";

const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const raiz = process.cwd();
const BIN_CRITICO = join(raiz, "dist/src/platform/bin/critical.js");
const BIN_ASSINCRONO = join(raiz, "dist/src/platform/bin/async-runtime.js");
/** Fixture declarada. Nunca um segredo real. */
const SEGREDO = "fixture-relogio-".padEnd(48, "x");
const UNIDADE = "REL";
const UNIDADE_HISTORICO = "REL-HIST";
const MODO = "simulated";
const DIA_S = 24 * 3600;

console.log("\n=== RELOGIO DO APARELHO — CAPTURADO != HORARIO CONFIAVEL ===\n");

let passaram = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
}
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * V · U — a regra, sem banco
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log("V. O CONTRATO QUE JA EXISTIA");

  await teste("V1 vocabulário e tolerância são os do contrato de Entregas — sem vocabulário inventado", () => {
    const enums = readFileSync(join(raiz, "src/entregas/foundation/enums.ts"), "utf8");
    const m = /export const CLOCK_TRUST = \[([^\]]*)\] as const;/.exec(enums);
    assert.ok(m, "o contrato CLOCK_TRUST sumiu de Entregas");
    const deEntregas = [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    assert.deepEqual([...CONFIANCAS_DO_RELOGIO], deEntregas);
    const tipos = readFileSync(join(raiz, "src/entregas/gps/types.ts"), "utf8");
    const t = /clock_skew_tolerance_ms:\s*(\d+),/.exec(tipos);
    assert.ok(t, "a tolerância padrão sumiu da política de GPS de Entregas");
    assert.equal(TOLERANCIA_DO_RELOGIO_MS, Number(t[1]));
  });

  console.log("\nU. A REGRA, PURA");

  const RECEBIDO = "2026-09-25T12:00:00.000Z";
  const mais = (s: number) => new Date(Date.parse(RECEBIDO) + s * 1000).toISOString();

  await teste("U1 julgamento: adiantado além da tolerância é suspect; atrasado (offline) e dentro da tolerância são trusted; ilegível é unknown", () => {
    assert.equal(classificarRelogio(mais(DIA_S), RECEBIDO), "suspect");
    assert.equal(classificarRelogio(mais(121), RECEBIDO), "suspect");
    assert.equal(classificarRelogio(mais(119), RECEBIDO), "trusted");
    assert.equal(classificarRelogio(mais(0), RECEBIDO), "trusted");
    // Capturado sem rede uma hora antes: relógio certo, dado velho.
    assert.equal(classificarRelogio(mais(-3600), RECEBIDO), "trusted");
    assert.equal(classificarRelogio("ontem", RECEBIDO), "unknown");
    assert.equal(classificarRelogio(mais(0), undefined), "unknown");
  });

  await teste("U2 relógio efetivo: o carimbo sozinho não basta; suspect nunca volta a confiar; ausente é julgado, nunca presumido", () => {
    // O padrão `trusted` da 0001 contra os instantes de um ponto adiantado.
    assert.equal(relogioEfetivo({ occurred_at: mais(DIA_S), received_at: RECEBIDO, clock_trust: "trusted" }), "suspect");
    // Classificado suspect: instantes "corretos" não o reabilitam.
    assert.equal(relogioEfetivo({ occurred_at: mais(0), received_at: RECEBIDO, clock_trust: "suspect" }), "suspect");
    // Ausente ou lixo: julgado pela mesma regra.
    assert.equal(relogioEfetivo({ occurred_at: mais(-30), received_at: RECEBIDO }), "trusted");
    assert.equal(relogioEfetivo({ occurred_at: mais(DIA_S), received_at: RECEBIDO, clock_trust: "ok" }), "suspect");
    // Sem hora do servidor não há julgamento: unknown, mesmo com carimbo trusted.
    assert.equal(relogioEfetivo({ occurred_at: mais(-30), clock_trust: "trusted" }), "unknown");
  });

  await teste("U3 instante confiável: trusted é o occurred_at EXATO; sem autoridade é a hora do servidor; carimbo sem hora do servidor não vale nada; fora da ingestão vale o declarado, sem classificação", () => {
    const exato = "2026-09-25T11:59:30.123Z";
    assert.equal(instanteConfiavel({ occurred_at: exato, received_at: RECEBIDO, clock_trust: "trusted" }), exato);
    assert.equal(instanteConfiavel({ occurred_at: mais(DIA_S), received_at: RECEBIDO, clock_trust: "suspect" }), RECEBIDO);
    // Carimbo que não se pode conferir: sem instante — e sem instante nunca é fresco.
    assert.equal(instanteConfiavel({ occurred_at: mais(DIA_S), clock_trust: "suspect" }), undefined);
    assert.equal(instanteConfiavel({ occurred_at: mais(-30), clock_trust: "trusted" }), undefined);
    assert.equal(classificarFrescor(undefined, new Date(RECEBIDO)), "unknown");
    // Sem NENHUM carimbo do servidor o fato não passou pela ingestão (fixture,
    // demonstração): vale o declarado, e o relógio segue sem classificação.
    // Que todo fato de aparelho chega com os carimbos, prova o R9.
    assert.equal(instanteConfiavel({ occurred_at: exato }), exato);
    assert.equal(relogioEfetivo({ occurred_at: exato }), "unknown");
  });

  /* ------------------------------------------------------------------ *
   * R — binários reais, PostgreSQL real
   * ------------------------------------------------------------------ */

  if (!URL_PG) {
    console.log("\nPULADO: DELIVERYOS_PG_URL não definida — R1–R8 precisam de PostgreSQL real.");
    console.log(`\n${passaram}/${passaram + falhas.length} provas do relógio (SEM banco)`);
    for (const f of falhas) console.log(`  XX ${f}`);
    process.exit(falhas.length ? 1 : 0);
  }

  interface Processo {
    filho: ChildProcess;
    porta: number;
    saida(): string;
    fim(): Promise<void>;
  }

  function subir(bin: string, url: string, extra: NodeJS.ProcessEnv = {}): Processo {
    const porta = 9100 + Math.floor(Math.random() * 400);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DELIVERYOS_ENV: "local",
      DELIVERYOS_DATABASE_URL: url,
      DELIVERYOS_MIGRATE_ON_BOOT: "false",
      DELIVERYOS_DEVICE_TOKEN_SECRET: SEGREDO,
      DELIVERYOS_PORT: String(porta),
      DELIVERYOS_TICK_MS: "200",
      ...extra,
    };
    const filho = spawn(process.execPath, [bin], { cwd: raiz, env, stdio: ["ignore", "pipe", "pipe"] });
    let buffer = "";
    filho.stdout?.on("data", (d: Buffer) => (buffer += d.toString()));
    filho.stderr?.on("data", (d: Buffer) => (buffer += d.toString()));
    const saiu = new Promise<void>((r) => filho.once("exit", () => r()));
    return {
      filho,
      porta,
      saida: () => buffer,
      async fim() {
        if (filho.exitCode === null && filho.signalCode === null) {
          filho.kill("SIGTERM");
          setTimeout(() => filho.kill("SIGKILL"), 8000).unref();
        }
        await saiu;
      },
    };
  }

  async function linhas(p: Processo, rotulo: string, n = 1, limiteMs = 20000): Promise<string[]> {
    const fim = Date.now() + limiteMs;
    for (;;) {
      const achadas = p.saida().split("\n").filter((l) => l.startsWith(rotulo));
      if (achadas.length >= n) return achadas;
      if (Date.now() > fim || p.filho.exitCode !== null) {
        throw new Error(`esperava ${n}× "${rotulo}":\n${p.saida().slice(-900)}`);
      }
      await esperar(100);
    }
  }
  const json = <T>(l: string): T => JSON.parse(l.slice(l.indexOf("{"))) as T;

  interface Escopo { unit_id: string; source_mode: string; fatos: number; frescor: Record<string, number> }

  const b = await bancoIsolado(URL_PG, undefined, "relogio");
  const critico = subir(BIN_CRITICO, b.url, { DELIVERYOS_SOURCE_MODE: MODO });
  let assincrono = null as Processo | null;

  try {
    await linhas(critico, "[critico] ouvindo");
    // O assíncrono sobe ANTES dos pontos: assim eles chegam a ele pela outbox
    // (caminho ao vivo), e não pelo replay do boot.
    assincrono = subir(BIN_ASSINCRONO, b.url);
    await linhas(assincrono, "[assincrono] replay {");

    // Atos humanos: a unidade, o entregador e os aparelhos autorizados.
    await b.cliente.query(`INSERT INTO identity.unit(unit_id, display_name) VALUES ($1, 'Relogio'), ($2, 'Relogio historico')`, [UNIDADE, UNIDADE_HISTORICO]);
    await b.cliente.query(`INSERT INTO identity.actor(actor_id, unit_id, role, label) VALUES ('a-rel', $1, 'motoboy_interno', 'Relogio')`, [UNIDADE]);
    for (const d of ["dev-A", "dev-C", "dev-F", "dev-G", "dev-P"]) {
      await b.cliente.query(`INSERT INTO identity.device(device_id, unit_id, actor_id, label) VALUES ($1, $2, 'a-rel', 'relogio')`, [d, UNIDADE]);
    }

    const t0 = Date.now();
    const enviados = new Map<string, string>();
    const enviar = async (device: string, seq: number, deslocamentoS: number, extra: Record<string, unknown> = {}) => {
      const token = emitirToken({ device_id: device, unit_id: UNIDADE, issued_by: "relogio", agora: new Date(), segredo: SEGREDO }).token;
      const trip = `t-${device}`;
      const occurred_at = new Date(t0 + deslocamentoS * 1000).toISOString();
      enviados.set(`${device}:${seq}`, occurred_at);
      const ponto = {
        point_id: `p-${device}-${seq}`, idempotency_key: `gps:${device}:${trip}:${seq}`, trip_id: trip, device_id: device,
        latitude: -23.5 - seq / 1000, longitude: -46.6 - seq / 1000, accuracy_m: 10, occurred_at,
        sequence_local: seq, provider: "fused", is_mock: false, ...extra,
      };
      const r = await fetch(`http://127.0.0.1:${critico.porta}/api/gps/batch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: device, correlation_id: `rel-${device}-${seq}`, points: [ponto] }),
      });
      return { status: r.status, corpo: (await r.json().catch(() => ({}))) as { classe?: string; gravados?: number; recusados?: unknown[] } };
    };

    // A: relógio certo. C: relógio certo, ponto capturado offline há 1 h.
    // F: só um ponto, +24 h. G: +24 h e DEPOIS um ponto certo. P: +24 h e o
    // aparelho tentando declarar o próprio relógio e a hora do servidor.
    const respostas = [
      await enviar("dev-A", 1, -30), await enviar("dev-A", 2, -5),
      await enviar("dev-C", 1, -3600, { captured_offline: true }),
      await enviar("dev-F", 1, DIA_S),
      await enviar("dev-G", 1, DIA_S), await enviar("dev-G", 2, -5),
      await enviar("dev-P", 1, DIA_S, { clock_trust: "trusted", received_at: "2030-01-01T00:00:00.000Z", recorded_at: "2030-01-01T00:00:00.000Z" }),
    ];

    console.log("\nR. BINARIOS REAIS, POSTGRESQL REAL");

    await teste("R1 todo ponto é ACEITO — o temporalmente suspeito não é descartado", () => {
      assert.deepEqual(respostas.map((r) => [r.status, r.corpo.classe]), respostas.map(() => [200, "aceito"]));
    });

    const doLog = async () =>
      await b.cliente.query(
        `SELECT device_id, sequence_local, occurred_at, recorded_at, clock_trust,
                (payload->>'latitude')::float AS lat, (payload->>'longitude')::float AS lon
           FROM platform.event_log WHERE unit_id = $1 ORDER BY device_id, sequence_local`,
        [UNIDADE],
      );
    const log = await doLog();
    const linha = (d: string, s: number) => log.find((l) => l.device_id === d && Number(l.sequence_local) === s);

    await teste("R2 o event log guarda o JULGAMENTO: +24 h é suspect; relógio certo e ponto offline antigo são trusted", () => {
      assert.equal(log.length, 7, "faltam fatos no log");
      assert.equal(linha("dev-F", 1)?.clock_trust, "suspect");
      assert.equal(linha("dev-G", 1)?.clock_trust, "suspect");
      for (const [d, s] of [["dev-A", 1], ["dev-A", 2], ["dev-C", 1], ["dev-G", 2]] as const) {
        assert.equal(linha(d, s)?.clock_trust, "trusted", `${d}:${s} foi julgado errado`);
      }
    });

    await teste("R3 a evidência fica intacta: occurred_at EXATO como enviado, coordenada, e a hora do servidor", () => {
      for (const l of log) {
        const chave = `${l.device_id}:${Number(l.sequence_local)}`;
        assert.equal((l.occurred_at as Date).toISOString(), enviados.get(chave), `${chave}: occurred_at reescrito`);
        assert.equal(l.lat, -23.5 - Number(l.sequence_local) / 1000, `${chave}: coordenada perdida`);
      }
      const f = linha("dev-F", 1)!;
      const atraso = Date.now() - (f.recorded_at as Date).getTime();
      assert.ok(atraso >= 0 && atraso < 120_000, `recorded_at não é a hora do servidor: ${(f.recorded_at as Date).toISOString()}`);
    });

    await teste("R4 o aparelho NÃO declara o próprio relógio nem a hora do servidor", () => {
      const p = linha("dev-P", 1)!;
      assert.equal(p.clock_trust, "suspect", "o aparelho se declarou confiável e passou");
      assert.ok((p.recorded_at as Date).getUTCFullYear() < 2030, "a hora do servidor veio do aparelho");
    });

    // A projeção pela MESMA porta do replay.
    const projecaoEm = async (agora: Date) => {
      const leitura = await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA);
      return projetar(leitura.aptos, { agora, unit_id: UNIDADE, source_mode: MODO });
    };
    const viagem = (vs: readonly ViagemProjetada[], d: string) => vs.find((v) => v.trip_id === `t-${d}`);
    const amanha = new Date(t0 + (DIA_S + 10) * 1000);

    await teste("R5 frescor: o ponto de amanhã NÃO fica fresco amanhã; relógio ruim continua sendo GPS", async () => {
      const agora = await projecaoEm(new Date());
      const f = viagem(agora.viagens, "dev-F")!;
      // A base do frescor de F é a hora em que o servidor recebeu — nunca o +24 h.
      assert.equal(f.ultima_posicao_em, (linha("dev-F", 1)!.recorded_at as Date).toISOString());
      assert.equal(f.frescor, "fresh", "GPS recebido agora virou sem GPS");
      // A: relógio certo — o occurred_at exato decide.
      const a = viagem(agora.viagens, "dev-A")!;
      assert.equal(a.ultima_posicao_em, enviados.get("dev-A:2"));
      assert.equal(viagem(agora.viagens, "dev-C")!.frescor, "stale");
      // Daqui a 24 h, sem nenhum ponto novo: NADA fresco.
      const depois = await projecaoEm(amanha);
      assert.deepEqual(depois.viagens.filter((v) => v.frescor !== "stale").map((v) => `${v.trip_id}=${v.frescor}`), []);
    });

    await teste("R6 ao vivo (outbox) e replay (event log) chegam ao MESMO frescor, e o replay não volta a confiar", async () => {
      // Ao vivo: o que o assíncrono projetou consumindo a outbox.
      const fim = Date.now() + 20000;
      let vivo: Escopo | undefined;
      while (Date.now() < fim) {
        const l = assincrono!.saida().split("\n").filter((x) => x.startsWith("[assincrono] operacao-viva")).pop();
        vivo = l ? json<{ escopos: Escopo[] }>(l).escopos.find((e) => e.unit_id === UNIDADE) : undefined;
        if (vivo?.fatos === 7) break;
        await esperar(200);
      }
      assert.equal(vivo?.fatos, 7, "o assíncrono não consumiu os 7 fatos pela outbox");
      await assincrono!.fim();
      // Replay: um processo novo reconstrói do event log.
      assincrono = subir(BIN_ASSINCRONO, b.url);
      const [l] = await linhas(assincrono, "[assincrono] replay {");
      const replay = json<{ estado: string; escopos: Escopo[] }>(l!);
      assert.equal(replay.estado, "completo");
      const rep = replay.escopos.find((e) => e.unit_id === UNIDADE);
      const esperado = { fresh: 4, aging: 0, stale: 1, unknown: 0 };
      assert.deepEqual(vivo!.frescor, esperado, "ao vivo");
      assert.deepEqual(rep?.frescor, esperado, "replay");
      // Replay em processo: o suspect continua sem autoridade depois do reinício.
      const g = viagem((await projecaoEm(amanha)).viagens, "dev-G")!;
      assert.equal(g.frescor, "stale", "o replay voltou a confiar no relógio de G");
    });

    const vmEm = async (agora: Date) => {
      const realidade = await lerRealidadeDeEntregas(b.cliente, { agora, unit_id: UNIDADE });
      const f = await montarEntregasDemo();
      return { realidade, vm: entregasVM(await f.snapshot(), agora.toISOString(), f.getPolicyMaxStops(), { disponivel: true, realidade }) };
    };

    await teste("R7 Entregas: último lote pelo relógio do servidor, GPS pelo instante confiável, e o selo que diz por quê", async () => {
      const { realidade, vm } = await vmEm(new Date());
      const ap = (d: string) => realidade.aparelhos.find((a) => a.device_id === d)!;
      // G mandou +24 h e DEPOIS um ponto certo: o último lote é o que chegou por último.
      assert.equal(ap("dev-G").ultimo_lote?.occurred_at, enviados.get("dev-G:2"));
      assert.equal(ap("dev-G").ultimo_lote?.relogio, "trusted");
      // F: o que o aparelho disse fica como evidência, sem autoridade.
      assert.equal(ap("dev-F").ultimo_lote?.occurred_at, enviados.get("dev-F:1"));
      assert.equal(ap("dev-F").ultimo_lote?.relogio, "suspect");
      const vF = vm.realidade.aparelhos.find((a) => a.device_id === "dev-F")!;
      assert.ok(vF.gps.observado && vF.gps.valor === "fresh", "GPS de F não ficou fresco pela hora do servidor");
      assert.ok(vF.selos.some((s) => s.estado === "evidencia_insuficiente" && /a frente do servidor/.test(s.detalhe ?? "")), "falta o selo do relógio em F");
      const vA = vm.realidade.aparelhos.find((a) => a.device_id === "dev-A")!;
      assert.ok(!vA.selos.some((s) => /Relogio do aparelho/.test(s.detalhe ?? "")), "relógio certo ganhou selo de relógio");
      // Amanhã, sem ponto novo: nenhum aparelho com GPS fresco.
      const depois = await vmEm(amanha);
      const frescos = depois.vm.realidade.aparelhos.filter((a) => a.gps.observado && a.gps.valor === "fresh").map((a) => a.device_id);
      assert.deepEqual(frescos, [], "GPS fresco fabricado amanhã");
    });

    await teste("R8 histórico carimbado pelo PADRÃO trusted não fabrica frescor", async () => {
      // Um fato como os de antes desta correção: sem `clock_trust` no INSERT, a
      // coluna põe o padrão da 0001. O banco ainda aceita — limite declarado —,
      // mas o consumidor confere contra `recorded_at`.
      const futuro = new Date(Date.now() + DIA_S * 1000).toISOString();
      await b.cliente.query(
        `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload, occurred_at,
            origin, device_id, idempotency_key, contract_version, source_mode)
         VALUES ('ev-rel-hist', $1, 'trip', 't-hist', 'gps_batch_received', '{"latitude":-23.5,"longitude":-46.6,"accuracy_m":10}',
            $2, 'device', 'dev-hist', 'gps:dev-hist:t-hist:1', 'gps_batch_received@1.0.0', $3)`,
        [UNIDADE_HISTORICO, futuro, MODO],
      );
      const [h] = await b.cliente.query(`SELECT clock_trust, recorded_at FROM platform.event_log WHERE event_id = 'ev-rel-hist'`);
      assert.equal(h!.clock_trust, "trusted", "o padrão da coluna mudou — este teste precisa ser revisto");
      const leitura = await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA);
      const p = projetar(leitura.aptos, { agora: new Date(Date.parse(futuro) + 10_000), unit_id: UNIDADE_HISTORICO, source_mode: MODO });
      const v = p.viagens.find((x) => x.trip_id === "t-hist")!;
      assert.equal(v.ultima_posicao_em, (h!.recorded_at as Date).toISOString(), "o carimbo padrão voltou a dar autoridade ao relógio");
      assert.equal(v.frescor, "stale");
    });

    await teste("R9 todo fato que passa pela ingestão leva os DOIS carimbos do servidor — na outbox e no replay", async () => {
      // É isto que confina o caminho "fora da ingestão" (U3) a fixture e
      // demonstração: nenhum fato de aparelho chega ao consumidor sem eles.
      const mensagens = (await b.cliente.query(`SELECT payload FROM platform.outbox`))
        .map((m) => m.payload as Record<string, unknown>)
        .filter((p) => p.unit_id === UNIDADE);
      assert.equal(mensagens.length, 7, "faltam mensagens na outbox");
      for (const p of mensagens) {
        assert.ok(typeof p.received_at === "string" && Number.isFinite(Date.parse(p.received_at)), `mensagem sem a hora do servidor: ${String(p.event_id)}`);
        assert.ok((CONFIANCAS_DO_RELOGIO as readonly unknown[]).includes(p.clock_trust), `mensagem sem o julgamento do relógio: ${String(p.event_id)}`);
      }
      const leitura = await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA);
      const doReplay = leitura.aptos.filter((e) => e.unit_id === UNIDADE);
      assert.equal(doReplay.length, 7, "faltam fatos no replay");
      for (const e of doReplay) {
        assert.ok(e.received_at && Number.isFinite(Date.parse(e.received_at)), `replay sem a hora do servidor: ${e.event_id}`);
        assert.ok(e.clock_trust && (CONFIANCAS_DO_RELOGIO as readonly unknown[]).includes(e.clock_trust), `replay sem o julgamento: ${e.event_id}`);
      }
    });
  } finally {
    if (assincrono) await assincrono.fim();
    await critico.fim();
    await b.descartar();
  }

  console.log(`\n${passaram}/${passaram + falhas.length} provas do relógio`);
  for (const f of falhas) console.log(`  XX ${f}`);
  if (falhas.length) {
    console.log("\nRELOGIO_RED");
    process.exit(1);
  }
  console.log("\nRELOGIO_GREEN");
}

void main().catch((e) => {
  console.error("[relogio] falhou:", e);
  process.exit(1);
});
