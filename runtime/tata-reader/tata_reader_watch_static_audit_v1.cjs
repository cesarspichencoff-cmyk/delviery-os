"use strict";
/**
 * Auditoria ESTATICA de um script watcher do TATA Comanda Reader.
 * ============================================================================
 * Para que serve: decidir, ANTES de instalar, se um watcher (v1, v2 ou outro)
 * pode rodar sozinho em modo continuo, ou so sob o supervisor de lotes — e se
 * pode rodar de qualquer jeito.
 *
 * A classe de defeito que ela procura foi reproduzida contra SQL Server real:
 * leitor aberto por ExecuteReader() e fechado fora de `finally`; uma excecao no
 * meio da leitura (LOCK_TIMEOUT, timeout, conversao) deixa o leitor ABERTO e
 * toda leitura seguinte falha no proprio cliente. Se, alem disso, o modo
 * continuo engole o erro sem sinal duravel, o resultado e o de 05/10/2026:
 * servico RUNNING, nada lido, nada dito.
 *
 * O supervisor de lotes neutraliza essa classe, MAS exige tres propriedades do
 * watcher, que esta auditoria tambem confere:
 *   P1 modo limitado falha em voz alta (re-lanca o erro quando MaxPolls > 0);
 *   P2 checkpoint gravado a cada poll bem-sucedido (sinal de progresso);
 *   P3 resultado do lote impresso no schema esperado.
 * E nenhuma superficie proibida: verbo SQL de escrita, rede, impressao.
 *
 * E heuristica textual sobre PowerShell, deliberadamente conservadora: na
 * duvida, acusa. Ela nao substitui o harness com SQL Server; ela e o filtro de
 * segundos que se roda na CAIXA sobre o arquivo exato que sera instalado.
 */
const fs = require("node:fs");
const crypto = require("node:crypto");

const AUDIT_SCHEMA = "deliveryos.tata-reader-watch-static-audit.v1";

/** Remove comentarios de linha e de bloco do PowerShell, preservando strings. */
function stripComments(src) {
  let out = "";
  let i = 0;
  let inStr = null; // '"' | "'" | '@"' | "@'"
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (inStr === '@"' || inStr === "@'") {
      const close = inStr === '@"' ? '"@' : "'@";
      if (two === close && (i === 0 || src[i - 1] === "\n")) { out += two; i += 2; inStr = null; continue; }
      out += c; i += 1; continue;
    }
    if (inStr === '"' || inStr === "'") {
      if (c === "`" && inStr === '"') { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === inStr) { inStr = null; }
      out += c; i += 1; continue;
    }
    if (two === "<#") {
      const end = src.indexOf("#>", i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (two === '@"' || two === "@'") { inStr = two; out += two; i += 2; continue; }
    if (c === '"' || c === "'") { inStr = c; out += c; i += 1; continue; }
    if (c === "#") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

/** Bloco entre chaves comecando no `{` em `openIdx` (balanceado, ignora strings simples). */
function blockAt(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return { start: openIdx, end: i, text: src.slice(openIdx + 1, i) };
    }
  }
  return { start: openIdx, end: src.length, text: src.slice(openIdx + 1) };
}

function blocksAfter(src, keywordRe) {
  const out = [];
  const re = new RegExp(keywordRe.source, "gi");
  let m;
  while ((m = re.exec(src)) !== null) {
    const brace = src.indexOf("{", m.index + m[0].length - 1);
    if (brace < 0) break;
    out.push({ at: m.index, ...blockAt(src, brace) });
  }
  return out;
}

function hereStrings(src) {
  const out = [];
  const re = /@"\r?\n([\s\S]*?)\r?\n"@/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

const SQL_WRITE_VERBS = /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|DENY|EXEC|EXECUTE|BULK|OPENROWSET|OPENQUERY|xp_\w+|sp_\w+)\b/i;
const NETWORK = /\b(Invoke-WebRequest|Invoke-RestMethod|Net\.WebClient|Net\.Http\.HttpClient|HttpWebRequest|Net\.Sockets\.TcpClient|Net\.Sockets\.UdpClient|Send-MailMessage)\b/i;
const PRINT = /\b(Out-Printer|Drawing\.Printing|PrintDocument|-Verb\s+Print|winspool|\\\\[^\\\s"']+\\[^\\\s"']*print)/i;

function auditWatcherScript(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("AUDIT_INPUT_EMPTY");
  const src = stripComments(text);
  const findings = [];
  const props = {};

  // ---- D1: leitor aberto por ExecuteReader e fechado fora de finally
  const readerVars = [...src.matchAll(/(\$[A-Za-z_][\w]*)\s*=\s*\$[A-Za-z_][\w]*\.ExecuteReader\s*\(/g)].map((m) => m[1]);
  const finallyBlocks = blocksAfter(src, /\bfinally\s*\{/);
  const closedInFinally = (v) => {
    const esc = v.replace(/\$/g, "\\$");
    const re = new RegExp(`${esc}\\s*\\.\\s*(Close|Dispose)\\s*\\(`, "i");
    return finallyBlocks.some((b) => re.test(b.text));
  };
  const unclosed = [...new Set(readerVars)].filter((v) => !closedInFinally(v));
  props.reader_variables = [...new Set(readerVars)];
  if (unclosed.length) {
    findings.push({ code: "READER_NOT_CLOSED_IN_FINALLY", severity: "DEFECT", detail: unclosed });
  }

  // ---- laço principal e seus catch
  const loops = blocksAfter(src, /\bwhile\s*\(\s*\$true\s*\)\s*\{/);
  const loop = loops[0] || null;
  props.has_continuous_loop = Boolean(loop);
  const catches = loop ? blocksAfter(loop.text, /\bcatch\s*\{/) : [];
  const pollCatch = catches.find((c) => /poll_errors\s*\+\+/.test(c.text)) || null;
  props.poll_catch_found = Boolean(pollCatch);

  // ---- P1: modo limitado re-lanca
  const boundedThrow = pollCatch && /if\s*\(\s*\$MaxPolls\s*-gt\s*0\s*\)\s*\{\s*throw\s*\}/i.test(pollCatch.text);
  const unconditionalThrow = pollCatch && /(^|[;\n])\s*throw\b/.test(pollCatch.text.replace(/if\s*\([^)]*\)\s*\{\s*throw\s*\}/gi, ""));
  props.bounded_mode_fails_loud = Boolean(boundedThrow || unconditionalThrow);

  // ---- D2: modo continuo engole o erro sem sinal duravel
  if (pollCatch && !unconditionalThrow) {
    const durable = /(Write-AtomicJson|Add-Content|Out-File|Set-Content|\[Console\]::Error|Write-Error|EventLog|heartbeat)/i.test(pollCatch.text);
    if (!durable) findings.push({ code: "POLL_ERRORS_SWALLOWED_IN_CONTINUOUS_MODE", severity: "DEFECT", detail: "catch do poll incrementa contador em memoria e segue sem sinal duravel" });
  }

  // ---- D3: conexao nao e refeita depois de erro
  if (pollCatch && !unconditionalThrow) {
    const reset = /\$\w+\s*\.\s*(Close|Dispose)\s*\(|SqlConnection/i.test(pollCatch.text);
    if (!reset) findings.push({ code: "CONNECTION_NOT_RESET_AFTER_ERROR", severity: "DEFECT", detail: "nenhum Close/Dispose/nova conexao no catch do poll" });
  }

  // ---- P2: checkpoint gravado a cada poll (dentro do laço)
  props.checkpoint_saved_each_poll = Boolean(loop && /\bSave-Checkpoint\b|Write-AtomicJson\s+\$CheckpointPath/i.test(loop.text));

  // ---- P3: resultado do lote no schema esperado
  props.run_result_printed = /deliveryos\.tata-reader-continuous-watch-run\.v1/.test(src) && /\$result\s*\|\s*ConvertTo-Json/i.test(src);

  // ---- identidade verificada (servico e login SQL)
  props.identity_checked = /WindowsIdentity\]::GetCurrent\(\)/.test(src) && /SUSER_SNAME\(\)/i.test(src);

  // ---- superficies proibidas
  const sqlTexts = hereStrings(src);
  const writeHits = [];
  for (const t of sqlTexts) {
    const cleaned = t.replace(/--[^\n]*/g, "");
    const m = cleaned.match(SQL_WRITE_VERBS);
    if (m) writeHits.push(m[1].toUpperCase());
  }
  const inlineSql = [...src.matchAll(/CommandText\s*=\s*"([^"]*)"/g)].map((m) => m[1]);
  for (const t of inlineSql) {
    const m = t.match(SQL_WRITE_VERBS);
    if (m) writeHits.push(m[1].toUpperCase());
  }
  if (writeHits.length) findings.push({ code: "FORBIDDEN_SQL_VERB", severity: "FORBIDDEN", detail: [...new Set(writeHits)] });
  if (NETWORK.test(src)) findings.push({ code: "FORBIDDEN_NETWORK_SURFACE", severity: "FORBIDDEN", detail: src.match(NETWORK)[1] });
  if (PRINT.test(src)) findings.push({ code: "FORBIDDEN_PRINT_SURFACE", severity: "FORBIDDEN", detail: src.match(PRINT)[1] });
  if (!props.identity_checked) findings.push({ code: "IDENTITY_NOT_CHECKED", severity: "FORBIDDEN", detail: "sem conferencia de identidade do servico e do login SQL" });

  const forbidden = findings.some((f) => f.severity === "FORBIDDEN");
  const continuousUnsafe = findings.some((f) => f.code === "READER_NOT_CLOSED_IN_FINALLY")
    || findings.some((f) => f.code === "POLL_ERRORS_SWALLOWED_IN_CONTINUOUS_MODE");
  const supervisorCompatible = props.bounded_mode_fails_loud && props.checkpoint_saved_each_poll && props.run_result_printed;

  let recommendation;
  if (forbidden) recommendation = "DO_NOT_INSTALL";
  else if (!supervisorCompatible) recommendation = continuousUnsafe ? "DO_NOT_INSTALL" : "CONTINUOUS_ONLY_NOT_SUPERVISABLE";
  else if (continuousUnsafe) recommendation = "INSTALL_ONLY_UNDER_SUPERVISOR";
  else recommendation = "SAFE_CONTINUOUS_AND_SUPERVISABLE";

  return Object.freeze({
    schema: AUDIT_SCHEMA,
    sha256: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex").toUpperCase(),
    recommendation,
    continuous_mode_safe: !continuousUnsafe,
    supervisor_bounded_mode_compatible: Boolean(supervisorCompatible),
    properties: Object.freeze(props),
    findings: Object.freeze(findings.map((f) => Object.freeze(f))),
  });
}

module.exports = { AUDIT_SCHEMA, auditWatcherScript, stripComments };

// node tata_reader_watch_static_audit_v1.cjs <watcher.ps1>
// Codigo 0 = instalavel (sob supervisor ou direto); 2 = nao instalar.
if (require.main === module) {
  const p = process.argv[2];
  if (!p) { console.error("USO: tata_reader_watch_static_audit_v1.cjs <watcher.ps1>"); process.exit(64); }
  const buf = fs.readFileSync(p);
  const r = auditWatcherScript(buf.toString("utf8").replace(/^﻿/, ""));
  const fileSha = crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
  process.stdout.write(JSON.stringify({ file: p, file_sha256: fileSha, ...r }, null, 2) + "\n");
  process.exit(r.recommendation === "DO_NOT_INSTALL" || r.recommendation === "CONTINUOUS_ONLY_NOT_SUPERVISABLE" ? 2 : 0);
}
