# GATE ZERO ENCERRADO

| Campo | Valor |
|---|---|
| Data | 2026-07-20 |
| Frase | **ESTRUTURA OPERACIONAL CONFIRMADA** |
| Versão aprovada | Gate Zero **V2** (+ esclarecimento iFood V2.1) |
| Próximo gate | **PLANO TÉCNICO E FUNDAÇÃO DO MÓDULO ENTREGAS** |

## Confirmado pelo César

- Separação entregas próprias × Expedição iFood  
- Trip exclusiva para próprias; `trip_id` antes da saída  
- `courier_actor_id` = **somente** motoboy da casa (COR)  
- `external_courier_ref` = **somente** Handoff iFood  
- Entregador iFood sem conta, Trip, GPS, rota ou app  
- Verificação funcional do courier antes do handoff  
- Pedido e volumes conferidos no handoff  
- Entrega ao cliente humana; GPS sem poder de confirmar  
- `entrega_sem_confirmacao` não bloqueante, sem culpa automática  
- Retorno não confirma entrega  
- `active=false` fora de G1–G5  
- Eventos imutáveis  
- WhatsApp = comunicação, nunca commit automático  
- Limite inicial 5 paradas configurável, não hardcoded no domínio  
- Sem ranking, punição automática ou vigilância permanente  
- **COR-ENTREGAS-V1 @ 1.0.3** fonte exclusiva de estados/eventos/transições  
- 19 decisões de piloto como base da próxima fase  

## Distinção técnica obrigatória na implementação

| Campo | Tipo / semântica | Intercambiável? |
|---|---|---|
| `courier_actor_id` | Motoboy **interno** | **Nunca** com externo |
| `external_courier_ref` | Entregador **externo** (mínimo no Handoff) | **Nunca** com interno |

## Ainda NÃO autorizado

- Integrar ao shell principal  
- Push / deploy  
- Atribuição automática  
- GPS em produção  
- Alterar Copiloto, Capacidade Viva ou Seleção  

---

*Gate Zero fechado · fundação autorizada no worktree isolado.*
