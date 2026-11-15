'use strict';
/*
 * Home do LABORATORIO no caixa: so o servidor da Home (product_system_server) de uma pasta de candidato
 * preparada, ouvindo SO em 127.0.0.1, lendo a pasta REAL do Reader em modo leitura (sem banco).
 *   node home-do-laboratorio.cjs iniciar <pasta-do-candidato>
 *   node home-do-laboratorio.cjs estado
 *   node home-do-laboratorio.cjs parar
 * Destacado e sem janela (windowsHide). Para so o processo que ele mesmo iniciou (pid + linha de comando).
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const PORTA = 5310;
const READER = 'C:\\ProgramData\\TataComandaReader';
const REGISTRO = path.join(__dirname, 'home-do-laboratorio.json');
const [cmd, pasta] = process.argv.slice(2);
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const linhaDe = (pid) => {
  const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`], { encoding: 'utf8', windowsHide: true });
  return String(r.stdout || '').trim();
};
(async () => {
  if (cmd === 'iniciar') {
    if (!pasta || !path.isAbsolute(pasta)) throw Error('informe a pasta absoluta do candidato');
    const app = path.join(pasta, 'app');
    const bin = path.join(app, 'dist', 'tools', 'product_system_server.js');
    if (!fs.existsSync(path.join(pasta, 'preparacao-candidato.json')) || !fs.existsSync(bin)) throw Error('pasta sem preparacao de candidato ou sem servidor da Home');
    if (fs.existsSync(REGISTRO) && vivo(JSON.parse(fs.readFileSync(REGISTRO, 'utf8')).pid)) throw Error('Home do laboratorio ja esta no ar');
    const log = fs.openSync(path.join(__dirname, 'home-do-laboratorio.log'), 'a');
    const env = { ...process.env, PRODUCT_UI_PORT: String(PORTA), TATA_READER_INSTALL_ROOT: READER, DELIVERYOS_DATABASE_URL: '' };
    const f = cp.spawn(process.execPath, [bin], { cwd: app, env, stdio: ['ignore', log, log], detached: true, windowsHide: true });
    fs.closeSync(log); f.unref();
    fs.writeFileSync(REGISTRO, JSON.stringify({ pid: f.pid, pasta, porta: PORTA, em: new Date().toISOString() }));
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) { try { ok = (await fetch(`http://127.0.0.1:${PORTA}/api/health`)).ok; } catch { await new Promise((r) => setTimeout(r, 250)); } }
    console.log(JSON.stringify({ iniciado: ok, pid: f.pid, url: `http://127.0.0.1:${PORTA}/` }));
  } else if (cmd === 'estado') {
    const r = fs.existsSync(REGISTRO) ? JSON.parse(fs.readFileSync(REGISTRO, 'utf8')) : null;
    let saude = 0; try { saude = (await fetch(`http://127.0.0.1:${PORTA}/api/health`)).status; } catch {}
    console.log(JSON.stringify({ registro: r, vivo: r ? vivo(r.pid) : false, saude }));
  } else if (cmd === 'parar') {
    if (!fs.existsSync(REGISTRO)) { console.log(JSON.stringify({ parado: true, motivo: 'sem registro' })); return; }
    const r = JSON.parse(fs.readFileSync(REGISTRO, 'utf8'));
    if (vivo(r.pid)) {
      if (!linhaDe(r.pid).includes('product_system_server.js')) throw Error('o pid registrado nao e a Home do laboratorio; nada parado');
      process.kill(r.pid);
    }
    fs.renameSync(REGISTRO, REGISTRO + '.parado-' + Date.now());
    console.log(JSON.stringify({ parado: true, pid: r.pid }));
  } else throw Error('comando: iniciar <pasta> | estado | parar');
})().catch((e) => { console.error('HOME_LAB_RECUSADA:', e.message); process.exitCode = 1; });
