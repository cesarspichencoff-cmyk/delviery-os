import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  adaptarAuditoriaTataComanda,
  tataComandaHistoricoIndisponivel,
} from "../product/viewmodels/tata-comanda-vm";
import { historicoVM } from "../product/viewmodels/historico-vm";

const ARQUIVO = join(
  process.cwd(),
  "data",
  "tata_comanda_day_truth_2026-10-05_v1.json",
);

const raw = JSON.parse(readFileSync(ARQUIVO, "utf8")) as Record<string, unknown>;

let passou = 0;
const falhas: string[] = [];

function teste(nome: string, fn: () => void): void {
  try {
    fn();
    passou += 1;
    console.log("PASS", nome);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log("FAIL", nome);
  }
}

teste("TC1 auditoria entra como historico real, explicitamente nao-live", () => {
  const vm = adaptarAuditoriaTataComanda(raw);
  assert.equal(vm.disponivel, true);
  assert.equal(vm.fonte, "tata_comanda_readonly_audit");
  assert.equal(vm.ao_vivo, false);
  assert.equal(vm.data_operacional, "2026-10-05");
  assert.equal(vm.pedidos, 195);
  assert.equal(vm.unidades, 638);
  assert.equal(vm.receita_nativa_brl, 38989.37);
});

teste("TC2 canal e conciliacao preservam os totais provados", () => {
  const vm = adaptarAuditoriaTataComanda(raw);
  assert.deepEqual(vm.canais, { DLV_IFO: 190, DLV_NMO: 3, DLV_FOS: 2 });
  assert.equal(vm.conciliacao_financeira.pedidos_exatos, 195);
  assert.equal(vm.conciliacao_financeira.pedidos_diretos, 191);
  assert.equal(vm.conciliacao_financeira.pedidos_com_taxa_servico, 4);
  assert.equal(vm.conciliacao_financeira.taxa_servico_residual_brl, 61);
});

teste("TC3 KDS nunca vira tempo de producao ou entrega", () => {
  const vm = adaptarAuditoriaTataComanda(raw);
  assert.equal(vm.ciclo_kds.semantica, "ciclo_local_kds");
  assert.equal(vm.ciclo_kds.pedidos_com_inicio, 195);
  assert.equal(vm.ciclo_kds.pedidos_com_fim, 195);
  assert.equal(vm.ciclo_kds.prova_tempo_producao, false);
  assert.equal(vm.ciclo_kds.prova_tempo_entrega, false);
  assert.ok(vm.desconhecidos.includes("PRODUCTION_TIME_MISSING"));
  assert.ok(vm.desconhecidos.includes("DELIVERY_TIME_MISSING"));
});

teste("TC4 relogio de revisao preserva a correcao dos 2 FOS / 10 unidades", () => {
  const vm = adaptarAuditoriaTataComanda(raw);
  assert.equal(vm.revisoes.relogio, "source_event.observed_at");
  assert.equal(vm.revisoes.pedidos_semanticamente_corrigidos, 2);
  assert.equal(vm.revisoes.unidades_recuperadas, 10);
});

teste("TC5 HistoricoVM transporta o bloco sem misturar com event_log/copiloto", () => {
  const tata = adaptarAuditoriaTataComanda(raw);
  const h = historicoVM(
    { disponivel: false, motivo: "event log fora deste teste" },
    { disponivel: false, motivo: "store fora deste teste" },
    tata,
  );
  assert.equal(h.operacao_viva.disponivel, false);
  assert.equal(h.copiloto.disponivel, false);
  assert.equal(h.tata_comanda.disponivel, true);
  if (!h.tata_comanda.disponivel) throw new Error("TATA Comanda ausente");
  assert.equal(h.tata_comanda.ao_vivo, false);
  assert.equal(h.tata_comanda.pedidos, 195);
});

teste("TC6 ausencia continua ausencia, nao snapshot zero", () => {
  const h = historicoVM(
    { disponivel: false, motivo: "sem event log" },
    { disponivel: false, motivo: "sem store" },
    tataComandaHistoricoIndisponivel("sem auditoria"),
  );
  assert.equal(h.tata_comanda.disponivel, false);
  if (h.tata_comanda.disponivel) throw new Error("deveria estar ausente");
  assert.equal(h.tata_comanda.motivo, "sem auditoria");
});

teste("TC7 fronteira de PII quebrada e recusada fail-closed", () => {
  const alterado = structuredClone(raw) as Record<string, unknown>;
  const scope = alterado.scope as Record<string, unknown>;
  scope.customer_pii = true;
  assert.throws(() => adaptarAuditoriaTataComanda(alterado), /PII_BOUNDARY_BROKEN/);
});

teste("TC8 soma de canais incoerente e recusada", () => {
  const alterado = structuredClone(raw) as Record<string, unknown>;
  const orders = alterado.orders as Record<string, unknown>;
  const channels = orders.channels as Record<string, unknown>;
  channels.DLV_IFO = 189;
  assert.throws(() => adaptarAuditoriaTataComanda(alterado), /CHANNEL_TOTAL_MISMATCH/);
});

teste("TC9 remover UNKNOWN de producao impede promocao silenciosa", () => {
  const alterado = structuredClone(raw) as Record<string, unknown>;
  alterado.unknowns = (alterado.unknowns as string[]).filter(
    (x) => x !== "PRODUCTION_TIME_MISSING",
  );
  assert.throws(() => adaptarAuditoriaTataComanda(alterado), /TIME_BOUNDARY_MISSING/);
});

if (falhas.length) {
  console.error(`TATA_COMANDA_PRODUCT_ADAPTER: ${passou}/${passou + falhas.length} PASS`);
  for (const f of falhas) console.error(" -", f);
  process.exit(1);
}

console.log(`TATA_COMANDA_PRODUCT_ADAPTER: ${passou}/${passou} PASS`);
