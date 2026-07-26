'use strict';

const HUMAN_TEST_GROUPS = Object.freeze([
  { id: 'restaurant_information', label: 'Informações do restaurante', prompts: ['Qual é o endereço?', 'Quais são os horários de domingo?'] },
  { id: 'reservations', label: 'Reservas', prompts: ['Quero fazer uma reserva para hoje.', 'Qual é a tolerância da reserva?'] },
  { id: 'waitlist', label: 'Fila', prompts: ['Como funciona a fila de espera?', 'Quanto tempo tenho depois que a mesa chamar?'] },
  { id: 'dining_room', label: 'Salão', prompts: ['Como funciona o atendimento no salão?', 'O restaurante é à la carte?'] },
  { id: 'menu', label: 'Cardápio', prompts: ['Pode mandar o cardápio presencial?', 'Quero ver os preços dos itens.'] },
  { id: 'executive_lunch', label: 'Almoço Executivo', prompts: ['Como é o Almoço Executivo?', 'O que vem nos sete cursos?'] },
  { id: 'tata_suggestion', label: 'Sugestão Tatá', prompts: ['Como funciona a Sugestão Tatá?', 'A Sugestão Tatá tem repetição?'] },
  { id: 'payments', label: 'Pagamentos', prompts: ['Quais pagamentos vocês aceitam?', 'Vocês aceitam Pix?'] },
  { id: 'own_delivery', label: 'Delivery próprio', prompts: ['Onde faço o pedido pelo delivery do TATÁ?', 'Quero o cardápio do delivery.'] },
  { id: 'ifood', label: 'iFood', prompts: ['Meu pedido do iFood veio errado.', 'Já abri um chamado no iFood.'] },
  { id: 'orders', label: 'Pedidos', prompts: ['Quero saber se meu pedido já está pronto.', 'Meu pedido parece estar atrasado.'] },
  { id: 'missing_item', label: 'Item faltando', prompts: ['Faltou meu refrigerante no pedido.', 'Não veio a bebida.'] },
  { id: 'wrong_item', label: 'Item errado', prompts: ['Veio outro item no pedido.', 'Pedi uma bebida e veio outra.'] },
  { id: 'personalization', label: 'Personalização', prompts: ['Pedi sem cebola e veio com.', 'Minha personalização foi ignorada.'] },
  { id: 'delay', label: 'Atraso', prompts: ['Meu pedido está demorando muito.', 'A última atualização parece antiga.'] },
  { id: 'delivery', label: 'Entrega', prompts: ['Meu pedido veio revirado durante a entrega.', 'O entregador ainda não chegou.'] },
  { id: 'quality', label: 'Qualidade', prompts: ['O alimento está com cheiro estranho.', 'O prato veio fora do padrão.'] },
  { id: 'food_safety', label: 'Segurança alimentar', prompts: ['Encontrei cabelo no prato.', 'Duas pessoas tiveram vômito e diarreia.'] },
  { id: 'events_oke', label: 'Eventos e Okes', prompts: ['Quero encomendar um oke para retirada.', 'Quando preciso devolver as tábuas?'] },
  { id: 'large_group', label: 'Grupo grande', prompts: ['Estamos em 10 pessoas e chegando.', 'Somos 11 e chegamos às 20h.'] },
  { id: 'praise', label: 'Elogios', prompts: ['Adorei a experiência no TATÁ.', 'O atendimento foi ótimo.'] },
  { id: 'privacy', label: 'Privacidade', prompts: ['Não quero mais receber comunicações.', 'Quero corrigir meus dados.'] },
  { id: 'multi_turn', label: 'Conversas multiturno', prompts: ['Quero reservar para hoje.', 'Somos quatro.'] },
  { id: 'failures_handoff', label: 'Falhas e handoff humano', prompts: ['Não foi possível concluir automaticamente.', 'As informações estão diferentes entre os sistemas.'] }
]);

module.exports = { HUMAN_TEST_GROUPS };
