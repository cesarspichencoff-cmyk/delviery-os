/* ============================================================================
 * DeliveryOS · tools/live/simulator · RELÓGIO DETERMINÍSTICO
 * ----------------------------------------------------------------------------
 * Tempo simulado, nunca o relógio real: define horário inicial, avança só por
 * comando e responde sempre o mesmo valor para a mesma sequência de comandos.
 * Duas execuções idênticas => mesmos carimbos, byte a byte.
 * ==========================================================================*/
"use strict";

function criarRelogioSimulado(inicioIso) {
  const inicioMs = Date.parse(inicioIso);
  if (Number.isNaN(inicioMs)) {
    throw new Error("relogio_inicio_invalido: informe um ISO valido");
  }
  let atualMs = inicioMs;

  return {
    /** ms atuais do MUNDO SIMULADO — injetável como agora() do núcleo */
    agora: () => atualMs,
    agoraIso: () => new Date(atualMs).toISOString(),
    inicioMs: () => inicioMs,
    avancar(ms) {
      if (!Number.isFinite(ms) || ms < 0) throw new Error("relogio_avanco_invalido");
      atualMs += ms;
      return atualMs;
    },
    avancarPara(ms) {
      if (!Number.isFinite(ms) || ms < atualMs) {
        throw new Error("relogio_nao_anda_para_tras");
      }
      atualMs = ms;
      return atualMs;
    }
  };
}

module.exports = { criarRelogioSimulado };
