# Fronteira Entregas × Copiloto (futuro) — sem integração nesta missão

Fontes: `Fundacao` §3 fatos OV; `Contrato_Fronteiras`; pacote Copiloto (outro worktree — **não modificado**); princípio Foco só OV/núcleo.

---

## 1. Princípio

| Sistema | Papel |
|---|---|
| **Entregas** | Executa e registra verdade da **viagem/entrega/handoff** |
| **Operação Viva / núcleo** | Decide Calmo / Ambiente / **Foco** |
| **Copiloto** (futuro módulo) | Lê fatos + recomenda/explica; **não** reescreve Trip |

Entregas **emite fatos** com confiança.  
Copiloto **consome** (via OV ou contrato).  
**Ação de execução** (assign, depart, confirm handoff) permanece em **Entregas**.

---

## 2. Eventos emitidos por Entregas (candidatos)

| Evento / fato | Payload conceitual | Confiança típica |
|---|---|---|
| Pedidos próprios aguardando motoboy | count, oldest_wait | alta se ready real |
| Viagens em preparação | count trips preparing | alta |
| Prontos sem capacidade de saída | ready vs riders disponíveis | média (presença≠disponível) |
| Em rota / retornando | counts | alta se estado fresco |
| Viagem sem atualização | trip_id, last_at | alta (stale) |
| Múltiplas tentativas / incident open | type, delivery_id | média |
| Retorno não fechado | provisional return | alta |
| Confirmação ausente | stop done sem confirmation | média |
| Handoff marketplace pendente | queue externos | alta |
| Offline / pending sync | count pending ops | alta técnica |
| Divergência volumes | (futuro) | — |
| Handoff exception | exception | alta |

---

## 3. Informação consumida pelo Copiloto

| Consumo | Uso Copiloto (futuro) | Não fazer |
|---|---|---|
| Fila saída / motoboy | Foco área motoboy; forecast | Inventar rider lento |
| Handoff pendente | Pressão expedição | Criar Foco sem confiança |
| Trip stale / offline | technical / anomalia | Punir motoboy |
| Incident open crítico | Ambiente ou Foco se núcleo decidir | Entregas escrever Foco |
| Capacidade real | Briefing / previsão 15–30 min | Usar “na loja” como livre |

---

## 4. Ações que continuam em Entregas

- Formar/editar Trip e stops  
- Assign rider  
- Pickup / Departure / Return confirm  
- DeliveryConfirmation / Incident  
- MarketplaceHandoff  
- Resolução de conflict de correlação e sync  
- Encerrar GPSConsentSession  

Copiloto pode **recomendar** (“chamar motoboy”, “fechar retorno da viagem X”) — execução e registro = Entregas / humano.

---

## 5. O que **não** integrar agora

- Webhook live  
- Escrita Copiloto → estados Trip  
- Ranking de riders no Copiloto  
- Mapa GPS no Foco do Copiloto  

---

## 6. Resumo de fronteira

```text
Entregas --fatos(confiança)--> OV/Copiloto --prioridade/recomendação--> humano
                ^                         |
                |_____ação de execução____|
```
