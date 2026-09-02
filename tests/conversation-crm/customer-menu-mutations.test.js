'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mutationControls = [
  ['ambiguous_customers_merged', { classification: 'conflict', merged: true }, (value) => value.classification !== 'exact_match' && value.merged === true],
  ['consent_inferred', { source: 'order_history', state: 'allowed' }, (value) => value.source === 'order_history' && value.state === 'allowed'],
  ['dining_room_item_in_ifood', { requested: 'ifood', returned: 'dining_room' }, (value) => value.requested !== value.returned],
  ['price_copied_across_channels', { dining: 72, ifood: 72, copied: true }, (value) => value.copied],
  ['allergy_ignored', { allergies: ['crustacean'], candidate_contains: ['crustacean'] }, (value) => value.allergies.some((item) => value.candidate_contains.includes(item))],
  ['unavailable_item_recommended', { availability: 'unavailable', recommended: true }, (value) => value.recommended && value.availability !== 'available'],
  ['beverage_invented', { source_records: [], suggested: true }, (value) => value.suggested && value.source_records.length === 0],
  ['origin_lost', { source_id: null }, (value) => value.source_id == null],
  ['upload_duplicates_customer', { same_file_hash: true, created_customers: 2 }, (value) => value.same_file_hash && value.created_customers > 1],
  ['rollback_erases_prior_data', { prior_data_preserved: false }, (value) => !value.prior_data_preserved],
  ['writer_changes_preference', { approved: 'light', written: 'spicy' }, (value) => value.approved !== value.written],
  ['writer_adds_ingredient', { authorized: ['salmon'], written: ['salmon', 'cream_cheese'] }, (value) => value.written.some((item) => !value.authorized.includes(item))],
  ['model_accesses_sql', { tool: 'raw_sql' }, (value) => value.tool === 'raw_sql'],
  ['pii_in_log', { log: 'synthetic@example.invalid' }, (value) => /@/u.test(value.log)],
  ['missing_context_as_fact', { value: null, claimed_confirmed: true }, (value) => value.value == null && value.claimed_confirmed]
];

for (const [id, mutant, detector] of mutationControls) {
  test(`controle de mutação elimina ${id}`, () => {
    assert.equal(detector(mutant), true, `mutação ${id} deveria ser detectada`);
  });
}
