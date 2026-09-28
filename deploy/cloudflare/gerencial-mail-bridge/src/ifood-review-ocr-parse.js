import {
  validateIfoodReviewVisualExtraction,
} from "./ifood-review-visual-extraction.js";

export const IFOOD_REVIEW_OCR_PARSE_VERSION =
  "ifood-review-ocr-parse@0.2.0";

const KNOWN_TAGS = Object.freeze([
  "Aparência",
  "Temperatura",
  "Embalagem",
  "Ponto de cozimento",
  "Ingredientes",
  "Sabor",
  "Quantidade",
]);

function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compact(value) {
  return fold(value).replace(/[^a-z0-9]/g, "");
}

function isoDateFromBr(value) {
  const match = String(value ?? "").match(
    /\b(\d{2})\/(\d{2})\/(\d{4})\b/,
  );
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const iso = `${yyyy}-${mm}-${dd}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== iso
  ) {
    return null;
  }
  return iso;
}

function cleanLeadingDecorations(value) {
  return String(value ?? "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
}

function sectionAfter(text, needle) {
  const index = fold(text).indexOf(fold(needle));
  return index >= 0 ? String(text).slice(index + needle.length) : String(text);
}

function beforeCustomerLine(text) {
  const lines = String(text).split(/\r?\n/);
  const index = lines.findIndex((line) => /\bdisse\b/i.test(fold(line)));
  return index >= 0 ? lines.slice(0, index).join("\n") : String(text);
}

function extractReviewIdentityAndText(fullText) {
  const lines = String(fullText).split(/\r?\n/);
  const customerLineIndex = lines.findIndex((line) =>
    /\bdisse\b/i.test(fold(line)) &&
    /(publica|privada)/i.test(fold(line))
  );
  if (customerLineIndex < 0) {
    return {
      customer_name: null,
      visibility: null,
      review_date: null,
      review_text: null,
    };
  }

  const customerLine = cleanLeadingDecorations(lines[customerLineIndex]);
  const disse = customerLine.search(/\bdisse\b/i);
  const customerName = disse > 0
    ? customerLine.slice(0, disse).trim()
    : null;

  const foldedLine = fold(customerLine);
  const visibility = foldedLine.includes("privada")
    ? "Privada"
    : foldedLine.includes("publica")
      ? "Pública"
      : null;

  const dateLineIndex = lines
    .slice(customerLineIndex + 1)
    .findIndex((line) => /^\s*em\s+\d{2}\/\d{2}\/\d{4}\s*$/i.test(line));
  if (dateLineIndex < 0) {
    return {
      customer_name: customerName,
      visibility,
      review_date: null,
      review_text: null,
    };
  }

  const absoluteDateIndex = customerLineIndex + 1 + dateLineIndex;
  const reviewDate = isoDateFromBr(lines[absoluteDateIndex]);
  const textLines = [];
  for (let i = absoluteDateIndex + 1; i < lines.length; i += 1) {
    const f = fold(lines[i]);
    if (
      f.includes("sua resposta foi enviada") ||
      f.includes("avaliacao concluida") ||
      f.includes("avaliagao concluida")
    ) {
      break;
    }
    textLines.push(lines[i]);
  }

  const reviewText = textLines.join("\n").trim() || null;
  return {
    customer_name: customerName || null,
    visibility,
    review_date: reviewDate,
    review_text: reviewText,
  };
}

function extractOptionalSection(fullText, markerPattern, endPatterns) {
  const lines = String(fullText).split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => markerPattern.test(fold(line)));
  if (markerIndex < 0) return { date: null, text: null };

  const dateOffset = lines
    .slice(markerIndex + 1)
    .findIndex((line) => /^\s*em\s+\d{2}\/\d{2}\/\d{4}\s*$/i.test(line));
  if (dateOffset < 0) return { date: null, text: null };

  const dateIndex = markerIndex + 1 + dateOffset;
  const date = isoDateFromBr(lines[dateIndex]);
  const textLines = [];
  for (let i = dateIndex + 1; i < lines.length; i += 1) {
    const f = fold(lines[i]);
    if (endPatterns.some((pattern) => pattern.test(f))) break;
    textLines.push(lines[i]);
  }
  const text = textLines
    .join("\n")
    .replace(/\s+Editar\s*$/i, "")
    .trim() || null;
  return { date, text };
}

function extractCompletionDate(fullText) {
  const lines = String(fullText).split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => {
    const f = fold(line);
    return f.includes("avaliacao concluida") || f.includes("avaliagao concluida");
  });
  if (markerIndex < 0) return null;
  for (let i = markerIndex + 1; i < Math.min(lines.length, markerIndex + 4); i += 1) {
    const date = isoDateFromBr(lines[i]);
    if (date) return date;
  }
  return null;
}

function extractOrderIdFromFullText(fullText) {
  const lines = String(fullText ?? "").split(/\r?\n/);
  const markerIndex = lines.findIndex((line) =>
    fold(line).includes("pedido feito em")
  );
  if (markerIndex < 0) return null;

  const bounded = lines
    .slice(markerIndex, Math.min(lines.length, markerIndex + 4))
    .join(" ");
  return bounded.match(/\b(\d{3,30})\b/)?.[1] ?? null;
}

function parseOrderDateCrop(orderHeaderText) {
  const value = String(orderHeaderText ?? "");
  const rawDate = value.match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0] ?? null;
  const orderDate = isoDateFromBr(rawDate);
  return {
    order_date: orderDate,
    invalid_order_date_ocr: Boolean(rawDate && !orderDate),
  };
}

function parseRatingAndTags(fullText) {
  const orderBlock = beforeCustomerLine(sectionAfter(fullText, "Sobre o pedido"));
  const ratingMatch = orderBlock.match(/(^|\D)([1-5])(?!\d)/m);
  const rating = ratingMatch ? Number(ratingMatch[2]) : null;
  const compactBlock = compact(orderBlock);
  const tags = KNOWN_TAGS.filter((tag) => compactBlock.includes(compact(tag)));

  return {
    rating,
    improvement_tags: tags.length ? tags : null,
  };
}

export function parseIfoodReviewOcr({
  attachment_index,
  full_text,
  order_header_text,
}) {
  const orderId = extractOrderIdFromFullText(full_text);
  const orderDate = parseOrderDateCrop(order_header_text);
  const ratingTags = parseRatingAndTags(full_text);
  const review = extractReviewIdentityAndText(full_text);
  const response = extractOptionalSection(
    full_text,
    /sua resposta foi enviada/i,
    [/avaliacao concluida/i, /avaliagao concluida/i],
  );
  const completionDate = extractCompletionDate(full_text);

  const candidate = {
    attachment_index,
    extraction_method: "OCR",
    verification_status: "UNVERIFIED",
    visible_fields: [],
    order_id: orderId,
    order_date: orderDate.order_date,
    rating: ratingTags.rating,
    improvement_tags: ratingTags.improvement_tags,
    customer_name: review.customer_name,
    review_date: review.review_date,
    visibility: review.visibility,
    review_text: review.review_text,
    merchant_response_date: response.date,
    merchant_response_text: response.text,
    completion_date: completionDate,
  };

  for (const field of [
    "order_id",
    "order_date",
    "rating",
    "improvement_tags",
    "customer_name",
    "review_date",
    "visibility",
    "review_text",
    "merchant_response_date",
    "merchant_response_text",
    "completion_date",
  ]) {
    if (candidate[field] !== null) candidate.visible_fields.push(field);
  }

  const validated = validateIfoodReviewVisualExtraction(candidate);
  return {
    parser_version: IFOOD_REVIEW_OCR_PARSE_VERSION,
    ...validated,
    quality_flags: [
      ...(orderDate.invalid_order_date_ocr ? ["INVALID_ORDER_DATE_OCR"] : []),
      ...(ratingTags.improvement_tags === null ? ["TAGS_NOT_MAPPED"] : []),
    ],
    raw_ocr_retained_by_source: true,
    automatic_promotion_allowed: false,
  };
}
