/**
 * A minuta do termo de localizacao (docs/entregas/pilot/termo-localizacao-minuta.json)
 * NUNCA e publicavel como esta: os campos legais sao do Cesar e a aprovacao tambem.
 * O teste trava (1) que a minuta tem exatamente os pendentes do checklist A,
 * (2) que nada alem deles impede a publicacao (a minuta e estruturalmente valida),
 * e (3) que preencher sem aprovar nao publica. Valores de preenchimento so existem
 * em memoria aqui; nada e gravado.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPublishable, pendingFields, PENDING, type LocationTerm } from "./term";

let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log("PASS " + nome); };
const minuta = JSON.parse(readFileSync(join(__dirname, "../../../docs/entregas/pilot/termo-localizacao-minuta.json"), "utf8")) as LocationTerm;

ok("TM1 a minuta nao e publicavel e nao esta aprovada", () => {
  assert.equal(minuta.approved, false);
  assert.equal(isPublishable(minuta), false);
});

ok("TM2 os pendentes sao exatamente os do checklist A (nenhum campo legal inventado)", () => {
  const campos = pendingFields(minuta).map((p) => p.field).sort();
  assert.deepEqual(campos, [
    "approved", "body", "controller.cnpj", "controller.contact_channel", "controller.contact_owner",
    "controller.legal_name", "effective_date", "retention.detailed_point_days", "retention.operational_event_days", "version",
  ]);
  for (const v of [minuta.controller.legal_name, minuta.controller.cnpj, minuta.controller.contact_channel, minuta.controller.contact_owner, minuta.effective_date])
    assert.equal(v, PENDING);
  assert.equal(minuta.retention.operational_event_days, 0);
  assert.equal(minuta.retention.detailed_point_days, 0);
});

ok("TM3 o texto diz so o que o codigo faz: so durante a viagem, para no fim, nada fora dela", () => {
  assert.match(minuta.body, /só é coletada durante uma viagem/);
  assert.match(minuta.body, /para quando a viagem termina/);
  assert.match(minuta.body, /Fora de uma viagem, nada é coletado/);
  assert.doesNotMatch(minuta.body, /sempre|24 horas|em segundo plano o tempo todo|venda|terceiros/i);
});

const preenchida = (aprovada: boolean): LocationTerm => ({
  ...minuta,
  version: "0.0.0-teste",
  effective_date: "teste",
  body: minuta.body.split(PENDING).join("teste"),
  controller: { legal_name: "teste", cnpj: "teste", contact_channel: "teste", contact_owner: "teste" },
  retention: { ...minuta.retention, operational_event_days: 1, detailed_point_days: 1 },
  approved: aprovada,
});

ok("TM4 preenchida e aprovada, a estrutura publica (a minuta nao tem outro defeito escondido)", () => {
  assert.deepEqual(pendingFields(preenchida(true)), []);
  assert.equal(isPublishable(preenchida(true)), true);
});

ok("TM5 preenchida SEM aprovacao continua nao publicavel", () => {
  assert.equal(isPublishable(preenchida(false)), false);
  assert.deepEqual(pendingFields(preenchida(false)).map((p) => p.field), ["approved"]);
});

console.log(`TERMO_MINUTA_PASS ${n}/5 NAO_PUBLICAVEL`);
