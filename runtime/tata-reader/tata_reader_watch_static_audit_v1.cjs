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
 *
 * SUPERFICIE PROIBIDA (qualquer uma => DO_NOT_INSTALL):
 *   - SQL de escrita em QUALQUER literal de texto (aspas simples, duplas ou
 *     here-string): INSERT INTO, UPDATE ... SET, DELETE, MERGE, TRUNCATE,
 *     ALTER/CREATE/DROP, GRANT/REVOKE/DENY, EXEC, BULK INSERT, SELECT INTO,
 *     xp_/sp_;
 *   - API de escrita: ExecuteNonQuery, SqlBulkCopy, BeginTransaction,
 *     SqlDataAdapter/SqlCommandBuilder, provedores OleDb/Odbc;
 *   - CommandText que nao seja UM literal sem interpolacao (variavel,
 *     concatenacao, -f, "$(...)": SQL montado em tempo de execucao nao se
 *     audita lendo o arquivo); construtor SqlCommand com argumentos, por
 *     New-Object ou por ::new;
 *   - membro dinamico ($x.'Nome', $x."Nome", $x.$n, $x.(expr)): o nome do
 *     que se chama ou atribui nao fica no texto;
 *   - codigo dinamico: Invoke-Expression/iex, [ScriptBlock]::Create (curto
 *     ou qualificado), $ExecutionContext.InvokeCommand (NewScriptBlock,
 *     InvokeScript), [PowerShell]::Create/AddScript, RunspaceFactory,
 *     Add-Type, DllImport, -EncodedCommand, Invoke-Command, Start-Process,
 *     Start-Job, & ou . com variavel/expressao, Import-Module;
 *   - rede e impressao;
 *   - ausencia de conferencia de identidade (servico e login SQL).
 *
 * LIMITE DECLARADO: e heuristica textual sobre PowerShell, conservadora (na
 * duvida, acusa), e NAO e a barreira de seguranca. As barreiras sao: (1) o
 * login do servico so tem SELECT por coluna (provado no mundo em 06/10);
 * (2) o arquivo exato e LIDO por gente antes de instalar; (3) o SHA-256 fica
 * fixado e conferido a cada lote. Esta auditoria e o filtro de segundos que
 * roda antes das tres.
 */
const fs = require("node:fs");
const crypto = require("node:crypto");

const AUDIT_SCHEMA = "deliveryos.tata-reader-watch-static-audit.v2";
const PH = "\u0001";

/**
 * Tokeniza PowerShell o suficiente para auditar: remove comentarios e separa
 * os literais de texto. Devolve:
 *   - code: o fonte sem comentarios, com cada literal trocado por PH<n>PH;
 *   - text: o fonte sem comentarios, literais intactos;
 *   - strings: [{ kind, body }] na ordem em que aparecem.
 */
function tokenize(src) {
  let code = "";
  let text = "";
  const strings = [];
  let i = 0;
  const n = src.length;
  const atLineStart = (k) => k === 0 || src[k - 1] === "\n";
  const push = (kind, body, raw) => {
    code += `${PH}${strings.length}${PH}`;
    text += raw;
    strings.push({ kind, body });
  };
  while (i < n) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (two === "<#") {
      const end = src.indexOf("#>", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === "#") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if ((two === '@"' || two === "@'") && /^[ \t]*\r?\n/.test(src.slice(i + 2, i + 40))) {
      const q = two[1];
      const nl = src.indexOf("\n", i + 2);
      let k = nl + 1;
      let end = -1;
      while (k < n) {
        if (atLineStart(k) && src.slice(k, k + 2) === `${q}@`) { end = k; break; }
        const next = src.indexOf("\n", k);
        if (next < 0) break;
        k = next + 1;
      }
      if (end < 0) end = n;
      const body = src.slice(nl + 1, end).replace(/\r?\n$/, "");
      push(q === '"' ? "here-double" : "here-single", body, src.slice(i, Math.min(n, end + 2)));
      i = Math.min(n, end + 2);
      continue;
    }
    if (c === "'") {
      let k = i + 1;
      let body = "";
      while (k < n) {
        if (src[k] === "'" && src[k + 1] === "'") { body += "'"; k += 2; continue; }
        if (src[k] === "'") break;
        body += src[k];
        k += 1;
      }
      push("single", body, src.slice(i, k + 1));
      i = k + 1;
      continue;
    }
    if (c === '"') {
      let k = i + 1;
      let body = "";
      while (k < n) {
        if (src[k] === "`") { body += src.slice(k, k + 2); k += 2; continue; }
        if (src[k] === '"' && src[k + 1] === '"') { body += '"'; k += 2; continue; }
        if (src[k] === '"') break;
        body += src[k];
        k += 1;
      }
      push("double", body, src.slice(i, k + 1));
      i = k + 1;
      continue;
    }
    code += c;
    text += c;
    i += 1;
  }
  return { code, text, strings };
}

/** Compatibilidade: fonte sem comentarios, literais preservados. */
function stripComments(src) {
  return tokenize(src).text;
}

/** Bloco entre chaves comecando no `{` em `openIdx` (no codigo sem literais). */
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

const SQL_WRITE_SHAPE = new RegExp(
  [
    String.raw`\bINSERT\s+(?:INTO\s+)?[\w\[\].#@]+`,
    String.raw`\bUPDATE\s+[\w\[\].#@]+\s+SET\b`,
    String.raw`\bDELETE\s+(?:FROM\s+)?[\w\[\].#@]+`,
    String.raw`\bMERGE\s+(?:INTO\s+)?[\w\[\].#@]+`,
    String.raw`\bTRUNCATE\s+TABLE\b`,
    String.raw`\b(?:ALTER|CREATE|DROP)\s+(?:TABLE|LOGIN|USER|DATABASE|ROLE|SCHEMA|PROC|PROCEDURE|VIEW|TRIGGER|INDEX|FUNCTION|SYNONYM|TYPE)\b`,
    String.raw`\b(?:GRANT|REVOKE|DENY)\s+\w+`,
    String.raw`\bEXEC(?:UTE)?\s*\(?\s*[\w\[\].@'"]+`,
    String.raw`\bBULK\s+INSERT\b`,
    String.raw`\bSELECT\b[\s\S]*?\bINTO\s+[#\w\[\]]+`,
    String.raw`\b(?:xp|sp)_\w+`,
  ].join("|"),
  "i",
);
// Mais largo, so para o texto que comprovadamente vai ao SQL Server
// (here-strings e CommandText literal).
const SQL_WRITE_WORD = /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|DENY|EXEC|EXECUTE|BULK|OPENROWSET|OPENQUERY|xp_\w+|sp_\w+)\b/i;
const WRITE_API = /\b(ExecuteNonQuery|SqlBulkCopy|BeginTransaction|SqlDataAdapter|SqlCommandBuilder|OleDb\w*|Odbc\w*)\b/i;
const DYNAMIC_CODE = new RegExp([
  "\\b(Invoke-Expression|Add-Type|Invoke-Command|Start-Process|Start-Job|InvokeScript|NewScriptBlock|InvokeCommand|AddScript|RunspaceFactory|DllImport|Import-Module|ipmo|icm|saps|sajb)\\b",
  "\\[\\s*(?:System\\.)?(?:Management\\.Automation\\.)?(?:ScriptBlock|PowerShell)\\s*\\]\\s*::\\s*Create",
  "\\busing\\s+module\\b",
  "-EncodedCommand\\b",
  "(?:^|[\\s;|(&])iex\\b",
  // & ou . (chamada/dot-source) com variavel, expressao ou texto: o que roda nao fica no arquivo.
  "(?:^|[;\\n{(|])[ \\t]*[&.][ \\t]+(?:\\$|\\(|" + PH + "|[A-Za-z]:|\\.{1,2}[\\\\/])",
  "(?:^|[;\\n{(|=])[ \\t]*&[ \\t]*(?:\\$|\\(|" + PH + ")",
].join("|"), "im");
// Membro dinamico: ponto colado ao objeto e seguido de texto, variavel ou
// expressao. Faixa (1..$n) e numero decimal ficam de fora.
const DYNAMIC_MEMBER = new RegExp("(?<![.\\d\\s])\\.(?!\\.)(?:" + PH + "\\d+" + PH + "|\\$|\\()");
const NETWORK = /\b(Invoke-WebRequest|Invoke-RestMethod|Net\.WebClient|Net\.Http\.HttpClient|HttpWebRequest|Net\.Sockets\.TcpClient|Net\.Sockets\.UdpClient|Send-MailMessage)\b/i;
const PRINT = /\b(Out-Printer|Drawing\.Printing|PrintDocument|winspool)\b|-Verb\s+Print/i;

function auditWatcherScript(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("AUDIT_INPUT_EMPTY");
  const tk = tokenize(source);
  const code = tk.code;
  const src = tk.text;
  const lit = (ph) => tk.strings[Number(ph.slice(1, -1))];
  const findings = [];
  const props = {};

  // ---- D1: leitor aberto por ExecuteReader e fechado fora de finally
  const readerVars = [...code.matchAll(/(\$[A-Za-z_][\w]*)\s*=\s*\$[A-Za-z_][\w]*\.ExecuteReader\s*\(/g)].map((m) => m[1]);
  const finallyBlocks = blocksAfter(code, /\bfinally\s*\{/);
  const closedInFinally = (v) => {
    const esc = v.replace(/\$/g, "\\$");
    const re = new RegExp(`${esc}\\s*\\.\\s*(Close|Dispose)\\s*\\(`, "i");
    return finallyBlocks.some((b) => re.test(b.text));
  };
  const unclosed = [...new Set(readerVars)].filter((v) => !closedInFinally(v));
  props.reader_variables = [...new Set(readerVars)];
  if (unclosed.length) findings.push({ code: "READER_NOT_CLOSED_IN_FINALLY", severity: "DEFECT", detail: unclosed });

  // ---- laco principal e seus catch
  const loops = blocksAfter(code, /\bwhile\s*\(\s*\$true\s*\)\s*\{/);
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

  // ---- P2: checkpoint gravado a cada poll (dentro do laco)
  props.checkpoint_saved_each_poll = Boolean(loop && /\bSave-Checkpoint\b|Write-AtomicJson\s+\$CheckpointPath/i.test(loop.text));

  // ---- P3: resultado do lote no schema esperado
  props.run_result_printed = tk.strings.some((s) => s.body === "deliveryos.tata-reader-continuous-watch-run.v1") && /\$result\s*\|\s*ConvertTo-Json/i.test(code);

  // ---- identidade verificada (servico e login SQL)
  props.identity_checked = /WindowsIdentity\]::GetCurrent\(\)/.test(code) && tk.strings.some((s) => /SUSER_SNAME\(\)/i.test(s.body));

  // ---- SQL de escrita em QUALQUER literal
  const shapeHits = [];
  for (const s of tk.strings) {
    const body = s.body.replace(/--[^\n]*/g, "");
    const m = body.match(SQL_WRITE_SHAPE);
    if (m) shapeHits.push(m[0].replace(/\s+/g, " ").slice(0, 40).toUpperCase());
  }

  // ---- CommandText: um literal, inteiro, sem interpolacao
  const cmdTexts = [];
  const notLiteral = [];
  for (const m of code.matchAll(/\.CommandText\s*=\s*([^\n;]*)/g)) {
    const rhs = m[1];
    const only = rhs.match(new RegExp(`^(${PH}\\d+${PH})\\s*(?:}|$)`));
    if (!only) { notLiteral.push(rhs.trim().slice(0, 40)); continue; }
    const s = lit(only[1]);
    if ((s.kind === "double" || s.kind === "here-double") && /\$/.test(s.body)) { notLiteral.push("interpolado"); continue; }
    cmdTexts.push(s.body);
  }
  if (/\bset_CommandText\b|CommandText\s*=\s*\$|-Property\s+@\{[^}]*CommandText/i.test(code)) notLiteral.push("atribuicao indireta");
  if (new RegExp(`SqlCommand\\b\\s*(?:\\(|-ArgumentList\\b|\\$|${PH})`, "i").test(code.replace(/SqlCommand\s*\(\s*\)/gi, ""))) notLiteral.push("construtor SqlCommand com argumentos");
  if (/SqlCommand\s*\]\s*::\s*new\s*\((?!\s*\))/i.test(code)) notLiteral.push("SqlCommand::new com argumentos");
  props.command_texts_literal = cmdTexts.length;
  for (const t of [...cmdTexts, ...tk.strings.filter((s) => s.kind.startsWith("here")).map((s) => s.body)]) {
    const m = t.replace(/--[^\n]*/g, "").match(SQL_WRITE_WORD);
    if (m) shapeHits.push(m[1].toUpperCase());
  }
  if (shapeHits.length) findings.push({ code: "FORBIDDEN_SQL_VERB", severity: "FORBIDDEN", detail: [...new Set(shapeHits)] });
  if (notLiteral.length) findings.push({ code: "COMMAND_TEXT_NOT_LITERAL", severity: "FORBIDDEN", detail: [...new Set(notLiteral)] });

  const w = code.match(WRITE_API);
  if (w) findings.push({ code: "FORBIDDEN_WRITE_API", severity: "FORBIDDEN", detail: w[1] });
  const d = code.match(DYNAMIC_CODE);
  if (d) findings.push({ code: "FORBIDDEN_DYNAMIC_CODE", severity: "FORBIDDEN", detail: d[0].trim().replace(new RegExp(PH, "g"), "'") });
  const dm = code.match(DYNAMIC_MEMBER);
  if (dm) findings.push({ code: "FORBIDDEN_DYNAMIC_MEMBER", severity: "FORBIDDEN", detail: code.slice(Math.max(0, dm.index - 12), dm.index + 6).replace(new RegExp(PH, "g"), "'").trim() });
  if (NETWORK.test(code)) findings.push({ code: "FORBIDDEN_NETWORK_SURFACE", severity: "FORBIDDEN", detail: code.match(NETWORK)[1] });
  if (PRINT.test(code)) findings.push({ code: "FORBIDDEN_PRINT_SURFACE", severity: "FORBIDDEN", detail: code.match(PRINT)[0] });
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
    sha256: crypto.createHash("sha256").update(Buffer.from(source, "utf8")).digest("hex").toUpperCase(),
    recommendation,
    continuous_mode_safe: !continuousUnsafe,
    supervisor_bounded_mode_compatible: Boolean(supervisorCompatible),
    human_review_required: true,
    properties: Object.freeze(props),
    findings: Object.freeze(findings.map((f) => Object.freeze(f))),
  });
}

module.exports = { AUDIT_SCHEMA, auditWatcherScript, stripComments, tokenize };

// node tata_reader_watch_static_audit_v1.cjs <watcher.ps1>
// Codigo 0 = instalavel (sob supervisor ou direto) DEPOIS de leitura humana;
// 2 = nao instalar.
if (require.main === module) {
  const p = process.argv[2];
  if (!p) { console.error("USO: tata_reader_watch_static_audit_v1.cjs <watcher.ps1>"); process.exit(64); }
  const buf = fs.readFileSync(p);
  const r = auditWatcherScript(buf.toString("utf8").replace(/^﻿/, ""));
  const fileSha = crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
  process.stdout.write(JSON.stringify({ file: p, file_sha256: fileSha, ...r }, null, 2) + "\n");
  process.exit(r.recommendation === "DO_NOT_INSTALL" || r.recommendation === "CONTINUOUS_ONLY_NOT_SUPERVISABLE" ? 2 : 0);
}
