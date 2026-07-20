# Expedição iFood — o que é conferido na retirada

| Campo | Valor |
|---|---|
| Superfície | `src/entregas/ui/ifood-handoff/` |
| Domínio | Intacto (`StartHandoff` / `ConfirmHandoff`) |
| Data | 2026-07-20 |

## Princípio

O entregador do iFood **não** abre o pedido e **não** confere itens, kits ou observações.

A casa entrega o pedido: pronto, embalado, fechado, identificado, com volumes definidos.

## Fluxo de UI

1. **Pedido pronto** → “Vá buscar na conferência” → **Buscar pedido**
2. **Pedido em mãos** → “Aguardando entregador do iFood”
3. **Entregador na porta** → “Confira antes de entregar” (sacolas · nome · número iFood)
4. **Entregar ao motoboy** (só com checklist + responsável)
5. **Pedido entregue ao motoboy do iFood** + expedição concluída (andamento no canal iFood)

## Obrigatório para habilitar “Entregar ao motoboy”

- volumes definidos (sacolas)
- sacolas conferidas
- nome do pedido conferido
- número iFood conferido
- responsável interno identificado

Nome do entregador do iFood: **útil, não obrigatório**.

## Proibido na UI

Handoff · courier · external_courier_ref · verificação de identidade · validação de conteúdo · conferência de itens pelo entregador · perfil/histórico do entregador externo