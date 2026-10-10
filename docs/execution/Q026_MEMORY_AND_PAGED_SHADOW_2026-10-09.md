# Q-026 — decomposição de memória e alternativa paginada (SHADOW)

Emissão: 2026-10-09. Escopo: somente DeliveryOS Itaim, dados de teste inteiramente `simulated`.
Base: integração `d0716fd`; otimização experimental Q-026 `b62e9fa`; esta pesquisa em branch independente.
Status: **LABORATÓRIO / NÃO INTEGRAR / NÃO PUBLICAR / Q-026 OPEN**.

## O que sabemos — não misturar métricas

1. [CI 38016959418](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38016959418) (HTTP, 1.030.000 fatos): baseline 11.982,72 ms, otimização PR #31 7.845,75 ms na segunda leitura, identidade e contagem iguais. RSS **amostrado do grupo** na segunda leitura: ~2.472–2.473 MiB. Processo HTTP/npx/GC, outra metodologia; não deve ser comparado diretamente ao pico RSS do processo de testes abaixo.
2. [CI 38017535469](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38017535469) (diagnóstico direto do processo Node com GC explícito, banco PostgreSQL isolado e 1.030.000 fatos): após seed, heap vivo ~8,8 MiB; após `lerFatosParaReplay`, **567,7 MiB de heap vivo / 1.123,4 MiB RSS**; após também `projetar`, ~562,4 MiB de heap / 1.138,9 MiB RSS; depois de liberar os resultados e forçar GC, **7,9 MiB de heap**, mas RSS ~1.123,6 MiB. Pico RSS observado ~1.189,1 MiB. Três chamadas independentes `lerRealidadeDeEntregas`: heap retido com resultado em mãos ~49,8 MiB; liberado e GC ~8,0 MiB nas três; pico RSS total do teste ~1.226,7 MiB. **Não foi observado vazamento crescente de objetos após GC nesse recorte**; RSS não retorna ao baseline só porque o heap fica livre.
3. Mesmo perfil em 100.000 fatos: `lerFatosParaReplay` ~63,1 MiB heap / ~215,8 MiB RSS, pós-GC ~9,0 MiB heap / ~219,5 MiB RSS; três leituras retornaram ~9,1 MiB pós-GC. O crescimento em leitura é material e proporcional ao volume de fatos.

**Interpretação sustentada:** o gargalo da RAM não exige inventar uma janela de horas nem truncar a fonte canônica; a maior parte da memória viva é alocada para decodificar e reconstruir fatos históricos em cada clique. O ensaio ainda não separa com precisão o pico transitório da query `pg`, streaming de rede, `sort()`, projetor, corpo HTTP e coletor de lixo sob todas as cargas. Causalidade de produção NÃO PROVADA.

## Prova independente de mecanismo paginado — sem novo runtime

[CI 38017841405](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38017841405): `tests/product/run-q026-paged-trip-shadow.ts`. Usa PostgreSQL real **descartável**, `DECLARE CURSOR ... FETCH 4096`, `READ ONLY`, grupamento por `unit_id/source_mode/object_type/object_id`, a **mesma função `projetar()`** em cada viagem, comparação por hash SHA-256 do JSON integral de cada `ViagemProjetada` com `lerFatosParaReplay -> projetar` em seguida. O banco é destruído pelo helper `bancoIsolado`.

| Volume / roteiro | Curto por viagem (stream) | Replay inteiro | Prova |
|---|---:|---:|---|
| 100 mil, 100 viagens, máx. 1.000 fatos/viagem | 1.198 ms, RSS 169,1 MiB | 866 ms, RSS 229,9 MiB | hashes JSON completos de viagens idênticos |
| 1.030.000, 1.030 viagens, máx. 1.000 fatos/viagem | 11.465 ms, RSS 173,4 MiB | 9.032 ms, RSS 1.200,6 MiB | hashes JSON completos de viagens idênticos |

**Correção metodológica comprovada:** [CI 38017990331](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38017990331), commit `ff1b93a`: o percurso paginado passou a **reter integralmente os objetos `ViagemProjetada`** e a comparar o `deepEqual` dos 1.030 objetos com o replay, além dos hashes de JSON. O job `paged-trip-shadow-1030k` terminou SUCCESS.

| Volume (objetos retidos) | Percurso por viagem | Referência integral, executada em seguida | Resultado |
|---|---:|---:|---|
| 100.000 fatos / 100 viagens | **165,8 MiB RSS; 13,2 MiB heap; 970 ms** | 231,7 MiB RSS; 119,4 MiB heap; 729 ms | `deepEqual` das 100 viagens: PASS |
| 1.030.000 fatos / 1.030 viagens | **291,6 MiB RSS; 50,2 MiB heap; 9.257 ms** | 1.252,9 MiB RSS; 1.105,1 MiB heap; 7.491 ms | `deepEqual` das 1.030 viagens: PASS |

Na medição de 1,03 milhão, a etapa paginada utiliza aproximadamente **76,7% menos RSS** em seu ponto de medição e leva **23,6% mais tempo**. A referência integral foi executada **depois** da etapa paginada, no mesmo processo com objetos desta ainda retidos; os picos de RSS não são dois processos independentes. Portanto, a proporção é uma indicação forte de oportunidade, **não** um ganho causal isolado para o HTTP nem uma previsão de produção. Os números iniciais de 173,4 MiB descrevem a variante que guardava apenas hashes e **não devem** ser apresentados como uso completo de memória em serviço.

**Restrição que continua material:** a equivalência observada é de `ViagemProjetada[]` para um conjunto sintético de 1.000 eventos por viagem; não há equivalência demonstrada de `Projecao.cursor`, `Projecao.dimensoes`, linhas inválidas, source modes mistos ou transações adversariais. Paginado fica SHADOW, Q-016 não é substituído.

Os tempos são de duas fases executadas **sequencialmente no mesmo processo**. A prova não dá p50/p95, não mede HTTP, nem isola efeito de cache; o replay funciona como referência sem produção. Ambos usam dados sintéticos, e ordenação no PostgreSQL pode exigir sort e disco temporário em ambiente real.

## O que não provamos — não confundir memória otimizada com leitor pronto

- Apenas `trip_started` / `gps_batch_received` e `source_mode=simulated` da fixture; modos `real` e `control`, fontes sem modo/UNKNOWN, linhas corrompidas, fatos sem `trip_id`, políticas de quarentena e mutações tardias adicionais não foram objeto desta equivalência.
- `cursor` global, `dimensoes` agregadas e `quarentena` do replay Q-016 **não** foram comparados. O agrupamento por viagem não pode substituir unilateralmente o replay canônico de boot.
- Via streaming, uma única viagem contendo todos os fatos ainda pode consumir muita memória. A prova atual usa 1.000 fatos por viagem; não estabelece limite superior para caudas extremas.
- Manutenção de índices, `ORDER BY` e custo de consultas reais não foram avaliados. API real não foi modificada.
- O histórico canônico `platform.event_log` não pode ser descartado. `Q-026` (janela/legado/retention) continua aberto; `Q-024` sobre turno segue aberto.

## Contra-rota recomendada

**Prosseguir apenas em SHADOW:** primeiro comprovar economia de RSS **mantendo os objetos inteiros do resultado**, e introduzir adversários `real/simulated/control`, fato de chegada atrasado, viagem sem início, apenas GPS, histórico sem modo, evento inválido, viagem única desproporcional e comparação de dimensões/cursor quando relevante.

Se continuar vantajoso, extrair um único decoder canônico e investigar leitura `READ ONLY` com cursor e agregação de viagens para a superfície de apresentação, mantendo replay Q-016 integral disponível para recuperação. Uma implementação operacional precisaria de aprovação humanizada da Q-026, revisão independente Claude, teste real de HTTP/PG no ramo isolado, rollback, invariantes contra UNKNOWN virar 0 e autorização separada de integração/produção.

**NÃO autoriza merge** dos PRs [#29](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/29), [#31](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/31) nem [#32](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/32). Não houve alteração de `main`, produção, TATÁ Comanda, Android ou impressão. Sem novo gasto.


## Adversários reais do PostgreSQL, 9/9 — CHECKPOINT ATUAL

[GitHub Actions 38018421409](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38018421409), job `paged-adversarial-mixed-modes`, status **SUCCESS**. Suíte nova:
`tests/product/run-q026-paged-adversarial-shadow.ts`.

A suíte cria banco na versão anterior a `0003`, grava fato sem modo, aplica as migrations reais e preserva esse UNKNOWN (não faz backfill). Insere fatos sintéticos nos modos `real`, `simulated` e `control`, duas unidades, o mesmo trip_id em dois modos, sequência BIGINT ilegível, GPS sem trip_id, clock suspeito com `received_at` confiável, fechamento ocorrido ontem e recebido hoje, viagem só com GPS e segundo ciclo em aberto. Reutiliza `envelopeDaMensagem` em shadow e compara integralmente `ViagemProjetada[]` por 4 escopos contra `lerFatosParaReplay` e `projetar` existentes. Confirma também que a unicidade de `idempotency_key` é imposta no PostgreSQL, entre modos e unidades.

9 provas positivas/negativas:
1. Histórico antigo sem modo permanece NULL.
2. A porta Q-016 conta `sem_modo=1` e coloca sequência insegura em `corrompidas`.
3. `FETCH 3` lê todos os fatos aptos, contando inválidos/UNKNOWN sem inventar modo.
4. Viagens dos quatro escopos são idênticas à projeção canônica.
5. Evento de fechamento atrasado não é cortado; GPS sem ciclo segue desconhecido.
6. Relógio suspeito usa horário do servidor para frescor.
7. **FALHA ARQUITETURAL CONFIRMADA**: um evento sem viagem participa do cursor da projeção global, mas não aparece nas listas de viagens; leitura baseada exclusivamente em viagens não prova cursor equivalente.
8. **FALHA ARQUITETURAL CONFIRMADA**: dimensões da unidade são globais; projetar cada viagem separadamente não reproduz as dimensões da unidade automaticamente.
9. Unicidade de idempotência do banco impede duplicatas cruzando escopo.

O sucesso do CI significa que o teste reconheceu essas limitações, **não** que o leitor novo implemente as partes ausentes. A suíte adversarial mantém fatos em um array para comparação semântica; portanto não deve ser usada como benchmark de memória.

## Cauda longa — teste que falsifica memória estritamente limitada

[GitHub Actions 38018517394](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38018517394), job `paged-long-trip-120k`, **SUCCESS**. Arquivo novo:
`tests/product/run-q026-long-trip-shadow.ts`.

Uma **única** viagem `simulated` com 120.000 eventos em PostgreSQL descartável é percorrida com `FETCH FORWARD 4096` (30 lotes). Os 120.000 envelopes são acumulados até o fim da viagem. A `ViagemProjetada` resultante contém todos os 120.000 `eventos[]` e é exatamente igual à viagem obtida pelo replay integral (`assert.deepEqual`).

Fatos medidos no percurso paginado:
- `fetch_size=4096`, **`max_group_events=120000`** — a memória de **um grupo** não fica limitada ao tamanho do fetch.
- RSS ~192,4 MiB antes da projeção e ~204,4 MiB depois; heap ~87,8→93,2 MiB. Números desta fixture/runner, não um teto global.
- Preservar `ViagemProjetada.eventos: readonly string[]` exige ao menos O(eventos_da_viagem) identificadores de evidência na saída enquanto ela estiver materializada. Não existe algoritmo de memória O(1) para uma viagem arbitrariamente longa **sem mudar a representação/contrato**, emitir a resposta progressivamente ou descarregar parte do estado fora da RAM.

**Conclusão honesta:** a versão paginada evita materializar o log inteiro com muitas viagens curtas, mas não demonstra memória estritamente limitada sob distribuição adversarial. A vista humana Entregas usa `v.eventos.length` para a contagem, em vez de expor todos os IDs, o que sugere uma separação de representação a estudar. Porém trocar `eventos[]` por contagem dentro de `projetar()` ou excluir eventos da cadeia canônica seria alteração de contrato não autorizada.

## Decisão técnica após esses testes

**SHADOW CONTINUA.** É defensável estudar um leitor dedicado à visualização humana que calcule somente os campos que a superfície precisa (incluindo contagem e proveniência explícita), mantendo a rota Q-016 de replay integral separada e integralmente restaurável. Não implementar isso como API operacional antes de:
- provar equivalência de toda a resposta humana em modos mistos, UNKNOWN, corrupção, movimentos tardios e um conjunto de cauda longa;
- verificar consistência de snapshot no PostgreSQL e especificar semântica de cursor / quarentena / dimensões quando a superfície pedir esses campos;
- medir HTTP fim a fim e RSS em processos isolados, mais recuperação e erro;
- obter a decisão humana Q-026 e revisão independente já reservada ao Claude.

Não houve mudança no runtime, nas migrations, no HTTP ou na integração validada; `main`/produção/TATÁ Comanda permanecem intocados. Nenhum novo custo foi autorizado ou acionado.
