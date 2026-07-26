'use strict';

const SYNTHETIC_FIXTURES = Object.freeze({
  synthetic: true,
  units: Object.freeze([
    Object.freeze({ synthetic: true, unit_id: 'SIM-UNIT-001', label: 'UNIDADE_SINTETICA_A', time_zone: 'America/Sao_Paulo' }),
    Object.freeze({ synthetic: true, unit_id: 'SIM-UNIT-002', label: 'UNIDADE_SINTETICA_B', time_zone: 'America/Sao_Paulo' })
  ]),
  information: Object.freeze({ synthetic: true, address: 'ENDERECO_SINTETICO_INDISPONIVEL_EM_PRODUCAO', hours: 'HORARIO_SINTETICO', menu_url: 'https://example.invalid/synthetic-menu', payments: Object.freeze(['SYNTHETIC_PAYMENT']) }),
  links: Object.freeze({ synthetic: true, reservation: 'https://example.invalid/synthetic-reservation', waitlist: 'https://example.invalid/synthetic-waitlist', delivery: 'https://example.invalid/synthetic-delivery' }),
  subjects: Object.freeze([{ synthetic: true, subject_id: 'SIM-SUBJECT-001' }]),
  orders: Object.freeze([{ synthetic: true, order_id: 'SIM-ORDER-001', unit_id: 'SIM-UNIT-001', status: 'synthetic_pending', items: Object.freeze([{ synthetic: true, item_id: 'SIM-ITEM-001', label: 'ITEM_SINTETICO' }]) }])
});

module.exports = { SYNTHETIC_FIXTURES };

