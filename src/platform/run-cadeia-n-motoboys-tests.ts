/**
 * Cadeia com N motoboys AO MESMO TEMPO (N = 3 e N = 5, os tamanhos do piloto),
 * com o crítico e o assíncrono REAIS de `dist/` e um PostgreSQL isolado por N.
 *
 * Mede, não extrapola: cada N roda numa base própria, com N aparelhos lógicos
 * (identidade, segredo, pré-vínculo e sessão próprios, como o app), e em cada
 * rodada TODOS enviam juntos. Prova que cada fato fica com o seu aparelho, o
 * seu motoboy e a sua viagem; que nenhuma chave se repete; que a leitura
 * canônica da viagem (a que o despacho e a Home leem) só tem os pontos do dono;
 * e que o assíncrono reconstrói exatamente N viagens e drena a outbox. Imprime
 * a latência medida das rodadas — número desta máquina, não da rua.
 *
 * O que NÃO prova: celular físico, rede móvel, o piloto e a tela no aparelho.
 * Sem `DELIVERYOS_PG_URL` a suíte se declara PULADA em voz alta.
 */
import { strict as assert } from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ambienteDeConcessaoDeTeste, concessaoDaBancada, registrarVinculoDeTeste, registrarViagemDeTeste } from "./concessao-de-teste";
import { bancoIsolado, type BancoIsolado } from "./banco-isolado";
import { AparelhoLogico, DeviceSession, KEY_DEVICE_SECRET } from "./aparelho-logico";
import { hashDoSegredo } from "./auth/device-session";
import { lerLocalizacaoCanonicaDaViagem } from "./leitura/localizacao-de-viagem";

const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const raiz = process.cwd();
const BIN_CRITICO = join(raiz, "dist/src/platform/bin/critical.js");
const BIN_ASSINCRONO = join(raiz, "dist/src/platform/bin/async-runtime.js");
/** Fixture declarada. Nunca um segredo real. */
const SEGREDO = "fixture-n-motoboys-".padEnd(48, "x");
const MODO = "simulated" as const;
const RODADAS = 5;
const PONTOS_POR_RODADA = 4;

let passaram = 0;
const falhas: string[] = [];
const medidas: string[] = [];
async function teste(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passaram += 1; console.log(`  ok  ${nome}`); }
  catch (e) { falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`); console.log(`  XX  ${nome}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`); }
}

interface Processo { filho: ChildProcess; porta: number; saida(): string; fim(): Promise<number | null> }
function subir(bin: string, url: string, extra: NodeJS.ProcessEnv, ipc = false): Processo {
  const porta = 9600 + Math.floor(Math.random() * 300);
  const filho = spawn(process.execPath, [bin], {
    cwd: raiz,
    env: { ...process.env, DELIVERYOS_ENV: "local", DELIVERYOS_DATABASE_URL: url, DELIVERYOS_MIGRATE_ON_BOOT: "false",
      DELIVERYOS_DEVICE_TOKEN_SECRET: SEGREDO, DELIVERYOS_PORT: String(porta), DELIVERYOS_TICK_MS: "200", ...extra },
    stdio: ipc ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"],
  });
  let buf = "";
  filho.stdout?.on("data", (d: Buffer) => (buf += d.toString()));
  filho.stderr?.on("data", (d: Buffer) => (buf += d.toString()));
  const saiu = new Promise<number | null>((r) => filho.once("exit", (c) => r(c)));
  return {
    filho, porta, saida: () => buf,
    fim() {
      if (filho.exitCode === null && filho.signalCode === null) {
        let pediu = false;
        if (ipc && filho.connected) { try { filho.send({ type: "deliveryos:shutdown" }); pediu = true; } catch { pediu = false; } }
        if (!pediu) filho.kill("SIGTERM");
        setTimeout(() => { if (filho.exitCode === null && filho.signalCode === null) filho.kill("SIGKILL"); }, 8000).unref();
      }
      return saiu;
    },
  };
}
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function ate(cond: () => boolean | Promise<boolean>, limiteMs = 20000): Promise<boolean> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) { if (await cond()) return true; await esperar(100); }
  return false;
}
const em = (minuto: number, segundo = 0) => `2026-11-13T13:${String(minuto).padStart(2, "0")}:${String(segundo).padStart(2, "0")}.000Z`;

async function autorizar(b: BancoIsolado, ap: AparelhoLogico, unit_id: string, actor_id: string): Promise<void> {
  await b.cliente.query(`INSERT INTO identity.unit(unit_id, display_name) VALUES ($1, 'N') ON CONFLICT DO NOTHING`, [unit_id]);
  await b.cliente.query(`INSERT INTO identity.actor(actor_id, unit_id, role, label) VALUES ($1, $2, 'motoboy_interno', 'N') ON CONFLICT DO NOTHING`, [actor_id, unit_id]);
  await b.cliente.query(
    `INSERT INTO identity.device(device_id, unit_id, actor_id, label, secret_hash, secret_bound_at) VALUES ($1, $2, $3, 'aparelho n', $4, now())`,
    [ap.deviceId, unit_id, actor_id, hashDoSegredo(ap.db.get(KEY_DEVICE_SECRET)!)],
  );
  registrarVinculoDeTeste(ap.deviceId, unit_id, actor_id);
}

async function rodar(N: number): Promise<void> {
  console.log(`\n=== ${N} MOTOBOYS AO MESMO TEMPO ===`);
  const b = await bancoIsolado(URL_PG, undefined, `n${N}`);
  const dirs = Array.from({ length: N }, (_, i) => mkdtempSync(join(tmpdir(), `n-motoboys-${N}-${i}-`)));
  const sufixo = Math.random().toString(36).slice(2, 6);
  const UNIDADE = `N${N}${sufixo.toUpperCase()}`;
  const motoboys = Array.from({ length: N }, (_, i) => `m${i}-${sufixo}`);
  const viagens = Array.from({ length: N }, (_, i) => `t${i}-${sufixo}`);
  viagens.forEach((v, i) => registrarViagemDeTeste(v, UNIDADE, motoboys[i]));
  let critico: Processo | null = null, assincrono: Processo | null = null;
  try {
    critico = subir(BIN_CRITICO, b.url, { DELIVERYOS_SOURCE_MODE: MODO, DELIVERYOS_PILOT_TRIP_GRANT_SECRETS: ambienteDeConcessaoDeTeste(UNIDADE) });
    const c = critico;
    assert.ok(await ate(() => /\[critico\] ouvindo/.test(c.saida())), `o crítico não subiu:\n${c.saida()}`);
    const url = `http://127.0.0.1:${c.porta}`;
    const aps = dirs.map((d) => new AparelhoLogico({ concessao: concessaoDaBancada, diretorio: d, plataformaUrl: url }));
    const lat0 = (i: number) => -23.55 - i * 0.01;

    await teste(`N${N}-1 ${N} aparelhos com identidade e segredo próprios, pré-vinculados, entram juntos`, async () => {
      assert.equal(new Set(aps.map((a) => a.deviceId)).size, N);
      assert.equal(new Set(aps.map((a) => a.db.get(KEY_DEVICE_SECRET))).size, N);
      for (let i = 0; i < N; i++) await autorizar(b, aps[i], UNIDADE, motoboys[i]);
      aps.forEach((a, i) => a.capturar(viagens[i], lat0(i), -46.63, em(0, i)));
      const r = await Promise.all(aps.map((a) => a.sincronizar()));
      assert.deepEqual(r, Array(N).fill("success"));
      assert.equal(new Set(aps.map((a) => DeviceSession.sessaoAtual(a.db)!.token)).size, N, "dois aparelhos com o mesmo token");
    });

    const latencias: number[] = [];
    await teste(`N${N}-2 ${RODADAS} rodadas com os ${N} enviando AO MESMO TEMPO (${PONTOS_POR_RODADA} pontos cada): todos aceitos`, async () => {
      for (let rodada = 1; rodada <= RODADAS; rodada++) {
        for (let k = 0; k < PONTOS_POR_RODADA; k++) aps.forEach((a, i) => a.capturar(viagens[i], lat0(i) - rodada * 0.001 - k * 0.0001, -46.63, em(rodada, k * 10 + i)));
        const t0 = performance.now();
        const r = await Promise.all(aps.map((a) => a.sincronizar()));
        latencias.push(performance.now() - t0);
        assert.deepEqual(r, Array(N).fill("success"), `rodada ${rodada}`);
        for (const a of aps) assert.equal(a.db.pendingCount(), 0, "ponto ficou pendente");
      }
    });

    await teste(`N${N}-3 cada fato fica com o seu aparelho, motoboy e viagem; nenhuma chave repetida`, async () => {
      const linhas = await b.cliente.query(
        `SELECT device_id, actor_id, object_id, idempotency_key FROM platform.event_log WHERE event_type = 'gps_batch_received' AND unit_id = $1`, [UNIDADE]);
      const esperado = N * (1 + RODADAS * PONTOS_POR_RODADA);
      assert.equal(linhas.length, esperado, `fatos: ${linhas.length}, esperado ${esperado}`);
      assert.equal(new Set(linhas.map((l) => String(l.idempotency_key))).size, esperado, "chave de idempotência repetida");
      for (let i = 0; i < N; i++) {
        const meus = linhas.filter((l) => String(l.device_id) === aps[i].deviceId);
        assert.equal(meus.length, 1 + RODADAS * PONTOS_POR_RODADA, `aparelho ${i}`);
        assert.ok(meus.every((l) => String(l.actor_id) === motoboys[i] && String(l.object_id) === viagens[i]), `fato do aparelho ${i} com motoboy ou viagem de outro`);
      }
    });

    await teste(`N${N}-4 a leitura canônica de cada viagem tem só os pontos do dono e a última posição dele`, async () => {
      for (let i = 0; i < N; i++) {
        const loc = await lerLocalizacaoCanonicaDaViagem(b.cliente, { unit_id: UNIDADE, trip_id: viagens[i], source_mode: MODO });
        assert.equal(loc.point_count, 1 + RODADAS * PONTOS_POR_RODADA);
        assert.ok(loc.points.every((p) => p.device_id === aps[i].deviceId && p.actor_id === motoboys[i]), `ponto de outro na viagem ${i}`);
        const ultima = lat0(i) - RODADAS * 0.001 - (PONTOS_POR_RODADA - 1) * 0.0001;
        assert.ok(Math.abs((loc.last_point?.latitude ?? 0) - ultima) < 1e-9, `última posição da viagem ${i} não é a do dono`);
      }
    });

    await teste(`N${N}-5 o assíncrono reconstrói exatamente ${N} viagens do log e drena a outbox`, async () => {
      const ipc = process.platform === "win32";
      assincrono = subir(BIN_ASSINCRONO, b.url, ipc ? { DELIVERYOS_TEST_IPC_SHUTDOWN: "true" } : {}, ipc);
      const a = assincrono;
      const MARCA = "[assincrono] replay ";
      assert.ok(await ate(() => a.saida().includes(`${MARCA}{`)), `o assíncrono não reconstruiu:\n${a.saida()}`);
      const linha = a.saida().split("\n").filter((l) => l.startsWith(`${MARCA}{`)).pop()!;
      const replay = JSON.parse(linha.slice(MARCA.length)) as { estado: string; escopos: { unit_id: string; source_mode: string; viagens: number }[] };
      assert.equal(replay.estado, "completo");
      const escopo = replay.escopos.find((e) => e.unit_id === UNIDADE && e.source_mode === MODO);
      assert.equal(escopo?.viagens, N);
      assert.ok(await ate(async () => Number((await b.cliente.query(`SELECT count(*)::int AS n FROM platform.outbox WHERE processed_at IS NULL`))[0].n) === 0), "outbox não drenada");
    });

    if (latencias.length) {
      const ord = [...latencias].sort((x, y) => x - y);
      medidas.push(`N=${N}: ${RODADAS} rodadas simultaneas de ${N}x${PONTOS_POR_RODADA} pontos; rodada mais lenta ${ord[ord.length - 1].toFixed(0)} ms, mediana ${ord[Math.floor(ord.length / 2)].toFixed(0)} ms (esta maquina, loopback)`);
    }
  } finally {
    if (assincrono) await (assincrono as Processo).fim();
    if (critico) await (critico as Processo).fim();
    await b.descartar();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  if (!URL_PG) {
    console.log("PULADO: DELIVERYOS_PG_URL não definida — a cadeia com N motoboys NÃO foi exercitada.");
    console.log("\n0/0 provas — CADEIA_N_MOTOBOYS_PULADA");
    return;
  }
  for (const N of [3, 5]) await rodar(N);
  console.log(`\n${passaram}/${passaram + falhas.length} provas da cadeia com N motoboys`);
  for (const m of medidas) console.log("  medido: " + m);
  if (falhas.length) { for (const f of falhas) console.log("  - " + f); process.exit(1); }
  console.log("CADEIA_N_MOTOBOYS_GREEN 3_E_5_LOGICOS_NAO_FISICOS");
}
void main().catch((e) => { console.error("falha inesperada:", e); process.exit(1); });
