/**
 * Copiloto read-only evidence boundary — synthetic lab.
 * Units and source modes cannot contaminate another context. No external IO.
 */
import assert from "node:assert/strict";
import type { SourceMode } from "../../src/platform/contracts/event-catalog";
import type { RealidadeParaApresentacao, ViagemParaApresentacao } from "../../src/platform/leitura/realidade-de-entregas-incremental";
import type { LeituraDeRealidade } from "../../src/product/viewmodels/entregas-vm";
import { COPILOTO_ENTREGAS_LEITURA_VERSAO, copilotoEntregasLeitura } from "../../src/product/viewmodels/copiloto-entregas-leitura";

const READING = "2026-10-20T12:00:00.000Z";
const modes = ["real", "simulated", "control"] as const satisfies readonly SourceMode[];
let passed = 0;
function ok(condition: unknown, why: string): void {
  assert.ok(condition, why);
  console.log("ok COPILOTO-EVIDENCE-" + (++passed) + " " + why);
}
function trip(unit_id: string, source_mode: SourceMode, id: string): ViagemParaApresentacao {
  return {
    trip_id: id, unit_id, source_mode, estado: "em_rota",
    ultimo_fato_em: READING, ocorrencias_abertas: 0, frescor: "fresh",
    eventos: { length: 2 },
  };
}
function fixture(sections: readonly { unit_id: string; source_mode: SourceMode; n: number }[]): LeituraDeRealidade {
  const realidade: RealidadeParaApresentacao = {
    versao: "lab-read@1", fonte: "postgresql", lida_em: READING,
    aparelhos: [], historico_sem_modo: 9,
    projecoes: sections.map((s) => ({
      unit_id: s.unit_id, source_mode: s.source_mode,
      viagens: Array.from({ length: s.n }, (_, i) =>
        trip(s.unit_id, s.source_mode, "LAB_" + s.unit_id + "_" + s.source_mode + "_" + i)),
    })),
  };
  return { disponivel: true, realidade };
}

const unavailable = copilotoEntregasLeitura({
  disponivel: false, motivo: "indisponivel", explicacao: "TECH",
}, " ITAIM ");
ok(unavailable.estado === "indisponivel" && unavailable.fonte === null &&
   unavailable.lida_em === null && unavailable.grupos.length === 0 &&
   unavailable.historico_sem_modo === null && unavailable.unidade_solicitada === "ITAIM",
   "technical source loss does not become empty or healthy");
ok(unavailable.motivo.includes("indisponível") && unavailable.nenhuma_acao_executada,
   "unavailable state exposes limitation without action");
const noIntegration = copilotoEntregasLeitura({
  disponivel: false, motivo: "integracao_pendente", explicacao: "TECH",
});
ok(noIntegration.estado === "indisponivel" && noIntegration.motivo.includes("não foi configurada"),
   "missing integration remains explicit instead of zero");
const zero = copilotoEntregasLeitura(fixture([]), "ITAIM");
ok(zero.estado === "sem_evidencia" && zero.fonte === "platform.event_log" &&
   zero.grupos.length === 0 && zero.motivo.includes("não significa zero"),
   "no trip evidence never claims zero deliveries");
ok(zero.historico_sem_modo === null && zero.lida_em === READING,
   "unit-scoped reader conceals global unknown-mode count");

const mixed = fixture([
  { unit_id: "VILA-LAB", source_mode: "simulated", n: 3 },
  { unit_id: "ITAIM", source_mode: "control", n: 1 },
  { unit_id: "ITAIM", source_mode: "simulated", n: 2 },
  { unit_id: "ITAIM", source_mode: "real", n: 1 },
  { unit_id: "MOEMA", source_mode: "real", n: 4 },
]);
const itaim = copilotoEntregasLeitura(mixed, "ITAIM");
ok(itaim.estado === "observado" && itaim.grupos.length === 3 &&
   itaim.grupos.every(x => x.unit_id === "ITAIM"),
   "unit scope excludes all other units");
ok(itaim.grupos.map(x => x.source_mode).join(",") === "control,real,simulated" &&
   itaim.grupos.map(x => x.viagens_na_projecao).join(",") === "1,1,2",
   "real/simulated/control counts remain separate");
ok(itaim.historico_sem_modo === null &&
   itaim.motivo.includes("histórica") &&
   itaim.motivo.includes("Não comprova operação ativa"),
   "historical counts never become active trips or operational advice");
ok(itaim.nenhuma_acao_executada &&
   itaim.contrato === COPILOTO_ENTREGAS_LEITURA_VERSAO,
   "read-only contract has no commands");
const all = copilotoEntregasLeitura(mixed);
ok(all.estado === "observado" && all.grupos.length === 5 &&
   all.historico_sem_modo === 9,
   "global view retains unknown-mode history separately");
ok(all.grupos.map(x => x.unit_id).join(",") ===
   "ITAIM,ITAIM,ITAIM,MOEMA,VILA-LAB",
   "global groups are deterministically sorted");
const foreign = copilotoEntregasLeitura(mixed, "UNKNOWN-LAB");
ok(foreign.estado === "sem_evidencia" && foreign.grupos.length === 0 &&
   foreign.historico_sem_modo === null,
   "unknown unit never inherits another unit's events");
const whitespace = copilotoEntregasLeitura(mixed, "   ");
ok(whitespace.unidade_solicitada === null &&
   whitespace.grupos.length === all.grupos.length,
   "empty unit parameter is treated as global, not as authorized scope");
const before = JSON.stringify(mixed);
copilotoEntregasLeitura(mixed, "ITAIM");
ok(JSON.stringify(mixed) === before, "read-only projection does not mutate input");

for (let size = 0; size <= 24; size++) {
  const synthetic = fixture(Array.from({ length: size }, (_, j) => ({
    unit_id: ["ITAIM", "VILA-LAB", "MOEMA"][j % 3],
    source_mode: modes[(j + size) % 3],
    n: j % 4,
  })));
  for (const wanted of ["ITAIM", "VILA-LAB", "MOEMA", "UNKNOWN-LAB"]) {
    const scoped = copilotoEntregasLeitura(synthetic, wanted);
    assert.ok(scoped.grupos.every(g => g.unit_id === wanted));
    assert.equal(scoped.historico_sem_modo, null);
    assert.ok(scoped.grupos.every(g => g.source_mode in { real: 1, simulated: 1, control: 1 }));
    assert.equal(scoped.nenhuma_acao_executada, true);
    assert.equal(scoped.estado, scoped.grupos.length ? "observado" : "sem_evidencia");
    const source = synthetic.realidade;
    const expected = source.projecoes.filter(g => g.unit_id === wanted)
      .map(g => [g.source_mode, g.viagens.length]);
    const actual = scoped.grupos.map(g => [g.source_mode, g.viagens_na_projecao]);
    assert.deepEqual(actual.sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
                     expected.sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  }
}
ok(true, "100 synthetic scoped permutations preserve provenance, counts, no-leak and no-action");
console.log("COPILOTO_EVIDENCE_BOUNDARY: " + passed + "/" + passed +
  " PASS; 100 property cases; no IO or runtime writes");
