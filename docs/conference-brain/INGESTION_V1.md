# Ingestão — Cérebro da Conferência V1

`src/conference-brain/ingestion/pipeline.js`

## 1. Os sete contratos

| Contrato | O que faz | Garantia |
|---|---|---|
| `observe()` | pede as linhas brutas ao adaptador | não interpreta nada |
| `normalize(row, i)` | bruto → pedido/itens/eventos | exceção vira `{error}`, não crash |
| `deduplicate(order)` | resolve pedido já conhecido | registra o que divergiu |
| `persist(entity, rec)` | grava validando schema | rejeitado vai para quarentena |
| `checkpoint(v)` | marca o ponto alcançado | por índice + `order_id` |
| `resume(cp)` | retoma do ponto | reprocessar é seguro (idempotente) |
| `reportHealth()` | diz o que a fonte permite afirmar | nunca otimista |

`run()` executa tudo e **nunca lança**: falha vira `status: "falhou"` + anomalia
+ `source_state: indisponivel`. Um erro de ingestão não pode derrubar nada.

## 2. O adaptador é a única porta

Um adaptador fornece apenas:

```js
{ source, channel, collectorVersion, parserVersion,
  observe(),                  // -> [linhas brutas]
  normalizeRow(row, ctx) }    // -> {order, items, events, missing_fields, warnings}
```

Nada mais. O coletor de navegador do futuro entra pela mesma porta **sem tocar**
no pipeline, nos snapshots ou no estado sombra.

### Adaptadores existentes

**`historical-html.js`** — lê os relatórios HTML que **já existem** no projeto,
exportados manualmente da sessão autorizada do lojista. Não acessa a rede, não
automatiza a interface do iFood, não contorna autenticação: `fs.readFileSync` e
mais nada. Duas estratégias reais de extração:

1. array JS embutido (`const ALL_ROWS = [...]`) — não executa script, faz
   `JSON.parse` do trecho;
2. cards `order-card` do relatório diário — extrai `order-id-text`,
   `order-time`, `badge badge-X`, `order-total`, pares `col-name`/`col-qty` e
   `obs-text`.

O card traz só a **hora**; a data vem do contexto (`inferReportDate` pelo nome do
arquivo). Sem data conhecida, a linha é devolvida com `dt: null` para que a
normalização a rejeite explicitamente — em vez de inventar um dia.

**`structured-payload.js`** — fixtures de teste e futuro porto do coletor de
navegador; pode carregar carimbos de `ready_at`/`dispatched_at`.

## 3. Normalização

`src/conference-brain/normalize/normalizer.js` — puro, sem I/O.

| Entrada | Saída | Regra |
|---|---|---|
| `"20/06/2026 11:05"` | `"2026-06-20T11:05:00-03:00"` | offset fixo: São Paulo não usa DST desde 2019 |
| `"R$ 1.234,50"` | `1234.5` | inválido → `null`, **nunca** `0` |
| `"5 dist. / 7 un."` | `{distinct:5, units:7}` | ausente → `null` |
| `"DECLINED"` | `cancelado` + nota `recusado_pela_loja_ou_plataforma` | cancelamento com natureza preservada |
| `"1x Hot Roll <em>(sem cebola)</em>"` | item + `observation` | observação é do pedido, não inventada |

Coerência é **declarada, nunca corrigida em silêncio**: se as unidades somadas
divergem das declaradas, sai `unidades_divergentes:declarado=N,somado=M` em
`warnings` e a confiança do pedido cai para `media`.

Esta fonte não observa pronto nem saída. `missing_fields` sempre recebe
`ready_at`, `dispatched_at`, `confirmed_at`. Isso não é omissão — é a declaração
que impede o resto do sistema de fingir que sabe.

### Defeito real corrigido durante a validação

Observação do cliente escrita em mais de uma linha partia o bloco `<em>` na
divisão por `\n`, e o resto da frase virava um **item fantasma**. Caso real
(`a54ed75c`): `1x Ceviche <em>(não gosto de tilapia ao inves` / `pode colocar
salmao)</em>` produzia um item chamado *"pode colocar salmao"*.

Correção: linhas partidas dentro de um `<em>` aberto são reunidas antes do
parse, e o nome do item passa a sair da linha **sem** o bloco `<em>`. O texto do
cliente é preservado inteiro, com a quebra original.

Impacto: 3 pedidos, 3 itens fantasma. Eram exatamente os 6 itens que não casavam
no catálogo — depois da correção, **100% de correspondência**. Travado por dois
testes (`observacao com quebra de linha nao cria item fantasma` e
`a quebra escrita pelo cliente e' preservada na observacao`).

## 4. Deduplicação

`src/conference-brain/normalize/dedupe.js` · regra
`dedupe-v1:prefer-most-complete-then-earliest-observation`.

1. `completeness()` conta campos preenchidos;
2. vence o mais completo; empate → observação mais antiga;
3. `compare()` percorre os campos comparados e lista o que divergiu;
4. `merge()` preenche nulos, alarga a janela de observação e **rebaixa a
   confiança** quando houve divergência;
5. `toAnomaly()` gera `duplicidade_com_divergencia` ou `duplicidade_identica`.

Nada é descartado em silêncio: toda duplicidade vira anomalia com evidência.

### Nos dados reais

36 duplicatas, **todas entre os dois arquivos** — o relatório de 20–30/06 e o de
01/07 se sobrepõem. É exatamente o caso que a deduplicação existe para tratar, e
foi encontrado sem ser procurado.

## 5. Saúde da fonte — o pessimismo é intencional

`reportHealth()` nunca é otimista:

- falta `ready_at` ou `dispatched_at` → `parcial` (não dá para afirmar carga);
- execução falhou → `indisponivel`;
- duplicatas divergentes com fonte que estaria `disponivel` → `inconsistente`;
- confiança segue o estado: `disponivel`→alta, `parcial`→média, resto→baixa.

Na fonte histórica real o resultado é `parcial`, confiança `media`, com
`missing_fields = [ready_at, dispatched_at, confirmed_at]`. Correto: essa fonte
não pode sustentar uma afirmação de carga, e o sistema diz isso em vez de
inventar.

## 6. Preservação do bruto

Cada linha observada gera um `ingestion_raw_records` com `payload_hash`
(SHA-256), `parser_version` e `collector_version`. O L0 é a evidência: qualquer
número produzido adiante pode ser rastreado até o byte que o originou.
