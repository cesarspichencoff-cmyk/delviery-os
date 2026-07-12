# Fundação do Domínio Entregas — V0.1

> Execução física após pedido pronto. Dois fluxos: **própria** e **expedição marketplace**.  
> Sem código. Sem inventar layouts de arquivo real.

---

## 1. Escopo

### A. Entrega própria (motoboy da casa)
Motoboys na loja → preparação → viagens multi-pedido → QR/código curto → coleta → saída → rota → GPS → km estimada/real → entrega → ocorrências → retorno → disponibilidade.

### B. Expedição marketplace (ex. iFood)
Pedido pronto → entregador externo → sacola aguarda handoff → responsável (posição) → transferência → horário → encerra responsabilidade da loja.  
Motoboys da casa podem **apoiar** expedição quando na loja (estado distinto de “disponível para sair”).

### Fora
Produção de pratos · SAC · contagem de estoque de embalagem · Calmo/Foco.

---

## 2. Objetos mínimos (25)

Convenção: **owner = Entregas**, salvo nota.

| # | Objeto | Finalidade | Campos conceituais (mín.) | Estados (síntese) | Cria / encerra | Duplicidade | Correção / contestação |
|---|---|---|---|---|---|---|---|
| 1 | **DeliveryOrderReference** | Liga a pedido da Operação Viva | order_ref · channel · ready_at | linked · orphan · conflict | link pedido / unlink audit | por order_ref | sim audit |
| 2 | **PrintedArtifact** | Uma impressão/etiqueta | artifact_id · source · printed_at · payload_summary · reprint_flag | observed · correlated · ignored | impressão / arquivo | **não** = Delivery | sim |
| 3 | **PrintObservation** | Observação do ato de imprimir | artifact_id · device · at | — | observação | — | — |
| 4 | **DeliveryIdentityCandidate** | Hipótese de identidade pós-correlação | signals[] · confidence_level | candidate · promoted · rejected | match / reject | dedupe | revisão |
| 5 | **Delivery** | Unidade lógica de entrega | delivery_id · order_ref · channel · address_norm · status | draft→…→completed/cancelled | identidade estável / fim ciclo | **1 delivery / pedido lógico** | sim |
| 6 | **Trip** | Viagem do motoboy próprio | trip_id · rider_id · stops[] · status | ver modelo viagens | draft / completed | trip_id | sim |
| 7 | **TripStop** | Parada na viagem | stop_id · delivery_id · sequence · status | pending · arrived · done · skipped | — | — | sim |
| 8 | **Rider** | Motoboy (função) | rider_ref · active | active · inactive | cadastro | — | — |
| 9 | **RiderAvailability** | Disponibilidade lógica | rider_id · availability_state | ver § motoboy | mudança estado | — | audit |
| 10 | **RiderPresenceAtStore** | Presença física na loja | rider_id · present · since | present · absent · unknown | check-in/out | ≠ disponibilidade | audit |
| 11 | **Assignment** | Ligação rider↔delivery/trip | assignment_id · trip_id · delivery_ids | proposed · accepted · cancelled | assign | — | sim |
| 12 | **PickupConfirmation** | Coletou sacolas | trip_id · at · method (QR/código/manual) | confirmed | pickup | — | sim |
| 13 | **DepartureEvent** | Saiu da loja | trip_id · at | recorded | saída | — | sim |
| 14 | **RouteObservation** | Rota/plano | trip_id · planned_polyline_ref · eta | — | — | — | — |
| 15 | **LocationObservation** | Ponto GPS | trip_id · lat/lon · at · accuracy | — | GPS tick | — | qualidade |
| 16 | **DeliveryConfirmation** | Entrega concluída no stop | delivery_id · at · method | confirmed · disputed | confirmação | — | contestável |
| 17 | **DeliveryIncident** | Ocorrência | type · at · trip_id · delivery_id? | open · resolved | report | — | sim |
| 18 | **ReturnEvent** | Voltou à loja | trip_id · at · confirmed | provisional · confirmed | retorno | — | sim |
| 19 | **MarketplaceCourierArrival** | Entregador externo chegou | channel · at · order_ref? | waiting · linked · left | chegada | — | — |
| 20 | **MarketplaceHandoff** | Transferência sacola | order_ref · position_role · at · confirmed_by_role | pending · done · exception | handoff | — | sim |
| 21 | **DeliveryChannel** | Canal comercial/técnico | channel_id · kind | known · unknown | classificação | — | não inventar |
| 22 | **DeliveryCorrelationRecord** | Resultado match impressões | artifact_ids[] · delivery_id? · level | ver níveis | correlação | anti-dup | revisão |
| 23 | **DeliveryAuditRecord** | Trilha | actor_role · action · before/after · at | — | qualquer alteração | — | imutável |
| 24 | **GPSConsentSession** | Consentimento/sessão GPS | trip_id · started · ended · purpose | active · ended | início/fim explícitos | — | — |
| 25 | **SyncPendingOperation** | Offline | op_id · type · payload · status | pending · synced · conflict | offline | client_id | resolução |

### Relações-chave
```text
PrintedArtifact *──► DeliveryCorrelationRecord ──► Delivery (0..1)
Delivery 1──* TripStop *──1 Trip ──1 Rider
Trip ── GPSConsentSession ── LocationObservation*
Delivery ── MarketplaceHandoff (se marketplace)
RiderPresenceAtStore ⊥ RiderAvailability (separados)
```

### Privacidade / retenção (conceitual)
- Endereço/telefone: mínimo para entrega; não export público.  
- GPS: só sessão de viagem; local temp; sync depois.  
- Retenção: operacional curta vs auditoria (prazos jurídicos pendentes).

---

## 3. Fatos que Entregas fornece à Operação Viva

| Fato | Uso típico no Ambiente |
|---|---|
| Motoboys na loja (presença) | Capacidade aparente |
| Realmente **disponíveis** | Capacidade real |
| Apoio expedição | Não misturar com “livre” |
| Preparando saída | Ocupados |
| Em rota / retornando | Pipeline |
| Previsão de retorno | Planejamento |
| Pedidos próprios aguardando motoboy | Fila própria |
| Viagens em preparação | Carga |
| iFood aguardando handoff | Fila marketplace |
| Entregadores externos aguardando | Pressão handoff |
| Viagem sem atualização | Desconhecido / risco |
| Ocorrência aberta | Exceção |
| Capacidade atual entrega própria | Síntese |

**Só o núcleo** decide Calmo, Ambiente, Foco e prioridade.

---

## 4. Canais (mínimo)

| Canal | Nota |
|---|---|
| iFood | Marketplace |
| Nimo | Pode ser pedido próprio / impressão |
| Tecnisa/integração | Fonte técnica de impressão — **não** necessariamente canal comercial |
| Próprio | Canal da casa |
| Desconhecido | Permanecer desconhecido |
| Outro futuro | Extensível |

Impressão pode informar **origem técnica** sem definir canal comercial. **Não inventar canal.**

---

*Fundação Entregas V0.1 · 25 objetos · dois fluxos.*
