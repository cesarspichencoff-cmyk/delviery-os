# Q-026 — Custo da ordenação no PostgreSQL (SHADOW)

**Data:** 2026-10-10. **Alcance:** apenas PostgreSQL 16 DESCARTÁVEL no GitHub Actions, sem migrations, sem runtime, sem deploy ou dados operacionais.

## Por que isso importa

O PR #37 mede uma representação compacta e o PR #39 prova uma viagem longa sem reter todos os IDs no Node. O PR #40 une a viagem longa a múltiplas unidades e modos. Essas pesquisas **não** limitam por si só o trabalho que o **servidor PostgreSQL** executa antes de entregar cada `FETCH`.

A consulta de cursor classifica o event log por `unit_id, source_mode NULLS LAST, object_type, object_id` com filtro `event_type = ANY(TIPOS_DA_OPERACAO_VIVA)`. O índice existente na migration 0001 é `(object_type, object_id, occurred_at)`, não esse composto. Em memória de sort restrita, o otimizador pode escolher scan + sort e escrever arquivos temporários em disco, mesmo quando o consumidor Node só retém 257 ou 4096 linhas por lote.

## Teste e provas

Arquivo `tests/product/run-q026-pg-sort-cost-shadow.ts`; workflow `.github/workflows/deliveryos-q026-pg-sort-cost-shadow.yml`. PostgreSQL 16 inicializado com migrations reais; 132.000 fatos sintéticos, dos quais 120.000 em `ONE-LONG` de `ITAIM/simulated`, e outros 12.000 distribuídos entre duas unidades e três modos. Transações de medição declaradas `READ ONLY`, `SET LOCAL work_mem='64kB'`; `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` executado três vezes em cada condição, sem escrituras nesses comandos. As inserções iniciais e criação do índice são **exclusivas do banco descartável**.

A hipótese crítica de unicidade foi verificada **no banco efetivo**: inserção com `event_id` novo, mas `idempotency_key` repetida via `ON CONFLICT (idempotency_key) DO NOTHING RETURNING` retornou 0 linhas; contagem do log permaneceu em 132.000. Isso confirma a premissa de deduplicação do acumulador para a fonte `platform.event_log` dessa migration, mas **não substitui o Set idempotente no replay Q-016 genérico**.

[Primeira prova completa: CI 38054630231](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38054630231): SUCCESS, medição simples 120 ms sem índice (Gather Merge, sort externo em disco) e 28,5 ms com índice (Index Scan, sem arquivos temporários). **Uma execução isolada não é base para alegar ganho operacional.**

[Rodada com três amostras: CI 38054714750](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38054714750): SUCCESS. Valores observados, no mesmo banco descartável, três consultas por condição:

| Condição | Tempos medidos (ms) | Mediana (ms) | Plano e disco |
| --- | --- | ---: | --- |
| Antes | 222,4 · 220,2 · 225,9 | **222,4** | `Gather Merge`; ordenação `external merge` em disco nos 3 testes |
| Depois | 52,6 · 49,2 · 46,9 | **49,2** | `Index Scan`, índice experimental; 0 blocos temporários em cada teste |

Índice criado **somente no PostgreSQL descartável**: `CREATE INDEX q026_shadow_cursor_idx ON platform.event_log (unit_id,source_mode,object_type,object_id)`. Tamanho observado: **1.040.384 bytes (~0,99 MiB)**; tamanho total da relação passou de **64.585.728** para **65.626.112 bytes**. Nenhum DDL foi produzido para integração, `main` ou ambiente real.

O plano sem índice indicou `Temp Read Blocks=9.988`, `Temp Written Blocks=10.600` (contadores do plano; não confundir com a memória do Node ou com RSS do Postgres), com maior sort `external merge` e `Sort Space Used=11.048 KiB` na amostra central. Com índice, o plano foi `Index Scan`, zero blocos temporários de ordenação reportados.

## Limites e recomendações condicionais

- **Isso não autoriza criar índice em produção.** Inserções de alta frequência, WAL adicional, manutenção, VACUUM, bloat, locks, espaço em disco e impacto em ingestão ainda não foram medidos. O conjunto sintético estático tem distribuição artificial e o PostgreSQL usou `work_mem` intencionalmente baixo (64 KiB). Medianas de três amostras não são benchmark de throughput/p95 do Itaim.
- O planner pode escolher alternativas distintas conforme cardinalidade, seletividade, versão, estatísticas, paralelismo e configurações. Não inferir melhora de 4,5x para toda instalação nem para qualquer consulta. A medição é da consulta `EXPLAIN ANALYZE`, não do HTTP.
- **Cursor limitado NÃO implica memória do PostgreSQL limitada.** A ordenação pode construir uma estrutura (em memória/disco) antes de devolver páginas. A prova sustenta um possível índice de leitura que precise ser reavaliado na carga representativa e com custo de escrita mensurado.
- A auditoria do Claude sobre snapshots/concorrência (issue #36) ocorre independentemente. Não confundir o índice experimental com consistência temporal: mesmo com bom plano, leituras em transações distintas podem refletir instantes diferentes.
- Q-016 mantém replay append-only, modos `UNKNOWN`, quarentena, cursor e IDs; Q-026 ainda depende de decisões humanas sobre janela/retention/legado. Nada disso foi alterado.

**Estado:** teste SHADOW; provas no PG descartável e CI, não `DEPLOYED` ou `WORLD_PROVEN`. Branch isolada derivada do PR #40, nenhum arquivo `src/` modificado. **HOLD sem merge**, custo adicional zero.
