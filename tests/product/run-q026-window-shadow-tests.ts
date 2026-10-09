/**
 * Q-026: contraexemplos para cortes temporais ou "ultimos N" no event_log.
 *
 * SOMENTE SHADOW: nao altera leitor, banco, API, eventos, janela operacional,
 * TATA Comanda ou regras da plataforma. Todos os fatos sao sinteticos.
 *
 * Rodar: npx tsx tests/product/run-q026-window-shadow-tests.ts
 */
import assert from "node:assert/strict";
import type { EventEnvelope, EventType, SourceMode } from "../../src/platform/contracts/event-catalog";
import { projetar } from "../../src/platform/projections/operacao-viva";

const AGORA = new Date("2026-10-09T18:00:00.000Z");
const HORA = 60 * 60 * 1000;

function fato(
  id: string,
  tipo: EventType,
  viagem: string,
  horasAntes: number,
  opcoes: { modo?: SourceMode; unidade?: string; chave?: string; recebidoHorasAntes?: number } = {},
): EventEnvelope {
  return {
    event_id: id,
    event_type: tipo,
    event_version: tipo + "@1.0.0",
    unit_id: opcoes.unidade ?? "ITAIM",
    trip_id: viagem,
    occurred_at: new Date(AGORA.getTime() - horasAntes * HORA).toISOString(),
    received_at: new Date(AGORA.getTime() - (opcoes.recebidoHorasAntes ?? horasAntes) * HORA).toISOString(),
    origin: "device",
    source_mode: opcoes.modo ?? "simulated",
    idempotency_key: opcoes.chave ?? id,
    payload: {},
  };
}

function reconstruir(eventos: readonly EventEnvelope[], modo: SourceMode = "simulated") {
  return projetar(eventos, { agora: AGORA, unit_id: "ITAIM", source_mode: modo });
}

function janela(eventos: readonly EventEnvelope[], horas: number, campo: "occurred_at" | "received_at" = "occurred_at") {
  const corte = AGORA.getTime() - horas * HORA;
  return eventos.filter((ev) => Date.parse(ev[campo] ?? "") >= corte);
}

function viagem(eventos: readonly EventEnvelope[], id: string, modo: SourceMode = "simulated") {
  return reconstruir(eventos, modo).viagens.find((v) => v.trip_id === id);
}

let aprovados = 0;
function provar(titulo: string, checagem: () => void) {
  checagem();
  aprovados += 1;
  console.log("  ok " + titulo);
}

provar("S1: viagem aberta ha 80 h desaparece de uma janela fixa de 24 h", () => {
  const fatos = [
    fato("a1", "trip_created", "ABERTA-ANTIGA", 80),
    fato("a2", "trip_started", "ABERTA-ANTIGA", 79),
    fato("a3", "gps_batch_received", "ABERTA-ANTIGA", 76),
  ];
  assert.equal(viagem(fatos, "ABERTA-ANTIGA")?.estado, "em_rota");
  assert.equal(viagem(janela(fatos, 24), "ABERTA-ANTIGA"), undefined);
});

provar("S2: GPS recente nao recompõe o estado anterior da viagem", () => {
  const fatos = [
    fato("b1", "trip_created", "ABERTA-GPS", 54),
    fato("b2", "trip_started", "ABERTA-GPS", 53),
    fato("b3", "gps_batch_received", "ABERTA-GPS", 0.01),
  ];
  assert.equal(viagem(fatos, "ABERTA-GPS")?.estado, "em_rota");
  assert.equal(viagem(janela(fatos, 24), "ABERTA-GPS")?.estado, "desconhecido");
  assert.equal(viagem(janela(fatos, 24), "ABERTA-GPS")?.frescor, "fresh");
});

provar("S3: evento offline antigo que chega hoje e omitido pelo occurred_at", () => {
  const fatos = [
    fato("c1", "trip_created", "TERMINAL-ATRASADO", 80),
    fato("c2", "trip_started", "TERMINAL-ATRASADO", 79),
    fato("c3", "trip_closed", "TERMINAL-ATRASADO", 45, { recebidoHorasAntes: 0.02 }),
  ];
  assert.equal(viagem(fatos, "TERMINAL-ATRASADO")?.estado, "encerrada");
  assert.equal(viagem(janela(fatos, 24, "occurred_at"), "TERMINAL-ATRASADO"), undefined);
  assert.equal(viagem(janela(fatos, 24, "received_at"), "TERMINAL-ATRASADO")?.estado, "encerrada");
  assert.deepEqual(viagem(janela(fatos, 24, "received_at"), "TERMINAL-ATRASADO")?.eventos, ["c3"]);
});

provar("S4: ultimos 200 eventos tambem podem ocultar viagem ainda aberta", () => {
  const fatos = [
    fato("d1", "trip_created", "SEM-SINAL", 100),
    fato("d2", "trip_started", "SEM-SINAL", 99),
  ];
  for (let i = 0; i < 210; i++) {
    fatos.push(fato("recente-" + i, "gps_batch_received", "OUTRA-VIAGEM", 10 - i / 30));
  }
  assert.equal(viagem(fatos, "SEM-SINAL")?.estado, "em_rota");
  assert.equal(viagem(fatos.slice(-200), "SEM-SINAL"), undefined);
});

provar("S5: remover passado muda proveniencia da deduplicacao", () => {
  const fatos = [
    fato("oc-antiga", "occurrence_created", "DUP", 50, { chave: "mesma-chave" }),
    fato("inicio", "trip_started", "DUP", 2),
    fato("oc-nova", "occurrence_created", "DUP", 1, { chave: "mesma-chave" }),
  ];
  const integral = viagem(fatos, "DUP");
  const cortada = viagem(janela(fatos, 24), "DUP");
  assert.equal(integral?.ocorrencias_abertas, 1);
  assert.equal(cortada?.ocorrencias_abertas, 1);
  assert.ok(integral?.eventos.includes("oc-antiga"));
  assert.ok(!integral?.eventos.includes("oc-nova"));
  assert.ok(!cortada?.eventos.includes("oc-antiga"));
  assert.ok(cortada?.eventos.includes("oc-nova"));
});

provar("S6: modo real nunca pode herdar fatos simulados de mesma viagem", () => {
  const fatos = [
    fato("r1", "trip_created", "MESMO-ID", 10, { modo: "real" }),
    fato("r2", "trip_started", "MESMO-ID", 9, { modo: "real" }),
    fato("s1", "trip_closed", "MESMO-ID", 8, { modo: "simulated" }),
  ];
  assert.equal(viagem(fatos, "MESMO-ID", "real")?.estado, "em_rota");
  assert.equal(viagem(fatos, "MESMO-ID", "simulated")?.estado, "encerrada");
});

provar("S7: envelhecer sinal preserva viagem e muda apenas o frescor", () => {
  const fatos = [
    fato("e1", "trip_started", "FRESCOR-ANTIGO", 73),
    fato("e2", "gps_batch_received", "FRESCOR-ANTIGO", 72),
  ];
  assert.equal(viagem(fatos, "FRESCOR-ANTIGO")?.estado, "em_rota");
  assert.equal(viagem(fatos, "FRESCOR-ANTIGO")?.frescor, "stale");
  assert.equal(viagem(janela(fatos, 24), "FRESCOR-ANTIGO"), undefined);
});

provar("S8: nenhuma duracao fixa garante viagens abertas, mesmo 30 dias", () => {
  for (const limite of [4, 24, 72, 24 * 30]) {
    const fatos = [
      fato("f1-" + limite, "trip_created", "LONGA-" + limite, limite + 2),
      fato("f2-" + limite, "trip_started", "LONGA-" + limite, limite + 1),
    ];
    assert.equal(viagem(fatos, "LONGA-" + limite)?.estado, "em_rota");
    assert.equal(viagem(janela(fatos, limite), "LONGA-" + limite), undefined);
  }
});

console.log("\nQ026_WINDOW_SHADOW: " + aprovados + "/8 PASS.");
console.log("Conclusao delimitada: cortes sem estado anterior perdem informacao.");
console.log("Nao mede ganho de velocidade, nao escolhe janela e nao altera runtime.");
