# Autorização e papéis — 3B.1

Autenticação real = adapter futuro. Domínio exige `ActorContext { actor_id, role }`.

## Papéis

| Papel | Exemplos de ações |
|---|---|
| `operador_expedicao` | CreateTrip, Handoff, mutate |
| `motoboy_interno` | start, return, confirm delivery |
| `lider_delivery` | close manual, resolve occurrence, add after start |
| `gerente` | idem líder |
| `sistema` | automações permitidas pelo COR |
| `integracao_futura` | reservado |

## Proibições

- Operação crítica anônima  
- Motoboy fechando trip manual  
- Campo impresso “Entregador” como rider  

Código: `src/entregas/operational/auth.ts`.
