/* ============================================================================
 * DeliveryOS · src/live · RECONSTRUÇÃO
 * ----------------------------------------------------------------------------
 * Reinício = replay do próprio log (Auditoria Mestra §7): reconstrói o estado
 * SOMENTE do que está em disco, sem pedir nada a ninguém e sem duplicar
 * pedidos já vistos (idempotência por construção — mesmas linhas => mesmo
 * snapshot).
 *
 * Durante o replay NADA é re-persistido (o log já é a verdade). Linha
 * corrompida/truncada é contada e vai para a quarentena em memória, nunca
 * derruba a reconstrução. Registros de quarentena persistidos em sessões
 * anteriores são semeados de volta (contagem/motivos sobrevivem ao reinício).
 * ==========================================================================*/
"use strict";

const { criarNucleo } = require("./nucleo");
const { criarArmazenamento } = require("./persistir");

/**
 * Reconstrói um núcleo a partir do log em runtimeRoot.
 * @returns {{nucleo:object, relatorio:object}}
 */
function reconstruirDoLog({ runtimeRoot, armazenamento, config, agora }) {
  const arm = armazenamento || criarArmazenamento({ runtimeRoot });
  const nucleo = criarNucleo({ armazenamento: arm, config, agora });
  const relogio = typeof agora === "function" ? agora : () => Date.now();

  // 1. quarentena persistida em sessões anteriores volta como memória
  const quarentenaLida = arm.lerQuarentena();
  nucleo._semearQuarentena(quarentenaLida.registros);

  // 2. replay do log de eventos, sem re-persistir
  const { registros, linhas_invalidas } = arm.lerEventos();
  for (const li of linhas_invalidas) nucleo._registrarLinhaInvalida(li);
  for (const ev of registros) nucleo.receber(ev, { persistir: false });

  nucleo._marcarReconstruido(new Date(relogio()).toISOString());

  return {
    nucleo,
    relatorio: {
      eventos_relidos: registros.length,
      linhas_invalidas: linhas_invalidas.length,
      quarentena_semeada: quarentenaLida.registros.length,
      linhas_invalidas_quarentena: quarentenaLida.linhas_invalidas.length
    }
  };
}

module.exports = { reconstruirDoLog };
