/* ============================================================================
 * Fase 2E.1 — configuração IMUTÁVEL da Capacidade Viva human-v2, modo sombra.
 * ----------------------------------------------------------------------------
 * Validada de forma independente e cega (blind-v1 + blind-v2, worktree
 * deliveryos-capacidade-viva-calibration, commit 076a1cb): concordância
 * exata 26/26 no holdout independente. Aprovada SOMENTE para modo sombra —
 * ver docs/CAPACIDADE_VIVA_SHADOW.md.
 *
 * Na inicialização, o hash do arquivo de config é recalculado e comparado ao
 * hash esperado (congelado no momento da validação). Se não bater
 * EXATAMENTE, o motor human-v2 não inicia — nunca lança exceção que derrube
 * o Copiloto: quem chama `load()` sempre recebe um status, nunca uma
 * exceção não tratada.
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CONFIG_PATH = path.join(
  __dirname, "..", "..", "..",
  "data", "capacidade-viva", "calibration", "configs", "cv-cal-tata-human-v2.json"
);

const METADATA = Object.freeze({
  name: "cv-cal-tata-human-v2",
  version: 2,
  expected_sha256: "f248a17328ca71fc8608e0897d24ee3966bf0b7bcd55afbebb6feaa4cc7534dc",
  origin: "deliveryos-capacidade-viva-calibration (research/capacidade-viva-calibration)",
  validation_commit: "076a1cb",
  motor_commit: "b620aef", // commit do motor human-v2 no worktree de calibração (Fase 2D.8)
  validated_via: "blind-v1 (24 casos) + blind-v2 (30 casos, 26 comparáveis, concordância exata 26/26)",
  status: "shadow_only",
  automatic_decisions_allowed: false,
  config_path: "data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json"
});

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/**
 * Caminho efetivo da configuração. Em uso normal é sempre CONFIG_PATH — a
 * variável de ambiente só existe para permitir que os testes de falha (§9,
 * §10: "hash incorreto", "config ausente") exerçam o caminho real de erro
 * sem nunca tocar no arquivo real e validado do repositório.
 */
function resolveConfigPath() {
  return process.env.CAPACIDADE_VIVA_HUMAN_V2_SHADOW_CONFIG_PATH || CONFIG_PATH;
}

/**
 * Carrega e valida a configuração human-v2. NUNCA lança — sempre devolve
 * um status. `ready:false` significa "motor human-v2 não deve iniciar";
 * quem chama decide o que fazer com isso (nunca deve ser fatal para o
 * Copiloto — ver shadow/runner.js).
 */
function loadShadowConfig() {
  const configPath = resolveConfigPath();
  const base = Object.assign({}, METADATA);
  if (!fs.existsSync(configPath)) {
    return Object.assign({}, base, {
      ready: false,
      error: "config_ausente",
      error_detail: "Arquivo de configuração human-v2 não encontrado: " + configPath,
      config: null,
      actual_sha256: null
    });
  }
  let actualSha;
  try {
    actualSha = sha256File(configPath);
  } catch (e) {
    return Object.assign({}, base, {
      ready: false,
      error: "falha_leitura_config",
      error_detail: String((e && e.message) || e),
      config: null,
      actual_sha256: null
    });
  }
  if (actualSha !== METADATA.expected_sha256) {
    return Object.assign({}, base, {
      ready: false,
      error: "hash_incompatível",
      error_detail:
        "Hash da configuração human-v2 não corresponde ao hash validado. Esperado " +
        METADATA.expected_sha256 + ", encontrado " + actualSha +
        ". O motor human-v2 NÃO inicia com configuração não validada.",
      config: null,
      actual_sha256: actualSha
    });
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    return Object.assign({}, base, {
      ready: false,
      error: "json_invalido",
      error_detail: String((e && e.message) || e),
      config: null,
      actual_sha256: actualSha
    });
  }
  if (config.config_version !== METADATA.name) {
    return Object.assign({}, base, {
      ready: false,
      error: "config_version_inesperada",
      error_detail: "Esperava config_version=" + METADATA.name + ", encontrado " + config.config_version,
      config: null,
      actual_sha256: actualSha
    });
  }
  return Object.assign({}, base, {
    ready: true,
    error: null,
    error_detail: null,
    config,
    actual_sha256: actualSha
  });
}

module.exports = { loadShadowConfig, METADATA, CONFIG_PATH, sha256File, resolveConfigPath };
