# Matriz de aceite A01–A39

Suite: `src/entregas/acceptance/run-acceptance-a01-a39.ts`  
`npm run test:entregas:acceptance`

| ID | Automação | Evidência |
|---|---|---|
| A01–A10 | direta | happy path / multi / add-remove / G / handoff prep |
| A11–A14 | direta | evidência GPS insuficiente rejeitada |
| A15 | direta | close manual líder |
| A16 | direta | idempotência/outbox |
| A17–A18 | equivalente | terminalidade A30 + log imutável |
| A19–A21 | direta | pausa / apoio / occurrence block |
| A22 | direta | handoff sem Trip + fail verify/volumes |
| A23–A24 | direta/equiv | pendências + close |
| A25 | equivalente | add/reorder coberto A05 |
| A26–A27 | direta | cancel / late confirm |
| A28–A29 | equivalente | policy GPS / clock (sem hardware) |
| A30–A35 | direta/equiv | terminal, remove, cancel resolve, return_requested, add after start |
| A36–A37 | equivalente | offline/unconfirmed / return idempotence (foundation+outbox) |
| A38–A39 | direta | accuracy == e > limite |

**Nenhum cenário aprovado só por inspeção manual.**  
Equivalentes: justificados na suite quando o efeito normativo é o mesmo teste de política/transição.
