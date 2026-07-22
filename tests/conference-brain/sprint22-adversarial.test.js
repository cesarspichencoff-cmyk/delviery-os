"use strict";
/* ============================================================================
 * Testes adversariais do Sprint 2.2 — reproduzem, um a um, os bloqueadores
 * encontrados pela rechecagem independente
 * (docs/auditoria/CONFERENCE_BRAIN_SPRINT21_RECHECK.md, commit f7529fa,
 * lido via `git show`, não incorporado a este branch).
 *
 * Cada describe corresponde a um bloqueador. Onde possível, o teste foi
 * escrito para falhar contra o código do Sprint 2.1 (antes desta missão) e
 * passar depois da correção — a prova de que o bloqueador foi fechado, não
 * apenas documentado como fechado.
 * ==========================================================================*/
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const PiiGuard = require("../../src/conference-brain/live/pii-guard");
const MappingMode = require("../../src/conference-brain/live/mapping-mode");
const { sanitizeExcerpt } = require("../../src/conference-brain/live/evidence");

/* ---------------------------------------------------------------------------
 * Bloqueador 1 — privacidade do Modo de Mapeamento
 * ------------------------------------------------------------------------- */
describe("bloqueador 1 — privacidade (allowlist, nao blocklist)", () => {
  const casosDeNome = [
    "Joao Silva", "Ana Cristóvão", "MARIA DA SILVA SANTOS", "José D'Ávila",
    "François Müller", "李明" // unicode nao latino tambem nunca pode vazar
  ];
  for (const nome of casosDeNome) {
    test(`nome "${nome}" nunca aparece em texto bruto na assinatura`, () => {
      const html = `<div class="customer-status">${nome}</div>`;
      const sig = MappingMode.captureStructuralSignature(html);
      assert.ok(!JSON.stringify(sig).includes(nome), `"${nome}" vazou na assinatura`);
    });
  }

  test("telefone formatado nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("(11) 91234-5678", "x")));
  });
  test("telefone nao formatado nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("11912345678", "x")));
  });
  test("endereco nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("Rua das Flores, 123", "x")));
  });
  test("observacao do cliente (texto livre) nunca aparece bruta", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("sem cebola por favor, e' alergico", "x")));
  });
  test("codigo de entrega nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("ENT-88291-XZ", "x")));
  });
  test("email nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("cliente@exemplo.com", "x")));
  });
  test("CPF nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("123.456.789-01", "x")));
  });
  test("query string sensivel nunca aparece bruta", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("?token=abc123&session=xyz", "x")));
  });
  test("atributo HTML com valor livre nunca aparece bruto", () => {
    const html = '<div data-customer="Joao Silva 999999999"></div>';
    // flagsPiiLikeAttributes so sinaliza o NOME do atributo, nunca extrai o valor
    const flags = MappingMode.flagsPiiLikeAttributes(html);
    assert.ok(!JSON.stringify(flags).includes("Joao"));
  });
  test("texto de acessibilidade (aria-label) nunca tem o VALOR extraido", () => {
    const html = '<span aria-label="Pedido de Joao Silva, telefone 11999999999"></span>';
    const a11y = MappingMode.candidateA11yAttributes(html);
    assert.ok(!JSON.stringify(a11y).includes("Joao"));
    assert.deepEqual(a11y.aria_attributes, ["aria-label"]); // so o NOME do atributo
  });
  test("erro contendo PII e' sanitizado pela camada de evidencia", () => {
    const msg = sanitizeExcerpt("falha ao processar pedido de Maria Oliveira, tel (21) 98888-7777");
    assert.ok(!msg.includes("Maria Oliveira"));
    assert.ok(!msg.includes("98888-7777"));
  });
  test("objetos aninhados sao sanitizados recursivamente", () => {
    const out = PiiGuard.sanitizeDeep({ pedido: { cliente: { nome: "Joao Silva", nota: "sem cebola" } } });
    assert.ok(!JSON.stringify(out).includes("Joao Silva"));
    assert.ok(!JSON.stringify(out).includes("sem cebola"));
  });
  test("arrays sao sanitizados elemento a elemento", () => {
    const out = PiiGuard.sanitizeDeep(["Joao Silva", "Pronto", "Maria Santos"]);
    assert.equal(out[1], "Pronto"); // vocabulario conhecido preservado
    assert.ok(PiiGuard.isRedactedMarker(out[0]));
    assert.ok(PiiGuard.isRedactedMarker(out[2]));
  });
  test("unicode e acentos sao tratados como qualquer outro texto (nunca bypass)", () => {
    const out = PiiGuard.sanitizeText("José D'Ávila Ançã", "x");
    assert.ok(PiiGuard.isRedactedMarker(out));
  });
  test("vocabulario funcional conhecido continua passando literal (nao superssanitiza)", () => {
    for (const t of ["Pronto", "Em preparo", "CONCLUDED", "CANCELLED", "Avisar Pedido Pronto"]) {
      assert.equal(PiiGuard.sanitizeText(t, "x"), t, `"${t}" deveria passar como vocabulario conhecido`);
    }
  });
  test("assinatura estrutural do HTML real do Sprint 1 continua sem PII e sem regressao", () => {
    const path = require("path");
    const fs = require("fs");
    const RAW = path.resolve(__dirname, "../../../delviery-os/data/raw/incoming");
    const f = path.join(RAW, "ifood_2026-07-01/relatorio_pedidos_01-07.html");
    if (!fs.existsSync(f)) return;
    const html = fs.readFileSync(f, "utf8");
    const sig = MappingMode.captureStructuralSignature(html);
    assert.equal(sig.pii_like_attributes_flagged.length, 0);
    // os 3 status conhecidos do relatorio real continuam literais (vocabulario seguro)
    assert.ok(sig.candidate_status_texts.includes("CONCLUDED"));
  });
});
