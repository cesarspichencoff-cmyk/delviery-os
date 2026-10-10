## Regra SKIN — pré-preparo em lote confirmado por César (10/10/2026)

**Regra humana vigente:** A Cozinha prepara a pele de salmão **em lote, antes dos pedidos**, e entrega o ingrediente pronto ao Sushi para montagem.

### Efeitos no DeliveryOS
- O Uramaki Skin vendido continua sendo um item do pedido e da praça comprovada de montagem, com sua quantidade integral e observações.
- Uma venda com SKIN **não dispara comanda adicional ou tarefa 1:1 de preparo na Cozinha**. Isso vale para 1, 2 ou várias unidades, pois a cozinha já preparou o ingrediente em lote.
- O campo `skin_preparation_handoffs` do contrato V4.9 conserva a responsabilidade Cozinha → Sushi, com `preparation_mode=BATCH_BEFORE_ORDERS`, `per_order_dispatch=NOT_REQUIRED_BATCH_PREPARATION`, `generates_kitchen_ticket=false` e `kitchen_requested_quantity=null`.
- A antiga revisão `SKIN_ORDER_TRIGGER_AND_PREP_FACTOR_NOT_CONFIRMED` **não é mais emitida**; a forma de preparo e o disparo por pedido estão definidos.
- Se um item for HOT + SKIN, o motor conserva a dependência de HOT conforme regras vigentes e não cria consumo ou tarefa adicional para SKIN.
- Este registro **não altera o leitor Windows, o roteamento da praça Sushi, a impressão, nem o estoque**.

### Informações não confirmadas (fora da regra por pedido)
- Quantidade preparada por lote.
- Frequência, horário e ponto de reposição ou gatilho de produção de novos lotes.
- Política de controle de estoque do lote e forma exata de preparo.

Não inferir qualquer valor. Um futuro módulo de pré-preparo/estoque depende de regra humana separada. Isso **não precisa impedir a projeção das comandas por pedido quando as demais provas estiverem completas**.

**Implementação:** `data/kitchen_skin_human_fact_v50.json`, `src/production/kitchenSushiQuenteScopeV49.ts`.

**Provas:** 24/24 testes de escopo de Sushi Quente, incluindo múltiplas unidades de SKIN, palavras parecidas sem SKIN verdadeiro e HOT+SKIN sem duplicidade. CI completa em https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38054229177: **PASS**. PR #38 segue em DRAFT, sem merge, deploy ou impressão.
