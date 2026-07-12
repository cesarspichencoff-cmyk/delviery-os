/* ============================================================================
 * DeliveryOS · tools/live/simulator · EXECUTOR DE CENÁRIO
 * ----------------------------------------------------------------------------
 * Recebe seed + configuração + cenário; cria runtime em diretório TEMPORÁRIO
 * do SO; injeta eventos pela API PÚBLICA do núcleo (receber/snapshot/
 * reconstruirDoLog — src/live intocado); captura snapshot e contagens;
 * suporta reinício/replay no meio do cenário; limpa o runtime ao final.
 *
 * storeTimeZone é OBRIGATÓRIO e validado — sem fuso ou com IANA inválido a
 * execução falha explicitamente (nunca UTC silencioso, F2-02).
 * Todo tempo é simulado (relogio.js); o relógio real só mede duração, que
 * fica fora do hash de determinismo.
 * ==========================================================================*/
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..", "..", "..");
const { criarNucleo } = require(path.join(RAIZ, "src", "live", "nucleo.js"));
const { criarArmazenamento } = require(path.join(RAIZ, "src", "live", "persistir.js"));
const { reconstruirDoLog } = require(path.join(RAIZ, "src", "live", "reconstruir.js"));
const { criarConfig } = require(path.join(RAIZ, "src", "live", "config.js"));
const { localDayKey } = require(path.join(RAIZ, "src", "live", "normalizar.js"));

const { criarRelogioSimulado } = require("./relogio");
const { criarAleatorio } = require("./aleatorio");
const { criarIdentificadores } = require("./identificadores");
const { obterCenario } = require("./cenarios");
const { montarRelatorio, hashSnapshot } = require("./relatorio");

const contarLinhas = (caminho) => !fs.existsSync(caminho) ? 0 :
  fs.readFileSync(caminho, "utf8").split("\n").filter((l) => l.trim() !== "").length;

/** Normalização usada na comparação de replay — compara a PROJEÇÃO
 * RECONSTRUÍVEL do estado (Contrato §17): além de reconstruido_em e recepcao
 * (escopo de sessão), last_trusted_at/ultima_atualizacao_confiavel são
 * CONSERVADORES pós-reinício por desenho do núcleo — o processo renascido só
 * volta a confiar com evidência fresca, nunca herda confiança da sessão
 * anterior. ACHADO REGISTRADO da Fase 3A: se a reconstrução histórica de
 * last_trusted_at (derivável do received_at persistido) for desejada, é
 * mudança de src/live que exige autorização própria — nada foi alterado. */
const projecaoReconstruivel = (snap) => {
  const fontes = {};
  for (const nome of Object.keys(snap.fontes)) {
    fontes[nome] = { ...snap.fontes[nome], last_trusted_at: null };
  }
  return {
    ...snap,
    reconstruido_em: null,
    recepcao: null,
    ultima_atualizacao_confiavel: null,
    fontes
  };
};

function validarStoreTimeZone(storeTimeZone) {
  if (typeof storeTimeZone !== "string" || storeTimeZone.length === 0) {
    throw new Error("store_time_zone_obrigatorio: todo cenario simulado declara o fuso da loja");
  }
  if (localDayKey("2026-01-01T12:00:00.000Z", storeTimeZone) === null) {
    throw new Error(`store_time_zone_invalido: "${storeTimeZone}" nao e um identificador IANA valido`);
  }
}

/**
 * Executa um cenário de forma determinística.
 * @param {object} args { cenario: id|objeto, seed, storeTimeZone, freshness?, manterRuntime? }
 * @returns {{ relatorio, snapshot, eventos, resultados, runtimeRoot, replay }}
 */
function executarCenario({ cenario, seed, storeTimeZone, freshness, manterRuntime }) {
  validarStoreTimeZone(storeTimeZone);
  if (seed === undefined || seed === null) {
    throw new Error("seed_obrigatoria: execucao deterministica exige seed explicita");
  }
  const def = typeof cenario === "string" ? obterCenario(cenario) : cenario;

  const inicioReal = Date.now(); // só para duracao_execucao_ms (fora do hash)
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "deliveryos-sim-"));

  try {
    const relogio = criarRelogioSimulado(def.inicio);
    const ctx = {
      aleatorio: criarAleatorio(seed),
      ids: criarIdentificadores(),
      tz: storeTimeZone,
      inicioMs: relogio.inicioMs()
    };
    const passos = def.passos(ctx); // determinístico dado (seed, cenário)

    const config = criarConfig({ storeTimeZone, freshness });
    const armazenamento = criarArmazenamento({ runtimeRoot });
    let nucleo = criarNucleo({ armazenamento, config, agora: relogio.agora });

    const resultados = [];
    let replay = { executado: false };

    for (const passo of passos) {
      relogio.avancarPara(ctx.inicioMs + passo.em_ms);

      if (passo.reiniciar) {
        // reinício simulado: novo processo, mesmo disco — replay do log
        const antes = nucleo.snapshot();
        const r = reconstruirDoLog({ runtimeRoot, config, agora: relogio.agora });
        const depois = r.nucleo.snapshot();
        replay = {
          executado: true,
          eventos_relidos: r.relatorio.eventos_relidos,
          // igualdade da projeção RECONSTRUÍVEL (Contrato §17)
          snapshot_igual: hashSnapshot(projecaoReconstruivel(depois)) ===
            hashSnapshot(projecaoReconstruivel(antes))
        };
        nucleo = r.nucleo; // a operação continua sobre o núcleo renascido
        continue;
      }

      resultados.push({
        event_id: passo.evento.event_id || null,
        ...nucleo.receber(passo.evento)
      });
    }

    relogio.avancarPara(ctx.inicioMs + def.fim_ms);
    const snapshot = nucleo.snapshot();
    const linhasLogAceito = contarLinhas(armazenamento.caminhoEventos);

    const relatorio = montarRelatorio({
      scenarioId: def.id,
      seed,
      storeTimeZone,
      inicioSimulado: def.inicio,
      fimSimulado: relogio.agoraIso(),
      eventosGerados: passos.filter((p) => p.evento).length,
      snapshot,
      linhasLogAceito,
      replay,
      duracaoExecucaoMs: Date.now() - inicioReal,
      runtimeRoot
    });

    return {
      relatorio,
      snapshot,
      eventos: passos.filter((p) => p.evento).map((p) => p.evento),
      resultados,
      replay,
      runtimeRoot
    };
  } finally {
    if (!manterRuntime) fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
}

module.exports = { executarCenario, validarStoreTimeZone, projecaoReconstruivel };
