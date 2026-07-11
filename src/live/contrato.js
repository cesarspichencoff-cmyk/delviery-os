/* ============================================================================
 * DeliveryOS · src/live · CONTRATO DE EVENTOS
 * ----------------------------------------------------------------------------
 * Envelope obrigatório (Addendum §5) e validação de entrada do núcleo.
 *
 * Regras invioláveis:
 *  - Evento sem schema_version NUNCA é aceito silenciosamente => quarentena.
 *  - Versão desconhecida NUNCA é aceita silenciosamente => quarentena.
 *  - Dados pessoais não operacionais (telefone, endereço, nome de cliente)
 *    NÃO têm campo no envelope — presença deles rejeita o evento; mensagens
 *    de erro citam só o NOME do campo, nunca o valor.
 *  - Campo ausente = ausente. Validar não é preencher.
 * ==========================================================================*/
"use strict";

const SCHEMA_VERSIONS_SUPORTADAS = Object.freeze(["1.0"]);

const EVENT_TYPES = Object.freeze([
  "comanda_impressa",
  "status_ifood",
  "pedido_cancelado",
  "pedido_reimpresso",
  "pedido_alterado",
  "fonte_conectada",
  "fonte_desconectada",
  "pedido_vivo" // heartbeat de observação (Addendum §5) — fato real "pedido segue visível"
]);

const COMPLETENESS = Object.freeze(["complete", "partial", "suspect", "unknown"]);

// Privacidade (F2-01): a lista proibida e a varredura RECURSIVA moram em
// sanitizar.js — objetos, arrays e objetos dentro de arrays, em qualquer
// profundidade (limitada), case-insensitive. O que não existe no schema não vaza.
const { CAMPOS_PROIBIDOS, acharCampoProibido } = require("./sanitizar");

const ehString = (v) => typeof v === "string" && v.length > 0;
const ehObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const ehIsoOuNull = (v) => v === null || v === undefined ||
  (typeof v === "string" && !Number.isNaN(Date.parse(v)));

/**
 * Valida o envelope de um evento bruto.
 * @returns {{ok:true}} ou {{ok:false, motivo:string, campo?:string}}
 * Motivos são códigos estáveis, sem nenhum valor de dado do evento.
 */
function validarEnvelope(ev) {
  if (!ehObjeto(ev)) return { ok: false, motivo: "envelope_invalido" };

  // schema_version primeiro: sem versão ou versão desconhecida => quarentena.
  if (!ehString(ev.schema_version)) return { ok: false, motivo: "schema_version_ausente" };
  if (!SCHEMA_VERSIONS_SUPORTADAS.includes(ev.schema_version)) {
    return { ok: false, motivo: "schema_version_desconhecida" };
  }

  if (!ehString(ev.event_id)) return { ok: false, motivo: "event_id_ausente" };
  if (!ehString(ev.event_type)) return { ok: false, motivo: "event_type_ausente" };
  if (!EVENT_TYPES.includes(ev.event_type)) return { ok: false, motivo: "event_type_desconhecido" };
  if (!ehString(ev.source)) return { ok: false, motivo: "source_ausente" };
  if (!ehString(ev.idempotency_key)) return { ok: false, motivo: "idempotency_key_ausente" };

  // captured_at é obrigatório (momento em que o adaptador observou).
  if (!ehString(ev.captured_at) || Number.isNaN(Date.parse(ev.captured_at))) {
    return { ok: false, motivo: "captured_at_invalido" };
  }
  // occurred_at/received_at: null permitido (não observado ≠ inventado).
  if (!ehIsoOuNull(ev.occurred_at)) return { ok: false, motivo: "occurred_at_invalido" };
  if (!ehIsoOuNull(ev.received_at)) return { ok: false, motivo: "received_at_invalido" };

  if (ev.correlation !== undefined && ev.correlation !== null && !ehObjeto(ev.correlation)) {
    return { ok: false, motivo: "correlation_invalida" };
  }
  if (!ehObjeto(ev.payload)) return { ok: false, motivo: "payload_ausente" };
  if (ev.quality !== undefined && ev.quality !== null && !ehObjeto(ev.quality)) {
    return { ok: false, motivo: "quality_invalida" };
  }

  // privacidade (F2-01): varredura RECURSIVA — nenhum campo proibido em
  // NENHUMA profundidade do evento (objetos, arrays, objetos em arrays).
  const pii = acharCampoProibido(ev, "", 0);
  if (pii) {
    if (pii.profundidade_excedida) {
      return { ok: false, motivo: "estrutura_profunda_demais" };
    }
    return { ok: false, motivo: "dado_pessoal_nao_permitido", campo: pii.campo };
  }

  // identificadores essenciais por tipo (incompatíveis => quarentena)
  const corr = ev.correlation || {};
  const pay = ev.payload;
  switch (ev.event_type) {
    case "comanda_impressa":
      if (!ehString(corr.pedido_interno) && !ehString(pay.pedido_interno)) {
        return { ok: false, motivo: "identificador_essencial_ausente", campo: "pedido_interno" };
      }
      if (!Array.isArray(pay.itens)) {
        return { ok: false, motivo: "payload_incompativel", campo: "itens" };
      }
      break;
    case "status_ifood":
    case "pedido_vivo":
      if (!ehString(corr.ifood_short) && !ehString(pay.ifood_short)) {
        return { ok: false, motivo: "identificador_essencial_ausente", campo: "ifood_short" };
      }
      if (!ehString(pay.coluna)) {
        return { ok: false, motivo: "payload_incompativel", campo: "coluna" };
      }
      break;
    case "pedido_cancelado":
      if (!ehString(corr.ifood_short) && !ehString(pay.ifood_short)) {
        return { ok: false, motivo: "identificador_essencial_ausente", campo: "ifood_short" };
      }
      break;
    case "pedido_reimpresso":
      if (!ehString(corr.pedido_interno) && !ehString(pay.pedido_interno)) {
        return { ok: false, motivo: "identificador_essencial_ausente", campo: "pedido_interno" };
      }
      break;
    case "pedido_alterado":
      if (!ehString(pay.change_mode)) {
        return { ok: false, motivo: "payload_incompativel", campo: "change_mode" };
      }
      if (!ehString(corr.pedido_interno) && !ehString(pay.pedido_interno) &&
          !ehString(corr.ifood_short) && !ehString(pay.ifood_short)) {
        return { ok: false, motivo: "identificador_essencial_ausente", campo: "pedido_interno|ifood_short" };
      }
      break;
    case "fonte_conectada":
    case "fonte_desconectada":
      // source do envelope basta; payload pode detalhar motivo/último evento.
      break;
    default:
      return { ok: false, motivo: "event_type_desconhecido" };
  }

  return { ok: true };
}

module.exports = {
  SCHEMA_VERSIONS_SUPORTADAS,
  EVENT_TYPES,
  COMPLETENESS,
  CAMPOS_PROIBIDOS,
  validarEnvelope
};
