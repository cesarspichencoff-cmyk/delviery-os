# Correção operacional humana — César · 2026-09-26

## Estado
Fonte humana atual para reconciliação DeliveryOS × TATÁ Academia.

## Embalagens
- Sashimi: 1 -> 240; 2–4 -> 450; 5–7 -> 750; 8+ -> 1.500.
- Guioza -> entrada; 650 selada.
- Tempurá de milho doce -> entrada; 650 selada.
- Ebi Spicy -> entrada; sem caixa nova inferida por esta correção.
- Na praça interna `cozinha_quentes`, itens classificados como **prato_quente** usam 1.500.
- Entradas da Cozinha não herdam 1.500 automaticamente.
- Regra explícita de item vence regra genérica.

## Vocabulário operacional
Os códigos internos permanecem por compatibilidade:
- `cozinha_quentes` -> exibir **Cozinha**.
- `enrolados_quentes` -> exibir **Sushi Quentes**.

## Catálogo
Mantido:
- Baunilha, Pistache e Melão são sabores do Choux Cream;
- menus sazonais removidos do conjunto ativo do Academia permanecem fora do conjunto normal de treinamento.

## Princípio
Praça física e tipo de item são dimensões diferentes. Estar na Cozinha não transforma uma entrada em prato.
