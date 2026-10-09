/**
 * B5 — profundidade da fila offline.
 *
 * Prova sem PostgreSQL: contrato HTTP, autenticação, corrida de revogação,
 * minimização do corpo Android e apresentação no Product System.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { emitirToken } from "./auth/device-token";
import {
  LIMITE_CONTADOR_FILA_OFFLINE,
  tratarFilaOffline,
  type RegistroFilaOffline,
} from "./runtime/rota-fila-offline";
import { entregasVM } from "../product/viewmodels/entregas-vm";
import {
  AGORA_DEMO,
  montarEntregasDemo,
} from "../product/demo/seed-demonstracao";
import type { RealidadeDeEntregas } from "./leitura/realidade-de-entregas";

const SEGREDO = "q".repeat(48);
const AGORA = new Date("2026-10-06T09:00:00.000Z");
const DEVICE = "device-b5";
const UNIDADE = "ITAIM";
const ATOR = "motoboy-b5";

function token(device_id = DEVICE, unit_id = UNIDADE): string {
  return emitirToken({
    device_id,
    unit_id,
    issued_by: "fixture-b5",
    actor_id: ATOR,
    agora: AGORA,
    segredo: SEGREDO,
    validade_s: 3600,
    jti: "fixture-b5-jti",
  }).token;
}

interface Escrita {
  device_id: string;
  pending_points: number;
  pending_events: number;
  agora: Date;
}

function registro(opcoes: {
  revogado?: boolean;
  persistir?: boolean;
} = {}): RegistroFilaOffline & { escritas: Escrita[] } {
  const escritas: Escrita[] = [];
  return {
    escritas,
    async buscar(id) {
      if (id !== DEVICE) return null;
      return {
        device_id: DEVICE,
        unit_id: UNIDADE,
        actor_id: ATOR,
        revoked_at: opcoes.revogado ? "2026-10-06T08:59:00.000Z" : null,
      };
    },
    async registrarFilaOffline(device_id, dados) {
      if (opcoes.persistir === false) return false;
      escritas.push({ device_id, ...dados });
      return true;
    },
  };
}

let passaram = 0;
const falhas: string[] = [];

async function teste(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log("PASS", nome);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log("FAIL", nome);
  }
}

async function main(): Promise<void> {
  await teste("B5.1 aceita exatamente os dois contadores e deriva device_id do Bearer", async () => {
    const reg = registro();
    const r = await tratarFilaOffline(
      { authorization: `Bearer ${token()}` },
      { pending_points: 7, pending_events: 3 },
      { segredo: SEGREDO, registro: reg, agora: () => AGORA },
    );
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, {
      classe: "aceito",
      received_at: AGORA.toISOString(),
    });
    assert.deepEqual(reg.escritas, [
      {
        device_id: DEVICE,
        pending_points: 7,
        pending_events: 3,
        agora: AGORA,
      },
    ]);
  });

  await teste("B5.2 zero medido continua zero medido", async () => {
    const reg = registro();
    const r = await tratarFilaOffline(
      { Authorization: token() },
      { pending_points: 0, pending_events: 0 },
      { segredo: SEGREDO, registro: reg, agora: () => AGORA },
    );
    assert.equal(r.status, 200);
    assert.equal(reg.escritas[0]?.pending_points, 0);
    assert.equal(reg.escritas[0]?.pending_events, 0);
  });

  await teste("B5.3 coordenada, trip_id, device_id ou qualquer campo extra são recusados", async () => {
    for (const extra of [
      { latitude: -23.5 },
      { longitude: -46.6 },
      { trip_id: "trip-x" },
      { device_id: "device-forjado" },
      { payload: { qualquer: "coisa" } },
      { rider_id: "pessoa-x" },
    ]) {
      const reg = registro();
      const r = await tratarFilaOffline(
        { authorization: `Bearer ${token()}` },
        { pending_points: 1, pending_events: 2, ...extra },
        { segredo: SEGREDO, registro: reg, agora: () => AGORA },
      );
      assert.equal(r.status, 400, JSON.stringify(extra));
      assert.equal(reg.escritas.length, 0, JSON.stringify(extra));
    }
  });

  await teste("B5.4 contrato recusa ausente, string, fracionário, negativo e absurdo", async () => {
    const ruins: unknown[] = [
      {},
      { pending_points: "1", pending_events: 0 },
      { pending_points: 1.5, pending_events: 0 },
      { pending_points: -1, pending_events: 0 },
      { pending_points: 0, pending_events: LIMITE_CONTADOR_FILA_OFFLINE + 1 },
      null,
      [],
    ];
    for (const corpo of ruins) {
      const reg = registro();
      const r = await tratarFilaOffline(
        { authorization: `Bearer ${token()}` },
        corpo,
        { segredo: SEGREDO, registro: reg, agora: () => AGORA },
      );
      assert.equal(r.status, 400, JSON.stringify(corpo));
      assert.equal(reg.escritas.length, 0, JSON.stringify(corpo));
    }
  });

  await teste("B5.5 sem credencial não escreve e pede preservação local", async () => {
    const reg = registro();
    const r = await tratarFilaOffline(
      {},
      { pending_points: 1, pending_events: 2 },
      { segredo: SEGREDO, registro: reg, agora: () => AGORA },
    );
    assert.equal(r.status, 401);
    assert.equal(reg.escritas.length, 0);
    assert.equal(r.corpo.preservar_dados_locais, true);
  });

  await teste("B5.6 dispositivo já revogado não escreve", async () => {
    const reg = registro({ revogado: true });
    const r = await tratarFilaOffline(
      { authorization: `Bearer ${token()}` },
      { pending_points: 1, pending_events: 2 },
      { segredo: SEGREDO, registro: reg, agora: () => AGORA },
    );
    assert.equal(r.status, 403);
    assert.equal(reg.escritas.length, 0);
  });

  await teste("B5.7 revogação entre autenticação e UPDATE não pode receber 200", async () => {
    const reg = registro({ persistir: false });
    const r = await tratarFilaOffline(
      { authorization: `Bearer ${token()}` },
      { pending_points: 1, pending_events: 2 },
      { segredo: SEGREDO, registro: reg, agora: () => AGORA },
    );
    assert.equal(r.status, 403);
    assert.equal(r.corpo.motivo, "dispositivo_revogado_ou_indisponivel");
    assert.equal(r.corpo.preservar_dados_locais, true);
    assert.equal(reg.escritas.length, 0);
  });

  await teste("B5.8 Android envia somente pending_points e pending_events nesta rota", () => {
    const fonte = readFileSync(
      join(
        process.cwd(),
        "android/app/src/main/java/br/com/tata/entregas/sync/EntregasApi.kt",
      ),
      "utf8",
    );
    const inicio = fonte.indexOf("fun sendQueueDepth");
    const fim = fonte.indexOf("fun sendTermAcknowledgement", inicio);
    assert.ok(inicio >= 0 && fim > inicio, "sendQueueDepth ausente");
    const bloco = fonte.slice(inicio, fim);
    assert.ok(bloco.includes('put("pending_points", pendingPoints)'));
    assert.ok(bloco.includes('put("pending_events", pendingEvents)'));
    for (const proibido of [
      "latitude",
      "longitude",
      "trip_id",
      "device_id",
      "rider_id",
      "payload",
      "location",
    ]) {
      assert.equal(bloco.includes(proibido), false, `campo proibido no corpo Android: ${proibido}`);
    }
  });

  await teste("B5.9 Product System apresenta total + dois componentes sem inventar ausência", async () => {
    const facade = await montarEntregasDemo();
    const snap = await facade.snapshot();
    const base: RealidadeDeEntregas = {
      versao: "fixture-b5",
      fonte: "postgresql",
      lida_em: AGORA.toISOString(),
      aparelhos: [
        {
          device_id: DEVICE,
          unit_id: UNIDADE,
          actor_id: ATOR,
          label: "Aparelho B5",
          autorizado_em: "2026-10-05T12:00:00.000Z",
          credencial_vinculada_em: "2026-10-05T12:01:00.000Z",
          ultima_sessao_em: "2026-10-06T08:00:00.000Z",
          app_version: "1.0.0",
          revogado_em: null,
          fila_offline: {
            pending_points: 7,
            pending_events: 3,
            reportada_em: AGORA.toISOString(),
          },
          fatos_por_modo: { real: 0, simulated: 0, control: 0 },
          ultimo_lote: null,
        },
      ],
      projecoes: [],
      historico_sem_modo: 0,
    };
    const vm = entregasVM(
      snap,
      AGORA.toISOString(),
      facade.getPolicyMaxStops(),
      { disponivel: true, realidade: base },
    );
    const a = vm.realidade.aparelhos[0];
    assert.equal(a.fila_offline.observado, true);
    assert.equal(a.fila_offline.observado && a.fila_offline.valor, 10);
    assert.equal(a.fila_offline_pontos.observado && a.fila_offline_pontos.valor, 7);
    assert.equal(a.fila_offline_eventos.observado && a.fila_offline_eventos.valor, 3);

    const sem = entregasVM(
      snap,
      AGORA.toISOString(),
      facade.getPolicyMaxStops(),
      {
        disponivel: true,
        realidade: {
          ...base,
          aparelhos: [{ ...base.aparelhos[0], fila_offline: null }],
        },
      },
    ).realidade.aparelhos[0];
    assert.equal(sem.fila_offline.observado, false);
    assert.equal(
      sem.fila_offline.observado === false ? sem.fila_offline.motivo : "",
      "nao_observado",
    );
  });

  await teste("B5.10 superfície Entregas expõe a fila REAL sem alterar a demo", () => {
    const ui = readFileSync(
      join(process.cwd(), "src/product/ui/surfaces/entregas.js"),
      "utf8",
    );
    assert.ok(ui.includes('"Fila offline"'));
    assert.ok(ui.includes("fila_offline_pontos"));
    assert.ok(ui.includes("fila_offline_eventos"));
    assert.ok(ui.includes("O aparelho em campo (demonstracao)"));
  });

  await teste("B5.11 Product System declara medicao antiga sem inventar que aparelho parou", async () => {
    const facade = await montarEntregasDemo();
    const snap = await facade.snapshot();
    const registroFila = (reportada_em: string): RealidadeDeEntregas => ({
      versao: "fixture-b5-freshness",
      fonte: "postgresql",
      lida_em: AGORA.toISOString(),
      aparelhos: [{
        device_id: DEVICE,
        unit_id: UNIDADE,
        actor_id: ATOR,
        label: "Aparelho B5",
        autorizado_em: "2026-10-05T12:00:00.000Z",
        credencial_vinculada_em: "2026-10-05T12:01:00.000Z",
        ultima_sessao_em: "2026-10-06T08:00:00.000Z",
        app_version: "1.0.0",
        revogado_em: null,
        fila_offline: { pending_points: 7, pending_events: 3, reportada_em },
        fatos_por_modo: { real: 0, simulated: 0, control: 0 },
        ultimo_lote: null,
      }],
      projecoes: [],
      historico_sem_modo: 0,
    });
    const apresenta = (reportadaEm: string) =>
      entregasVM(snap, AGORA.toISOString(), facade.getPolicyMaxStops(), {
        disponivel: true, realidade: registroFila(reportadaEm),
      }).realidade.aparelhos[0];
    const recente = apresenta("2026-10-06T08:50:00.000Z");
    const antiga = apresenta("2026-10-06T07:00:00.000Z");
    const envelhecendo = apresenta("2026-10-06T08:20:00.000Z");
    const futuro = apresenta("2026-10-06T09:05:00.000Z");
    const invalida = apresenta("instante-invalido");
    const ler = (a: typeof recente) => (a as unknown as {
      fila_offline_frescor?: { observado: boolean; valor?: string };
    }).fila_offline_frescor;
    assert.equal(ler(recente)?.valor, "fresh");
    assert.equal(ler(antiga)?.valor, "stale");
    assert.equal(ler(envelhecendo)?.valor, "aging");
    assert.equal(ler(futuro)?.valor, "unknown");
    assert.equal(ler(invalida)?.valor, "unknown");
    assert.equal(antiga.fila_offline.observado, true, "historico real nao desaparece");
    assert.equal(antiga.fila_offline.observado && antiga.fila_offline.valor, 10);
    assert.equal(antiga.fila_offline_pontos.observado && antiga.fila_offline_pontos.valor, 7);
    assert.equal(antiga.fila_offline_eventos.observado && antiga.fila_offline_eventos.valor, 3);
  });

  await teste("B5.12 UI identifica ultimo relato e destaca medicao desatualizada", () => {
    const ui = readFileSync(join(process.cwd(), "src/product/ui/surfaces/entregas.js"), "utf8");
    assert.ok(ui.includes("fila_offline_frescor"));
    assert.ok(ui.includes("Ultimo relato do aparelho"));
    assert.ok(!ui.includes("aparece abaixo como integracao pendente"), "aviso obsoleto nao deve reaparecer");
    assert.ok(ui.includes('estado: "stale"'), "medicao historica exige indicacao visivel");
  });

  if (falhas.length) {
    console.error(`\nB5_QUEUE_DEPTH: ${passaram}/${passaram + falhas.length} PASS`);
    for (const f of falhas) console.error(" -", f);
    process.exit(1);
  }

  console.log(`\nB5_QUEUE_DEPTH: ${passaram}/${passaram} PASS`);
}

void main();
