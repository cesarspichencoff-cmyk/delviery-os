'use strict';

const { deepFreeze } = require('./catalogs/operational');

const DAY_LABELS = Object.freeze({
  monday: 'segunda-feira',
  tuesday: 'terça-feira',
  wednesday: 'quarta-feira',
  thursday: 'quinta-feira',
  friday: 'sexta-feira',
  saturday: 'sábado',
  sunday: 'domingo'
});

const DAY_SIGNALS = Object.freeze([
  ['monday', /\bsegunda(?:-feira)?\b/u],
  ['tuesday', /\bterca(?:-feira)?\b/u],
  ['wednesday', /\bquarta(?:-feira)?\b/u],
  ['thursday', /\bquinta(?:-feira)?\b/u],
  ['friday', /\bsexta(?:-feira)?\b/u],
  ['saturday', /\bsabado\b/u],
  ['sunday', /\bdomingo\b/u]
]);

function normalizePublicText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

function detectPublicTopic(content) {
  const text = normalizePublicText(content);
  if (/\b(oke|okes|tabua de sushi|evento com sushi)\b/u.test(text)) return 'oke_pickup';
  if (/\b(valet|manobrista)\b/u.test(text)) return 'valet_information';
  if (/\b(conhecer melhor|conhecer o|sobre o|como e o)\b.*\b(restaurante|tata)\b/u.test(text)) return 'restaurant_overview';
  if (/\b(rodizio|rodizio japones)\b/u.test(text)) return 'restaurant_model';
  if (/\b(almoco executivo|sete cursos|7 cursos)\b/u.test(text)) return 'executive_lunch';
  if (/\b(sugestao tata|cinco cursos|5 cursos)\b/u.test(text)) return 'tata_suggestion';
  if (/\b(cardapio|menu)\b/u.test(text) && /\b(delivery|entrega|neemo)\b/u.test(text)) return 'delivery_menu';
  if (/\b(cardapio|menu)\b/u.test(text) && /\b(presencial|salao|restaurante|completo)\b/u.test(text)) return 'dining_room_menu';
  if (/\b(cardapio|menu|precos dos itens|ver as opcoes)\b/u.test(text)) return 'institutional_menu';
  if (/\b(sem fritura|nao frit[oa]s?|salm[aã]o|cream cheese|harmoniza|bebida combina|op[cç][aã]o sugerida|recomend)\b/u.test(text)) return 'menu_guidance';
  if (/\b(onde|como)\b.*\b(pedir|fazer pedido)\b/u.test(text) || /\b(delivery proprio|pedir pelo ifood|ifood ou delivery)\b/u.test(text)) return 'delivery_options';
  if (/\b(reserva|reservar|tem mesa|(?:quero|preciso de) uma mesa|acho que vou pessoalmente|vou (?:ai )?pessoalmente|vou (?:no|ao) restaurante)\b/u.test(text)) return 'reservation';
  if (/\b(fila|espera|posicao)\b/u.test(text)) return 'waitlist';
  if (/\b(feriado)\b/u.test(text) && /\b(horario|abre|aberto|funciona)\b/u.test(text)) return 'holiday_hours';
  if (/\b(horario|funcionamento|abre|aberto|fecha)\b/u.test(text)) return 'opening_hours';
  if (/\b(pagamentos?|aceitam? pix|aceitam? dinheiro|cartao|vale refeicao|alelo|pluxee|ticket restaurante)\b/u.test(text)) return 'payment';
  if (/\b(rolha|levar vinho)\b/u.test(text)) return 'corkage';
  if (/\b(endereco|onde fic(?:a|am)(?: (?:vcs|voces))?|onde (?:vcs|voces) ficam|localizacao)\b/u.test(text)) return 'address';
  return null;
}

function intentForPublicTopic(topic) {
  if (topic === 'oke_pickup') return 'event.oke_pickup';
  if (topic === 'valet_information' || topic === 'address') return 'information.address';
  if (['executive_lunch', 'tata_suggestion', 'restaurant_model', 'restaurant_overview', 'delivery_menu', 'dining_room_menu', 'institutional_menu', 'delivery_options', 'menu_guidance'].includes(topic)) return 'information.menu';
  if (topic === 'reservation') return 'reservation.create';
  if (topic === 'waitlist') return 'waitlist.create';
  if (topic === 'holiday_hours' || topic === 'opening_hours') return 'information.hours';
  if (topic === 'payment') return 'information.payment';
  if (topic === 'corkage') return 'information.corkage';
  return null;
}

function formatPeriod(period) {
  return `${period.opens.replace(':', 'h').replace(/h00$/u, 'h')} às ${period.closes.replace(':', 'h').replace(/h00$/u, 'h')}`;
}

function formatDay(hours, day) {
  return hours.regular[day].map(formatPeriod).join(' e ');
}

function requestedDay(content) {
  const text = normalizePublicText(content);
  return DAY_SIGNALS.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

function requestedTimeMinutes(content) {
  const text = normalizePublicText(content);
  const match = text.match(/\b(?:as|a)\s+(\d{1,2})(?:h|:(\d{2}))?\b/u);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

function isInsidePeriods(minutes, periods) {
  return periods.some((period) => {
    const [openHour, openMinute] = period.opens.split(':').map(Number);
    const [closeHour, closeMinute] = period.closes.split(':').map(Number);
    return minutes >= openHour * 60 + openMinute && minutes < closeHour * 60 + closeMinute;
  });
}

function listCourseCategories(courses) {
  return courses.map((course) => course.split(' — ')[0].toLowerCase()).join(', ');
}

function missingQuestion(fields, labels) {
  const pending = fields.filter((field) => labels[field]).map((field) => labels[field]);
  if (!pending.length) return '';
  if (pending.length === 1) return ` Pode me informar ${pending[0]}?`;
  return ` Pode me informar ${pending.slice(0, -1).join(', ')} e ${pending.at(-1)}?`;
}

function publicInformationResponse(input) {
  const { topic, content, publicInfo, fieldsMissing = [], intentId } = input;
  const text = normalizePublicText(content);
  const unit = publicInfo.unit;
  if (topic === 'address') return `O TATÁ do Itaim fica na ${unit.address}`;
  if (topic === 'opening_hours') {
    const day = requestedDay(content);
    if (!day) return 'Os horários regulares são: segunda a quinta, 12h às 15h e 19h às 23h; sexta, 12h às 15h e 19h às 23h30; sábado, 12h às 16h30 e 19h às 23h30; domingo, 11h às 16h30 e 18h às 22h.';
    const article = day === 'saturday' || day === 'sunday' ? 'No' : 'Na';
    const base = `${article} ${DAY_LABELS[day]}, o horário regular é ${formatDay(publicInfo.opening_hours, day)}.`;
    const minutes = requestedTimeMinutes(content);
    if (minutes === null) return base;
    return isInsidePeriods(minutes, publicInfo.opening_hours.regular[day])
      ? `${base} O horário informado fica dentro do funcionamento regular.`
      : `${base} O horário informado fica fora do funcionamento regular.`;
  }
  if (topic === 'holiday_hours') return 'O horário de feriado ainda não está configurado. O horário especial precisa de validação antes de ser informado.';
  if (topic === 'reservation') return `Você pode consultar a reserva por este link: ${publicInfo.reservation.url} A tolerância é de 15 minutos. A confirmação depende do retorno do sistema.`;
  if (topic === 'waitlist') return `Quando não houver reserva disponível, a fila pode ser acessada pelo mesmo link: ${publicInfo.waitlist.url} Após a chamada da mesa, o prazo informado para chegada é de 5 minutos. Não vou estimar posição ou tempo de espera sem resultado observável.`;
  if (topic === 'dining_room_menu') return `Este é o cardápio presencial completo: ${publicInfo.menus.dining_room_complete}`;
  if (topic === 'delivery_menu') return `Este é o cardápio do delivery próprio: ${publicInfo.menus.own_delivery}`;
  if (topic === 'institutional_menu') return `Este é o cardápio com os preços dos itens: ${publicInfo.menus.institutional_with_prices}`;
  if (topic === 'delivery_options') return `Você pode pedir pelo delivery próprio em ${publicInfo.delivery.own_delivery_url} ou pelo iFood. Não há preferência automática entre as opções.`;
  if (topic === 'restaurant_model') return 'O TATÁ trabalha à la carte. O Almoço Executivo e a Sugestão Tatá são menus em cursos, não rodízio.';
  if (topic === 'restaurant_overview') return 'O TATÁ Sushi trabalha à la carte e oferece Almoço Executivo nos almoços de dias úteis e Sugestão Tatá no jantar, fins de semana e feriados. Posso te contar sobre a experiência, o ambiente, a unidade, os horários, as reservas ou o cardápio.';
  if (topic === 'executive_lunch') {
    const offer = publicInfo.executive_lunch;
    if (/\b(o que vem|quais cursos|inclui|composicao)\b/u.test(text)) return `O Almoço Executivo tem sete cursos: ${listCourseCategories(offer.courses)}. Custa R$ 136 por pessoa e inclui uma repetição.`;
    if (/\b(repetir|repeticao)\b/u.test(text)) return 'O Almoço Executivo dá direito a uma repetição. Os detalhes sobre quais itens podem ser repetidos ainda precisam de confirmação.';
    return 'O Almoço Executivo é servido no almoço durante a semana, com sete cursos, por R$ 136 por pessoa e direito a uma repetição.';
  }
  if (topic === 'tata_suggestion') {
    const offer = publicInfo.tata_suggestion;
    if (/\b(o que vem|quais cursos|inclui|composicao)\b/u.test(text)) return `A Sugestão Tatá tem cinco cursos: ${listCourseCategories(offer.courses)}. Custa R$ 180 por pessoa e não inclui repetição.`;
    return 'A Sugestão Tatá é oferecida no jantar, fim de semana e feriado. São cinco cursos por R$ 180 por pessoa, sem repetição.';
  }
  if (topic === 'payment') {
    if (/\b(pix|dinheiro|aproximacao|parcelamento)\b/u.test(text)) return 'Essa forma de pagamento ainda não consta entre as opções validadas no catálogo. Posso informar apenas o que já foi verificado.';
    return `As formas confirmadas são: ${publicInfo.payments.confirmed.join(', ')}.`;
  }
  if (topic === 'corkage') return 'A taxa de rolha é de R$ 70.';
  if (topic === 'valet_information') return 'O valet custa R$ 45 e fica em frente ao restaurante.';
  if (topic === 'oke_pickup') {
    const base = 'Os okes são preparados para retirada na loja e dependem de confirmação da equipe. O retorno é informado até o dia seguinte, e as tábuas devem ser devolvidas em até dois dias.';
    if (/\b(entrega|entregar|entregam|delivery)\b/u.test(text)) return `${base} A modalidade atual não inclui entrega.`;
    return `${base}${missingQuestion(fieldsMissing, { party_size: 'a quantidade exata de pessoas', pickup_time: 'o horário planejado para retirada', requested_items: 'tudo o que deseja pedir' })}`;
  }
  const isIfood = /\bifood\b/u.test(text);
  const alreadyOpened = /\b(ja abri|chamado aberto|ja reportei|ja enviei pela ajuda)\b/u.test(text);
  const orderQuestion = missingQuestion(fieldsMissing, { order_reference: 'o número do pedido', order_channel: 'o canal do pedido' });
  if (isIfood && alreadyOpened) return `Sinto muito pelo ocorrido. Como o chamado já foi aberto no pedido, vou preservar o relato no atendimento e manter o caso aberto enquanto a análise segue pelo aplicativo.${orderQuestion}`;
  if (isIfood && intentId === 'occurrence.refund_request') return `Sinto muito pelo ocorrido. Para solicitar a análise, abra o pedido no iFood, toque em Ajuda ou Reportar problema, escolha o motivo e envie as evidências disponíveis. Também vou manter o relato no atendimento, sem prometer reembolso.${orderQuestion}`;
  if (isIfood && /^occurrence\.(?:missing_item|wrong_item|wrong_quantity|personalization_ignored|quality|freshness|taste|appearance|foreign_body|allergen)$/u.test(intentId)) return `Sinto muito pelo ocorrido. Registre a solicitação pelo pedido no iFood, em Ajuda ou Reportar problema, e envie as evidências disponíveis. O relato também permanece no atendimento para preservar o contexto.${orderQuestion}`;
  if (isIfood && /^occurrence\.(?:order_disrupted|route_delay|collection_delay|driver|coupon)$/u.test(intentId)) return `Sinto muito pelo ocorrido. Esse tipo de situação pode depender da análise da entrega ou da plataforma. Abra o pedido no iFood, toque em Ajuda ou Reportar problema e selecione o motivo correspondente; o caso permanece aberto por aqui.${orderQuestion}`;
  return null;
}

function publicBehaviorOverride(topic) {
  if (['address', 'opening_hours', 'holiday_hours', 'dining_room_menu', 'delivery_menu', 'institutional_menu', 'delivery_options', 'restaurant_model', 'restaurant_overview', 'menu_guidance', 'executive_lunch', 'tata_suggestion', 'payment', 'corkage', 'valet_information'].includes(topic)) {
    return deepFreeze({ escalation: 'E0' });
  }
  if (topic === 'oke_pickup') {
    return deepFreeze({
      capability_id: 'human.queue.create',
      capability_state: 'requires_human',
      authority: 'A1',
      escalation: 'E1',
      expected_result: { status: 'requires_human' },
      action: 'collect_oke_pickup_request',
      closure: { expected_state: 'open', blocked_by: ['team_availability_confirmation'] }
    });
  }
  return null;
}

module.exports = {
  DAY_LABELS,
  normalizePublicText,
  detectPublicTopic,
  intentForPublicTopic,
  formatDay,
  requestedDay,
  requestedTimeMinutes,
  isInsidePeriods,
  publicInformationResponse,
  publicBehaviorOverride
};

