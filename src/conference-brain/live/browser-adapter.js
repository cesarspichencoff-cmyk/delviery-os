/* ============================================================================
 * Adaptador de navegador dedicado (Sprint 2, Fases 2-3).
 * ----------------------------------------------------------------------------
 * Observação PASSIVA de uma sessão já autorizada. Este módulo NUNCA:
 *   - faz login sozinho, digita senha ou contorna 2FA;
 *   - contorna CAPTCHA;
 *   - clica em botões que mudam estado no portal (aceitar, despachar etc.);
 *   - reexecuta endpoints privados fora do navegador;
 *   - roda com o Playwright ausente sem dizer isso explicitamente.
 *
 * Ordem de preferência de leitura (Fase 2): DOM/acessibilidade > dados
 * estruturados que a própria página já recebeu > snapshot estrutural >
 * comparação visual > OCR (não implementado nesta missão — último recurso).
 *
 * Desacoplamento para teste: a lógica de ciclo (`runObservationCycle`) recebe
 * um `driver` — um objeto com o subconjunto mínimo da API do Playwright que
 * este módulo usa. Em produção, `createPlaywrightDriver()` fornece um driver
 * real (via `require("playwright")`, carregado tardiamente). Em teste, um
 * driver falso permite validar toda a lógica de ciclo, backoff e extração
 * SEM precisar do Playwright instalado nem de uma sessão real — o que este
 * ambiente não tem (ver docs/conference-brain/LIVE_VALIDATION_V1.md).
 * ==========================================================================*/
"use strict";

const { LIVE_SOURCE_HEALTH } = require("../contracts/live-states");
const { classifyCycleHealth } = require("./health");
const Preflight = require("./playwright-preflight");

const COLLECTOR_VERSION = "ifood-live-browser-v1";

const DEFAULTS = Object.freeze({
  intervalMs: 30000,          // meta: atualização a cada ~30s
  minIntervalMs: 10000,       // nunca mais rápido que isto — sem recarga frenética
  timeoutMs: 15000,
  staleAfterMs: 5 * 60000,    // 5 min sem mudança na página = stale
  backoffBaseMs: 5000,
  backoffMaxMs: 120000,
  retentionDays: 7
});

/**
 * Tenta carregar o Playwright em runtime (devDependency opcional — ver
 * package.json). Nunca lança: se ausente, o adaptador continua existindo e
 * reporta saúde `unavailable` com o motivo, em vez de derrubar o processo.
 *
 * Bloqueador 10 da rechecagem: esta função só tentava `require("playwright")`,
 * enquanto `playwright-preflight.js#detectDependency()` aceitava
 * `playwright-core` OU `playwright` — se só `playwright-core` estivesse
 * instalado, o preflight diria "pronto" e o driver falharia mesmo assim.
 * Agora delega para `playwright-preflight.js` — FONTE ÚNICA de resolução da
 * dependência, nunca duas implementações que podem divergir.
 */
function tryLoadPlaywright() {
  const dep = Preflight.detectDependency();
  if (!dep.present) return { ok: false, error: "playwright_nao_instalado:playwright-core_ou_playwright_nao_encontrado" };
  return { ok: true, playwright: dep.module, package: dep.package };
}

/**
 * Cria um driver real sobre uma sessão persistente do Chromium. `profileDir`
 * fica FORA do repositório (config, nunca hardcoded) — é a sessão autorizada
 * do lojista, não deve ir para o Git em hipótese alguma.
 *
 * Bloqueador 9/10 da rechecagem: antes, este driver não passava por
 * `refuseIfNotReady()` (não existia caminho ÚNICO de entrada — um script
 * poderia chamar `createPlaywrightDriver` direto, ignorando o preflight);
 * ignorava `config.executablePath` mesmo quando validado pelo preflight; e
 * aceitava `allowedUrl` sem checar contra nenhuma allowlist. Agora:
 *   1. `refuseIfNotReady(config)` é a ÚNICA porta — sem isso, não há
 *      `chromium.launchPersistentContext` nenhum;
 *   2. `executablePath` validado é o MESMO passado ao Chromium;
 *   3. `gotoAllowedUrl()` nunca navega para nada fora da allowlist checada
 *      no preflight — a checagem já aconteceu em `refuseIfNotReady`, aqui só
 *      se usa o resultado.
 */
async function createPlaywrightDriver(config) {
  const c = config || {};
  const gate = Preflight.refuseIfNotReady(c);
  if (!gate.allowed) return { ok: false, reason: gate.reason, check: gate.check };

  const { module: playwright } = Preflight.detectDependency();
  const { chromium } = playwright;
  const launchOptions = { headless: c.headless !== false };
  if (c.executablePath) launchOptions.executablePath = c.executablePath;

  const context = await chromium.launchPersistentContext(c.profileDir, launchOptions);
  const page = context.pages()[0] || await context.newPage();
  return {
    ok: true,
    async gotoAllowedUrl() { await page.goto(c.allowedUrl, { waitUntil: "domcontentloaded" }); },
    async textContent(selector) {
      const el = await page.$(selector);
      return el ? (await el.textContent()) : null;
    },
    async queryAll(selector) { return page.$$(selector); },
    async elementText(handle) { return handle.textContent(); },
    async hasElement(selector) { return (await page.$(selector)) !== null; },
    async close() { await context.close(); }
  };
}

/**
 * Extrai uma observação de UM ciclo a partir do driver e de uma configuração
 * de seletores (Fase 14 — Modo de Mapeamento é quem descobre os seletores
 * reais; aqui eles são só CONFIGURAÇÃO, nunca hardcoded — ver
 * docs/conference-brain/IFOOD_SCREEN_SOURCE_MAP_V1.md §3).
 *
 * @param {object} driver     objeto com a API mínima usada (real ou falso)
 * @param {object} selectors  { containerSelector, orderCardSelector, idSelector,
 *                              statusSelector, itemsSelector, loginSelector,
 *                              captchaSelector }
 */
async function extractCycleObservation(driver, selectors) {
  const sel = selectors || {};
  const signals = {
    containerFound: false, loginPromptDetected: false, captchaDetected: false,
    ordersFound: 0, emptyOrderRatio: 0, criticalFieldsMissing: [], consecutiveFailures: 0
  };
  const orders = [];

  if (sel.loginSelector && await driver.hasElement(sel.loginSelector)) {
    signals.loginPromptDetected = true;
    return { orders, signals, health: classifyCycleHealth(signals) };
  }
  if (sel.captchaSelector && await driver.hasElement(sel.captchaSelector)) {
    signals.captchaDetected = true;
    return { orders, signals, health: classifyCycleHealth(signals) };
  }
  if (!sel.containerSelector || !(await driver.hasElement(sel.containerSelector))) {
    return { orders, signals, health: classifyCycleHealth(signals) };
  }
  signals.containerFound = true;

  const cards = sel.orderCardSelector ? await driver.queryAll(sel.orderCardSelector) : [];
  let empty = 0;
  for (const card of cards) {
    const id = sel.idSelector ? await safeText(driver, card, sel.idSelector) : null;
    const rawStatus = sel.statusSelector ? await safeText(driver, card, sel.statusSelector) : null;
    if (!id) { empty++; continue; }
    orders.push({ external_id: id, raw_status: rawStatus || "" });
  }
  signals.ordersFound = orders.length;
  signals.emptyOrderRatio = cards.length ? empty / cards.length : 0;
  if (!sel.statusSelector) signals.criticalFieldsMissing.push("status_selector_nao_configurado");

  return { orders, signals, health: classifyCycleHealth(signals) };
}

/** Lê texto de um sub-elemento dentro de um card, tolerando ausência. */
async function safeText(driver, card, subSelector) {
  try {
    if (typeof driver.elementText === "function" && card && card.querySelector) {
      return driver.elementText(card.querySelector(subSelector));
    }
    if (card && typeof card.$eval === "function") {
      return await card.$eval(subSelector, (el) => el.textContent).catch(() => null);
    }
    return null;
  } catch (_) { return null; }
}

/** Backoff exponencial simples, com teto — nunca recarrega freneticamente após erro. */
function nextBackoffMs(previousMs, opts) {
  const o = Object.assign({}, DEFAULTS, opts);
  const base = previousMs ? previousMs * 2 : o.backoffBaseMs;
  return Math.min(base, o.backoffMaxMs);
}

/** Garante o intervalo mínimo configurável — nunca mais agressivo que isso. */
function effectiveIntervalMs(configuredMs) {
  return Math.max(configuredMs || DEFAULTS.intervalMs, DEFAULTS.minIntervalMs);
}

module.exports = {
  COLLECTOR_VERSION, DEFAULTS,
  tryLoadPlaywright, createPlaywrightDriver, extractCycleObservation,
  nextBackoffMs, effectiveIntervalMs
};
