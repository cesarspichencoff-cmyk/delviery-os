import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAIXA_PULSE_RECIPIENT,
  CAIXA_PULSE_SENDER,
  looksLikeCaixaPulseSubject,
  matchesCaixaPulseMail,
  parseCaixaPulseMessage,
  parseCaixaPulseSubject,
} from "./caixa-pulse-intake.js";

const ZERO_BODY = `Tatá Sushi

Caixa Pulse

Fechamento do caixa — 23/09/2026 | Noite

Ocorrências em aberto / registradas

Total: 0 |
Em aberto: 0

Nenhuma ocorrência registrada para este turno.

Planilha completa: https://example.invalid
`;

const MULTI_BODY = `Tatá Sushi

Ocorrências em aberto / registradas

Total: 4 |
Em aberto: 2

Reclamação de cliente

Operador: Juliana | Status: Necessário Revisão

Pedido / Mesa / Referência: 9204

O que aconteceu: Cliente alega não ter recebido Carpaccio/ Carlos quem fechou a sacola e ele disse que foi.

Ação tomada: Foi feito o reenvio - necessário olhar nas câmeras por favor

Problema no Delivery

Operador: Amanda | Status: Concluído

Pedido / Mesa / Referência: 318

O que aconteceu: Cancelado pelo cliente
Motivo: O pedido está atrasado.

Ação tomada: cancelamento

Falha no iFood

Operador: Ana Clara | Status: Concluído

Pedido / Mesa / Referência: 100

O que aconteceu: Plataforma indisponível.

Ação tomada: Pausa operacional

Problema no salão

Operador: Luis | Status: Concluído

Pedido / Mesa / Referência: Mesa 10

O que aconteceu: Item não chegou à mesa.

Ação tomada: Correção no atendimento

Planilha completa: https://example.invalid
`;

test("subject yields business date and shift", () => {
  assert.deepEqual(
    parseCaixaPulseSubject("Caixa Pulse | Fechamento | 25/09/2026 | Manhã"),
    { business_date: "2026-09-25", shift: "MANHA" },
  );
  assert.deepEqual(
    parseCaixaPulseSubject("Caixa Pulse | Fechamento | 24/09/2026 | Noite"),
    { business_date: "2026-09-24", shift: "NOITE" },
  );
  assert.equal(looksLikeCaixaPulseSubject("qualquer assunto"), false);
});

test("zero occurrence requires explicit source statement", () => {
  const record = parseCaixaPulseMessage({
    uid: 100,
    uidValidity: "1641920722",
    subject: "Caixa Pulse | Fechamento | 23/09/2026 | Noite",
    sentAt: "2026-09-24T02:41:09Z",
    text: ZERO_BODY,
    readOnlyVerified: true,
  });

  assert.equal(record.reported_total, 0);
  assert.equal(record.parsed_total, 0);
  assert.equal(record.explicit_none, true);
  assert.equal(record.source_health, "HEALTHY");
  assert.deepEqual(record.occurrences, []);
});

test("generic parser preserves all observed source domains", () => {
  const record = parseCaixaPulseMessage({
    uid: 101,
    uidValidity: "1641920722",
    subject: "Caixa Pulse | Fechamento | 24/09/2026 | Noite",
    sentAt: "2026-09-25T03:01:13Z",
    text: MULTI_BODY,
    readOnlyVerified: true,
  });

  assert.equal(record.reported_total, 4);
  assert.equal(record.parsed_total, 4);
  assert.equal(record.source_health, "HEALTHY");
  assert.deepEqual(
    record.occurrences.map((item) => item.domain),
    ["CUSTOMER_VOICE", "DELIVERY", "PLATFORM", "SALON"],
  );
  assert.match(record.occurrences[1].happened_text, /Motivo:/);
});

test("sibling occurrences in the same shift remain separate records", () => {
  const record = parseCaixaPulseMessage({
    uid: 102,
    uidValidity: "1641920722",
    subject: "Caixa Pulse | Fechamento | 24/09/2026 | Noite",
    sentAt: "2026-09-25T03:01:13Z",
    text: MULTI_BODY,
    readOnlyVerified: true,
  });

  assert.equal(record.occurrences.length, 4);
  assert.deepEqual(
    record.occurrences.map((item) => item.occurrence_index),
    [0, 1, 2, 3],
  );
});

test("reported total mismatch degrades source health", () => {
  const record = parseCaixaPulseMessage({
    uid: 103,
    uidValidity: "1641920722",
    subject: "Caixa Pulse | Fechamento | 24/09/2026 | Noite",
    sentAt: "2026-09-25T03:01:13Z",
    text: MULTI_BODY.replace("Total: 4", "Total: 5"),
    readOnlyVerified: true,
  });

  assert.equal(record.source_health, "DEGRADED");
  assert.ok(record.quality_flags.includes("REPORTED_TOTAL_MISMATCH"));
});

test("read-only verification is part of source health", () => {
  const record = parseCaixaPulseMessage({
    uid: 104,
    uidValidity: "1641920722",
    subject: "Caixa Pulse | Fechamento | 23/09/2026 | Noite",
    sentAt: "2026-09-24T02:41:09Z",
    text: ZERO_BODY,
    readOnlyVerified: false,
  });

  assert.equal(record.source_health, "DEGRADED");
  assert.ok(record.quality_flags.includes("READONLY_NOT_VERIFIED"));
});

test("one source occurrence may contain multiple operational-event clues", () => {
  const body = `Ocorrências em aberto / registradas

Total: 1 |
Em aberto: 0

Reclamação de cliente

Operador: Ana Clara | Status: Concluído

Pedido / Mesa / Referência: 4030

O que aconteceu: 4030 - Pedido foi sem a coca cola.
5566 - Pedido chegou revirado na casa de cliente.

Ação tomada: 4030 - Reenvio.
5566 - Reembolso.

Planilha completa: https://example.invalid`;

  const record = parseCaixaPulseMessage({
    uid: 105,
    uidValidity: "1641920722",
    subject: "Caixa Pulse | Fechamento | 24/09/2026 | Manhã",
    sentAt: "2026-09-24T19:01:18Z",
    text: body,
    readOnlyVerified: true,
  });

  assert.equal(record.reported_total, 1);
  assert.equal(record.occurrences.length, 1);
  assert.match(record.occurrences[0].happened_text, /5566/);
});

test("mail route matches the observed Cesar Gmail -> Atendimento path", () => {
  const observed = {
    subject: "Caixa Pulse | Fechamento | 25/09/2026 | Manhã",
    from: '"Tatá Sushi | Caixa Pulse" <cesar.spichencoff@gmail.com>',
    to: "atendimento@tatasushi.com.br, financeiro@tatasushi.com.br",
  };

  assert.equal(CAIXA_PULSE_SENDER, "cesar.spichencoff@gmail.com");
  assert.equal(CAIXA_PULSE_RECIPIENT, "atendimento@tatasushi.com.br");
  assert.equal(matchesCaixaPulseMail(observed), true);
  assert.equal(
    matchesCaixaPulseMail({ ...observed, from: "outro@example.com" }),
    false,
  );
  assert.equal(
    matchesCaixaPulseMail({ ...observed, to: "financeiro@tatasushi.com.br" }),
    false,
  );
  assert.equal(
    matchesCaixaPulseMail({ ...observed, subject: "Outro fechamento" }),
    false,
  );
});

test("production Caixa Pulse ingestion is pinned to Atendimento INBOX", () => {
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
  const start = source.indexOf("async function runCaixaPulseIngestion");
  const end = source.indexOf("async function runIfoodReviewIngestion", start);
  const intake = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(intake, /const inbox = "INBOX"/);
  assert.match(intake, /EXAMINE \$\{quote\(inbox\)\}/);
  assert.match(intake, /FROM "cesar\.spichencoff@gmail\.com"/);
  assert.match(intake, /TO "atendimento@tatasushi\.com\.br"/);
  assert.match(intake, /HEADER\.FIELDS \(SUBJECT DATE FROM TO\)/);
  assert.match(intake, /matchesCaixaPulseMail\(\{/);
  assert.doesNotMatch(intake, /findSentFolder\(list\.raw\)/);
});

test("real text/plain MIME layout from Caixa Pulse is parsed", () => {
  const body = `Tatá Sushi | Caixa Pulse
Fechamento do caixa — 25/09/2026 | Manhã

RESUMO DO FECHAMENTO
Operador: —
Turno: Manhã

OCORRÊNCIAS DO TURNO
Total: 2
Em aberto: 0
Tipo: Reclamação de cliente
Operador: Ana Clara | Status: Concluído
Pedido / Mesa / Referência: 3401
O que aconteceu: Cozinha assinalou na caixa como guioza e foi um tempura de milho
Ação tomada: Feito reembolso

Tipo: Reclamação de cliente
Operador: Ana Clara | Status: Concluído
Pedido / Mesa / Referência: 6406
O que aconteceu: Pedido foi sem o mochi.
Ação tomada: Foi feito reembolso.
César vai verificar na câmera.
Planilha:
https://example.invalid`;

  const record = parseCaixaPulseMessage({
    uid: 106,
    uidValidity: "1641920722",
    subject: "Caixa Pulse | Fechamento | 25/09/2026 | Manhã",
    sentAt: "2026-09-25T19:01:12Z",
    text: body,
    readOnlyVerified: true,
  });

  assert.equal(record.reported_total, 2);
  assert.equal(record.parsed_total, 2);
  assert.equal(record.open_total, 0);
  assert.equal(record.source_health, "HEALTHY");
  assert.deepEqual(
    record.occurrences.map((item) => item.domain),
    ["CUSTOMER_VOICE", "CUSTOMER_VOICE"],
  );
  assert.equal(record.occurrences[0].reference, "3401");
  assert.match(record.occurrences[1].action_text, /câmera/);
});
