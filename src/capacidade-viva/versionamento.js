/* ============================================================================
 * Versionamento de configuração Capacidade Viva — audit trail.
 * ==========================================================================*/
"use strict";

function createHistory(seed) {
  return {
    schema_version: "0.1",
    entries: Array.isArray(seed) ? seed.slice() : []
  };
}

/**
 * Registra alteração de config.
 * @returns {{ history, config }}
 */
function applyConfigChange(config, history, change) {
  const c = change || {};
  const path = c.path;
  if (!path) throw new Error("config_change_requires_path");
  const prev = getPath(config, path);
  const next = c.value;
  const entry = {
    at: c.at || new Date().toISOString(),
    path,
    previous: prev,
    next,
    reason: c.reason || "sem motivo registrado",
    version_before: config.config_version || null,
    version_after: c.version_after || bumpVersion(config.config_version),
    author_role: c.author_role || "config_operator",
    // nunca pessoa-alvo de avaliação
    no_person_tracking: true
  };
  setPath(config, path, next);
  config.config_version = entry.version_after;
  config.updated_at = entry.at;
  history.entries.push(entry);
  return { history, config, entry };
}

function bumpVersion(v) {
  if (!v || typeof v !== "string") return "cv-0.1.1";
  const m = v.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return v + ".1";
  return `cv-${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

function getPath(obj, path) {
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setPath(obj, path, value) {
  const parts = String(path).split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

module.exports = {
  createHistory,
  applyConfigChange,
  bumpVersion,
  getPath,
  setPath
};
