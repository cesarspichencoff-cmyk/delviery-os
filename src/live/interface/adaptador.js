/* ============================================================================
 * DeliveryOS · src/live/interface · ADAPTADOR PROJEÇÃO → INTERFACE (D4A)
 * ----------------------------------------------------------------------------
 * Regra soberana:  motor decide → projeção expõe → ADAPTADOR TRANSPORTA →
 * interface apresenta. Este módulo só transporta/serializa/declara — NUNCA:
 * decide Calmo/Ambiente/Foco, recalcula score, cria prioridade, infere praça,
 * altera confiança, une pedidos, esconde desconhecidos, completa campo
 * ausente, transforma suspect em complete ou unmatched em matched.
 *
 * O que entra na JANELA (shape NIGHT/rows que o cérebro já consome):
 *   - pedidos APTOS (matched + complete, não cancelados) → NIGHT + rows;
 *   - cancelados → NIGHT com `c` (semântica histórica; motor trata cancelado).
 * O que fica FORA (e vira desconhecido DECLARADO em pedidos_excluidos):
 *   - conflict (Addendum §7: nunca vai ao motor);
 *   - parciais/unmatched (Addendum §10: sem falsa precisão);
 *   - suspect — inclusive comanda_sem_itens (F2-08: não alimenta decisão).
 * Nenhum campo ausente é inventado: s/e (saiu/entregue) não existem na fonte
 * simulada ⇒ null, exatamente como "não observado" no contrato histórico.
 * ==========================================================================*/
"use strict";

const ESTADOS_FONTE = Object.freeze([
  "initializing", "ready", "replaying", "stale", "disconnected",
  "degraded", "failed", "stopped"
]);

/* utc da meia-noite LOCAL do dia (mesma técnica iterativa do simulador —
 * duplicada aqui de propósito: src/ não depende de tools/) */
const fmtCache = new Map();
function utcMeiaNoiteLocal(diaLocal, tz) {
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
    fmtCache.set(tz, fmt);
  }
  const alvoMs = Date.parse(`${diaLocal}T00:00:00Z`);
  let ms = alvoMs;
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    const visto = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}Z`);
    const diff = alvoMs - visto;
    if (diff === 0) return ms;
    ms += diff;
  }
  throw new Error(`adaptador_dia_local_invalido: ${diaLocal} em ${tz}`);
}

const minutoDe = (iso, baseMs) => iso ? Math.round((Date.parse(iso) - baseMs) / 60000) : null;

/** primeiro instante em que a coluna alvo foi observada (occurred > captured) */
function minutoDaColuna(status, coluna, baseMs) {
  if (!status || !Array.isArray(status.historico)) return null;
  for (const h of status.historico) {
    if (h.coluna === coluna && !h.fora_de_ordem && !h.carimbo_suspeito) {
      return minutoDe(h.occurred_at || h.captured_at, baseMs);
    }
  }
  return null;
}

function resumoExcluido(p) {
  return {
    id: p.comanda ? p.comanda.pedido_interno : null,
    curto: (p.comanda && p.comanda.ifood_short) || (p.status && p.status.ifood_short) || null,
    match_state: p.match_state,
    completeness: p.qualidade.completeness,
    motivos_suspeita: p.qualidade.motivos_suspeita || [],
    fields_missing: p.qualidade.fields_missing || [],
    cancelado: p.cancelado,
    apto_para_decisao: p.apto_para_decisao
  };
}

/**
 * Constrói a janela {meta, T0, T1, NIGHT, rows} + desconhecidos declarados a
 * partir do snapshot do núcleo. Puro: não muta o snapshot.
 */
function montarJanela(snapshot, { storeTimeZone }) {
  const todos = [
    ...snapshot.pedidos.completos, ...snapshot.pedidos.parciais,
    ...snapshot.pedidos.conflitos, ...snapshot.pedidos.cancelados
  ];
  const NIGHT = [];
  const rows = [];
  const excluidos = [];
  let diaLocal = null;

  for (const p of todos) {
    const dia = (p.comanda && p.comanda.dia) || (p.status && p.status.dia) || null;
    if (dia && (!diaLocal || dia > diaLocal)) diaLocal = dia; // dia operacional mais recente
  }
  const baseMs = diaLocal ? utcMeiaNoiteLocal(diaLocal, storeTimeZone) : null;

  for (const p of todos) {
    const aptoParaJanela = p.apto_para_decisao === true;
    const canceladoComTempo = p.cancelado === true &&
      (p.status && (p.status.cancelamento || p.status.historico.length > 0));

    if (!aptoParaJanela && !canceladoComTempo) { excluidos.push(resumoExcluido(p)); continue; }
    if (baseMs === null) { excluidos.push(resumoExcluido(p)); continue; }

    const id = (p.comanda && p.comanda.pedido_interno) || `status:${p.status.ifood_short}`;
    const curto = (p.comanda && p.comanda.ifood_short) || (p.status && p.status.ifood_short) || null;
    const r = p.comanda
      ? minutoDe(p.comanda.emissao || p.comanda.criado_em, baseMs)
      : (p.status && p.status.historico[0]
        ? minutoDe(p.status.historico[0].occurred_at || p.status.historico[0].captured_at, baseMs)
        : null);
    const c = p.cancelado
      ? minutoDe((p.status.cancelamento && p.status.cancelamento.visto_em) ||
        p.status.visto_por_ultimo_em, baseMs)
      : null;
    NIGHT.push({
      id, curto,
      r,
      p: p.cancelado ? null : minutoDaColuna(p.status, "pronto", baseMs),
      s: null, // não observado pela fonte simulada — nunca inventado
      e: null, // idem
      c
    });
    if (aptoParaJanela && p.comanda && Array.isArray(p.comanda.itens)) {
      for (const it of p.comanda.itens) {
        rows.push({
          pedido_id: id,
          item_nome: it.nome,
          quantidade: it.quantidade || 1,
          observacao: it.observacao || null
        });
      }
    }
  }

  const tempos = NIGHT.flatMap((o) => [o.r, o.p, o.c]).filter((t) => t !== null);
  const janela = NIGHT.length === 0 ? null : {
    meta: {
      janela: "simulada",
      fonte: "simulada",
      dia_local: diaLocal,
      gerado_em: snapshot.gerado_em,
      pedidos: NIGHT.length,
      linhasItens: rows.length,
      geradoPor: "src/live/interface/adaptador.js"
    },
    T0: Math.min(...tempos) - 5,
    T1: Math.max(...tempos) + 15,
    NIGHT,
    rows
  };
  return { janela, excluidos, diaLocal };
}

/**
 * Deriva o estado da fonte — nunca esconde erro, nunca deixa dado velho
 * parecer atual. Prioridade: falhas > ciclo de vida > freshness da fonte de
 * STATUS.
 *
 * Decisão de design (documentada): o rótulo stale/disconnected deriva da
 * fonte de STATUS (papel "status" — tempo/estado, que MUDA e envelhece de
 * forma perigosa). A fonte de COMPOSIÇÃO (comanda) envelhece por natureza (é
 * impressa uma vez e não muda), então sua idade aparece em `freshness` mas
 * NÃO torna a fonte stale sozinha — senão todo pedido cuja comanda foi
 * impressa há mais de um limiar ficaria "antigo". O gate do núcleo continua
 * soberano sobre APTIDÃO (o adaptador não recalcula nada disso).
 */
function derivarEstadoFonte({ snapshot, replayStatus, erro, parada, inicializando, degradedState }) {
  if (erro) return { estado: "failed", motivo: String(erro.message || erro) };
  if (parada) return { estado: "stopped", motivo: "fonte_parada" };
  if (inicializando || !snapshot) return { estado: "initializing", motivo: "sem_snapshot_ainda" };
  if (replayStatus && replayStatus.em_andamento) {
    return { estado: "replaying", motivo: "replay_do_log_em_andamento" };
  }
  if (degradedState) return { estado: "degraded", motivo: degradedState };
  const fontesStatus = Object.values(snapshot.fontes)
    .filter((f) => (f.papeis || []).includes("status"));
  const estadosStatus = fontesStatus.map((f) => f.freshness_state);
  if (estadosStatus.includes("desconectada")) return { estado: "disconnected", motivo: "fonte_de_status_desconectada" };
  if (estadosStatus.includes("vencida")) return { estado: "stale", motivo: "fonte_de_status_vencida" };
  if (estadosStatus.includes("atrasada")) return { estado: "stale", motivo: "fonte_de_status_atrasada" };
  return { estado: "ready", motivo: null };
}

/**
 * Payload completo consumido pela interface (contrato documentado na D4A).
 * A janela só existe em "ready": dado velho/parcial NUNCA parece atual —
 * fora de ready a interface recebe o último dia confiável APENAS como
 * referência datada (ultimo_confiavel), nunca como janela corrente.
 */
function montarPayloadInterface({
  snapshot, storeTimeZone, origem, replayStatus, erro, parada, inicializando, degradedState, agoraIso
}) {
  const source = derivarEstadoFonte({ snapshot, replayStatus, erro, parada, inicializando, degradedState });
  const base = {
    versao_payload: "1.0",
    gerado_em: agoraIso || (snapshot ? snapshot.gerado_em : null),
    origem: origem || "simulator",
    source_status: source.estado,
    source_motivo: source.motivo,
    degraded_state: degradedState || null,
    replay_status: replayStatus || { em_andamento: false },
    operational_day_key: null,
    janela: null,
    pedidos_excluidos: [],
    unknowns: null,
    freshness: null,
    gate_staleness: null,
    ultimo_confiavel: null
  };
  if (!snapshot) return base;

  const { janela, excluidos, diaLocal } = montarJanela(snapshot, { storeTimeZone });
  base.operational_day_key = diaLocal;
  base.freshness = Object.fromEntries(Object.entries(snapshot.fontes).map(([nome, f]) => [nome, {
    freshness_state: f.freshness_state,
    freshness_age_ms: f.freshness_age_ms,
    last_trusted_at: f.last_trusted_at,
    ultimo_evento_em: f.ultimo_evento_em
  }]));
  base.gate_staleness = snapshot.gate_staleness; // confiança preservada, nunca recalculada
  base.pedidos_excluidos = excluidos;
  base.unknowns = {
    conflitos: snapshot.pedidos.conflitos.length,
    parciais: snapshot.pedidos.parciais.length,
    suspeitos: excluidos.filter((e) => e.completeness === "suspect").length,
    quarentena: snapshot.quarentena,
    ultima_atualizacao_confiavel: snapshot.ultima_atualizacao_confiavel
  };

  if (source.estado === "ready") {
    base.janela = janela;
  } else {
    // último estado confiável só com carimbo e aviso — nunca como atual
    base.ultimo_confiavel = janela ? {
      dia_local: diaLocal,
      gerado_em: snapshot.gerado_em,
      pedidos: janela.NIGHT.length,
      aviso: "dado antigo; nao representa o estado atual"
    } : null;
  }
  return base;
}

module.exports = { ESTADOS_FONTE, montarJanela, derivarEstadoFonte, montarPayloadInterface };
