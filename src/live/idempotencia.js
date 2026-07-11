/* ============================================================================
 * DeliveryOS · src/live · IDEMPOTÊNCIA
 * ----------------------------------------------------------------------------
 * Construção e verificação de idempotency_key.
 *
 * PAPÉIS DISTINTOS (Addendum §5): event_id identifica a OBSERVAÇÃO (cada
 * captura gera um novo); idempotency_key identifica o FATO (mesmo fato =>
 * mesma chave, processado uma vez).
 *
 * F3-04 (fechada aqui): a chave de status NÃO usa captured_at — captured_at é
 * momento de captura, não identidade do fato. A identidade do fato de status é
 * fonte + pedido + coluna + dia, mais revision/source_event_id QUANDO existirem.
 * Chave de status que embuta horário (hh:mm) é rejeitada para quarentena.
 * ==========================================================================*/
"use strict";

const { diaDe } = require("./normalizar");

/** Fato de status: sem tempo. Observações repetidas só atualizam carimbo. */
function chaveStatus({ source, ifood_short, dia, coluna, revision, source_event_id }) {
  let chave = `status:${source}:${ifood_short}:${dia}:${coluna}`;
  if (revision !== undefined && revision !== null) chave += `:rev=${revision}`;
  else if (source_event_id) chave += `:sev=${source_event_id}`;
  return chave;
}

function chaveComanda({ pedido_interno, hash_conteudo }) {
  return `comanda:${pedido_interno}:${hash_conteudo}`;
}

function chaveCancelamento({ source, ifood_short, dia }) {
  return `cancel:${source}:${ifood_short}:${dia}`;
}

function chaveReimpressao({ pedido_interno, emissao_nova }) {
  return `reimp:${pedido_interno}:${emissao_nova}`;
}

function chaveAlteracao({ pedido_interno, ifood_short, revision, source_event_id }) {
  const id = pedido_interno || ifood_short;
  const rev = (revision !== undefined && revision !== null) ? `rev=${revision}` : `sev=${source_event_id || "sem-id"}`;
  return `alter:${id}:${rev}`;
}

// Padrão de horário embutido: fragmento ISO com hora ("2026-07-11T19") ou
// relógio isolado ("19:05", "19:05:00") — um dia (YYYY-MM-DD) sozinho é
// legítimo na chave; hora não é. A fronteira de não-dígito evita falso
// positivo em segmentos numéricos vizinhos (ex.: "0724:2026-07-11").
// Heurística declarada: não detecta epoch arredondado — a norma continua
// valendo por contrato (Contrato do Núcleo §5), o teste só pega o padrão comum.
const PADRAO_HORARIO = /(\d{4}-\d{2}-\d{2}T\d{2})|(?:^|[^0-9])\d{2}:\d{2}(?::\d{2})?(?:[^0-9]|$)/;

/**
 * Guarda da F3-04: para eventos de status, rejeita idempotency_key que embuta
 * horário (captured_at arredondado ou não).
 * @returns {{ok:true}} ou {{ok:false, motivo:string}}
 */
function verificarChaveDeStatus(evento) {
  if (evento.event_type !== "status_ifood") return { ok: true };
  if (PADRAO_HORARIO.test(evento.idempotency_key)) {
    return { ok: false, motivo: "idempotency_key_de_status_com_horario" };
  }
  return { ok: true };
}

module.exports = {
  chaveStatus,
  chaveComanda,
  chaveCancelamento,
  chaveReimpressao,
  chaveAlteracao,
  verificarChaveDeStatus,
  diaDe
};
