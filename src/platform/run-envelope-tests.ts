/**
 * Envelopes de campo — Android e Store Agent.
 *
 * As fixtures são SINTÉTICAS e rotuladas como tal. Nada aqui vem do iFood, de
 * conta real ou de aparelho real: o que se prova é o contrato de transporte —
 * quem pode falar, o que é recusado, e como o cliente sabe que pode limpar a
 * fila local.
 */

import assert from "node:assert/strict";
import {
  DEVICE_ENVELOPE_VERSION,
  SOURCE_ENVELOPE_VERSION,
  agentHealth,
  checkEnvelope,
  compareVersions,
  type AgentHeartbeat,
  type DeviceEnvelope,
  type DeviceRegistry,
  type SourceEventEnvelope,
} from "./contracts/device-envelope";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log("=== Envelopes de campo (fixtures sintéticas) ===");

/* ------------------------------------------------------------------ *
 * Cadastro sintético
 * ------------------------------------------------------------------ */

const CADASTRO: DeviceRegistry = {
  isKnown: (id) => ["dev-itaim-01", "dev-itaim-02", "dev-perdido"].includes(id),
  isRevoked: (id) => id === "dev-perdido",
  unitOf: (id) => (id === "dev-itaim-02" ? "MOEMA" : "ITAIM"),
};

function envelope<T>(extra: Partial<DeviceEnvelope<T>> = {}, payload = {} as T): DeviceEnvelope<T> {
  return {
    envelope_version: DEVICE_ENVELOPE_VERSION,
    device: {
      device_id: "dev-itaim-01",
      unit_id: "ITAIM",
      actor_id: "rid-sintetico-1",
      app_version: "1.2.0",
      envelope_version: DEVICE_ENVELOPE_VERSION,
    },
    sequence_local: 7,
    idempotency_key: "gps:dev-itaim-01:t-1:0007",
    correlation_id: "corr-sintetico",
    occurred_at: "2026-07-26T18:00:00.000Z",
    replay: false,
    trip_id: "t-1",
    payload,
    ...extra,
  };
}

/* ------------------------------------------------------------------ *
 * Aceitação
 * ------------------------------------------------------------------ */

test("envelope bem formado de aparelho cadastrado é aceito", () => {
  const r = checkEnvelope(envelope(), CADASTRO);
  assert.equal(r.ok, true);
});

test("reenvio explícito continua válido — replay não é motivo de recusa", () => {
  // O aparelho reenvia o que já mandou quando não teve recibo. Recusar aqui
  // faria a rede instável virar perda de dado.
  const r = checkEnvelope(envelope({ replay: true }), CADASTRO);
  assert.equal(r.ok, true);
});

test("sequência zero é válida — é o primeiro evento do aparelho", () => {
  assert.equal(checkEnvelope(envelope({ sequence_local: 0 }), CADASTRO).ok, true);
});

/* ------------------------------------------------------------------ *
 * Recusas, na ordem que importa
 * ------------------------------------------------------------------ */

test("aparelho desconhecido é recusado", () => {
  const r = checkEnvelope(
    envelope({ device: { ...envelope().device, device_id: "dev-nao-existe" } }),
    CADASTRO,
  );
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "unknown_device");
});

test("aparelho revogado é recusado ANTES de qualquer análise de conteúdo", () => {
  // Envelope propositalmente quebrado em tudo o mais: chave vazia, versão
  // velha, unidade errada. A resposta ainda tem que ser "revogado" — é assim
  // que um aparelho perdido sai do ar sem receber dica de como voltar.
  const r = checkEnvelope(
    envelope({
      device: {
        device_id: "dev-perdido",
        unit_id: "OUTRA",
        actor_id: "x",
        app_version: "0.0.1",
        envelope_version: "device-envelope@9.0.0",
      },
      idempotency_key: "",
      sequence_local: -5,
    }),
    CADASTRO,
  );
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "revoked_device");
});

test("unidade divergente do cadastro é recusada", () => {
  // O aparelho diz ITAIM; o cadastro diz MOEMA. Aceitar misturaria a operação
  // de duas lojas na mesma linha do tempo.
  const r = checkEnvelope(
    envelope({ device: { ...envelope().device, device_id: "dev-itaim-02", unit_id: "ITAIM" } }),
    CADASTRO,
  );
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "unit_mismatch");
});

test("versão de app abaixo da mínima é recusada com o número na mensagem", () => {
  const r = checkEnvelope(
    envelope({ device: { ...envelope().device, app_version: "0.9.9" } }),
    CADASTRO,
  );
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "app_too_old");
  assert.match(r.ok === false ? r.detail : "", /0\.9\.9/);
});

test("major diferente de envelope é incompatível", () => {
  const r = checkEnvelope(envelope({ envelope_version: "device-envelope@2.0.0" }), CADASTRO);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "envelope_unsupported");
});

test("minor maior do MESMO major é aceito — evolução aditiva não quebra cliente", () => {
  // O servidor pode ter conhecido campos novos; o aparelho antigo não sabe
  // deles e continua funcionando. É o que torna atualização gradual possível.
  const r = checkEnvelope(envelope({ envelope_version: "device-envelope@1.9.0" }), CADASTRO);
  assert.equal(r.ok, true);
});

test("chave de idempotência ausente é recusada", () => {
  const r = checkEnvelope(envelope({ idempotency_key: "   " }), CADASTRO);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "malformed");
});

test("sequência negativa ou fracionária é recusada", () => {
  for (const s of [-1, 1.5, Number.NaN]) {
    const r = checkEnvelope(envelope({ sequence_local: s }), CADASTRO);
    assert.equal(r.ok, false, `sequence_local ${s} deveria ser recusada`);
  }
});

test("occurred_at inválido é recusado", () => {
  const r = checkEnvelope(envelope({ occurred_at: "ontem à noite" }), CADASTRO);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.rejection, "malformed");
});

/* ------------------------------------------------------------------ *
 * Comparação de versões
 * ------------------------------------------------------------------ */

test("comparação de versões respeita a ordem numérica, não a alfabética", () => {
  // "1.10.0" < "1.9.0" em comparação de texto. É o clássico que trava um
  // parque inteiro de aparelhos no dia em que a minor passa de 9.
  assert.equal(compareVersions("1.10.0", "1.9.0"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
});

test("sufixo de build é ignorado na comparação", () => {
  assert.equal(compareVersions("1.2.0-debug", "1.2.0"), 0);
});

/* ------------------------------------------------------------------ *
 * Store Agent — fixtures sintéticas
 * ------------------------------------------------------------------ */

function fixtureAgente(): SourceEventEnvelope<{ ref: string }> {
  return {
    envelope_version: SOURCE_ENVELOPE_VERSION,
    agent: {
      agent_id: "agente-sintetico-1",
      unit_id: "ITAIM",
      source: "fonte-sintetica",
      agent_version: "0.1.0",
      envelope_version: SOURCE_ENVELOPE_VERSION,
    },
    sequence_local: 3,
    cursor: "cursor-sintetico-003",
    idempotency_key: "fonte-sintetica:ITAIM:003",
    observed_at: "2026-07-26T18:00:05.000Z",
    occurred_at: "2026-07-26T17:59:40.000Z",
    replay: false,
    evidence_hash: "sha256:sintetico",
    payload: { ref: "referencia-sintetica" },
  };
}

test("o envelope do agente separa quando ACONTECEU de quando foi OBSERVADO", () => {
  const e = fixtureAgente();
  assert.notEqual(e.occurred_at, e.observed_at);
  assert.ok(
    Date.parse(e.observed_at) > Date.parse(e.occurred_at as string),
    "observar depois de acontecer é a ordem natural; fundir os dois faz atraso de coleta virar atraso de operação",
  );
});

test("occurred_at pode faltar sem invalidar a observação", () => {
  // Nem toda origem informa quando aconteceu. Inventar um carimbo ali seria
  // criar dado falso; ausência é resposta honesta.
  const e = { ...fixtureAgente(), occurred_at: undefined };
  assert.equal(e.occurred_at, undefined);
  assert.ok(e.observed_at);
});

test("o cursor permite retomar de onde parou", () => {
  assert.equal(fixtureAgente().cursor, "cursor-sintetico-003");
});

test("a fixture do agente não carrega dado real nem credencial", () => {
  const texto = JSON.stringify(fixtureAgente()).toLowerCase();
  for (const proibido of ["ifood", "token", "cookie", "senha", "password", "authorization"]) {
    assert.ok(!texto.includes(proibido), `fixture contém termo proibido: ${proibido}`);
  }
  assert.match(texto, /sintetic/, "a fixture precisa se declarar sintética");
});

/* ------------------------------------------------------------------ *
 * Saúde do agente pelo heartbeat
 * ------------------------------------------------------------------ */

const AGORA = new Date("2026-07-26T18:00:00.000Z");
function batida(extra: Partial<AgentHeartbeat> = {}): AgentHeartbeat {
  return {
    agent_id: "agente-sintetico-1",
    unit_id: "ITAIM",
    at: AGORA.toISOString(),
    pending_local: 3,
    healthy: true,
    ...extra,
  };
}

test("agente que nunca reportou é indisponível, e não saudável", () => {
  const r = agentHealth(undefined, AGORA);
  assert.equal(r.state, "unavailable");
  assert.match(r.detail, /nunca reportou/);
});

test("silêncio prolongado vira indisponível — ausência é estado, não falta de informação", () => {
  const antiga = batida({ at: "2026-07-26T17:50:00.000Z" }); // 10 min atrás
  const r = agentHealth(antiga, AGORA, 300);
  assert.equal(r.state, "unavailable");
  assert.match(r.detail, /sem sinal/);
});

test("agente que se declara com problema degrada e explica", () => {
  const r = agentHealth(batida({ healthy: false, detail: "origem recusou leitura" }), AGORA);
  assert.equal(r.state, "degraded");
  assert.equal(r.detail, "origem recusou leitura");
});

test("represamento alto degrada mesmo com o agente se dizendo bem", () => {
  // O agente responde e se acha saudável, mas nada sai dele. Confiar só no
  // autodiagnóstico esconderia exatamente esse caso.
  const r = agentHealth(batida({ pending_local: 900 }), AGORA);
  assert.equal(r.state, "degraded");
  assert.match(r.detail, /900/);
});

test("agente em dia é saudável", () => {
  assert.equal(agentHealth(batida(), AGORA).state, "healthy");
});

if (failures.length) {
  console.error(`\n=== ${failures.length} FALHA(S) ===`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`\n=== ${passed} envelope tests OK ===`);
