/**
 * CADEIA COM VÁRIOS APARELHOS AO MESMO TEMPO.
 *
 * `run-cadeia-real-tests.ts` prova a cadeia de UM aparelho de ponta a ponta, e
 * prova que A não fala COMO B (E2: token de A com `device_id` de B é recusado).
 * O que ela não exercita é a operação de verdade: dois motoboys, dois
 * aparelhos, duas viagens, tudo junto — lotes intercalados, um deles sem rede
 * e voltando com reenvio, um terceiro aparelho que ninguém autorizou tentando
 * entrar no meio.
 *
 * Aqui, contra o binário crítico e o assíncrono de `dist/` e PostgreSQL real:
 *
 *  - cada aparelho tem identidade, segredo, pré-vínculo, motoboy e sessão
 *    próprios;
 *  - nenhum fato de A aparece na viagem de B, nem no log, nem na leitura
 *    canônica da viagem, nem na projeção da Operação Viva;
 *  - a queda de rede de um não atrasa nem contamina o outro, e o reenvio não
 *    duplica;
 *  - revogar um não toca no outro.
 *
 * E uma LACUNA medida, declarada como tal (X1): a ingestão confere que o ponto
 * é do aparelho autenticado, mas não que a VIAGEM é dele. Enquanto a lacuna
 * estiver aberta, a suíte passa dizendo que ela está aberta; no dia em que
 * fechar, a suíte reprova pedindo que X1 vire prova comum.
 *
 * Sem `DELIVERYOS_PG_URL` a suíte se declara PULADA em voz alta.
 */

import { strict as assert } from "node:assert";
import { ambienteDeConcessaoDeTeste, concessaoDaBancada, registrarVinculoDeTeste, registrarViagemDeTeste } from "./concessao-de-teste";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bancoIsolado as bancoIsoladoDe, type BancoIsolado } from "./banco-isolado";
import { AparelhoLogico, DeviceSession, KEY_DEVICE_SECRET } from "./aparelho-logico";
import { hashDoSegredo } from "./auth/device-session";
import { verificarToken } from "./auth/device-token";
import { lerFatosParaReplay } from "./projections/replay-do-event-log";
import { projetar } from "./projections/operacao-viva";
import { TIPOS_DA_OPERACAO_VIVA } from "./runtime/handler-operacao-viva";
import { lerLocalizacaoCanonicaDaViagem } from "./leitura/localizacao-de-viagem";

const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const raiz = process.cwd();
const BIN_CRITICO = join(raiz, "dist/src/platform/bin/critical.js");
const BIN_ASSINCRONO = join(raiz, "dist/src/platform/bin/async-runtime.js");
/** Fixture declarada. Nunca um segredo real. */
const SEGREDO = "fixture-multiaparelho-".padEnd(48, "x");
const MODO = "simulated" as const;
const PORTA_MORTA = "http://127.0.0.1:9";

console.log("\n=== CADEIA — VÁRIOS APARELHOS, VÁRIOS MOTOBOYS, AO MESMO TEMPO ===\n");

let passaram = 0;
const falhas: string[] = [];
const lacunasAbertas: string[] = [];

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

/**
 * Uma propriedade que o produto DEVERIA ter e hoje não tem. `fn` afirma a
 * propriedade desejada: se ela falha, a lacuna segue aberta e é dita; se ela
 * passa, a suíte reprova — alguém fechou a lacuna e ela tem de virar `teste`.
 */
async function lacuna(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    lacunasAbertas.push(nome);
    console.log(`  !!  LACUNA ABERTA ${nome}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    return;
  }
  falhas.push(`${nome}: a lacuna FECHOU — promova para prova comum e apague a marca`);
  console.log(`  XX  ${nome}: a lacuna fechou; promova para prova comum`);
}

/* ------------------------------------------------------------------ *
 * Processos reais
 * ------------------------------------------------------------------ */

interface Processo {
  filho: ChildProcess;
  porta: number;
  saida(): string;
  fim(): Promise<number | null>;
}

function subir(bin: string, url: string, extra: NodeJS.ProcessEnv, ipcShutdown = false): Processo {
  const porta = 9300 + Math.floor(Math.random() * 300);
  const filho = spawn(process.execPath, [bin], {
    cwd: raiz,
    env: {
      ...process.env,
      DELIVERYOS_ENV: "local",
      DELIVERYOS_DATABASE_URL: url,
      DELIVERYOS_MIGRATE_ON_BOOT: "false",
      DELIVERYOS_DEVICE_TOKEN_SECRET: SEGREDO,
      DELIVERYOS_PORT: String(porta),
      DELIVERYOS_TICK_MS: "200",
      ...extra,
    },
    stdio: ipcShutdown ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"],
  });
  let buffer = "";
  filho.stdout?.on("data", (d: Buffer) => (buffer += d.toString()));
  filho.stderr?.on("data", (d: Buffer) => (buffer += d.toString()));
  const saiu = new Promise<number | null>((r) => filho.once("exit", (c) => r(c)));
  return {
    filho,
    porta,
    saida: () => buffer,
    fim() {
      if (filho.exitCode === null && filho.signalCode === null) {
        let pediu = false;
        if (ipcShutdown && filho.connected && typeof filho.send === "function") {
          try { filho.send({ type: "deliveryos:shutdown" }); pediu = true; } catch { pediu = false; }
        }
        if (!pediu) filho.kill("SIGTERM");
        setTimeout(() => {
          if (filho.exitCode === null && filho.signalCode === null) filho.kill("SIGKILL");
        }, 8000).unref();
      }
      return saiu;
    },
  };
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function ate(cond: () => boolean | Promise<boolean>, limiteMs = 20000): Promise<boolean> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (await cond()) return true;
    await esperar(100);
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Atos humanos e leituras do banco
 * ------------------------------------------------------------------ */

/** O gerente autoriza: aparelho, unidade, motoboy e a prova exibida pelo aparelho. */
async function autorizar(b: BancoIsolado, ap: AparelhoLogico, unit_id: string, actor_id: string): Promise<void> {
  await b.cliente.query(`INSERT INTO identity.unit(unit_id, display_name) VALUES ($1, 'Multi') ON CONFLICT DO NOTHING`, [unit_id]);
  await b.cliente.query(
    `INSERT INTO identity.actor(actor_id, unit_id, role, label) VALUES ($1, $2, 'motoboy_interno', 'Multi') ON CONFLICT DO NOTHING`,
    [actor_id, unit_id],
  );
  await b.cliente.query(
    `INSERT INTO identity.device(device_id, unit_id, actor_id, label, secret_hash, secret_bound_at)
     VALUES ($1, $2, $3, 'aparelho multi', $4, now())`,
    [ap.deviceId, unit_id, actor_id, hashDoSegredo(ap.db.get(KEY_DEVICE_SECRET)!)],
  );
  registrarVinculoDeTeste(ap.deviceId, unit_id, actor_id);
}

interface Fato {
  device_id: string;
  actor_id: string | null;
  unit_id: string;
  object_id: string;
  idempotency_key: string;
  source_mode: string;
  sequence_local: number;
  occurred_at: string;
  offline: boolean;
}

async function fatos(b: BancoIsolado, where: string, valor: string): Promise<Fato[]> {
  const linhas = await b.cliente.query(
    `SELECT device_id, actor_id, unit_id, object_id, idempotency_key, source_mode,
            sequence_local::int AS sequence_local, occurred_at,
            coalesce((payload->>'captured_offline')::boolean, false) AS offline
       FROM platform.event_log
      WHERE event_type = 'gps_batch_received' AND ${where} = $1
      ORDER BY device_id, sequence_local`,
    [valor],
  );
  return linhas.map((l) => ({
    device_id: String(l.device_id),
    actor_id: l.actor_id === null ? null : String(l.actor_id),
    unit_id: String(l.unit_id),
    object_id: String(l.object_id),
    idempotency_key: String(l.idempotency_key),
    source_mode: String(l.source_mode),
    sequence_local: Number(l.sequence_local),
    occurred_at: new Date(String(l.occurred_at)).toISOString(),
    offline: l.offline === true,
  }));
}
const fatosDoAparelho = (b: BancoIsolado, id: string) => fatos(b, "device_id", id);
const fatosDaViagem = (b: BancoIsolado, id: string) => fatos(b, "object_id", id);

async function contar(b: BancoIsolado, tabela: "platform.event_log" | "platform.outbox"): Promise<number> {
  return Number((await b.cliente.query(`SELECT count(*)::int AS n FROM ${tabela}`))[0].n);
}

/** Instante fixo no passado: ponto atrasado é ponto offline, nunca relógio suspeito. */
const em = (minuto: number, segundo = 0) =>
  `2026-11-13T12:${String(minuto).padStart(2, "0")}:${String(segundo).padStart(2, "0")}.000Z`;

/* ------------------------------------------------------------------ *
 * A suíte
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  if (!URL_PG) {
    console.log("PULADO: DELIVERYOS_PG_URL não definida — a cadeia multiaparelho NÃO foi exercitada.");
    console.log("\n0/0 provas — CADEIA_MULTIAPARELHO_PULADA");
    return;
  }

  const b = await bancoIsoladoDe(URL_PG, undefined, "multi");
  const dirs = ["a", "b", "c"].map((x) => mkdtempSync(join(tmpdir(), `multi-aparelho-${x}-`)));
  let critico: Processo | null = null;
  let assincrono: Processo | null = null;
  const sufixo = Math.random().toString(36).slice(2, 6);
  const UNIDADE = `MUL${sufixo.toUpperCase()}`;
  const MOTOBOY_A = `m-a-${sufixo}`;
  const MOTOBOY_B = `m-b-${sufixo}`;
  const VIAGEM_A = `t-a-${sufixo}`;
  const VIAGEM_B = `t-b-${sufixo}`;
  const VIAGEM_C = `t-c-${sufixo}`;
  // A atribuição que o piloto faria. C nunca é autorizado, então nunca recebe concessão.
  registrarViagemDeTeste(VIAGEM_A, UNIDADE, MOTOBOY_A);
  registrarViagemDeTeste(VIAGEM_B, UNIDADE, MOTOBOY_B);

  try {
    critico = subir(BIN_CRITICO, b.url, { DELIVERYOS_SOURCE_MODE: MODO, DELIVERYOS_PILOT_TRIP_GRANT_SECRETS: ambienteDeConcessaoDeTeste(UNIDADE) });
    const c = critico;
    assert.ok(await ate(() => /\[critico\] ouvindo/.test(c.saida())), `o crítico não subiu:\n${c.saida()}`);
    const url = `http://127.0.0.1:${c.porta}`;

    const apA = new AparelhoLogico({ concessao: concessaoDaBancada, diretorio: dirs[0], plataformaUrl: url });
    const apB = new AparelhoLogico({ concessao: concessaoDaBancada, diretorio: dirs[1], plataformaUrl: url });
    /** O terceiro aparelho existe, captura e tenta — e ninguém o autorizou. */
    const apC = new AparelhoLogico({ concessao: concessaoDaBancada, diretorio: dirs[2], plataformaUrl: url });
    const segredo = (ap: AparelhoLogico) => ap.db.get(KEY_DEVICE_SECRET)!;
    const token = (ap: AparelhoLogico) => DeviceSession.sessaoAtual(ap.db)!.token;

    console.log("M. IDENTIDADE — um aparelho, um segredo, um motoboy");

    await teste("M1 três aparelhos nascem com identidade e segredo PRÓPRIOS: nada é compartilhado", () => {
      const ids = new Set([apA.deviceId, apB.deviceId, apC.deviceId]);
      const segredos = new Set([segredo(apA), segredo(apB), segredo(apC)]);
      const provas = new Set([...segredos].map(hashDoSegredo));
      assert.equal(ids.size, 3, "dois aparelhos com o mesmo device_id");
      assert.equal(segredos.size, 3, "dois aparelhos com o mesmo segredo");
      assert.equal(provas.size, 3, "duas provas de vínculo iguais");
    });

    await teste("M2 A e B pré-vinculados a motoboys DIFERENTES entram juntos; C, sem autorização, fica de fora com os pontos guardados", async () => {
      await autorizar(b, apA, UNIDADE, MOTOBOY_A);
      await autorizar(b, apB, UNIDADE, MOTOBOY_B);
      apA.capturar(VIAGEM_A, -23.5500, -46.6300, em(0, 0));
      apB.capturar(VIAGEM_B, -23.6000, -46.7000, em(0, 5));
      apC.capturar(VIAGEM_C, -23.7000, -46.8000, em(0, 7));
      const [ra, rb, rc] = await Promise.all([apA.sincronizar(), apB.sincronizar(), apC.sincronizar()]);
      assert.deepEqual([ra, rb, rc], ["success", "success", "retry"]);
      assert.notEqual(token(apA), token(apB), "dois aparelhos receberam o mesmo token");
      const ca = verificarToken(token(apA), SEGREDO, new Date());
      const cb = verificarToken(token(apB), SEGREDO, new Date());
      assert.ok(ca.ok && cb.ok, "token emitido pelo crítico não verifica");
      if (ca.ok && cb.ok) {
        assert.deepEqual([ca.claims.device_id, ca.claims.actor_id], [apA.deviceId, MOTOBOY_A]);
        assert.deepEqual([cb.claims.device_id, cb.claims.actor_id], [apB.deviceId, MOTOBOY_B]);
      }
      assert.equal(DeviceSession.sessaoAtual(apC.db), null, "aparelho não autorizado recebeu sessão");
      assert.equal(apC.db.pendingCount(), 1, "o ponto do aparelho não autorizado sumiu");
      assert.equal((await fatosDoAparelho(b, apC.deviceId)).length, 0, "aparelho não autorizado gravou fato");
    });

    console.log("\nS. SIMULTÂNEO — lotes intercalados, viagens distintas");

    await teste("S1 três rodadas com os dois enviando AO MESMO TEMPO: cada fato fica com o seu aparelho, motoboy e viagem", async () => {
      for (let rodada = 1; rodada <= 3; rodada++) {
        // Capturas intercaladas no tempo: A, B, A, B.
        apA.capturar(VIAGEM_A, -23.5500 - rodada * 0.001, -46.6300, em(rodada, 0));
        apB.capturar(VIAGEM_B, -23.6000 - rodada * 0.001, -46.7000, em(rodada, 10));
        apA.capturar(VIAGEM_A, -23.5500 - rodada * 0.001, -46.6310, em(rodada, 20));
        apB.capturar(VIAGEM_B, -23.6000 - rodada * 0.001, -46.7010, em(rodada, 30));
        apC.capturar(VIAGEM_C, -23.7000, -46.8000, em(rodada, 40));
        const r = await Promise.all([apA.sincronizar(), apB.sincronizar(), apC.sincronizar()]);
        assert.deepEqual(r, ["success", "success", "retry"], `rodada ${rodada}`);
      }
      const fa = await fatosDoAparelho(b, apA.deviceId);
      const fb = await fatosDoAparelho(b, apB.deviceId);
      assert.equal(fa.length, 7);
      assert.equal(fb.length, 7);
      assert.ok(fa.every((f) => f.object_id === VIAGEM_A && f.actor_id === MOTOBOY_A && f.unit_id === UNIDADE), "fato de A com viagem ou motoboy de outro");
      assert.ok(fb.every((f) => f.object_id === VIAGEM_B && f.actor_id === MOTOBOY_B && f.unit_id === UNIDADE), "fato de B com viagem ou motoboy de outro");
      // A sequência é de cada aparelho: sem buraco, sem repetição, sem misturar com a do outro.
      assert.deepEqual(fa.map((f) => f.sequence_local), [1, 2, 3, 4, 5, 6, 7]);
      assert.deepEqual(fb.map((f) => f.sequence_local), [1, 2, 3, 4, 5, 6, 7]);
      const chaves = [...fa, ...fb].map((f) => f.idempotency_key);
      assert.equal(new Set(chaves).size, 14, "duas chaves de idempotência iguais entre aparelhos");
      assert.ok([...fa, ...fb].every((f) => f.source_mode === MODO), "algum fato trocou de modo");
      assert.equal((await fatosDoAparelho(b, apC.deviceId)).length, 0, "o aparelho não autorizado entrou no meio");
      assert.equal(apC.db.pendingCount(), 4, "o aparelho não autorizado perdeu ponto");
      assert.equal(await contar(b, "platform.event_log") - await auditados(b), 14);
    });

    await teste("S2 a VIAGEM lida do log tem só os pontos do seu aparelho, e a última posição é a dele", async () => {
      for (const [viagem, ap, motoboy, lat] of [
        [VIAGEM_A, apA, MOTOBOY_A, -23.553],
        [VIAGEM_B, apB, MOTOBOY_B, -23.603],
      ] as const) {
        const loc = await lerLocalizacaoCanonicaDaViagem(b.cliente, { unit_id: UNIDADE, trip_id: viagem, source_mode: MODO });
        assert.equal(loc.point_count, 7);
        assert.ok(loc.points.every((p) => p.device_id === ap.deviceId), `ponto de outro aparelho na viagem ${viagem}`);
        assert.ok(loc.points.every((p) => p.actor_id === motoboy), `ponto de outro motoboy na viagem ${viagem}`);
        assert.ok(Math.abs((loc.last_point?.latitude ?? 0) - lat) < 1e-9, `última posição de ${viagem} não é a do seu aparelho`);
      }
    });

    await teste("S3 a Operação Viva projeta DUAS viagens, cada uma com o seu aparelho e a sua última posição", async () => {
      const leitura = await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA);
      const p = projetar(leitura.aptos, { agora: new Date(em(4)), unit_id: UNIDADE, source_mode: MODO });
      assert.deepEqual(p.viagens.map((v) => v.trip_id).sort(), [VIAGEM_A, VIAGEM_B].sort());
      const va = p.viagens.find((v) => v.trip_id === VIAGEM_A)!;
      const vb = p.viagens.find((v) => v.trip_id === VIAGEM_B)!;
      assert.equal(va.device_id, apA.deviceId);
      assert.equal(vb.device_id, apB.deviceId);
      assert.equal(va.ultima_posicao_em, em(3, 20));
      assert.equal(vb.ultima_posicao_em, em(3, 30));
    });

    console.log("\nR. REDE — um cai, o outro segue; a volta não duplica");

    await teste("R1 B fica SEM REDE com 4 pontos; A continua enviando — nada de B chega, nada de A atrasa, nada de B some", async () => {
      apB.plataformaUrl = PORTA_MORTA;
      for (let i = 0; i < 4; i++) apB.capturar(VIAGEM_B, -23.6100 - i * 0.001, -46.7100, em(10 + i), { offline: true });
      apA.capturar(VIAGEM_A, -23.5600, -46.6400, em(10, 30));
      apA.capturar(VIAGEM_A, -23.5610, -46.6410, em(11, 30));
      const [ra, rb] = await Promise.all([apA.sincronizar(), apB.sincronizar()]);
      assert.deepEqual([ra, rb], ["success", "retry"]);
      assert.equal((await fatosDoAparelho(b, apA.deviceId)).length, 9, "a queda de B segurou o lote de A");
      assert.equal((await fatosDoAparelho(b, apB.deviceId)).length, 7, "chegou fato de B com a rede dele caída");
      const presos = apB.db.todos().filter((p) => p.syncState !== "sent");
      assert.equal(presos.length, 4, "a queda de rede apagou ponto de B");
      assert.ok(presos.every((p) => p.syncState === "failed" && p.attempts === 1));
      assert.ok(DeviceSession.sessaoAtual(apB.db), "a queda de rede apagou a credencial de B");
    });

    await teste("R2 B VOLTA: os 4 pontos sobem marcados offline, na ordem dele, enquanto A envia outro lote", async () => {
      apB.plataformaUrl = url;
      apA.capturar(VIAGEM_A, -23.5620, -46.6420, em(14, 30));
      const [ra, rb] = await Promise.all([apA.sincronizar(), apB.sincronizar()]);
      assert.deepEqual([ra, rb], ["success", "success"]);
      const fb = await fatosDoAparelho(b, apB.deviceId);
      assert.deepEqual(fb.map((f) => f.sequence_local), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      assert.deepEqual(fb.slice(7).map((f) => f.offline), [true, true, true, true]);
      assert.deepEqual(fb.slice(7).map((f) => f.occurred_at), [em(10), em(11), em(12), em(13)]);
      assert.ok(fb.every((f) => f.object_id === VIAGEM_B && f.actor_id === MOTOBOY_B));
      assert.equal((await fatosDoAparelho(b, apA.deviceId)).length, 10);
      assert.equal(apB.db.pendingCount(), 0);
    });

    await teste("R3 recibo perdido nos DOIS: reenvio simultâneo dos mesmos lotes não cria fato nem mensagem", async () => {
      const antes = [await contar(b, "platform.event_log"), await contar(b, "platform.outbox")];
      for (const ap of [apA, apB]) ap.db.markFailed(ap.db.todos().map((p) => p.pointId), "recibo perdido (simulado pelo teste)");
      assert.equal(apA.db.pendingCount() + apB.db.pendingCount(), 21);
      const r = await Promise.all([apA.sincronizar(), apB.sincronizar()]);
      assert.deepEqual(r, ["success", "success"]);
      assert.equal(apA.db.pendingCount() + apB.db.pendingCount(), 0, "duplicata tratada como erro: o cliente reenviaria para sempre");
      assert.deepEqual([await contar(b, "platform.event_log"), await contar(b, "platform.outbox")], antes, "o reenvio duplicou");
      assert.equal((await fatosDaViagem(b, VIAGEM_A)).length, 10);
      assert.equal((await fatosDaViagem(b, VIAGEM_B)).length, 11);
    });

    console.log("\nI. ISOLAMENTO — o token de um não vale pelo outro");

    await teste("I1 nos dois sentidos: token de A com ponto do aparelho B (e o inverso) é recusado, e nenhum fato nasce", async () => {
      const antes = await contar(b, "platform.event_log");
      for (const [dono, vitima, viagem] of [[apA, apB, VIAGEM_B], [apB, apA, VIAGEM_A]] as const) {
        const r = await enviar(url, token(dono), vitima.deviceId, viagem, em(20), 99);
        assert.equal(r.status, 200);
        assert.deepEqual([r.corpo.accepted, r.corpo.rejected], [0, 1]);
        assert.match(r.corpo.rejections?.[0]?.motivo ?? "", /diverge do aparelho autenticado/);
      }
      assert.equal(await contar(b, "platform.event_log"), antes);
    });

    await teste("I2 o segredo de A não abre a sessão de B, nem o de B a de A", async () => {
      for (const [dono, vitima] of [[apA, apB], [apB, apA]] as const) {
        const r = await fetch(`${url}/api/device/session`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: vitima.deviceId, device_secret: segredo(dono) }),
        });
        assert.equal(r.status, 403);
        assert.equal(((await r.json()) as { motivo: string }).motivo, "segredo_divergente");
      }
    });

    await teste("I3 o aparelho NÃO autorizado continua de fora depois de tudo isso: sem sessão, sem fato, com os pontos", async () => {
      assert.equal(await apC.sincronizar(), "retry");
      assert.equal(DeviceSession.sessaoAtual(apC.db), null);
      assert.equal((await fatosDoAparelho(b, apC.deviceId)).length, 0);
      assert.equal((await fatosDaViagem(b, VIAGEM_C)).length, 0);
      assert.equal(apC.db.pendingCount(), 4);
    });

    console.log("\nX. A LACUNA X1, FECHADA");

    /*
     * A ingestão amarra o ponto ao APARELHO autenticado. Ela não sabe de quem é
     * a viagem: quem sabe é o piloto. Um aparelho autorizado que mande a
     * `trip_id` de outro motoboy põe a própria posição na viagem dele — no
     * log, na leitura do despacho e na projeção. O aplicativo honesto não faz
     * isso (a viagem vem do snapshot do próprio motoboy), mas a plataforma não
     * recusa. Fechar exige a plataforma conhecer o dono da viagem.
     */
    await teste("X1 token e aparelho de A com a `trip_id` de B são recusados — inclusive com a concessão verdadeira de B anexada —, e a viagem de B segue só com pontos de B", async () => {
      const vazada = concessaoDaBancada(VIAGEM_B, apB.deviceId)!;
      assert.ok(vazada, "a bancada não emitiu a concessão de B para B");
      const r = await enviar(url, token(apA), apA.deviceId, VIAGEM_B, em(30), 50, [vazada]);
      const naViagemDeB = await fatosDaViagem(b, VIAGEM_B);
      const intrusos = naViagemDeB.filter((f) => f.device_id !== apB.deviceId).length;
      const loc = await lerLocalizacaoCanonicaDaViagem(b.cliente, { unit_id: UNIDADE, trip_id: VIAGEM_B, source_mode: MODO });
      assert.ok(
        r.corpo.accepted === 0 && intrusos === 0 && loc.last_point?.device_id === apB.deviceId,
        `medido: aceitos=${r.corpo.accepted}; pontos de outro aparelho na viagem de B=${intrusos}; ` +
          `a última posição da viagem de B é do aparelho de ${loc.last_point?.device_id === apA.deviceId ? "A" : "B"}`,
      );
    });

    console.log("\nA. ASSÍNCRONO E REVOGAÇÃO");

    await teste("A1 o assíncrono reconstrói do log as DUAS viagens da unidade e drena a outbox dos dois aparelhos", async () => {
      const ipc = process.platform === "win32";
      assincrono = subir(BIN_ASSINCRONO, b.url, ipc ? { DELIVERYOS_TEST_IPC_SHUTDOWN: "true" } : {}, ipc);
      const a = assincrono;
      const MARCA = "[assincrono] replay ";
      assert.ok(await ate(() => a.saida().includes(`${MARCA}{`)), `o assíncrono não reconstruiu:\n${a.saida()}`);
      const linha = a.saida().split("\n").filter((l) => l.startsWith(`${MARCA}{`)).pop()!;
      const replay = JSON.parse(linha.slice(MARCA.length)) as {
        estado: string; escopos: { unit_id: string; source_mode: string; fatos: number; viagens: number }[];
      };
      assert.equal(replay.estado, "completo");
      const escopo = replay.escopos.find((e) => e.unit_id === UNIDADE && e.source_mode === MODO);
      assert.ok(escopo, "a unidade dos dois aparelhos não apareceu no replay");
      assert.equal(escopo.viagens, 2, "o replay não reconstruiu exatamente as duas viagens");
      assert.equal(escopo.fatos, (await fatosDaViagem(b, VIAGEM_A)).length + (await fatosDaViagem(b, VIAGEM_B)).length);
      assert.ok(
        await ate(async () => Number((await b.cliente.query(
          `SELECT count(*)::int AS n FROM platform.outbox WHERE processed_at IS NULL`))[0].n) === 0),
        "a outbox dos dois aparelhos não foi drenada",
      );
    });

    await teste("A2 REVOGAR A não toca em B: o ponto de A fica no aparelho como recusado, B segue enviando", async () => {
      await b.cliente.query(`UPDATE identity.device SET revoked_at = now(), revoked_by = 'gerente' WHERE device_id = $1`, [apA.deviceId]);
      const deA = (await fatosDoAparelho(b, apA.deviceId)).length;
      const deB = (await fatosDoAparelho(b, apB.deviceId)).length;
      apA.capturar(VIAGEM_A, -23.5700, -46.6500, em(40));
      apB.capturar(VIAGEM_B, -23.6200, -46.7200, em(40, 30));
      const [, rb] = await Promise.all([apA.sincronizar(), apB.sincronizar()]);
      assert.equal(rb, "success", "a revogação de A travou B");
      assert.equal((await fatosDoAparelho(b, apA.deviceId)).length, deA, "aparelho revogado gravou fato");
      assert.equal((await fatosDoAparelho(b, apB.deviceId)).length, deB + 1, "a revogação de A travou B");
      const pontoDeA = apA.db.todos().find((p) => p.occurredAt === em(40))!;
      assert.equal(pontoDeA.syncState, "rejected", "o ponto do aparelho revogado sumiu ou voltou para a fila");
      assert.match(pontoDeA.lastError ?? "", /revogado/);
      assert.equal(apB.db.rejectedCount(), 0, "a revogação de A marcou ponto de B");
      assert.ok(DeviceSession.sessaoAtual(apB.db), "a revogação de A apagou a sessão de B");
    });
  } finally {
    if (assincrono) await (assincrono as Processo).fim();
    if (critico) await critico.fim();
    await b.descartar();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }

  resumo();
}

/** Fatos de auditoria (sessão emitida etc.) não são GPS: ficam fora da conta de pontos. */
async function auditados(b: BancoIsolado): Promise<number> {
  return Number((await b.cliente.query(
    `SELECT count(*)::int AS n FROM platform.event_log WHERE event_type <> 'gps_batch_received'`))[0].n);
}

interface Recibo { accepted?: number; rejected?: number; duplicate?: number; rejections?: { motivo: string }[] }

/** Um ponto cru em `/api/gps/batch`, do jeito que um cliente adulterado mandaria. */
async function enviar(
  url: string, token: string, device_id: string, trip_id: string, occurred_at: string, sequence_local: number,
  vazadas: string[] = [],
): Promise<{ status: number; corpo: Recibo }> {
  const r = await fetch(`${url}/api/gps/batch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      correlation_id: `multi-${sequence_local}`,
      // O cliente adulterado anexa tudo o que conseguiu: a concessão que o piloto
      // lhe daria para esta viagem (nenhuma, se não for dele) e as vazadas.
      trip_grants: [concessaoDaBancada(trip_id, device_id), ...vazadas].filter(Boolean),
      points: [{
        point_id: `p-cru-${device_id}-${sequence_local}`,
        idempotency_key: `gps:${device_id}:${trip_id}:${occurred_at}`,
        trip_id, device_id, latitude: -23.9, longitude: -46.9, accuracy_m: 5,
        occurred_at, sequence_local, is_mock: false,
      }],
    }),
  });
  return { status: r.status, corpo: (await r.json()) as Recibo };
}

function resumo(): void {
  console.log(`\n${passaram}/${passaram + falhas.length} provas da cadeia multiaparelho · ${lacunasAbertas.length} lacuna(s) aberta(s)`);
  for (const l of lacunasAbertas) console.log(`  lacuna: ${l}`);
  if (falhas.length) {
    console.log("\nFALHAS:");
    for (const f of falhas) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(lacunasAbertas.length ? "\nCADEIA_MULTIAPARELHO_GREEN_COM_LACUNA_ABERTA" : "\nCADEIA_MULTIAPARELHO_GREEN");
}

void main().catch((e) => {
  console.error("falha inesperada na suíte:", e);
  process.exit(1);
});
