/**
 * Q-026 — a prova de equivalencia ENXERGA os defeitos que diz enxergar?
 *
 * Cada mutante e a projecao DESTA arvore com um defeito plausivel de
 * otimizacao, aplicado numa COPIA temporaria (fora da arvore; nada no
 * `git status`). A bateria passa quando:
 *  - o CONTROLE (a fonte sem mutacao, carregada pelo mesmo mecanismo) tem
 *    zero divergencias contra a original; e
 *  - TODO mutante tem ao menos uma divergencia nos cenarios de
 *    `q026-cenarios.ts`. Mutante sem divergencia = prova cega = reprova.
 *
 * Saida: `Q026_REPLAY_MUTACOES: n/n mortos, 0 cegos`.
 */
import { cenarios, comparar } from "./q026-cenarios";
import { carregarProjecaoDeFonte, carregarReferencia, fonteAtualDaProjecao, REF_ORIGINAL } from "./q026-referencias";

interface Mutante {
  id: string;
  propriedade: string;
  edicoes: { de: string; para: string }[];
}

const MUTANTES: Mutante[] = [
  {
    id: "M1",
    propriedade: "sem a guarda: filtra antes de ordenar mesmo com comparador inconsistente",
    edicoes: [{ de: "  if (!consistente) {\n", para: "  if (false) {\n" }],
  },
  {
    id: "M2",
    propriedade: "desempate por codigo de caractere em vez de localeCompare",
    edicoes: [{
      de: "    return eventos[x].event_id.localeCompare(eventos[y].event_id);\n",
      para: "    return eventos[x].event_id < eventos[y].event_id ? -1 : eventos[x].event_id > eventos[y].event_id ? 1 : 0;\n",
    }],
  },
  {
    id: "M3",
    propriedade: "sequencia local ignorada no desempate",
    edicoes: [{ de: "    const sa = sequencias[x] - sequencias[y];\n", para: "    const sa = 0;\n" }],
  },
  {
    id: "M4",
    propriedade: "deduplicacao removida",
    edicoes: [{ de: "    if (vistos.has(ev.idempotency_key)) continue;\n", para: "" }],
  },
  {
    id: "M5",
    propriedade: "deduplicacao ANTES do filtro de modo: a chave de outro modo bloqueia este",
    edicoes: [
      { de: "    if (e.unit_id === unit_id && e.source_mode === source_mode) indices.push(i);\n", para: "    if (e.unit_id === unit_id) indices.push(i);\n" },
      { de: "    if (ev.source_mode !== source_mode) continue;\n", para: "" },
      { de: "    vistos.add(ev.idempotency_key);\n", para: "    vistos.add(ev.idempotency_key);\n    if (ev.source_mode !== source_mode) continue;\n" },
    ],
  },
  {
    id: "M6",
    propriedade: "chave `ultima_posicao_em` omitida quando ausente (undefined != ausente)",
    edicoes: [{
      de: "      ultima_posicao_em: v.ultima_posicao_em,\n",
      para: "      ...(v.ultima_posicao_em ? { ultima_posicao_em: v.ultima_posicao_em } : {}),\n",
    }],
  },
  {
    id: "M7",
    propriedade: "ordem das chaves da saida muda (o JSON HTTP muda; deepStrictEqual nao ve)",
    edicoes: [
      { de: "    .map((v) => ({\n      trip_id: v.trip_id,\n", para: "    .map((v) => ({\n      frescor: classificarFrescor(v.ultima_posicao_em, agora, janelas),\n      trip_id: v.trip_id,\n" },
      { de: "      ultima_posicao_em: v.ultima_posicao_em,\n      frescor: classificarFrescor(v.ultima_posicao_em, agora, janelas),\n", para: "      ultima_posicao_em: v.ultima_posicao_em,\n" },
    ],
  },
  {
    id: "M8",
    propriedade: "mesmo instante, grafia diferente: a ULTIMA aplicada vence (>= em vez de >)",
    edicoes: [{ de: "    } else if (instantes[k] > atual.ultimo_fato_ms) {\n", para: "    } else if (instantes[k] >= atual.ultimo_fato_ms) {\n" }],
  },
  {
    id: "M9",
    propriedade: "o cursor avanca sobre fato em quarentena",
    edicoes: [{ de: "      if (majEv !== majCo) {\n", para: "      if (majEv !== majCo) {\n        ultimoAplicado = ev;\n" }],
  },
  {
    id: "M10",
    propriedade: "cache velho: `ultimo_fato_ms` nao acompanha o texto",
    edicoes: [{
      de: "    } else if (instantes[k] > atual.ultimo_fato_ms) {\n      atual.ultimo_fato_em = ev.occurred_at;\n      atual.ultimo_fato_ms = instantes[k];\n",
      para: "    } else if (instantes[k] > atual.ultimo_fato_ms) {\n      atual.ultimo_fato_em = ev.occurred_at;\n",
    }],
  },
  {
    id: "M11",
    propriedade: "relogio sem autoridade: a posicao volta a usar o instante declarado no cache",
    edicoes: [{ de: "      const t = instante === ev.occurred_at ? instantes[k] : Date.parse(instante);\n", para: "      const t = instantes[k];\n" }],
  },
  {
    id: "M12",
    propriedade: "o estado retrocede com evento atrasado",
    edicoes: [{ de: "    if (destino && RANK[destino] > RANK[atual.estado]) atual.estado = destino;\n", para: "    if (destino) atual.estado = destino;\n" }],
  },
  {
    id: "M13",
    propriedade: "fato sem aparelho apaga o aparelho da viagem",
    edicoes: [{ de: "    atual.device_id = ev.device_id ?? atual.device_id;\n", para: "    atual.device_id = ev.device_id;\n" }],
  },
  {
    id: "M14",
    propriedade: "viagens ordenadas por codigo de caractere",
    edicoes: [{
      de: "    .sort((a, b) => a.trip_id.localeCompare(b.trip_id));\n",
      para: "    .sort((a, b) => (a.trip_id < b.trip_id ? -1 : a.trip_id > b.trip_id ? 1 : 0));\n",
    }],
  },
  {
    id: "M15",
    propriedade: "o caminho antigo filtra ANTES de ordenar (a guarda existe mas e inutil)",
    edicoes: [{
      de: "    const ordenados = [...eventos]\n      .sort(compararEventos)\n      .filter((e) => e.unit_id === unit_id && e.source_mode === source_mode);\n",
      para: "    const ordenados = eventos\n      .filter((e) => e.unit_id === unit_id && e.source_mode === source_mode)\n      .sort(compararEventos);\n",
    }],
  },
  {
    id: "M16",
    propriedade: "o instante da ordenacao arredonda para o segundo",
    edicoes: [{ de: "    const t = Date.parse(e.occurred_at);\n", para: "    const t = Math.floor(Date.parse(e.occurred_at) / 1000) * 1000;\n" }],
  },
  {
    id: "M17",
    propriedade: "a guarda esquece o id nao-texto (o caminho rapido lanca outro erro)",
    edicoes: [{ de: "    if (!Number.isFinite(t) || typeof e.event_id !== \"string\") consistente = false;\n", para: "    if (!Number.isFinite(t)) consistente = false;\n" }],
  },
  {
    id: "M18",
    propriedade: "a guarda esquece a sequencia nao-finita (NaN em outro escopo)",
    edicoes: [{ de: "    if (typeof s === \"number\" && Number.isFinite(s)) sequencias[i] = s;\n    else consistente = false;\n", para: "    sequencias[i] = Number(s);\n" }],
  },
];

function aplicar(fonte: string, m: Mutante): string {
  let s = fonte;
  for (const e of m.edicoes) {
    const n = s.split(e.de).length - 1;
    if (n !== 1) throw new Error(`${m.id}: ancora encontrada ${n} vez(es) — a mutacao nao se aplica a esta fonte`);
    s = s.replace(e.de, e.para);
  }
  return s;
}

const original = carregarReferencia(REF_ORIGINAL);
if (!original.referencia) {
  console.error(`A referencia ORIGINAL e obrigatoria: ${original.motivo}`);
  process.exit(1);
}
const ORIGINAL = original.referencia.projetar;
const LISTA = cenarios();
const fonte = fonteAtualDaProjecao();

console.log(`Q-026 — mutantes da projecao contra ${LISTA.length} cenarios`);
const controle = comparar(ORIGINAL, carregarProjecaoDeFonte("controle", fonte), LISTA);
if (controle.total_divergencias !== 0) {
  console.error(`CONTROLE RED: a fonte sem mutacao diverge (${controle.total_divergencias}) — o mecanismo de carga esta errado`);
  process.exit(1);
}
console.log(`  ok  controle: fonte sem mutacao, mesmo mecanismo de carga, 0 divergencias em ${controle.comparacoes}`);

let mortos = 0;
const cegos: string[] = [];
const quebrados: string[] = [];
for (const m of MUTANTES) {
  let mutada: string;
  try {
    mutada = aplicar(fonte, m);
  } catch (e) {
    quebrados.push(`${m.id}: ${(e as Error).message}`);
    console.log(`  XX  ${m.id} ${m.propriedade} — ${(e as Error).message}`);
    continue;
  }
  const r = comparar(ORIGINAL, carregarProjecaoDeFonte(m.id, mutada), LISTA, 3);
  if (r.total_divergencias > 0) {
    mortos += 1;
    const d = r.divergencias[0];
    console.log(`  ok  ${m.id} morto (${r.total_divergencias} divergencias; 1a: [${d.familia}] ${d.cenario} — ${d.motivo})\n        ${m.propriedade}`);
  } else {
    cegos.push(m.id);
    console.log(`  XX  ${m.id} CEGO — nenhuma divergencia\n        ${m.propriedade}`);
  }
}

const total = MUTANTES.length;
console.log(`\n${mortos}/${total} mortos, ${cegos.length} cego(s), ${quebrados.length} sem ancora`);
if (cegos.length || quebrados.length) {
  console.error(`Q026_REPLAY_MUTACOES_RED: cegos=[${cegos.join(",")}] sem_ancora=[${quebrados.join(" | ")}]`);
  process.exit(1);
}
console.log(`Q026_REPLAY_MUTACOES: ${mortos}/${total} mortos, 0 cegos`);
