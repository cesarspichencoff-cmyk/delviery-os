import { unzipSync } from "fflate";

const decoder = new TextDecoder();

function xmlText(bytes) {
  if (!bytes) throw new Error("OOXML part not found");
  return decoder.decode(bytes);
}

function unescapeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(source, name) {
  const match = String(source).match(
    new RegExp("(?:^|\\s)" + name + '="([^"]*)"'),
  );
  return match ? unescapeXml(match[1]) : "";
}
function normalizeTarget(target) {
  let value = target.replace(/\\/g, "/");
  value = value.replace(/^\//, "");
  if (value.startsWith("xl/")) return value;
  return "xl/" + value.replace(/^\.\//, "");
}

function workbookSheetMap(files) {
  const workbook = xmlText(files["xl/workbook.xml"]);
  const rels = xmlText(files["xl/_rels/workbook.xml.rels"]);
  const relationships = new Map();

  for (const match of rels.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const attrs = match[1];
    const id = attr(attrs, "Id");
    const target = attr(attrs, "Target");
    if (id && target) relationships.set(id, normalizeTarget(target));
  }

  const sheets = new Map();
  for (const match of workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)) {
    const attrs = match[1];
    const name = attr(attrs, "name");
    const relId = attr(attrs, "r:id");
    const target = relationships.get(relId);
    if (name && target) sheets.set(name, target);
  }
  return sheets;
}
function sharedStrings(files) {
  const part = files["xl/sharedStrings.xml"];
  if (!part) return [];
  const xml = xmlText(part);
  const values = [];

  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const body = match[1];
    let value = "";
    for (const text of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
      value += unescapeXml(text[1]);
    }
    values.push(value);
  }
  return values;
}

function inlineString(body) {
  let value = "";
  for (const text of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
    value += unescapeXml(text[1]);
  }
  return value;
}
function cellValue(type, body, strings) {
  if (type === "inlineStr") return inlineString(body);
  const valueMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  if (!valueMatch) return null;
  const raw = unescapeXml(valueMatch[1]);

  if (type === "s") {
    const index = Number(raw);
    return Number.isInteger(index) ? strings[index] ?? "" : "";
  }
  if (type === "b") return raw === "1";
  if (type === "str" || type === "e") return raw;

  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

function parseRequestedCells(sheetXml, requested, strings) {
  const wanted = new Set(requested.map((ref) => ref.toUpperCase()));
  const result = Object.fromEntries([...wanted].map((ref) => [ref, null]));

  const cellPattern = /<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  for (const match of sheetXml.matchAll(cellPattern)) {
    const attrs = match[1] ?? match[2] ?? "";
    const body = match[3] ?? "";
    const ref = attr(attrs, "r").toUpperCase();
    if (!wanted.has(ref)) continue;
    const type = attr(attrs, "t");
    result[ref] = cellValue(type, body, strings);
  }
  return result;
}
export function listSheets(content) {
  const bytes = content instanceof Uint8Array
    ? content
    : content instanceof ArrayBuffer
      ? new Uint8Array(content)
      : ArrayBuffer.isView(content)
        ? new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
        : null;
  if (!bytes) throw new Error("Attachment content is not binary");
  const files = unzipSync(bytes);
  return [...workbookSheetMap(files).keys()];
}

export function readCells(content, sheetName, refs) {
  const bytes = content instanceof Uint8Array
    ? content
    : content instanceof ArrayBuffer
      ? new Uint8Array(content)
      : ArrayBuffer.isView(content)
        ? new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
        : null;

  if (!bytes) throw new Error("Attachment content is not binary");
  const files = unzipSync(bytes);
  const sheets = workbookSheetMap(files);
  const target = sheets.get(sheetName);
  if (!target) throw new Error("Sheet not found: " + sheetName);

  const sheet = xmlText(files[target]);
  const strings = sharedStrings(files);
  return parseRequestedCells(sheet, refs, strings);
}
