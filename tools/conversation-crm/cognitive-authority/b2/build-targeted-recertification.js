#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { B2Pipeline } = require('./pipeline');
const { FunctionPlannerAdapter } = require('./planner-port');
const { DeterministicB2Writer } = require('./writer');
const { PLAN_SCHEMA, COMMITMENT_KINDS, canonicalHash } = require('./contract');

const TARGETED_ROUNDS = Object.freeze({
  F001: [1, 2], F002: [1, 2], F003: [1], F004: [1, 2],
  F005: [1, 2], F006: [1, 2], F007: [1, 2], F008: [1, 2],
  F009: [1, 2], F010: [1, 2], F011: [1, 2], F012: [1, 2]
});

const TARGETED_COMMITMENTS = Object.freeze({
  'F001-R1': [{ kind: 'CONSTRAINT', content: 'algo empanado, sem peixe cru, para uma pessoa' }],
  'F001-R2': [{ kind: 'CONSTRAINT', content: 'algo empanado, sem peixe cru, para uma pessoa' }],
  'F002-R1': [
    { kind: 'CONSTRAINT', content: 'pedido para quatro adultos hoje às oito' },
    { kind: 'CONSTRAINT', content: 'opções sem peixe cru para uma pessoa' }
  ],
  'F002-R2': [
    { kind: 'CONSTRAINT', content: 'pedido para quatro pessoas hoje às oito' },
    { kind: 'CONSTRAINT', content: 'opções sem peixe cru' }
  ],
  'F003-R1': [],
  'F004-R1': [{ kind: 'CONSTRAINT', content: 'parte da criança simples, sem pimenta e separada' }],
  'F004-R2': [{ kind: 'CONSTRAINT', content: 'parte da criança simples, sem pimenta e separada' }],
  'F005-R1': [
    { kind: 'CONSTRAINT', content: 'alergia a crustáceos' },
    { kind: 'CONSTRAINT', content: 'informação sobre ingredientes e contato cruzado antes de escolher' }
  ],
  'F005-R2': [
    { kind: 'CONSTRAINT', content: 'alergia a crustáceos' },
    { kind: 'CONSTRAINT', content: 'confirmação de ingredientes e contato cruzado antes de escolher' }
  ],
  'F006-R1': [{ kind: 'GOAL', content: 'corrigir somente o número sem duplicar pedido ou cobrança' }],
  'F006-R2': [{ kind: 'GOAL', content: 'corrigir somente o número sem duplicar pedido ou cobrança' }],
  'F007-R1': [
    { kind: 'CONSTRAINT', content: 'opção para duas pessoas' },
    { kind: 'CONSTRAINT', content: 'itens vegetarianos e custo contido' }
  ],
  'F007-R2': [
    { kind: 'CONSTRAINT', content: 'opção para duas pessoas com variedade' },
    { kind: 'CONSTRAINT', content: 'itens vegetarianos' }
  ],
  'F008-R1': [{ kind: 'GOAL', content: 'previsão concreta para decidir se ainda espera' }],
  'F008-R2': [{ kind: 'GOAL', content: 'previsão concreta para decidir se ainda espera' }],
  'F009-R1': [
    { kind: 'CONSTRAINT', content: 'aniversário daqui a dois dias' },
    { kind: 'CONSTRAINT', content: 'planejamento para cinco ou sete adultos' }
  ],
  'F009-R2': [
    { kind: 'CONSTRAINT', content: 'aniversário daqui a dois dias' },
    { kind: 'CONSTRAINT', content: 'opções e quantidades para cinco e sete adultos' }
  ],
  'F010-R1': [{ kind: 'GOAL', content: 'confirmar o horário limite de retirada hoje antes de escolher os itens' }],
  'F010-R2': [{ kind: 'GOAL', content: 'confirmar o horário limite de retirada hoje antes de fechar os itens' }],
  'F011-R1': [
    { kind: 'CONSTRAINT', content: 'opção compartilhável para três pessoas' },
    { kind: 'CONSTRAINT', content: 'peixe cru, itens quentes e alternativa sem fritura' }
  ],
  'F011-R2': [
    { kind: 'CONSTRAINT', content: 'opção compartilhável para três pessoas' },
    { kind: 'CONSTRAINT', content: 'peixe cru, itens quentes e alternativa sem fritura' }
  ],
  'F012-R1': [{ kind: 'GOAL', content: 'conferir o conteúdo antes de afirmar que falta algum item' }],
  'F012-R2': [{ kind: 'GOAL', content: 'conferir o conteúdo antes de afirmar que falta algum item' }]
});

const INSTRUCTIONS = `# TARGETED RECERTIFICATION — B2 POST-CERTIFICATION RECOVERY

Atue como certificador independente. Use exclusivamente os arquivos deste pacote.

Cada unidade é um replay limitado sobre o contexto público congelado indicado. Não costure unidades em uma nova conversa contínua: turnos posteriores do Customer Actor foram condicionados às respostas antigas.

Audite somente as duas correções em escopo:

1. NEEDS_TOOL: verifique se a publicação usa resultado autorizado quando ele existe e, quando não existe, comunica limitação explícita ou faz uma pergunta concreta sem prometer consulta, retorno ou espera sem mudança verificável de estado.
2. Continuidade semântica: verifique se cada required_response_commitment e cada repair, referência ou pergunta aplicável sobrevive em Conversation Plan → Approved Response Plan → Writer/fallback → Validator → Published Response.

Também confirme que nenhum texto publicado inventa fato, preço, disponibilidade, ação, segurança ou autoridade. Identifique a primeira divergência por unidade quando houver. Não extrapole para cenários ou rounds fora do pacote.
`;

function argsFrom(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error('TARGETED_BUILD_ARGUMENTS_INVALID');
    args[name.slice(2)] = value;
  }
  if (!args['source-zip'] || !args['output-dir']) throw new Error('TARGETED_BUILD_PATHS_REQUIRED');
  return args;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileEvidence(filePath) {
  const bytes = fs.readFileSync(filePath);
  return { path: path.basename(filePath), sha256: sha256(bytes), bytes: bytes.length };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function safeArchiveEntries(sourceZip) {
  const names = execFileSync('tar', ['-tf', sourceZip], { encoding: 'utf8', windowsHide: true })
    .split(/\r?\n/u).map((name) => name.trim()).filter(Boolean);
  const seen = new Set();
  for (const name of names) {
    const normalized = name.replace(/\\/gu, '/');
    if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized)
      || normalized.split('/').includes('..') || seen.has(normalized)) {
      throw new Error('TARGETED_SOURCE_ARCHIVE_UNSAFE');
    }
    seen.add(normalized);
  }
  return names;
}

function verifySource(extractedRoot, archiveEntries) {
  const manifestPath = path.join(extractedRoot, 'MANIFEST.json');
  const manifest = readJson(manifestPath);
  const declared = new Set(['MANIFEST.json']);
  for (const file of manifest.files || []) {
    const target = path.join(extractedRoot, file.path);
    const evidence = fileEvidence(target);
    if (evidence.sha256 !== file.sha256 || evidence.bytes !== file.bytes) {
      throw new Error(`TARGETED_SOURCE_HASH_MISMATCH:${file.path}`);
    }
    declared.add(file.path);
  }
  if (archiveEntries.some((entry) => !declared.has(entry)) || archiveEntries.length !== declared.size) {
    throw new Error('TARGETED_SOURCE_MANIFEST_SCOPE_MISMATCH');
  }
  return { manifest, manifest_sha256: fileEvidence(manifestPath).sha256 };
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
    const name = Buffer.from(file.path.replace(/\\/gu, '/'), 'utf8');
    const data = fs.readFileSync(file.absolute_path);
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
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  fs.writeFileSync(zipPath, Buffer.concat([...localParts, centralDirectory, end]));
}

function sourceRound(publicScenario, internalScenario, round) {
  const currentIndex = (round - 1) * 2;
  const currentTurn = publicScenario.complete_public_transcript[currentIndex];
  if (!currentTurn || currentTurn.speaker !== 'CUSTOMER') throw new Error('TARGETED_PUBLIC_TURN_MISSING');
  const internalRound = internalScenario.rounds.find((item) => item.round === round);
  if (!internalRound) throw new Error('TARGETED_INTERNAL_ROUND_MISSING');
  return { currentIndex, currentTurn, internalRound };
}

async function buildUnits(sourceRoot) {
  const publicScenarios = readJson(path.join(sourceRoot, 'PHASE1_PUBLIC_CONVERSATIONS.json'));
  const internalScenarios = readJson(path.join(sourceRoot, 'PHASE2_INTERNAL_EVIDENCE.json'));
  const authorityPolicy = readJson(path.join(sourceRoot, 'PHASE2_AUTHORITY_POLICY.json'));
  const capabilities = readJson(path.join(sourceRoot, 'PHASE2_AUTHORIZED_CAPABILITIES.json'));
  const inputs = [];
  const outputs = [];
  for (const [scenarioId, rounds] of Object.entries(TARGETED_ROUNDS)) {
    const publicScenario = publicScenarios.find((item) => item.scenario_id === scenarioId);
    const internalScenario = internalScenarios.find((item) => item.scenario_id === scenarioId);
    if (!publicScenario || !internalScenario) throw new Error(`TARGETED_SCENARIO_MISSING:${scenarioId}`);
    for (const round of rounds) {
      const unitId = `${scenarioId}-R${round}`;
      const { currentIndex, currentTurn, internalRound } = sourceRound(publicScenario, internalScenario, round);
      const plan = structuredClone(internalRound.conversation_plan);
      plan.required_response_commitments = structuredClone(TARGETED_COMMITMENTS[unitId] || []);
      const publicContext = publicScenario.complete_public_transcript.slice(0, currentIndex);
      const plannerPacket = {
        transcript: publicContext.map((turn) => ({ role: turn.speaker === 'CUSTOMER' ? 'user' : 'assistant', text: turn.text })),
        compact_state: null,
        references: {},
        confirmed_facts: [],
        available_capabilities: capabilities.capabilities.map((item) => item.id),
        limits: ['FROZEN_EVIDENCE_ONLY', 'NO_EXTERNAL_ACTION', 'NO_NEW_SCENARIO'],
        safety_state: plan.safety_priority,
        current_message: currentTurn.text
      };
      const planner = new FunctionPlannerAdapter({
        adapter_id: 'targeted-b2-post-certification-bounded-replay',
        plan() { return plan; }
      });
      const pipeline = new B2Pipeline({ planner, writer: new DeterministicB2Writer() });
      const output = await pipeline.execute({
        planner_packet: plannerPacket,
        authority_context: authorityPolicy,
        previous_publication: null
      });
      if (!output.accepted) throw new Error(`TARGETED_REPLAY_NOT_PUBLISHED:${unitId}:${output.reason}`);
      inputs.push({
        unit_id: unitId,
        scenario_id: scenarioId,
        source_round: round,
        bounded_replay_unit: true,
        public_context_before_current_turn: publicContext,
        current_customer_turn: currentTurn.text,
        authority_policy_ref: 'SOURCE_PHASE2_AUTHORITY_POLICY.json',
        authorized_capabilities_ref: 'SOURCE_PHASE2_AUTHORIZED_CAPABILITIES.json',
        conversation_plan: plan,
        planner_packet_hash: output.planner_packet_hash,
        previous_publication: null
      });
      outputs.push({
        unit_id: unitId,
        scenario_id: scenarioId,
        source_round: round,
        accepted: output.accepted,
        stage: output.stage,
        response: output.response,
        response_hash: output.response_hash,
        writer_source: output.writer_source,
        writer_limit: output.writer_limit,
        progress_state_hash: output.progress_state_hash,
        approved_response_plan: output.response_plan,
        public_text_scan: { accepted: !/\b(?:fixture|oracle|gold|fonte sint[eé]tica|dado sint[eé]tico)\b/iu.test(output.response) }
      });
    }
  }
  return { authorityPolicy, capabilities, inputs, outputs };
}

function assertPacketBoundary(files) {
  const forbidden = /(?:expected_result|builder_recommendation|\bscore\b|\bverdict\b|private_actor_state|oracle|gold)/iu;
  for (const file of files) {
    const text = fs.readFileSync(file.absolute_path, 'utf8');
    if (forbidden.test(text)) throw new Error(`TARGETED_PACKET_BOUNDARY_VIOLATION:${file.path}`);
  }
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  const sourceZip = path.resolve(args['source-zip']);
  const outputDir = path.resolve(args['output-dir']);
  const zipPath = `${outputDir}.zip`;
  const hashPath = `${zipPath}.sha256`;
  if (!fs.existsSync(sourceZip)) throw new Error('TARGETED_SOURCE_ZIP_NOT_FOUND');
  if (fs.existsSync(outputDir) || fs.existsSync(zipPath) || fs.existsSync(hashPath)) {
    throw new Error('TARGETED_OUTPUT_ALREADY_EXISTS');
  }
  const extractionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-targeted-recert-'));
  try {
    const archiveEntries = safeArchiveEntries(sourceZip);
    execFileSync('tar', ['-xf', sourceZip, '-C', extractionRoot], { windowsHide: true });
    const source = verifySource(extractionRoot, archiveEntries);
    const sourceZipBytes = fs.readFileSync(sourceZip);
    const built = await buildUnits(extractionRoot);
    const outputPayload = {
      schema_version: 'deliveryos-b2-targeted-replay-outputs-v1',
      replay_semantics: 'INDEPENDENT_BOUNDED_UNITS_NOT_CONTINUOUS_CONVERSATION',
      units: built.outputs
    };
    const inputPayload = {
      schema_version: 'deliveryos-b2-targeted-replay-inputs-v1',
      source_packet_sha256: sha256(sourceZipBytes),
      replay_semantics: 'INDEPENDENT_BOUNDED_UNITS_NOT_CONTINUOUS_CONVERSATION',
      units: built.inputs
    };
    const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const codeFiles = [
      'tools/conversation-crm/cognitive-authority/b2/authority.js',
      'tools/conversation-crm/cognitive-authority/b2/commitments.js',
      'tools/conversation-crm/cognitive-authority/b2/contract.js',
      'tools/conversation-crm/cognitive-authority/b2/pipeline.js',
      'tools/conversation-crm/cognitive-authority/b2/writer.js'
    ];
    const evidencePayload = {
      schema_version: 'deliveryos-b2-targeted-technical-evidence-v1',
      source_packet: {
        path: path.basename(sourceZip),
        sha256: sha256(sourceZipBytes),
        bytes: sourceZipBytes.length,
        manifest_sha256: source.manifest_sha256,
        declared_files_verified: source.manifest.files.length
      },
      scope: {
        scenarios: Object.keys(TARGETED_ROUNDS),
        bounded_replay_units: built.outputs.length,
        source_rounds_included: { first: 12, second: 11, third: 0 },
        private_evaluation_context_included: false,
        external_action_performed: false,
        external_spend_brl: 0
      },
      contract: {
        schema_name: PLAN_SCHEMA.name,
        schema_strict: PLAN_SCHEMA.strict,
        commitment_kinds: COMMITMENT_KINDS
      },
      output_payload_sha256: canonicalHash(outputPayload),
      unit_response_hashes: built.outputs.map((item) => ({ unit_id: item.unit_id, response_hash: item.response_hash })),
      implementation_files: codeFiles.map((relativePath) => ({
        path: relativePath,
        sha256: fileEvidence(path.join(repositoryRoot, relativePath)).sha256
      }))
    };

    fs.mkdirSync(outputDir, { recursive: false });
    const payloads = new Map([
      ['TARGETED_RECERTIFIER_INSTRUCTIONS.md', Buffer.from(INSTRUCTIONS, 'utf8')],
      ['TARGETED_REPLAY_INPUTS.json', jsonBytes(inputPayload)],
      ['TARGETED_REPLAY_OUTPUTS.json', jsonBytes(outputPayload)],
      ['TARGETED_TECHNICAL_EVIDENCE.json', jsonBytes(evidencePayload)],
      ['SOURCE_PHASE2_AUTHORITY_POLICY.json', jsonBytes(built.authorityPolicy)],
      ['SOURCE_PHASE2_AUTHORIZED_CAPABILITIES.json', jsonBytes(built.capabilities)]
    ]);
    for (const [name, bytes] of payloads) fs.writeFileSync(path.join(outputDir, name), bytes);
    let packetFiles = [...payloads.keys()].sort().map((name) => ({
      path: name,
      absolute_path: path.join(outputDir, name),
      ...fileEvidence(path.join(outputDir, name))
    }));
    const manifest = {
      schema_version: 'deliveryos-b2-targeted-recertification-manifest-v1',
      role: 'INDEPENDENT_RECERTIFIER',
      source_packet_sha256: sha256(sourceZipBytes),
      scenario_count: Object.keys(TARGETED_ROUNDS).length,
      bounded_replay_unit_count: built.outputs.length,
      continuous_conversation: false,
      files: packetFiles.map(({ path: filePath, sha256: hash, bytes }) => ({ path: filePath, sha256: hash, bytes }))
    };
    fs.writeFileSync(path.join(outputDir, 'MANIFEST.json'), jsonBytes(manifest));
    packetFiles = packetFiles.concat({
      path: 'MANIFEST.json',
      absolute_path: path.join(outputDir, 'MANIFEST.json'),
      ...fileEvidence(path.join(outputDir, 'MANIFEST.json'))
    }).sort((left, right) => left.path.localeCompare(right.path));
    assertPacketBoundary(packetFiles);
    storedZip(packetFiles, zipPath);
    const packetHash = fileEvidence(zipPath).sha256;
    fs.writeFileSync(hashPath, Buffer.from(`${packetHash}  ${path.basename(zipPath)}\n`, 'utf8'));
    process.stdout.write(`${JSON.stringify({
      output_dir: outputDir,
      packet_path: zipPath,
      packet_sha256: packetHash,
      scenarios: Object.keys(TARGETED_ROUNDS).length,
      bounded_replay_units: built.outputs.length
    }, null, 2)}\n`);
  } catch (error) {
    if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
    if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
    if (fs.existsSync(hashPath)) fs.rmSync(hashPath, { force: true });
    throw error;
  } finally {
    const resolvedTemp = path.resolve(extractionRoot);
    const resolvedOsTemp = path.resolve(os.tmpdir());
    if (!resolvedTemp.startsWith(`${resolvedOsTemp}${path.sep}`)) throw new Error('TARGETED_TEMP_SCOPE_INVALID');
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.code || error.message || 'TARGETED_BUILD_FAILED'}\n`);
    process.exitCode = 1;
  });
}

module.exports = { TARGETED_ROUNDS, TARGETED_COMMITMENTS, crc32, storedZip, buildUnits };
