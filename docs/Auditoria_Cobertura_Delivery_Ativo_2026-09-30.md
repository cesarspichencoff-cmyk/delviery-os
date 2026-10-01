# Auditoria — cobertura real do delivery ativo — 2026-09-30

## Objetivo

Medir quanto do delivery realmente vendido no dia já está coberto pela cadeia:

`produto vendido → código → rota física configurada → praça lógica`

sem confundir ausência de rota física com autorização para ignorar um item.

## Fontes

- `Vendas-de-Produto-no-Perodo-Analtico-por-Unidade.xlsx`
  - SHA-256: `a17581df113cbe2ce640345ede7f889790b4f82f70f8ab42f9072eb733b9fa22`
  - modalidades incluídas: `Delivery`, `Delivery IFood`, `Delivery Loja`
- Produtos por Loja:
  - SHA-256: `f4cb1569a4c8752b831db97c2d5444bfea8c0d6fb06c0c79d83ada3bb0722737`
- Impressoras por Loja:
  - SHA-256: `c998375c36ee3060836ba7ad46af0a9f807f5a307e55dee40cf67881b7a40ba1`
- seed operacional atual: `data/cardapio_knowledge_seed.json`

Snapshot: `data/active_delivery_routing_coverage_20260930.json`.

## Cobertura observada

O relatório contém:

- **120 SKUs distintos de delivery**
- **1.476 unidades**

Cobertura de rota física direta pelo cadastro atual:

- **116/120 SKUs = 96,67%**
- **1.439/1.476 unidades = 97,49%**

Cobertura de praça lógica:

- **120/120 SKUs possuem uma praça lógica resolvida**
- 68 SKUs / 977 unidades por correspondência exata com o seed;
- 52 SKUs / 499 unidades por regra determinística de grupo + rota.

As 52 inferências **não são promovidas a fato operacional** apenas por terem resolução determinística.

## Distribuição lógica do delivery observado

| Praça | SKUs | Unidades |
|---|---:|---:|
| enrolados | 15 | 354 |
| duplas | 43 | 327 |
| combinados | 15 | 312 |
| cozinha_quentes | 18 | 208 |
| enrolados_quentes | 12 | 142 |
| bar_bebidas | 9 | 60 |
| montagem_outros | 5 | 45 |
| sobremesa | 3 | 28 |

## 4 itens sem rota direta — RESOLVIDOS COMO COMPLEMENTARES SEM COMANDA PRÓPRIA

### 1. COOKIE NUTELLA
- código da venda: `8201100100`
- canônico: `8.20.11.001.00`
- 13 unidades no delivery
- praça lógica: `sobremesa` — **inferência**
- não aparece no snapshot atual de Produtos por Loja.

### 2. GENGIBRE PORÇÃO
- código da venda: `9750003100`
- canônico: `9.75.00.031.00`
- 17 unidades no delivery
- praça lógica: `montagem_outros` — **inferência**
- não aparece no snapshot atual de Produtos por Loja.

### 3. WASABI
- código da venda: `9750003000`
- canônico: `9.75.00.030.00`
- 6 unidades no delivery
- praça lógica: `montagem_outros` — correspondência exata com o seed
- não aparece no snapshot atual de Produtos por Loja.

### 4. TARE
- código da venda: `9750003200`
- canônico: `9.75.00.032.00`
- 1 unidade no delivery
- praça lógica: `montagem_outros` — correspondência exata com o seed
- não aparece no snapshot atual de Produtos por Loja.

Total: **4 SKUs / 37 unidades**.

César confirmou operacionalmente que os quatro itens são **complementares, apenas montados/separados e não geram comanda própria de produção**.

Portanto o estado correto não é mais `UNKNOWN`. Eles passam a:

`NO_OWN_PRODUCTION_TICKET`

Registro canônico desta confirmação:
`data/non_production_delivery_items_v1.json`.

## Consequência da confirmação

A ausência desses quatro códigos no cadastro de rota é agora coerente com a operação observada:

- eles continuam existindo como itens do pedido;
- continuam contribuindo para a praça lógica de montagem/sobremesa;
- possuem **zero destinos de impressora por desenho operacional**;
- não bloqueiam mais a projeção completa do pedido;
- qualquer futura rota física configurada para um desses códigos deve ser tratada como **drift/conflito** até revisão.

Cobertura após a confirmação:

- rota física direta: **116/120 SKUs = 96,67%**;
- comportamento de produção resolvido: **120/120 SKUs = 100%**;
- unidades com comportamento de produção resolvido: **1.476/1.476 = 100%**;
- gaps físicos em aberto: **0**.

## Verificação cruzada

No relatório geral `Produtos Vendidos`, há seis códigos vendidos que não aparecem no cadastro de rota. Quatro são os itens operacionais acima; os outros dois são:

- `9980000000 — GORJETA CONCEDIDA`
- `9980000100 — TAXA DE ENTREGA`

Esses dois são classificados no próprio relatório como `TAXA DE SERVICO` e não entram no universo de produção.

## Automação preparada

- `tools/auditar_delivery_active_routing_coverage_v1.js`
  - lê um novo XLS de vendas;
  - considera apenas modalidades iniciadas por `Delivery`;
  - agrega por código;
  - cruza com a rota física;
  - cruza a praça com o seed quando o nome é exato;
  - usa inferência explícita, separada de fato, para grupos conhecidos;
  - retorna código de erro somente quando há SKU sem rota física **e** sem confirmação explícita de `NO_OWN_PRODUCTION_TICKET`.

- `tools/verificar_delivery_active_routing_coverage_v1.js`
  - cobre item com rota;
  - item vendido sem rota;
  - filtro de Mesa;
  - praça exata do seed;
  - efeitos todos desligados.

## Consequência para o teste live

O gate agora está fechado para os produtos observados no delivery de hoje:

`pedido Odhen → itens → para cada código: ROTA_CONFIGURADA ou NO_OWN_PRODUCTION_TICKET`

O motor nunca deve transformar código ausente em silêncio genérico. Só aceita zero impressoras quando o código estiver no registro humano-confirmado de itens sem comanda própria.
