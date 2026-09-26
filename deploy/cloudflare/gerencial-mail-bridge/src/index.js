import { connect } from "cloudflare:sockets";
import PostalMime from "postal-mime";
import { normalizeClosing } from "./normalize.js";
import {
  matchesCaixaPulseMail,
  parseCaixaPulseMessage,
} from "./caixa-pulse-intake.js";
import {
  findKnownCaixaPulseUidsD1,
  upsertCaixaPulseMessageD1,
} from "./caixa-pulse-storage.js";
import {
  buildIfoodReviewRecord,
  matchesIfoodReviewMail,
} from "./ifood-intake.js";
import {
  findKnownIfoodReviewUidsD1,
  replaceIfoodReviewAttachmentsD1,
  upsertIfoodReviewD1,
} from "./ifood-storage.js";
import { selectDualSinkMailboxUids } from "./uid-gate.js";
import {
  findKnownClosingUidsD1,
  findKnownClosingUidsNeon,
  upsertClosing,
  upsertClosingNeon,
} from "./storage.js";

const HOST = "mail.tatasushi.com.br";
const PORT = 993;
const USER = "atendimento@tatasushi.com.br";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function quote(value) {
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

function safeError(error) {
  return error instanceof Error ? error.message.slice(0, 180) : "unknown error";
}

function plainAuthPayload(user, password) {
  const bytes = encoder.encode("\0" + user + "\0" + password);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

class ImapSession {
  constructor(socket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
    this.buffer = "";
    this.sequence = 0;
  }
  static async open(password) {
    const socket = connect(
      { hostname: HOST, port: PORT },
      { secureTransport: "on", allowHalfOpen: false },
    );
    await socket.opened;
    const session = new ImapSession(socket);
    const greeting = await session.readLine();
    if (!greeting.startsWith("* OK")) {
      throw new Error("IMAP greeting was not OK");
    }
    const capability = await session.command("CAPABILITY");
    const caps = capability.raw.toUpperCase();
    const authPlain = caps.includes("AUTH=PLAIN");
    const saslIr = caps.includes("SASL-IR");
    const loginDisabled = caps.includes("LOGINDISABLED");
    const login = await session.command(
      `LOGIN ${quote(USER)} ${quote(password)}`,
    );
    if (login.ok) return session;

    if (authPlain && saslIr) {
      const plain = await session.command(
        `AUTHENTICATE PLAIN ${plainAuthPayload(USER, password)}`,
      );
      if (plain.ok) return session;
      throw new Error(
        `IMAP authentication rejected login=${login.status} plain=${plain.status} loginDisabled=${loginDisabled}`,
      );
    }

    throw new Error(
      `IMAP authentication failed login=${login.status} authPlain=${authPlain} saslIr=${saslIr} loginDisabled=${loginDisabled}`,
    );
  }

  async fill() {
    const { value, done } = await this.reader.read();
    if (done) throw new Error("IMAP socket closed unexpectedly");
    this.buffer += decoder.decode(value, { stream: true });
  }
  async readLine() {
    while (!this.buffer.includes("\r\n")) await this.fill();
    const end = this.buffer.indexOf("\r\n") + 2;
    const line = this.buffer.slice(0, end - 2);
    this.buffer = this.buffer.slice(end);
    return line;
  }

  async command(command) {
    const tag = "A" + String(++this.sequence).padStart(3, "0");
    await this.writer.write(encoder.encode(`${tag} ${command}\r\n`));
    const pattern = new RegExp(
      `(?:^|\\r\\n)${tag} (OK|NO|BAD) [^\\r\\n]*\\r\\n`,
    );
    while (true) {
      const match = pattern.exec(this.buffer);
      if (match) {
        const end = match.index + match[0].length;
        const raw = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end);
        return { ok: match[1] === "OK", status: match[1], raw };
      }
      await this.fill();
    }
  }
  async close() {
    try {
      await this.command("LOGOUT");
    } catch {
      // Server may close immediately after BYE.
    }
    try { this.reader.releaseLock(); } catch {}
    try { this.writer.releaseLock(); } catch {}
    try { await this.socket.close(); } catch {}
  }
}

function extractMailbox(line) {
  const quoted = line.match(/"((?:\\.|[^"])*)"\s*$/);
  if (quoted) return quoted[1].replace(/\\(["\\])/g, "$1");
  const atom = line.match(/\s([^\s]+)\s*$/);
  return atom?.[1] ?? "";
}

function findSentFolder(raw) {
  const lines = raw.split("\r\n").filter((line) => line.startsWith("* LIST "));
  const special = lines.find((line) => /\\Sent\b/i.test(line));
  if (special) return extractMailbox(special);
  const candidates = ["sent", "sent items", "enviados", "itens enviados", "inbox.sent"];
  for (const line of lines) {
    const path = extractMailbox(line);
    if (candidates.includes(path.toLowerCase())) return path;
  }
  return "";
}

function recentDate(days = 14) {
  const date = new Date(Date.now() - days * 86400000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getUTCDate()).padStart(2, "0")}-${months[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}

function parseSearch(raw) {
  const line = raw.split("\r\n").find((row) => row.startsWith("* SEARCH ")) ?? "";
  return line.replace("* SEARCH ", "").trim().split(/\s+/)
    .map(Number).filter((value) => Number.isSafeInteger(value) && value > 0);
}

function parseSeen(raw) {
  const match = raw.match(/FLAGS \(([^)]*)\)/i);
  if (!match) return null;
  return /\\Seen\b/i.test(match[1]);
}

function headerValue(raw, name) {
  const lines = raw.split("\r\n");
  const prefix = name.toLowerCase() + ":";
  let value = "";
  let collecting = false;
  for (const line of lines) {
    if (!collecting && line.toLowerCase().startsWith(prefix)) {
      value = line.slice(prefix.length).trim();
      collecting = true;
      continue;
    }
    if (collecting && /^[ \t]/.test(line)) {
      value += " " + line.trim();
      continue;
    }
    if (collecting) break;
  }
  return value;
}

function decodeMimeHeader(value) {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_m, charset, enc, data) => {
    try {
      let bytes;
      if (enc.toLowerCase() === "b") {
        const bin = atob(data);
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      } else {
        const qp = data.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_x, hex) =>
          String.fromCharCode(parseInt(hex, 16)));
        bytes = Uint8Array.from(qp, (c) => c.charCodeAt(0));
      }
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return data;
    }
  });
}

async function runProbe(env) {
  if (!env.IMAP_PASSWORD) throw new Error("IMAP_PASSWORD is not configured");
  const session = await ImapSession.open(env.IMAP_PASSWORD);
  try {
    const list = await session.command('LIST "" "*"');
    if (!list.ok) throw new Error("LIST failed");
    const folders = list.raw.split("\r\n").filter((line) => line.startsWith("* LIST "));
    const sent = findSentFolder(list.raw);
    if (!sent) {
      return { connected: true, folderCount: folders.length, sentFound: false,
        recentCount: 0, peekOk: false, seenChanged: null, readOnlyVerified: false };
    }

    const examined = await session.command(`EXAMINE ${quote(sent)}`);
    if (!examined.ok) throw new Error("EXAMINE failed");
    const search = await session.command(`UID SEARCH SINCE ${recentDate()}`);
    if (!search.ok) throw new Error("SEARCH failed");
    const uids = parseSearch(search.raw);
    if (!uids.length) {
      return { connected: true, folderCount: folders.length, sentFound: true,
        recentCount: 0, peekOk: false, seenChanged: null, readOnlyVerified: false };
    }
    const uid = uids[uids.length - 1];
    const before = await session.command(`UID FETCH ${uid} (FLAGS)`);
    const seenBefore = parseSeen(before.raw);
    const peek = await session.command(
      `UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (DATE)] RFC822.SIZE)`,
    );
    const after = await session.command(`UID FETCH ${uid} (FLAGS)`);
    const seenAfter = parseSeen(after.raw);
    const seenChanged = seenBefore !== null && seenAfter !== null
      ? seenBefore !== seenAfter : null;

    return {
      connected: true,
      folderCount: folders.length,
      sentFound: true,
      recentCount: uids.length,
      peekOk: peek.ok,
      seenChanged,
      readOnlyVerified: peek.ok && seenChanged === false,
    };
  } finally {
    await session.close();
  }
}

function extractFetchedLiteral(raw) {
  const marker = /\{\d+\}\r\n/.exec(raw);
  if (!marker || marker.index === undefined) {
    throw new Error("IMAP literal not found");
  }
  const start = marker.index + marker[0].length;
  const end = raw.lastIndexOf("\r\n)");
  if (end <= start) throw new Error("IMAP literal boundary not found");
  return raw.slice(start, end);
}

async function inspectMessage(env, uid) {
  if (!env.IMAP_PASSWORD) throw new Error("IMAP_PASSWORD is not configured");
  if (uid !== 708) throw new Error("UID is outside temporary inspection scope");
  const session = await ImapSession.open(env.IMAP_PASSWORD);
  try {
    const list = await session.command('LIST "" "*"');
    const sent = findSentFolder(list.raw);
    if (!sent) throw new Error("Sent folder not found");
    const examined = await session.command(`EXAMINE ${quote(sent)}`);
    if (!examined.ok) throw new Error("EXAMINE failed");

    const before = await session.command(`UID FETCH ${uid} (FLAGS)`);
    const seenBefore = parseSeen(before.raw);
    const fetched = await session.command(`UID FETCH ${uid} (BODY.PEEK[])`);
    if (!fetched.ok) throw new Error("Message fetch failed");
    const after = await session.command(`UID FETCH ${uid} (FLAGS)`);
    const seenAfter = parseSeen(after.raw);
    const parsed = await PostalMime.parse(extractFetchedLiteral(fetched.raw));
    return {
      parsed,
      readOnlyVerified: seenBefore !== null && seenAfter !== null && seenBefore === seenAfter,
    };
  } finally {
    await session.close();
  }
}

async function inspectRecent(env, limit = 20) {
  if (!env.IMAP_PASSWORD) throw new Error("IMAP_PASSWORD is not configured");
  const session = await ImapSession.open(env.IMAP_PASSWORD);
  try {
    const list = await session.command('LIST "" "*"');
    if (!list.ok) throw new Error("LIST failed");
    const sent = findSentFolder(list.raw);
    if (!sent) throw new Error("Sent folder not found");

    const examined = await session.command(`EXAMINE ${quote(sent)}`);
    if (!examined.ok) throw new Error("EXAMINE failed");

    const search = await session.command(`UID SEARCH SINCE ${recentDate(21)}`);
    if (!search.ok) throw new Error("SEARCH failed");
    const uids = parseSearch(search.raw).slice(-limit).reverse();
    const messages = [];

    for (const uid of uids) {
      const fetched = await session.command(
        `UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (SUBJECT DATE)] RFC822.SIZE)`,
      );
      if (!fetched.ok) continue;
      messages.push({
        uid,
        subject: decodeMimeHeader(headerValue(fetched.raw, "Subject")),
        date: headerValue(fetched.raw, "Date"),
      });
    }
    return { sentFolder: sent, count: messages.length, messages };
  } finally {
    await session.close();
  }
}

function plainFilename(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function looksLikeClosingSubject(subject) {
  const value = String(subject ?? "");
  return /(amanda|fechamento|caixa)/i.test(value) &&
    /\d{1,2}\s*\/\s*\d{1,2}/.test(value);
}

function findClosingAttachments(parsed) {
  let report = null;
  let bordero = null;
  for (const attachment of parsed.attachments ?? []) {
    const name = plainFilename(attachment.filename);
    if (!report && name.includes("relatorio gerencial") && name.endsWith(".xlsx")) {
      report = attachment;
    }
    if (!bordero && name.includes("bordero") && name.endsWith(".xlsm")) {
      bordero = attachment;
    }
  }
  return { report, bordero };
}

async function fetchParsedMessage(session, uid) {
  const before = await session.command(`UID FETCH ${uid} (FLAGS)`);
  const seenBefore = parseSeen(before.raw);
  const fetched = await session.command(`UID FETCH ${uid} (BODY.PEEK[])`);
  if (!fetched.ok) throw new Error("Message fetch failed");
  const after = await session.command(`UID FETCH ${uid} (FLAGS)`);
  const seenAfter = parseSeen(after.raw);
  return {
    parsed: await PostalMime.parse(extractFetchedLiteral(fetched.raw)),
    readOnlyVerified:
      seenBefore !== null && seenAfter !== null && seenBefore === seenAfter,
  };
}

async function runIngestion(env, days = 3, maxMessages = 20, offset = 0) {
  if (!env.IMAP_PASSWORD) throw new Error("IMAP_PASSWORD is not configured");
  if (!env.DB) throw new Error("D1 binding is not configured");
  const session = await ImapSession.open(env.IMAP_PASSWORD);
  const summary = {
    scanned: 0,
    candidates: 0,
    processed: [],
    skipped: 0,
    knownSkipped: 0,
    repairCandidates: 0,
    errors: [],
  };
  try {
    const list = await session.command('LIST "" "*"');
    const sent = findSentFolder(list.raw);
    if (!sent) throw new Error("Sent folder not found");
    const examined = await session.command(`EXAMINE ${quote(sent)}`);
    if (!examined.ok) throw new Error("EXAMINE failed");
    const search = await session.command(`UID SEARCH SINCE ${recentDate(days)}`);
    if (!search.ok) throw new Error("SEARCH failed");
    const allUids = parseSearch(search.raw).reverse();
    const uids = allUids.slice(offset, offset + maxMessages);
    summary.scanned += uids.length;

    const gate = await selectDualSinkMailboxUids({
      candidateUids: uids,
      loadKnownPrimary: (candidateUids) =>
        findKnownClosingUidsD1(env.DB, candidateUids),
      loadKnownMirror: (candidateUids) =>
        findKnownClosingUidsNeon(env.NEON_DATABASE_URL, candidateUids),
    });
    summary.knownSkipped += gate.known.length;
    summary.repairCandidates += gate.divergent.length;
    summary.skipped += gate.known.length;

    for (const uid of gate.unknown) {
      try {
        const header = await session.command(
          `UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (SUBJECT DATE)] RFC822.SIZE)`,
        );
        if (!header.ok) { summary.skipped += 1; continue; }
        const sizeMatch = header.raw.match(/RFC822\.SIZE\s+(\d+)/i);
        if (sizeMatch && Number(sizeMatch[1]) > 5_000_000) {
          summary.skipped += 1;
          continue;
        }
        const subject = decodeMimeHeader(headerValue(header.raw, "Subject"));
        if (!looksLikeClosingSubject(subject)) continue;
        summary.candidates += 1;

        const message = await fetchParsedMessage(session, uid);
        const { report, bordero } = findClosingAttachments(message.parsed);
        if (!report || !bordero) { summary.skipped += 1; continue; }

        const row = normalizeClosing({
          uid,
          subject,
          sentAt: message.parsed.date ?? headerValue(header.raw, "Date"),
          reportContent: report.content,
          borderoContent: bordero.content,
        });
        await upsertClosing(env.DB, row, message.readOnlyVerified);
        await upsertClosingNeon(
          env.NEON_DATABASE_URL,
          row,
          message.readOnlyVerified,
        );
        summary.processed.push({
          uid,
          businessDate: row.business_date,
          totalsMatch: row.totals_match,
          readOnlyVerified: message.readOnlyVerified,
          qualityFlags: row.quality_flags,
        });
      } catch (error) {
        summary.errors.push({ uid, error: safeError(error) });
      }
    }
    return summary;
  } finally {
    await session.close();
  }
}

async function runCaixaPulseIngestion(env, days = 21, maxMessages = 120) {
  if (!env.IMAP_PASSWORD) throw new Error("IMAP_PASSWORD is not configured");
  if (!env.DB) throw new Error("D1 binding is not configured");

  const session = await ImapSession.open(env.IMAP_PASSWORD);
  const summary = {
    scanned: 0,
    candidates: 0,
    processed: [],
    skipped: 0,
    knownSkipped: 0,
    degraded: 0,
    errors: [],
  };

  try {
    const inbox = "INBOX";
    const examined = await session.command(`EXAMINE ${quote(inbox)}`);
    if (!examined.ok) throw new Error("INBOX EXAMINE failed");
    const uidValidity =
      examined.raw.match(/\[UIDVALIDITY\s+(\d+)\]/i)?.[1] ?? "";
    if (!/^[1-9]\d*$/.test(uidValidity)) {
      throw new Error("UIDVALIDITY unavailable");
    }

    const search = await session.command(
      `UID SEARCH SINCE ${recentDate(days)} FROM "cesar.spichencoff@gmail.com" TO "atendimento@tatasushi.com.br"`,
    );
    if (!search.ok) throw new Error("CAIXA_PULSE_SEARCH_FAILED");

    const uids = parseSearch(search.raw).slice(-maxMessages).reverse();
    summary.scanned = uids.length;

    const headers = new Map();
    const matchingUids = [];

    for (const uid of uids) {
      const header = await session.command(
        `UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (SUBJECT DATE FROM TO)] RFC822.SIZE)`,
      );
      if (!header.ok) {
        summary.errors.push({
          uid: String(uid),
          error: "HEADER_FETCH_FAILED",
        });
        continue;
      }

      const subject = decodeMimeHeader(headerValue(header.raw, "Subject"));
      const sender = decodeMimeHeader(headerValue(header.raw, "From"));
      const recipient = decodeMimeHeader(headerValue(header.raw, "To"));
      if (!matchesCaixaPulseMail({
        subject,
        from: sender,
        to: recipient,
      })) {
        summary.skipped += 1;
        continue;
      }

      const rawSize = Number(
        header.raw.match(/RFC822\.SIZE\s+(\d+)/i)?.[1] ?? 0,
      );
      if (rawSize > 5_000_000) {
        summary.errors.push({
          uid: String(uid),
          error: "MESSAGE_TOO_LARGE",
        });
        continue;
      }

      headers.set(String(uid), {
        subject,
        date: headerValue(header.raw, "Date"),
      });
      matchingUids.push(uid);
    }

    summary.candidates = matchingUids.length;
    const known = new Set(
      await findKnownCaixaPulseUidsD1(
        env.DB,
        uidValidity,
        matchingUids,
      ),
    );
    const unknown = matchingUids.filter(
      (uid) => !known.has(String(uid)),
    );

    summary.knownSkipped = known.size;
    summary.skipped += known.size;

    for (const uid of unknown) {
      try {
        const meta = headers.get(String(uid));
        if (!meta) throw new Error("CAIXA_PULSE_HEADER_METADATA_MISSING");

        const message = await fetchParsedMessage(session, Number(uid));
        const record = parseCaixaPulseMessage({
          uid,
          uidValidity,
          subject: meta.subject,
          sentAt: message.parsed.date ?? meta.date,
          text: message.parsed.text ?? "",
          readOnlyVerified: message.readOnlyVerified,
        });

        await upsertCaixaPulseMessageD1(env.DB, record);

        if (record.source_health !== "HEALTHY") {
          summary.degraded += 1;
        }

        summary.processed.push({
          uid: String(uid),
          uidValidity,
          businessDate: record.business_date,
          shift: record.shift,
          sourceHealth: record.source_health,
          reportedTotal: record.reported_total,
          parsedTotal: record.parsed_total,
          readOnlyVerified: record.readonly_verified,
          qualityFlags: record.quality_flags,
        });
      } catch (error) {
        summary.errors.push({
          uid: String(uid),
          error: safeError(error),
        });
      }
    }

    return summary;
  } finally {
    await session.close();
  }
}

async function runIfoodReviewIngestion(env, days = 45, maxMessages = 100) {
  if (!env.IMAP_PASSWORD) throw new Error("IMAP_PASSWORD is not configured");
  if (!env.DB) throw new Error("D1 binding is not configured");

  const session = await ImapSession.open(env.IMAP_PASSWORD);
  const summary = {
    scanned: 0,
    candidates: 0,
    processed: [],
    skipped: 0,
    knownSkipped: 0,
    repairCandidates: 0,
    errors: [],
  };

  try {
    const list = await session.command('LIST "" "*"');
    if (!list.ok) throw new Error("LIST failed");
    const sent = findSentFolder(list.raw);
    if (!sent) throw new Error("Sent folder not found");

    const examined = await session.command(`EXAMINE ${quote(sent)}`);
    if (!examined.ok) throw new Error("SENT EXAMINE failed");
    const uidValidity = examined.raw.match(/\[UIDVALIDITY\s+(\d+)\]/i)?.[1] ?? "";
    if (!/^[1-9]\d*$/.test(uidValidity)) {
      throw new Error("UIDVALIDITY unavailable");
    }

    const search = await session.command(
      `UID SEARCH SINCE ${recentDate(days)} TO "cesar@tatasushi.com.br"`,
    );
    if (!search.ok) throw new Error("IFOOD SEARCH failed");

    const uids = parseSearch(search.raw).slice(-maxMessages).reverse();
    summary.scanned = uids.length;
    const headers = new Map();
    const matchingUids = [];

    for (const uid of uids) {
      const header = await session.command(
        `UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (SUBJECT DATE FROM TO MESSAGE-ID)] RFC822.SIZE)`,
      );
      if (!header.ok) {
        summary.errors.push({ uid: String(uid), error: "HEADER_FETCH_FAILED" });
        continue;
      }

      const subject = decodeMimeHeader(headerValue(header.raw, "Subject"));
      const sender = decodeMimeHeader(headerValue(header.raw, "From"));
      const recipient = decodeMimeHeader(headerValue(header.raw, "To"));
      if (!matchesIfoodReviewMail({
        subject,
        from: sender,
        to: recipient,
      })) {
        summary.skipped += 1;
        continue;
      }

      const rawSize = Number(
        header.raw.match(/RFC822\.SIZE\s+(\d+)/i)?.[1] ?? 0,
      );
      if (rawSize > 12_000_000) {
        summary.errors.push({ uid: String(uid), error: "MESSAGE_TOO_LARGE" });
        continue;
      }

      headers.set(String(uid), {
        uid: String(uid),
        subject,
        date: headerValue(header.raw, "Date"),
        from: sender,
        to: recipient,
        messageId: headerValue(header.raw, "Message-ID"),
        rawSize,
      });
      matchingUids.push(uid);
    }

    summary.candidates = matchingUids.length;
    const known = new Set(
      await findKnownIfoodReviewUidsD1(env.DB, uidValidity, matchingUids),
    );
    const unknown = matchingUids.filter((uid) => !known.has(String(uid)));

    summary.knownSkipped = known.size;
    summary.skipped += known.size;

    for (const uid of unknown) {
      try {
        const meta = headers.get(String(uid));
        if (!meta) throw new Error("IFOOD_HEADER_METADATA_MISSING");

        const message = await fetchParsedMessage(session, Number(uid));
        const row = buildIfoodReviewRecord({
          uid,
          uidValidity,
          subject: meta.subject,
          sentAt: message.parsed.date ?? meta.date,
          from: meta.from,
          to: meta.to,
          messageId: meta.messageId,
          rawSize: meta.rawSize,
          parsed: message.parsed,
          readOnlyVerified: message.readOnlyVerified,
        });

        const savedAttachments = await replaceIfoodReviewAttachmentsD1(
          env.DB,
          row,
        );
        await upsertIfoodReviewD1(env.DB, row);

        summary.processed.push({
          savedAttachments,
          uid: String(uid),
          uidValidity,
          subject: row.subject,
          extractionStatus: row.extraction_status,
          attachmentCount: row.attachment_count,
          readOnlyVerified: row.readonly_verified,
          qualityFlags: row.quality_flags,
        });
      } catch (error) {
        summary.errors.push({ uid: String(uid), error: safeError(error) });
      }
    }

    return summary;
  } finally {
    await session.close();
  }
}

export default {
  async fetch() {
    return new Response("Not available", {
      status: 404,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  },

  async scheduled(_controller, env) {
    try {
      const result = await runIngestion(env, 3, 20);
      console.log(JSON.stringify({
        event: "gerencial_mail_ingestion",
        at: new Date().toISOString(),
        scanned: result.scanned,
        candidates: result.candidates,
        processed: result.processed,
        skipped: result.skipped,
        knownSkipped: result.knownSkipped,
        repairCandidates: result.repairCandidates,
        errorCount: result.errors.length,
      }));
      if (result.errors.length) {
        console.warn(JSON.stringify({
          event: "gerencial_mail_ingestion_errors",
          errors: result.errors,
        }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "gerencial_mail_ingestion_error",
        at: new Date().toISOString(),
        error: safeError(error),
      }));
    }

    try {
      const result = await runCaixaPulseIngestion(env, 21, 120);
      console.log(JSON.stringify({
        event: "gerencial_caixa_pulse_ingestion",
        at: new Date().toISOString(),
        scanned: result.scanned,
        candidates: result.candidates,
        processed: result.processed,
        skipped: result.skipped,
        knownSkipped: result.knownSkipped,
        degraded: result.degraded,
        errorCount: result.errors.length,
      }));
      if (result.errors.length) {
        console.warn(JSON.stringify({
          event: "gerencial_caixa_pulse_ingestion_errors",
          errors: result.errors,
        }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "gerencial_caixa_pulse_ingestion_error",
        at: new Date().toISOString(),
        error: safeError(error),
      }));
    }

    try {
      const result = await runIfoodReviewIngestion(env, 45, 100);
      console.log(JSON.stringify({
        event: "gerencial_ifood_review_ingestion",
        at: new Date().toISOString(),
        scanned: result.scanned,
        candidates: result.candidates,
        processed: result.processed,
        skipped: result.skipped,
        knownSkipped: result.knownSkipped,
        repairCandidates: result.repairCandidates,
        errorCount: result.errors.length,
      }));
      if (result.errors.length) {
        console.warn(JSON.stringify({
          event: "gerencial_ifood_review_ingestion_errors",
          errors: result.errors,
        }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "gerencial_ifood_review_ingestion_error",
        at: new Date().toISOString(),
        error: safeError(error),
      }));
    }
  },
};
