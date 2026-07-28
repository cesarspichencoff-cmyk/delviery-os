'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createNativeServer } = require('../../tools/conversation-crm/native-server');

test.describe.configure({ mode: 'serial' });

let server;
let base;
let root;

function filesBelow(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(item) : [item];
  });
}

async function open(page) {
  await page.goto(base);
  await expect(page.locator('#global-state')).toContainText('Pronto');
}

async function openMode(page, name) {
  await page.getByRole('button', { name }).click();
}

async function completeRating(page, reviewId, comment = '') {
  await page.locator('#review-select').selectOption(reviewId);
  await page.locator('label:has(input[name="overall"][value="5"])').click();
  for (const key of ['naturalidade', 'acolhimento', 'clareza', 'utilidade', 'tamanho', 'confianca']) {
    await page.locator(`label:has(input[name="criterion-${key}"][value="5"])`).click();
  }
  if (comment) await page.locator('#review-comment').fill(comment);
  await page.getByRole('button', { name: 'Salvar avaliação' }).click();
}

test.beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-browser-homologation-'));
  server = createNativeServer({
    runtimeRoot: path.join(root, 'native'),
    feedbackRoot: path.join(root, 'feedback'),
    chatRuntimeRoot: path.join(root, 'chat'),
    exportRoot: path.join(root, 'exports'),
    now: () => '2026-07-28T15:00:00.000Z'
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  server.close();
  await once(server, 'close');
  fs.rmSync(root, { recursive: true, force: true });
});

test('abre somente a experiência e mantém detalhes técnicos fechados', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'Converse como cliente' })).toBeVisible();
  await expect(page.locator('#legacy-technical-support')).toBeHidden();
  await expect(page.getByText(/TATA-SC-/)).toHaveCount(0);
  await expect(page.getByText(/resposta esperada/i)).toBeHidden();
  await openMode(page, /50 conversas/);
  await expect(page.locator('#review-technical-button')).toBeHidden();
});

test('Atendimento Livre mantém multiturno e reset separa a conversa', async ({ page }) => {
  await open(page);
  await page.locator('#chat-message').fill('Estamos em dez pessoas e chegando.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('#chat-thread .message.bot')).toHaveCount(1);
  await page.locator('#chat-message').fill('Chegaremos às vinte horas.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('#chat-thread .message.bot')).toHaveCount(2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Nova conversa' }).click();
  await expect(page.locator('#chat-thread')).toContainText('Nova conversa iniciada');
  await expect(page.locator('#chat-thread .message.bot')).toHaveCount(0);
});

test('avaliação exige voto e só então revela decisão técnica', async ({ page }) => {
  await open(page);
  await openMode(page, /50 conversas/);
  await completeRating(page, 'REV-001', 'Resposta muito clara.');
  await expect(page.locator('#review-state')).toContainText('Avaliação salva');
  await expect(page.locator('#review-technical-button')).toBeVisible();
  await page.locator('#review-technical-button').click();
  await expect(page.locator('#review-technical')).toContainText('Decisão do DeliveryOS');
  await expect(page.locator('#review-technical')).toContainText('Intenção');
});

test('A/B permanece cego, determinístico após reload e revela somente após voto', async ({ page }) => {
  await open(page);
  await openMode(page, /Comparação cega/);
  await page.locator('#blind-select').selectOption('REV-002');
  const first = await page.locator('#blind-responses').textContent();
  await expect(page.locator('#blind-reveal')).toBeHidden();
  await page.reload();
  await expect(page.locator('#global-state')).toContainText('Pronto');
  await openMode(page, /Comparação cega/);
  await page.locator('#blind-select').selectOption('REV-002');
  expect(await page.locator('#blind-responses').textContent()).toBe(first);
  await page.locator('input[name="blind-choice"][value="A"]').check();
  await page.getByRole('button', { name: 'Salvar voto e revelar versões' }).click();
  await expect(page.locator('#blind-reveal')).toContainText('Versões reveladas');
});

test('não permite avançar na comparação sem voto', async ({ page }) => {
  await open(page);
  await openMode(page, /Comparação cega/);
  await page.locator('#blind-select').selectOption('REV-003');
  await page.getByRole('button', { name: 'Salvar voto e revelar versões' }).click();
  await expect(page.locator('#blind-state')).toContainText('Escolha uma opção');
  await expect(page.locator('#blind-reveal')).toBeHidden();
});

test('voto persiste após reload e filtro remove caso já avaliado', async ({ page }) => {
  await open(page);
  await openMode(page, /50 conversas/);
  await page.locator('#review-select').selectOption('REV-001');
  await expect(page.locator('#review-technical-button')).toBeVisible();
  await page.locator('#only-pending').check();
  await expect(page.locator('#review-select option[value="REV-001"]')).toHaveCount(0);
});

test('comentário com PII é bloqueado e marcador não alcança arquivos', async ({ page }) => {
  const marker = 'controle-negativo-unico@example.test';
  await open(page);
  await openMode(page, /50 conversas/);
  await completeRating(page, 'REV-004', `Contato ${marker}`);
  await expect(page.locator('#review-state')).toContainText('dado pessoal');
  const disk = filesBelow(root).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  expect(disk.includes(marker)).toBe(false);
});

test('banco completo oferece 32 áreas e apenas preenche a entrada', async ({ page }) => {
  await open(page);
  await openMode(page, /Explorar banco/);
  await expect(page.locator('#bank-grid article')).toHaveCount(32);
  await page.locator('#bank-grid article').first().getByRole('button').click();
  await expect(page.locator('#chat-message')).not.toHaveValue('');
  await expect(page.locator('#chat-thread .message.bot')).toHaveCount(0);
});

test('dashboard separa avaliação humana e exporta pacote privado', async ({ page }) => {
  await open(page);
  await openMode(page, /Resultados/);
  await expect(page.locator('#dashboard-content')).toContainText('Avaliados');
  await expect(page.locator('#dashboard-content')).toContainText('Referência futura');
  await page.getByRole('button', { name: 'Exportar avaliação' }).click();
  await expect(page.locator('#global-state')).toContainText('privacidade verificada');
  const packages = fs.readdirSync(path.join(root, 'exports'));
  expect(packages).toHaveLength(1);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'exports', packages[0], 'MANIFEST.json'), 'utf8'));
  expect(manifest.privacy_scan.passed).toBe(true);
  expect(manifest.head).toMatch(/^[a-f0-9]{40}$/);
});

test('layout móvel e navegação por teclado preservam os modos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.locator('.shell')).toBeVisible();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(['BUTTON', 'TEXTAREA', 'A']).toContain(focused);
  await openMode(page, /Explorar banco/);
  await expect(page.locator('#bank-grid article').first()).toBeVisible();
});

test('falha do servidor produz mensagem segura sem detalhe interno', async ({ page }) => {
  await page.route('**/api/homologation/bootstrap', (route) => route.abort());
  await page.goto(base);
  await expect(page.locator('#global-state')).toContainText('não pôde ser iniciado');
  await expect(page.locator('body')).not.toContainText('stack');
  await expect(page.locator('body')).not.toContainText('TypeError');
});
