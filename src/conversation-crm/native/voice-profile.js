'use strict';

const { deepFreeze } = require('./catalogs/operational');
const { sha256 } = require('./deterministic');

const TATA_WARM_PROFILE = deepFreeze({
  id: 'tata_warm',
  version: '1.0.0',
  traits: ['acolhedor', 'elegante', 'simpático', 'próximo', 'natural'],
  avoid: ['formalidade_excessiva', 'tom_adolescente', 'propaganda', 'burocracia', 'promessa_sem_evidencia'],
  emoji: {
    common_max: 1,
    celebratory_max: 2,
    sensitive_max: 0
  },
  openings: {
    interested: [
      'Que bom que você quer conhecer melhor.',
      'Claro — te explico de um jeito simples.',
      'Boa pergunta.'
    ],
    concerned: [
      'Poxa, sinto muito por isso.',
      'Entendi o que aconteceu.',
      'Sinto muito pelo ocorrido.'
    ],
    frustrated: [
      'Entendo a sua frustração.',
      'Poxa, entendo como isso incomoda.',
      'Sinto muito por essa experiência.'
    ],
    enthusiastic: [
      'Que bom saber disso 😊',
      'Adorei saber do seu interesse 😊',
      'Vai ser um prazer te contar mais 😊'
    ],
    sensitive: [
      'Sinto muito pelo que aconteceu.',
      'Entendi a seriedade do que você relatou.',
      'Obrigado por nos contar o que aconteceu.'
    ]
  },
  continuations: [
    'Perfeito.',
    'Entendi.',
    'Certo.'
  ]
});

function deterministicVariant(values, key, slot = 'default') {
  if (!Array.isArray(values) || values.length === 0) return '';
  const digest = sha256(`${key}|${slot}`);
  const index = Number.parseInt(digest.slice(0, 8), 16) % values.length;
  return values[index];
}

function emojiLimit(plan) {
  if (plan.sentiment === 'sensitive' || plan.response_size === 'careful') return TATA_WARM_PROFILE.emoji.sensitive_max;
  if (plan.sentiment === 'enthusiastic') return TATA_WARM_PROFILE.emoji.celebratory_max;
  return TATA_WARM_PROFILE.emoji.common_max;
}

function countEmoji(text) {
  return (String(text).match(/\p{Extended_Pictographic}/gu) || []).length;
}

module.exports = {
  TATA_WARM_PROFILE,
  deterministicVariant,
  emojiLimit,
  countEmoji
};
