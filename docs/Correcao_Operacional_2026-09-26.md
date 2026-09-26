# Correção operacional humana — César · 2026-09-26

## Estado
Fonte humana atual para reconciliação DeliveryOS × TATÁ Academia.

## Embalagens
- Sashimi: 1 -> 240; 2–4 -> 450; 5–7 -> 750; 8+ -> 1.500.
- Na praça interna `cozinha_quentes`, **prato grande** usa caixa 1.500.
- Todo item da Cozinha que não seja prato grande usa 650 selada.
- Exemplos confirmados de 650: Guioza, Tempurá de milho doce, Ebi Spicy e Edamame.
- **Missoshiro usa pote de isopor; não usa caixa 650.**
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
Praça física, tipo de item e embalagem específica são dimensões diferentes. Estar na Cozinha não transforma um item em prato grande, e exceção explícita vence a regra geral.
