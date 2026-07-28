'use strict';

const { deepFreeze } = require('./catalogs/operational');

const TATA_WARM_PROFILE = deepFreeze({
  schema_version: 'conversation-voice-profile-v1',
  id: 'tata_warm',
  version: '1.0.0',
  locale: 'pt-BR',
  traits: [
    'humano',
    'acolhedor',
    'natural',
    'elegante',
    'proximo',
    'claro',
    'profissional_sem_burocracia'
  ],
  prohibited_styles: [
    'infantilizacao',
    'pressao_comercial',
    'propaganda_desnecessaria',
    'menu_rigido',
    'saudacao_repetida',
    'desculpa_repetida'
  ],
  prohibited_phrases: [
    'setor responsável',
    'da forma correta',
    'com a devida atenção',
    'para que possamos',
    'seguimos à disposição'
  ],
  emoji_limits: {
    none: 0,
    optional_one: 1,
    celebratory_two: 2
  },
  components: {
    neutral_acknowledgement: [
      'Entendi.',
      'Certo.',
      'Perfeito.'
    ],
    interested_acknowledgement: [
      'Claro.',
      'Boa pergunta.',
      'Que bom que você quer saber mais.'
    ],
    problem_acknowledgement: [
      'Entendi o que aconteceu.',
      'Poxa, sinto muito por isso.',
      'Sinto muito pelo ocorrido.'
    ],
    sensitive_acknowledgement: [
      'Sinto muito pelo que aconteceu.',
      'Obrigado por nos contar o que aconteceu.',
      'Entendi a seriedade do seu relato.'
    ],
    uncertainty_transition: [
      'Ainda preciso de uma confirmação antes de concluir.',
      'Não tenho uma confirmação segura para afirmar isso agora.',
      'Vou separar o que já sabemos do que ainda precisa ser confirmado.'
    ],
    continuation: [
      'Perfeito.',
      'Certo.',
      'Entendi.'
    ]
  }
});

function countEmoji(text) {
  return (String(text || '').match(/\p{Extended_Pictographic}/gu) || []).length;
}

function emojiLimit(policy) {
  return TATA_WARM_PROFILE.emoji_limits[policy] ?? 0;
}

function validateVoiceProfile(profile = TATA_WARM_PROFILE) {
  const required = ['schema_version', 'id', 'version', 'locale', 'traits', 'prohibited_styles', 'prohibited_phrases', 'emoji_limits', 'components'];
  const missing = required.filter((field) => profile[field] == null);
  if (missing.length || profile.id !== 'tata_warm' || profile.locale !== 'pt-BR') {
    const error = new Error('VOICE_PROFILE_INVALID');
    error.code = 'VOICE_PROFILE_INVALID';
    error.missing = missing;
    throw error;
  }
  return profile;
}

module.exports = {
  TATA_WARM_PROFILE,
  countEmoji,
  emojiLimit,
  validateVoiceProfile
};
