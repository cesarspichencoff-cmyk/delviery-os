import { strict as assert } from "node:assert";
import {
  adaptCaixaPulseOccurrences,
  type CaixaPulseOccurrenceRow,
} from "../src/contextKernel/caixaPulseEpisodeAdapter";

function row(
  index: number,
  happened: string,
  action: string,
  status = "Concluído",
): CaixaPulseOccurrenceRow {
  return {
    business_date: "2026-09-" + String(index + 4).padStart(2, "0"),
    shift: "NOITE",
    mailbox_key: "1641920718:" + String(7000 + index),
    occurrence_index: 0,
    domain: "DELIVERY",
    category: "Problema no Delivery",
    status,
    happened_text: happened,
    action_text: action,
  };
}

const adapted = adaptCaixaPulseOccurrences([
  row(0, "Pedido foi sem o mochi.", "Foi feito reembolso."),
  row(1, "Foi tempura no lugar do ebi spicy.", "Reenvio."),
  row(2, "Carlos trocou as sacolas.", "Reenvio."),
  row(3, "Yakisoba vazou - cozinha.", "Reembolso."),
  row(4, "Cancelado pelo cliente. Motivo: o pedido está atrasado.", "Cancelamento."),
  row(5, "O sistema do iFood bugou e cliente alegou que não foi o hot.", "Reembolso."),
  row(
    6,
    "Invés do salmão foi camarão e cliente era alérgica a camarão.",
    "Reembolso e olhar nas câmeras.",
    "Necessário Revisão",
  ),
]);

assert.equal(adapted.evidence.length, 7);
assert.equal(adapted.classified_count, 5);
assert.equal(adapted.unclassified_count, 2);
assert.equal(adapted.ambiguous_multi_signal_count, 2);
assert.equal(adapted.mechanism_basis, "RULE_INFERRED");
assert.equal(adapted.causal_status, "UNPROVEN");
assert.equal(adapted.attention_authority, "NONE");
assert.equal(adapted.external_effect_authorized, false);

assert.equal(adapted.evidence[0].mechanism_key, "OMISSION");
assert.deepEqual(adapted.evidence[0].action_kinds, ["REFUND"]);
assert.equal(adapted.evidence[1].mechanism_key, "WRONG_ITEM");
assert.equal(adapted.evidence[2].mechanism_key, "BAG_SWAP_CUSTODY");
assert.equal(adapted.evidence[3].mechanism_key, "PACKAGING_LEAK");
assert.equal(adapted.evidence[4].mechanism_key, "DELAY_LOGISTICS");
assert.equal(adapted.evidence[5].mechanism_key, "UNCLASSIFIED");
assert.equal(adapted.evidence[6].mechanism_key, "UNCLASSIFIED");
assert.deepEqual(
  adapted.evidence[6].action_kinds,
  ["REFUND", "CAMERA_REVIEW"],
);
assert.equal(
  adapted.evidence[6].resolution_marker,
  "SOURCE_MARKED_REVIEW_NEEDED",
);
assert.equal(adapted.evidence[6].outcome_observed, false);

const noAction = adaptCaixaPulseOccurrences([
  row(8, "Pedido foi sem o kit.", "Discordar"),
]);
assert.equal(noAction.evidence[0].mechanism_key, "OMISSION");
assert.deepEqual(noAction.evidence[0].action_kinds, []);

assert.throws(
  () =>
    adaptCaixaPulseOccurrences([
      row(9, "Pedido foi sem o kit.", "Reenvio"),
      row(9, "Pedido foi sem o kit.", "Reenvio"),
    ]),
  /caixa_pulse_duplicate_episode/,
);

console.log(JSON.stringify({
  status: "PASS",
  high_precision_single_family_only: true,
  multi_signal_evidence_stays_unclassified: true,
  source_status_is_not_outcome: true,
  action_text_is_rule_inferred_only: true,
  causal_status: adapted.causal_status,
  attention_authority: adapted.attention_authority,
  external_effect_authorized: adapted.external_effect_authorized,
}, null, 2));
