/* ============================================================================
 * DeliveryOS · src/live · NÚCLEO (orquestração)
 * ----------------------------------------------------------------------------
 * Liga as peças: contrato → normalização → idempotência → persistência →
 * deduplicação → consolidação → snapshot. Não contém regra própria — cada
 * regra mora no seu módulo.
 *
 * O núcleo NUNCA sabe qual adaptador o alimenta (só recebe eventos no
 * contrato) e NUNCA escreve em fonte alguma (somente leitura, Addendum §11).
 * Nenhum adaptador real (Epson/Gestor iFood) existe nesta fase.
 *
 * Relógio injetável (agora() em ms): nenhum Date.now() escondido — replay e
 * testes precisam de tempo determinístico.
 * ==========================================================================*/
"use strict";

const { validarEnvelope } = require("./contrato");
const { normalizarChangeMode } = require("./normalizar");
const { verificarChaveDeStatus } = require("./idempotencia");
const { criarRegistroDedup } = require("./dedup");
const { normalizarQualityDeEvento } = require("./qualidade");
const { criarQuarentena } = require("./quarentena");
const { criarConfig } = require("./config");
const consolidar = require("./consolidar");
const { montarSnapshot } = require("./snapshot");

// papel de uma fonte é EVIDÊNCIA (deduzido do que ela emite), nunca chute:
const PAPEL_POR_EVENTO = {
  comanda_impressa: "composicao",
  pedido_reimpresso: "composicao",
  pedido_alterado: "composicao",
  status_ifood: "status",
  pedido_vivo: "status",
  pedido_cancelado: "status"
};

function criarNucleo({ armazenamento, config, agora } = {}) {
  const cfg = config || criarConfig();
  const relogio = typeof agora === "function" ? agora : () => Date.now();
  const dedup = criarRegistroDedup();
  const estado = consolidar.criarEstadoConsolidacao();
  const quarentena = criarQuarentena(armazenamento);
  const fontes = new Map(); // source -> { ultimo_evento_em, last_trusted_at, desconectada_em, reconectada_em, papeis:Set }
  const contadores = {
    recebidos: 0,
    aceitos: 0,
    em_quarentena: 0,
    duplicados_event_id: 0,
    observacoes_repetidas: 0,
    linhas_invalidas: 0
  };
  let reconstruidoEm = null;

  function fonteDe(nome) {
    let f = fontes.get(nome);
    if (!f) {
      f = {
        source: nome,
        ultimo_evento_em: null,
        last_trusted_at: null,
        desconectada_em: null,
        reconectada_em: null,
        papeis: new Set()
      };
      fontes.set(nome, f);
    }
    return f;
  }

  function atualizarFonte(ev) {
    const f = fonteDe(ev.source);
    if (!f.ultimo_evento_em || ev.captured_at > f.ultimo_evento_em) {
      f.ultimo_evento_em = ev.captured_at;
    }
    const papel = PAPEL_POR_EVENTO[ev.event_type];
    if (papel) f.papeis.add(papel);

    // evidência de vida apaga desconexão anterior a este evento
    if (f.desconectada_em && !f.reconectada_em && ev.captured_at > f.desconectada_em) {
      f.reconectada_em = ev.captured_at;
    }
    // last_trusted_at: último instante em que a fonte era "atualizada" —
    // registrado quando o evento chega dentro do intervalo esperado.
    const idadeNaChegada = relogio() - Date.parse(ev.captured_at);
    if (idadeNaChegada <= cfg.freshness.atrasadaAposMs) {
      if (!f.last_trusted_at || ev.captured_at > f.last_trusted_at) {
        f.last_trusted_at = ev.captured_at;
      }
    }
  }

  function paraQuarentena(bruto, motivo, campo, persistir) {
    contadores.em_quarentena += 1;
    quarentena.registrar(bruto, motivo, { campo: campo || null },
      new Date(relogio()).toISOString(), persistir);
    return { aceito: false, destino: "quarentena", motivo, campo: campo || null };
  }

  /**
   * Recebe um evento bruto do contrato.
   * @param {object} bruto
   * @param {object} [opts] { persistir?: boolean }  persistir=false só no replay
   */
  function receber(bruto, opts) {
    const persistir = !opts || opts.persistir !== false;
    contadores.recebidos += 1;

    const validacao = validarEnvelope(bruto);
    if (!validacao.ok) return paraQuarentena(bruto, validacao.motivo, validacao.campo, persistir);

    const chaveStatus = verificarChaveDeStatus(bruto);
    if (!chaveStatus.ok) return paraQuarentena(bruto, chaveStatus.motivo, null, persistir);

    // normalização: carimbo de recepção + quality honesta + change_mode canônico
    const ev = {
      ...bruto,
      received_at: bruto.received_at || new Date(relogio()).toISOString(),
      correlation: bruto.correlation || {},
      quality: normalizarQualityDeEvento(bruto.quality)
    };

    let changeMode = null;
    if (ev.event_type === "pedido_alterado") {
      const norm = normalizarChangeMode(ev.payload.change_mode);
      if (!norm.modo) {
        return paraQuarentena(bruto, "change_mode_desconhecido", "payload.change_mode", persistir);
      }
      changeMode = norm.modo;
      if (norm.alias) ev.quality.parsing_warnings.push("change_mode_normalizado_de_alias");
    }

    // log append-only ANTES de processar: o fato observado é patrimônio.
    if (persistir && armazenamento) armazenamento.anexarEvento(ev);

    const resultadoDedup = dedup.registrar(ev);
    if (resultadoDedup.tipo === "evento_duplicado") {
      contadores.duplicados_event_id += 1;
      return { aceito: false, destino: "duplicado_ignorado", motivo: "event_id_ja_visto" };
    }

    atualizarFonte(ev);
    contadores.aceitos += 1;

    if (resultadoDedup.tipo === "observacao_repetida") {
      contadores.observacoes_repetidas += 1;
      const r = consolidar.aplicarObservacaoRepetida(estado, ev);
      return { aceito: true, destino: "observacao_repetida", resultado: r.tipo };
    }

    let r;
    switch (ev.event_type) {
      case "comanda_impressa":
        r = consolidar.aplicarComandaImpressa(estado, ev); break;
      case "status_ifood":
      case "pedido_vivo":
        r = consolidar.aplicarStatus(estado, ev); break;
      case "pedido_cancelado":
        r = consolidar.aplicarCancelamento(estado, ev); break;
      case "pedido_reimpresso":
        r = consolidar.aplicarPedidoReimpresso(estado, ev); break;
      case "pedido_alterado":
        r = consolidar.aplicarAlteracao(estado, ev, changeMode); break;
      case "fonte_conectada": {
        const f = fonteDe((ev.payload && ev.payload.source) || ev.source);
        f.reconectada_em = ev.captured_at;
        if (f.desconectada_em && f.reconectada_em > f.desconectada_em) f.desconectada_em = null;
        r = { tipo: "fonte_conectada" };
        break;
      }
      case "fonte_desconectada": {
        const f = fonteDe((ev.payload && ev.payload.source) || ev.source);
        f.desconectada_em = ev.occurred_at || ev.captured_at;
        f.reconectada_em = null;
        r = { tipo: "fonte_desconectada" };
        break;
      }
      default:
        r = { tipo: "ignorado" };
    }

    return { aceito: true, destino: "processado", resultado: r.tipo };
  }

  return {
    receber,
    snapshot() {
      return montarSnapshot({
        pedidos: consolidar.consolidarVisao(estado),
        fontes,
        quarentena,
        contadores: { ...contadores, ...estado.contadores },
        config: cfg,
        agoraMs: relogio(),
        reconstruidoEm
      });
    },
    // primitivas usadas pela reconstrução (reconstruir.js) — nunca re-persistem
    _marcarReconstruido(iso) { reconstruidoEm = iso; },
    _registrarLinhaInvalida(info) {
      contadores.linhas_invalidas += 1;
      contadores.em_quarentena += 1;
      quarentena.registrar(null, info.motivo, { origem: "reconstrucao" }, null, false);
    },
    _semearQuarentena(registros) {
      for (const reg of registros) {
        contadores.recebidos += 1;
        contadores.em_quarentena += 1;
        quarentena.registrar(reg.evento_bruto, reg.motivo,
          { campo: reg.campo, origem: reg.origem }, reg.recebido_em, false);
      }
    }
  };
}

module.exports = { criarNucleo };
