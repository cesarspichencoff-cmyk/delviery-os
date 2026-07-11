/* ============================================================================
 * DeliveryOS · src/live · CONSOLIDAÇÃO
 * ----------------------------------------------------------------------------
 * Estado consolidado dos pedidos a partir dos eventos vivos. Duas metades:
 *   lado comanda (composição/itens — Odhen/Teknisa no instante da impressão)
 *   lado status  (tempo/estado — Gestor iFood)
 * unidas SÓ por identificador forte (correlacao.js). O consolidado é uma
 * PROJEÇÃO: reconstruível 100% do log; derivado nunca vira evento.
 *
 * Regras que este módulo garante:
 *  - Pedido parcial nunca vira completo por suposição (sem itens => sem
 *    composição inventada; sem status => sem tempo inventado).
 *  - Cancelamento só nasce da fonte de status; preserva todo o histórico;
 *    nunca é inferido por ausência; aceita chegar antes ou depois da comanda.
 *  - Reimpressão não cria segundo pedido; idêntica (mesmo hash canônico) só
 *    atualiza carimbo/vias; divergente é registrada como possível alteração
 *    (nunca substitui itens silenciosamente).
 *  - pedido_alterado com change_mode/revision (Addendum §13): delta sem base
 *    confiável não é aplicado (fica pendente e suspeito); ausência em delta
 *    não remove item; última chegada não é presumida como mais nova — ordem
 *    vem de revision ou occurred_at confiável; conflito de revisão preserva
 *    os dois lados e sinaliza.
 *  - Pedido em conflict não fica apto para decisão operacional.
 * ==========================================================================*/
"use strict";

const { hashCanonicoItens, normalizarTexto, diaDe } = require("./normalizar");
const { correlacionarStatusComComandas } = require("./correlacao");
const { calcularQualidadeConsolidado } = require("./qualidade");

function criarEstadoConsolidacao() {
  return {
    comandas: new Map(), // `pi:{pedido_interno}` -> registro lado comanda
    statuses: new Map(), // `if:{ifood_short}:{dia}` -> registro lado status
    contadores: {
      reimpressoes_identicas: 0,
      reimpressoes_divergentes: 0,
      alteracoes_aplicadas: 0,
      alteracoes_nao_aplicadas: 0,
      cancelamentos: 0,
      status_fora_de_ordem: 0
    }
  };
}

const chaveComanda = (pedidoInterno) => `pi:${pedidoInterno}`;
const chaveStatus = (short, dia) => `if:${short}:${dia}`;

function idDoEvento(ev, campo) {
  const corr = ev.correlation || {};
  return corr[campo] || ev.payload[campo] || null;
}

/** melhor carimbo confiável para ordenação: occurred_at se houver, senão captured_at */
function carimboConfiavel(ev) {
  return ev.occurred_at || ev.captured_at;
}

/* ---------------- comanda_impressa ---------------- */
function aplicarComandaImpressa(estado, ev) {
  const pedidoInterno = idDoEvento(ev, "pedido_interno");
  const short = idDoEvento(ev, "ifood_short");
  const itens = ev.payload.itens;
  const hash = hashCanonicoItens(itens);
  const chave = chaveComanda(pedidoInterno);
  const existente = estado.comandas.get(chave);

  if (!existente) {
    estado.comandas.set(chave, {
      lado: "comanda",
      pedido_interno: pedidoInterno,
      ifood_short: short,
      dia: diaDe(ev.captured_at),
      emissao: ev.payload.emissao || null,
      itens_impressos: itens,
      itens_atuais: itens,
      hash_conteudo: hash,
      hash_atual: hash,
      vias: 1,
      reimpressao_divergente: false,
      conteudos_divergentes: [],
      revision_atual: null,
      ultima_alteracao_em: null,
      alteracoes: [],
      alteracao_pendente_sem_base: false,
      conflito_revisao: false,
      parsing_warnings: (ev.quality && ev.quality.parsing_warnings) || [],
      eventos: [ev.event_id],
      criado_em: ev.captured_at,
      atualizado_em: ev.captured_at
    });
    return { tipo: "comanda_nova" };
  }

  // mesmo pedido_interno impresso de novo => reimpressão, nunca segundo pedido
  existente.vias += 1;
  existente.eventos.push(ev.event_id);
  if (ev.captured_at > existente.atualizado_em) existente.atualizado_em = ev.captured_at;

  if (hash === existente.hash_atual) {
    estado.contadores.reimpressoes_identicas += 1;
    return { tipo: "reimpressao_identica" };
  }
  // conteúdo diferente: NÃO presumir equivalência, NÃO substituir itens.
  existente.reimpressao_divergente = true;
  existente.conteudos_divergentes.push({
    hash_conteudo: hash,
    itens,
    emissao: ev.payload.emissao || null,
    event_id: ev.event_id,
    captured_at: ev.captured_at
  });
  estado.contadores.reimpressoes_divergentes += 1;
  return { tipo: "reimpressao_divergente" };
}

/* ---------------- pedido_reimpresso (evento explícito do adaptador) ---------------- */
function aplicarPedidoReimpresso(estado, ev) {
  const pedidoInterno = idDoEvento(ev, "pedido_interno");
  const chave = chaveComanda(pedidoInterno);
  const existente = estado.comandas.get(chave);
  if (!existente) {
    // reimpressão de pedido nunca visto: registrar como comanda parcial —
    // nunca inventar a via original que não foi observada.
    estado.comandas.set(chave, {
      lado: "comanda",
      pedido_interno: pedidoInterno,
      ifood_short: idDoEvento(ev, "ifood_short"),
      dia: diaDe(ev.captured_at),
      emissao: ev.payload.emissao_nova || null,
      itens_impressos: Array.isArray(ev.payload.itens) ? ev.payload.itens : null,
      itens_atuais: Array.isArray(ev.payload.itens) ? ev.payload.itens : null,
      hash_conteudo: hashCanonicoItens(ev.payload.itens),
      hash_atual: hashCanonicoItens(ev.payload.itens),
      vias: 1,
      reimpressao_divergente: false,
      conteudos_divergentes: [],
      revision_atual: null,
      ultima_alteracao_em: null,
      alteracoes: [],
      alteracao_pendente_sem_base: false,
      conflito_revisao: false,
      parsing_warnings: ["reimpressao_sem_via_original_observada"],
      eventos: [ev.event_id],
      criado_em: ev.captured_at,
      atualizado_em: ev.captured_at
    });
    return { tipo: "reimpressao_sem_original" };
  }

  existente.vias += 1;
  existente.eventos.push(ev.event_id);
  if (ev.captured_at > existente.atualizado_em) existente.atualizado_em = ev.captured_at;

  const hashNovo = Array.isArray(ev.payload.itens) ? hashCanonicoItens(ev.payload.itens) : null;
  const identico = ev.payload.conteudo_identico === true ||
    (hashNovo !== null && hashNovo === existente.hash_atual);

  if (identico) {
    estado.contadores.reimpressoes_identicas += 1;
    return { tipo: "reimpressao_identica" };
  }
  if (ev.payload.conteudo_identico === false || (hashNovo !== null && hashNovo !== existente.hash_atual)) {
    existente.reimpressao_divergente = true;
    existente.conteudos_divergentes.push({
      hash_conteudo: hashNovo,
      itens: Array.isArray(ev.payload.itens) ? ev.payload.itens : null,
      emissao: ev.payload.emissao_nova || null,
      event_id: ev.event_id,
      captured_at: ev.captured_at
    });
    estado.contadores.reimpressoes_divergentes += 1;
    return { tipo: "reimpressao_divergente" };
  }
  // sem itens e sem declaração: não dá para comparar — registrar incerteza.
  existente.parsing_warnings.push("reimpressao_sem_conteudo_para_comparar");
  return { tipo: "reimpressao_incomparavel" };
}

/* ---------------- status_ifood / pedido_vivo ---------------- */
function aplicarStatus(estado, ev) {
  const short = idDoEvento(ev, "ifood_short");
  const dia = diaDe(ev.captured_at);
  const chave = chaveStatus(short, dia);
  let rec = estado.statuses.get(chave);
  if (!rec) {
    rec = {
      lado: "status",
      ifood_short: short,
      dia,
      coluna: null,
      coluna_em: null,
      historico: [],
      cancelado: false,
      cancelamento: null,
      visto_por_ultimo_em: null,
      eventos: [],
      atualizado_em: ev.captured_at
    };
    estado.statuses.set(chave, rec);
  }

  rec.eventos.push(ev.event_id);
  if (ev.captured_at > rec.atualizado_em) rec.atualizado_em = ev.captured_at;
  rec.visto_por_ultimo_em = ev.captured_at;

  const carimbo = carimboConfiavel(ev);
  const foraDeOrdem = rec.coluna_em !== null && carimbo < rec.coluna_em;
  rec.historico.push({
    coluna: ev.payload.coluna,
    occurred_at: ev.occurred_at || null,
    captured_at: ev.captured_at,
    event_id: ev.event_id,
    fora_de_ordem: foraDeOrdem,
    heartbeat: ev.event_type === "pedido_vivo"
  });

  if (foraDeOrdem) {
    // última chegada NÃO é a mais nova: preservar, sinalizar, não regredir.
    estado.contadores.status_fora_de_ordem += 1;
    return { tipo: "status_fora_de_ordem" };
  }
  rec.coluna = ev.payload.coluna;
  rec.coluna_em = carimbo;
  return { tipo: ev.event_type === "pedido_vivo" ? "heartbeat" : "status_atualizado" };
}

/* ---------------- pedido_cancelado ---------------- */
function aplicarCancelamento(estado, ev) {
  const short = idDoEvento(ev, "ifood_short");
  const dia = diaDe(ev.captured_at);
  const chave = chaveStatus(short, dia);
  let rec = estado.statuses.get(chave);
  if (!rec) {
    // cancelamento pode chegar antes de qualquer status/comanda: cria a metade
    // de status já cancelada (fato observado na fonte de status).
    rec = {
      lado: "status",
      ifood_short: short,
      dia,
      coluna: null,
      coluna_em: null,
      historico: [],
      cancelado: false,
      cancelamento: null,
      visto_por_ultimo_em: null,
      eventos: [],
      atualizado_em: ev.captured_at
    };
    estado.statuses.set(chave, rec);
  }
  rec.eventos.push(ev.event_id);
  if (ev.captured_at > rec.atualizado_em) rec.atualizado_em = ev.captured_at;
  rec.historico.push({
    coluna: "cancelado",
    occurred_at: ev.occurred_at || null,
    captured_at: ev.captured_at,
    event_id: ev.event_id,
    fora_de_ordem: false,
    heartbeat: false
  });
  rec.cancelado = true; // marca; nada anterior é apagado
  rec.cancelamento = {
    visto_em: ev.payload.visto_em || ev.captured_at,
    event_id: ev.event_id
  };
  estado.contadores.cancelamentos += 1;
  return { tipo: "pedido_cancelado" };
}

/* ---------------- pedido_alterado ---------------- */
function aplicarAlteracao(estado, ev, changeModeCanonico) {
  const pedidoInterno = idDoEvento(ev, "pedido_interno");
  const short = idDoEvento(ev, "ifood_short");
  const registroAlteracao = {
    event_id: ev.event_id,
    change_mode: changeModeCanonico,
    revision: ev.payload.revision !== undefined ? ev.payload.revision : null,
    previous_revision: ev.payload.previous_revision !== undefined ? ev.payload.previous_revision : null,
    supersedes_event_id: ev.payload.supersedes_event_id || null,
    changed_fields: Array.isArray(ev.payload.changed_fields) ? ev.payload.changed_fields : [],
    occurred_at: ev.occurred_at || null,
    captured_at: ev.captured_at,
    aplicada: false,
    motivo: null
  };

  let base = pedidoInterno ? estado.comandas.get(chaveComanda(pedidoInterno)) : null;
  if (!base && short) {
    const dia = diaDe(ev.captured_at);
    const candidatas = [...estado.comandas.values()]
      .filter((c) => c.ifood_short === short && c.dia === dia);
    if (candidatas.length === 1) base = candidatas[0];
    // 2+ candidatas: ambiguidade — não escolher; tratada como sem base única.
  }

  // full_snapshot é a própria base: pode criar a composição se ela não existe.
  if (!base && changeModeCanonico === "full_snapshot" && Array.isArray(ev.payload.itens)) {
    const chave = chaveComanda(pedidoInterno || `alterado:${short}:${diaDe(ev.captured_at)}`);
    registroAlteracao.aplicada = true;
    registroAlteracao.motivo = "snapshot_completo_criou_composicao";
    estado.comandas.set(chave, {
      lado: "comanda",
      pedido_interno: pedidoInterno,
      ifood_short: short,
      dia: diaDe(ev.captured_at),
      emissao: null,
      itens_impressos: null, // nunca observamos a via impressa
      itens_atuais: ev.payload.itens,
      hash_conteudo: null,
      hash_atual: hashCanonicoItens(ev.payload.itens),
      vias: 0,
      reimpressao_divergente: false,
      conteudos_divergentes: [],
      revision_atual: registroAlteracao.revision,
      ultima_alteracao_em: carimboConfiavel(ev),
      alteracoes: [registroAlteracao],
      alteracao_pendente_sem_base: false,
      conflito_revisao: false,
      parsing_warnings: ["composicao_nascida_de_alteracao_sem_comanda_observada"],
      eventos: [ev.event_id],
      criado_em: ev.captured_at,
      atualizado_em: ev.captured_at
    });
    estado.contadores.alteracoes_aplicadas += 1;
    return { tipo: "alteracao_aplicada" };
  }

  if (!base) {
    // delta/correção/troca de itens sem base confiável: NUNCA reconstruir por
    // adivinhação — fica pendente, explícito e suspeito.
    registroAlteracao.motivo = "sem_base_confiavel";
    const chave = chaveComanda(pedidoInterno || `alterado:${short}:${diaDe(ev.captured_at)}`);
    let pendente = estado.comandas.get(chave);
    if (!pendente) {
      pendente = {
        lado: "comanda",
        pedido_interno: pedidoInterno,
        ifood_short: short,
        dia: diaDe(ev.captured_at),
        emissao: null,
        itens_impressos: null,
        itens_atuais: null, // sem base, sem itens: nada é inventado
        hash_conteudo: null,
        hash_atual: null,
        vias: 0,
        reimpressao_divergente: false,
        conteudos_divergentes: [],
        revision_atual: null,
        ultima_alteracao_em: null,
        alteracoes: [],
        alteracao_pendente_sem_base: false,
        conflito_revisao: false,
        parsing_warnings: [],
        eventos: [],
        criado_em: ev.captured_at,
        atualizado_em: ev.captured_at
      };
      estado.comandas.set(chave, pendente);
    }
    pendente.alteracoes.push(registroAlteracao);
    pendente.alteracao_pendente_sem_base = true;
    pendente.eventos.push(ev.event_id);
    estado.contadores.alteracoes_nao_aplicadas += 1;
    return { tipo: "alteracao_pendente_sem_base" };
  }

  base.eventos.push(ev.event_id);
  if (ev.captured_at > base.atualizado_em) base.atualizado_em = ev.captured_at;

  // ---- ordem: revision primeiro; senão occurred_at confiável; senão não aplica.
  const rev = registroAlteracao.revision;
  if (rev !== null && base.revision_atual !== null) {
    if (rev < base.revision_atual) {
      registroAlteracao.motivo = "revisao_antiga_recebida_depois";
      base.alteracoes.push(registroAlteracao);
      estado.contadores.alteracoes_nao_aplicadas += 1;
      return { tipo: "alteracao_fora_de_ordem" };
    }
    if (rev === base.revision_atual) {
      registroAlteracao.motivo = "conflito_de_revisao";
      base.alteracoes.push(registroAlteracao);
      base.conflito_revisao = true; // preservar e sinalizar, nunca escolher
      estado.contadores.alteracoes_nao_aplicadas += 1;
      return { tipo: "conflito_de_revisao" };
    }
  }
  if (rev === null) {
    const carimbo = registroAlteracao.occurred_at;
    if (!carimbo) {
      registroAlteracao.motivo = "ordem_desconhecida_sem_revision_e_sem_occurred_at";
      base.alteracoes.push(registroAlteracao);
      base.parsing_warnings.push("alteracao_nao_aplicada_por_ordem_desconhecida");
      estado.contadores.alteracoes_nao_aplicadas += 1;
      return { tipo: "alteracao_ordem_desconhecida" };
    }
    if (base.ultima_alteracao_em && carimbo < base.ultima_alteracao_em) {
      registroAlteracao.motivo = "occurred_at_anterior_a_alteracao_aplicada";
      base.alteracoes.push(registroAlteracao);
      estado.contadores.alteracoes_nao_aplicadas += 1;
      return { tipo: "alteracao_fora_de_ordem" };
    }
  }

  // ---- aplicar conforme o modo
  const aplicar = () => {
    if (changeModeCanonico === "full_snapshot") {
      if (!Array.isArray(ev.payload.itens)) return "payload_sem_itens";
      base.itens_atuais = ev.payload.itens;
    } else if (changeModeCanonico === "items_replacement") {
      if (!Array.isArray(ev.payload.itens)) return "payload_sem_itens";
      base.itens_atuais = ev.payload.itens;
    } else if (changeModeCanonico === "partial_delta" || changeModeCanonico === "field_correction") {
      if (!Array.isArray(base.itens_atuais)) return "base_sem_itens_para_delta";
      // upsert só do que veio; ausência em delta NÃO remove nada.
      let itens = base.itens_atuais.slice();
      if (Array.isArray(ev.payload.itens)) {
        for (const novo of ev.payload.itens) {
          const nomeNorm = normalizarTexto(novo.nome);
          const idx = itens.findIndex((it) => normalizarTexto(it.nome) === nomeNorm);
          if (idx >= 0) itens[idx] = novo;
          else itens.push(novo);
        }
      }
      // remoção só quando EXPLÍCITA
      if (Array.isArray(ev.payload.itens_removidos)) {
        const remover = ev.payload.itens_removidos.map(normalizarTexto);
        itens = itens.filter((it) => !remover.includes(normalizarTexto(it.nome)));
      }
      base.itens_atuais = itens;
    }
    return null;
  };

  const falha = aplicar();
  if (falha) {
    registroAlteracao.motivo = falha;
    base.alteracoes.push(registroAlteracao);
    base.alteracao_pendente_sem_base = true;
    estado.contadores.alteracoes_nao_aplicadas += 1;
    return { tipo: "alteracao_pendente_sem_base" };
  }

  base.hash_atual = hashCanonicoItens(base.itens_atuais);
  if (rev !== null) base.revision_atual = rev;
  base.ultima_alteracao_em = carimboConfiavel(ev);
  registroAlteracao.aplicada = true;
  base.alteracoes.push(registroAlteracao);
  estado.contadores.alteracoes_aplicadas += 1;
  return { tipo: "alteracao_aplicada" };
}

/* ---------------- observação repetida (mesmo fato, novo event_id) ---------------- */
function aplicarObservacaoRepetida(estado, ev) {
  // mesmo fato reobservado: só carimbos avançam. Reimpressão idêntica de
  // comanda cai aqui (mesma idempotency_key) e conta uma via nova.
  if (ev.event_type === "comanda_impressa") {
    const rec = estado.comandas.get(chaveComanda(idDoEvento(ev, "pedido_interno")));
    if (rec) {
      rec.vias += 1;
      rec.eventos.push(ev.event_id);
      if (ev.captured_at > rec.atualizado_em) rec.atualizado_em = ev.captured_at;
      estado.contadores.reimpressoes_identicas += 1;
      return { tipo: "reimpressao_identica" };
    }
  }
  if (ev.event_type === "status_ifood" || ev.event_type === "pedido_vivo") {
    const rec = estado.statuses.get(chaveStatus(idDoEvento(ev, "ifood_short"), diaDe(ev.captured_at)));
    if (rec) {
      rec.eventos.push(ev.event_id);
      rec.visto_por_ultimo_em = ev.captured_at;
      if (ev.captured_at > rec.atualizado_em) rec.atualizado_em = ev.captured_at;
      return { tipo: "carimbo_atualizado" };
    }
  }
  return { tipo: "observacao_repetida_ignorada" };
}

/* ---------------- visão consolidada (projeção pura) ---------------- */
function consolidarVisao(estado) {
  const pedidos = [];
  const comandasPorShortDia = new Map();
  for (const c of estado.comandas.values()) {
    if (!c.ifood_short) continue;
    const k = `${c.ifood_short}:${c.dia}`;
    if (!comandasPorShortDia.has(k)) comandasPorShortDia.set(k, []);
    comandasPorShortDia.get(k).push(c);
  }

  const comandasConsumidas = new Set();

  for (const s of estado.statuses.values()) {
    const candidatas = comandasPorShortDia.get(`${s.ifood_short}:${s.dia}`) || [];
    const corr = correlacionarStatusComComandas(s, candidatas);

    if (corr.estado === "matched") {
      const c = candidatas[0];
      comandasConsumidas.add(c);
      pedidos.push(montarPedido(c, s, "matched", corr));
    } else if (corr.estado === "conflict") {
      // todos os envolvidos viram conflict; eventos preservados; nada apto.
      for (const c of candidatas) {
        comandasConsumidas.add(c);
        pedidos.push(montarPedido(c, null, "conflict", corr));
      }
      pedidos.push(montarPedido(null, s, "conflict", corr));
    } else {
      pedidos.push(montarPedido(null, s, corr.estado, corr));
    }
  }

  for (const c of estado.comandas.values()) {
    if (comandasConsumidas.has(c)) continue;
    if (!c.ifood_short) {
      pedidos.push(montarPedido(c, null, "partial",
        { motivo: "sem_identificador_para_casar", candidatos: [] }));
    } else if (!estado.statuses.has(chaveStatus(c.ifood_short, c.dia))) {
      pedidos.push(montarPedido(c, null, "unmatched",
        { motivo: "nenhum_candidato_do_outro_lado", candidatos: [] }));
    }
    // (se o status existe, a comanda já foi coberta no laço de statuses)
  }

  return pedidos;
}

function montarPedido(comanda, status, matchState, corr) {
  const registro = {
    chave: comanda ? chaveComanda(comanda.pedido_interno)
      : chaveStatus(status.ifood_short, status.dia),
    match_state: matchState,
    correlacao: { motivo: corr.motivo, candidatos: corr.candidatos || [] },
    cancelado: !!(status && status.cancelado),
    comanda: comanda ? {
      pedido_interno: comanda.pedido_interno,
      ifood_short: comanda.ifood_short,
      dia: comanda.dia,
      emissao: comanda.emissao,
      itens: comanda.itens_atuais,          // após alterações APLICADAS
      itens_impressos: comanda.itens_impressos,
      hash_atual: comanda.hash_atual,
      vias: comanda.vias,
      reimpressao_divergente: comanda.reimpressao_divergente,
      conteudos_divergentes: comanda.conteudos_divergentes,
      revision_atual: comanda.revision_atual,
      alteracoes: comanda.alteracoes,
      alteracao_pendente_sem_base: comanda.alteracao_pendente_sem_base,
      conflito_revisao: comanda.conflito_revisao
    } : null,
    status: status ? {
      ifood_short: status.ifood_short,
      dia: status.dia,
      coluna: status.coluna,
      coluna_em: status.coluna_em,
      historico: status.historico,
      cancelado: status.cancelado,
      cancelamento: status.cancelamento,
      visto_por_ultimo_em: status.visto_por_ultimo_em
    } : null,
    parsing_warnings: comanda ? comanda.parsing_warnings : [],
    conflito_revisao: !!(comanda && comanda.conflito_revisao),
    alteracao_pendente_sem_base: !!(comanda && comanda.alteracao_pendente_sem_base)
  };
  registro.qualidade = calcularQualidadeConsolidado(registro);
  // conflict/cancelado/parcial nunca ficam aptos para decisão operacional.
  registro.apto_para_decisao = matchState === "matched" && !registro.cancelado &&
    registro.qualidade.completeness === "complete";
  return registro;
}

module.exports = {
  criarEstadoConsolidacao,
  aplicarComandaImpressa,
  aplicarPedidoReimpresso,
  aplicarStatus,
  aplicarCancelamento,
  aplicarAlteracao,
  aplicarObservacaoRepetida,
  consolidarVisao
};
