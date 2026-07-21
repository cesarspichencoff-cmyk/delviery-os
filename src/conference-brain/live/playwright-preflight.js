/* ============================================================================
 * Preflight do Playwright (Sprint 2.1, Fase 21).
 * ----------------------------------------------------------------------------
 * A auditoria confirmou: Playwright não está instalado neste projeto, mas
 * binários do Chromium existem na máquina (de outra instalação). Este módulo
 * só VERIFICA pré-condições — nunca instala, nunca baixa navegador, nunca
 * abre uma sessão. Preferência técnica: `playwright-core` (sem baixar
 * browser) + executável do Chromium já existente, configurado fora do código.
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
 * Confere as pré-condições para uma futura sessão supervisionada — NUNCA
 * valida se a sessão está de fato autorizada (isso só um humano confirma).
 * @param {object} config { executablePath, profileDir }
 */
function verifyMappingPreconditions(config) {
  const c = config || {};
  const dependency = detectDependency();
  const executable = checkExecutable(c.executablePath);
  const profile = checkProfile(c.profileDir);

  const blockers = [];
  if (!dependency.present) blockers.push("dependencia_ausente:playwright-core_ou_playwright_nao_instalado");
  if (!executable.configured) blockers.push("executavel_nao_configurado");
  else if (!executable.found) blockers.push("executavel_configurado_mas_nao_encontrado_no_disco");
  if (!profile.configured) blockers.push("perfil_nao_configurado");
  else if (!profile.found) blockers.push("perfil_configurado_mas_nao_encontrado_no_disco");

  return {
    dependency_present: dependency.present,
    dependency_package: dependency.package,
    executable,
    profile,
    session_validated: false, // nunca setado por este módulo — só um ciclo real supervisionado prova isso
    ready: blockers.length === 0,
    blockers
  };
}

/**
 * Recusa o comando se faltar qualquer pré-condição — nunca "tenta mesmo
 * assim". Usado como guarda de entrada por qualquer script que precise de
 * navegador real (nenhum script deste tipo é executado nesta missão).
 */
function refuseIfNotReady(config) {
  const check = verifyMappingPreconditions(config);
  if (!check.ready) {
    return { allowed: false, reason: "precondicoes_ausentes:" + check.blockers.join(","), check };
  }
  return { allowed: true, reason: null, check };
}

module.exports = { detectDependency, checkExecutable, checkProfile, verifyMappingPreconditions, refuseIfNotReady };
