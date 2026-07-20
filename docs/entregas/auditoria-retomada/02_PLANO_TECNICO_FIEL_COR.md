# Plano técnico fiel ao COR-ENTREGAS-V1 @ 1.0.3

> **Não executar implementação** até autorização explícita de código.  
> Este plano só descreve a ordem correta.

---

## 0. Pré-condições de implementação

1. César declara **congelamento para implementação** (ou emite AUTORIZO de código).  
2. Políticas de piloto preenchidas por unidade (Anexo B).  
3. Commit documental separado de commit de implementação.  
4. Worktree `deliveryos-entregas-v1` · branch `feature/entregas-v1` isolado.  
5. Zero alteração em Copiloto / Capacidade Viva / shell.

---

## 1. Fase F0 — Domínio e testes (sem UI)

| Entrega | Conteúdo |
|---|---|
| Modelos | Trip, Delivery, TripEvent, DeliveryEvent, ActorState, Handoff, Occurrence, Artifact/Correlation |
| Enums | Estados e eventos **exatos** do Anexo A + §10 |
| Transições | Motor de transição só com matriz; falha segura |
| `trip_return_started` | em_rota → retornando; sem require_all_active_stops_resolved |
| G1–G5 | Só `active=true`; active=false fora |
| GPS | Sessão só em viagem ativa; arrival ≠ confirmed |
| Offline | occurred_at, recorded_at, synced_at, idempotency_key |
| Testes | A01–A39 + lista §22 da missão |

**Critério de verde F0:** bateria A01–A39 verde + proibições (ranking, geofence=entrega, Trip iFood) verdes.

---

## 2. Fase F1 — Superfícies (após F0 verde)

| Superfície | Escopo |
|---|---|
| Console ops | Formação viagem, fila `entrega_sem_confirmacao`, handoff iFood, ocorrências |
| Mobile motoboy | Viagem atribuída, saída, paradas, confirmação, offline, retorno |
| Mapa | Opcional / apoio; nunca home |

**Não:** dashboard genérico, ranking, GPS permanente, write em Foco.

---

## 3. Fase F2 — Integração controlada (depois)

- Eventos emitidos para consumo futuro do Copiloto (lista §21 da missão).  
- **Não** importar Capacidade Viva / Calmo / Ambiente / Foco.  
- **Não** merge no shell até aceite.

---

## 4. Fluxos soberanos (lembrete)

### Pedido próprio
pronto → conferência → formação + **trip_id** → saída → rota/paradas → confirmação|ocorrência → retorno → fechamento → disponibilidade

### iFood
pronto → courier externo → responsável identifica → sacola → volumes → handoff → encerra responsabilidade loja  
**Sem Trip do motoboy da casa.** Nome: **Expedição e handoff iFood**.

---

## 5. O que descartar do design V0.1 ao implementar

- Bloqueio de saída/fechamento por volumes obrigatórios (salvo política piloto futura).  
- “Handoff de volta” como requisito de trip close.  
- Tentativas max=2 como norma (só se política).  
- Tese “consciência da viagem” no Foco da OV.  
- Estados Trip em inglês do V0.1 quando COR usa português técnico sem acento (`em_rota`, `retornando`, `encerrada`).

---

## 6. Commits futuros (não desta missão)

| Quando | Mensagem |
|---|---|
| Só docs (esta) | `docs(entregas): alinha retomada ao COR-ENTREGAS-V1 1.0.3` |
| Código autorizado | `feat(entregas): implementa fundacao fiel ao contrato operacional real` |

---

*Plano técnico · bloqueado até AUTORIZO de implementação.*
