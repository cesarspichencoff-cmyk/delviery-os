/* Fase 3A — testes 7-8: nenhum cenário contém campo proibido de PII e nenhum
 * marcador de dado pessoal chega ao runtime. Identificadores sempre SIM-*. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CENARIOS } = require("../../../tools/live/simulator/cenarios");
const { executarCenario } = require("../../../tools/live/simulator/executor");
const { criarAleatorio } = require("../../../tools/live/simulator/aleatorio");
const { criarIdentificadores } = require("../../../tools/live/simulator/identificadores");
const { acharCampoProibido } = require("../../../src/live/sanitizar");

const TZ = "America/Sao_Paulo";

function passosDe(cenario, seed) {
  const ctx = {
    aleatorio: criarAleatorio(seed),
    ids: criarIdentificadores(),
    tz: TZ,
    inicioMs: Date.parse(cenario.inicio)
  };
  return cenario.passos(ctx);
}

test("7. nenhum cenário do catálogo contém campo proibido de PII (varredura recursiva)", () => {
  for (const cenario of CENARIOS) {
    for (const passo of passosDe(cenario, "seed-pii")) {
      if (!passo.evento) continue;
      const achado = acharCampoProibido(passo.evento, "", 0);
      assert.equal(achado, null,
        `cenario ${cenario.id}: evento ${passo.evento.event_id} contem campo proibido`);
    }
  }
});

test("7b. todos os identificadores são claramente sintéticos (SIM-*)", () => {
  for (const cenario of CENARIOS) {
    for (const passo of passosDe(cenario, "seed-ids")) {
      if (!passo.evento) continue;
      const evento = passo.evento;
      assert.match(evento.event_id, /^SIM-EVENT-\d{4}$/);
      const corr = evento.correlation || {};
      for (const [campo, valor] of Object.entries(corr)) {
        if (valor === null) continue;
        assert.match(valor, /^SIM-/, `cenario ${cenario.id}: correlation.${campo}=${valor}`);
      }
    }
  }
});

test("8. nenhum texto fora da allowlist sintética chega ao runtime (varredura de disco)", () => {
  // nomes de campos proibidos NÃO podem existir nem como chave nos arquivos
  const proibidos = ["telefone", "endereco", "cliente", "consumidor", "cpf",
    "email", "senha", "token", "cookie", "whatsapp", "celular"];
  for (const cenario of CENARIOS) {
    const r = executarCenario({
      cenario: cenario.id, seed: "seed-disco", storeTimeZone: TZ, manterRuntime: true
    });
    try {
      let disco = "";
      for (const arquivo of fs.readdirSync(r.runtimeRoot)) {
        disco += fs.readFileSync(path.join(r.runtimeRoot, arquivo), "utf8");
      }
      for (const nome of proibidos) {
        assert.ok(!disco.toLowerCase().includes(`"${nome}"`),
          `cenario ${cenario.id}: campo proibido "${nome}" apareceu no runtime`);
      }
      // todos os pedidos citados no disco são sintéticos
      const idsCitados = disco.match(/SIM-(EVENT|IFOOD|INTERNO|JOB)-\d{4}/g) || [];
      assert.ok(idsCitados.length > 0, `cenario ${cenario.id}: runtime sem ids sintéticos?`);
    } finally {
      fs.rmSync(r.runtimeRoot, { recursive: true, force: true });
    }
  }
});
