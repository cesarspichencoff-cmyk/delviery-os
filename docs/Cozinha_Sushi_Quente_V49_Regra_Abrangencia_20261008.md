# Cozinha Sushi Quente — regra 1 porção vendida = 1 preparação (V4.9)

Data: 08/10/2026. Confirmação humana: usuário afirmou **"Cada 1 é uma porção mesmo"**, complementando a decisão anterior de incluir TODOS os produtos HOT, EBITEN e SHISO pertencentes à praça Sushi Quente.

## Regra aplicável

Quando o MOTOR ATUAL comprovar que o produto pertence à praça Sushi Quente (`enrolados_quentes`):

- Nome com palavra isolada **HOT** → **1 preparação HOT por porção vendida**.
- Nome com palavra isolada **EBITEN** → **1 preparação EBITEN por porção vendida**.
- Nome com **SHISO, SHISÔ ou SHISSO** → **1 preparação SHISO por porção vendida**.
- Se houver dois tipos correspondentes no mesmo nome, cada tipo recebe **1 porção por unidade vendida**, com a necessidade discriminada na via COZINHA — HOT / EBITEN / SHISO.

`3 × URAMAKI EBITEN (8 PEÇAS)` significa **3 porções de EBITEN**, não 24 unidades de EBITEN e não 1 EBITEN para as três porções. A quantidade de peças do produto não é a quantidade de preparações auxiliares.

## Produtos do catálogo histórico (exemplos, não lista limitativa)

| Produto | Tipo | Quantidade comprovada por porção vendida |
|---|---|---|
| Hot Roll | HOT | 1 |
| Hot Roll Tatá | HOT | 1 |
| Hot Roll com Shimeji | HOT | 1 |
| Temaki Ebiten | EBITEN | 1 |
| Uramaki Ebiten | EBITEN | 1 |
| Uramaki Ebiten Especial | EBITEN | 1 (regra específica já existente) |
| Tuna Shisô Tartar | SHISO | 1 |

Produtos novos com a praça atual Sushi Quente comprovada também entram na regra pelo termo completo correspondente, sem precisar mudar a tabela de nomes históricos.

## Arquitetura e prova

- `data/kitchen_sushi_quente_scope_v49.json`: **fonte da nova confirmação humana de 1:1 por categoria**, com referência e limites.
- `src/production/kitchenSushiQuenteScopeV49.ts`: classifica por nome e praça atual PROVEN. Para produtos elegíveis, materializa regras exatas **temporárias do pedido** e as envia ao motor existente `projectKitchenNeeds`; não cria somador paralelo.
- O arquivo preexistente `data/kitchen_dependency_rules_v1.json` **permanece intocado**, preservando a regra específica anterior para Uramaki Ebiten Especial. Conflitos entre regra específica e nova regra 1:1 são bloqueados e exigem revisão humana.
- A praça indicada no catálogo histórico de julho **não é prova de roteamento atual**. A estação comprovada do pedido prevalece; praça desconhecida fica em revisão. Itens de outras praças não entram por semelhança de nome.
- A via COZINHA — PRATOS continua independente, com observações originais preservadas. Nenhum pedido é duplicado entre as vias.
- `tools/verificar_kitchen_sushi_quente_v49.js`: 18 testes de regra, quantidades, termos, provas, conflitos, integração ao motor e ausência de efeitos físicos.

## Limite de aprovação

Esta instrução confirma **fator 1 por porção para a classe definida**, mas **NÃO** confirma que todos os outros produtos do cardápio tenham ZERO de dependência da cozinha.

`coverage=PARTIAL` continua correto até validação de outras possíveis dependências e do roteamento global. Portanto, o gerador mantém `ready_for_automatic_operational_print=false`: código de cálculo preparado para inspeção, **não** impressão operacional autorizada.

Ainda faltam entrada real completa e idempotente do pedido, cobertura de eventuais dependências fora desta classe, calibração física da Epson e aceite no chão de operação. Não fazer merge, deploy, cutover, impressão, spooler nem alteração de estoque/fiscal sem portões posteriores.

Estado: regra humana confirmada / código SHADOW testado; não WORLD_PROVEN.