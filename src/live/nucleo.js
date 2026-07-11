/* ============================================================================
 * DeliveryOS · src/live · NÚCLEO (orquestração)
 * ----------------------------------------------------------------------------
 * Liga as peças na ORDEM endurecida da Fase 2.1 (F2-01/02/03/04):
 *   1. validar envelope (inclui PII recursiva)
 *   2. normalizar por allowlist (só campos operacionais persistem)
 *   3. detectar clock skew (captured_at × received_at — determinístico)
 *   4. calcular identidade de conteúdo
 *   5. consultar deduplicação  ← ANTES de qualquer append
 *   6. persistir somente quando apropriado
 *   7. aplicar ao estado
 *   8. atualizar índices
 *
 * O núcleo NUNCA sabe qual adaptador o alimenta e NUNCA escreve em fonte
 * alguma (somente leitura, Addendum §11). Relógio injetável (agora() em ms):
 * nenhum Date.now() escondido — replay e testes exigem tempo determinístico.
 * ==========================================================================*/
"use strict";

const { validarEnvelope } = require("./contrato");
const { normalizarChangeMode } = require("./normalizar");
const { verificarChaveDeStatus } = require("./idempotencia");
const { criarRegistroDedup } = require("./dedup");
const { normalizarQualityDeEvento } = require("./qualidade");
const { criarQuarentena } = require("./quarentena");
const { criarConfig } = require("./config");
const { normalizarPorAllowlist, hashConteudoEvento } = require("./sanitizar");
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

/** push idempotente: replay re-detecta as mesmas condições sobre a quality já
 * persistida — o aviso não pode duplicar a cada reconstrução. */
function avisar(ev, aviso) {
  if (!ev.quality.parsing_warnings.includes(aviso)) ev.quality.parsing_warnings.push(aviso);
}

function criarNucleo({ armazenamento, config, agora } = {}) {
  const cfg = config || criarConfig();
  const relogio = typeof agora === "function" ? agora : () => Date.now();
  const dedup = criarRegistroDedup();
  const estado = consolidar.criarEstadoConsolidacao(cfg);
  const quarentena = criarQuarentena(armazenamento);
  const fontes = new Map(); // source -> { ultimo_evento_em, last_trusted_at, desconectada_em, reconectada_em, papeis:Set }
  // contadores de RECEPÇÃO — escopo de sessão (não sobrevivem ao reinício por
  // desenho: duplicatas e quarentenas não são re-anexadas ao log — F2-04)
  const recepcao = {
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
    const papel = PAPEL_POR_EVENTO[ev.event_type];
    if (papel) f.papeis.add(papel);

    // F2-03: carimbo com relógio inconsistente NÃO avança nada temporal —
    // nem ultimo_evento_em, nem last_trusted_at, nem reconexão.
    if (ev.quality && ev.quality.clock_skew_detected) return;

    if (!f.ultimo_evento_em || ev.captured_at > f.ultimo_evento_em) {
      f.ultimo_evento_em = ev.captured_at;
    }
    // evidência de vida apaga desconexão anterior a este evento
    if (f.desconectada_em && !f.reconectada_em && ev.captured_at > f.desconectada_em) {
      f.reconectada_em = ev.captured_at;
    }
    // last_trusted_at: último instante em que a fonte era "atualizada" —
    // registrado quando o evento chega dentro do intervalo esperado.
    const idadeNaChegada = relogio() - Date.parse(ev.captured_at);
    if (idadeNaChegada >= 0 && idadeNaChegada <= cfg.freshness.atrasadaAposMs) {
      if (!f.last_trusted_at || ev.captured_at > f.last_trusted_at) {
        f.last_trusted_at = ev.captured_at;
      }
    }
  }

  function paraQuarentena(evento, motivo, campo, persistir) {
    recepcao.em_quarentena += 1;
    quarentena.registrar(evento, motivo, { campo: campo || null },
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
    recepcao.recebidos += 1;

    // 1. validar (inclui varredura recursiva de PII — F2-01)
    const validacao = validarEnvelope(bruto);
    if (!validacao.ok) return paraQuarentena(bruto, validacao.motivo, validacao.campo, persistir);

    const chaveStatus = verificarChaveDeStatus(bruto);
    if (!chaveStatus.ok) return paraQuarentena(bruto, chaveStatus.motivo, null, persistir);

    // 2. normalizar por allowlist: nada além do contrato chega ao disco (F2-01)
    const { evento: ev, descartados } = normalizarPorAllowlist(bruto);
    ev.received_at = bruto.received_at || new Date(relogio()).toISOString();
    ev.correlation = ev.correlation || {};
    ev.quality = normalizarQualityDeEvento(bruto.quality);
    if (descartados.length > 0) {
      // só NOMES de campos descartados — valores nunca são registrados
      avisar(ev, `campos_descartados:${descartados.join(",")}`);
    }

    let changeMode = null;
    if (ev.event_type === "pedido_alterado") {
      const norm = normalizarChangeMode(ev.payload.change_mode);
      if (!norm.modo) {
        return paraQuarentena(ev, "change_mode_desconhecido", "payload.change_mode", persistir);
      }
      changeMode = norm.modo;
      if (norm.alias) avisar(ev, "change_mode_normalizado_de_alias");
    }

    // 3. clock skew (F2-03): determinístico — captured_at × received_at;
    // no replay o received_at persistido preserva a decisão original.
    const skewMs = Date.parse(ev.captured_at) - Date.parse(ev.received_at);
    if (Number.isFinite(skewMs) && skewMs > cfg.freshness.clockSkewToleranceMs) {
      ev.quality.clock_skew_detected = true;
      ev.quality.clock_skew_ms = skewMs;
      ev.quality.completeness = "suspect";
      avisar(ev, "relogio_inconsistente_captured_at_futuro");
    }

    // 4-5. identidade + dedup ANTES do append (F2-04)
    const hashConteudo = hashConteudoEvento(ev);
    const d = dedup.consultar(ev, hashConteudo);

    if (d.tipo === "evento_duplicado") {
      // mesma observação, mesmo conteúdo: sem append, sem estado, sem snapshot
      recepcao.duplicados_event_id += 1;
      return { aceito: false, destino: "duplicado_ignorado", motivo: "event_id_ja_visto" };
    }
    if (d.tipo === "evento_divergente") {
      // mesmo event_id com conteúdo DIVERGENTE: anomalia — nunca substitui o
      // evento aceito; registro sanitizado em quarentena.
      return paraQuarentena(ev, "event_id_reutilizado_com_conteudo_divergente", null, persistir);
    }
    if (d.tipo === "fato_divergente") {
      // mesma idempotency_key com conteúdo incompatível: conflito registrado;
      // o fato original aceito é preservado.
      return paraQuarentena(ev, "idempotency_key_reutilizada_com_conteudo_divergente", null, persistir);
    }

    if (d.tipo === "observacao_repetida") {
      // mesmo fato reobservado: SEM segundo append (F2-04); carimbos em
      // memória avançam (limitação de replay declarada no Contrato §17).
      dedup.registrar(ev, hashConteudo);
      atualizarFonte(ev);
      recepcao.aceitos += 1;
      recepcao.observacoes_repetidas += 1;
      const r = consolidar.aplicarObservacaoRepetida(estado, ev);
      return { aceito: true, destino: "observacao_repetida", resultado: r.tipo };
    }

    // 6. novo fato: persistir ANTES de aplicar (o fato observado é patrimônio)
    if (persistir && armazenamento) armazenamento.anexarEvento(ev);

    // 7-8. aplicar ao estado e atualizar índices
    dedup.registrar(ev, hashConteudo);
    atualizarFonte(ev);
    recepcao.aceitos += 1;

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
        contadoresEstado: estado.contadores,
        recepcao,
        config: cfg,
        agoraMs: relogio(),
        reconstruidoEm
      });
    },
    // primitivas usadas pela reconstrução (reconstruir.js) — nunca re-persistem
    _marcarReconstruido(iso) { reconstruidoEm = iso; },
    _registrarLinhaInvalida(info) {
      recepcao.linhas_invalidas += 1;
      recepcao.em_quarentena += 1;
      quarentena.registrar(null, info.motivo, { origem: "reconstrucao" }, null, false);
    },
    _semearQuarentena(registros) {
      for (const reg of registros) {
        recepcao.recebidos += 1;
        recepcao.em_quarentena += 1;
        quarentena.registrar(reg.evento_bruto, reg.motivo,
          { campo: reg.campo, origem: reg.origem }, reg.recebido_em, false);
      }
    }
  };
}

module.exports = { criarNucleo };
