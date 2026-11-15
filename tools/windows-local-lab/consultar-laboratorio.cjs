'use strict';
/*
 * Consulta SOMENTE LEITURA do laboratorio do candidato V1 no caixa, por loopback.
 * Lista FECHADA de rotas GET; nenhuma escrita, nenhum pedido, nenhuma acao.
 * A credencial e a conta de LABORATORIO de gerente do ensaio (pilot-local.json da pasta ativa,
 * conta sintetica lab-mooca-*); o valor nunca e impresso.
 *
 *   node consultar-laboratorio.cjs            saude do critico e do piloto + diagnostico da fonte TATA
 *
 * O diagnostico da fonte TATA (/api/copiloto/source) e metadado por desenho (estado, contagens,
 * codigos de bloqueio): o piloto LE a pasta do Reader e nao devolve conteudo de pedido.
 */
const fs = require('node:fs');
const path = require('node:path');
const ATIVA = process.env.COMPUTERNAME === 'CAIXA_MOOCA' ? 'C:\\Users\\Tata\\DeliveryOS-Ensaio' : process.argv[2];
if (!ATIVA) throw Error('fora do caixa informe a pasta ativa da bancada');
const cfg = JSON.parse(fs.readFileSync(path.join(ATIVA, 'pilot-local.json'), 'utf8'));
const gerente = (cfg.users || []).find((u) => u.role === 'gerente' && /^lab-mooca-\d+$/.test(u.actor_id));
if (!gerente) throw Error('sem conta de laboratorio de gerente');
const ROTAS = [
  ['critico_health', 'http://127.0.0.1:8080/health', false],
  ['critico_ready', 'http://127.0.0.1:8080/ready', false],
  ['piloto_health', 'http://127.0.0.1:5193/api/health', false],
  ['fonte_tata', 'http://127.0.0.1:5193/api/copiloto/source', true],
];
(async () => {
  const out = { em: new Date().toISOString(), maquina: process.env.COMPUTERNAME, conta: gerente.actor_id };
  for (const [nome, url, auth] of ROTAS) {
    try {
      const r = await fetch(url, { headers: auth ? { Authorization: 'Bearer ' + gerente.token } : {}, signal: AbortSignal.timeout(8000) });
      const t = await r.text();
      let corpo; try { corpo = JSON.parse(t); } catch { corpo = { bytes: t.length }; }
      out[nome] = { status: r.status, corpo };
    } catch (e) { out[nome] = { status: 0, erro: String(e && e.name) }; }
  }
  const s = JSON.stringify(out, null, 2);
  if (s.includes(gerente.token)) throw Error('credencial apareceria na saida; nada impresso');
  console.log(s);
})().catch((e) => { console.error('CONSULTA_RECUSADA:', e.message); process.exitCode = 1; });
