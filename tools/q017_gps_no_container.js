#!/usr/bin/env node
/**
 * Q-017 — um ponto de GPS pelo caminho HTTP real, DE DENTRO do container do
 * crítico. Usado por `tools/q017_compose_real.sh`.
 *
 * Roda lá dentro para que o segredo dos tokens nunca saia do container: o
 * token é assinado com `DELIVERYOS_DEVICE_TOKEN_SECRET` do próprio ambiente
 * do crítico, e o `fetch` vai para `127.0.0.1:8080` — a porta que a
 * composição só EXPÕE à rede interna.
 *
 *   docker exec -i deliveryos-critical node - <unidade> <aparelho> <viagem> <n> < este-arquivo
 *
 * O MESMO `n` reenvia o MESMO ponto (mesma chave de idempotência). Imprime
 * `GPS=<status> classe=<classe> duplicados=<n>`; o modo gravado é lido do
 * banco por quem chama, nunca daqui.
 */

const { join } = require("node:path");

const [unidade, aparelho, viagem, n] = process.argv.slice(2);
if (!unidade || !aparelho || !viagem || !n) {
  console.error("uso: node - <unidade> <aparelho> <viagem> <n>");
  process.exit(2);
}

const { emitirToken } = require(join(process.cwd(), "dist/src/platform/auth/device-token.js"));
const token = emitirToken({
  device_id: aparelho,
  unit_id: unidade,
  issued_by: "gerente",
  agora: new Date(),
  segredo: process.env.DELIVERYOS_DEVICE_TOKEN_SECRET,
}).token;

const ponto = {
  point_id: `p-${aparelho}-${n}`,
  idempotency_key: `gps:${aparelho}:${viagem}:${n}`,
  trip_id: viagem,
  device_id: aparelho,
  latitude: -23.55,
  longitude: -46.63,
  accuracy_m: 12,
  occurred_at: new Date().toISOString(),
  sequence_local: Number(n),
  provider: "fused",
  is_mock: false,
};

fetch("http://127.0.0.1:8080/api/gps/batch", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ device_id: aparelho, correlation_id: `q017c-${aparelho}-${n}`, points: [ponto] }),
})
  .then(async (r) => {
    const c = await r.json().catch(() => ({}));
    console.log(`GPS=${r.status} classe=${c.classe} duplicados=${c.duplicados}`);
  })
  .catch((e) => {
    console.log(`GPS=falhou ${e.message}`);
    process.exit(1);
  });
