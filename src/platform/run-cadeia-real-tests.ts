/**
 * A CADEIA CANÔNICA DE REALIDADE — um fato de campo, de ponta a ponta.
 *
 *   aparelho → Room → credencial → sincronização → runtime crítico
 *   → PostgreSQL → platform.event_log → Operação Viva → restart/replay
 *
 * Prova de INTEGRAÇÃO, com os binários de `dist/`, PostgreSQL real e um
 * aparelho LÓGICO (`aparelho-logico.ts`) que replica o contrato do Kotlin.
 * NÃO é prova física do Android — o telefone só entra depois desta fronteira.
 *
 *   A. O BURACO, reproduzido: nenhum caminho oficial emitia token de aparelho.
 *      O runtime crítico de 0b8803c respondia 404 a `/api/device/session`
 *      (medido com o binário daquele commit); o servidor do piloto responde
 *      200 sem `device_token`, e o cliente fica em laço "falhou
 *      temporariamente" para sempre.
 *   B. A DECISÃO de sessão, sem banco: desconhecido, autorizado, revogado,
 *      segredo divergente, vínculo por primeiro uso, corrida do vínculo,
 *      unidade vinda do cadastro.
 *   C. A CADEIA, passos 1–20 do desenho, mais revogação, expiração e "A não
 *      fala como B".
 *
 * Cada asserção compara VALOR — nunca "não deu erro".
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { bancoIsolado as bancoIsoladoDe, type BancoIsolado } from "./banco-isolado";
import { AparelhoLogico, DeviceSession, KEY_SESSION_TOKEN, KEY_TOKEN_EXPIRA_EM, KEY_DEVICE_SECRET } from "./aparelho-logico";
import { emitirSessaoDeAparelho, hashDoSegredo, type RegistroDeSessao, type DispositivoComVinculo } from "./auth/device-session";
import { emitirToken, verificarToken } from "./auth/device-token";
import { lerFatosParaReplay } from "./projections/replay-do-event-log";
import { projetar, mesmoEstadoLogico } from "./projections/operacao-viva";
import { TIPOS_DA_OPERACAO_VIVA } from "./runtime/handler-operacao-viva";

const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const raiz = process.cwd();
const BIN_CRITICO = join(raiz, "dist/src/platform/bin/critical.js");
const BIN_ASSINCRONO = join(raiz, "dist/src/platform/bin/async-runtime.js");
/** Fixture declarada. Nunca um segredo real. */
const SEGREDO = "fixture-cadeia-".padEnd(48, "x");

console.log("\n=== CADEIA REAL — UM FATO DE CAMPO, DE PONTA A PONTA ===\n");

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
 * Processos reais
 * ------------------------------------------------------------------ */

interface Processo {
  filho: ChildProcess;
  porta: number;
  saida(): string;
  fim(sinal?: NodeJS.Signals): Promise<number | null>;
}

function subir(bin: string, url: string, extra: NodeJS.ProcessEnv = {}): Processo {
  const porta = 8900 + Math.floor(Math.random() * 300);
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
  const saiu = new Promise<number | null>((r) => filho.once("exit", (c) => r(c)));
  return {
    filho,
    porta,
    saida: () => buffer,
    fim(sinal: NodeJS.Signals = "SIGTERM") {
      if (filho.exitCode === null && filho.signalCode === null) {
        filho.kill(sinal);
        setTimeout(() => filho.kill("SIGKILL"), 8000).unref();
      }
      return saiu;
    },
  };
}

async function ate(p: Processo, padrao: RegExp, limiteMs = 20000): Promise<boolean> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (padrao.test(p.saida())) return true;
    if (p.filho.exitCode !== null) return padrao.test(p.saida());
    await esperar(100);
  }
  return false;
}

function ultimaLinha<T>(p: Processo, rotulo: string): T | null {
  const linhas = p.saida().split("\n").filter((l) => l.startsWith(rotulo));
  if (!linhas.length) return null;
  const l = linhas[linhas.length - 1];
  return JSON.parse(l.slice(l.indexOf("{"))) as T;
}

interface Escopo { unit_id: string; source_mode: string; fatos: number; digest: string; viagens: number; frescor: Record<string, number> }
interface Replay { estado: string; aplicados: number; duplicados: number; escopos: Escopo[] }

const subirCritico = (b: BancoIsolado, modo: string) =>
  subir(BIN_CRITICO, b.url, { DELIVERYOS_SOURCE_MODE: modo });
const subirAssincrono = (b: BancoIsolado) => {
  const p = subir(BIN_ASSINCRONO, b.url);
  delete process.env.DELIVERYOS_SOURCE_MODE;
  return p;
};

/* ------------------------------------------------------------------ *
 * Atos HUMANOS — o que o gerente faz fora do aparelho
 * ------------------------------------------------------------------ */

/** Autorizar: a linha em identity.device. É o único INSERT humano da cadeia. */
async function autorizarAparelho(b: BancoIsolado, device_id: string, unit_id: string, actor_id: string): Promise<void> {
  await b.cliente.query(`INSERT INTO identity.unit(unit_id, display_name) VALUES ($1, 'Cadeia') ON CONFLICT DO NOTHING`, [unit_id]);
  await b.cliente.query(
    `INSERT INTO identity.actor(actor_id, unit_id, role, label) VALUES ($1, $2, 'motoboy_interno', 'Cadeia') ON CONFLICT DO NOTHING`,
    [actor_id, unit_id],
  );
  await b.cliente.query(
    `INSERT INTO identity.device(device_id, unit_id, actor_id, label) VALUES ($1, $2, $3, 'aparelho da cadeia')`,
    [device_id, unit_id, actor_id],
  );
}

async function revogarAparelho(b: BancoIsolado, device_id: string): Promise<void> {
  await b.cliente.query(`UPDATE identity.device SET revoked_at = now(), revoked_by = 'gerente' WHERE device_id = $1`, [device_id]);
}

async function linhaDoAparelho(b: BancoIsolado, device_id: string): Promise<Record<string, unknown> | null> {
  const r = await b.cliente.query(`SELECT * FROM identity.device WHERE device_id = $1`, [device_id]);
  return (r[0] as Record<string, unknown>) ?? null;
}

async function fatosDoAparelho(b: BancoIsolado, device_id: string): Promise<Record<string, unknown>[]> {
  return (await b.cliente.query(
    `SELECT event_id, event_type, unit_id, object_type, object_id, device_id, idempotency_key, origin, source_mode,
            occurred_at, recorded_at, sequence_local, correlation_id, payload
       FROM platform.event_log WHERE device_id = $1 ORDER BY sequence_local`,
    [device_id],
  )) as Record<string, unknown>[];
}

async function projecaoDoBanco(b: BancoIsolado, unit_id: string, modo: "real" | "simulated" | "control", agora: Date) {
  const leitura = await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA);
  return projetar(leitura.aptos, { agora, unit_id, source_mode: modo });
}

/* ------------------------------------------------------------------ *
 * Registro falso para a decisão pura
 * ------------------------------------------------------------------ */

function registroFalso(linhas: Record<string, DispositivoComVinculo>) {
  const auditoria: { device_id: string; jti: string }[] = [];
  const registro: RegistroDeSessao & { auditoria: typeof auditoria; vinculos: number } = {
    auditoria,
    vinculos: 0,
    async buscar(id) {
      return linhas[id] ? { ...linhas[id] } : null;
    },
    async vincularSegredo(id, hash) {
      const l = linhas[id];
      if (!l || l.secret_hash || l.revoked_at) return false;
      l.secret_hash = hash;
      registro.vinculos += 1;
      return true;
    },
    async registrarSessao(id, d) {
      auditoria.push({ device_id: id, jti: d.jti });
    },
  };
  return registro;
}

/* ================================================================== */

async function main(): Promise<void> {
  /* ---------------------------------------------------------------- *
   * A. O buraco, reproduzido
   * ---------------------------------------------------------------- */
  console.log("A. O BURACO — nenhum caminho oficial emitia token de aparelho");

  await teste("A1 o cliente trata 200 sem token como 'falhou temporariamente': laço sem saída, nenhum ponto sobe", async () => {
    // Um servidor falso que responde EXATAMENTE o que `handleDeviceSession` do
    // piloto antigo devolve a um aparelho autorizado (medido em 0b8803c: 200,
    // sem `device_token`). A plataforma não importa Entregas — regra
    // estrutural do `test:platform` — então a resposta é replicada, não chamada.
    const { createServer } = await import("node:http");
    const falso = createServer((req, res) => {
      let corpo = "";
      req.on("data", (c: Buffer) => (corpo += c.toString()));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, device_id: "x", rider_id: "r1", api_version: "device-api@1.0.0" }));
      });
    });
    await new Promise<void>((r) => falso.listen(0, "127.0.0.1", () => r()));
    const porta = (falso.address() as { port: number }).port;
    const dir = mkdtempSync(join(tmpdir(), "cadeia-a2-"));
    try {
      const ap = new AparelhoLogico({ diretorio: dir, plataformaUrl: `http://127.0.0.1:${porta}` });
      ap.capturar("t-a2", -23.5, -46.6, "2026-09-24T10:00:00.000Z");
      const resultados = [];
      for (let i = 0; i < 3; i += 1) resultados.push(await ap.sincronizar());
      assert.deepEqual(resultados, ["retry", "retry", "retry"]);
      assert.equal(ap.db.pendingCount(), 1, "o ponto sumiu ou subiu — nenhum dos dois podia acontecer");
      assert.equal(DeviceSession.sessaoAtual(ap.db), null);
    } finally {
      falso.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /* ---------------------------------------------------------------- *
   * B. A decisão de sessão, sem banco
   * ---------------------------------------------------------------- */
  console.log("\nB. A DECISÃO DE SESSÃO — quem é, se ainda pode falar, se prova que é ele");

  const AGORA = new Date("2026-09-24T12:00:00Z");
  const segredoA = "a".repeat(32);
  const segredoB = "b".repeat(32);
  const linhas = (): Record<string, DispositivoComVinculo> => ({
    "dev-livre": { device_id: "dev-livre", unit_id: "U1", actor_id: "m1", revoked_at: null, secret_hash: null },
    "dev-vinculado": { device_id: "dev-vinculado", unit_id: "U1", actor_id: "m2", revoked_at: null, secret_hash: hashDoSegredo(segredoA) },
    "dev-revogado": { device_id: "dev-revogado", unit_id: "U1", revoked_at: "2026-09-01T00:00:00Z", secret_hash: hashDoSegredo(segredoA) },
  });
  const decidir = (pedido: Record<string, unknown>, reg = registroFalso(linhas())) =>
    emitirSessaoDeAparelho({ pedido, registro: reg, segredo_de_assinatura: SEGREDO, agora: AGORA });

  await teste("B1 aparelho DESCONHECIDO: 401 aguardar_humano — nunca 403, para o cliente não se trancar sozinho", async () => {
    const r = await decidir({ device_id: "dev-fantasma", device_secret: segredoA });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.status, 401);
    assert.equal(r.ok === false && r.motivo, "dispositivo_desconhecido");
    assert.equal(r.ok === false && r.instrucao, "aguardar_humano");
  });

  await teste("B2 sem segredo, ou com segredo fraco: 401 corrigir_cliente — nada é vinculado", async () => {
    const reg = registroFalso(linhas());
    const semNada = await decidir({ device_id: "dev-livre" }, reg);
    const fraco = await decidir({ device_id: "dev-livre", device_secret: "curto" }, reg);
    assert.equal(semNada.ok === false && semNada.motivo, "segredo_ausente");
    assert.equal(fraco.ok === false && fraco.motivo, "segredo_fraco");
    assert.equal(reg.vinculos, 0, "vinculou um segredo que não devia existir");
  });

  await teste("B3 REVOGADO: 403 parar_e_avisar, mesmo com o segredo certo, e antes de olhar o segredo", async () => {
    const r = await decidir({ device_id: "dev-revogado", device_secret: segredoA });
    assert.equal(r.ok === false && r.status, 403);
    assert.equal(r.ok === false && r.motivo, "dispositivo_revogado");
    const r2 = await decidir({ device_id: "dev-revogado", device_secret: segredoB });
    assert.equal(r2.ok === false && r2.motivo, "dispositivo_revogado", "revogado com segredo errado vazou pista sobre o segredo");
  });

  await teste("B4 PRIMEIRO CONTATO vincula; o mesmo segredo renova; outro segredo é 403 segredo_divergente", async () => {
    const reg = registroFalso(linhas());
    const primeiro = await decidir({ device_id: "dev-livre", device_secret: segredoA, app_version: "1.0.0" }, reg);
    assert.equal(primeiro.ok, true);
    assert.equal(primeiro.ok && primeiro.vinculou_agora, true);
    assert.equal(reg.vinculos, 1);
    // Um segundo depois: o `jti` deriva de (device_id, iat), então duas emissões
    // no MESMO segundo compartilham o identificador — limite declarado em §UNKNOWN.
    const renovado = await emitirSessaoDeAparelho({
      pedido: { device_id: "dev-livre", device_secret: segredoA }, registro: reg, segredo_de_assinatura: SEGREDO,
      agora: new Date(AGORA.getTime() + 1000),
    });
    assert.equal(renovado.ok && renovado.vinculou_agora, false);
    assert.equal(reg.vinculos, 1, "renovar vinculou de novo");
    const outro = await decidir({ device_id: "dev-livre", device_secret: segredoB }, reg);
    assert.equal(outro.ok === false && outro.status, 403);
    assert.equal(outro.ok === false && outro.motivo, "segredo_divergente");
    assert.equal(reg.auditoria.length, 2, "emissões auditadas");
    assert.notEqual(reg.auditoria[0].jti, reg.auditoria[1].jti);
  });

  await teste("B5 corrida do primeiro contato: quem perde o UPDATE relê e só passa se o hash vinculado for o dele", async () => {
    const base = linhas();
    const reg = registroFalso(base);
    // O vínculo "perde" a corrida: outro contato gravou ANTES, com o segredo B.
    reg.vincularSegredo = async (id) => {
      base[id].secret_hash = hashDoSegredo(segredoB);
      return false;
    };
    const perdeu = await decidir({ device_id: "dev-livre", device_secret: segredoA }, reg);
    assert.equal(perdeu.ok === false && perdeu.motivo, "segredo_divergente");
    const ganhou = await decidir({ device_id: "dev-livre", device_secret: segredoB }, reg);
    assert.equal(ganhou.ok, true);
  });

  await teste("B6 as claims vêm do CADASTRO: unidade e ator do registro, nunca do pedido; validade de um turno", async () => {
    const r = await decidir({ device_id: "dev-vinculado", device_secret: segredoA, unit_id: "OUTRA", actor_id: "hacker" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const v = verificarToken(r.token, SEGREDO, AGORA);
    assert.equal(v.ok, true);
    assert.equal(v.ok && v.claims.unit_id, "U1");
    assert.equal(v.ok && v.claims.actor_id, "m2");
    assert.equal(v.ok && v.claims.device_id, "dev-vinculado");
    assert.equal(r.expires_in_s, 12 * 3600);
  });

  await teste("B7 o corpo de resposta nunca carrega o segredo do aparelho nem o de assinatura", async () => {
    const { corpoDeSessao } = await import("./auth/device-session");
    const r = await decidir({ device_id: "dev-vinculado", device_secret: segredoA });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const texto = JSON.stringify(corpoDeSessao(r));
    assert.equal(texto.includes(segredoA), false);
    assert.equal(texto.includes(SEGREDO), false);
    assert.equal(texto.includes(hashDoSegredo(segredoA)), false);
    assert.match(texto, /"device_token":"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"/);
  });

  /* ---------------------------------------------------------------- *
   * C. A cadeia, com os binários reais
   * ---------------------------------------------------------------- */
  console.log("\nC. A CADEIA — binários de dist/, PostgreSQL real, aparelho lógico");

  if (!URL_PG) {
    console.log("PULADO: DELIVERYOS_PG_URL não definida — a cadeia com processos reais NÃO foi exercitada.");
    resumo();
    return;
  }

  const b = await bancoIsoladoDe(URL_PG, undefined, "cadeia");
  const dir = mkdtempSync(join(tmpdir(), "cadeia-aparelho-"));
  let critico: Processo | null = null;
  let assincrono = null as Processo | null;
  const UNIDADE = `CAD${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const MOTOBOY = `m-${UNIDADE.toLowerCase()}`;
  const VIAGEM = `t-${UNIDADE.toLowerCase()}`;
  const MODO = "simulated" as const;

  try {
    critico = subirCritico(b, MODO);
    assert.ok(await ate(critico, /\[critico\] ouvindo/), `o crítico não subiu:\n${critico.saida()}`);
    const urlCritico = `http://127.0.0.1:${critico.porta}`;
    const PORTA_MORTA = "http://127.0.0.1:9";

    // 1. aparelho lógico novo
    let ap = new AparelhoLogico({ diretorio: dir, plataformaUrl: urlCritico });

    await teste("C1 aparelho novo nasce com identidade e segredo PRÓPRIOS, persistidos antes de qualquer rede", () => {
      assert.match(ap.deviceId, /^dev-[0-9a-f]{16}$/);
      const segredo = ap.db.get(KEY_DEVICE_SECRET);
      assert.ok(segredo && segredo.length >= 32, "segredo ausente ou curto");
      const denovo = new AparelhoLogico({ diretorio: dir, plataformaUrl: urlCritico });
      assert.equal(denovo.deviceId, ap.deviceId, "reabrir o Room trocou a identidade");
      assert.equal(denovo.db.get(KEY_DEVICE_SECRET), segredo, "reabrir o Room trocou o segredo");
    });

    await teste("C2 ANTES da autorização humana: 401 aguardar_humano, nenhum token, ponto capturado fica", async () => {
      ap.capturar(VIAGEM, -23.5505, -46.6333, "2026-09-24T10:00:00.000Z");
      const r = await ap.sincronizar();
      assert.equal(r, "retry");
      assert.equal(DeviceSession.sessaoAtual(ap.db), null, "recebeu token sem estar autorizado");
      assert.equal(ap.db.pendingCount(), 1);
      assert.equal(await linhaDoAparelho(b, ap.deviceId), null, "o runtime cadastrou o aparelho sozinho");
    });

    await teste("C3 AUTORIZADO pelo humano: o bootstrap emite token, vincula o segredo e audita a emissão", async () => {
      await autorizarAparelho(b, ap.deviceId, UNIDADE, MOTOBOY);
      const antes = await linhaDoAparelho(b, ap.deviceId);
      assert.equal(antes?.secret_hash, null, "autorizar já vinculou segredo — não podia");
      const r = await ap.sincronizar();
      assert.equal(r, "success");
      const sessao = DeviceSession.sessaoAtual(ap.db);
      assert.ok(sessao, "sem sessão depois de autorizado");
      const v = verificarToken(sessao!.token, SEGREDO, new Date());
      assert.equal(v.ok, true, "o token guardado não é verificável pelo segredo de assinatura");
      assert.equal(v.ok && v.claims.device_id, ap.deviceId);
      assert.equal(v.ok && v.claims.unit_id, UNIDADE);
      const depois = await linhaDoAparelho(b, ap.deviceId);
      assert.equal(depois?.secret_hash, hashDoSegredo(ap.db.get(KEY_DEVICE_SECRET)!));
      assert.ok(depois?.secret_bound_at, "sem instante do vínculo");
      assert.ok(depois?.last_session_at, "sem última sessão");
      assert.equal(depois?.app_version, "1.0.0-logico");
      const aud = await b.cliente.query(`SELECT action, detail FROM platform.audit WHERE object_id = $1`, [ap.deviceId]);
      assert.equal(aud.length, 1);
      assert.equal(aud[0].action, "device_session_issued");
      assert.equal((aud[0].detail as { jti?: string }).jti, v.ok ? v.claims.jti : "");
      // E o ponto que estava esperando subiu no MESMO ciclo.
      assert.equal(ap.db.pendingCount(), 0, "o ponto capturado antes da autorização não subiu");
      assert.equal((await fatosDoAparelho(b, ap.deviceId)).length, 1);
    });

    await teste("C4 a sessão SOBREVIVE ao reinício do app: reabrir o Room devolve o mesmo token, sem novo bootstrap", async () => {
      const antes = DeviceSession.sessaoAtual(ap.db)!;
      const sessoesAntes = (await b.cliente.query(`SELECT count(*)::int AS n FROM platform.audit WHERE object_id = $1`, [ap.deviceId]))[0].n;
      ap = new AparelhoLogico({ diretorio: dir, plataformaUrl: urlCritico });
      const depois = DeviceSession.sessaoAtual(ap.db);
      assert.deepEqual(depois, antes);
      assert.equal(await ap.sincronizar(), "success");
      const sessoesDepois = (await b.cliente.query(`SELECT count(*)::int AS n FROM platform.audit WHERE object_id = $1`, [ap.deviceId]))[0].n;
      assert.equal(sessoesDepois, sessoesAntes, "reiniciar o app custou um bootstrap");
    });

    await teste("C5–C7 QUEDA DE REDE: pontos capturados, envio falha, os pontos PERMANECEM no Room como failed", async () => {
      ap.capturar(VIAGEM, -23.5510, -46.6340, "2026-09-24T10:01:00.000Z", { offline: true });
      ap.capturar(VIAGEM, -23.5515, -46.6347, "2026-09-24T10:02:00.000Z", { offline: true });
      ap.capturar(VIAGEM, -23.5520, -46.6355, "2026-09-24T10:03:00.000Z", { offline: true });
      assert.equal(ap.db.pendingCount(), 3);
      ap.plataformaUrl = PORTA_MORTA;
      assert.equal(await ap.sincronizar(), "retry");
      const pontos = ap.db.todos().filter((p) => p.syncState !== "sent");
      assert.equal(pontos.length, 3, "a queda de rede apagou ponto");
      assert.deepEqual(pontos.map((p) => p.syncState), ["failed", "failed", "failed"]);
      assert.deepEqual(pontos.map((p) => p.attempts), [1, 1, 1]);
      assert.ok(DeviceSession.sessaoAtual(ap.db), "a queda de rede apagou a credencial");
      assert.equal((await fatosDoAparelho(b, ap.deviceId)).length, 1, "chegou fato com a rede caída");
    });

    let reciboAceito: Record<string, unknown> = {};
    await teste("C8–C11 RECONEXÃO: o lote sobe, o crítico autentica, o PostgreSQL confirma 4 fatos", async () => {
      ap.plataformaUrl = urlCritico;
      assert.equal(await ap.sincronizar(), "success");
      assert.equal(ap.db.pendingCount(), 0);
      const fatos = await fatosDoAparelho(b, ap.deviceId);
      assert.equal(fatos.length, 4);
      assert.deepEqual(fatos.map((f) => f.sequence_local).map(Number), [1, 2, 3, 4]);
      reciboAceito = fatos[3];
    });

    await teste("C12 o fato é o certo: tipo, viagem, aparelho, chave do APARELHO, origem device, coordenada, offline", () => {
      const f = reciboAceito;
      assert.equal(f.event_type, "gps_batch_received");
      assert.equal(f.object_type, "trip");
      assert.equal(f.object_id, VIAGEM);
      assert.equal(f.device_id, ap.deviceId);
      assert.equal(f.unit_id, UNIDADE);
      assert.equal(f.origin, "device");
      assert.equal(f.idempotency_key, `gps:${ap.deviceId}:${VIAGEM}:2026-09-24T10:03:00.000Z`);
      assert.equal(new Date(f.occurred_at as string).toISOString(), "2026-09-24T10:03:00.000Z");
      const payload = f.payload as Record<string, unknown>;
      assert.equal(payload.latitude, -23.552);
      assert.equal(payload.longitude, -46.6355);
      assert.equal(payload.captured_offline, true);
      assert.equal("device_secret" in payload, false);
      assert.ok(f.recorded_at, "sem instante de recepção");
    });

    await teste("C13 source_mode é o da INSTÂNCIA (simulated), em todos os fatos e na outbox — nada virou real", async () => {
      const modos = (await fatosDoAparelho(b, ap.deviceId)).map((f) => f.source_mode);
      assert.deepEqual(modos, [MODO, MODO, MODO, MODO]);
      const outbox = await b.cliente.query(`SELECT payload->>'source_mode' AS m FROM platform.outbox`);
      assert.deepEqual(outbox.map((o) => o.m), [MODO, MODO, MODO, MODO]);
      const real = await b.cliente.query(`SELECT count(*)::int AS n FROM platform.event_log WHERE source_mode = 'real'`);
      assert.equal(real[0].n, 0);
    });

    await teste("C14 recibo perdido → reenvio do MESMO lote: duplicado, nenhum fato novo, o cliente limpa a fila", async () => {
      // Simula o recibo que não chegou: o cliente ainda acha que falhou.
      const ids = ap.db.todos().map((p) => p.pointId);
      ap.db.markFailed(ids, "recibo perdido (simulado pelo teste)");
      assert.equal(ap.db.pendingCount(), 4);
      assert.equal(await ap.sincronizar(), "success");
      assert.equal(ap.db.pendingCount(), 0, "duplicata foi tratada como erro e o cliente vai reenviar para sempre");
      assert.equal((await fatosDoAparelho(b, ap.deviceId)).length, 4, "reenvio duplicou fato");
      const outbox = await b.cliente.query(`SELECT count(*)::int AS n FROM platform.outbox`);
      assert.equal(outbox[0].n, 4, "reenvio duplicou mensagem");
    });

    let projecaoAntes: ReturnType<typeof projetar> | null = null;
    const AGORA_PROJ = new Date("2026-09-24T10:04:00.000Z");
    await teste("C15–C16 o ASSÍNCRONO consome a outbox e a Operação Viva projeta a viagem com a última posição", async () => {
      assincrono = subirAssincrono(b);
      assert.ok(await ate(assincrono, /\[assincrono\] replay \{/), `o assíncrono não subiu:\n${assincrono.saida()}`);
      const fim = Date.now() + 20000;
      let done = 0;
      while (Date.now() < fim) {
        done = (await b.cliente.query(`SELECT count(*)::int AS n FROM platform.outbox WHERE state = 'done'`))[0].n as number;
        if (done === 4) break;
        await esperar(200);
      }
      assert.equal(done, 4, `outbox não drenada:\n${assincrono.saida().slice(-600)}`);
      projecaoAntes = await projecaoDoBanco(b, UNIDADE, MODO, AGORA_PROJ);
      assert.equal(projecaoAntes.viagens.length, 1);
      const v = projecaoAntes.viagens[0];
      assert.equal(v.trip_id, VIAGEM);
      assert.equal(v.device_id, ap.deviceId);
      assert.equal(v.ultima_posicao_em, "2026-09-24T10:03:00.000Z");
      assert.equal(v.frescor, "fresh");
      assert.equal(v.eventos.length, 4);
      // Honesto: sem `trip_created` na cadeia canônica, o estado da viagem é
      // DESCONHECIDO. A viagem existe pelo GPS; o ciclo de vida dela ainda
      // não entra por aqui (fica no piloto antigo — ver o Difference Check).
      assert.equal(v.estado, "desconhecido");
    });

    await teste("C17–C20 worker ENCERRADO, processo novo sobe, a Q-016 reconstrói e o estado continua equivalente", async () => {
      const codigo = await assincrono!.fim();
      assert.equal(codigo, 0, `o assíncrono não encerrou graciosamente:\n${assincrono!.saida().slice(-400)}`);
      assincrono = subirAssincrono(b);
      assert.ok(await ate(assincrono, /\[assincrono\] replay \{/), `o novo assíncrono não subiu:\n${assincrono.saida()}`);
      const r = ultimaLinha<Replay>(assincrono, "[assincrono] replay ")!;
      assert.equal(r.estado, "completo");
      assert.equal(r.aplicados, 4);
      assert.deepEqual(
        r.escopos.map((e) => ({ unit_id: e.unit_id, source_mode: e.source_mode, fatos: e.fatos, viagens: e.viagens })),
        [{ unit_id: UNIDADE, source_mode: MODO, fatos: 4, viagens: 1 }],
      );
      // As mensagens já consumidas não voltam como fato novo.
      await esperar(600);
      const pend = (await b.cliente.query(`SELECT count(*)::int AS n FROM platform.outbox WHERE state <> 'done'`))[0].n;
      assert.equal(pend, 0);
      const projecaoDepois = await projecaoDoBanco(b, UNIDADE, MODO, AGORA_PROJ);
      assert.equal(mesmoEstadoLogico(projecaoAntes!, projecaoDepois), true, "a projeção reconstruída diverge da anterior");
      // E um terceiro boot dá o MESMO digest do segundo: a reconstrução é determinística.
      await assincrono.fim();
      assincrono = subirAssincrono(b);
      assert.ok(await ate(assincrono, /\[assincrono\] replay \{/));
      const r2 = ultimaLinha<Replay>(assincrono, "[assincrono] replay ")!;
      assert.equal(r2.escopos[0].digest, r.escopos[0].digest);
    });

    await teste("E1 token EXPIRADO na ingestão: 401 renovável, o cliente renova com o segredo (sem humano) e nada se perde", async () => {
      // Um token autêntico, já vencido — como um turno que virou a noite.
      const vencido = emitirToken({
        device_id: ap.deviceId, unit_id: UNIDADE, issued_by: "teste", agora: new Date(Date.now() - 13 * 3600_000), segredo: SEGREDO,
      }).token;
      ap.db.put(KEY_SESSION_TOKEN, vencido, Date.now());
      // Faz o cliente ACHAR que o token ainda vale, para o 401 vir do servidor.
      ap.db.put(KEY_TOKEN_EXPIRA_EM, String(Date.now() + 10 * 3600_000), Date.now());
      ap.capturar(VIAGEM, -23.5525, -46.6360, "2026-09-24T10:05:00.000Z");
      const antes = (await fatosDoAparelho(b, ap.deviceId)).length;
      assert.equal(await ap.sincronizar(), "retry");
      assert.equal(ap.db.pendingCount(), 1, "401 apagou o ponto");
      assert.equal(DeviceSession.sessaoAtual(ap.db), null, "o cliente não limpou a credencial recusada");
      assert.equal(await ap.sincronizar(), "success");
      assert.equal(ap.db.pendingCount(), 0);
      assert.equal((await fatosDoAparelho(b, ap.deviceId)).length, antes + 1);
      const nova = DeviceSession.sessaoAtual(ap.db)!;
      assert.notEqual(nova.token, vencido);
    });

    await teste("E2 A NÃO FALA COMO B: token de A com pontos de B é recusado ponto a ponto; token de B exige o segredo de B", async () => {
      const dirB = mkdtempSync(join(tmpdir(), "cadeia-aparelho-b-"));
      try {
        const apB = new AparelhoLogico({ diretorio: dirB, plataformaUrl: urlCritico });
        await autorizarAparelho(b, apB.deviceId, UNIDADE, `${MOTOBOY}-b`);
        // A tenta empurrar um ponto em nome de B, com o token de A.
        const tokenA = DeviceSession.sessaoAtual(ap.db)!.token;
        const r = await fetch(`${urlCritico}/api/gps/batch`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            correlation_id: "a-como-b",
            points: [{
              point_id: "p-x", idempotency_key: `gps:${apB.deviceId}:${VIAGEM}:2026-09-24T10:06:00.000Z`, trip_id: VIAGEM,
              device_id: apB.deviceId, latitude: -23.55, longitude: -46.63, accuracy_m: 5,
              occurred_at: "2026-09-24T10:06:00.000Z", sequence_local: 1, is_mock: false,
            }],
          }),
        });
        const corpo = (await r.json()) as { accepted?: number; rejected?: number; rejections?: { motivo: string }[] };
        assert.equal(r.status, 200);
        assert.equal(corpo.accepted, 0);
        assert.equal(corpo.rejected, 1);
        assert.match(corpo.rejections?.[0]?.motivo ?? "", /diverge do aparelho autenticado/);
        assert.equal((await fatosDoAparelho(b, apB.deviceId)).length, 0, "um fato de B nasceu do token de A");
        // A tenta obter o token de B com o SEGREDO DE A, antes de B fazer o primeiro contato.
        // (limite declarado: até B se apresentar, o vínculo é de quem chega primeiro)
        assert.equal(await apB.sincronizar(), "success", "B não conseguiu se apresentar");
        const pedidoDeA = await fetch(`${urlCritico}/api/device/session`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: apB.deviceId, device_secret: ap.db.get(KEY_DEVICE_SECRET) }),
        });
        assert.equal(pedidoDeA.status, 403);
        assert.equal(((await pedidoDeA.json()) as { motivo: string }).motivo, "segredo_divergente");
      } finally {
        rmSync(dirB, { recursive: true, force: true });
      }
    });

    await teste("R1 REVOGAÇÃO permanece efetiva: token vigente é recusado (403), renovação é recusada, o cliente para e os pontos FICAM", async () => {
      await revogarAparelho(b, ap.deviceId);
      ap.capturar(VIAGEM, -23.5530, -46.6365, "2026-09-24T10:07:00.000Z");
      const antes = (await fatosDoAparelho(b, ap.deviceId)).length;
      // Envio com o token ainda dentro da validade.
      const r1 = await ap.sincronizar();
      assert.equal((await fatosDoAparelho(b, ap.deviceId)).length, antes, "aparelho revogado gravou fato");
      const ponto = ap.db.todos().find((p) => p.occurredAt === "2026-09-24T10:07:00.000Z")!;
      assert.equal(ponto.syncState, "failed");
      assert.match(ponto.lastError ?? "", /revogado/);
      // Forçar renovação: o bootstrap com o segredo certo também é recusado, e o cliente se marca revogado.
      DeviceSession.limparCredencial(ap.db);
      const r2 = await ap.sincronizar();
      assert.equal(DeviceSession.estaRevogado(ap.db), true, `o cliente não registrou a revogação (${r1}, ${r2})`);
      assert.equal(await ap.sincronizar(), "success", "revogado precisa parar, não insistir");
      assert.equal(ap.db.pendingCount(), 1, "a revogação apagou o ponto");
      assert.equal((await fatosDoAparelho(b, ap.deviceId)).length, antes);
    });

    await teste("N1 CONTROLE: localização simulada (is_mock) num aparelho autorizado é recusada, e o aparelho fica sabendo", async () => {
      const dirC = mkdtempSync(join(tmpdir(), "cadeia-aparelho-c-"));
      try {
        const apC = new AparelhoLogico({ diretorio: dirC, plataformaUrl: urlCritico });
        await autorizarAparelho(b, apC.deviceId, UNIDADE, `${MOTOBOY}-c`);
        apC.capturar(VIAGEM, -23.55, -46.63, "2026-09-24T10:08:00.000Z", { mock: true });
        assert.equal(await apC.sincronizar(), "success");
        assert.equal((await fatosDoAparelho(b, apC.deviceId)).length, 0, "ponto simulado virou fato");
      } finally {
        rmSync(dirC, { recursive: true, force: true });
      }
    });

    await teste("N2 CONTROLE: o crítico nunca escreve o segredo do aparelho no log nem no banco em claro", async () => {
      const segredo = ap.db.get(KEY_DEVICE_SECRET)!;
      assert.equal(critico!.saida().includes(segredo), false, "o segredo do aparelho apareceu no log do crítico");
      const linha = await linhaDoAparelho(b, ap.deviceId);
      assert.equal(JSON.stringify(linha).includes(segredo), false, "o segredo está em claro no banco");
      const h = createHash("sha256").update(segredo).digest("hex");
      assert.equal(linha?.secret_hash, h);
    });
  } finally {
    if (assincrono) await assincrono.fim();
    if (critico) await critico.fim();
    await b.descartar();
    rmSync(dir, { recursive: true, force: true });
  }

  resumo();
}

function resumo(): void {
  console.log(`\n${passaram}/${passaram + falhas.length} provas da cadeia real`);
  if (falhas.length) {
    console.log("\nFALHAS:");
    for (const f of falhas) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nCADEIA_REAL_GREEN");
}

void main().catch((e) => {
  console.error("falha inesperada na suíte:", e);
  process.exit(1);
});
