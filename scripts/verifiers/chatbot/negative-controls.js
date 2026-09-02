'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const controls = [
  ['bureaucratic_language', 'Para que possamos tratar sua solicitação com a devida atenção, o setor responsável seguirá da forma correta.'],
  ['unknown_links', 'Acesse https://unknown.example.test/menu para continuar.'],
  ['unknown_values', 'O valor confirmado é R$ 98765,43.'],
  ['forbidden_promises', 'Sua reserva está confirmada e concluída.', { result_status: 'unknown' }],
  ['repeated_question', ['Qual é o número do pedido?', 'Qual é o número do pedido?']],
  ['technical_leakage', 'intent: occurrence.missing_item; policy_id=O02'],
  ['non_empty_response', '']
];

function artifactFor(name, payload, extras = {}) {
  const responses = Array.isArray(payload) ? payload : [payload];
  return {
    case_id: `NEG-${name}`,
    expected_contract: { must_include: [], must_not_include: [], facts: [], questions: [], maximum_length: 1000 },
    results: responses.map((response) => ({ response_text: response, result_status: extras.result_status || 'unknown' }))
  };
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-negative-controls-'));
try {
  const results = controls.map(([check, payload, extras]) => {
    const file = path.join(tempRoot, `${check}.json`);
    fs.writeFileSync(file, JSON.stringify({ results: [artifactFor(check, payload, extras)] }), 'utf8');
    const run = spawnSync(process.execPath, [path.join(__dirname, 'verify-baseline.js'), file], {
      cwd: projectRoot,
      encoding: 'utf8',
      windowsHide: true
    });
    const detected = run.status === 1 && run.stdout.includes(`"check": "${check}"`) && run.stdout.includes('"status": "failed"');
    return {
      control: check,
      expected_exit: 'nonzero',
      actual_exit: run.status,
      detector_status: detected ? 'failed_as_expected' : 'false_green'
    };
  });
  const falseGreens = results.filter((item) => item.detector_status === 'false_green');
  process.stdout.write(`${JSON.stringify({ controls: results.length, red: results.length - falseGreens.length, false_green: falseGreens.length, results }, null, 2)}\n`);
  if (falseGreens.length) process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
