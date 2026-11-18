'use strict';

const { spawn } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const { createConnection } = require('node:net');
const { join } = require('node:path');

const [porta, diaDeMedicao] = process.argv.slice(2);
if (porta !== '5290' && porta !== '5292') throw Error('PORTA_COPILOTO_INVALIDA');
if (diaDeMedicao && !/^\d{4}-\d{2}-\d{2}$/.test(diaDeMedicao)) throw Error('DIA_MEDICAO_INVALIDO');

function portaEmUso() {
  return new Promise((resolve, reject) => {
    const s = createConnection({ host: '127.0.0.1', port: Number(porta) });
    s.setTimeout(2000, () => { s.destroy(); reject(Error('PORTA_SEM_RESPOSTA')); });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', e => e.code === 'ECONNREFUSED' ? resolve(false) : reject(e));
  });
}

async function servir() {
  if (await portaEmUso()) {
    const r = await fetch(`http://127.0.0.1:${porta}/api/health`, { signal: AbortSignal.timeout(4000) });
    const saude = r.ok ? await r.json() : {};
    if (saude.modulo !== 'PRODUCT_SYSTEM' || saude.somente_leitura !== true) throw Error('PORTA_DE_OUTRO_SERVICO');
    return;
  }

  const env = { ...process.env };
  if (diaDeMedicao && porta === '5290') {
    const registros = join(__dirname, 'data', 'medicao-foco');
    mkdirSync(registros, { recursive: true });
    env.DELIVERYOS_ITAIM_MEDICAO_DIA = diaDeMedicao;
    env.DELIVERYOS_ITAIM_MEDICAO_ARQUIVO = join(registros, `foco-${diaDeMedicao}.jsonl`);
  }
  const worker = spawn(process.execPath, [join(__dirname, 'iniciar-previa-itaim.cjs'), porta], {
    cwd: __dirname, env, windowsHide: true, stdio: 'ignore',
  });
  worker.once('error', () => { process.exitCode = 1; });
  worker.once('exit', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
}

servir().catch(e => { console.error(e.message); process.exitCode = 1; });
