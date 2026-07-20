/* ============================================================================
 * Células operacionais do Copiloto — leitura honesta das fontes disponíveis.
 * ----------------------------------------------------------------------------
 * Módulo puro (sem DOM, sem motor) para ser testável server-side e carregado
 * no browser como window.CELULAS_OP — mesmo padrão de adaptador-v33.js.
 *
 * Cobre a parte da leitura que NÃO depende do motor:
 *   - estadoAgregado(): agregação visual de praças (Sushi) e praça única
 *     (Quentes, Cozinha) a partir das severidades que o motor já produziu.
 *   - leituraCaixa(): célula operacional derivada, leitura PARCIAL e honesta.
 *
 * Regras inegociáveis (ver docs/copiloto/CAIXA_OPERATIONAL_MODEL.md):
 *   - Caixa NÃO é praça canônica; só usa r/p/c, os únicos sinais reais hoje.
 *   - "Sobrecarregado" é INDISPONÍVEL: exigiria sinais combinados (sacola,
 *     comanda, retirada, mensagens, expedição, ocorrências) que não existem.
 *   - Fonte ausente NUNCA vira zero nem número inventado — vira "leitura
 *     parcial" / "fonte indisponível".
 * ==========================================================================*/
"use strict";

(function () {
  /* PROVISÓRIO · NÃO CALIBRADO — limiares existem só para a leitura existir;
   * não são verdade operacional nem pesos definitivos. */
  const CAIXA = {
    JANELA_MIN: 10,
    MOVIMENTO: 3,
    ATENCAO: 6,
    NOTA_PARCIAL: "Leitura parcial: sacolas, comandas, expedição e mensagens ainda não estão conectadas."
  };

  function corPorSev(sev) {
    return sev >= 3 ? "vermelho" : sev >= 1 ? "amarelo" : "verde";
  }

  /* Lista legível em português: "a", "a e b", "a, b e c". */
  function listarPt(itens) {
    if (!itens.length) return "";
    if (itens.length === 1) return itens[0];
    return itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1];
  }

  /**
   * Agregação visual de praças de produção. Severidade = a pior praça do
   * grupo; a leitura DIZ qual praça concentra a espera e quais seguem
   * estáveis. Nunca soma indicadores incompatíveis — só compara degraus
   * (severidades) que o motor já produziu por praça.
   *
   * @param {Object} sevPorPraca  { praca: severidade } já extraído do motor
   * @param {string[]} pracas     praças canônicas desta célula
   * @param {Object} displayMap   MOTOR.DISPLAY (rótulos humanos das praças)
   * @param {Object} [labelOverride] rótulo CONTEXTUAL por praça, para quando o
   *   DISPLAY do motor colide com o nome de OUTRA célula. Ex.: a praça
   *   `cozinha_quentes` tem DISPLAY "Quentes" (nome de outra célula); na célula
   *   Cozinha ela precisa aparecer como "Cozinha", não "Quentes". Só afeta o
   *   texto desta célula — o vínculo praça→célula e o DISPLAY do motor não mudam.
   * @returns {{cor,sev,pr,motivo}}
   */
  function estadoAgregado(sevPorPraca, pracas, displayMap, labelOverride) {
    const sp = sevPorPraca || {};
    const ovr = labelOverride || {};
    const nome = (p) => ovr[p] || (displayMap && displayMap[p]) || p;
    let sev = 0, pr = null;
    for (const p of pracas) {
      if ((sp[p] || 0) > sev) { sev = sp[p]; pr = p; }
    }
    let motivo;
    if (pr) {
      const estaveis = pracas.filter((p) => p !== pr && !(sp[p] > 0)).map(nome);
      motivo = nome(pr) + " concentra a maior espera.";
      if (estaveis.length) {
        motivo += " " + listarPt(estaveis) +
          (estaveis.length > 1 ? " seguem estáveis." : " segue estável.");
      }
    } else {
      motivo = pracas.length > 1
        ? listarPt(pracas.map(nome)) + " seguem estáveis."
        : nome(pracas[0]) + " segue estável.";
    }
    return { cor: corPorSev(sev), sev, pr, motivo };
  }

  /**
   * CAIXA — célula operacional derivada. Fontes reais hoje: r (recebido),
   * p (pronto), c (cancelado). O sinal honesto é a CONCENTRAÇÃO de pedidos
   * que ficaram prontos numa janela recente — não uma "fila" (sem carimbo de
   * saída não dá para saber o que já deixou a loja). Nunca produz
   * "Sobrecarregado".
   *
   * @param {Array} NIGHT janela do adaptador D4A ({r,p,c,...} em minutos)
   * @param {number} t     minuto de referência ("agora")
   * @returns {{cor,sev,n,frase,info,motivo}}
   */
  function leituraCaixa(NIGHT, t) {
    if (!Array.isArray(NIGHT) || t == null) {
      return {
        cor: "validacao", sev: 0, n: 0, frase: "fonte indisponível", info: "",
        motivo: "Não foi possível atualizar a leitura do Caixa. A operação continua, mas este estado pode estar desatualizado."
      };
    }
    let observados = 0, prontosJanela = 0;
    for (const o of NIGHT) {
      if (!o || o.r == null || o.r > t) continue;        // ainda não chegou
      if (o.c != null && o.c <= t) continue;             // cancelado
      observados++;
      if (o.p != null && o.p <= t && (t - o.p) <= CAIXA.JANELA_MIN) prontosJanela++;
    }
    if (!observados) {
      return {
        cor: "validacao", sev: 0, n: 0, frase: "leitura parcial", info: "",
        motivo: "Ainda não há pedidos observados nesta janela. " + CAIXA.NOTA_PARCIAL
      };
    }
    const info = prontosJanela
      ? (prontosJanela === 1 ? "1 pronto na janela" : prontosJanela + " prontos na janela")
      : "";
    if (prontosJanela >= CAIXA.ATENCAO) {
      return {
        cor: "amarelo", sev: 1, n: prontosJanela, frase: "atenção", info,
        motivo: prontosJanela + " pedidos ficaram prontos nos últimos " + CAIXA.JANELA_MIN +
          " min — concentração acima do normal. " + CAIXA.NOTA_PARCIAL
      };
    }
    if (prontosJanela >= CAIXA.MOVIMENTO) {
      return {
        cor: "verde", sev: 0, n: prontosJanela, frase: "em movimento", info,
        motivo: prontosJanela + " pedidos ficaram prontos nos últimos " + CAIXA.JANELA_MIN +
          " min. Fluxo dentro do esperado. " + CAIXA.NOTA_PARCIAL
      };
    }
    return {
      cor: "verde", sev: 0, n: prontosJanela, frase: "calmo", info,
      motivo: "Nenhuma concentração relevante de pedidos prontos nos últimos " +
        CAIXA.JANELA_MIN + " min. " + CAIXA.NOTA_PARCIAL
    };
  }

  const api = { CAIXA, corPorSev, listarPt, estadoAgregado, leituraCaixa };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    window.CELULAS_OP = api;
  }
})();
