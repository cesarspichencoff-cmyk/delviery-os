/**
 * X1 — um motoboy não grava posição na viagem de outro. Ataques à concessão.
 *
 * Exercita a rota de ingestão inteira (autenticação do aparelho, cadastro,
 * concessão, janela, gravação), com o mesmo token de aparelho que o crítico
 * emite. Cada caso tenta uma forma diferente de pôr ponto onde não devia.
 * Sintético: aparelhos, motoboys e viagens fabricados.
 */
import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { tratarLoteGps, type DepsDaRota } from "./runtime/rota-ingestao";
import type { DispositivoConhecido, PontoAndroid, RegistroDeDispositivos } from "./ingest/device-ingest";
import type { EscritorTransacional } from "./ingest/ingest-service";
import { emitirToken } from "./auth/device-token";
import {
  emitTripCaptureGrant, verifyTripCaptureGrant, loadTripGrantSecrets,
  TRIP_GRANT_MAX_VALIDITY_S, TRIP_GRANT_OPEN_WINDOW_S,
} from "../entregas/foundation/trip-capture-grant";
import { emitPlatformReadAssertion } from "../entregas/foundation/platform-read-assertion";
import { SEGREDO_DE_CONCESSAO_DE_TESTE, concessaoDeTeste, segredosDeConcessaoDeTeste } from "./concessao-de-teste";

const AGORA = new Date("2026-11-14T15:00:00.000Z");
const SEGREDO_APARELHO = "segredo-de-assinatura-de-aparelho-sintetico-0123456789";
const cadastro = new Map<string, DispositivoConhecido>([
  ["dev-a", { device_id: "dev-a", unit_id: "ITAIM", actor_id: "rid-a" }],
  ["dev-b", { device_id: "dev-b", unit_id: "ITAIM", actor_id: "rid-b" }],
  // Segundo aparelho do MESMO motoboy (troca de celular).
  ["dev-a2", { device_id: "dev-a2", unit_id: "ITAIM", actor_id: "rid-a" }],
  ["dev-rev", { device_id: "dev-rev", unit_id: "ITAIM", actor_id: "rid-a", revoked_at: "2026-11-14T14:00:00.000Z" }],
]);
const REGISTRO: RegistroDeDispositivos = { buscar: async (id) => cadastro.get(id) ?? null };

let gravados: string[] = [];
// Escritor em memória com a interface real: grava o que a ingestão manda gravar.
const ESCRITOR: EscritorTransacional = {
  async commit(fatos) {
    for (const f of fatos as unknown as Array<{ envelope?: Record<string, unknown> } & Record<string, unknown>>) {
      const e = (f.envelope ?? f) as Record<string, unknown>;
      gravados.push(`${e.object_id ?? e.trip_id}|${e.device_id}|${e.idempotency_key}`);
    }
    return { ok: true, facts: fatos.length, messages: 0 };
  },
};

function deps(over: Partial<DepsDaRota> = {}): DepsDaRota {
  return { segredo: SEGREDO_APARELHO, registro: REGISTRO, escritor: ESCRITOR, agora: () => AGORA,
    source_mode: "simulated", segredos_de_concessao: segredosDeConcessaoDeTeste(), ...over };
}
const token = (device_id: string, actor_id: string) =>
  emitirToken({ device_id, unit_id: "ITAIM", actor_id, issued_by: "gerente", agora: AGORA, segredo: SEGREDO_APARELHO }).token;
let seq = 0;
const ponto = (device_id: string, trip_id: string, quando = new Date(AGORA.getTime() - 60_000)): PontoAndroid => {
  seq += 1;
  return { point_id: "p" + seq, idempotency_key: `gps:${device_id}:${trip_id}:${seq}`, trip_id, device_id,
    latitude: -23.58, longitude: -46.67, accuracy_m: 8, occurred_at: quando.toISOString(), sequence_local: seq,
    provider: "fused", is_mock: false } as PontoAndroid;
};
async function enviar(device: string, actor: string, pontos: PontoAndroid[], grants: unknown[], d = deps()) {
  gravados = [];
  const r = await tratarLoteGps({ authorization: "Bearer " + token(device, actor) }, { points: pontos, trip_grants: grants }, d);
  return { status: r.status, corpo: r.corpo as Record<string, any>, gravados: [...gravados] };
}
const gA = (over: Partial<Parameters<typeof concessaoDeTeste>[0]> = {}) =>
  concessaoDeTeste({ actor_id: "rid-a", device_id: "dev-a", trip_id: "trip-a", agora: AGORA, ...over });
const gB = (over: Partial<Parameters<typeof concessaoDeTeste>[0]> = {}) =>
  concessaoDeTeste({ actor_id: "rid-b", device_id: "dev-b", trip_id: "trip-b", agora: AGORA, ...over });
const motivos = (r: { corpo: Record<string, any> }) => JSON.stringify(r.corpo);

let ok = 0;
const casos: Array<[string, () => Promise<void> | void]> = [];
const caso = (n: string, f: () => Promise<void> | void) => casos.push([n, f]);

caso("controle: A, com a concessão da viagem dele, grava", async () => {
  const r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-a")], [gA()]);
  assert.equal(r.status, 200);
  assert.equal(r.gravados.length, 1);
});

caso("X1: A, com o token de A, manda a trip_id de B sem concessão — recusado, nada gravado", async () => {
  const r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-b")], [gA()]);
  assert.equal(r.gravados.length, 0);
  assert.match(motivos(r), /viagem_sem_concessao/);
});

caso("X1: A anexa a concessão VERDADEIRA de B (vazada) — não vale para o aparelho de A", async () => {
  const r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-b")], [gB()]);
  assert.equal(r.gravados.length, 0);
  assert.match(motivos(r), /viagem_sem_concessao/);
});

caso("concessão emitida para o aparelho de A mas para o motoboy B não vale", async () => {
  const g = concessaoDeTeste({ actor_id: "rid-b", device_id: "dev-a", trip_id: "trip-b", agora: AGORA });
  const r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-b")], [g]);
  assert.equal(r.gravados.length, 0);
});

caso("troca de celular: a concessão emitida para o aparelho antigo não vale no novo, nem o contrário", async () => {
  const doAntigo = gA();
  let r = await enviar("dev-a2", "rid-a", [ponto("dev-a2", "trip-a")], [doAntigo]);
  assert.equal(r.gravados.length, 0, "a concessão do aparelho antigo valeu no novo");
  const doNovo = concessaoDeTeste({ actor_id: "rid-a", device_id: "dev-a2", trip_id: "trip-a", agora: AGORA });
  r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-a")], [doNovo]);
  assert.equal(r.gravados.length, 0, "a concessão do aparelho novo valeu no antigo");
});

caso("cada unidade confere com o PRÓPRIO segredo: concessão assinada com o segredo de outra unidade não vale", () => {
  const segredos = new Map([["ITAIM", "i".repeat(40)], ["OUTRA", "o".repeat(40)]]);
  const comSegredoErrado = emitTripCaptureGrant({ unit_id: "OUTRA", actor_id: "rid-a", device_id: "dev-a", trip_id: "trip-a",
    started_at: new Date(AGORA.getTime() - 3600_000), closed_at: null, now: AGORA, secret: "i".repeat(40) });
  assert.equal(verifyTripCaptureGrant(comSegredoErrado, segredos, AGORA).ok, false);
  const certo = emitTripCaptureGrant({ unit_id: "OUTRA", actor_id: "rid-a", device_id: "dev-a", trip_id: "trip-a",
    started_at: new Date(AGORA.getTime() - 3600_000), closed_at: null, now: AGORA, secret: "o".repeat(40) });
  assert.equal(verifyTripCaptureGrant(certo, segredos, AGORA).ok, true);
});

caso("concessão forjada com outro segredo é ignorada", async () => {
  const g = emitTripCaptureGrant({ unit_id: "ITAIM", actor_id: "rid-a", device_id: "dev-a", trip_id: "trip-b",
    started_at: new Date(AGORA.getTime() - 3600_000), closed_at: null, now: AGORA, secret: "x".repeat(40) });
  const r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-b")], [g]);
  assert.equal(r.gravados.length, 0);
});

caso("concessão de A com a trip_id trocada no corpo (assinatura antiga) é ignorada", async () => {
  const [p, body, sig] = gA().split(".");
  const c = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  c.trip_id = "trip-b";
  const novo = Buffer.from(JSON.stringify(c)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-b")], [`${p}.${novo}.${sig}`]);
  assert.equal(r.gravados.length, 0);
});

caso("asserção de leitura do despacho apresentada como concessão não vale (propósito separado)", async () => {
  const leitura = emitPlatformReadAssertion({ unit_id: "ITAIM", actor_id: "rid-a", role: "motoboy_interno",
    trip_id: "trip-b", scope: "location", now: AGORA, secret: SEGREDO_DE_CONCESSAO_DE_TESTE });
  const r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-b")], [leitura, "tg1." + leitura]);
  assert.equal(r.gravados.length, 0);
});

caso("MAC calculado SEM o propósito (mesmo segredo) não vale", async () => {
  const [p, body] = gA({ trip_id: "trip-b" }).split(".");
  const semProposito = createHmac("sha256", SEGREDO_DE_CONCESSAO_DE_TESTE).update(body).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(verifyTripCaptureGrant(`${p}.${body}.${semProposito}`, segredosDeConcessaoDeTeste(), AGORA).ok, false);
});

caso("concessão expirada não vale; dentro da validade, sobe fila offline de dias atrás", async () => {
  const antiga = new Date(AGORA.getTime() - (TRIP_GRANT_MAX_VALIDITY_S + 60) * 1000);
  const g = concessaoDeTeste({ actor_id: "rid-a", device_id: "dev-a", trip_id: "trip-a", agora: antiga,
    inicio: new Date(antiga.getTime() - 3600_000), fim: new Date(antiga.getTime() - 60_000) });
  let r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-a", new Date(antiga.getTime() - 120_000))], [g]);
  assert.equal(r.gravados.length, 0, "concessão vencida ainda gravou");
  const ontem = new Date(AGORA.getTime() - 24 * 3600_000);
  const g2 = concessaoDeTeste({ actor_id: "rid-a", device_id: "dev-a", trip_id: "trip-a", agora: ontem,
    inicio: new Date(ontem.getTime() - 3600_000), fim: ontem });
  r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-a", new Date(ontem.getTime() - 600_000))], [g2]);
  assert.equal(r.gravados.length, 1, "ponto offline de viagem já encerrada, dentro da janela, não subiu");
});

caso("viagem encerrada: ponto captado durante a viagem entra, ponto novo depois do fim não", async () => {
  const fim = new Date(AGORA.getTime() - 30 * 60_000);
  const g = gA({ inicio: new Date(fim.getTime() - 40 * 60_000), fim });
  const durante = ponto("dev-a", "trip-a", new Date(fim.getTime() - 5 * 60_000));
  const depois = ponto("dev-a", "trip-a", new Date(fim.getTime() + 10 * 60_000));
  const r = await enviar("dev-a", "rid-a", [durante, depois], [g]);
  assert.deepEqual(r.gravados.map((x) => x.split("|")[2]), [durante.idempotency_key]);
  assert.match(motivos(r), /fora_da_janela_da_viagem/);
});

caso("ponto com horário de antes da saída: entra só se chegar durante a viagem (relógio atrasado); depois do fim, não", async () => {
  const inicio = new Date(AGORA.getTime() - 10 * 60_000);
  const antes = new Date(inicio.getTime() - 15 * 60_000);
  let r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-a", antes)], [gA({ inicio })]);
  assert.equal(r.gravados.length, 1, "relógio atrasado durante a viagem aberta foi recusado (política de relógio)");
  const fim = new Date(AGORA.getTime() - 5 * 60_000);
  r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-a", antes)], [gA({ inicio, fim })]);
  assert.equal(r.gravados.length, 0, "ponto de antes da saída entrou depois do fim da viagem");
});

caso("relógio adiantado: entra enquanto a viagem está aberta (o crítico carimba a confiança à parte); depois que a janela fecha, não", async () => {
  const futuro = new Date(AGORA.getTime() + 24 * 3600_000);
  let r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-a", futuro)], [gA()]);
  assert.equal(r.gravados.length, 1, "a política de relógio foi quebrada: ponto adiantado recusado com a viagem aberta");
  const velha = concessaoDeTeste({ actor_id: "rid-a", device_id: "dev-a", trip_id: "trip-a",
    agora: new Date(AGORA.getTime() - (TRIP_GRANT_OPEN_WINDOW_S + 600) * 1000) });
  r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-a", futuro)], [velha]);
  assert.equal(r.gravados.length, 0, "concessão de viagem aberta não renovada continuou aceitando ponto novo");
});

caso("aparelho revogado: nada entra, nem com concessão válida", async () => {
  const g = concessaoDeTeste({ actor_id: "rid-a", device_id: "dev-rev", trip_id: "trip-a", agora: AGORA });
  const r = await enviar("dev-rev", "rid-a", [ponto("dev-rev", "trip-a")], [g]);
  assert.notEqual(r.status, 200);
  assert.equal(r.gravados.length, 0);
});

caso("troca de motoboy no aparelho: a concessão do motoboy anterior deixa de valer", async () => {
  const g = gA();
  cadastro.set("dev-a", { device_id: "dev-a", unit_id: "ITAIM", actor_id: "rid-c" });
  try {
    const r = await enviar("dev-a", "rid-c", [ponto("dev-a", "trip-a")], [g]);
    assert.equal(r.gravados.length, 0, "a concessão do motoboy anterior continuou valendo");
  } finally { cadastro.set("dev-a", { device_id: "dev-a", unit_id: "ITAIM", actor_id: "rid-a" }); }
});

caso("aparelho sem motoboy vinculado não recebe concessão nenhuma", async () => {
  cadastro.set("dev-x", { device_id: "dev-x", unit_id: "ITAIM" });
  const g = concessaoDeTeste({ actor_id: "rid-a", device_id: "dev-x", trip_id: "trip-a", agora: AGORA });
  const r = await enviar("dev-x", "rid-a", [ponto("dev-x", "trip-a")], [g]);
  assert.equal(r.gravados.length, 0);
});

caso("concessão de outra unidade não vale, nem com segredo dela configurado", async () => {
  const d = deps({ segredos_de_concessao: segredosDeConcessaoDeTeste("ITAIM", "OUTRA") });
  const g = concessaoDeTeste({ unit_id: "OUTRA", actor_id: "rid-a", device_id: "dev-a", trip_id: "trip-a", agora: AGORA });
  const r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-a")], [g], d);
  assert.equal(r.gravados.length, 0);
});

caso("sem segredo de concessão configurado a ingestão fica fechada, retentável, e nada é gravado", async () => {
  const r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-a")], [gA()], deps({ segredos_de_concessao: new Map() }));
  assert.equal(r.status, 503);
  assert.equal(r.corpo.retentavel, true);
  assert.equal(r.corpo.preservar_dados_locais, true);
  assert.equal(r.gravados.length, 0);
});

caso("lote misto: só os pontos da viagem concedida entram, e o recibo não passa do primeiro recusado", async () => {
  const p1 = ponto("dev-a", "trip-a"), p2 = ponto("dev-a", "trip-b"), p3 = ponto("dev-a", "trip-a");
  const r = await enviar("dev-a", "rid-a", [p1, p2, p3], [gA(), gB()]);
  assert.deepEqual(r.gravados.map((x) => x.split("|")[2]), [p1.idempotency_key, p3.idempotency_key]);
  assert.equal(r.corpo.ack_through_sequence, p1.sequence_local, "o recibo deixaria o aparelho apagar o ponto recusado");
});

caso("dois motoboys ao mesmo tempo, concessões trocadas entre si: cada um só grava a própria viagem", async () => {
  const [ra, rb] = await Promise.all([
    enviar("dev-a", "rid-a", [ponto("dev-a", "trip-a"), ponto("dev-a", "trip-b")], [gA(), gB()]),
    enviar("dev-b", "rid-b", [ponto("dev-b", "trip-b"), ponto("dev-b", "trip-a")], [gA(), gB()]),
  ]);
  for (const linha of [...ra.gravados, ...rb.gravados]) {
    const [trip, dev] = linha.split("|");
    assert.equal(trip, dev === "dev-a" ? "trip-a" : "trip-b", "ponto gravado na viagem do outro: " + linha);
  }
});

caso("concessões em excesso, gigantes ou de tipo errado não derrubam o lote nem concedem nada", async () => {
  const lixo = [123, null, {}, "tg1.x.y", "tg1." + "A".repeat(5000) + ".b", ...Array.from({ length: 40 }, () => gB())];
  const r = await enviar("dev-a", "rid-a", [ponto("dev-a", "trip-b")], lixo);
  assert.equal(r.status, 200);
  assert.equal(r.gravados.length, 0);
});

caso("configuração do crítico: vazia desliga, inválida recusa, curta e placeholder recusam", () => {
  assert.equal(loadTripGrantSecrets(undefined, "X").size, 0);
  for (const raw of ["{", "[]", "{}", '{"ITAIM":"curto"}', '{"ITAIM":"CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME"}', '{" ":"' + "z".repeat(40) + '"}'])
    assert.throws(() => loadTripGrantSecrets(raw, "X"), Error, raw);
  assert.equal(loadTripGrantSecrets(JSON.stringify({ ITAIM: "z".repeat(40) }), "X").size, 1);
});

(async () => {
  for (const [n, f] of casos) {
    try { await f(); ok += 1; console.log("PASS " + n); }
    catch (e) { console.error("FAIL " + n + "\n     " + String((e as Error).message).split("\n")[0]); process.exitCode = 1; }
  }
  console.log(process.exitCode ? `X1_TRIP_GRANT_FAIL ${ok}/${casos.length}` : `X1_TRIP_GRANT_PASS ${ok}/${casos.length} SYNTHETIC_ONLY`);
})();
