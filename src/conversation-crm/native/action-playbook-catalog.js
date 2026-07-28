'use strict';

const { deepFreeze } = require('./catalogs/operational');

const INTERNAL_PUBLIC_INFO = 'TATA_OPERATIONAL_PUBLIC_INFO_V1';
const INTERNAL_POLICY = 'CONVERSATION_POLICY_V1';
const IFOOD_PROBLEM = 'ifood:problemas-com-o-pedido:2026-04-06';
const IFOOD_SUPPORT = 'ifood:suporte:2026-04-01';
const IFOOD_REFUND = 'ifood:reembolso:2026-04-01';
const HEALTH_DTHA = 'ministerio-saude:dtha:consultado-2026-07-28';
const HEALTH_SAMU = 'ministerio-saude:samu-192:consultado-2026-07-28';
const ANVISA_NUTRI = 'anvisa:nutrivigilancia:consultado-2026-07-28';

function playbook(id, objective, gravity, directAnswer, options = {}) {
  return {
    id,
    version: '1.0.0',
    objective,
    gravity,
    recognition: options.recognition || 'Reconhecer a necessidade específica em linguagem natural.',
    direct_answer: directAnswer,
    useful_information: options.useful || [],
    possible_actions: options.actions || [],
    channel_guidance: options.channels || [],
    minimum_questions: options.questions || [],
    escalation: options.escalation || 'E0',
    prohibited_claims: options.prohibited || ['inventar_fato', 'inventar_confirmacao'],
    limit: options.limit || null,
    closing: options.closing || 'Encerrar de forma proporcional e manter abertura para a próxima dúvida.',
    variations: options.variations || [],
    sources: options.sources || [INTERNAL_POLICY],
    reviewed_at: '2026-07-28'
  };
}

const ACTION_PLAYBOOKS = deepFreeze({
  restaurant_information: playbook(
    'restaurant_information',
    'Responder fatos públicos do restaurante e explicar limites reais.',
    'informational',
    ['Responder primeiro o fato solicitado.', 'Adicionar somente um detalhe útil relacionado.'],
    {
      useful: ['horário regular', 'endereço', 'cardápios', 'pagamentos', 'rolha', 'valet'],
      actions: ['information.unit.read', 'menu.read'],
      prohibited: ['inventar_horario_especial', 'inventar_estrutura', 'inventar_pagamento'],
      limit: 'Feriados e fatos não configurados exigem confirmação; não transformar ausência em negativa.',
      sources: [INTERNAL_PUBLIC_INFO, INTERNAL_POLICY]
    }
  ),
  experiences: playbook(
    'experiences',
    'Apresentar à la carte, Almoço Executivo e Sugestão Tatá de modo claro e interessante.',
    'informational',
    ['Responder se existe rodízio.', 'Explicar brevemente as experiências relacionadas confirmadas.'],
    {
      useful: ['serviço à la carte', 'Almoço Executivo', 'Sugestão Tatá', 'links de cardápio'],
      actions: ['menu.read'],
      questions: ['dietary_need_when_material'],
      prohibited: ['chamar_menu_de_rodizio', 'garantir_ausencia_de_alergeno'],
      limit: 'Composição detalhada e segurança para restrições dependem de informação confirmada do item.',
      sources: [INTERNAL_PUBLIC_INFO]
    }
  ),
  reservation: playbook(
    'reservation',
    'Levar o cliente ao canal oficial e separar consulta de confirmação.',
    'operational',
    ['Fornecer o link oficial.', 'Explicar que a confirmação aparece no próprio sistema.'],
    {
      useful: ['tolerância da reserva', 'confirmação no mesmo dia quando aplicável'],
      actions: ['reservation.read', 'reservation.create', 'reservation.update'],
      channels: ['Get In pelo link oficial'],
      questions: ['customer_name', 'party_size', 'time'],
      escalation: 'E1',
      prohibited: ['confirmar_reserva_sem_resultado', 'prometer_disponibilidade'],
      limit: 'Sem integração observável, orientar consulta; não afirmar que uma busca foi executada.',
      sources: [INTERNAL_PUBLIC_INFO, INTERNAL_POLICY]
    }
  ),
  waitlist: playbook(
    'waitlist',
    'Explicar a fila e orientar o canal sem inventar posição ou espera.',
    'operational',
    ['Fornecer o link oficial.', 'Explicar chamada e prazo de chegada confirmados.'],
    {
      useful: ['posição acompanhada no sistema', 'prazo após chamada'],
      actions: ['waitlist.read', 'waitlist.create'],
      channels: ['Get In pelo link oficial'],
      questions: ['customer_name', 'party_size', 'arrival_estimate'],
      escalation: 'E1',
      prohibited: ['inventar_posicao', 'inventar_tempo_de_espera', 'confirmar_entrada_sem_resultado'],
      sources: [INTERNAL_PUBLIC_INFO, INTERNAL_POLICY]
    }
  ),
  large_group: playbook(
    'large_group',
    'Coletar o mínimo para um grupo acima de oito e preparar acompanhamento humano.',
    'operational',
    ['Reconhecer a quantidade.', 'Explicar que disponibilidade precisa ser verificada.'],
    {
      actions: ['human.queue.create'],
      questions: ['customer_name', 'arrival_estimate'],
      escalation: 'E1',
      prohibited: ['confirmar_mesa', 'confirmar_fila', 'afirmar_contato_com_maitre_sem_evidencia'],
      limit: 'Casa pequena e validação humana são contexto de condução, não prova de disponibilidade.',
      sources: [INTERNAL_POLICY]
    }
  ),
  own_delivery: playbook(
    'own_delivery',
    'Orientar cardápio, pedido, retirada ou acompanhamento no delivery próprio.',
    'operational',
    ['Indicar o canal correto.', 'Explicar qual dado permite localizar o pedido quando necessário.'],
    {
      useful: ['link do delivery próprio', 'taxa calculada conforme endereço no canal'],
      actions: ['menu.read', 'order.read', 'human.queue.create'],
      channels: ['delivery próprio TATÁ'],
      questions: ['order_reference', 'customer_name'],
      escalation: 'E1',
      prohibited: ['inventar_taxa', 'inventar_previsao', 'afirmar_pedido_lancado_sem_resultado'],
      sources: [INTERNAL_PUBLIC_INFO, INTERNAL_POLICY]
    }
  ),
  ifood: playbook(
    'ifood',
    'Orientar o caminho oficial no pedido sem culpar a plataforma ou prometer solução.',
    'operational',
    ['Diferenciar chat da loja e Ajuda do iFood.', 'Explicar seleção do problema e análise.'],
    {
      useful: ['Pedidos', 'Ajuda', 'Tenho um problema com meu pedido', 'Falar com o iFood'],
      actions: ['occurrence.create', 'human.queue.create'],
      channels: ['pedido no aplicativo iFood'],
      questions: ['order_reference', 'affected_item'],
      escalation: 'E2',
      prohibited: ['culpar_ifood', 'prometer_reembolso', 'prometer_reenvio', 'prometer_cupom'],
      limit: 'Opções do aplicativo podem variar; a decisão pertence ao fluxo de análise aplicável.',
      sources: [INTERNAL_PUBLIC_INFO, IFOOD_PROBLEM, IFOOD_SUPPORT, IFOOD_REFUND]
    }
  ),
  missing_item: playbook(
    'missing_item',
    'Reconhecer o item faltante e avançar pelo canal correto.',
    'sensitive',
    ['Citar o item quando conhecido.', 'Explicar como registrar ou acompanhar o problema.'],
    {
      actions: ['occurrence.create', 'human.queue.create'],
      channels: ['canal do pedido', 'Ajuda do iFood quando o canal for iFood'],
      questions: ['order_channel', 'order_reference'],
      escalation: 'E2',
      prohibited: ['expor_regra_interna_de_compensacao', 'prometer_reposicao', 'prometer_reembolso'],
      sources: [INTERNAL_POLICY, IFOOD_PROBLEM, IFOOD_SUPPORT]
    }
  ),
  wrong_item: playbook(
    'wrong_item',
    'Distinguir item recebido do item pedido e orientar evidências quando aplicável.',
    'sensitive',
    ['Reconhecer a divergência concreta.', 'Preservar a diferença entre errado e faltante.'],
    {
      actions: ['occurrence.create', 'human.queue.create'],
      questions: ['order_channel', 'order_reference', 'item_name'],
      escalation: 'E2',
      prohibited: ['prometer_substituicao', 'colapsar_em_item_faltando'],
      sources: [INTERNAL_POLICY, IFOOD_PROBLEM]
    }
  ),
  quantity_personalization: playbook(
    'quantity_personalization',
    'Registrar quantidade divergente ou personalização ignorada sem perder os valores.',
    'sensitive',
    ['Dizer qual diferença foi entendida.', 'Orientar registro e análise.'],
    {
      actions: ['occurrence.create', 'human.queue.create'],
      questions: ['order_channel', 'order_reference', 'expected_quantity', 'received_quantity'],
      escalation: 'E2',
      prohibited: ['colapsar_em_item_errado', 'prometer_compensacao'],
      sources: [INTERNAL_POLICY, IFOOD_PROBLEM]
    }
  ),
  delay_and_delivery: playbook(
    'delay_and_delivery',
    'Diferenciar preparação, coleta, rota e pedido marcado como entregue.',
    'operational',
    ['Reconhecer a etapa observada.', 'Orientar consulta no canal e a opção correta de ajuda.'],
    {
      actions: ['order.read', 'occurrence.create'],
      channels: ['canal do pedido'],
      questions: ['order_channel', 'order_reference'],
      escalation: 'E1',
      prohibited: ['inventar_previsao', 'hardcodar_limite_de_atraso', 'culpar_loja_ou_plataforma'],
      limit: 'Usar o estado observável; limiares públicos conflitantes não são regra universal.',
      sources: [INTERNAL_POLICY, IFOOD_PROBLEM]
    }
  ),
  quality: playbook(
    'quality',
    'Distinguir preferência, execução, transporte e possível risco sanitário.',
    'sensitive',
    ['Reconhecer o sinal específico.', 'Explicar que o caso será analisado sem antecipar causa.'],
    {
      actions: ['occurrence.create', 'human.queue.create'],
      questions: ['order_reference', 'item_name', 'evidence_available'],
      escalation: 'E3',
      prohibited: ['minimizar', 'afirmar_higiene_sem_evidencia', 'prometer_compensacao'],
      sources: [INTERNAL_POLICY, IFOOD_PROBLEM]
    }
  ),
  food_safety: playbook(
    'food_safety',
    'Proteger a pessoa, preservar evidência e escalar sem diagnóstico ou causalidade.',
    'critical',
    ['Tratar o relato com seriedade.', 'Orientar serviço de saúde quando houver suspeita ou sintomas.', 'Orientar urgência quando houver sinal grave.'],
    {
      actions: ['occurrence.create', 'human.queue.create'],
      questions: ['symptoms', 'onset', 'people_affected', 'item_name', 'order_reference'],
      escalation: 'E4',
      prohibited: ['diagnosticar', 'atribuir_causalidade', 'minimizar', 'usar_emoji', 'fazer_marketing', 'indicar_medicamento'],
      limit: 'O chatbot não avalia clinicamente; em urgência evidente, orientar atendimento imediato ou SAMU 192.',
      sources: [INTERNAL_POLICY, ANVISA_NUTRI, HEALTH_DTHA, HEALTH_SAMU, IFOOD_PROBLEM]
    }
  ),
  events_oke: playbook(
    'events_oke',
    'Explicar Oke e eventos e coletar apenas os dados necessários para avaliação.',
    'operational',
    ['Explicar retirada, confirmação da equipe e prazo de retorno.', 'Informar devolução das tábuas.'],
    {
      actions: ['human.queue.create'],
      questions: ['party_size', 'pickup_time', 'requested_items'],
      escalation: 'E1',
      prohibited: ['prometer_preco', 'prometer_quantidade', 'prometer_disponibilidade', 'oferecer_entrega'],
      sources: [INTERNAL_PUBLIC_INFO, INTERNAL_POLICY]
    }
  ),
  praise_and_suggestion: playbook(
    'praise_and_suggestion',
    'Agradecer de modo específico e preservar o elemento mencionado.',
    'informational',
    ['Reconhecer o que foi elogiado ou sugerido.', 'Agradecer sem resposta automática vazia.'],
    {
      actions: ['feedback.create'],
      prohibited: ['resposta_generica_sem_referencia'],
      sources: [INTERNAL_POLICY]
    }
  ),
  privacy_and_handoff: playbook(
    'privacy_and_handoff',
    'Explicar dados mínimos ou preparar continuidade humana sem promessa falsa.',
    'operational',
    ['Responder a dúvida de privacidade com o que está confirmado.', 'Distinguir handoff confirmado de indisponível.'],
    {
      actions: ['privacy.request', 'human.queue.create'],
      questions: ['request_scope'],
      escalation: 'E1',
      prohibited: ['inventar_retencao', 'afirmar_transferencia_sem_confirmacao'],
      sources: [INTERNAL_POLICY]
    }
  )
});

function validateActionPlaybooks(playbooks = ACTION_PLAYBOOKS) {
  const required = [
    'id', 'version', 'objective', 'gravity', 'recognition', 'direct_answer',
    'useful_information', 'possible_actions', 'channel_guidance',
    'minimum_questions', 'escalation', 'prohibited_claims', 'closing',
    'variations', 'sources', 'reviewed_at'
  ];
  for (const [id, item] of Object.entries(playbooks)) {
    if (item.id !== id || required.some((field) => item[field] == null)) {
      throw Object.assign(new Error('ACTION_PLAYBOOK_INVALID'), { code: 'ACTION_PLAYBOOK_INVALID', playbook_id: id });
    }
    for (const field of ['direct_answer', 'useful_information', 'possible_actions', 'channel_guidance', 'minimum_questions', 'prohibited_claims', 'variations', 'sources']) {
      if (!Array.isArray(item[field])) throw Object.assign(new Error('ACTION_PLAYBOOK_INVALID'), { code: 'ACTION_PLAYBOOK_INVALID', playbook_id: id, field });
    }
  }
  return playbooks;
}

function actionPlaybookFor(id) {
  return ACTION_PLAYBOOKS[id] || null;
}

module.exports = {
  ACTION_PLAYBOOKS,
  validateActionPlaybooks,
  actionPlaybookFor
};
