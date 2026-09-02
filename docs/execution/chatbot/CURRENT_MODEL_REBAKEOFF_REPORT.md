# Re-bake-off de modelos abertos atuais — Mudança 005B

## Veredito técnico

`RE-BAKE-OFF LOCAL SEM CANDIDATO TÉCNICO`

Nenhum modelo novo foi promovido, preparado para votação humana ou incluído no
instalador. `human_winner` permanece `null`.

## Corpus e execução

- seed: `TATA-LOCAL-AI-BAKEOFF-V1`;
- baseline preservado: 260 casos;
- diagnósticos escritos antes das inferências: 32;
- total combinado por candidato: 292;
- mesmo hardware, contexto 8K, CPU, uma sessão e runtime b10172;
- nenhum caso real, API paga, nuvem, ferramenta livre ou multimodal.

## Comparação

| Candidato | Writer | Director | Decisão |
|---|---|---|---|
| Qwen3 4B Q4_K_M | histórico: 250/260; 10 fallbacks; p95 8,43 s | não reexecutado na 005B | baseline preservado |
| Gemma 4 E4B QAT Q4_0 | 292/292; 0 fallback; p95 10,38 s | 2/8; 1 fallback; p95 30,47 s | não qualificado |
| Qwen3.5 4B Q4_K_M | 289/292; 3 fallbacks; p95 9,70 s | 2/8; 0 fallback; p95 26,83 s | não qualificado |
| Gemma 4 12B QAT Q4_0 | não executado | não executado | Doctor gate |

Os três fallbacks do Writer Qwen3.5 ocorreram por
`WRITER_REQUIRED_QUESTION_MISSING`: um em continuidade e dois em referência
vaga. Todos foram seguros.

## Diagnóstico conversacional do Director

| Capacidade | Gemma E4B | Qwen3.5 4B |
|---|---|---|
| saudação isolada | correta | correta |
| saudação + reserva | iniciou jornada, mas incompleta | tratou como saudação |
| continuidade curta | incorreta | correta |
| correção 7 → 10 | incorreta | inverteu fato anterior e novo |
| pergunta lateral sobre valet | incorreta | pediu esclarecimento sem consulta |
| referência vaga | fallback seguro correto | ato correto, mas sem campo a esclarecer |
| retomada suspensa | incorreta | suspendeu a jornada ativa |
| item faltante durante reserva | incorreta | tratou como repetição |

Gemma registrou `2/8` resultados esperados; Qwen repetiu `2/8` com as mesmas
seeds em duas execuções. Fluência do Writer não compensou direção operacional
incorreta.

## Português, naturalidade e factualidade

O Writer de ambos produziu texto em português brasileiro aceito pelo contrato
automático. Isso não autoriza afirmar naturalidade superior: não houve rodada
humana porque nenhum candidato passou o Director. Fatos, links, perguntas e
claims continuaram sob o plano e o pós-validador; nenhuma saída reprovada foi
promovida a ação.

## Gemma 4 12B

O Doctor pós-Qwen mediu 18,77 GB de RAM disponível, 245,09 GB de disco livre,
42 °C e nenhum processo relevante, mas classificou a máquina como
`intermediario`. A matriz certificada lista apenas Qwen3 4B e 1.7B nessa classe.
O 12B não foi baixado ou executado, e nenhum resultado fictício foi criado.

## Painel cego

A infraestrutura cega anterior permanece testada e intacta, mas não foi criado
`blind-round-1.json` ou `blind-round-2.json`: não existe candidato técnico novo
que possa ser enviado a César. Fabricar uma rodada violaria o gate.

## Artefatos

- `qwen3-4b-results.json`: baseline histórico explicitamente não reexecutado;
- `gemma4-e4b-results.json`: execução real;
- `qwen35-4b-results.json`: execução real;
- `technical-comparison.json`: zero candidato qualificado;
- `metrics.json`: métricas consolidadas;
- `gemma4-12b-results.json`: corretamente ausente;
- blind rounds: corretamente ausentes.
