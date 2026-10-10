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

**Cuidado metodológico:** nessa versão inicial, o percurso paginado guardava *hashes*, não os objetos finais de viagem; a comparação demonstra igualdade do JSON das viagens, mas o pico de memória de 173 MiB ainda NÃO é uma comparação justa da saída viva completa. O commit `ff1b93a` acrescentou a retenção dos objetos completos `ViagemProjetada` e o `deepEqual` completo com o replay. A execução CI atual precisa ser consultada e registrada antes de citar novos ganhos.

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
