'use strict';
/*
 * Medicao AO VIVO e passiva da cadeia Gestor -> Reader -> Home, pela Home do laboratorio (loopback).
 * Nao le Gestor, Reader ou SQL por conta propria: so GET http://127.0.0.1:5310/api/home a cada 30 s.
 * Grava, NESTE caixa, uma linha por amostra com contagens e, por pedido, so um identificador opaco
 * (HMAC com sal local), a etapa do iFood, a classe da conciliacao e minutos. Nenhum codigo, item,
 * observacao ou dado de cliente vai para o arquivo.
 *   node amostrador-ao-vivo.cjs iniciar [HH:MM-fim, padrao 23:30]   (destacado, sem janela)
 *   node amostrador-ao-vivo.cjs estado | parar | relatorio [AAAAMMDD]
 * Termina sozinho no horario de fim (teto de 18 h). Nao registra tarefa, servico nem inicializacao.
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const DIR = path.join(process.env.USERPROFILE || __dirname, 'DeliveryOS-Ensaio', 'ao-vivo');
const REG = path.join(DIR, 'amostrador.json');
const URL_HOME = 'http://127.0.0.1:5310/api/home';
const PASSO_MS = 30_000;
const [cmd, arg] = process.argv.slice(2);
const hojeLocal = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '');
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
fs.mkdirSync(DIR, { recursive: true });
const salF = path.join(DIR, 'sal.bin');
if (!fs.existsSync(salF)) fs.writeFileSync(salF, crypto.randomBytes(32));
const opaco = (s) => crypto.createHmac('sha256', fs.readFileSync(salF)).update(s).digest('hex').slice(0, 12);

async function amostrar(fimMs) {
  const arq = () => path.join(DIR, `amostras-${hojeLocal()}.jsonl`);
  while (Date.now() < fimMs) {
    const t0 = Date.now(); let linha;
    try {
      const r = await fetch(URL_HOME, { signal: AbortSignal.timeout(10_000) });
      const h = await r.json(); const o = h.operacao_ifood || {}; const t = h.pedidos_teknisa || {};
      linha = { em: new Date(t0).toISOString(), http: r.status, ms: Date.now() - t0,
        gestor: o.disponivel ? { gravado_ha_min: o.gravado_ha_min, velha: o.leitura_velha, contagens: o.contagens, conciliacao: o.conciliacao, atencao: (o.atencao || []).length } : { disponivel: false },
        teknisa: t.disponivel ? { dia: t.dia, hoje: t.dia_e_hoje, contagens: t.contagens } : { disponivel: false },
        pedidos: o.disponivel ? o.pedidos.map((p) => ({ id: opaco(p.codigo + '|' + p.hora), etapa: p.etapa, min: p.minutos, classe: p.teknisa.classe, comanda_min: p.teknisa.comanda_em_min, preparo_passou: p.preparo ? p.preparo.passou_min : null })) : [] };
    } catch (e) { linha = { em: new Date(t0).toISOString(), erro: String(e && e.name || 'erro') }; }
    fs.appendFileSync(arq(), JSON.stringify(linha) + '\n');
    await new Promise((res) => setTimeout(res, Math.max(1_000, PASSO_MS - (Date.now() - t0))));
  }
}

function relatorio(dia) {
  const f = path.join(DIR, `amostras-${dia || hojeLocal()}.jsonl`);
  const L = fs.readFileSync(f, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  const ok = L.filter((x) => !x.erro && x.http === 200);
  const ms = ok.map((x) => x.ms).sort((a, b) => a - b); const q = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null;
  const por = new Map();
  for (const s of ok) for (const p of s.pedidos) {
    const a = por.get(p.id) || { primeiro_min: p.min, classes: new Set(), etapas: new Set(), comprovado_no_min: null, sem_comanda_amostras: 0, comanda_min: null };
    a.classes.add(p.classe); a.etapas.add(p.etapa);
    if (p.classe === 'correspondencia_comprovada' && a.comprovado_no_min === null) a.comprovado_no_min = p.min;
    if (p.classe === 'sem_comanda_na_teknisa') a.sem_comanda_amostras++;
    if (p.comanda_min !== null) a.comanda_min = p.comanda_min;
    por.set(p.id, a);
  }
  const vistos = [...por.values()];
  const vistoCedo = vistos.filter((a) => a.primeiro_min <= 2);
  const conta = (f) => vistos.filter(f).length;
  const ultima = ok[ok.length - 1];
  return { arquivo: f, amostras: L.length, erros: L.length - ok.length, home_ms: { p50: q(ms, 0.5), p90: q(ms, 0.9), max: ms[ms.length - 1] ?? null },
    gestor_velho_amostras: ok.filter((x) => x.gestor && x.gestor.velha).length,
    pedidos_vistos_no_gestor: vistos.length, vistos_ate_2_min_do_pedido: vistoCedo.length,
    minutos_ate_comprovado_entre_os_vistos_cedo: vistoCedo.map((a) => a.comprovado_no_min).filter((x) => x !== null).sort((a, b) => a - b),
    comanda_apos_placed_min: vistos.map((a) => a.comanda_min).filter((x) => x !== null).sort((a, b) => a - b),
    nunca_comprovados: conta((a) => a.comprovado_no_min === null), com_sem_comanda: conta((a) => a.sem_comanda_amostras > 0),
    classes_finais: ultima ? ultima.gestor.conciliacao : null, teknisa_no_fim: ultima ? ultima.teknisa : null,
    etapas_vistas: [...new Set(vistos.flatMap((a) => [...a.etapas]))] };
}

(async () => {
  if (cmd === 'iniciar') {
    if (fs.existsSync(REG) && vivo(JSON.parse(fs.readFileSync(REG, 'utf8')).pid)) throw Error('amostrador ja esta rodando');
    const [hh, mm] = String(arg || '23:30').split(':').map(Number);
    const local = new Date(Date.now() - 3 * 3600_000); local.setUTCHours(hh, mm, 0, 0);
    const fim = Math.min(local.getTime() + 3 * 3600_000, Date.now() + 18 * 3600_000);
    if (!(fim > Date.now())) throw Error('horario de fim ja passou');
    const f = cp.spawn(process.execPath, [__filename, '_rodar', String(fim)], { detached: true, windowsHide: true, stdio: 'ignore' });
    f.unref();
    fs.writeFileSync(REG, JSON.stringify({ pid: f.pid, fim: new Date(fim).toISOString(), em: new Date().toISOString() }));
    console.log(JSON.stringify({ iniciado: true, pid: f.pid, ate: new Date(fim).toISOString(), pasta: DIR }));
  } else if (cmd === '_rodar') {
    await amostrar(Number(arg));
  } else if (cmd === 'estado') {
    const r = fs.existsSync(REG) ? JSON.parse(fs.readFileSync(REG, 'utf8')) : null;
    console.log(JSON.stringify({ registro: r, vivo: r ? vivo(r.pid) : false }));
  } else if (cmd === 'parar') {
    if (!fs.existsSync(REG)) { console.log(JSON.stringify({ parado: true, motivo: 'sem registro' })); return; }
    const r = JSON.parse(fs.readFileSync(REG, 'utf8'));
    if (vivo(r.pid)) {
      const linha = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(r.pid)}").CommandLine`], { encoding: 'utf8', windowsHide: true }).stdout || '';
      if (!linha.includes('amostrador-ao-vivo.cjs')) throw Error('o pid registrado nao e o amostrador; nada parado');
      process.kill(r.pid);
    }
    fs.renameSync(REG, REG + '.parado-' + Date.now());
    console.log(JSON.stringify({ parado: true, pid: r.pid }));
  } else if (cmd === 'relatorio') {
    console.log(JSON.stringify(relatorio(arg), null, 1));
  } else throw Error('comando: iniciar [HH:MM] | estado | parar | relatorio [AAAAMMDD]');
})().catch((e) => { console.error('AMOSTRADOR_RECUSADO:', e.message); process.exitCode = 1; });
