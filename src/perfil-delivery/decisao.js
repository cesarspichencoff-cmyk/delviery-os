/* ============================================================================
 * DeliveryOS · Perfil Delivery · CAMADA DE DECISÃO
 * ----------------------------------------------------------------------------
 * "O DeliveryOS não mostra mais problemas. Ele reduz decisões."
 *
 * Camada pequena ACIMA dos sinais: recebe a fotografia do minuto (MOTOR.step)
 * e devolve UMA ação recomendada, ranqueada por impacto físico:
 *   "se você olhar uma coisa agora, olhe isso."
 *
 * Não decide pela equipe. Não prevê. Não inventa. Só ranqueia o que os sinais
 * já provaram, e explica: por quê · primeiro olhar · impacto · confiança · dados.
 *
 * Confiança é proporcional à fonte do dado:
 *   - ações de TEMPO/ESTADO (motor A, real)            → alta
 *   - ações de COMPOSIÇÃO (motor B, sintético hoje)    → média (sobe p/ alta com item real)
 *   - evidência fraca (sev 1 / nada a destravar)       → baixa
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./motor.js"));
  else root.DECISAO = factory(root.MOTOR);
})(typeof window !== "undefined" ? window : globalThis, function (M) {
  "use strict";
  const D = M.DISPLAY, F = M.FLOORS;

  /* pedido âncora de uma praça: o que mais segura fluxo (espera × nº de bancadas que ocupa).
     Combinado/menu ganha desempate — é o que trava o pedido inteiro. */
  function ancoraDaPraca(p, wP, INFO) {
    let best = null, bs = -1;
    for (const w of wP) {
      const I = INFO[w.id]; if (!I || I.benches.indexOf(p) < 0) continue;
      const sc = w.min * Math.max(1, I.nBenches) + (I.ancora ? 60 : 0);
      if (sc > bs) { bs = sc; best = { id: w.id, min: w.min, I }; }
    }
    return best;
  }

  function dadosUsados(fonteReal) {
    return "tempos reais (iFood) · cardápio real (199 itens) · " +
           (fonteReal ? "itens reais por pedido" : "composição sintética");
  }

  /* RESTRIÇÃO DE ESCOPO (docs/Contrato_Motor_Decisao.md §10, docs/Decisao_Correcao_Motor_Decisao.md):
     sess.active.sit é a fonte da verdade da atenção. Quando existe foco ativo (opts.active),
     um candidato só pode vencer se for causalmente ligado à MESMA causa raiz do foco — nunca
     inteligência nova, só restrição de quem pode competir. Sem opts.active, nada muda (compat). */
  function dentroDoEscopo(c, ativo) {
    const sit = ativo.sit;
    switch (sit.kind) {
      case "praca":
        return (c.tipo === "priorizar_praca" || c.tipo === "fechar_simples") && c.praca === sit.praca;
      case "saida":
        return c.tipo === "chamar_motoboy" || c.tipo === "conferir_saida";
      case "fechamento":
        if (c.tipo === "fechar_simples") return (c.ids || []).indexOf(sit.id) >= 0;
        if (c.tipo === "olhar_pedido" || c.tipo === "conferir_saida") return c.id === sit.id;
        return false;
      case "conferencia":
        return c.tipo === "conferencia" && c.id === sit.id;
      case "order":
        return (c.tipo === "olhar_pedido" || c.tipo === "conferir_saida") && c.id === sit.id;
      default:
        return false;
    }
  }

  /* decidir(snap, INFO, opts) → melhor próxima ação ou null (calmo = silêncio, ou nenhum
     candidato sobrevive ao escopo do foco ativo — cai para buildFoco() puro no chamador).
     snap = retorno de MOTOR.step (t, sits, ctx{wE,wP,load}).
     opts = { fonteReal: boolean, active: sess.active } — active restringe candidatos à
     mesma causa raiz do foco ativo; fonteReal sobe a confiança quando itens reais entram. */
  function decidir(snap, INFO, opts) {
    opts = opts || {};
    const fonteReal = !!opts.fonteReal;
    const ativo = (opts.active && opts.active.sit) ? opts.active : null;
    const sits = snap.sits || [], ctx = snap.ctx || { wE: [], wP: [], load: {} };
    if (!sits.length) return null;
    const cands = [];
    const confComp = (fraca) => fraca ? "baixa" : (fonteReal ? "alta" : "média");

    // 1) PRIORIZAR PRAÇA — release impact: quantos pedidos saem se a praça liberar
    for (const s of sits) {
      if (s.kind !== "praca") continue;
      const anc = ancoraDaPraca(s.praca, ctx.wP, INFO);
      const unblock = s.unblock || 0;
      cands.push({
        tipo: "priorizar_praca", dependeComposicao: true, sev: s.sev, praca: s.praca,
        score: unblock * 2 + s.n * 0.5 + s.sev,
        head: "PRIORIZE " + D[s.praca].toUpperCase(),
        acao: "Priorizar " + D[s.praca],
        porque: unblock > 0
          ? unblock + " pedido" + (unblock > 1 ? "s" : "") + " sae" + (unblock > 1 ? "m" : "") + " se " + D[s.praca] + " liberar"
          : s.n + " pedidos na praça, acima do normal",
        primeiro: anc ? ("#" + anc.id + (anc.I.ancora ? " (combinado)" : "")) : ("bancada de " + D[s.praca]),
        impacto: unblock > 0 ? ("libera " + unblock + " saída" + (unblock > 1 ? "s" : "") + " · reduz atraso")
                             : ("desafoga a bancada"),
        confianca: confComp(s.sev <= 1 && unblock === 0)
      });
    }

    // 2) FECHAR PEDIDOS SIMPLES — dependem de UMA praça só e já esperam
    {
      const simples = ctx.wP.filter(w => { const I = INFO[w.id]; return I && I.pracaUnica && w.min > F.PROD * 0.5; })
                            .sort((a, b) => b.min - a.min);
      if (simples.length >= 2) {
        const ids = simples.slice(0, 3).map(w => "#" + w.id).join(", ");
        const pr = INFO[simples[0].id].pracaUnica;
        cands.push({
          tipo: "fechar_simples", dependeComposicao: true, sev: 2, natureza: "oportunidade",
          praca: pr, ids: simples.map(w => w.id),
          score: simples.length * 1.5 + 1,
          head: "FECHE PEDIDOS SIMPLES",
          acao: "Fechar pedidos simples agora",
          porque: simples.length + " pedidos dependem só de " + D[pr] + ", sem mais pendências",
          primeiro: ids,
          impacto: simples.length + " pedidos saem da fila",
          confianca: confComp(false)
        });
      }
    }

    // 3) CHAMAR MOTOBOY — prontos parados virando atraso (dado 100% real)
    {
      const ew = ctx.wE.filter(x => x.min > F.EXPED).sort((a, b) => b.min - a.min);
      if (ew.length >= F.SURGE) {
        cands.push({
          tipo: "chamar_motoboy", dependeComposicao: false, sev: ew.length >= 6 ? 3 : 2,
          score: ew.length * 1.8 + 2,
          head: "CHAME MOTOBOY",
          acao: "Chamar motoboy agora",
          porque: ew.length + " prontos há mais de " + F.EXPED + " min",
          primeiro: "#" + ew[0].id + " · " + Math.round(ew[0].min) + " min",
          impacto: "todos viram atraso de entrega",
          confianca: "alta"
        });
      }
    }

    // 4) CONFERÊNCIA REFORÇADA — 2 sacolas / bebida / kit / observação
    for (const s of sits) {
      if (s.kind !== "conferencia") continue;
      const I = s.I, extras = [];
      if (I.sacolas >= 2) extras.push(I.sacolas + " sacolas");
      if (I.contemBebida) extras.push("bebida");
      if (I.contemKit) extras.push("kit");
      if (I.temObservacao) extras.push("observação");
      cands.push({
        tipo: "conferencia", dependeComposicao: true, sev: s.sev, id: s.id,
        score: (I.temObservacao ? 3 : 2) + (I.segundaSacola ? 2 : 0),
        head: "CONFIRA O #" + s.id,
        acao: "Conferência reforçada",
        porque: extras.join(" · "),
        primeiro: I.temObservacao ? ("obs: “" + String(I.observacoes[0]).slice(0, 40) + "”") : ("#" + s.id + " na montagem"),
        impacto: "evita item esquecido" + (I.segundaSacola ? " e 2ª sacola perdida" : ""),
        confianca: confComp(!I.segundaSacola && !I.temObservacao)
      });
    }

    // 5) PEDIDO PRESO / SEM SAIR — outlier individual (timing real)
    for (const s of sits) {
      if (s.kind !== "order") continue;
      const exped = s.zona === "Expedição";
      cands.push({
        tipo: exped ? "conferir_saida" : "olhar_pedido", dependeComposicao: !exped, sev: s.sev, id: s.id,
        score: s.peak / 25 + s.sev,
        head: exped ? ("CONFIRA A SAÍDA DO #" + s.id) : ("OLHE O #" + s.id),
        acao: exped ? "Conferir saída do #" + s.id : "Olhar pedido #" + s.id,
        porque: exped ? ("pronto há " + s.peak + " min sem sair") : (s.peak + " min sem ficar pronto — fora do padrão"),
        primeiro: "#" + s.id,
        impacto: exped ? "evita atraso e reclamação" : "destrava o mais atrasado da produção",
        confianca: exped ? "alta" : confComp(false)
      });
    }

    if (!cands.length) return null;
    const elegiveis = ativo ? cands.filter(c => dentroDoEscopo(c, ativo)) : cands;
    if (!elegiveis.length) return null;   // nenhum candidato na causa raiz do foco ativo → buildFoco() puro
    elegiveis.sort((a, b) => b.score - a.score || b.sev - a.sev);
    const top = elegiveis[0];
    top.dados = dadosUsados(fonteReal);
    top.todas = elegiveis.map(c => ({ tipo: c.tipo, acao: c.acao, score: Math.round(c.score * 10) / 10, confianca: c.confianca, dependeComposicao: c.dependeComposicao }));
    return top;
  }

  return { decidir, ancoraDaPraca };
});
