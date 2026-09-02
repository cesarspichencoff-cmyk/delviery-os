'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function gib(bytes) { return Math.round((Number(bytes || 0) / 1024 ** 3) * 10) / 10; }

function classifyHardware(probe = {}) {
  const ram = Number(probe.ram_total_bytes || 0);
  const vram = Number(probe.gpu?.vram_bytes || 0);
  const threads = Number(probe.cpu?.threads || 0);
  const disk = Number(probe.disk_free_bytes || 0);
  if (ram < 8 * 1024 ** 3 || disk < 8 * 1024 ** 3 || threads < 4) return 'nao_compativel';
  if (ram >= 32 * 1024 ** 3 && vram >= 12 * 1024 ** 3) return 'avancado';
  if (ram >= 16 * 1024 ** 3 && (vram >= 6 * 1024 ** 3 || threads >= 8)) return 'intermediario';
  return 'basico';
}

function collectNodeProbe(options = {}) {
  const cpus = os.cpus();
  const base = {
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    cpu: { model: cpus[0]?.model || 'unknown', cores: cpus.length, threads: cpus.length, instructions: [] },
    ram_total_bytes: os.totalmem(),
    ram_available_bytes: os.freemem(),
    gpu: null,
    disk_free_bytes: Number(options.disk_free_bytes || 0),
    temperature_c: null,
    power_profile: 'unknown',
    relevant_processes: [],
    internet_status: 'not_probed',
    deliveryos_status: 'not_probed',
    local_port_status: 'not_probed',
    permission_status: 'not_probed'
  };
  if (typeof options.platformProbe === 'function') return { ...base, ...options.platformProbe() };
  return base;
}

function collectWindowsProbe(script) {
  const raw = execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.resolve(script)
  ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  return JSON.parse(raw);
}

function hardwareReport(probe) {
  const classification = classifyHardware(probe);
  const compatibleModels = classification === 'avancado'
    ? ['qwen3-4b-q4km', 'qwen3-1.7b-q8', 'gpt-oss-20b-mxfp4']
    : classification === 'intermediario'
      ? ['qwen3-4b-q4km', 'qwen3-1.7b-q8']
      : classification === 'basico' ? ['qwen3-1.7b-q8'] : [];
  return Object.freeze({
    schema_version: 'deliveryos-ai-node-hardware-v1',
    measured_at: new Date().toISOString(),
    classification,
    compatible_models: compatibleModels,
    probe
  });
}

function reportMarkdown(report) {
  const p = report.probe;
  return [
    '# DeliveryOS AI Node — diagnóstico de hardware',
    '',
    `Classificação: **${report.classification}**`,
    '',
    `- Sistema: ${p.platform} ${p.release} (${p.architecture})`,
    `- CPU: ${p.cpu?.model || 'desconhecida'}; ${p.cpu?.threads || 0} threads`,
    `- RAM: ${gib(p.ram_total_bytes)} GiB total; ${gib(p.ram_available_bytes)} GiB disponível`,
    `- GPU: ${p.gpu?.name || 'não detectada'}; ${gib(p.gpu?.vram_bytes)} GiB VRAM`,
    `- Disco livre: ${gib(p.disk_free_bytes)} GiB`,
    `- Modelos elegíveis: ${report.compatible_models.join(', ') || 'nenhum'}`,
    '',
    'A classificação é técnica e não substitui o teste no computador do restaurante.',
    ''
  ].join('\n');
}

function writeHardwareReports(report, outputRoot) {
  fs.mkdirSync(outputRoot, { recursive: true });
  const json = path.join(outputRoot, 'LOCAL_AI_HARDWARE_REPORT.json');
  const markdown = path.join(outputRoot, 'LOCAL_AI_HARDWARE_REPORT.md');
  fs.writeFileSync(json, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(markdown, reportMarkdown(report), 'utf8');
  return { json, markdown };
}

module.exports = { gib, classifyHardware, collectNodeProbe, collectWindowsProbe, hardwareReport, reportMarkdown, writeHardwareReports };
