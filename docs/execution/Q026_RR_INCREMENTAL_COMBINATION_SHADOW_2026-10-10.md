# Q-026 — SHADOW: RR snapshot + leitura incremental, 10/10/2026

## Contexto e fronteira

Base: PR #45 (`fix/q026-entregas-single-snapshot-20261010`), inicialmente em `3e9af7cddd3e13074ccf619c257ca63f2f5eed2c`. A linha de pesquisa incremental vem dos PRs #39/#40. Este branch **não altera runtime**, `main`, integração, schema, migrations, Q-016, retenção, HTTP operacional ou banco real.

A projeção compacta serve SOMENTE aos campos de UI. Não substitui IDs de eventos, quarentena, reconstrução nem a autoridade forense Q-016.

## Prova A — RR + gravação concorrente + equivalência de UI

Artefato: `tests/product/run-q026-rr-incremental-combination-shadow.ts`.
Workflow: `deliveryos-q026-rr-incremental-combination-shadow.yml`.
CI inicial comprovada: [38072077571](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38072077571), SUCCESS no commit `6c473f95c7664a61ac8ef7149091bfcbfbf7a515`.
CI após adição do estudo de memória: [38072274164](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38072274164), SUCCESS no commit `e2b29a03b7f7c2c8cc6a7406ddf08dfe430be1b6`.

- Fixture sintética de 126.000 eventos, incluindo 120.000 da mesma viagem, duas unidades, modos real/simulated/control, escopo apenas device, UNKNOWN, uma sequência corrompida, cinco escopos e 72 grupos.
- Cursor `FETCH 257`: 491 lotes, maior buffer de resultados 257. Acumulador guarda campos de UI por viagem, não `eventos[]` completo.
- Dentro de `REPEATABLE READ, READ ONLY`, um escritor PostgreSQL de pool independente confirmou um GPS após `FETCH` começar. A snapshot do cursor e uma consulta `COUNT` na mesma transação não viram o novo GPS, preservando contagens; a próxima leitura canônica o viu.
- `backend_xmin` observado ativo durante RR, estável após commit do escritor e `NULL` após COMMIT do leitor.
- Nove checks passaram, incluindo comparação completa dos campos da projeção, VM em quatro filtros, ordem cronológica invertida, mutante de device, escopo vazio e mutante de contagem.
- Duração observada da transação do teste **1.187,38 ms**. Esse número inclui injeção do escritor e consultas de observabilidade dentro do callback. Não é a latência de um leitor de produção nem tempo SQL puro.
- TypeScript, Q-016, Product e governança passaram; sem PostgreSQL a suíte sai 78.
- RSS pós-teste de **596,86 MiB** é **inválido para comparação A/B**: o processo ainda mantém a projeção canônica em RAM. Não usar esse número como evidência contra o cursor.

### Limite específico da Prova A

O teste usa o modelo de aparelhos do baseline canônico materializado antes do escritor e confronta a contagem do dispositivo dentro do RR. Ele **não** reconstrói todos os campos do dispositivo usando o cursor em um único retorno operacional. O experimento de concorrência injeta **um** evento, não uma carga contínua de 30 escritas. Os cenários são PostgreSQL 16 efêmero, não operação real.

## Prova B — pico de RSS em processos Node separados

Artefato: `tests/product/run-q026-rr-incremental-memory-shadow.ts`.
Workflow: `deliveryos-q026-rr-incremental-memory-shadow.yml`.
CI: [38072274207](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38072274207), **2/2 SUCCESS**, no commit `e2b29a03b7f7c2c8cc6a7406ddf08dfe430be1b6`.

Cada par roda no mesmo runner, mas em processos Node e bancos descartáveis independentes, com fixture SQL equivalente e GC explícito. Compara hash SHA-256 de **todos os campos de apresentação de uma viagem longa** do leitor canônico RR do PR #45 versus cursor incremental em RR.

| Fatos na viagem | Pico RSS canônico | Pico RSS incremental | Redução observada | Tempo canônico | Tempo incremental |
|---:|---:|---:|---:|---:|---:|
| 120.000 | 241,1 MiB | 140,6 MiB | 41,7% | 1.112 ms | 888 ms |
| 300.000 | 444,1 MiB | 139,0 MiB | 68,7% | 3.492 ms | 2.560 ms |

Hashes coincidentes:
- 120k: `68ddffa46d37f6d6e191572abf0150f526f52dcd9f38dd9030fbf29586559a65`
- 300k: `e2cda6aea973e7f8d643bff1da33815307ac59a3196ee7ee30bf9be3ac749270`

O pico RSS é medido em cada **processo inteiro**, incluindo runtime e geração da fixture, não pico exclusivo de leitura. Dois caminhos fazem quantidades distintas de trabalho: o baseline constrói a realidade integral, e o compactado neste ensaio é um único acumulador de viagem. A comparação prova vantagem neste fixture de viagem longa, **não prova redução equivalente no modelo completo de aparelhos, múltiplas viagens e escopos**. Tempos são observações únicas, não p95/p99. Não há escritor concorrente nesta Prova B: essa dimensão fica segregada na Prova A.

## Decisão e próximo gate

**Decisão: manter DRAFT / HOLD; nenhuma promoção ou deploy.** O ganho de memória é material, e a combinação com uma snapshot RR tem evidência positiva **nos cenários executados**.

Próxima prova prioritária: construir representação completa de Entregas (aparelhos, últimos lotes, contagens e campos de UI) inteiramente de uma única RR com cursor em runtime SHADOW, confrontando integralmente o modelo canônico durante escritores ritmados; depois ampliar a 1,03 milhão e testar orçamento de transação, pool, memória PostgreSQL, falha, saída HTTP e dispositivos. Preservar Q-016 integralmente. Não criar índice nem configurar retenção automaticamente.

**NÃO MERGE / NÃO DEPLOY / NÃO PRODUÇÃO / NÃO MIGRATIONS / NÃO NOVOS GASTOS.** `CODE_READY + TEST_PASS` somente nas provas sintéticas citadas, não `WORLD_PROVEN` e não encerramento Q-026.
