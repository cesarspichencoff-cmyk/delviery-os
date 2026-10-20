# V7.41 — critério de integridade de entrada (somente revisão, sem efeitos)

Estado: DRAFT/HOLD. Este documento não autoriza impressão, serviço Windows, cutover, SEFAZ, deploy ou alteração fiscal.

## Contrato de segurança

Antes de invocar qualquer cálculo de embalagens ou kits, exigir correspondência 1:1, na ordem original, entre itens do evento e entradas do motor: mesma identidade canônica e CDPRODUTO, quantidade inteira positiva comprovada, nome, classificação e origem. A classificação deve ter `review_required === false` explicitamente; valor ausente ou verdadeiro não é autorização. Se qualquer item não puder ser comprovado, **não invocar** `packComanda` nem `kitVerdict`, manter os dois resultados sem FACT e registrar bloqueio rastreável. Não inferir classe apenas pelo nome como forma de contornar ausência de classificação.

## Matriz mínima de regressão

| Cenário | Esperado |
| --- | --- |
| Kids sozinho, identidade e classificação aprovadas | preserva exceção humana: caixa 750, Sacola M, Kit Kids |
| Kids + item desconhecido | cálculo de sacola/kit suprimido; não FACT |
| Kids + item com CDPRODUTO ausente | cálculo suprimido |
| Kids + item com código canônico divergente | cálculo suprimido |
| Kids + alias com review_required=true | cálculo suprimido |
| Kids + alias com review_required ausente | cálculo suprimido |
| Kids + quantidade inválida | cálculo suprimido |
| Temaki + Tataki classificado como Dupla | regra canônica de 1 Kit p/1 preservada |
| Temaki + Sashimi verdadeiro | não inferir Kit p/1 |
| Um produto repetido em duas linhas | manter duas entradas e quantidades, sem colapsar |

Aprovação exige execução isolada dos cenários, verificação de ausência de efeitos e CI em branch de revisão. WORLD_PROVEN requer pedido **novo** observado em first-pass no host autorizado, sem imprimir.

Referências humanas: `human:cesar:2026-10-07:1-combinado-kids-alone-sacola-m`; `content-source/human-current/kits_2026-09-22_cesar.md`.
