'use strict';

const { SeededRandom } = require('./prng');

const PHRASES = Object.freeze({
  greeting: ['Oi, tudo bem?', 'Boa noite', 'Oii'],
  first_visit: ['Oi, é minha primeira vez e não entendo muito de japonês', 'Nunca pedi aí e não manjo nada de sushi', 'Quero experimentar, mas não conheço esses nomes'],
  nonexpert: ['Não entendo nada de comida japonesa, você me ajuda?', 'Não manjo dos nomes do sushi', 'Queria provar, mas não conheço o cardápio'],
  recommend_salmon: ['Quero algo com salmão, o que você sugere?', 'Tô a fim de salmão. O que você escolheria?', 'Me ajuda a escolher uma opção com salmão'],
  recommend_tuna: ['Quero alguma coisa com atum', 'Na verdade eu prefiro atum', 'Tem uma boa opção com atum?'],
  channel_ifood: ['Vou pedir pelo iFood', 'é pelo aplicativo do iFood', 'quero no iFood'],
  channel_salon: ['Vou comer no salão', 'acho que vou ao restaurante', 'prefiro presencial no salão'],
  switch_salon: ['talvez eu vá aí então', 'acho q vou ao restaurante em vez do iFood', 'mudei de ideia, quero no salão'],
  switch_ifood: ['melhor pedir pelo iFood', 'na verdade vai ser iFood', 'mudei, quero pelo aplicativo'],
  light: ['queria algo mais leve', 'tem algo menos pesado?', 'queria uma coisa leve'],
  torched: ['queria algo maçaricado', 'prefiro uma opção maçaricada', 'tem algum salmão maçaricado?'],
  not_fried: ['sem fritura, por favor', 'n quero nada frito', 'dá para ser sem fritura?'],
  no_cream: ['não curto muito cream cheese', 'n curto cream cheese', 'não sou muito fã de cream cheese'],
  party_two: ['somos duas pessoas', 'é pra 2', 'vamos em dois'],
  party_five: ['somos cinco na verdade', 'agora somos 5', 'vai ser pra cinco pessoas'],
  decision: ['qual dessas você escolheria?', 'dessas opções qual você acha melhor?', 'o que você escolheria entre esses?'],
  reference_second: ['essa segunda é crua?', 'e a segunda, é crua?', 'essa segunda opção tem peixe cru?'],
  reference_false: ['essa segunda é crua?', 'e a primeira quanto custa?', 'essa opção é frita?'],
  price: ['quanto custa?', 'e valor?', 'quanto fica?'],
  pairing: ['tem alguma bebida que combina?', 'tem bebida?', 'tem um sake que harmoniza?'],
  allergy: ['minha irmã tem alergia a camarão', 'uma pessoa do grupo é alérgica a camarão', 'temos alergia a crustáceos no grupo'],
  incident: ['depois de comer uma pessoa passou mal', 'minha irmã teve vômito depois da refeição', 'duas pessoas tiveram diarreia depois de comer'],
  incident_detail: ['foi depois do jantar de hoje', 'aconteceu com duas pessoas', 'a pessoa ainda não está se sentindo bem'],
  human_request: ['quero falar com uma pessoa', 'pode chamar alguém da equipe?', 'preciso de atendimento humano'],
  valet: ['e tem valet?', 'como funciona o valet?', 'pergunta rápida: tem estacionamento com valet?'],
  address: ['qual é o endereço?', 'onde fica mesmo?', 'e a localização do restaurante?'],
  resume: ['voltando ao cardápio', 'enfim, voltando às opções', 'sobre o que eu estava escolhendo'],
  correction_tuna: ['na vdd atum', 'corrigindo: não quero salmão, quero atum', 'mudei de ideia, melhor atum'],
  repetition: ['e aí?', 'você pode me ajudar?', 'não entendi, tenta de outro jeito'],
  multiple_info: ['somos 5, queremos salmão e vamos comer no salão', 'somos cinco e vamos comer no salão, queria salmão', 'estamos em 5 pessoas no salão, de preferência salmão'],
  multiple_questions: ['quanto custa a segunda e ela é crua?', 'a segunda é crua e qual o valor?', 'qual o preço da segunda opção e o preparo é cru?'],
  unknown: ['vocês têm menu secreto?', 'tem omakase de madrugada?', 'posso levar meu próprio peixe?']
});

function phraseFor(action, random, mutation) {
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

module.exports = { PHRASES, phraseFor, SyntheticCustomer };
