export const CAIXA_PULSE_SENDER = "cesar.spichencoff@gmail.com";
export const CAIXA_PULSE_RECIPIENT = "atendimento@tatasushi.com.br";

const CATEGORY_DOMAIN = new Map([
  ["problema no delivery", "DELIVERY"],
  ["reclamação de cliente", "CUSTOMER_VOICE"],
  ["reclamacao de cliente", "CUSTOMER_VOICE"],
  ["falha no ifood", "PLATFORM"],
  ["problema no salão", "SALON"],
  ["problema no salao", "SALON"],
  ["problema na cozinha", "KITCHEN"],
  ["problema no sushi", "SUSHI"],
  ["problema no caixa", "CASHIER"],
]);

function emailAddresses(value) {
  return [...String(value ?? "").toLowerCase().matchAll(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g,
  )].map((match) => match[0]);
}

export function matchesCaixaPulseMail({ subject, from, to }) {
  return parseCaixaPulseSubject(subject) !== null &&
    emailAddresses(from).includes(CAIXA_PULSE_SENDER) &&
    emailAddresses(to).includes(CAIXA_PULSE_RECIPIENT);
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function normalizedLabel(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isoDateFromSubject(day, month, year) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseCaixaPulseSubject(subject) {
  const value = String(subject ?? "").trim();
  const match = value.match(
    /Caixa\s+Pulse\s*\|\s*Fechamento\s*\|\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\|\s*(Manh[aã]|Noite)/i,
  );
  if (!match) return null;

  return {
    business_date: isoDateFromSubject(match[1], match[2], match[3]),
    shift: normalizedLabel(match[4]).startsWith("manha") ? "MANHA" : "NOITE",
  };
}

function occurrenceCategoryFromLine(line) {
  const key = String(line ?? "").trim();
  const typed = key.match(/^Tipo:\s*(.+)$/i);
  const category = (typed?.[1] ?? key).trim();
  if (CATEGORY_DOMAIN.has(category.toLowerCase())) return category;
  return /^(problema|falha|reclama[cç][aã]o|ocorr[eê]ncia)\b/i.test(category)
    ? category
    : null;
}

function domainForCategory(category) {
  return CATEGORY_DOMAIN.get(String(category).trim().toLowerCase()) ?? "OTHER";
}

function parseOperatorStatus(line) {
  const match = String(line ?? "").match(
    /^Operador:\s*(.*?)\s*\|\s*Status:\s*(.*?)\s*$/i,
  );
  if (!match) return null;
  return {
    operator: match[1].trim(),
    status: match[2].trim(),
  };
}

function appendValue(current, value) {
  const next = String(value ?? "").trim();
  if (!next) return current;
  return current ? `${current}\n${next}` : next;
}

function parseOccurrences(lines) {
  const occurrences = [];
  let current = null;
  let activeField = null;

  function flush() {
    if (!current) return;
    occurrences.push({
      occurrence_index: occurrences.length,
      domain: domainForCategory(current.category),
      category: current.category,
      operator: current.operator,
      status: current.status,
      reference: current.reference,
      happened_text: current.happened_text,
      action_text: current.action_text,
    });
    current = null;
    activeField = null;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^Planilha(?:\s+completa)?:/i.test(line)) break;

    const category = occurrenceCategoryFromLine(line);
    if (category) {
      flush();
      current = {
        category,
        operator: "",
        status: "",
        reference: "",
        happened_text: "",
        action_text: "",
      };
      continue;
    }

    if (!current) continue;

    const operatorStatus = parseOperatorStatus(line);
    if (operatorStatus) {
      current.operator = operatorStatus.operator;
      current.status = operatorStatus.status;
      activeField = null;
      continue;
    }

    let match = line.match(/^Pedido\s*\/\s*Mesa\s*\/\s*Refer[eê]ncia:\s*(.*)$/i);
    if (match) {
      current.reference = match[1].trim();
      activeField = "reference";
      continue;
    }

    match = line.match(/^O que aconteceu:\s*(.*)$/i);
    if (match) {
      current.happened_text = match[1].trim();
      activeField = "happened_text";
      continue;
    }

    match = line.match(/^A[cç][aã]o tomada:\s*(.*)$/i);
    if (match) {
      current.action_text = match[1].trim();
      activeField = "action_text";
      continue;
    }

    if (activeField === "happened_text") {
      current.happened_text = appendValue(current.happened_text, line);
    } else if (activeField === "action_text") {
      current.action_text = appendValue(current.action_text, line);
    } else if (activeField === "reference") {
      current.reference = appendValue(current.reference, line);
    }
  }

  flush();
  return occurrences;
}

export function parseCaixaPulseMessage({
  uid,
  uidValidity,
  subject,
  sentAt,
  text,
  readOnlyVerified,
}) {
  const source = parseCaixaPulseSubject(subject);
  if (!source) throw new Error("CAIXA_PULSE_SUBJECT_INVALID");

  const mailboxUid = Number(uid);
  if (!Number.isSafeInteger(mailboxUid) || mailboxUid <= 0) {
    throw new Error("CAIXA_PULSE_UID_INVALID");
  }

  const validity = String(uidValidity ?? "").trim();
  if (!/^[1-9]\d*$/.test(validity)) {
    throw new Error("CAIXA_PULSE_UIDVALIDITY_INVALID");
  }

  const sent = new Date(sentAt);
  if (!Number.isFinite(sent.getTime())) {
    throw new Error("CAIXA_PULSE_SENT_AT_INVALID");
  }

  const body = normalizeText(text);
  const section = body.match(
    /Ocorr[eê]ncias(?:\s+em aberto\s*\/\s*registradas|\s+do turno)([\s\S]*?)(?:Planilha(?:\s+completa)?:|$)/i,
  );
  if (!section) throw new Error("CAIXA_PULSE_OCCURRENCE_SECTION_MISSING");

  const totals = section[1].match(
    /Total:\s*(\d+)\s*(?:\|\s*)?Em aberto:\s*(\d+)/i,
  );
  if (!totals) throw new Error("CAIXA_PULSE_TOTALS_MISSING");

  const reportedTotal = Number(totals[1]);
  const openTotal = Number(totals[2]);
  const afterTotals = section[1].slice(
    (totals.index ?? 0) + totals[0].length,
  );
  const lines = normalizeText(afterTotals).split("\n");
  const occurrences = parseOccurrences(lines);
  const explicitNone = /Nenhuma ocorr[eê]ncia registrada para este turno\./i
    .test(afterTotals);

  const qualityFlags = [];
  if (occurrences.length !== reportedTotal) {
    qualityFlags.push("REPORTED_TOTAL_MISMATCH");
  }
  if (reportedTotal === 0 && !explicitNone) {
    qualityFlags.push("ZERO_WITHOUT_EXPLICIT_NONE");
  }
  if (openTotal > reportedTotal) {
    qualityFlags.push("OPEN_TOTAL_EXCEEDS_REPORTED_TOTAL");
  }
  if (!readOnlyVerified) {
    qualityFlags.push("READONLY_NOT_VERIFIED");
  }

  const structuralHealthy =
    occurrences.length === reportedTotal &&
    openTotal <= reportedTotal &&
    (reportedTotal > 0 || explicitNone);

  return {
    mailbox_key: `${validity}:${mailboxUid}`,
    uid_validity: validity,
    mailbox_uid: mailboxUid,
    business_date: source.business_date,
    shift: source.shift,
    message_sent_at: sent.toISOString(),
    reported_total: reportedTotal,
    parsed_total: occurrences.length,
    open_total: openTotal,
    explicit_none: explicitNone,
    source_health:
      structuralHealthy && readOnlyVerified ? "HEALTHY" : "DEGRADED",
    readonly_verified: Boolean(readOnlyVerified),
    body_char_count: body.length,
    quality_flags: qualityFlags,
    occurrences,
  };
}

export function looksLikeCaixaPulseSubject(subject) {
  return parseCaixaPulseSubject(subject) !== null;
}
