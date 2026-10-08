# COZINHA — duas comandas distintas (V4.7 SHADOW)

Decisão humana de César, 08/10/2026: a cozinha terá duas vias independentes, nunca HOT/EBITEN/SHISO misturados com os pratos.

## 1 — COZINHA: HOT / EBITEN / SHISO
- Somente as preparações auxiliares com quantidades grandes.
- Somar uma vez pelo pedido original, não uma vez por cada impressora ou praça.
- Fonte: kitchenDependencies.ts e regras de dependências humanas auditadas, não nome inferido.
- Não gerar via vazia. Se cobertura de regras for parcial, permitir somente preview de revisão e bloquear bytes de impressão.

## 2 — COZINHA: PRATOS
- Somente os pratos roteados explicitamente para a praça COZINHA pelo plano atual.
- Nome do produto em maiúsculas e uma linha, quantidade em destaque e observação ligada ao item.
- Não mostrar AGUARDAR COZINHA: HOT/EBITEN/SHISO na via de pratos porque há comanda exclusiva de preparações.
- Não gerar via vazia e não mover sushi, bar ou outra praça com heurística de nomes.

Ambas preservam identificação iFood, TEKNISA e sequência TATÁ original.

## Código isolado
- src/production/twoKitchenTicketsV47.ts: divisão sem modificar os motores existentes, conferência de origem, identidade e totais.
- src/production/twoKitchenTicketEscposV47.ts: dois formatos OFFLINE, com dados separados.
- src/production/kitchenSeparatedOfflineBundleV47.ts: substitui a via antiga da COZINHA no pacote offline, sem adicionar uma terceira via duplicada. Preserva as outras praças e a conferência.
- tools/verificar_two_kitchen_tickets_v47.js: 16 testes de segurança e regressão.

## Limite do conhecimento operacional
data/kitchen_dependency_rules_v1.json ainda declara coverage=PARTIAL.
Única correspondência humana atualmente comprovada no arquivo: 1 Uramaki Ebiten Especial vendido solicita 1 EBITEN.
Isso NÃO comprova necessidades gerais de HOT, EBITEN e SHISO de outros produtos.
O caso real arquivado com Edamame e Nasu no Misso prova apenas a via PRATOS, sem inventar preparações.

## Portões para o uso real
- Completar as regras humanas de dependência em HOT/EBITEN/SHISO.
- Medir impressão dos dois tickets na Epson real, sem misturar tarefas.
- Verificar quantidade, texto em uma linha, fonte, área da bobina e não duplicação.
- Aprovação expressa de César antes de qualquer merge, deploy, conexão ao spooler ou ativação.

Comandos: npm run verificar:two-kitchen-v47; npm run verificar:tickets-reais-v46; npm run verificar:tickets-operacionais-v45.

Estado: desenvolvimento SHADOW, nenhum efeito em impressora, estoque, fiscal, Odhen ou produção.
