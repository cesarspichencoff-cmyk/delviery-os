/* ============================================================================
 * DeliveryOS · app-v1 · MOCKS EXPLÍCITOS V3.3 (Fase 2A)
 * ----------------------------------------------------------------------------
 * Previsão, ação acompanhada, voz e fechamento — DEMONSTRAÇÃO.
 * Nunca misturar com dado live do motor. Sempre meta.simulated = true.
 * ==========================================================================*/
(function (root) {
  "use strict";

  const ACTION_STATES = [
    { id: "recomendacao", label: "Recomendação", copy: "Há uma ação sugerida para esta atenção." },
    { id: "aceita", label: "Aceita", copy: "A recomendação foi aceita." },
    { id: "assumiu", label: "Responsável assumiu", copy: "Alguém da função assumiu o acompanhamento." },
    { id: "andamento", label: "Em andamento", copy: "A ação está em curso na operação." },
    { id: "melhora", label: "Melhora", copy: "A pressão na área cedeu." },
    { id: "parcial", label: "Melhora parcial", copy: "Melhorou em parte; ainda há resíduo." },
    { id: "sem_resultado", label: "Sem resultado", copy: "A ação não produziu o efeito esperado." },
    { id: "colateral", label: "Efeito colateral", copy: "Outra área começou a pressionar." },
    { id: "encerramento", label: "Encerramento", copy: "A atenção se encerra. O organismo volta ao ritmo." }
  ];

  function forecastMock(areaName) {
    const area = areaName || "Conferência";
    return {
      simulated: true,
      demoLabel: "demonstração",
      horizon: "próximos 10 a 15 min",
      conditional: "se nada mudar",
      confidence: {
        level: "moderada",
        dots: "●●○",
        // confiança = qualidade da estimativa (cinza/tracejado) — NÃO âmbar
        visual: "confidence"
      },
      // gravidade fica no bloco de tensão (âmbar), separada
      text: "A " + area + " deve acumular de 4 a 6 pedidos se nada mudar.",
      note: "estimativa, não certeza · baseada no ritmo atual · demonstração",
      expanded: false
    };
  }

  function actionTrackMock(stateId, opts) {
    opts = opts || {};
    const idx = Math.max(0, ACTION_STATES.findIndex((s) => s.id === stateId));
    const st = ACTION_STATES[idx] || ACTION_STATES[0];
    return {
      simulated: true,
      demoLabel: "demonstração",
      stateId: st.id,
      stateLabel: st.label,
      copy: st.copy,
      // responsável funcional — sem ranking
      responsible: opts.responsible || {
        role: "Produção · Quentes",
        name: "Responsável da função",
        note: "função, não ranking"
      },
      onlyCurrent: true // nunca exibir 8 caixas
    };
  }

  function voiceMock(phase) {
    const phases = {
      idle: { phase: "idle", hint: "Fale sobre a operação" },
      listening: { phase: "listening", hint: "Ouvindo…", demoLabel: "demonstração" },
      transcript: {
        phase: "transcript",
        transcript: "Como está a Conferência?",
        demoLabel: "demonstração"
      },
      answer: {
        phase: "answer",
        conclusion: "Conferência sob pressão moderada.",
        detail: "Há pedidos pedindo reforço. Área citada reage no organismo.",
        needsConfirm: true,
        areaCite: "Conferência",
        demoLabel: "demonstração"
      },
      ambiguity: {
        phase: "ambiguity",
        message: "Não ficou claro. Quer falar da Conferência ou da saída?",
        demoLabel: "demonstração"
      },
      fail: {
        phase: "fail",
        message: "Não entendi. Tente de novo quando puder.",
        demoLabel: "demonstração"
      },
      done: { phase: "done", message: "Registrado. Voltando à operação.", demoLabel: "demonstração" }
    };
    const p = phases[phase] || phases.idle;
    return Object.assign({ simulated: true }, p);
  }

  function closingMock(step) {
    return {
      simulated: true,
      demoLabel: "demonstração",
      step: step || 0,
      // 0 resumo, 1 pergunta1, 2 pergunta2, 3 done
      summaryReady: true,
      timeHint: "até dois minutos",
      question: step === 1
        ? { n: "1 de 2", text: "O que mais pesou neste turno?" }
        : step === 2
          ? { n: "2 de 2", text: "Algo que o sistema não viu?" }
          : null,
      transcript: step >= 2 ? "Pico na saída por volta das 21h." : null,
      confirmed: step >= 3,
      options: ["Não sei", "Pular"]
    };
  }

  /** Catálogo QA interno (~15 momentos) — NÃO é home do produto */
  const QA_CATALOG = [
    { id: "calmo", name: "Calmo · nada exige você", mode: "force-calmo" },
    { id: "ambiente", name: "Ambiente · pressão surgindo", mode: "force-ambiente" },
    { id: "foco", name: "Foco · atenção dominante", mode: "force-foco" },
    { id: "previsao", name: "Previsão 10–15 min (demo)", mode: "force-foco", mock: "forecast" },
    { id: "acao_aceita", name: "Ação · aceita", mode: "force-foco", mock: "action", state: "aceita" },
    { id: "acao_assumiu", name: "Ação · responsável assumiu", mode: "force-foco", mock: "action", state: "assumiu" },
    { id: "acao_melhora", name: "Ação · melhora", mode: "force-foco", mock: "action", state: "melhora" },
    { id: "acao_parcial", name: "Ação · melhora parcial", mode: "force-foco", mock: "action", state: "parcial" },
    { id: "acao_sem", name: "Ação · sem resultado", mode: "force-foco", mock: "action", state: "sem_resultado" },
    { id: "acao_colateral", name: "Ação · efeito colateral", mode: "force-foco", mock: "action", state: "colateral" },
    { id: "acao_fim", name: "Ação · encerramento", mode: "force-foco", mock: "action", state: "encerramento" },
    { id: "voz", name: "Voz · demonstração", mode: "voice" },
    { id: "fechamento", name: "Fechamento de turno (demo)", mode: "closing" },
    { id: "tech_stale", name: "Técnico · dado atrasado", mode: "tech", status: "stale" },
    { id: "tech_fail", name: "Técnico · falha", mode: "tech", status: "failed" },
    { id: "tech_disc", name: "Técnico · conexão perdida", mode: "tech", status: "disconnected" }
  ];

  root.V33_MOCKS = {
    ACTION_STATES,
    forecastMock,
    actionTrackMock,
    voiceMock,
    closingMock,
    QA_CATALOG
  };
})(typeof window !== "undefined" ? window : global);
