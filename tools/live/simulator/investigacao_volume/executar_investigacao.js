/* ============================================================================
 * DeliveryOS · investigação de volume · EXECUTOR DE VALIDAÇÃO
 * ----------------------------------------------------------------------------
 * Roda os dois cenários (Ambiente, Foco) 3× cada pelo pipeline REAL
 * (núcleo → adaptador → motor.js/decisao.js, todos INTOCADOS), verifica
 * determinismo por hash, e escreve evidência estruturada em JSON + texto.
 * Nenhum modo é forçado — MOTOR.step decide tudo a partir dos eventos.
 * ==========================================================================*/
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { executarCenario } = require("../executor");
const { CENARIO_AMBIENTE, CENARIO_FOCO } = require("./cenarios_volume");
const { rodarPipelineReal } = require("./motor_real");

const TZ = "America/Sao_Paulo";
const SEED = "investigacao-volume-v1";
const OUT_DIR = path.join(__dirname, "..", "..", "..", "..", "..", "deliveryos-review-packets", "d4a-cenarios-volume-visual");

function hashOf(obj) {
  const ordenar = (v) => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(ordenar);
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = ordenar(v[k]);
    return o;
  };
  return crypto.createHash("sha256").update(JSON.stringify(ordenar(obj))).digest("hex");
}

/** roda uma vez: snapshot do núcleo + timeline do motor real */
function rodarUmaVez(cenario) {
  const r = executarCenario({ cenario, seed: SEED, storeTimeZone: TZ });
  const { janela, timeline, resumo } = rodarPipelineReal(r.snapshot, TZ);
  return { relatorioCenario: r.relatorio, snapshot: r.snapshot, janela, timeline, resumo };
}

/** compara 3 execuções e retorna se são idênticas (hash da timeline + do snapshot) */
function verificarDeterminismo(cenario, nome) {
  const execucoes = [rodarUmaVez(cenario), rodarUmaVez(cenario), rodarUmaVez(cenario)];
  const hashesSnapshot = execucoes.map((e) => hashOf(e.snapshot));
  const hashesTimeline = execucoes.map((e) => hashOf(e.timeline));
  const deterministico = hashesSnapshot.every((h) => h === hashesSnapshot[0]) &&
    hashesTimeline.every((h) => h === hashesTimeline[0]);
  return { nome, execucoes, hashesSnapshot, hashesTimeline, deterministico };
}

function evidenciaFocoLegitimo(sit) {
  // "não houve força manual": nenhuma ATRIBUIÇÃO de modo/sess.active existe no
  // código desta investigação — só LEITURA do que o motor real decidiu.
  // Regex de assinatura (não confundir com comparação ===/!==): atribuição
  // direta de `mode`/`sess.active`/`sess.pending` com `=` simples, ou
  // qualquer flag/parâmetro de força (forceMode, forcarModo, etc — via nome).
  const PROPRIO = path.basename(__filename); // exclui este próprio verificador
  const arquivos = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith(".js") && f !== PROPRIO);
  const padroesProibidos = [
    /\bforce ?[Mm]ode\b/, /\bforce ?[Ff]ocus\b/, /\bforcar ?[Mm]odo\b/, /\bforcar ?[Ff]oco\b/,
    /\bmode\s*=\s*["'`]/,            // atribuição direta: mode = "foco" (nunca mode === "foco")
    /sess\.active\s*=\s*[^=]/,       // atribuição direta de sess.active (fora de motor.js)
    /sess\.pending\s*=\s*[^=]/       // idem para sess.pending
  ];
  const achados = [];
  for (const f of arquivos) {
    const texto = fs.readFileSync(path.join(__dirname, f), "utf8");
    for (const padrao of padroesProibidos) {
      const m = texto.match(padrao);
      if (m) achados.push(`${f}: padrão "${padrao}" casou em "${m[0]}"`);
    }
  }
  return { sit, forcas_encontradas: achados, forca_manual: achados.length > 0 };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("== INVESTIGAÇÃO DE VOLUME — AMBIENTE E FOCO (motor real, zero força manual) ==\n");

  const resultados = {};
  for (const [chave, cenario, nome] of [
    ["ambiente", CENARIO_AMBIENTE, "AMBIENTE (clima em 4 áreas, sem foco)"],
    ["foco", CENARIO_FOCO, "FOCO (praça soberana)"]
  ]) {
    console.log(`--- ${nome} ---`);
    const v = verificarDeterminismo(cenario, nome);
    const base = v.execucoes[0];

    console.log("determinístico (3 execuções, hash idêntico)?", v.deterministico);
    console.log("hashes snapshot:", v.hashesSnapshot.map((h) => h.slice(0, 12)).join(" | "));
    console.log("hashes timeline:", v.hashesTimeline.map((h) => h.slice(0, 12)).join(" | "));
    console.log("janela T0/T1:", base.janela.T0, base.janela.T1, "| pedidos:", base.janela.NIGHT.length);
    console.log("contagem por modo:", JSON.stringify(base.resumo.contagem_por_modo));
    console.log("1º ambiente no minuto absoluto:", base.resumo.minuto_primeiro_ambiente);
    console.log("1º foco no minuto absoluto:", base.resumo.minuto_primeiro_foco);
    if (base.resumo.sess_active_sit_no_primeiro_foco) {
      console.log("sess.active.sit no 1º foco:", JSON.stringify(base.resumo.sess_active_sit_no_primeiro_foco));
    }

    const evidenciaForca = evidenciaFocoLegitimo(chave);
    console.log("força manual de modo encontrada no código?", evidenciaForca.forca_manual);
    console.log("");

    resultados[chave] = {
      nome, deterministico: v.deterministico,
      hashes_snapshot: v.hashesSnapshot, hashes_timeline: v.hashesTimeline,
      janela: { T0: base.janela.T0, T1: base.janela.T1, pedidos: base.janela.NIGHT.length, dia_local: base.janela.meta.dia_local },
      resumo: base.resumo,
      timeline_compacta: base.timeline.map((p) => ({
        t: p.t, mode: p.mode,
        sits: p.sits.map((s) => `${s.kind}:${s.praca || ""}:sev${s.sev}${s.n ? ":n=" + s.n : ""}`),
        sess_active_sit: p.sess_active_sit
      })),
      evidencia_forca_manual: evidenciaForca,
      relatorio_cenario: base.relatorioCenario
    };
  }

  fs.writeFileSync(path.join(OUT_DIR, "evidencia-motor-real.json"), JSON.stringify(resultados, null, 1));
  console.log("Evidência completa (JSON) escrita em:", path.join(OUT_DIR, "evidencia-motor-real.json"));

  const ambienteOk = resultados.ambiente.deterministico &&
    resultados.ambiente.resumo.minuto_primeiro_ambiente !== null &&
    resultados.ambiente.resumo.minuto_primeiro_foco === null &&
    !resultados.ambiente.evidencia_forca_manual.forca_manual;
  const focoOk = resultados.foco.deterministico &&
    resultados.foco.resumo.minuto_primeiro_foco !== null &&
    resultados.foco.resumo.sess_active_sit_no_primeiro_foco &&
    resultados.foco.resumo.sess_active_sit_no_primeiro_foco.praca === "cozinha_quentes" &&
    !resultados.foco.evidencia_forca_manual.forca_manual;

  console.log("\n== VEREDITO ==");
  console.log("Ambiente apto para demonstração:", ambienteOk);
  console.log("Foco apto para demonstração:", focoOk);

  return { resultados, ambienteOk, focoOk };
}

if (require.main === module) main();
module.exports = { main, hashOf, verificarDeterminismo, rodarUmaVez };
