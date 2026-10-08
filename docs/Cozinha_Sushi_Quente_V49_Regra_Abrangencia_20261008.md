# Cozinha — abrangência Sushi Quente (V4.9, SHADOW)

Data: 08/10/2026. Fonte: instrução operacional humana desta missão.

## Regra expressa

**Todos os produtos cuja praça atual comprovada é Sushi Quente e cujo nome contenha o termo HOT, EBITEN ou SHISO (incluindo grafias SHISÔ/SHISSO) entram no escopo da comanda separada COZINHA — HOT / EBITEN / SHISO.**

A outra via COZINHA — PRATOS permanece independente. As tarefas auxiliares não devem ser impressas na via de pratos. Não duplicar por praça ou por reimpressão.

Esta confirmação define **quais produtos devem ser considerados**. Não especifica quantos HOT, EBITEN ou SHISO a cozinha prepara por porção de cada produto.

## Implementação

- `data/kitchen_sushi_quente_scope_v49.json`: regra de abrangência confirmada, sem declarar multiplicadores nem alterar o arquivo existente de yields.
- `src/production/kitchenSushiQuenteScopeV49.ts`: classifica itens POR PEDIDO; exige prova do roteamento atual `enrolados_quentes`, reconhece termos completos e variantes de acento. Se houver categoria comprovada diferente, o item não entra.
- O catálogo `data/cardapio_knowledge_seed.json` é histórico (01/07/2026): um nome encontrado ali constitui referência de triagem, **nunca prova de praça atual**. Produtos novos da praça atual comprovada também são abrangidos.
- A interface `projectTwoKitchenTicketsScopedV49` usa o motor existente `projectKitchenNeeds` via `splitTwoKitchenTicketsFromRulesV47`, sem criar somador paralelo de preparações.
- Nenhuma associação a impressora real, caixa, fiscal, estoque ou Odhen foi criada.

## Produtos do catálogo histórico alcançados

| Produto | Preparação | Regra de quantidade |
|---|---|---|
| Hot Roll | HOT | PENDENTE |
| Hot Roll Tatá | HOT | PENDENTE |
| Hot Roll com Shimeji | HOT | PENDENTE |
| Temaki Ebiten | EBITEN | PENDENTE |
| Uramaki Ebiten | EBITEN | PENDENTE |
| Uramaki Ebiten Especial | EBITEN | 1 por porção, regra humana já existente |
| Tuna Shisô Tartar | SHISO | PENDENTE |

O arquivo `data/kitchen_dependency_rules_v1.json` permanece **PARCIAL** e não foi modificado. Não inferir 1 HOT/EBITEN/SHISO para os outros seis por causa da presença da palavra no nome. Também não inferir ZERO para produtos cujo nome não contenha essas palavras: se sua composição aprovada envolver preparação auxiliar, acrescentar a regra exata com prova operacional.

## Testes e limites

Comando: `npm run verificar:kitchen-sushi-quente-v49`.

O teste cobre os sete produtos históricos, proporção já conhecida 1:1 para Uramaki Ebiten Especial, distinção entre Sushi Quente e Cozinha Quente, motor atual prevalecendo sobre catálogo histórico, item novo de Sushi Quente, acentos SHISÔ/SHISSO, limites de palavras, quantidade não inventada, ausência de duplicação de pratos, rastreio e nenhum efeito externo.

A regra de escopo pode ser humana e válida enquanto o multiplicador permanece **UNKNOWN**. Sem fator confirmado, não gerar bytes de impressão de preparações. O teste físico só ocorrerá depois de origem real comprovada, calibração Epson e aprovação operacional específica.

Estado: SHADOW_TEST_PASS, não DEPLOYED, não WORLD_PROVEN. Sem merge/cutover/ativação.