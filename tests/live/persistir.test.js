/* Testes 25, 30 e 31 da Fase 2: linha JSONL corrompida tolerada e contada ·
 * persistência em diretório temporário do SO · rejeição de path improvisado
 * dentro de repositório (F3-01). Nenhum dado real; tudo em temp. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { criarArmazenamento, validarRuntimeRoot } = require("../../src/live/persistir");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "deliveryos-live-teste-"));
const limpar = (dir) => fs.rmSync(dir, { recursive: true, force: true });

test("30. persistência em diretório temporário: escreve, lê de volta, append-only", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    arm.anexarEvento({ event_id: "e1", event_type: "comanda_impressa" });
    arm.anexarEvento({ event_id: "e2", event_type: "status_ifood" });
    const { registros, linhas_invalidas } = arm.lerEventos();
    assert.equal(registros.length, 2);
    assert.equal(registros[0].event_id, "e1");
    assert.equal(registros[1].event_id, "e2");
    assert.equal(linhas_invalidas.length, 0);
    // arquivo usa o sufixo canônico protegido (*.live.jsonl)
    assert.ok(arm.caminhoEventos.endsWith("eventos.live.jsonl"));
  } finally { limpar(dir); }
});

test("25. linha corrompida no meio: contada, registrada, nunca derruba a leitura", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    arm.anexarEvento({ event_id: "e1" });
    fs.appendFileSync(arm.caminhoEventos, "{isto nao e json}\n", "utf8");
    arm.anexarEvento({ event_id: "e2" });
    const { registros, linhas_invalidas } = arm.lerEventos();
    assert.equal(registros.length, 2); // os válidos sobrevivem
    assert.equal(linhas_invalidas.length, 1);
    assert.equal(linhas_invalidas[0].motivo, "linha_invalida");
    assert.equal(linhas_invalidas[0].numero_linha, 2);
    // o conteúdo da linha corrompida NÃO é ecoado no registro
    assert.ok(!JSON.stringify(linhas_invalidas).includes("isto nao e json"));
  } finally { limpar(dir); }
});

test("25b. última linha truncada (queda no meio da escrita): descartada com registro", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    arm.anexarEvento({ event_id: "e1" });
    fs.appendFileSync(arm.caminhoEventos, '{"event_id":"e2","trunc', "utf8"); // sem \n
    const { registros, linhas_invalidas } = arm.lerEventos();
    assert.equal(registros.length, 1);
    assert.equal(linhas_invalidas.length, 1);
    assert.equal(linhas_invalidas[0].motivo, "linha_final_truncada");
  } finally { limpar(dir); }
});

test("31. path improvisado dentro de repositório é rejeitado ANTES de escrever (F3-01)", () => {
  const dir = tempDir();
  try {
    // simula um repositório Git em temp
    fs.mkdirSync(path.join(dir, ".git"));
    const casosProibidos = [
      path.join(dir, "data", "live_backup"),
      path.join(dir, "tools", "runtime"),
      path.join(dir, "docs", "live"),
      path.join(dir, "qualquer", "pasta")
    ];
    for (const caso of casosProibidos) {
      assert.throws(() => criarArmazenamento({ runtimeRoot: caso }),
        /runtime_root_nao_canonico/, `deveria rejeitar: ${caso}`);
      assert.ok(!fs.existsSync(caso), "nada pode ter sido criado no path rejeitado");
    }
    // paths canônicos DENTRO do repo são aceitos (fallback de desenvolvimento)
    for (const ok of [path.join(dir, "data", "live"), path.join(dir, "runtime"),
      path.join(dir, "data", "live", "sim")]) {
      const arm = criarArmazenamento({ runtimeRoot: ok });
      assert.ok(fs.existsSync(arm.raiz));
    }
  } finally { limpar(dir); }
});

test("31b. fora de repositório (temp/LOCALAPPDATA) é aceito; runtimeRoot é obrigatório", () => {
  const dir = tempDir();
  try {
    assert.equal(validarRuntimeRoot(dir), path.resolve(dir));
    assert.throws(() => criarArmazenamento({}), /runtime_root_obrigatorio/);
    assert.throws(() => criarArmazenamento({ runtimeRoot: "" }), /runtime_root_obrigatorio/);
  } finally { limpar(dir); }
});
