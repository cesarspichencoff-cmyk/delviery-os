# Validação — Cérebro da Conferência V1

Reexecutável a qualquer momento:

```bash
node tools/conference-brain/validate-historical.js          # sai != 0 se algo divergir
node tools/conference-brain/validate-historical.js --json   # grava validation-run.json
```

Nenhuma regra foi recalibrada nesta validação. O objetivo era descobrir se a
fundação sobrevive aos dados reais — não ajustá-la até que sobrevivesse.

---

## 1. Fontes

| Arquivo | Tamanho | Registros | Estratégia |
|---|---|---|---|
| `ifood_2026-06-20_a_2026-06-30/relatorio_pedidos_com_itens_jun20-30.html` | 1,14 MB | 3.215 | array embutido |
| `ifood_2026-07-01/relatorio_pedidos_01-07.html` | 0,44 MB | 250 | cards `order-card` |

Arquivos locais que já existiam no projeto. Sem rede, sem automação de interface,
sem contorno de autenticação.

## 2. Resultado da ingestão

```
status da execucao concluido
observados         3465
normalizados       3465
duplicados           36
rejeitados            0
PEDIDOS UNICOS     3429      <- número esperado pela missão: 3.429  OK
linhas de item    11230
eventos de status  3698
saude da fonte     parcial  confianca=media
campos ausentes    ready_at, dispatched_at, confirmed_at
anomalias            36  (divergentes: 36)
```

## 3. A divergência de linhas de item — investigada e fechada

A missão registrava **11.355** linhas de item. A implementação produziu 11.230.
A diferença não foi tratada como erro de arredondamento; foi rastreada.

```
  11.355   itens "dist." declarados pela FONTE nos 3.465 registros observados
-    125   itens das 36 ocorrências duplicadas
--------
  11.230   itens declarados nos 3.429 pedidos únicos
  11.230   itens efetivamente persistidos          <- divergência ZERO
```

**11.355 é a contagem antes da deduplicação.** Os dois números estão certos;
medem coisas diferentes. Referência correta daqui em diante:

- **3.465** registros observados / **11.355** itens declarados — bruto;
- **3.429** pedidos únicos / **11.230** itens — depois da deduplicação.

Durante essa investigação apareceu um defeito real: a contagem parseada estava
em 11.233, três a mais que o declarado. Eram itens fantasma criados por
observações do cliente com quebra de linha (ver
[INGESTION_V1](INGESTION_V1.md) §3). Corrigido; as contagens passaram a fechar
exatamente.

## 4. Duplicidade entre lotes

36 duplicatas, **todas entre os dois arquivos** — os relatórios de 20–30/06 e de
01/07 se sobrepõem. Exemplo: `a0eb2c4d-4f77-497b-a731-545bd89e1747`.

Todas classificadas `duplicidade_com_divergencia` (os dois lotes trazem o mesmo
pedido com completude diferente), resolvidas por
`dedupe-v1:prefer-most-complete-then-earliest-observation`, com o que divergiu
registrado em anomalia. Nada descartado em silêncio.

## 5. Normalização de itens

- 11.230 linhas de item sobre 3.429 pedidos;
- **11.230 linhas casadas · 0 sem correspondência** contra o catálogo de 199
  itens — o que casou foram **154 nomes distintos observados** nos dados, não
  os 199 itens do seed. Os outros 45 itens do cardápio simplesmente não
  apareceram nestes 12 dias; isso não é um problema do parser, é o que a
  operação real vendeu no período;
- 3.698 eventos de status (recebimento + cancelamentos);
- valores monetários conferidos por amostra: `R$ 90,99` → `90.99`;
- horários com offset `-03:00`: `"20/06/2026 11:05"` → `2026-06-20T11:05:00-03:00`.

Amostra auditável impressa a cada execução:

```
97a460ff-...  2026-06-20T11:05:00-03:00  status=concluido  total=90.99
   1x Beef com Nirá
5fcc3919-...  2026-06-20T11:09:00-03:00  status=concluido  total=60.98
   1x Combinado Kids  // Se possível, trocar as fatias de sashimi por outros niguiris por favor
```

## 6. Snapshots

```
janelas geradas        3287
janelas com chegada    1047
janelas com ativos        0      <- correto: a fonte não carimba PRONTO
pico de chegadas/5min    17
saude da fonte      parcial
nota   fonte_nao_observa_pronto:ativos_e_convergencia_indisponiveis
```

## 7. Distribuição de estados na fonte real

```
leitura_parcial   3287   (100,0%)
janelas fora do modo sombra: 0
```

**Este é o resultado certo, não uma falha.** A fonte histórica não observa
quando o pedido ficou pronto. Sem isso não há pedido ativo, e sem pedido ativo
não há faixa de carga. A fundação se recusa a afirmar — em vez de devolver
`calmo` sobre cegueira, que seria a pior falha possível neste produto.

Consequência honesta: **as faixas 30/50/70 não puderam ser exercitadas contra os
dados reais**, apenas contra cenários controlados. Elas continuam sendo hipótese
validada por análise, não por execução sobre a fonte histórica. É exatamente por
isso que operam em sombra.

## 8. Faixas e atenção abaixo de 50 (cenário controlado)

```
 10 -> calmo     30 -> fluindo    50 -> atencao    70 -> urgencia
 29 -> calmo     49 -> fluindo    69 -> atencao    95 -> urgencia

34 ativos, sem convergência         -> fluindo
34 ativos, com convergência e ritmo -> atencao   (base: fluindo)
```

Confirma que atenção ocorre abaixo de 50 por sinal observado, com as razões
nomeadas — endereçando os 22% de sofrimento sob 50 ativos.

## 9. Composição sobre os dados reais

2.029 de 3.429 pedidos têm ao menos um sinal:

| Sinal | Pedidos |
|---|---|
| `HOT_AND_COLD` | 1.462 |
| `MULTI_PRACA` | 1.339 |
| `HAS_OBSERVATION` | 576 |
| `HAS_DRINK` | 275 |
| `HAS_ASSEMBLY_ITEM` | 272 |
| `HAS_DESSERT` | 187 |
| `MANY_UNITS` | 66 |
| `DECLARED_RESTRICTION` | 24 |
| `POSSIBLE_MULTI_VOLUME` | 15 |
| `CATALOG_MATCH_INCOMPLETE` | 0 |

**Pedidos que alteram o estado global: 0.** Contrato cumprido.

Observação de produto: 1.462 pedidos com quente e frio juntos é quase metade da
operação — o sinal é frequente demais para virar alerta e útil como contexto de
montagem. Isso reforça a decisão de manter composição fora do estado global; não
é conclusão nova, é confirmação empírica dela.

## 10. Verificações automáticas

O script falha (exit ≠ 0) se qualquer linha abaixo não passar:

```
OK  pedidos unicos apos dedup              3429 (esperado 3429)
OK  duplicados detectados                  36
OK  ingestao concluida sem excecao         concluido
OK  nenhum registro rejeitado              0
OK  fonte reportada como parcial           parcial
OK  nenhuma janela fora do modo sombra     0
OK  fonte sem PRONTO nao afirma carga      0 janelas com ativos
OK  atencao possivel abaixo de 50          atencao
OK  composicao nao altera estado global    0

VALIDACAO CONSISTENTE
```

Execuções repetidas produzem os mesmos números (idempotência por chave natural).

## 11. Suítes de teste

| Suíte | Resultado | Comando |
|---|---|---|
| live | 243 passando, 0 falhas | `node --test tests/live/*.test.js tests/live/simulator/*.test.js` |
| copiloto | 53 passando, 0 falhas | `npm run copiloto:test` |
| capacidade viva | 43 passando, 0 falhas | `npm run capacidade:test` |
| **conference-brain (novo)** | **55 passando, 0 falhas** | `node --test tests/conference-brain/*.test.js` |

As três suítes existentes estavam verdes antes e continuam verdes: nenhum arquivo
pré-existente foi alterado por esta implementação.

## 12. O que esta validação NÃO prova

Registrado explicitamente, para que ninguém leia mais do que está escrito:

- **não prova** que as faixas 30/50/70 estão calibradas — a fonte real não
  permitiu exercitá-las;
- **não prova** que os modificadores acertam na operação real — só que disparam
  como especificado;
- **não prova** nada sobre convergência real, tempo até pronto real ou prontidão
  — não há fonte que os observe;
- **não substitui** comparação com a percepção humana da operação, que é o
  próximo teste de verdade e depende de uma fonte com carimbo de pronto.
