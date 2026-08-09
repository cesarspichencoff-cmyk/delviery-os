'use strict';

const { SeededRandom } = require('./prng');

const PHRASES = Object.freeze({
  greeting: ['Oi, tudo bem?', 'Boa noite', 'Oii'],
  first_visit: ['Oi, é minha primeira vez e não entendo muito de japonês', 'Nunca pedi aí e não manjo nada de sushi', 'Quero experimentar, mas não conheço esses nomes'],
  nonexpert: ['Não entendo nada de comida japonesa, você me ajuda?', 'Não manjo dos nomes do sushi', 'Queria provar, mas não conheço o cardápio'],
  recommend_salmon: ['Quero algo com salmão, o que você sugere?', 'Tô a fim de salmão. O que você escolheria?', 'Me ajuda a escolher uma opção com salmão'],
  recommend_tuna: ['Quero alguma coisa com atum', 'Na verdade eu prefiro atum', 'Tem uma boa opção com atum?'],
  recommend_general: ['o que você recomenda pra mim?', 'me ajuda a escolher alguma coisa?', 'quero pedir mas tô meio na dúvida'],
  channel_ifood: ['Vou pedir pelo iFood', 'é pelo aplicativo do iFood', 'quero no iFood'],
  channel_salon: ['Vou comer no salão', 'acho que vou ao restaurante', 'prefiro presencial no salão'],
  switch_salon: ['talvez eu vá aí então', 'acho q vou ao restaurante em vez do iFood', 'mudei de ideia, quero no salão'],
  switch_ifood: ['melhor pedir pelo iFood', 'na verdade vai ser iFood', 'mudei, quero pelo aplicativo'],
  light: ['queria algo mais leve', 'tem algo menos pesado?', 'queria uma coisa leve'],
  torched: ['queria algo maçaricado', 'prefiro uma opção maçaricada', 'tem algum salmão maçaricado?'],
  not_fried: ['sem fritura, por favor', 'n quero nada frito', 'dá para ser sem fritura?'],
  raw: ['pode ser algo cru', 'eu gosto de peixe cru', 'quero uma opção crua'],
  cooked: ['prefiro algo cozido', 'prefiro cozido em vez de cru', 'pode ser uma opção quente'],
  traditional: ['queria algo mais tradicional', 'prefiro um clássico', 'tem uma opção mais tradicional?'],
  different: ['quero provar algo diferente', 'me surpreende com algo menos óbvio', 'queria uma opção mais ousada'],
  budget_low: ['queria algo mais em conta', 'até R$ 60 pra mim', 'tem uma opção mais barata?'],
  premium: ['quero uma experiência mais especial', 'pode ser algo premium', 'queria uma opção mais completa'],
  share: ['queremos algo para compartilhar', 'dá pra dividir?', 'queria uma opção pra mesa toda'],
  no_cream: ['não curto muito cream cheese', 'n curto cream cheese', 'não sou muito fã de cream cheese'],
  party_two: ['somos duas pessoas', 'é pra 2', 'vamos em dois'],
  party_one: ['é só pra uma pessoa', 'sou só eu', 'estou em 1 pessoa'],
  party_three: ['somos três pessoas', 'é pra 3', 'estamos em três'],
  party_five: ['somos cinco na verdade', 'agora somos 5', 'vai ser pra cinco pessoas'],
  party_large: ['somos 10 pessoas e estamos chegando', 'mesa para nove pessoas', 'estamos em doze'],
  decision: ['qual dessas você escolheria?', 'dessas opções qual você acha melhor?', 'o que você escolheria entre esses?'],
  reference_second: ['essa segunda é crua?', 'e a segunda, é crua?', 'essa segunda opção tem peixe cru?'],
  reference_false: ['essa segunda é crua?', 'e a primeira quanto custa?', 'essa opção é frita?'],
  price: ['quanto custa?', 'e valor?', 'quanto fica?'],
  pairing: ['tem alguma bebida que combina?', 'tem bebida?', 'tem um sake que harmoniza?'],
  allergy: ['minha irmã tem alergia a camarão', 'uma pessoa do grupo é alérgica a camarão', 'temos alergia a crustáceos no grupo'],
  allergy_interrupt: ['pera, minha irmã tem alergia a camarão', 'antes de decidir: uma pessoa tem alergia a crustáceos', 'opa, tem alergia a camarão no grupo'],
  intolerance: ['tenho intolerância a lactose', 'uma pessoa não pode consumir leite', 'temos intolerância a glúten no grupo'],
  incident: ['depois de comer uma pessoa passou mal', 'minha irmã teve vômito depois da refeição', 'duas pessoas tiveram diarreia depois de comer', 'ela comeu camarão e começou a passar mal', 'tá tendo uma reação'],
  urgency: ['ela está com dificuldade para respirar', 'a pessoa está passando muito mal agora', 'teve reação e não consegue respirar direito', 'ela tá sem ar', 'comeu e agora tá com dificuldade pra respirar', 'meu namorado teve reação e não respira direito', 'acho que deu alergia e ela tá ficando sem ar', 'minha irmã não consegue respirar', 'começou a inchar e tá difícil respirar'],
  incident_detail: ['foi depois do jantar de hoje', 'aconteceu com duas pessoas', 'a pessoa ainda não está se sentindo bem'],
  human_request: ['quero falar com uma pessoa', 'pode chamar alguém da equipe?', 'preciso de atendimento humano'],
  valet: ['e tem valet?', 'como funciona o valet?', 'pergunta rápida: tem estacionamento com valet?'],
  address: ['qual é o endereço?', 'onde fica mesmo?', 'e a localização do restaurante?'],
  resume: ['voltando ao cardápio', 'enfim, voltando às opções', 'sobre o que eu estava escolhendo'],
  correction_tuna: ['na vdd atum', 'corrigindo: não quero salmão, quero atum', 'mudei de ideia, melhor atum'],
  repetition: ['e aí?', 'você pode me ajudar?', 'não entendi, tenta de outro jeito'],
  multiple_info: ['somos 5, queremos salmão e vamos comer no salão', 'somos cinco e vamos comer no salão, queria salmão', 'estamos em 5 pessoas no salão, de preferência salmão'],
  multiple_questions: ['quanto custa a segunda e ela é crua?', 'a segunda é crua e qual o valor?', 'qual o preço da segunda opção e o preparo é cru?'],
  unknown: ['vocês têm menu secreto?', 'tem omakase de madrugada?', 'posso levar meu próprio peixe?'],
  hesitation: ['hmm não sei ainda', 'talvez, tô pensando', 'pera aí deixa eu ver'],
  decision_short: ['qual vc pegaria?', 'tá mas qual é melhor?', 'dessas qual?'],
  reference_first: ['e a primeira?', 'essa primeira é frita?', 'quanto fica a primeira?'],
  switch_salon_question: ['e se eu for no restaurante?', 'se eu for aí muda alguma coisa?', 'acho q vou aí'],
  correction_quantity: ['na verdade agora somos 5', 'corrigindo, vai ser pra três', 'mudou: estamos em cinco'],
  open_dining: ['Preciso de um lugar para comer hoje', 'quero um lugar pra jantar hoje', 'tô procurando onde comer hoje', 'queria ir no Tatá hoje'],
  user_repair: ['você não está entendendo, eu falei sushi', 'não foi isso que eu pedi', 'quem falou em fritura? eu falei sushi', 'vc entendeu errado'],
  negative_feedback: ['você não está ajudando', 'isso não tem nada a ver', 'já vi que você não sabe de nada', 'vc tá perdido'],
  reservation_switch: ['quero reservar para 7 pessoas', 'esquece o delivery, quero reservar', 'tem mesa pra 7?', 'acho que vou pessoalmente'],
  journey_abandonment: ['esquece isso, quero reservar agora', 'não quero saber disso, vou no restaurante então', 'deixa o pedido, quero uma mesa para 7'],
  category_sushi: ['quero comer sushi', 'quero sushi', 'quero opções de sushi'],
  category_sashimi: ['quero sashimi', 'tem opções de sashimi?', 'quero comer sashimi'],
  category_temaki: ['quero temaki', 'tem opções de temaki?', 'quero comer um temaki'],
  category_hot_roll: ['quero hot roll', 'tem opções de hot roll?', 'eu pedi hot roll'],
  category_combinado: ['quero um combinado', 'tem opções de combinado?', 'quero ver os combinados'],
  category_entrada: ['quero uma entrada', 'tem opções de entrada?', 'quero ver as entradas'],
  category_sobremesa: ['quero uma sobremesa', 'tem opções de sobremesa?', 'quero ver as sobremesas'],
  category_drink: ['quero um drink', 'tem opções de drink?', 'quero ver os drinks']
});

function phraseFor(action, random, mutation) {
  if (action.message) return action.message;
  const variants = PHRASES[action.type];
  if (!variants) throw new Error(`EXPERIENCE_LAB_UNKNOWN_ACTION:${action.type}`);
  const chosen = random.pick(variants);
  if (!mutation) return chosen;
  return chosen
    .replace(/não/giu, random.pick(['n', 'nao', 'não']))
    .replace(/você/giu, random.pick(['vc', 'você']))
    .replace(/[?]/gu, random.pick(['?', '??', '']))
    .replace(/ na verdade/giu, random.pick([' na vdd', ' agr', ' na verdade']));
}

class SyntheticCustomer {
  constructor(scenario, seed) {
    this.scenario = scenario;
    this.random = new SeededRandom(`${seed}:${scenario.scenario_id}`);
    this.index = 0;
  }

  nextTurn(lastAssistantTurn = null) {
    if (this.index >= this.scenario.actions.length) return null;
    let action = this.scenario.actions[this.index];
    if (action.type === 'adaptive_channel') {
      const response = String(lastAssistantTurn?.response || '').toLowerCase();
      action = { type: response.includes('ifood') || response.includes('salão') ? this.scenario.channel_action : 'channel_ifood' };
    }
    this.index += 1;
    return Object.freeze({
      action,
      message: phraseFor(action, this.random, this.scenario.mutated === true)
    });
  }
}

class FreeSyntheticCustomer {
  constructor(scenario, seed) {
    this.context = Object.freeze({ ...scenario.free_customer });
    this.random = new SeededRandom(`${seed}:${scenario.scenario_id}:free`);
    this.index = 0;
    this.lastResponse = '';
    this.repaired = false;
  }

  opening() {
    if (this.context.goal === 'dine_out') return this.random.pick(PHRASES.open_dining);
    if (this.context.goal === 'reservation') return this.random.pick(PHRASES.reservation_switch);
    return this.random.pick(PHRASES[`category_${this.context.goal}`] || PHRASES.category_sushi);
  }

  nextTurn(lastAssistantTurn = null) {
    const response = String(lastAssistantTurn?.response || '');
    const normalized = response.toLowerCase();
    if (this.index === 0) {
      this.index += 1;
      return Object.freeze({ action: { type: this.context.goal === 'dine_out' ? 'open_dining' : `category_${this.context.goal}` }, message: this.opening() });
    }
    if (this.index >= Number(this.context.maximum_turns || 5)) return null;
    let action;
    if (/sal[aã]o|ifood|delivery pr[oó]prio/iu.test(response) && /\?/u.test(response)) {
      action = { type: this.context.constraints.channel === 'dining_room' ? 'channel_salon' : 'channel_ifood', expect: { channel: this.context.constraints.channel } };
    } else if (!this.repaired && (/ainda n[aã]o tenho|restaurante, uma reserva ou um pedido/iu.test(response)
      || (this.context.goal !== 'dine_out' && !normalized.includes(this.context.goal.replace('_', ' '))))) {
      action = { type: 'user_repair' };
    } else if (this.context.mood === 'impatient' && this.index === 2) {
      action = { type: 'negative_feedback' };
    } else if (this.index >= 3) {
      action = { type: 'reservation_switch' };
    } else {
      action = this.context.goal === 'dine_out' ? { type: 'category_sushi' } : { type: 'user_repair' };
    }
    if (action.type === 'user_repair') this.repaired = true;
    this.index += 1;
    this.lastResponse = response;
    return Object.freeze({ action, message: phraseFor(action, this.random, this.context.mood !== 'calm') });
  }
}

module.exports = { PHRASES, phraseFor, SyntheticCustomer, FreeSyntheticCustomer };
