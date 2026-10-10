/**
 * Q-026 — a mesma prova de equivalencia, agora com PostgreSQL REAL.
 *
 * Banco isolado e descartado no fim (`banco-isolado.ts`), parado na 0002 para
 * gravar historico SEM modo (UNKNOWN) e depois migrado ate o fim. So fatos
 * sinteticos. Nada de operacao, nada de outro banco.
 *
 *  P1 a porta de leitura entrega SO fatos bem formados — o que torna exata a
 *     particao por escopo (instante de toISOString, id texto, sequencia inteira);
 *  P2 a porta de realidade (particionada) == a porta antiga (cada escopo
 *     projetado pela ORIGINAL sobre o log inteiro), com e sem filtro de unidade;
 *  P3 reinicio: replay no boot == memoria viva da fila == ORIGINAL, escopo a
 *     escopo, e um segundo reinicio da os mesmos digests;
 *  P4 fato atrasado gravado DEPOIS do primeiro reinicio (offline que
 *     sincronizou) entra no replay seguinte e a projecao bate com a ORIGINAL;
 *  P5 historico sem modo continua UNKNOWN, contado e fora de toda projecao.
 *
 * Sem `DELIVERYOS_PG_URL`: PULADO em voz alta. Com `Q026_EXIGIR_PG=1` (CI),
 * a ausencia do banco reprova.
 */
import assert from "node:assert/strict";
import type { EventEnvelope, SourceMode } from "../../src/platform/contracts/event-catalog";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { consumir, MemoriaDaProjecao, projecaoAtual, type MensagemDaPonte } from "../../src/platform/projections/consumidor";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { montarPonteDaOperacaoViva, TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
import { reconstruirNoBoot } from "../../src/platform/runtime/replay-no-boot";
import { carregarReferencia, REF_ORIGINAL } from "./q026-referencias";
import { embaralhar, gerarLinhas, gravarLinhas, PERFIL_LOJA, type LinhaDoLog } from "./q026-replay-fixture";

const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();
console.log("\n=== Q-026 — equivalencia adversarial com PostgreSQL real ===\n");
if (!URL_PG) {
  if (process.env.Q026_EXIGIR_PG === "1") {
    console.error("Q026_EXIGIR_PG=1 e DELIVERYOS_PG_URL ausente: a prova com banco NAO rodou.");
    process.exit(1);
  }
  console.log("PULADO: DELIVERYOS_PG_URL nao definida — nenhum fato foi gravado nem relido.");
  process.exit(0);
}

const original = carregarReferencia(REF_ORIGINAL);
if (!original.referencia) {
  console.error(`referencia ORIGINAL obrigatoria: ${original.motivo}`);
  process.exit(1);
}
const ORIGINAL = original.referencia.projetar;

let passaram = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(nome);
    console.log(`  XX  ${nome}\n      ${(e as Error).message.split("\n").join("\n      ")}`);
  }
}

function mensagem(e: EventEnvelope, i: number): MensagemDaPonte {
  return {
    outbox_id: `ob-${i}`,
    kind: e.event_type,
    idempotency_key: e.idempotency_key,
    payload: {
      event_id: e.event_id, event_type: e.event_type, event_version: e.event_version, unit_id: e.unit_id,
      trip_id: e.trip_id, device_id: e.device_id, occurred_at: e.occurred_at, received_at: e.received_at,
      clock_trust: e.clock_trust, origin: e.origin, source_mode: e.source_mode, sequence: e.sequence,
    },
  };
}

/** A porta ANTIGA, reproduzida: cada escopo projetado pela ORIGINAL sobre o log inteiro. */
function projecoesDaPortaAntiga(aptos: readonly EventEnvelope[], agora: Date, unit_id?: string) {
  const escopos = new Map<string, { unit_id: string; source_mode: SourceMode }>();
  for (const f of aptos) {
    if (unit_id && f.unit_id !== unit_id) continue;
    escopos.set(`${f.unit_id}|${f.source_mode}`, { unit_id: f.unit_id, source_mode: f.source_mode });
  }
  return [...escopos.values()]
    .sort((a, b) => `${a.unit_id}|${a.source_mode}`.localeCompare(`${b.unit_id}|${b.source_mode}`))
    .map((e) => ({ unit_id: e.unit_id, source_mode: e.source_mode, viagens: ORIGINAL(aptos, { agora, ...e }).viagens }));
}

void (async () => {
  const b = await bancoIsolado(URL_PG, "0002_event_log_contexto_dispositivo", "q026adv");
  const agora = PERFIL_LOJA.agora;
  try {
    // Historico ANTES da 0003: sem modo (UNKNOWN). Duas linhas de GPS de uma unidade conhecida.
    await b.cliente.query(
      `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload, occurred_at,
          origin, idempotency_key, contract_version, device_id, sequence_local)
       VALUES ('velho-1','ITAIM','trip','T-VELHA','trip_started','{}'::jsonb,'2026-08-01T10:00:00Z','device','k-velho-1','trip_started@1.0.0','DEV-01',1),
              ('velho-2','ITAIM','trip','T-VELHA','gps_batch_received','{}'::jsonb,'2026-08-01T10:01:00Z','device','k-velho-2','gps_batch_received@1.0.0','DEV-01',2)`,
    );
    await b.migrarTudo();
    await b.cliente.query("INSERT INTO identity.unit(unit_id, display_name) VALUES ('ITAIM','Itaim (sintetico)'), ('LAB-BANCADA','Bancada (sintetico)')");
    const linhas = gerarLinhas({ ...PERFIL_LOJA, fatos: 30_000, semente: 31, aparelhos: 16, pontos_por_viagem: 80,
      unidades: ["ITAIM", "LAB-BANCADA"], empates: 0.05, atrasados: 0.05, suspeitos: 0.02 });
    for (const d of [...new Set(linhas.map((l) => `${l.device_id}|${l.unit_id}`))]) {
      const [device_id, unit_id] = d.split("|");
      await b.cliente.query("INSERT INTO identity.device(device_id, unit_id, label) VALUES ($1, $2, $1)", [device_id, unit_id]);
    }
    // Ordem de gravacao = ordem de CHEGADA (recorded_at), como o critico grava.
    await gravarLinhas(b.cliente, [...linhas].sort((x, y) => (x.recorded_at < y.recorded_at ? -1 : x.recorded_at > y.recorded_at ? 1 : 0)));

    const leitura = await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA);

    await teste("P1 a porta de leitura so entrega fatos bem formados (a premissa da particao)", async () => {
      assert.equal(leitura.aptos.length, linhas.length);
      assert.equal(leitura.corrompidas.length, 0);
      for (const f of leitura.aptos) {
        assert.equal(typeof f.event_id, "string");
        assert.equal(f.occurred_at, new Date(f.occurred_at).toISOString(), `instante fora do formato canonico: ${f.occurred_at}`);
        assert.ok(f.sequence === undefined || Number.isSafeInteger(f.sequence), `sequencia: ${String(f.sequence)}`);
      }
    });

    await teste("P2 porta de realidade particionada == porta antiga (ORIGINAL sobre o log inteiro), com e sem unidade", async () => {
      for (const unit_id of [undefined, "ITAIM", "LAB-BANCADA", "SEM-FATO"]) {
        const nova = await lerRealidadeDeEntregas(b.cliente, { agora, unit_id });
        const aptos = (await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA)).aptos;
        const antiga = projecoesDaPortaAntiga(aptos, agora, unit_id);
        assert.equal(JSON.stringify(nova.projecoes), JSON.stringify(antiga), `projecoes divergem (unidade ${unit_id ?? "todas"})`);
        assert.deepStrictEqual(nova.projecoes, antiga);
        if (!unit_id) assert.ok(antiga.length >= 4, `escopos insuficientes: ${antiga.length}`);
      }
      // Controle antifalso-positivo: a MESMA comparacao acusa quando um unico
      // fato some da referencia — a igualdade acima nao e vacua.
      const nova = await lerRealidadeDeEntregas(b.cliente, { agora });
      const aptos = (await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA)).aptos;
      const semUm = aptos.filter((f) => f.event_type === "gps_batch_received").slice(1, 2)[0];
      assert.ok(semUm);
      assert.notEqual(JSON.stringify(nova.projecoes),
        JSON.stringify(projecoesDaPortaAntiga(aptos.filter((f) => f !== semUm), agora)),
        "CONTROLE falhou: a comparacao nao enxerga um fato a menos");
    });

    const digestsDoReinicio: string[] = [];
    await teste("P3 reinicio: replay no boot == memoria viva == ORIGINAL; segundo reinicio, mesmos digests", async () => {
      const viva = new MemoriaDaProjecao();
      consumir(embaralhar([...leitura.aptos, ...leitura.aptos.slice(0, 500)], 5).map(mensagem), { memoria: viva });
      for (let reinicio = 0; reinicio < 2; reinicio++) {
        const ponte = montarPonteDaOperacaoViva();
        const r = await reconstruirNoBoot(b.cliente, ponte, agora);
        assert.equal(r.estado, "completo");
        assert.equal(r.aptos, linhas.length);
        digestsDoReinicio.push(JSON.stringify(r.escopos));
        assert.deepStrictEqual(ponte.memoria.escopos(), viva.escopos());
        for (const e of ponte.memoria.escopos()) {
          const o = { agora, ...e };
          const doReplay = JSON.stringify(projecaoAtual(ponte.memoria, o));
          assert.equal(doReplay, JSON.stringify(projecaoAtual(viva, o)), `replay != viva em ${e.unit_id}|${e.source_mode}`);
          assert.equal(doReplay, JSON.stringify(ORIGINAL(ponte.memoria.fatos(e.unit_id, e.source_mode), o)),
            `replay (candidata) != ORIGINAL em ${e.unit_id}|${e.source_mode}`);
        }
      }
      assert.equal(digestsDoReinicio[0], digestsDoReinicio[1], "dois reinicios, digests diferentes");
    });

    await teste("P4 fatos atrasados gravados depois do reinicio entram no replay seguinte e batem com a ORIGINAL", async () => {
      const atrasados: LinhaDoLog[] = linhas.slice(1_000, 1_600).map((l, i) => ({
        ...l,
        event_id: `atrasado-${i}`,
        idempotency_key: `atrasado-${i}`,
        sequence_local: 900_000 + i,
        occurred_at: new Date(Date.parse(l.occurred_at) - 2 * 3_600_000).toISOString(),
        recorded_at: new Date(agora.getTime() - 500).toISOString(),
      }));
      await gravarLinhas(b.cliente, atrasados);
      const ponte = montarPonteDaOperacaoViva();
      const r = await reconstruirNoBoot(b.cliente, ponte, agora);
      assert.equal(r.aptos, linhas.length + atrasados.length);
      assert.notEqual(JSON.stringify(r.escopos), digestsDoReinicio[0], "os atrasados nao mudaram nenhum digest");
      const aptos = (await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA)).aptos;
      for (const e of ponte.memoria.escopos()) {
        const o = { agora, ...e };
        assert.equal(JSON.stringify(projecaoAtual(ponte.memoria, o)), JSON.stringify(ORIGINAL(aptos, o)), `${e.unit_id}|${e.source_mode}`);
      }
      const nova = await lerRealidadeDeEntregas(b.cliente, { agora });
      assert.equal(JSON.stringify(nova.projecoes), JSON.stringify(projecoesDaPortaAntiga(aptos, agora)));
    });

    await teste("P5 historico sem modo segue UNKNOWN: contado, fora do replay e de toda projecao", async () => {
      const l = await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA);
      assert.equal(l.sem_modo, 2);
      assert.ok(!l.aptos.some((f) => f.event_id.startsWith("velho-")));
      const r = await lerRealidadeDeEntregas(b.cliente, { agora });
      assert.equal(r.historico_sem_modo, 2);
      assert.ok(!r.projecoes.some((p) => p.viagens.some((v) => v.trip_id === "T-VELHA")));
    });
  } finally {
    await b.descartar();
  }
  const total = passaram + falhas.length;
  console.log(`\n${passaram}/${total} provas com PostgreSQL real`);
  if (falhas.length) {
    console.error(`Q026_REPLAY_ADVERSARIAL_PG_RED: ${falhas.join(" | ")}`);
    process.exit(1);
  }
  console.log(`Q026_REPLAY_ADVERSARIAL_PG: ${passaram}/${total} PASS`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
