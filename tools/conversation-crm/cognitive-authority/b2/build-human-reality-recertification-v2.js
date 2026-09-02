#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REQUIRED_EVIDENCE = Object.freeze([
  'PRE_FIX_TRACE_EVIDENCE.json',
  'REPLAY_TRANSCRIPT.json',
  'TRACE_EVIDENCE.json',
  'PARAPHRASE_PROOF.json',
  'HOTFIX_TECHNICAL_EVIDENCE.json'
]);

const INSTRUCTIONS = `# TARGETED RECERTIFICATION — B2 HUMAN REALITY HOTFIX V2

Atue como certificador independente. Use exclusivamente a evidência congelada deste pacote. Não execute o sistema, não gere novas respostas e não altere os arquivos.

Primeiro leia somente REPLAY_TRANSCRIPT.json e PARAPHRASE_PROOF.json. Julgue a experiência humana pelos critérios UNDERSTANDING, CONTEXT_CONTINUITY, GOAL_PROGRESS, CUSTOMER_EFFORT, REPAIR, FACTUALITY e NATURALNESS. Congele esse julgamento antes de abrir os traces.

Depois audite TRACE_EVIDENCE.json e PRE_FIX_TRACE_EVIDENCE.json. Para cada falha material, identifique a primeira divergência na cadeia pública: mensagem e estado público → planner → relação/reparo/referência → capacidade e consulta → resultado autorizado → commitments → Writer/fallback → Validator → publicação.

O escopo é somente a correção das falhas observadas na conversa humana e a generalização demonstrada pelas cinco paráfrases congeladas. Não extrapole para validação integral do produto, não trate estado privado como conhecimento do chatbot e não costure os dois replays como uma única conversa.

Confirme especialmente que uma consulta factual só utiliza resultado vinculado à intenção, entidade e filtros atuais; que preço do rodízio não reutiliza preços de itens anteriores; que nenhuma frase ou link de cardápio duplica; e que ausência de fato autorizado produz um desconhecido específico, não uma invenção.

HOTFIX_TECHNICAL_EVIDENCE.json serve apenas para identidade do runtime, hashes e testes. O trabalho de certificação deve se apoiar no conteúdo público e nos traces congelados, não em conclusões do implementador.
`;

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || argv[index + 1] === undefined) throw new Error('V2_BUILD_ARGUMENTS_INVALID');
    result[argv[index].slice(2)] = argv[index + 1];
  }
  if (!result['evidence-dir'] || !result['output-dir']) throw new Error('V2_BUILD_PATHS_REQUIRED');
  return result;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files, zipPath) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (8 << 5) | 13;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = file.bytes;
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(zipPath, Buffer.concat([...localParts, directory, end]), { flag: 'wx' });
}

function checkedEvidence(root, name) {
  const absolute = path.join(root, name);
  const bytes = fs.readFileSync(absolute);
  JSON.parse(bytes.toString('utf8'));
  return { name, bytes };
}

function assertCounts(files) {
  const replay = JSON.parse(files.find((file) => file.name === 'REPLAY_TRANSCRIPT.json').bytes);
  const paraphrases = JSON.parse(files.find((file) => file.name === 'PARAPHRASE_PROOF.json').bytes);
  if (replay.public_turn_count !== 16 || replay.customer_turn_count !== 8) throw new Error('V2_REPLAY_COUNT_INVALID');
  if (paraphrases.customer_turn_count !== 5 || paraphrases.public_turn_count !== 10) throw new Error('V2_PARAPHRASE_COUNT_INVALID');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidenceRoot = path.resolve(args['evidence-dir']);
  const outputRoot = path.resolve(args['output-dir']);
  const zipPath = `${outputRoot}.zip`;
  const hashPath = `${zipPath}.sha256`;
  if (fs.existsSync(outputRoot) || fs.existsSync(zipPath) || fs.existsSync(hashPath)) throw new Error('V2_OUTPUT_ALREADY_EXISTS');

  const files = REQUIRED_EVIDENCE.map((name) => checkedEvidence(evidenceRoot, name));
  assertCounts(files);
  files.unshift({ name: 'TARGETED_RECERTIFIER_INSTRUCTIONS.md', bytes: Buffer.from(INSTRUCTIONS, 'utf8') });
  const manifest = {
    schema_version: 'deliveryos-targeted-recertification-human-reality-v2',
    packet_scope: 'FROZEN_HUMAN_REPLAY_AND_TARGETED_PARAPHRASES_ONLY',
    independent_certification_required: true,
    self_certification_included: false,
    external_action_performed: false,
    external_spend_brl: 0,
    files: files.map((file) => ({ path: file.name, sha256: sha256(file.bytes), bytes: file.bytes.length }))
  };
  const manifestFile = { name: 'MANIFEST.json', bytes: jsonBytes(manifest) };
  const packetFiles = [manifestFile, ...files];
  fs.mkdirSync(outputRoot, { recursive: false });
  for (const file of packetFiles) fs.writeFileSync(path.join(outputRoot, file.name), file.bytes, { flag: 'wx' });
  storedZip(packetFiles, zipPath);
  const zipBytes = fs.readFileSync(zipPath);
  const digest = sha256(zipBytes);
  fs.writeFileSync(hashPath, `${digest}  ${path.basename(zipPath)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ output_dir: outputRoot, zip: zipPath, sha256: digest, files: packetFiles.length })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}

