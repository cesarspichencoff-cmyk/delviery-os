# Auditoria — praças lógicas x roteamento real do Retail — 2026-09-30

## Objetivo

Usar a configuração real de produção da TATÁ Itaim para procurar classificações históricas de praça que mereçam revisão, sem confundir organização operacional do DeliveryOS com destino físico de impressão.

## Regra arquitetural

**Praça lógica e impressora física são dimensões diferentes.**

O DeliveryOS possui 8 praças lógicas:

- `bar_bebidas`
- `combinados`
- `cozinha_quentes`
- `duplas`
- `enrolados`
- `enrolados_quentes`
- `montagem_outros`
- `sobremesa`

O cadastro atual do Retail usa 6 destinos físicos de produção:

- `00002 COZINHA`
- `00003 DELIVERY SUSHI 1`
- `00004 DELIVERY SUSHI 2`
- `00006 BALCAOSUSHI2`
- `00007 BAR`
- `00009 BALCAOSUSHI1`

Portanto:

`LOGICAL_PLAZA != PHYSICAL_PRINTER_ROUTE`

Uma rota física pode **sustentar, contradizer ou sinalizar revisão** de uma classificação, mas não pode reclassificar automaticamente uma praça.

## Fontes

- `data/cardapio_knowledge_seed.json`: 199 itens canônicos.
- Retail — Produtos por Loja: 463 produtos, SHA-256 `f4cb1569a4c8752b831db97c2d5444bfea8c0d6fb06c0c79d83ada3bb0722737`.
- Retail — Impressoras por Loja: SHA-256 `c998375c36ee3060836ba7ad46af0a9f807f5a307e55dee40cf67881b7a40ba1`.
- Snapshot detalhado: `data/praca_routing_audit_snapshot_20260930.json`.

## Método

Foi usada correspondência conservadora de nomes:

- normalização de caixa, acentos e pontuação;
- abreviações determinísticas simples;
- nenhuma correspondência fuzzy foi promovida a fato;
- nomes sem correspondência segura ficaram sem conclusão.

Cobertura obtida:

- 199 itens no seed;
- **94 correspondências únicas determinísticas**;
- **1 correspondência ambígua**;
- **104 itens sem correspondência conservadora**.

A cobertura parcial impede qualquer conclusão do tipo "todo item de uma praça sempre imprime em X". Ela é suficiente, porém, para revelar padrões fortes e outliers verificáveis.

## Perfis observados nas correspondências únicas

| Praça lógica | Matches | Perfil físico observado |
|---|---:|---|
| `bar_bebidas` | 6 | 6 × BAR (`00007`) |
| `combinados` | 7 | 6 × BALCAOSUSHI1 + DELIVERY SUSHI1; 1 × BALCAOSUSHI1 |
| `cozinha_quentes` | 20 | 20 × COZINHA (`00002`) |
| `duplas` | 37 | 36 × BALCAOSUSHI1 + DELIVERY SUSHI1; 1 × BALCAOSUSHI2 |
| `enrolados` | 13 | 13 × BALCAOSUSHI2 + DELIVERY SUSHI2 |
| `enrolados_quentes` | 8 | 5 × BALCAOSUSHI2; 3 × BALCAOSUSHI2 + COZINHA |
| `montagem_outros` | 2 | 2 × COZINHA |
| `sobremesa` | 1 | 1 × COZINHA |

Os números acima descrevem somente a parte do seed que teve correspondência determinística.

## Achado material — Tartar de Atum Spicy

O único outlier material dentro do conjunto `duplas` é:

- seed: `Tartar de Atum Spicy`;
- praça atual: `duplas`;
- confiança atual: `inferido_com_baixa_confianca`;
- `revisao_manual=true`;
- Retail: `9.10.05.040.00 — TARTAR DE ATUM SPICY`;
- rota real: `00006 BALCAOSUSHI2`.

Entre as 37 correspondências únicas da praça `duplas`, 36 usam `00009 + 00003`. O Tartar de Atum Spicy é o único que usa `00006`.

Além disso, outros itens já classificados como `enrolados_quentes` e marcados historicamente para revisão operacional — Ceviche, Tartar de Salmão e Tuna Shisô Tartar — também usam `00006`.

**Disposição correta:** `REVIEW_CANDIDATE_NOT_AUTO_CORRECTION`.

Isso é evidência forte de que a classificação histórica merece revisão, mas **não prova sozinho** que a praça humana correta seja `enrolados_quentes`. Nenhuma alteração foi feita no seed ou no motor.

## Exceções e ambiguidades que não são erro

### Combinado Executivo Sushi Salmão

`9.05.05.080.00` usa apenas `00009 BALCAOSUSHI1`.

Isso é uma exceção operacional já explicada: Executivo é produto de almoço e sai somente nessa impressora. Não deve ser "corrigido" para imitar os demais combinados.

### Missoshiro

O Retail possui dois códigos com o mesmo nome:

- `9.00.00.020.00`
- `9.75.00.020.00`

Ambos roteiam para `00002 COZINHA`.

Portanto a identidade exata do produto é ambígua, mas a topologia física **sustenta** a praça atual `cozinha_quentes`.

### Enrolados Quentes

A praça apresenta dois padrões físicos recorrentes:

- `00006 BALCAOSUSHI2`;
- `00006 BALCAOSUSHI2 + 00002 COZINHA`.

Logo, segunda impressora não representa necessariamente uma segunda praça lógica. A arquitetura não deve tentar derivar a praça somente do conjunto de impressoras.

## Automação preparada

- `tools/gerar_retail_routing_config_v1.js` agora pode emitir um catálogo `código + nome + rotas` com `--catalog-out`.
- `tools/auditar_pracas_vs_retail_v1.js` cruza esse catálogo com o seed usando apenas correspondência determinística.
- `tools/verificar_pracas_vs_retail_v1.js` cobre:
  - perfil dominante;
  - outlier manual-review;
  - nome ambíguo com mesma rota;
  - item sem correspondência;
  - proibição de efeito automático.

## Estado após a auditoria

- seed alterado: **não**;
- motor alterado: **não**;
- configuração Teknisa alterada: **não**;
- candidato material de revisão encontrado: **1 — Tartar de Atum Spicy**;
- arquitetura das 8 praças: **preservada**;
- roteamento físico: passa a ser uma camada independente de evidência, não substituto do modelo operacional.

## Próximo gate

Antes de alterar `Tartar de Atum Spicy` no seed, a classificação operacional precisa ser confirmada na realidade correta: **qual bancada/praça humana efetivamente produz esse item**.

Se confirmado que ele pertence a Sushi Quentes, a correção deve ocorrer na fonte regenerável (`tools/build_cardapio_knowledge.js`) e depois regenerar o seed e passar pelo verificador de integridade. Não corrigir apenas o JSON gerado.
