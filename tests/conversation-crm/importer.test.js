'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const {
  normalizePhone,
  normalizeEmail,
  analyzeWorkbook,
  anonymizeWorkbook,
  assertOutputOutsideRepository,
  assertPathInsideAllowedRoot
} = require('../../src/conversation-crm/importer');
const { tempDirectory, removeDirectory, syntheticPhone, syntheticEmail } = require('./helpers');

const SECRET = 'synthetic-test-secret-with-more-than-32-characters';

function createWorkbook(filePath) {
  const workbook = XLSX.utils.book_new();
  const phoneA = syntheticPhone(1);
  const phoneB = syntheticPhone(2);
  const emailA = syntheticEmail(1);
  const emailB = syntheticEmail(2);
  const sheets = {
    Salao: [
      ['Nome', 'Sobrenome', 'Data de aniversário', 'Gênero', 'Telefone', 'E-mail', 'Frequencia', 'Canal'],
      [null, null, null, null, phoneA, emailA, 2, 'Salão'],
      [null, null, null, null, phoneA, emailA, 1, 'Salão'],
      [null, null, null, null, '00', 'RAW-SENSITIVE-MARKER', 1, 'Salão']
    ],
    APP: [
      ['Nome', 'Telefone', 'Email', 'Aniversário', 'Pedidos', 'Canal'],
      [null, phoneA, emailB, null, 3, 'APP']
    ],
    IFOOD: [
      ['Nome', 'Sobrenome', 'Telefone', 'Email', 'Frequencia', 'Canal'],
      [null, null, phoneB, emailB, 1, 'IFOOD']
    ],
    'Todos Unificados': [
      ['Nome', 'Canal', 'Telefone', 'Email', 'Frequencia'],
      [null, 'Salão', phoneA, emailA, 2],
      [null, 'Salão', phoneA, emailA, 1],
      [null, 'Salão', '00', 'RAW-SENSITIVE-MARKER', 1],
      [null, 'APP', phoneA, emailB, 3],
      [null, 'IFOOD', phoneB, emailB, 1]
    ]
  };
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  XLSX.writeFile(workbook, filePath);
  return { phoneA, phoneB, emailA, emailB };
}

test('normaliza telefone brasileiro sintético', () => {
  const result = normalizePhone(`+55 ${syntheticPhone(3)}`);
  assert.equal(result.valid, true);
  assert.equal(result.value, syntheticPhone(3));
});

test('rejeita telefone inválido sem devolver o valor', () => {
  const result = normalizePhone('00');
  assert.equal(result.valid, false);
  assert.equal(result.value, null);
});

test('normaliza e-mail sintético reservado', () => {
  const result = normalizeEmail(` ${syntheticEmail(4).toUpperCase()} `);
  assert.equal(result.valid, true);
  assert.equal(result.value, syntheticEmail(4));
});

test('analisa todas as abas sem linhas de cabeçalho', (t) => {
  const directory = tempDirectory();
  t.after(() => removeDirectory(directory));
  const filePath = path.join(directory, 'synthetic.xlsx');
  createWorkbook(filePath);
  const result = analyzeWorkbook(filePath);
  assert.equal(result.validation.compatible, true);
  assert.deepEqual(Object.keys(result.sheets), ['Salao', 'APP', 'IFOOD', 'Todos Unificados']);
  assert.equal(result.sheets.Salao.rows, 3);
  assert.equal(result.sheets['Todos Unificados'].rows, 5);
});

test('anonimização não devolve valores sensíveis de entrada', (t) => {
  const directory = tempDirectory();
  t.after(() => removeDirectory(directory));
  const filePath = path.join(directory, 'synthetic.xlsx');
  const markers = createWorkbook(filePath);
  const result = anonymizeWorkbook(filePath, { secret: SECRET });
  const serialized = JSON.stringify(result).toLowerCase();
  for (const marker of Object.values(markers)) assert.equal(serialized.includes(marker.toLowerCase()), false);
});

test('registro sem telefone e e-mail válidos vai para quarentena sanitizada', (t) => {
  const directory = tempDirectory();
  t.after(() => removeDirectory(directory));
  const filePath = path.join(directory, 'synthetic.xlsx');
  createWorkbook(filePath);
  const result = anonymizeWorkbook(filePath, { secret: SECRET });
  assert.equal(result.quarantine.length, 1);
  assert.deepEqual(result.quarantine[0].removed_fields, ['nome', 'sobrenome', 'telefone', 'email', 'aniversario', 'genero']);
  assert.equal(JSON.stringify(result.quarantine[0]).includes('RAW-SENSITIVE-MARKER'), false);
});

test('duplicidade exata vira candidato sem fusão de registros', (t) => {
  const directory = tempDirectory();
  t.after(() => removeDirectory(directory));
  const filePath = path.join(directory, 'synthetic.xlsx');
  createWorkbook(filePath);
  const result = anonymizeWorkbook(filePath, { secret: SECRET });
  assert.equal(result.records.length, 4);
  assert.ok(result.duplicate_groups.some((group) => group.classification === 'probable_duplicate'));
});

test('identidade divergente é marcada como conflict_candidate', (t) => {
  const directory = tempDirectory();
  t.after(() => removeDirectory(directory));
  const filePath = path.join(directory, 'synthetic.xlsx');
  createWorkbook(filePath);
  const result = anonymizeWorkbook(filePath, { secret: SECRET });
  assert.ok(result.records.some((record) => record.quality.status === 'conflict_candidate'));
  assert.ok(result.duplicate_groups.some((group) => group.classification === 'conflict_candidate'));
});

test('aba concatenada não é importada novamente', (t) => {
  const directory = tempDirectory();
  t.after(() => removeDirectory(directory));
  const filePath = path.join(directory, 'synthetic.xlsx');
  createWorkbook(filePath);
  const result = anonymizeWorkbook(filePath, { secret: SECRET });
  assert.equal(result.stats.accepted_records + result.stats.quarantined_records, 5);
  assert.equal(result.provenance.excluded_sheet, 'Todos Unificados');
});

test('segredo curto é rejeitado', (t) => {
  const directory = tempDirectory();
  t.after(() => removeDirectory(directory));
  const filePath = path.join(directory, 'synthetic.xlsx');
  createWorkbook(filePath);
  assert.throws(() => anonymizeWorkbook(filePath, { secret: 'short' }), { code: 'ANON_SECRET_INVALIDO' });
});

test('saída dentro do repositório é bloqueada', () => {
  const root = path.resolve(__dirname, '..', '..');
  assert.throws(() => assertOutputOutsideRepository(path.join(root, 'data', 'unsafe.json'), root), { code: 'SAIDA_DENTRO_REPOSITORIO' });
});

test('saída privada só é aceita dentro da raiz configurada', () => {
  const root = path.resolve(__dirname, '..', '..');
  const allowed = path.join(root, 'runtime', 'conversation-crm');
  assert.doesNotThrow(() => assertPathInsideAllowedRoot(path.join(allowed, 'safe.json'), allowed));
  assert.throws(
    () => assertPathInsideAllowedRoot(path.join(root, 'docs', 'unsafe.json'), allowed),
    { code: 'CAMINHO_PRIVADO_NAO_PERMITIDO' }
  );
});

test('nenhum arquivo temporário permanece após o teste', () => {
  const directory = tempDirectory();
  const filePath = path.join(directory, 'synthetic.xlsx');
  createWorkbook(filePath);
  assert.equal(fs.existsSync(filePath), true);
  removeDirectory(directory);
  assert.equal(fs.existsSync(directory), false);
});
