'use strict';

const cases = [
  { id: 'SIMPLE-01', category: 'simple', message: 'Quero fazer uma reserva.', context: { intent: 'reservation', reservation_date: 'SIM-DATE-A', reservation_time: 'SIM-SLOT-A', party_size: 2 }, expected: { block_id: 'R01', human_required: false } },
  { id: 'SIMPLE-02', category: 'simple', message: 'Onde consulto o cardápio?', context: { intent: 'menu_information' }, expected: { block_id: 'I01', human_required: false } },
  { id: 'SIMPLE-03', category: 'simple', message: 'Preciso de informações da unidade.', context: { intent: 'general_information', information_topic: 'opening_hours' }, expected: { block_id: 'I02', human_required: false } },
  { id: 'SIMPLE-04', category: 'simple', message: 'Não quero receber comunicações.', context: { intent: 'opt_out' }, expected: { block_id: 'F02', human_required: false } },
  { id: 'SIMPLE-05', category: 'simple', message: 'Quero entrar na fila de espera.', context: { intent: 'reservation', waitlist: true, reservation_date: 'SIM-DATE-B', reservation_time: 'SIM-SLOT-B', party_size: 3 }, expected: { block_id: 'R03', human_required: true } },
  { id: 'SIMPLE-06', category: 'simple', message: 'Confirmo a solicitação de fila.', context: { intent: 'reservation', waitlist_confirmed: true, reservation_date: 'SIM-DATE-C', reservation_time: 'SIM-SLOT-C', party_size: 3 }, expected: { block_id: 'R04', human_required: true } },
  { id: 'SIMPLE-07', category: 'simple', message: 'A reserva aparece como indisponível.', context: { intent: 'reservation', availability: 'unavailable', reservation_date: 'SIM-DATE-D', reservation_time: 'SIM-SLOT-D', party_size: 2 }, expected: { block_id: 'R02', human_required: true } },
  { id: 'SIMPLE-08', category: 'simple', message: 'Quero reservar para um grupo maior.', context: { intent: 'reservation', reservation_date: 'SIM-DATE-E', reservation_time: 'SIM-SLOT-E', party_size: 12 }, expected: { block_id: 'R05', human_required: true } },
  { id: 'SIMPLE-09', category: 'simple', message: 'Quais formas de pagamento são informadas?', context: { intent: 'general_information', information_topic: 'payment_methods' }, expected: { block_id: 'I02', human_required: false } },
  { id: 'SIMPLE-10', category: 'simple', message: 'Quero apenas avisar sobre uma situação.', context: { intent: 'alert_only', occurrence_type: 'general_alert' }, expected: { block_id: 'O07', human_required: false } },

  { id: 'OPERATIONAL-01', category: 'operational', message: 'Quero acompanhar um pedido do delivery próprio.', context: { intent: 'tracking', origin: 'own_delivery', order_reference: 'SIM-ORDER-A' }, expected: { block_id: 'D03', human_required: true } },
  { id: 'OPERATIONAL-02', category: 'operational', message: 'Quero acompanhar um pedido do marketplace.', context: { intent: 'tracking', origin: 'marketplace', order_reference: 'SIM-ORDER-B' }, expected: { block_id: 'D04', human_required: true } },
  { id: 'OPERATIONAL-03', category: 'operational', message: 'O pedido está atrasado.', context: { intent: 'delay', origin: 'own_delivery', order_reference: 'SIM-ORDER-C' }, expected: { block_id: 'O05', human_required: true } },
  { id: 'OPERATIONAL-04', category: 'operational', message: 'Veio um item errado.', context: { intent: 'wrong_or_missing_item', origin: 'own_delivery', order_reference: 'SIM-ORDER-D', occurrence_detail_code: 'wrong_item' }, expected: { block_id: 'O02', human_required: true } },
  { id: 'OPERATIONAL-05', category: 'operational', message: 'Faltou um item no pedido.', context: { intent: 'wrong_or_missing_item', origin: 'marketplace', order_reference: 'SIM-ORDER-E', occurrence_detail_code: 'missing_item' }, expected: { block_id: 'O02', human_required: true } },
  { id: 'OPERATIONAL-06', category: 'operational', message: 'Quero alterar o pedido.', context: { intent: 'order_change', origin: 'own_delivery', order_reference: 'SIM-ORDER-F', requested_change: 'synthetic_change' }, expected: { block_id: 'D05', human_required: true } },
  { id: 'OPERATIONAL-07', category: 'operational', message: 'Preciso de ajuda com delivery.', context: { intent: 'delivery', origin: 'own_delivery', delivery_topic: 'tracking' }, expected: { block_id: 'D01', human_required: false } },
  { id: 'OPERATIONAL-08', category: 'operational', message: 'Ocorreu um problema no marketplace.', context: { intent: 'occurrence', origin: 'marketplace', occurrence_type: 'delivery_issue', severity: 'medium' }, expected: { block_id: 'O01', human_required: true } },
  { id: 'OPERATIONAL-09', category: 'operational', message: 'Preciso falar com uma pessoa da operação.', context: { intent: 'human_request', severity: 'medium' }, expected: { block_id: 'H01', human_required: true } },
  { id: 'OPERATIONAL-10', category: 'operational', message: 'O pedido ainda não chegou.', context: { intent: 'delay', origin: 'marketplace', order_reference: 'SIM-ORDER-G' }, expected: { block_id: 'O05', human_required: true } },

  { id: 'SENSITIVE-01', category: 'sensitive', message: 'Existe uma promessa anterior ainda pendente.', context: { intent: 'prior_promise', prior_promise_reference: 'SIM-PROMISE-A' }, expected: { block_id: 'O08', human_required: true } },
  { id: 'SENSITIVE-02', category: 'sensitive', message: 'Houve uma cobrança incorreta.', context: { intent: 'charge_occurrence', origin: 'dining_room', occurrence_type: 'charge_issue', occurrence_detail_code: 'amount_disputed' }, expected: { block_id: 'O04', human_required: true } },
  { id: 'SENSITIVE-03', category: 'sensitive', message: 'Quero registrar uma situação do salão.', context: { intent: 'charge_occurrence', origin: 'dining_room', occurrence_type: 'dining_issue', occurrence_detail_code: 'service_issue' }, expected: { block_id: 'O04', human_required: true } },
  { id: 'SENSITIVE-04', category: 'sensitive', message: 'Houve uma situação com o manobrista.', context: { intent: 'valet_occurrence', origin: 'valet', occurrence_detail_code: 'vehicle_handling' }, expected: { block_id: 'O06', human_required: true } },
  { id: 'SENSITIVE-05', category: 'sensitive', message: 'O mesmo problema já aconteceu antes.', context: { intent: 'prior_promise', prior_promise_reference: 'SIM-HISTORY-A' }, expected: { block_id: 'O08', human_required: true } },
  { id: 'SENSITIVE-06', category: 'sensitive', message: 'Quero alertar sem pedir compensação.', context: { intent: 'alert_only', occurrence_type: 'quality_alert' }, expected: { block_id: 'O07', human_required: false } },
  { id: 'SENSITIVE-07', category: 'sensitive', message: 'Preciso revisar uma solicitação comercial.', context: { intent: 'reservation', availability: 'unavailable', reservation_date: 'SIM-DATE-F', reservation_time: 'SIM-SLOT-F', party_size: 4 }, expected: { block_id: 'R02', human_required: true } },
  { id: 'SENSITIVE-08', category: 'sensitive', message: 'Quero alterar um pedido já em andamento.', context: { intent: 'order_change', origin: 'marketplace', order_reference: 'SIM-ORDER-H', requested_change: 'synthetic_replacement' }, expected: { block_id: 'D05', human_required: true } },
  { id: 'SENSITIVE-09', category: 'sensitive', message: 'O atraso já gerou uma ocorrência.', context: { intent: 'delay', origin: 'own_delivery', order_reference: 'SIM-ORDER-I', occurrence_type: 'repeat_delay' }, expected: { block_id: 'O05', human_required: true } },
  { id: 'SENSITIVE-10', category: 'sensitive', message: 'Quero uma pessoa responsável pelo caso.', context: { intent: 'human_request', severity: 'high' }, expected: { block_id: 'H03', human_required: true } },

  { id: 'SEVERE-01', category: 'severe', message: 'Há um risco de saúde relacionado ao produto.', context: { intent: 'serious_quality', severity: 'high', occurrence_type: 'health_risk', occurrence_detail_code: 'synthetic_health_signal' }, expected: { block_id: 'O03', human_required: true } },
  { id: 'SEVERE-02', category: 'severe', message: 'A qualidade apresentou uma situação grave.', context: { intent: 'serious_quality', severity: 'critical', occurrence_type: 'critical_quality', occurrence_detail_code: 'synthetic_quality_signal' }, expected: { block_id: 'O03', human_required: true } },
  { id: 'SEVERE-03', category: 'severe', message: 'A cobrança exige decisão da gestão.', context: { intent: 'charge_occurrence', origin: 'dining_room', severity: 'high', occurrence_type: 'charge_issue', occurrence_detail_code: 'management_review' }, expected: { block_id: 'O04', human_required: true } },
  { id: 'SEVERE-04', category: 'severe', message: 'A situação do manobrista exige gestão.', context: { intent: 'valet_occurrence', origin: 'valet', severity: 'critical', occurrence_detail_code: 'management_review' }, expected: { block_id: 'O06', human_required: true } },
  { id: 'SEVERE-05', category: 'severe', message: 'Uma promessa anterior foi descumprida novamente.', context: { intent: 'prior_promise', severity: 'high', prior_promise_reference: 'SIM-PROMISE-B' }, expected: { block_id: 'O08', human_required: true } },

  { id: 'AMBIGUOUS-01', category: 'ambiguous', message: 'Preciso de ajuda.', context: {}, expected: { block_id: 'B01', human_required: false } },
  { id: 'AMBIGUOUS-02', category: 'ambiguous', message: 'Aconteceu uma coisa.', context: {}, expected: { block_id: 'B01', human_required: false } },
  { id: 'AMBIGUOUS-03', category: 'ambiguous', message: 'Quero saber como funciona.', context: {}, expected: { block_id: 'B01', human_required: false } },
  { id: 'AMBIGUOUS-04', category: 'ambiguous', message: 'Tenho uma dúvida e um problema.', context: {}, expected: { block_id: 'B01', human_required: false } },
  { id: 'AMBIGUOUS-05', category: 'ambiguous', message: 'Pode me orientar?', context: {}, expected: { block_id: 'B01', human_required: false } }
];

module.exports = Object.freeze(cases.map((item) => Object.freeze({ ...item, context: Object.freeze({ ...item.context }), expected: Object.freeze({ ...item.expected }) })));


