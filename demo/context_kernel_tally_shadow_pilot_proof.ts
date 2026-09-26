import assert from "node:assert/strict";
import {
  TALLY_SHADOW_HEADERS,
  TALLY_SHADOW_PILOT,
  proveTallyShadowSerialization,
} from "../src/contextKernel/tallyShadowPilot";

const rows = [
  [
    "4ayaqYo",
    "EkoGWA4",
    "2026-09-26 06:53:49",
    "VERTICE_SHADOW_TEST_ITEM_FALTANDO",
    "2026-09-26",
    "Manhã",
    "Problema no Delivery",
    "Item faltando",
    "Sim",
    "Não",
    "Não consegui confirmar",
    "Não se aplica",
    null,
    null,
    null,
    null,
    "VERTICE_TEST_REF_ITEM_FALTANDO",
    "VERTICE_SHADOW_TEST: serializacao item faltando",
    "TESTE CONTROLADO - nenhuma acao operacional",
    "Em Andamento",
  ],
  [
    "yXRXRqW",
    "EkoGWA4",
    "2026-09-26 07:02:28",
    "VERTICE_SHADOW_TEST_ITEM_ERRADO",
    "2026-09-26",
    "Noite",
    "Problema no Delivery",
    "Item errado",
    null,
    null,
    null,
    null,
    "Sim",
    "Não",
    "Não consegui confirmar",
    "Não se aplica",
    "VERTICE_TEST_REF_ITEM_ERRADO",
    "VERTICE_SHADOW_TEST: serializacao item errado",
    "TESTE CONTROLADO - nenhuma acao operacional",
    "Em Andamento",
  ],
  [
    "QoWoajl",
    "EkoGWA4",
    "2026-09-26 07:08:22",
    "VERTICE_SHADOW_TEST_OUTRO",
    "2026-09-26",
    "Manhã",
    "Problema no Delivery",
    "Outro",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "VERTICE_TEST_REF_OUTRO",
    "VERTICE_SHADOW_TEST: serializacao outro",
    "TESTE CONTROLADO - nenhuma acao operacional",
    "Em Andamento",
  ],
] as const;

const proof = proveTallyShadowSerialization(
  TALLY_SHADOW_HEADERS,
  rows,
);

assert.equal(proof.header_sequence_exact, true);
assert.equal(proof.item_missing_route_exact, true);
assert.equal(proof.wrong_item_route_exact, true);
assert.equal(proof.other_route_exact, true);
assert.equal(proof.conditional_exclusivity_proven, true);
assert.equal(proof.legacy_happened_header_preserved, true);
assert.equal(proof.test_rows_found, 3);
assert.equal(proof.live_form_modified, false);
assert.equal(proof.live_workbook_modified, false);
assert.equal(proof.live_cutover_authorized, false);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      source: "OBSERVED_SHADOW_GOOGLE_SHEETS_ROWS",
      shadow_form_id: TALLY_SHADOW_PILOT.shadow_form_id,
      isolated_sheet_id: TALLY_SHADOW_PILOT.isolated_sheet_id,
      proof,
    },
    null,
    2,
  ),
);
