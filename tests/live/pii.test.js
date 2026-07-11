/* F2-01 — PII ANINHADA: a proteção é recursiva (objetos, arrays, objetos em
 * arrays), case-insensitive, e NENHUM valor marcador pode existir nos
 * arquivos persistidos (log aceito E quarentena). Dados 100% fictícios. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { criarNucleo } = require("../../src/live/nucleo");
const { criarArmazenamento } = require("../../src/live/persistir");
const { validarEnvelope } = require("../../src/live/contrato");
const { acharCampoProibido, normalizarPorAllowlist } = require("../../src/live/sanitizar");
const { relogioFixo, eventoComanda, eventoStatus, CONFIG_TESTE } = require("./helpers");

const agora = relogioFixo("2026-07-11T19:10:00.000Z");
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "deliveryos-live-pii-"));
const limpar = (dir) => fs.rmSync(dir, { recursive: true, force: true });

function lerTudoDoDisco(arm) {
  let tudo = "";
  for (const caminho of [arm.caminhoEventos, arm.caminhoQuarentena]) {
    if (fs.existsSync(caminho)) tudo += fs.readFileSync(caminho, "utf8");
  }
  return tudo;
}

test("F2-01: payload.entrega.endereco (objeto aninhado) é detectado e rejeitado", () => {
  const ev = eventoComanda();
  ev.payload.entrega = { endereco: "marcador-endereco-1111", cep_zona: "x" };
  const res = validarEnvelope(ev);
  assert.equal(res.ok, false);
  assert.equal(res.motivo, "dado_pessoal_nao_permitido");
  assert.equal(res.campo, "payload.entrega.endereco"); // caminho completo, sem valor
  assert.ok(!JSON.stringify(res).includes("marcador-endereco-1111"));
});

test("F2-01: payload.itens[].meta.telefone e .email (objeto dentro de array) são detectados", () => {
  const ev = eventoComanda();
  ev.payload.itens[0].meta = { telefone: "marcador-fone-2222" };
  const res = validarEnvelope(ev);
  assert.equal(res.ok, false);
  assert.equal(res.campo, "payload.itens[0].meta.telefone");

  const ev2 = eventoComanda();
  ev2.payload.itens[1] = { nome: "Item X", quantidade: 1, observacao: null, meta: { email: "m@x" } };
  const res2 = validarEnvelope(ev2);
  assert.equal(res2.ok, false);
  assert.equal(res2.campo, "payload.itens[1].meta.email");
});

test("F2-01: case-insensitive e demais campos (cpf, documento, senha, token, cookie)", () => {
  for (const campo of ["TELEFONE", "Endereco", "CPF", "Documento", "SENHA", "Token", "Cookie", "E_MAIL"]) {
    const ev = eventoComanda();
    ev.payload.profundo = { nivel2: { [campo]: "marcador-caso-3333" } };
    const res = validarEnvelope(ev);
    assert.equal(res.ok, false, `deveria rejeitar campo ${campo}`);
    assert.equal(res.motivo, "dado_pessoal_nao_permitido");
  }
});

test("F2-01: identificadores operacionais NÃO são PII", () => {
  assert.equal(acharCampoProibido({
    ifood_short: "0724", pedido_interno: "0000170512",
    sequencia: "0724", print_job_id: "job-1"
  }, "", 0), null);
});

test("F2-01: profundidade excessiva não passa em silêncio", () => {
  const ev = eventoComanda();
  let cursor = ev.payload;
  for (let i = 0; i < 12; i++) { cursor.filho = {}; cursor = cursor.filho; }
  cursor.telefone = "marcador-fundo-4444"; // além do limite de varredura
  const res = validarEnvelope(ev);
  assert.equal(res.ok, false);
  assert.equal(res.motivo, "estrutura_profunda_demais"); // rejeitado, nunca aceito cego
});

test("F2-01: allowlist descarta campo desconhecido de item — só nomes registrados", () => {
  const ev = eventoComanda();
  ev.payload.itens[0].contato_alternativo = "marcador-allowlist-5555"; // nome não proibido
  const { evento, descartados } = normalizarPorAllowlist(ev);
  assert.ok(descartados.includes("payload.itens[0].contato_alternativo"));
  assert.ok(!JSON.stringify(evento).includes("marcador-allowlist-5555"));
  assert.deepEqual(Object.keys(evento.payload.itens[0]).sort(),
    ["nome", "observacao", "quantidade"]); // shape estrito
});

test("F2-01: NENHUM marcador chega ao disco — nem no log aceito, nem na quarentena", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora, config: CONFIG_TESTE });

    // 1. evento aceito com campo desconhecido (valor marcador) => allowlist poda
    const aceito = eventoComanda();
    aceito.payload.canal_interno = "marcador-disco-A";
    aceito.payload.itens[0].meta_operacional = "marcador-disco-B";
    assert.equal(nucleo.receber(aceito).aceito, true);

    // 2. evento com PII aninhada => quarentena (bruto NÃO preservado)
    const comPii = eventoComanda({ pedido_interno: "0000170601" });
    comPii.payload.entrega = { endereco: "marcador-disco-C" };
    assert.equal(nucleo.receber(comPii).destino, "quarentena");

    // 3. evento malformado (sem schema) com PII aninhada => quarentena redigida
    const malformado = eventoComanda({ pedido_interno: "0000170602" });
    delete malformado.schema_version;
    malformado.payload.itens[0].meta = { telefone: "marcador-disco-D" };
    assert.equal(nucleo.receber(malformado).destino, "quarentena");

    // 4. evento de status segue fluindo (quarentena não interrompe)
    assert.equal(nucleo.receber(eventoStatus()).aceito, true);

    const disco = lerTudoDoDisco(arm);
    for (const marcador of ["marcador-disco-A", "marcador-disco-B", "marcador-disco-C", "marcador-disco-D"]) {
      assert.ok(!disco.includes(marcador), `valor ${marcador} não pode existir em disco`);
    }
    // os NOMES dos campos removidos podem (e devem) estar registrados
    assert.ok(disco.includes("telefone") || disco.includes("endereco"));
  } finally { limpar(dir); }
});
