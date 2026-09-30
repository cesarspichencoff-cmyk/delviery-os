import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Recomendacao } from "./copiloto/shadow";
import { avaliarCandidataShadowNoFoco, reconciliarShadowComFoco, type FocoCanonico } from "./copiloto/attention-authority";

const DECISAO = require("../perfil-delivery/decisao.js") as { focoCanonico(active: unknown): FocoCanonico | null };

let passou = 0;
function teste(nome: string, fn: () => void): void { fn(); passou += 1; console.log("  ok  " + nome); }

function rec(id = "rec-q003"): Recomendacao {
  return {
    recommendation_id: id,
    policy_id: "q003-fixture",
    policy_version: "copiloto-shadow@1.0.0",
    input_event_ids: ["evt-1"],
    projection_version: "operacao-viva@1",
    source_mode: "simulated",
    confianca: { estado: "apurada", valor: 0.8, politica: "q003-fixture", versao_da_politica: "copiloto-shadow@1.0.0", evidencias: ["evt-1"] },
    risk_level: "medio",
    recommended_action: "fixture",
    reason: "fixture",
    indisponivel: [],
    requires_human: true,
    created_at: "2026-09-30T15:00:00.000Z",
    expires_at: "2026-09-30T15:05:00.000Z",
    status: "proposed",
  };
}

console.log("\n=== Q-003 — AUTORIDADE DA ATENÇÃO ===\n");

teste("Q3.1 sess.active.sit e normalizado sem inventar campos", () => {
  assert.deepEqual(
    DECISAO.focoCanonico({ key: "pr:combinados", sit: { key: "pr:combinados", kind: "praca", praca: "combinados", sev: 3 } }),
    { key: "pr:combinados", kind: "praca", praca: "combinados" },
  );
});

teste("Q3.2 ausencia de active nao fabrica Foco", () => {
  assert.equal(DECISAO.focoCanonico(null), null);
  assert.equal(DECISAO.focoCanonico({}), null);
});

teste("Q3.3 Shadow nunca abre Foco sozinho", () => {
  const r = avaliarCandidataShadowNoFoco({ recomendacao: rec(), ancora: { kind: "saida" } }, null);
  assert.equal(r.elegivel, false);
  if (!r.elegivel) assert.equal(r.motivo, "sem_foco_ativo");
});

teste("Q3.4 recomendacao sem ancora causal permanece sombra", () => {
  const r = avaliarCandidataShadowNoFoco({ recomendacao: rec(), ancora: null }, { key: "saida", kind: "saida" });
  assert.equal(r.elegivel, false);
  if (!r.elegivel) assert.equal(r.motivo, "sem_ancora_causal");
});

teste("Q3.5 praca so aceita a MESMA praca", () => {
  const foco: FocoCanonico = { key: "pr:combinados", kind: "praca", praca: "combinados" };
  assert.equal(avaliarCandidataShadowNoFoco({ recomendacao: rec("a"), ancora: { kind: "praca", praca: "combinados" } }, foco).elegivel, true);
  const r = avaliarCandidataShadowNoFoco({ recomendacao: rec("b"), ancora: { kind: "praca", praca: "duplas" } }, foco);
  assert.equal(r.elegivel, false);
  if (!r.elegivel) assert.equal(r.motivo, "causa_raiz_divergente");
});

teste("Q3.6 pedido exige o mesmo id em order/fechamento/conferencia", () => {
  for (const kind of ["order", "fechamento", "conferencia"] as const) {
    const foco: FocoCanonico = { key: kind + ":P1", kind, id: "P1" };
    assert.equal(avaliarCandidataShadowNoFoco({ recomendacao: rec(kind), ancora: { kind: "pedido", id: "P1" } }, foco).elegivel, true);
    assert.equal(avaliarCandidataShadowNoFoco({ recomendacao: rec(kind + "-x"), ancora: { kind: "pedido", id: "P2" } }, foco).elegivel, false);
  }
});

teste("Q3.7 saida so aceita ancora de saida", () => {
  const foco: FocoCanonico = { key: "saida", kind: "saida" };
  assert.equal(avaliarCandidataShadowNoFoco({ recomendacao: rec(), ancora: { kind: "saida" } }, foco).elegivel, true);
  assert.equal(avaliarCandidataShadowNoFoco({ recomendacao: rec("x"), ancora: { kind: "pedido", id: "P1" } }, foco).elegivel, false);
});

teste("Q3.8 foco sem identidade nao autoriza aproximacao", () => {
  const r = avaliarCandidataShadowNoFoco({ recomendacao: rec(), ancora: { kind: "pedido", id: "P1" } }, { key: "order:P1", kind: "order" });
  assert.equal(r.elegivel, false);
  if (!r.elegivel) assert.equal(r.motivo, "foco_sem_identidade");
});

teste("Q3.9 reconciliacao separa elegiveis de retidas", () => {
  const r = reconciliarShadowComFoco([
    { recomendacao: rec("same"), ancora: { kind: "praca", praca: "combinados" } },
    { recomendacao: rec("other"), ancora: { kind: "praca", praca: "duplas" } },
    { recomendacao: rec("unknown"), ancora: null },
  ], { key: "pr:combinados", kind: "praca", praca: "combinados" });
  assert.deepEqual(r.elegiveis.map((x) => x.recommendation_id), ["same"]);
  assert.deepEqual(r.retidas.map((x) => x.motivo), ["causa_raiz_divergente", "sem_ancora_causal"]);
});

function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

teste("Q3.10 Shadow continua sem autoridade para escrever sess.active/buildFoco", () => {
  const fonte = semComentarios(readFileSync(join(process.cwd(), "src/platform/copiloto/shadow.ts"), "utf8"));
  assert.doesNotMatch(fonte, /sess\.active|buildFoco\s*\(|focoCanonico\s*\(/);
});

teste("Q3.11 gate nao importa MOTOR nem decisao por conta propria", () => {
  const fonte = semComentarios(readFileSync(join(process.cwd(), "src/platform/copiloto/attention-authority.ts"), "utf8"));
  assert.doesNotMatch(fonte, /perfil-delivery|motor\.js|decisao\.js/);
});

console.log("\nQ003_ATTENTION: " + passou + "/11 PASS");
