# Critérios de aceite do gate — matriz 1–30

Legenda: **OK** evidência automatizada ou procedimento documentado · **PARCIAL** · **PENDENTE aparelho real** · **N/A**

| # | Cenário | Status | Evidência |
|---|---|---|---|
| 1 | Operador inicia sistema | OK | `ui:entregas:pilot` + log server_started |
| 2 | Motoboy acessa mobile | PARCIAL | URL + token; aparelho real pendente César |
| 3 | Pedido registrado | OK | `registerReadyOrder` + teste gate |
| 4 | Viagem montada | OK | CreateTrip + testes |
| 5 | Viagem iniciada | OK | ConfirmTripDeparture |
| 6 | Parada aberta | OK | fluxo mobile estados |
| 7 | Rota externa | OK | OpenStreetMap external |
| 8 | Chegada registrada | OK | RecordArrivalDetected (aceite domínio) |
| 9 | Entrega confirmada | OK | ConfirmDelivery |
| 10 | Ocorrência | OK | CreateOccurrence |
| 11 | Ação offline | PARCIAL | demo simulado; piloto rede local |
| 12 | Rede volta | PARCIAL | documentado |
| 13 | Sync sem duplicidade | OK | command_id + domínio |
| 14 | Browser reaberto | PARCIAL | store em disco; sessão token no localStorage |
| 15 | Servidor reiniciado | OK | FileUoW P02 + gate |
| 16 | Estado preservado | OK | gate persistência |
| 17 | iFood pronto | OK | UI fila + ready orders |
| 18 | Aviso uma vez | OK | alerted + capturas |
| 19 | Antigo priorizado | OK | FIFO + captura 01 |
| 20 | Pedido buscado | OK | StartHandoff |
| 21 | Conferência 3 itens | OK | UI + disabled |
| 22 | Nome disponível | OK | capturas |
| 23 | Nome não bloqueia | OK | capturas 08 |
| 24 | Entrega ao motoboy | OK | ConfirmHandoff |
| 25 | Duplicata bloqueada | OK | gate test |
| 26 | Backup criado | OK | createBackup + teste |
| 27 | Restore testado | OK | restoreBackup + teste |
| 28 | Sem permissão | OK | motoboy handoff rejeitado |
| 29 | Mensagem humana | OK | pilot-facade human errors |
| 30 | Trilha íntegra | OK | ops.log.jsonl + events |

## Automatizado neste gate

`npm run test:entregas:pilot-gate` — 9 testes  
`npm run test:entregas` — suite completa domínio/UI  
