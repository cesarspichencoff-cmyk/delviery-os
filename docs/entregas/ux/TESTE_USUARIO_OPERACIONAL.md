# Teste com usuário operacional simulado — 3C.1A

**Perfil:** conhece o restaurante; usa celular para WhatsApp e apps simples; não conhece Trip/aggregate/outbox.

## Fluxos

| Fluxo | Começar? | O que fazer? | Confirmou? | Erro recuperável? | Próxima ação? | Offline? | Ação grave acidental? | Jargão? |
|---|---|---|---|---|---|---|---|---|
| Montar viagem no console | Sim — “Prontos para sair” | Sim — “Montar viagem” | Sim se sucesso | Sim via alerta | Ver “Viagens de agora” | Parcial | Baixo | Antes: ApplicationService no rodapé → **corrigido** |
| Saída no mobile | Sim se viagem existe | Sim — botão verde | Confirm dialog | Erro humanizado | Cheguei | Banner Offline | Médio se botões errados → **desabilitados** |
| iFood repasse | Sim — passos 1–3 | Sim | Mensagem de sucesso | Erros claros sem verify/volumes | Lista handoffs | — | Baixo | “Handoff” ainda no botão — aceitável com “repasse” |
| Mapa | Sim — botões laterais | Sim | Estado textual | Mensagens de indisponível | Nav externa com confirm | Sim | Baixo | OK |

## Jargão eliminado / reduzido

- ApplicationService no rodapé  
- trip_started de retornando → frase humana  
- Ator role cru → “Operador / Líder…”  

## Ainda melhorar (não bloqueia pacote)

- Explicar melhor “Aguardando confirmação” na primeira vez  
- Empty state do console com orientação “marque pedidos à esquerda”  
