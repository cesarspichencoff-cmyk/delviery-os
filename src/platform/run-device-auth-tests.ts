/**
 * Autenticação de dispositivo — emissão, verificação e decisão.
 *
 * O defeito que estes testes existem para impedir é o P0 reproduzido: o Android
 * tratava todo 4xx como rejeição definitiva, então um 401 marcava o lote como
 * `failed` para sempre e o worker ainda retornava sucesso. Aqui o que se prova
 * é a TAXONOMIA: cada recusa diz se vale renovar, se é terminal, e que os dados
 * locais nunca devem ser apagados.
 */

import assert from "node:assert/strict";
import {
  emitirToken,
  verificarToken,
  precisaRenovar,
  lerSegredo,
  limparSegredos,
  paraLog,
  SegredoAusente,
  TAMANHO_MINIMO_SEGREDO,
  VALIDADE_PADRAO_S,
} from "./auth/device-token";
import {
  autenticarDispositivo,
  extrairBearer,
  corpoDeRecusa,
  instrucaoPara,
} from "./auth/device-auth";
import type { DispositivoConhecido, RegistroDeDispositivos } from "./ingest/device-ingest";

let passed = 0;
const failures: string[] = [];
const pendentes: Promise<void>[] = [];

function test(nome: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
function testeAsync(nome: string, fn: () => Promise<void>): void {
  pendentes.push(
    fn().then(
      () => {
        passed += 1;
      },
      (e: unknown) => {
        failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
      },
    ),
  );
}

const SEGREDO = "s".repeat(40);
const AGORA = new Date("2026-07-27T12:00:00.000Z");

const APARELHO: DispositivoConhecido = {
  device_id: "dev-1",
  unit_id: "ITAIM",
  actor_id: "rid-1",
};

const REGISTRO: RegistroDeDispositivos = {
  buscar: async (id) => {
    if (id === "dev-1") return APARELHO;
    if (id === "dev-revogado") {
      return { device_id: "dev-revogado", unit_id: "ITAIM", revoked_at: "2026-07-01T00:00:00Z" };
    }
    if (id === "dev-mudou") return { device_id: "dev-mudou", unit_id: "MOEMA" };
    return null;
  },
};

function token(extra: Partial<Parameters<typeof emitirToken>[0]> = {}): string {
  return emitirToken({
    device_id: "dev-1",
    unit_id: "ITAIM",
    issued_by: "gerente-1",
    actor_id: "rid-1",
    agora: AGORA,
    segredo: SEGREDO,
    ...extra,
  }).token;
}

console.log("=== Autenticação de dispositivo ===");

/* ------------------------------------------------------------------ *
 * Segredo
 * ------------------------------------------------------------------ */

test("sem segredo, nada é emitido nem verificado — falha fechada", () => {
  // Gerar segredo aleatório no boot pareceria funcionar e invalidaria todos os
  // tokens a cada reinício, derrubando o campo sem ninguém entender.
  assert.throws(() => lerSegredo({} as NodeJS.ProcessEnv), SegredoAusente);
  assert.throws(
    () => lerSegredo({ DELIVERYOS_DEVICE_TOKEN_SECRET: "   " } as NodeJS.ProcessEnv),
    SegredoAusente,
  );
});

test("segredo curto é recusado — curto demais parece existir e não protege", () => {
  assert.throws(
    () =>
      lerSegredo({
        DELIVERYOS_DEVICE_TOKEN_SECRET: "x".repeat(TAMANHO_MINIMO_SEGREDO - 1),
      } as NodeJS.ProcessEnv),
    SegredoAusente,
  );
  assert.equal(
    lerSegredo({ DELIVERYOS_DEVICE_TOKEN_SECRET: SEGREDO } as NodeJS.ProcessEnv),
    SEGREDO,
  );
});

/* ------------------------------------------------------------------ *
 * Emissão e verificação
 * ------------------------------------------------------------------ */

test("um token emitido é verificado e devolve as claims", () => {
  const v = verificarToken(token(), SEGREDO, AGORA);
  assert.equal(v.ok, true);
  assert.equal(v.ok === true && v.claims.device_id, "dev-1");
  assert.equal(v.ok === true && v.claims.unit_id, "ITAIM");
  assert.equal(v.ok === true && v.claims.issued_by, "gerente-1");
});

test("emissão exige aparelho, unidade e quem autorizou", () => {
  for (const falta of [{ device_id: "" }, { unit_id: "" }, { issued_by: "" }]) {
    assert.throws(() => token(falta));
  }
});

test("assinatura de outro segredo é recusada", () => {
  const v = verificarToken(token(), "o".repeat(40), AGORA);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.recusa, "assinatura_invalida");
});

test("corpo alterado invalida a assinatura", () => {
  // O ataque óbvio: trocar o device_id e reaproveitar a assinatura.
  const t = token();
  const [corpo, assinatura] = t.split(".");
  const claims = JSON.parse(
    Buffer.from(corpo.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
  ) as Record<string, unknown>;
  claims.device_id = "dev-outro";
  const forjado =
    Buffer.from(JSON.stringify(claims), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "") + `.${assinatura}`;
  const v = verificarToken(forjado, SEGREDO, AGORA);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.recusa, "assinatura_invalida");
});

test("token ausente e malformado são recusas distintas", () => {
  assert.equal(verificarToken(null, SEGREDO, AGORA).ok, false);
  const a = verificarToken("", SEGREDO, AGORA);
  assert.equal(a.ok === false && a.recusa, "ausente");
  const b = verificarToken("sem-ponto", SEGREDO, AGORA);
  assert.equal(b.ok === false && b.recusa, "malformado");
});

test("token expirado é recusado COMO expirado, não como inválido", () => {
  // A distinção é o que permite ao aparelho saber que vale renovar.
  const t = token({ validade_s: 60 });
  const depois = new Date(AGORA.getTime() + 61_000);
  const v = verificarToken(t, SEGREDO, depois);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.recusa, "expirado");
});

test("a validade padrão cobre um turno inteiro", () => {
  assert.ok(VALIDADE_PADRAO_S >= 8 * 3600, "validade curta demais para um turno");
});

test("renovação acontece ANTES de expirar", () => {
  // Esperar expirar deixa o aparelho sem credencial no meio da rua.
  const { claims } = emitirToken({
    device_id: "dev-1",
    unit_id: "ITAIM",
    issued_by: "g",
    agora: AGORA,
    segredo: SEGREDO,
  });
  assert.equal(precisaRenovar(claims, AGORA), false);
  const quaseLa = new Date((claims.exp - 30 * 60) * 1000);
  assert.equal(precisaRenovar(claims, quaseLa), true, "não avisou com folga");
});

/* ------------------------------------------------------------------ *
 * Decisão: token + registro
 * ------------------------------------------------------------------ */

async function autenticar(authorization: string | null, unidade?: string) {
  return autenticarDispositivo({
    authorization,
    segredo: SEGREDO,
    registro: REGISTRO,
    agora: AGORA,
    unidade_esperada: unidade,
  });
}

testeAsync("aparelho autorizado com token válido passa", async () => {
  const r = await autenticar(`Bearer ${token()}`);
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.dispositivo.device_id, "dev-1");
});

testeAsync("o header aceita `Bearer <token>` e o token puro", async () => {
  assert.equal(extrairBearer("Bearer abc"), "abc");
  assert.equal(extrairBearer("bearer  abc "), "abc");
  assert.equal(extrairBearer("abc"), "abc");
  assert.equal(extrairBearer(null), null);
  assert.equal((await autenticar(token())).ok, true);
});

testeAsync("credencial ausente é 401 e RENOVÁVEL — nunca perda de dado", async () => {
  const r = await autenticar(null);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.status, 401);
  assert.equal(r.ok === false && r.renovavel, true);
  assert.equal(r.ok === false && r.terminal, false);
});

testeAsync("credencial expirada é 401 e renovável", async () => {
  const t = emitirToken({
    device_id: "dev-1",
    unit_id: "ITAIM",
    issued_by: "g",
    agora: new Date(AGORA.getTime() - 3600_000),
    validade_s: 60,
    segredo: SEGREDO,
  }).token;
  const r = await autenticar(`Bearer ${t}`);
  assert.equal(r.ok === false && r.motivo, "credencial_expirada");
  assert.equal(r.ok === false && r.renovavel, true);
});

testeAsync("aparelho REVOGADO é 403, terminal, e NÃO renovável", async () => {
  const t = token({ device_id: "dev-revogado" });
  const r = await autenticar(`Bearer ${t}`);
  assert.equal(r.ok === false && r.motivo, "dispositivo_revogado");
  assert.equal(r.ok === false && r.status, 403);
  assert.equal(r.ok === false && r.terminal, true);
  assert.equal(r.ok === false && r.renovavel, false);
});

testeAsync("token válido de aparelho fora do cadastro é terminal", async () => {
  const t = token({ device_id: "dev-fantasma" });
  const r = await autenticar(`Bearer ${t}`);
  assert.equal(r.ok === false && r.motivo, "dispositivo_desconhecido");
  assert.equal(r.ok === false && r.terminal, true);
});

testeAsync("o servidor recusa token de unidade errada", async () => {
  const r = await autenticar(`Bearer ${token()}`, "MOEMA");
  assert.equal(r.ok === false && r.motivo, "unidade_divergente");
  assert.equal(r.ok === false && r.status, 403);
});

testeAsync("cadastro que mudou de unidade torna o token renovável, não terminal", async () => {
  // O aparelho mudou de loja; o token ficou velho. Autenticar de novo resolve,
  // e o aparelho não perde nada esperando.
  const t = token({ device_id: "dev-mudou", unit_id: "ITAIM" });
  const r = await autenticar(`Bearer ${t}`);
  assert.equal(r.ok === false && r.motivo, "unidade_divergente");
  assert.equal(r.ok === false && r.renovavel, true);
  assert.equal(r.ok === false && r.terminal, false);
});

testeAsync("a autenticação é idempotente: mesma entrada, mesma decisão", async () => {
  const t = `Bearer ${token()}`;
  const primeira = await autenticar(t);
  for (let i = 0; i < 20; i += 1) {
    const r = await autenticar(t);
    assert.deepEqual(r, primeira, `divergiu na iteração ${i}`);
  }
});

/* ------------------------------------------------------------------ *
 * O contrato com o cliente
 * ------------------------------------------------------------------ */

testeAsync("TODA recusa manda preservar os dados locais", async () => {
  // É o coração da correção do P0: nenhuma falha de autenticação autoriza o
  // aparelho a apagar um ponto de GPS. O dado do campo é insubstituível.
  const casos = [null, "Bearer lixo", `Bearer ${token({ device_id: "dev-revogado" })}`];
  for (const c of casos) {
    const r = await autenticar(c);
    assert.equal(r.ok, false);
    const corpo = corpoDeRecusa(r as Extract<typeof r, { ok: false }>);
    assert.equal(corpo.preservar_dados_locais, true, `caso ${String(c)} não preserva`);
  }
});

testeAsync("a instrução distingue renovar de parar", async () => {
  // 403 sozinho não distingue "revogado, pare" de "unidade errada, renove".
  assert.equal(instrucaoPara(await autenticar(null)), "renovar_e_repetir");
  assert.equal(
    instrucaoPara(await autenticar(`Bearer ${token({ device_id: "dev-revogado" })}`)),
    "parar_e_avisar",
  );
  assert.equal(instrucaoPara(await autenticar(`Bearer ${token()}`)), "prosseguir");
});

testeAsync("o corpo de recusa NÃO ecoa a credencial recebida", async () => {
  const t = token();
  const r = await autenticar(`Bearer ${t}`, "MOEMA");
  const texto = JSON.stringify(corpoDeRecusa(r as Extract<typeof r, { ok: false }>));
  assert.ok(!texto.includes(t), "o token voltou no corpo da recusa");
  assert.ok(!/bearer/i.test(texto), "o header voltou no corpo da recusa");
});

/* ------------------------------------------------------------------ *
 * Log
 * ------------------------------------------------------------------ */

test("o que vai para log identifica a emissão sem permitir usá-la", () => {
  const { token: t, claims } = emitirToken({
    device_id: "dev-1",
    unit_id: "ITAIM",
    issued_by: "g",
    agora: AGORA,
    segredo: SEGREDO,
  });
  const log = JSON.stringify(paraLog(claims));
  assert.ok(!log.includes(t), "o token inteiro foi para o log");
  assert.ok(log.includes(claims.jti), "sem jti não há como auditar qual emissão foi usada");
});

test("a limpeza remove token de texto livre — e o método é verificado", () => {
  const t = token();
  // Primeiro provar que o varredor ACHA o que se sabe estar lá. Sem isso, um
  // "nenhum segredo encontrado" pode significar só que a varredura não funciona.
  const sujo = `falhou ao enviar: Authorization: Bearer ${t} (401)`;
  const limpo = limparSegredos(sujo);
  assert.ok(!limpo.includes(t), "o token sobreviveu à limpeza");
  assert.match(limpo, /removido/);

  for (const caso of [`{"token":"abc123def456"}`, `senha=umaSenhaQualquer`, `secret: xyz789`]) {
    assert.match(limparSegredos(caso), /removido/, `não limpou: ${caso}`);
  }
  // E não pode destruir texto legítimo.
  assert.equal(limparSegredos("lote de 42 pontos aceito"), "lote de 42 pontos aceito");
});

/* ------------------------------------------------------------------ *
 * Encerramento
 * ------------------------------------------------------------------ */

void Promise.all(pendentes).then(() => {
  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} device-auth tests OK ===`);
});
