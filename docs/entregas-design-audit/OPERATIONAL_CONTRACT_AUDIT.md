# Auditoria do Contrato Operacional — Entregas

Fontes: `Fundacao_Dominio_Entregas_V0_1`, `Modelo_Viagens_*`, `Fluxos_Estados_*`, `Modelo_Expedicao_*`, `Modelo_Comandas_*`, `Riscos_Privacidade_*`, `Contrato_Fronteiras_*`.

---

## 1. Tese do produto (validação)

**Tese proposta (Missão 1):**  
> “Entregas é a consciência operacional da viagem, desde a preparação até o fechamento confirmado.”

| Aspecto | Avaliação |
|---|---|
| Sustentada pelos materiais? | **Parcialmente, com nuance** |
| O que os docs dizem | Entregas = **execução física** pós-pronto; **Operação Viva** = consciência Calmo/Ambiente/Foco |
| Interpretação segura | Entregas é a **consciência de domínio da viagem** (estados, desconhecidos, fechamento real) — **não** substitui o Foco da OV |
| Risco de confusão | Chamar Entregas de “consciência” sem fronteira pode **contaminar Foco** (risco A no red team) |

**Não é** (docs + tese): rastreador invasivo · mapa decorativo · ranking · painel de produtividade individual · central de mensagens · só lista de pedidos · app logístico genérico.

**Responde (contrato):** viagens em preparação; entregas por viagem; responsável (rider/posição); saiu; tentativa/ocorrência; confirmado; retorno; intervenção; não comprovado; fim real (return confirmed + trip completed).

---

## 2. Modelo — Viagem (Trip)

| Item | Status | Evidência |
|---|---|---|
| `trip_id` | **completo** | Fundação objeto 6; modelo viagens |
| Entregador (`rider_id`) | **completo** | Trip + Assignment |
| Entregas incluídas | **completo** | stops[] / delivery_ids |
| Ordem de paradas | **completo** | TripStop.sequence |
| Preparação | **completo** | draft → preparing → assigned → collected |
| Saída | **completo** | DepartureEvent; ready_to_depart → departed |
| Retorno | **completo** | ReturnEvent provisional/confirmed |
| Fechamento | **completo** | completed só com retorno confirmado; proibido completed sem coleta/saída quando modo exige |

Estados Trip documentados: draft, preparing, assigned, collected, ready_to_depart, departed, in_route, partially_completed, returning, completed, interrupted, cancelled, under_review.

---

## 3. Modelo — Entrega (Delivery)

| Item | Status | Evidência |
|---|---|---|
| `delivery_id` | **completo** | Fundação #5 |
| `order_id` / order_ref | **completo** | DeliveryOrderReference; 1 delivery / pedido lógico |
| Endereço / ref operacional | **parcial** | `address_norm`; incompleto bloqueia (U-02) — sem schema visual de “referência operacional” |
| Volumes | **ausente / parcial** | Não modelado como objeto de volumes/sacolas além de PickupConfirmation |
| Forma de confirmação | **parcial** | DeliveryConfirmation.method; pouco detalhe UX |
| Tentativa | **parcial** | Incident + stops skipped; não há máquina explícita “attempt 1/2/3” |
| Exceção | **parcial** | DeliveryIncident open/resolved; tipos de exceção de chão (não atende, endereço…) **não catalogados como jornada de produto** |
| Resultado | **completo** | delivered / failed / cancelled / under_review (síntese) |

Estados Delivery: draft · identity_pending · ready · waiting_assignment · in_trip · out_for_delivery · delivered · failed · cancelled · under_review (+ marketplace).

---

## 4. Handoff (marketplace)

| Item | Status | Evidência |
|---|---|---|
| Quem entregou (posição) | **completo** | position_role — **não exige nome** |
| Quem recebeu (externo) | **parcial** | CourierArrival; sem PII excessivo por design |
| Quando | **completo** | confirmed_at |
| Volumes | **ausente** | Não detalhado no handoff |
| Evidência | **parcial** | confirmed_by_role; sem foto obrigatória (proposital) |
| Divergência | **parcial** | handoff_exception |

---

## 5. Ocorrência (DeliveryIncident)

| Item | Status | Evidência |
|---|---|---|
| Relato | **parcial** | type · at — sem taxonomia UX de relatos |
| Fato vs hipótese | **parcial** | princípio nos red teams Evolução/OV; **fraco** no doc Entregas isolado |
| Decisão / ação | **parcial** | trip may interrupt; LE corrige |
| Confirmação / encerramento | **parcial** | open · resolved |

**Não** há fluxo completo “cliente não atende → tentativas → retorno” como playbook de produto.

---

## 6. Offline

| Item | Status | Evidência |
|---|---|---|
| Eventos locais | **parcial** | SyncPendingOperation; fluxo 18 |
| Fila de sync | **parcial** | pending · synced · conflict |
| Conflito | **parcial** | conflict; sem UX de resolução |
| Reconciliação | **parcial** | conceitual; sem passos de design |
| Duplicidade / idempotência | **completo** (regra) | client_id; replay não dup Delivery; reimpressão attach |
| “Ainda não enviado” | **parcial** | status pending; sem UI |

Pacote Fable offline (R-OFF-*) é **outra superfície** (formação) — padrões reutilizáveis, não spec de Entregas.

---

## 7. Privacidade

| Item | Status | Evidência |
|---|---|---|
| Localização mínima | **completo** | GPS só sessão de viagem + consent |
| Retenção | **parcial** | “prazos jurídicos pendentes” |
| Acesso | **parcial** | princípios; sem matriz de papéis Entregas desktop/mobile |
| Justificativa GPS | **completo** | purpose trip_tracking |
| Evidência alternativa | **parcial** | confirmação sem GPS |
| Sem ranking/vigilância | **completo** | red team proíbe ranking e Foco “motoboy lento” auto |

---

## 8. Síntese de completude do contrato

| Área | Completo | Parcial | Ausente | Contraditório |
|---|---|---|---|---|
| Viagem | sim (núcleo) | volumes finos | — | — |
| Entrega | ids/status | tentativa/volumes/UX confirmação | catálogo de exceções de rua | — |
| Handoff | posição/tempo | volumes/evidência rica | — | — |
| Ocorrência | objeto mínimo | taxonomia + fato/hipótese | playbooks de rua | — |
| Offline | regras | UX/reconciliação | protótipo | — |
| Privacidade | GPS/ranking | retenção/RBAC UI | — | — |

**Contradição a gerir (não bloquear):** linguagem “consciência da viagem” vs “só OV tem Calmo/Foco” — resolver na Missão 2 como **consciência de domínio**, fronteira preservada.
