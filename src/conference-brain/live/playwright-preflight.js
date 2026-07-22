/* ============================================================================
 * Preflight do Playwright (Sprint 2.1, Fase 21 · composto com o driver real
 * no Sprint 2.2, Fase 6).
 * ----------------------------------------------------------------------------
 * A auditoria confirmou: Playwright não está instalado neste projeto, mas
 * binários do Chromium existem na máquina (de outra instalação). Este módulo
 * só VERIFICA pré-condições — nunca instala, nunca baixa navegador, nunca
 * abre uma sessão. Preferência técnica: `playwright-core` (sem baixar
 * browser) + executável do Chromium já existente, configurado fora do código.
 *
 * Bloqueadores 9 e 10 da rechecagem independente: este arquivo só validava
 * `executablePath`/`profileDir` — nunca flag, URL ou unidade; e
 * `detectDependency()` aceitava `playwright-core` OU `playwright`, mas
 * `browser-adapter.js` só carregava `playwright` (se só `playwright-core`
 * estivesse instalado, o preflight diria "pronto" e o driver falharia).
 * `browser-adapter.js` agora IMPORTA `detectDependency()`/`checkExecutable()`
 * DAQUI — uma fonte única de verdade, nunca duas implementações divergentes.
 * ==========================================================================*/
"use strict";

const fs = require("fs");

/** Tenta resolver `playwright-core` (preferido) ou `playwright` sem lançar. */
function detectDependency() {
  for (const name of ["playwright-core", "playwright"]) {
    try { return { present: true, package: name, module: require(name) }; }
    catch (_) { /* segue tentando o próximo */ }
  }
  return { present: false, package: null, module: null };
}

/** O executável do Chromium configurado existe no disco? Nunca baixa nada. */
function checkExecutable(executablePath) {
  if (!executablePath) return { configured: false, found: false };
  let found = false;
  try { found = fs.existsSync(executablePath); } catch (_) { found = false; }
  return { configured: true, found, path: executablePath };
}

/** O diretório de perfil persistente está configurado e existe? */
function checkProfile(profileDir) {
  if (!profileDir) return { configured: false, found: false };
  let found = false;
  try { found = fs.existsSync(profileDir); } catch (_) { found = false; }
  return { configured: true, found, path: profileDir };
}

/**
 * A flag correta está ligada? Este módulo não decide QUAL flag checar (o
 * chamador já avaliou via `flags.js#conferenceLiveObserverV1`/
 * `conferenceIfoodMappingModeV1` — leitura ESTRITA, nunca liga sozinha) — só
 * confere que o resultado foi passado e é verdadeiro.
 */
function checkFlag(flagEnabled, flagName) {
  return { configured: flagEnabled !== undefined, enabled: flagEnabled === true, name: flagName || null };
}

/**
 * URL permitida — nunca aceita "qualquer HTTPS". Exige uma allowlist
 * explícita; sem ela, a URL é recusada por padrão (Fase 6: "sem uma URL
 * permitida explicitamente: recusar execução").
 */
function checkAllowedUrl(rawUrl, allowlist) {
  if (!rawUrl) return { configured: false, allowed: false, reason: "url_nao_configurada" };
  if (!Array.isArray(allowlist) || !allowlist.length) {
    return { configured: true, allowed: false, reason: "allowlist_nao_configurada", url: rawUrl };
  }
  let parsed;
  try { parsed = new URL(rawUrl); } catch (_) { return { configured: true, allowed: false, reason: "url_invalida", url: rawUrl }; }
  if (parsed.protocol !== "https:") {
    return { configured: true, allowed: false, reason: "protocolo_nao_https", url: rawUrl };
  }
  const allowed = allowlist.some((entry) => parsed.host === entry || parsed.href.startsWith(entry));
  return { configured: true, allowed, reason: allowed ? null : "host_fora_da_allowlist", host: parsed.host, url: rawUrl };
}

/** Unidade esperada configurada — o coletor nunca mistura pedidos de unidades diferentes. */
function checkUnit(expectedUnitId) {
  return { configured: Boolean(expectedUnitId), unit_id: expectedUnitId || null };
}

/**
 * Confere as pré-condições para uma futura sessão supervisionada — NUNCA
 * valida se a sessão está de fato autorizada (isso só um humano confirma).
 * @param {object} config
 *   executablePath, profileDir     — como antes (Sprint 2.1)
 *   flagEnabled, flagName          — resultado JÁ avaliado de flags.js (Sprint 2.2)
 *   allowedUrl, urlAllowlist[]     — URL alvo + allowlist de hosts permitidos
 *   expectedUnitId                 — unidade que o coletor deve confirmar
 */
function verifyMappingPreconditions(config) {
  const c = config || {};
  const dependency = detectDependency();
  const executable = checkExecutable(c.executablePath);
  const profile = checkProfile(c.profileDir);
  const flag = checkFlag(c.flagEnabled, c.flagName);
  const url = checkAllowedUrl(c.allowedUrl, c.urlAllowlist);
  const unit = checkUnit(c.expectedUnitId);

  const blockers = [];
  if (!flag.configured) blockers.push("flag_nao_informada_ao_preflight");
  else if (!flag.enabled) blockers.push("flag_desligada:" + (flag.name || "desconhecida"));
  if (!dependency.present) blockers.push("dependencia_ausente:playwright-core_ou_playwright_nao_instalado");
  if (!executable.configured) blockers.push("executavel_nao_configurado");
  else if (!executable.found) blockers.push("executavel_configurado_mas_nao_encontrado_no_disco");
  if (!profile.configured) blockers.push("perfil_nao_configurado");
  else if (!profile.found) blockers.push("perfil_configurado_mas_nao_encontrado_no_disco");
  if (!url.configured) blockers.push("url_nao_configurada");
  else if (!url.allowed) blockers.push("url_recusada:" + url.reason);
  if (!unit.configured) blockers.push("unidade_esperada_nao_configurada");

  return {
    dependency_present: dependency.present,
    dependency_package: dependency.package,
    executable,
    profile,
    flag,
    url,
    unit,
    session_validated: false, // nunca setado por este módulo — só um ciclo real supervisionado prova isso
    ready: blockers.length === 0,
    blockers
  };
}

/**
 * Recusa o comando se faltar qualquer pré-condição — nunca "tenta mesmo
 * assim". Fase 6: esta função agora é REALMENTE o guarda de entrada do
 * driver (`browser-adapter.js#createPlaywrightDriver` chama isto primeiro,
 * sempre — não existe caminho alternativo que abra um navegador sem passar
 * por aqui).
 */
function refuseIfNotReady(config) {
  const check = verifyMappingPreconditions(config);
  if (!check.ready) {
    return { allowed: false, reason: "precondicoes_ausentes:" + check.blockers.join(","), check };
  }
  return { allowed: true, reason: null, check };
}

module.exports = {
  detectDependency, checkExecutable, checkProfile, checkFlag, checkAllowedUrl, checkUnit,
  verifyMappingPreconditions, refuseIfNotReady
};
