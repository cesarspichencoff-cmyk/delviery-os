import assert from "node:assert/strict";
import type { RealidadeDeEntregas } from "../../platform/leitura/realidade-de-entregas";
import { copilotoEntregasLeitura } from "./copiloto-entregas-leitura";

let passou = 0;
function teste(nome: string, fn: () => void): void {
  fn();
  passou++;
  console.log("  ok  " + nome);
}

function realidade(projecoes: RealidadeDeEntregas["projecoes"]): RealidadeDeEntregas {
  return {
    versao: "realidade-de-entregas@1.0.0",
    fonte: "postgresql",
    lida_em: "2026-10-12T19:00:00.000Z",
    aparelhos: [],
    projecoes,
    historico_sem_modo: 3,
  };
}

// As viagens são placeholders tipados: a ponte só pode CONTAR a projeção,
// não ler identidade, GPS, dados pessoais, relógios ou status interno.
const viagens = (_n: number) => Array.from(
  { length: _n },
  () => ({} as RealidadeDeEntregas["projecoes"][number]["viagens"][number]),
);

teste("CL1 banco nao configurado nao inventa zero", () => {
  const r = copilotoEntregasLeitura({
    disponivel: false,
    motivo: "integracao_pendente",
    explicacao: "interna",
  });
  assert.equal(r.estado, "indisponivel");
  assert.equal(r.fonte, null);
  assert.deepEqual(r.grupos, []);
  assert.equal(r.historico_sem_modo, null);
  assert.equal(r.nenhuma_acao_executada, true);
  assert.doesNotMatch(JSON.stringify(r), /interna/);
});

teste("CL2 banco indisponivel falha fechado", () => {
  const r = copilotoEntregasLeitura({
    disponivel: false,
    motivo: "indisponivel",
    explicacao: "postgresql://usuario:senha@host/db",
  });
  assert.equal(r.estado, "indisponivel");
  assert.doesNotMatch(JSON.stringify(r), /senha|host\/db/);
});

teste("CL3 real e simulated nunca se somam", () => {
  const r = copilotoEntregasLeitura({
    disponivel: true,
    realidade: realidade([
      { unit_id: "ITAIM", source_mode: "real", viagens: viagens(2) },
      { unit_id: "ITAIM", source_mode: "simulated", viagens: viagens(3) },
      { unit_id: "PINHEIROS", source_mode: "control", viagens: viagens(1) },
    ]),
  });
  assert.equal(r.estado, "observado");
  assert.deepEqual(r.grupos.map((x) => [x.unit_id, x.source_mode, x.viagens_na_projecao]), [
    ["ITAIM", "real", 2],
    ["ITAIM", "simulated", 3],
    ["PINHEIROS", "control", 1],
  ]);
  assert.equal(r.historico_sem_modo, 3);
});

teste("CL4 recorte de unidade exclui outras e total global", () => {
  const r = copilotoEntregasLeitura({
    disponivel: true,
    realidade: realidade([
      { unit_id: "ITAIM", source_mode: "simulated", viagens: viagens(1) },
      { unit_id: "PINHEIROS", source_mode: "real", viagens: viagens(8) },
    ]),
  }, "ITAIM");
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].source_mode, "simulated");
  assert.equal(r.historico_sem_modo, null);
});

teste("CL5 unidade sem fatos nunca vira zero observado", () => {
  const r = copilotoEntregasLeitura({
    disponivel: true,
    realidade: realidade([{ unit_id: "ITAIM", source_mode: "simulated", viagens: viagens(1) }]),
  }, "MOOCA");
  assert.equal(r.estado, "sem_evidencia");
  assert.deepEqual(r.grupos, []);
  assert.match(r.motivo, /não significa zero/i);
});

teste("CL6 output nao transporta IDs pessoais ou viagens", () => {
  const r = copilotoEntregasLeitura({
    disponivel: true,
    realidade: {
      ...realidade([{ unit_id: "ITAIM", source_mode: "real", viagens: viagens(1) }]),
      aparelhos: [{
        device_id: "SEGREDO-DEVICE",
        actor_id: "SEGREDO-ACTOR",
        label: "SEGREDO-LABEL",
      } as RealidadeDeEntregas["aparelhos"][number]],
    },
  });
  assert.doesNotMatch(JSON.stringify(r), /SEGREDO/);
  assert.equal(r.nenhuma_acao_executada, true);
});

console.log("COPILOTO_ENTREGAS_READONLY=" + passou + "/6");
