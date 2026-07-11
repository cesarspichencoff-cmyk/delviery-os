/* ============================================================================
 * DeliveryOS · src/live · QUARENTENA
 * ----------------------------------------------------------------------------
 * Destino de todo evento que não pode ser aceito com segurança:
 * schema_version ausente/desconhecida, envelope inválido, identificadores
 * essenciais incompatíveis, payload fora do contrato, linha JSONL corrompida,
 * atualização sem segurança para aplicar.
 *
 * Regras:
 *  - Preserva o evento bruto QUANDO SEGURO; quando a rejeição é por dado
 *    pessoal, guarda só o nome do campo ofensor — nunca o valor.
 *  - Registra o motivo (código estável).
 *  - Nunca interrompe o processamento dos eventos seguintes.
 *  - Nunca alimenta o snapshot operacional (aparece só como contagem/motivos).
 *  - Mensagens sem dados pessoais.
 * ==========================================================================*/
"use strict";

function criarQuarentena(armazenamento) {
  const registros = [];

  return {
    /**
     * @param {object|null} eventoBruto  evento como chegou (ou null p/ linha corrompida)
     * @param {string} motivo            código estável (ex.: "schema_version_ausente")
     * @param {object} [contexto]        { campo, origem } — nomes, nunca valores
     * @param {string} [recebidoEm]      ISO da recepção
     * @param {boolean} [persistir=true] false só no replay (o arquivo já tem o registro)
     */
    registrar(eventoBruto, motivo, contexto, recebidoEm, persistir) {
      const seguroGuardarBruto = motivo !== "dado_pessoal_nao_permitido";
      const registro = {
        motivo,
        campo: (contexto && contexto.campo) || null,
        origem: (contexto && contexto.origem) || "recepcao",
        recebido_em: recebidoEm || null,
        event_id: (eventoBruto && eventoBruto.event_id) || null,
        event_type: (eventoBruto && eventoBruto.event_type) || null,
        evento_bruto: seguroGuardarBruto ? eventoBruto : null
      };
      registros.push(registro);
      if (armazenamento && persistir !== false) armazenamento.anexarQuarentena(registro);
      return registro;
    },

    total: () => registros.length,
    porMotivo() {
      const mapa = {};
      for (const r of registros) mapa[r.motivo] = (mapa[r.motivo] || 0) + 1;
      return mapa;
    },
    registros: () => registros.slice()
  };
}

module.exports = { criarQuarentena };
