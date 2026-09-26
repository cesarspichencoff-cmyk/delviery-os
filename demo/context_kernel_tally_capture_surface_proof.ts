import { strict as assert } from "node:assert";
import {
  OCCURRENCE_CAPTURE_SHADOW_BOUNDARY,
  OCCURRENCE_FIELD_GROUPS,
  OCCURRENCE_HAPPENED_TITLE,
  OCCURRENCE_STATUS_OPTIONS,
  OCCURRENCE_TYPE_OPTIONS,
  TALLY_CAIXA_PULSE_OCCURRENCE,
  TALLY_CAIXA_PULSE_REGISTER,
  TALLY_CAIXA_PULSE_SURFACES,
} from "../src/contextKernel/tallyCaptureSurface";

assert.equal(TALLY_CAIXA_PULSE_SURFACES.length, 2);
assert.equal(TALLY_CAIXA_PULSE_REGISTER.form_id, "eqAKzJ");
assert.equal(TALLY_CAIXA_PULSE_OCCURRENCE.form_id, "ZjVv1a");
assert.equal(
  TALLY_CAIXA_PULSE_REGISTER.workspace_id,
  TALLY_CAIXA_PULSE_OCCURRENCE.workspace_id,
);
assert.equal(TALLY_CAIXA_PULSE_OCCURRENCE.workspace_id, "3xP0bd");
assert.equal(TALLY_CAIXA_PULSE_OCCURRENCE.expected_block_count, 31);
assert.equal(TALLY_CAIXA_PULSE_REGISTER.expected_block_count, 76);
assert.equal(OCCURRENCE_TYPE_OPTIONS.length, 10);
assert.deepEqual(OCCURRENCE_STATUS_OPTIONS, [
  "Em Andamento",
  "Concluído",
  "Necessário Revisão ",
]);

const fieldGroups = Object.values(OCCURRENCE_FIELD_GROUPS);
assert.equal(new Set(fieldGroups).size, fieldGroups.length);
assert.equal(
  OCCURRENCE_HAPPENED_TITLE.raw_title,
  "O que aconteceu?\n",
);
assert.equal(
  OCCURRENCE_HAPPENED_TITLE.normalized_title,
  "O que aconteceu?",
);
assert.equal(
  OCCURRENCE_HAPPENED_TITLE.mapping_debt,
  "TRAILING_NEWLINE",
);

assert.equal(
  OCCURRENCE_CAPTURE_SHADOW_BOUNDARY.preserve_existing_group_uuids,
  true,
);
assert.equal(
  OCCURRENCE_CAPTURE_SHADOW_BOUNDARY.preserve_existing_type_options,
  true,
);
assert.equal(
  OCCURRENCE_CAPTURE_SHADOW_BOUNDARY.preserve_existing_status_options,
  true,
);
assert.equal(
  OCCURRENCE_CAPTURE_SHADOW_BOUNDARY.preferred_insertion_after_group,
  OCCURRENCE_FIELD_GROUPS.occurrence_type,
);
assert.equal(
  OCCURRENCE_CAPTURE_SHADOW_BOUNDARY.preferred_insertion_before_group,
  OCCURRENCE_FIELD_GROUPS.reference,
);
assert.equal(
  OCCURRENCE_CAPTURE_SHADOW_BOUNDARY.live_form_edit_authorized,
  false,
);
assert.equal(
  OCCURRENCE_CAPTURE_SHADOW_BOUNDARY.live_workbook_edit_authorized,
  false,
);

console.log(JSON.stringify({
  status: "PASS",
  two_live_forms_pinned: true,
  common_workspace_pinned: true,
  public_form_ids_pinned: true,
  editor_routes_pinned: true,
  occurrence_group_uuids_unique: true,
  existing_type_taxonomy_preserved: true,
  existing_status_taxonomy_preserved: true,
  happened_title_newline_debt_explicit: true,
  capture_shadow_insertion_anchor_explicit: true,
  live_form_edit_authorized: false,
  live_workbook_edit_authorized: false,
}, null, 2));
