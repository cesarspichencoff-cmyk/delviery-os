'use strict';

const { readFileSync } = require('node:fs');
const politica = require('./production-service-weekly-policy.json');
const horarioItaim = new Intl.DateTimeFormat('en-CA', {
  timeZone: politica.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function resumirMedicaoItaim(conteudo, dia) {
  const data = new Date(`${dia}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia ?? '') || !Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== dia) {
    throw Error('Informe a data da operação no formato AAAA-MM-DD.');
  }
  const janelas = politica.week.find(d => d.day_of_week === data.getUTCDay()).windows;
  const minutosDe = hora => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
  const turnos = Object.fromEntries(janelas.map(({ service, start, end }) =>
    [service === 'LUNCH' ? 'almoco' : 'jantar', { inicio: minutosDe(start), fim: minutosDe(end), linhas: [] }]));
  let linhasInvalidas = 0;
  let linhasForaDoEscopo = 0;
  for (const linha of conteudo.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    let amostra;
    try { amostra = JSON.parse(linha); }
    catch { linhasInvalidas++; continue; }
    const instante = new Date(typeof amostra?.em === 'string' ? amostra.em : NaN);
    if (!Number.isFinite(instante.getTime()) || !['almoco', 'jantar'].includes(amostra.turno)) {
      linhasInvalidas++;
      continue;
    }
    const turno = turnos[amostra.turno];
    const partes = Object.fromEntries(horarioItaim.formatToParts(instante).map(p => [p.type, p.value]));
    const minuto = Number(partes.hour) * 60 + Number(partes.minute);
    if (`${partes.year}-${partes.month}-${partes.day}` !== dia || minuto < turno.inicio || minuto >= turno.fim) {
      linhasForaDoEscopo++;
      continue;
    }
    turno.linhas.push({ amostra, minuto });
  }

  const numeros = (linhas, campo) => linhas.map(({ amostra }) => amostra[campo])
    .filter(n => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  const p95 = ns => ns[Math.ceil(ns.length * 0.95) - 1] ?? null;
  const picos = ['carga_ifood_observada', 'aguardando_aceite', 'em_preparo', 'prontos_para_despacho', 'em_entrega',
    'composicao_a_conferir', 'separacoes_identificadas', 'atrasados', 'atrasados_com_praca_pendente'];
  const resumo = Object.fromEntries(Object.entries(turnos).map(([nome, { inicio, fim, linhas }]) => {
    const minutos = [...new Set(linhas.map(l => l.minuto))].sort((a, b) => a - b);
    const lacunas = [...minutos, fim].map((minuto, i) => minuto - (minutos[i - 1] ?? inicio - 1) - 1);
    const saudaveis = linhas.filter(({ amostra }) => amostra.gestor === 'saudavel');
    return [nome, {
      minutos_previstos: fim - inicio,
      minutos_com_amostra: minutos.length,
      minutos_com_gestor_saudavel: new Set(saudaveis.map(l => l.minuto)).size,
      maior_intervalo_sem_amostra_min: Math.max(...lacunas),
      amostras: linhas.length,
      respostas_em_foco: linhas.filter(({ amostra }) => amostra.modo === 'foco').length,
      transicoes_foco: Object.fromEntries(['entrou', 'trocou', 'saiu'].map(transicao =>
        [transicao, linhas.filter(({ amostra }) => amostra.transicao === transicao).length])),
      idade_da_gravacao_do_gestor_p95_s: p95(numeros(saudaveis, 'idade_gestor_s')),
      processamento_da_resposta_p95_ms: p95(numeros(linhas, 'resposta_ms')),
      picos_observados: Object.fromEntries(picos.map(campo => [
        campo, numeros(saudaveis, campo).at(-1) ?? null,
      ])),
    }];
  }));

  return {
    dia, linhas_invalidas: linhasInvalidas, linhas_fora_do_escopo: linhasForaDoEscopo, turnos: resumo,
    limites: [
      'Amostras significam respostas observadas. Lacunas podem ser painel fechado, fonte indisponível ou falha de gravação.',
      'Idade da gravação e processamento da resposta não medem a latência do pedido até aparecer na tela.',
      'Picos vêm da janela recente do Gestor. Cobertura de pedidos e acerto do Foco exigem comparação independente em campo.',
    ],
  };
}

if (require.main === module) {
  try {
    const [arquivo, dia] = process.argv.slice(2);
    if (!arquivo) throw Error('Uso: node resumir-medicao-itaim.cjs <arquivo.jsonl> <AAAA-MM-DD>');
    console.log(JSON.stringify(resumirMedicaoItaim(readFileSync(arquivo, 'utf8'), dia), null, 2));
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  }
}

module.exports = { resumirMedicaoItaim };
