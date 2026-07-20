# CONTRATO OPERACIONAL REAL DE ENTREGAS V1.0.3

| Campo | Valor |
|---|---|
| Identificador | `COR-ENTREGAS-V1` |
| Versão | 1.0.3 |
| Data | 2026-07-14 |
| Status | **Normativo para redação e aceitação (patch 1.0.3)** — **não** autoriza código, telas, GPS em produção, integrações, publicação ou piloto |
| Base | COR-ENTREGAS-V1 @ 1.0.2 + correções documentais pontuais 1.0.3
| Unidade de aplicação | Operação de delivery com entregas próprias e handoff de plataforma |
| Idioma técnico | Identificadores **sem acento**; textos humanos podem ter acento |

---

## 1. Identificação e versão

Este documento é o **Contrato Operacional Real de Entregas V1**. Define o comportamento operacional obrigatório do domínio de entregas próprias, expedição/handoff de plataforma e recuperação, de forma precisa o suficiente para implementação futura e para validação por cenários de aceite.

**Anexos normativos deste contrato:**

| Anexo | Arquivo | Função |
|---|---|---|
| A | `ENTREGAS_V1_0_3_MATRIZ_ESTADOS_EVENTOS_TRANSICOES.xlsx` | Estados, eventos e transições |
| B | `ENTREGAS_V1_0_3_POLITICAS_PILOTO.xlsx` | Políticas versionadas de piloto |
| C | `ENTREGAS_V1_0_3_CENARIOS_ACEITE.xlsx` | Cenários de aceite |
| D | `ENTREGAS_V1_0_3_REGISTRO_DECISOES.md` | Decisões fechadas, parametrizadas e abertas |

Qualquer implementação futura **deve** declarar a versão deste contrato (`contract_version = COR-ENTREGAS-V1@1.0.3`) em cada objeto de viagem.

---

## 2. Objetivo

1. Tornar a viagem própria um objeto com identidade estável (`trip_id`).
2. Separar **evidência de rota** (GPS/geofence) de **confirmação de entrega** (ação humana).
3. Permitir retorno normal **automático e seguro** sob condições cumulativas, sem inventar entrega.
4. Tratar ausência de confirmação como **pendência operacional**, sem culpa e sem bloquear a operação.
5. Isolar handoff de plataforma da viagem do motoboy da casa.
6. Preservar histórico imutável por eventos, inclusive offline.
7. Proibir vigilância permanente, ranking e punição automática.

---

## 3. Escopo

Inclui:

- Viagens próprias com um ou vários pedidos.
- Estados e eventos de viagem, entrega e motoboy.
- GPS **somente** em viagem ativa (regras de uso; sem implementação nesta missão).
- Retorno automático e encerramento manual.
- Pendência `entrega_sem_confirmacao`.
- Offline, idempotência e conflitos.
- Handoff iFood / plataforma externa.
- Ocorrências e recuperação.
- Privacidade de localização.
- Políticas de piloto versionadas e critérios de aceite.

---

## 4. Não escopo

Explicitamente **fora** deste contrato e desta missão:

- Código, APIs, banco de dados, telas, apps.
- GPS em produção, integrações iFood/reais, publicação.
- Piloto de campo (apenas **definições** de política de piloto).
- ERP, financeiro, estoque, compras.
- Avaliação de desempenho individual, RH disciplinar, ranking.
- Exportação completa de plataforma iFood (limitação R1 mantida).
- Valores definitivos de raio, segundos de permanência ou precisão GPS (apenas versionamento e calibração).

---

## 5. Princípios

1. **Memória por evento:** o passado não se sobrescreve; corrige-se com novo evento.
2. **Verdade conservadora:** incerteza vira `sem_atualizacao` ou pendência, nunca fato inventado.
3. **Humano confirma entrega:** máquina não declara entregue sozinha.
4. **Automação só com condições cumulativas e falha segura.**
5. **Ausência de confirmação ≠ falha individual ≠ culpa.**
6. **Separação de objetos:** Trip ≠ Delivery ≠ Handoff ≠ Occurrence.
7. **Privacidade por finalidade:** GPS só na viagem ativa.
8. **Precedência explícita** sobre “último evento vence”.
9. **Terminalidade de `encerrada`** na operação normal.
10. **Fato / inferência / hipótese / desconhecido** não se misturam em relatórios.

---

## 6. Glossário

| Termo | Definição |
|---|---|
| **Viagem própria** | Deslocamento do motoboy da casa para entregar pedidos próprios, identificado por `trip_id`. |
| **Pedido próprio** | Pedido cuja entrega física ao cliente é responsabilidade da operação local (não courier de plataforma). |
| **Handoff** | Repasse conferido da sacola ao courier externo de plataforma. |
| **Evento** | Registro imutável de algo que ocorreu (ou foi declarado), com identidade e horários. |
| **Estado** | Situação derivada atual de um objeto, calculada a partir de eventos e precedência. |
| **Evidência** | Dado que sustenta um evento (ação humana, GPS derivado, motivo, papel). |
| **Falha segura** | Comportamento quando falta evidência: não inventar; preferir incerteza. |
| **Política de piloto** | Conjunto versionado de parâmetros calibráveis (`pilot-*-policy-v1`). |
| **Exceção explícita** | Estado ou flag registrada por humano ou regra autorizada que impede auto-`disponivel`. |
| **occurred_at** | Horário declarado do fato no dispositivo/origem. |
| **recorded_at** | Horário em que o dispositivo registrou localmente o evento. |
| **synced_at** | Horário de recebimento pelo sistema central. |
| **return_detected** | Evento de retorno normal detectado; **não** é estado de viagem. |

---

## 7. Objetos

### 7.1 Trip (viagem própria)

| Campo conceitual | Obrigatório | Notas |
|---|---|---|
| `trip_id` | sim | Único; criado **antes** da saída |
| `unit_id` | sim | Unidade/loja |
| `courier_actor_id` | sim | Motoboy (papel funcional, não ranking) |
| `created_by` | sim | Quem criou a formação |
| `state` | sim | Um dos estados de viagem |
| `delivery_ids[]` | sim | Um ou vários |
| `created_at` | sim | |
| `started_at` | quando iniciada | Evento `trip_started` |
| `closed_at` | quando encerrada | |
| close_mode | quando encerrada | automatic \| manual |
| `last_event_id` | sim | |
| `contract_version` | sim | `COR-ENTREGAS-V1@1.0.3` |
| `return_evidence` | se retorno auto | Ver §13 |
| `manual_close_reason` | se manual | |
| `manual_close_actor` | se manual | |
| `policy_bundle_id` | sim em piloto | Ex.: políticas ativas |

### 7.2 Delivery (entrega individual)

| Campo | Obrigatório | Notas |
|---|---|---|
| `delivery_id` | sim | |
| `trip_id` | sim | |
| `order_ref` | sim | Identificador do pedido (não só nome/endereço) |
| `channel` | sim | Ex.: proprio |
| `planned_stop_order` | sim | Ordem planejada |
| `actual_stop_order` | se conhecida | |
| `state` | sim | |
| `arrival_detected_at` | se houver | |
| `confirmed_at` | se confirmada | |
| `unconfirmed_at` | se pendente | |
| unconfirmed_trigger | se pendente | Código do gatilho G1–G5, quando a entrega estiver em entrega_sem_confirmacao |
| `occurrence_id` | se houver | |
| cancelled_reason | se cancelada | |
| active | sim | true = na composição ativa da viagem; false = removida da composição ativa (não apaga o objeto) |
| removed_at | se removida | Horário da remoção da composição ativa |
| removed_reason | se removida | Motivo da remoção |
| removed_by | se removida | Papel/ator que removeu |

### 7.3 TripEvent / DeliveryEvent

Eventos imutáveis. Campos comuns:

| Campo | Obrigatório | Valores / notas |
|---|---|---|
| event_id | sim | Único global |
| object_type | sim | trip \| delivery \| handoff \| occurrence \| actor |
| object_id | sim | |
| event_type | sim | |
| occurred_at | sim | |
| recorded_at | sim | |
| synced_at | quando sincronizado | |
| origin | sim | device \| ops_console \| system |
| device_id | se origem device | |
| actor_id | se ação humana | |
| idempotency_key | sim | |
| payload | evidências específicas | |
| clock_trust | sim | trusted \| suspect \| unknown |
| contract_version | sim | COR-ENTREGAS-V1@1.0.3 |

### 7.3.1 Enumerações fechadas de evento e viagem

Os valores abaixo são normativos e fechados. Devem aparecer integralmente em DOCX e Markdown, inclusive na tabela da seção 7.3.

| Campo | Valores permitidos (exatos) |
|---|---|
| close_mode | automatic ou manual |
| object_type | Enumeração fechada: trip \| delivery \| handoff \| occurrence \| actor |
| origin | device, ops_console, system |
| clock_trust | trusted, suspect, unknown |

Lista normativa (não abreviar):

- close_mode: automatic | manual
- object_type: trip | delivery | handoff | occurrence | actor
- origin: device | ops_console | system
- clock_trust: trusted | suspect | unknown

Definições:

- close_mode = automatic: encerramento por trip_closed_automatic após return_detected válido.
- close_mode = manual: encerramento por trip_closed_manual com papel autorizado (ver §18).
- object_type: trip, delivery, handoff, occurrence ou actor.
- origin: device (aparelho do motoboy), ops_console (console operacional) ou system (automação).
- clock_trust: trusted, suspect ou unknown.

### 7.4 Occurrence

Campos mínimos: `occurrence_id`, `type`, `source_channel`, `related_delivery_id`/`trip_id` opcionais, `state`, `report` (relato), `hypothesis`, `promised_action`, `executed_action`, `evidence`, `owner_role`, `confirmation` (`known` \| `unknown` \| `none`), `opened_at`, `closed_at`, `closed_by`.

### 7.5 Handoff (plataforma)

Campos mínimos: `handoff_id`, `external_order_ref`, `external_courier_ref`, `arrived_at`, `conference_actor`, `volumes`, `integrity_ok`, `handoff_at`, `handoff_actor`, `confirmed`, `exception`, `unit_id`.  
**Proibido:** gerar `trip_id` de viagem própria a partir do handoff.

---

## 8. Identificadores

| Identificador | Formato conceitual | Regras |
|---|---|---|
| `trip_id` | estável, opaco, único por unidade no tempo | Criado em `trip_created`; nunca reutilizado |
| `delivery_id` | estável, opaco | Um por pedido na viagem |
| `event_id` | UUID ou equivalente | Idempotência forte |
| `idempotency_key` | derivável do fato de negócio | Ex.: `delivery_confirmed:{delivery_id}:{attempt}` |
| `occurrence_id` | estável | |
| `handoff_id` | estável | |
| Identificadores técnicos de estado | snake_case sem acento | Ver §9 |

Textos de UI podem usar “Disponível”, “Indisponível”; o contrato normativo usa `disponivel`, `indisponivel`.

---

## 9. Estados

### 9.1 Viagem (`Trip.state`)

| Estado | Significado |
|---|---|
| `preparando_saida` | `trip_id` criado; pedidos sendo montados; GPS **não** ativo como viagem |
| `em_rota` | Viagem iniciada; GPS permitido |
| `retornando` | Deslocamento de volta à unidade |
| `encerrada` | Terminal para operação normal; pendências de entrega **preservadas** |
| `sem_atualizacao` | Evidência de localização/conectividade insuficiente para decisão segura |

**`return_detected` não é estado.** É evento (§10) que leva a `encerrada`.

### 9.2 Entrega (`Delivery.state`)

| Estado | Significado |
|---|---|
| `aguardando_saida` | Vinculada ao trip; viagem ainda não iniciou |
| `em_rota` | Em deslocamento |
| `chegada_detectada` | Evidência de chegada ao destino; **desfecho pendente** |
| `entregue_confirmado` | Motoboy confirmou entrega |
| `entrega_sem_confirmacao` | Pendência sem confirmação nem exceção suficiente |
| `cliente_nao_encontrado` | Tentativa sem contato útil |
| `retorno_solicitado` | Pedido deve voltar à loja |
| `cancelada` | Cancelada com motivo |

### 9.3 Motoboy (`ActorAvailability.state`)

| Estado | Significado |
|---|---|
| `disponivel` | Pode receber nova formação de viagem |
| `preparando_saida` | Formando/preparando saída |
| `em_rota` | Em viagem própria |
| `retornando` | Retornando à unidade |
| `apoio_expedicao` | Apoio a handoff/expedição (explícito) |
| `pausa` | Pausa explícita |
| `indisponivel` | Indisponibilidade explícita |
| `sem_atualizacao` | Sem evidência recente suficiente para tratá-lo como livre |

### 9.4 Flag operacional: ocorrência em tratamento

Não é estado de motoboy isolado na R1. Este contrato define a flag:

- `actor.flags.occurrence_blocking_availability` = true|false  

Quando true (ocorrência que exige presença/ação física do motoboy, conforme tipo configurado), **bloqueia** auto-transição para `disponivel` após retorno, **sem** impedir `Trip` → `encerrada`.

### 9.5 Handoff e Occurrence (estados)

**Handoff:** `aguardando_courier` → `em_conferencia` → `repassado` | `excecao` | `cancelado`.

**Occurrence:**

`aberta` · `aguardando_cliente` · `aguardando_operacao` · `em_tratamento` · `reenvio_em_andamento` · `retorno_solicitado` · `resolvida` · `fechada_sem_confirmacao` · `nao_resolvida` · `informacao_insuficiente`

---

## 10. Eventos

### 10.1 TripEvent (tipos)

| event_type | Efeito principal |
|---|---|
| `trip_created` | Cria trip em `preparando_saida` |
| `delivery_added` | Inclui delivery; histórico preservado |
| delivery_removed | Preserva histórico; active=false; grava removed_at, removed_reason, removed_by; remove do conjunto ativo; NÃO apaga o objeto Delivery; NÃO é cancelamento |
| `stop_reordered` | Nova ordem planejada |
| `trip_started` | `preparando_saida` → `em_rota` |
| `trip_return_started` | `em_rota` → `retornando` (humano ou regra de última parada) |
| `return_detected` | Evidência cumulativa de retorno; **não** é estado |
| trip_closed_automatic | → encerrada (close_mode = automatic); ver §13 |
| trip_closed_manual | → encerrada (close_mode = manual); ver §18 |
| `trip_signal_lost` | Pode → `sem_atualizacao` |
| `trip_signal_recovered` | Sai de `sem_atualizacao` se evidência voltar |
| `trip_admin_correction_recorded` | Correção administrativa (ver §10.4) |
| `sync_received` | Marcação de sincronização (pode ser metadado) |

### 10.2 DeliveryEvent (tipos)

| event_type | Efeito principal |
|---|---|
| `delivery_departed` | `aguardando_saida` → `em_rota` (em lote no `trip_started` ou explícito) |
| `arrival_detected` | → `chegada_detectada` |
| `delivery_confirmed` | → `entregue_confirmado` |
| `delivery_unconfirmed` | → `entrega_sem_confirmacao` |
| `customer_not_found` | → `cliente_nao_encontrado` |
| `return_requested` | → `retorno_solicitado` |
| `delivery_cancelled` | → `cancelada` |

### 10.3 Outros eventos relevantes

- Actor: `actor_pause_set`, `actor_pause_cleared`, `actor_unavailable_set`, `actor_unavailable_cleared`, `actor_support_set`, `actor_support_cleared`, `actor_available_set`.
- Handoff: `handoff_courier_arrived`, `handoff_conference_done`, `handoff_transferred`, `handoff_exception`.
- Occurrence: `occurrence_opened`, `occurrence_updated`, `occurrence_closed`.

### 10.4 Terminalidade de encerrada e correção administrativa

**Norma V1.0.3:**

1. encerrada é **terminal para operação normal**.
2. Evento atrasado **não reabre** automaticamente.
3. Correção **não apaga** o encerramento nem eventos anteriores.
4. O evento **trip_admin_correction_recorded** (nome normativo V1.0.3; substitui o identificador administrativo anterior de reabertura) registra correção administrativa.
5. Esse evento **não** reabre rota, **não** reativa GPS e **não** devolve a viagem a em_rota ou retornando.
6. Serve apenas para anexar correção de registro/metadados com motivo, papel (gerente ou admin autorizado) e trilha completa.
7. **Não existe reabertura operacional** de viagem encerrada na V1.0.3.

---

---

## 11. Transições

Toda transição válida está na matriz do **Anexo A**. Resumo das regras-mãe:

### 11.1 Viagem (resumo)

| De | Evento | Para | Ator | Pré-condições | Falha segura |
|---|---|---|---|---|---|
| — | `trip_created` | `preparando_saida` | operação/sistema | pedidos ≥1 ou formação em curso | — |
| `preparando_saida` | `trip_started` | `em_rota` | motoboy | ≥1 delivery ativo não cancelado | bloquear se zero deliveries |
| em_rota | trip_return_started | retornando | motoboy/sistema | viagem ativa; papel ou regra autorizada; não exige require_all_active_stops_resolved | rejeitar se a viagem não estiver ativa ou a origem não estiver autorizada; G3 pode gerar entrega_sem_confirmacao para deliveries active=true sem desfecho |
| `em_rota` / `retornando` | `trip_signal_lost` | `sem_atualizacao` | sistema | perda de confiança GPS/conectividade | não inventar retorno |
| `sem_atualizacao` | `trip_signal_recovered` | estado anterior seguro* | sistema | evidência recuperada | se incerto, permanecer |
| `retornando` (ou `em_rota` se política permitir só com retorno) | `return_detected` + `trip_closed_automatic` | `encerrada` | sistema | §13 completo | se falhar qualquer condição, não fechar |
| em_rota / retornando / sem_atualizacao | trip_closed_manual | encerrada | líder/gerente/admin | §18 | recusar se papel/evidência insuficientes |
| `encerrada` | eventos atrasados | `encerrada` | sistema | — | anexar/quarentena; não reabrir rota |

\*estado anterior seguro: preferir `retornando` ou `em_rota` conforme último estado confiável antes da perda de sinal.

### 11.2 Entrega (resumo)

| De | Evento | Para | Ator |
|---|---|---|---|
| `aguardando_saida` | `delivery_departed` / `trip_started` | `em_rota` | sistema/motoboy |
| `em_rota` | `arrival_detected` | `chegada_detectada` | sistema (GPS) |
| `chegada_detectada` | `delivery_confirmed` | `entregue_confirmado` | motoboy |
| `em_rota` / `chegada_detectada` | `customer_not_found` | `cliente_nao_encontrado` | motoboy |
| `em_rota` / `chegada_detectada` | `return_requested` | `retorno_solicitado` | motoboy/operação |
| qualquer não terminal* | `delivery_cancelled` | `cancelada` | operação autorizada |
| `chegada_detectada` / `em_rota` | `delivery_unconfirmed` (§14) | `entrega_sem_confirmacao` | sistema |

\*Terminais de entrega para ciclo normal: `entregue_confirmado`, `cancelada` (pendência `entrega_sem_confirmacao` é “aberta operacionalmente” mas não bloqueia viagem).

### 11.3 Proibições de transição

- GPS/geofence → `entregue_confirmado` (**proibido**).
- `return_detected` → confirmar deliveries (**proibido**).
- Qualquer automação → ranking/punição (**proibido**).
- Transição implícita sem evento (**proibido**).

---

## 12. Responsabilidades

| Objeto / ato | Quem aciona | Quem confirma/fecha | Não permitido |
|---|---|---|---|
| Criar trip / montar pedidos | Operação | Sistema registra eventos | Sobrescrever histórico |
| Iniciar viagem | Motoboy | Sistema (`trip_started`) | Iniciar sem trip_id |
| Confirmar entrega | Motoboy (ação simples) | Sistema grava `delivery_confirmed` | GPS confirmar sozinho |
| Registrar exceção de entrega | Motoboy / operação | Conforme tipo | Culpa automática |
| Fila `entrega_sem_confirmacao` | Sistema cria | Operação Viva recebe; líder pode escalar | Apagar pendência sem trilha |
| Retorno automático | Sistema | Evidências em `return_detected` | Fechar sem condições |
| Encerramento manual de viagem | Líder de Delivery, gerente, admin autorizado | Autor + evidência | Motoboy encerrar “no vazio” sem retorno/exceção |
| Handoff | Conferência/Expedição + quem repassa | Confirmação de repasse | Criar trip própria |
| Ocorrência | Motoboy/operação abre | **Líder de Delivery ou gerente** fecha | Fechar sem campos mínimos |
| Correção admin de trip encerrada | Gerente / admin | Evento `trip_admin_correction_recorded` (não operacional) | Reativar GPS/rota |

---

## 13. Retorno automático

### 13.0 Precisão horizontal do GPS (norma)

- **accuracy_error_m**: erro estimado do fix em metros (quando menor, melhor).
- **max_horizontal_accuracy_m**: teto máximo de erro aceitável (parâmetro de política de piloto).
- O fix é aceito **somente** quando:

```
accuracy_error_m <= max_horizontal_accuracy_m
```

Fix com accuracy_error_m maior que o teto **não** conta para return_detected nem para arrival_detected confiável.

### 13.1 Condições cumulativas (todas)

1. Viagem em estado ativo elegível: preferencialmente `retornando`; se ainda `em_rota`, só se política de piloto `allow_return_from_em_rota` estiver **true** (padrão piloto: **false** — exige `trip_return_started`).
2. GPS **recente** (idade ≤ `max_fix_age_s` da política).
3. Qualidade do fix: accuracy_error_m <= max_horizontal_accuracy_m (ver §13.0).
4. Número mínimo de amostras recentes (`min_samples`).
5. Posição **dentro** da geometria da unidade.
6. Velocidade ≤ `max_speed_mps` **ou** classificação `stopped`.
7. Permanência contínua na área ≥ `min_dwell_s`.
8. **Ausência** de exceção explícita mais recente que bloqueie (ver **§15** Precedência de estados).
9. require_all_active_stops_resolved satisfeita para **return_detected / trip_closed_automatic** (não para trip_return_started): todas as entregas **active=true** em desfecho válido; active=false não conta e não recebe G1–G5.

### 13.1.1 Resolução de paradas ativas (require_all_active_stops_resolved)

Parâmetro de política (piloto): **require_all_active_stops_resolved** (substitui require_all_stops_visited).

A viagem **pode** retornar automaticamente quando **todas as entregas ativas** (active = true) estiverem em um dos estados de desfecho válidos:

- entregue_confirmado
- entrega_sem_confirmacao
- cliente_nao_encontrado
- retorno_solicitado
- cancelada

Entregas com **active = false** (removidas legitimamente da composição ativa via delivery_removed) **não** bloqueiam o retorno e **não** entram na contagem de paradas a resolver.

Uma entrega **ativa** ainda em aguardando_saida, em_rota ou chegada_detectada **sem desfecho válido** **bloqueia** o retorno automático.

Pendência entrega_sem_confirmacao **é** desfecho válido para fins de retorno (não bloqueia), alinhado às decisões soberanas.

### 13.2 Efeitos quando satisfeitas

1. Emitir return_detected com evidências (amostras resumidas/derivadas, timestamps, policy_id).
2. Emitir trip_closed_automatic.
3. Trip.state → encerrada (close_mode = automatic).
4. Atualizar motoboy para disponivel somente se a precedência (§15) permitir.
5. Não alterar deliveries para entregue_confirmado.
6. Disparar avaliação de gatilhos de delivery_unconfirmed para deliveries ainda abertas e ativas (§14).

### 13.2.1 Operação recuperável return_detected + trip_closed_automatic

return_detected e trip_closed_automatic permanecem **eventos separados**, mas formam uma **operação lógica recuperável e idempotente**:

1. Um return_detected **válido** exige **exatamente um** fechamento automático correspondente (trip_closed_automatic) com o mesmo correlation_id / return_operation_id.
2. Se return_detected for persistido e o fechamento automático falhar antes de concluir, a viagem permanece em **reconciliação de fechamento** (estado operacional ainda não encerrada, ou marca de pendência de fechamento auditável — sem inventar retorno duplicado).
3. Retry **não pode** duplicar encerramento: a chave de idempotência do fechamento automático é única por return_detected.
4. Viagem já **encerrada** não pode ser reaberta pela repetição de return_detected ou trip_closed_automatic.
5. Toda falha intermediária permanece **auditável** no histórico de eventos.

### 13.3 Sem GPS confiável

- `trip_signal_lost` / manter ou ir a `sem_atualizacao`.
- **Proibido** inventar retorno.
- Encerramento apenas manual (§18) ou recuperação de sinal + condições.

### 13.4 Parâmetros

Todos em `pilot-return-policy-v1` (Anexo B). **Nenhum valor numérico deste contrato é definitivo de produção.**

---

## 14. Entrega sem confirmação

### 14.1 Não criar cedo demais

**Proibido** criar `entrega_sem_confirmacao` apenas por `arrival_detected`.

Enquanto não houver desfecho, o estado permanece `chegada_detectada` (**aguardando desfecho**).

### 14.2 Gatilhos (o primeiro que ocorrer)

Emitir `delivery_unconfirmed` quando:

| Código | Gatilho |
|---|---|
| `G1_left_destination_area` | Motoboy deixa a área do destino sem `delivery_confirmed` e sem exceção (`customer_not_found`, `return_requested`, `delivery_cancelled`) |
| `G2_next_stop_started` | Outra parada da mesma viagem é iniciada (chegada ou partida efetiva para outro `delivery_id`) |
| `G3_trip_returning` | Viagem entra em `retornando` (`trip_return_started`) |
| `G4_trip_closed` | Viagem é `encerrada` (auto ou manual) |
| `G5_timeout_after_arrival` | Expira `unconfirmed_timeout_s` da política após `chegada_detectada` |

Se nunca houve chegada_detectada, G1/G5 não se aplicam; G2–G4 ainda podem aplicar-se a deliveries **ativas** em em_rota (padrão: sim para G3/G4; G2 se houver evidência de outra parada).

**Entrega com active = false (delivery_removed):** G1, G2, G3, G4 e G5 **não** criam entrega_sem_confirmacao para essa entrega. Remoção ≠ cancelamento. Histórico permanece preservado.

### 14.3 Efeitos da pendência

- Estado: `entrega_sem_confirmacao`.
- **Visível** em fila separada.
- Registra `unconfirmed_trigger`.
- **Não** atribui culpa.
- **Não** bloqueia retorno, encerramento da viagem nem disponibilidade (salvo outras exceções).
- Aceita fechamento posterior: confirmação tardia do motoboy (`delivery_confirmed` a partir de pendência — permitido), ou resolução via ocorrência, ou encerramento operacional da pendência por papel autorizado com motivo.

### 14.4 Fila e papéis

| Papel | Responsabilidade |
|---|---|
| **Operação Viva** | Dono padrão da fila; prioriza e aciona contato/checagem |
| Motoboy | Pode confirmar tardiamente quando aplicável |
| Líder de Delivery / gerente | Escala e fecha ocorrência se virar recuperação |

Encerramento da **pendência** (não da viagem):

- `delivery_confirmed` tardio; ou
- ocorrência fechada que explica o desfecho; ou
- `pending_closed_ops` (evento operacional) por líder/gerente com motivo (`cliente_confirmou_fora_do_app`, `evidencia_externa`, `sem_contato_esgotado`, etc.), **sem** converter automaticamente em “entrega real” se a evidência for fraca — nesse caso preferir ocorrência `fechada_sem_confirmacao` / `informacao_insuficiente`.

---

## 15. Precedência de estados (motoboy e flags)

### 15.1 Tabela de prioridade (maior número = maior prioridade de bloqueio de “livre”)

| Prioridade | Condição | Efeito sobre auto-`disponivel` após retorno |
|---|---|---|
| 100 | `indisponivel` explícito | **Não** auto-disponibilizar |
| 90 | `pausa` explícita | **Não** auto-disponibilizar |
| 80 | `apoio_expedicao` explícito | **Não** auto-disponibilizar |
| 70 | `occurrence_blocking_availability` | **Não** auto-disponibilizar |
| 60 | Viagem ativa (`preparando_saida`/`em_rota`/`retornando`) | Não é `disponivel` |
| 50 | `sem_atualizacao` do ator | **Não** inferir livre |
| 0 | Nenhuma das anteriores | `disponivel` permitido |

### 15.2 Justificativas

1. **Viagem ativa > disponivel:** evita alocar quem ainda está em rota.  
2. **indisponivel/pausa explícitos:** o retorno automático não pode apagar decisão humana de não trabalhar.  
3. **apoio_expedicao:** presença na loja em handoff não é “livre para nova viagem”.  
4. **Ocorrência em tratamento (flag):** viagem pode encerrar; disponibilidade só se não houver ação física pendente.  
5. **sem_atualizacao:** falta de evidência não vira livre.  
6. **Retorno automático só altera ator se prioridade efetiva ≤ 0 de bloqueio.**

### 15.3 Conflito retorno automático vs exceção

Se no instante de `return_detected` existir exceção mais recente (timestamp de evento de exceção > último clear), o trip **encerra**, o ator **permanece** na exceção.

---

## 16. Múltiplos pedidos

| Situação | Regra |
|---|---|
| Inclusão antes da saída | `delivery_added` livre na formação |
| Remoção antes da saída | delivery_removed: active=false; removed_at/reason/by; histórico preservado; se zero ativos, não permitir trip_started |
| Inclusão após trip_started | Papel autorizado + motivo + delivery_added; delivery entra em **em_rota**; planned_stop_order registrado ou recalculado por evento |
| Remoção após saída | delivery_removed com auth: active=false; removed_*; não apaga objeto; não gera unconfirmed G1–G5; distinto de cancelada |
| Reordenação | `stop_reordered` |
| Entrega parcial | Cada delivery com seu estado; viagem pode seguir |
| Cancelamento | Por delivery; não cancela outros |
| Retorno com pedido (retorno_solicitado) | Delivery em `retorno_solicitado`; não força estados dos demais |
| Viagem encerrada com pendências | Permitido; fila §14 |

### 16.1 delivery_removed (norma)

O evento delivery_removed:

1. preserva **todo** o histórico de eventos da Delivery;
2. remove a entrega do **conjunto ativo** da viagem (active = false);
3. registra removed_at, removed_reason e removed_by;
4. **impede** que G1, G2, G3, G4 ou G5 criem entrega_sem_confirmacao para essa entrega;
5. **não apaga** o objeto Delivery;
6. **não** é equivalente a delivery_cancelled (cancelada é desfecho de pedido; removida é saída da composição ativa da viagem).

### 16.2 Inclusão após trip_started (norma)

Delivery adicionada a viagem já ativa:

- entra em estado **em_rota** (único estado inicial pós-início);
- exige papel autorizado, motivo e evento delivery_added;
- planned_stop_order deve ser registrado no evento ou recalculado por stop_reordered / evento equivalente;
- **proibido** usar formulação ambígua "em_rota/aguardando conforme regra".

**Uma entrega nunca encerra as demais. A viagem pode encerrar com deliveries em estados heterogêneos.**

---

## 17. Offline, idempotência e conflitos

### 17.1 Campos obrigatórios de evento

`event_id`, `occurred_at`, `recorded_at`, `synced_at` (no recebimento), `origin`, `device_id` (se device), `idempotency_key`, `contract_version`, `clock_trust`.  
`sequence_local` opcional por dispositivo.

### 17.2 Regras mínimas

1. Mesmo `event_id` **nunca** aplica efeito duas vezes.  
2. Mesma `idempotency_key` com mesmo fato → observacao repetida; com fato incompatível → conflito em quarentena.  
3. Evento atrasado **não reverte** automaticamente estado mais novo derivado de eventos de maior autoridade/precedência.  
4. Evento válido atrasado **permanece no histórico**.  
5. Conflito manual × automático: **preservar ambos**; estado derivado por §15 e autoridade de papel.  
6. `clock_trust=suspect` se |occurred_at − synced_at| > limiar de política offline **ou** occurred_at no futuro além da tolerância.  
7. Eventos offline sempre guardam horário declarado e de recebimento.

### 17.3 Matriz de conflitos (resumo)

| Situação | Política V1 |
|---|---|
| Duplicata idêntica | Ignorar efeito; contar recepção |
| `delivery_confirmed` duplicado | Manter primeiro; segundo `duplicate_ignored` |
| `return_detected` após `encerrada` manual | Histórico + **sem** reabrir; preferir trilha manual |
| `trip_closed_manual` após `return_detected` já aplicado | Manter `encerrada`; anexar manual como correção de motivo se necessário |
| `delivery_confirmed` após `entrega_sem_confirmacao` | Aceitar; estado → `entregue_confirmado` |
| `arrival_detected` após `entregue_confirmado` | Histórico; não regredir estado |
| Exceção `pausa` vs auto-`disponivel` | Precedência §15 |
| Dois `trip_started` | Segundo inválido se já em_rota |
| Evento de trip encerrada tentando em_rota | Rejeitado |
| customer_not_found / return_requested / delivery_cancelled com occurred_at anterior a delivery_unconfirmed, mas synced_at posterior | Preservar occurred_at, recorded_at, synced_at, clock_trust e trilha completa; reavaliar estado derivado pela precedência temporal de occurred_at e autoridade do evento; **não** tratar como fraude ou culpa automática; se o evento de exceção for válido, o estado da delivery reflete a exceção (não permanece unconfirmed se a exceção for mais específica e anterior) |
| return_detected sem trip_closed_automatic | Reconciliação de fechamento (§13.2.1); retry idempotente |
| trip_closed_automatic duplicado | Ignorar segundo efeito |

Detalhamento no Anexo A (aba Conflitos).

---

## 18. Encerramento manual

### 18.1 Papéis autorizados

- Líder de Delivery  
- Gerente  
- Papel administrativo **expressamente autorizado** na política `pilot-manual-close-policy-v1`

### 18.2 Exigências

- Motivo obrigatório (catálogo + texto).  
- Evidência disponível (declaração, contato, foto interna opcional, etc.).  
- Autor, papel, data/hora.  
- Lista de deliveries ainda não terminais.  
- Justificativa de ausência de GPS quando couber.  
- Registro imutável `trip_closed_manual`.

### 18.3 Motoboy

O motoboy **não** encerra manualmente a viagem “no vazio”. Deve registrar retorno/exceção correspondente (`trip_return_started`, eventos de entrega, ou acionar fluxo que leve a `sem_atualizacao` + suporte). Encerramento formal da viagem sem GPS é dos papéis §18.1.

---

## 19. Handoff iFood / plataforma

Fluxo normativo separado:

1. Pedido externo pronto.  
2. Courier externo chega (`external_courier_ref`).  
3. Conferência/Expedição confere pedido e volumes.  
4. Quem repassa fisicamente confirma o handoff.  
5. Responsabilidade física da loja encerra no repasse confirmado.  

**Proibido:** `trip_id` de viagem própria para este fluxo.  
Exceções (sacola errada, volume, courier) geram ocorrência de domínio expedição, não “entrega do motoboy”.

---

## 20. Ocorrências e recuperação

### 20.1 Estados

`aberta` · `aguardando_cliente` · `aguardando_operacao` · `em_tratamento` · `reenvio_em_andamento` · `retorno_solicitado` · `resolvida` · `fechada_sem_confirmacao` · `nao_resolvida` · `informacao_insuficiente`

### 20.2 Separação semântica obrigatória

| Conceito | Uso |
|---|---|
| Relato | O que foi dito |
| Fato | O que foi evidenciado |
| Hipótese | Causa possível |
| Ação prometida | Compromisso |
| Ação executada | O que foi feito |
| Confirmação | Known / unknown / none |
| Fechamento | Estado final da ocorrência |

Fechamento: **Líder de Delivery ou gerente**, com campos mínimos preenchidos.

---

## 21. Privacidade do GPS

### 21.1 Princípios normativos

- GPS **somente** durante viagem ativa (`em_rota`, `retornando`).  
- Desligar coleta ao `encerrada` ou política de timeout em `sem_atualizacao`.  
- Sem GPS permanente.  
- Sem ranking, punição automática, produtividade individual.  
- Acesso mínimo por função + trilha de acesso.  
- Mascaramento em relatórios.  
- Retenção limitada + eliminação programada.

### 21.2 Separação de dados

| Camada | Conteúdo | Uso |
|---|---|---|
| **Brutos** | Coordenadas, precisão, timestamps densos | Calibração, disputa de curto prazo |
| **Derivados** | `arrival_detected`, `return_detected`, perda de sinal, evidência de permanência resumida | Operação e auditoria |

### 21.3 Opções de piloto para validação jurídica (não definitivas)

| Opção | Brutos | Derivados | Notas |
|---|---|---|---|
| A — mínima | 24–72 h | 90–180 dias | Preferencial para começar |
| B — média | 7 dias | 180–365 dias | Se houver disputa frequente |
| C — restrita | Só em memória de dispositivo até sync + 24 h servidor | 90 dias | Máxima minimização |

A escolha jurídica final **não** é deste contrato técnico; o piloto deve registrar a opção aprovada em `pilot-gps-retention-policy-v1`.

---

## 22. Guardrails (cláusulas normativas)

1. Não atribuir culpa automaticamente.  
2. Não criar ranking.  
3. Não criar punição automática.  
4. Não avaliar desempenho individual automaticamente.  
5. Não usar GPS fora da viagem ativa.  
6. Não tratar geofence como entrega.  
7. Não tratar ausência de confirmação como falha real de entrega.  
8. Não apagar histórico.  
9. Não inventar horário.  
10. Não transformar inferência em fato.  
11. Não reabrir viagem operacionalmente por evento atrasado.  
12. Não confirmar entrega por sistema sem ação do motoboy.

---

## 23. Políticas de piloto (Anexo B)

Cada política possui: `policy_id`, `version`, `date`, `unit_id`, `parameters`, `approved_by`, `review_criteria`, `change_log`.

Políticas obrigatórias V1:

| policy_id | Função |
|---|---|
| `pilot-return-policy-v1` | Retorno automático |
| `pilot-geofence-policy-v1` | Geometrias unidade/destino |
| `pilot-gps-quality-policy-v1` | Recência, precisão, amostras |
| `pilot-gps-retention-policy-v1` | Retenção brutos/derivados |
| `pilot-unconfirmed-policy-v1` | Gatilhos e timeouts de pendência |
| `pilot-offline-policy-v1` | Clock, conflitos, tolerâncias |
| `pilot-manual-close-policy-v1` | Papéis e evidências manuais |

Valores iniciais no Anexo B são **placeholders de calibração**, não verdade operacional.

---

## 24. Critérios de aceite

Os cenários canônicos estão no **Anexo C**. Aceite do contrato (documental) exige que cada cenário tenha: estado inicial, eventos, transições, resultado, evidência, ação humana, falha segura — e esteja **livre de contradição** com §§5–22.

Aceite de **implementação futura** só após: (a) este contrato aprovado; (b) políticas de piloto preenchidas por unidade; (c) bateria de cenários automatizáveis verde; (d) parecer jurídico de retenção GPS se aplicável.

---

## 25. Decisões ainda pendentes

### 25.1 Fechadas por este contrato (instanciação das ressalvas de auditoria)

Ver `ENTREGAS_V1_0_3_REGISTRO_DECISOES.md` — inclui: gatilhos G1–G5, precedência, terminalidade/reabertura admin não operacional, papéis de encerramento manual, dono da fila (Operação Viva), matriz offline.

### 25.2 Parametrizadas em piloto (sem valor definitivo)

Raio/geometria, permanência, velocidade, idade do fix, precisão, amostras, timeout de pendência, tolerância de relógio, opção de retenção GPS A/B/C, `require_all_active_stops_resolved`, `allow_return_from_em_rota`.

### 25.3 Ainda abertas (fora do fechamento técnico V1)

- Aprovação jurídica final de prazos de retenção.  
- Catálogo completo de motivos de encerramento manual e de `pending_closed_ops`.  
- Mapa de tipos de ocorrência que ligam `occurrence_blocking_availability`.  
- Definição de “área do destino” do cliente (geocoding/qualidade) por unidade.  
- Integração futura com fontes iFood exportáveis.

---

## 26. Próximo gate

1. Revisão humana do Contrato V1 + anexos.  
2. Preenchimento de políticas de piloto por unidade (ainda **sem** ligar produção).  
3. Somente após autorização explícita: desenho técnico / implementação.  

**Este documento não autoriza implementação.**

---

## 27. Decisões soberanas (R1 — não reabrir)

Reafirmadas integralmente:

1. `trip_id` antes da saída.  
2. Um ou vários pedidos por viagem.  
3. Inclusão/remoção/reordenação por evento sem sobrescrita.  
4. GPS só em viagem ativa.  
5. GPS pode gerar `chegada_detectada`.  
6. GPS/geofence nunca geram `entregue_confirmado`.  
7. Entrega confirmada por ação simples do motoboy.  
8. Sem confirmação → `entrega_sem_confirmacao`.  
9. Pendência não bloqueia retorno/encerramento/disponibilidade.  
10. Retorno normal automático por condições cumulativas.  
11. Sem GPS confiável → `sem_atualizacao`.  
12. Encerramento manual excepcional e auditável.  
13. Após retorno normal → `disponivel`, salvo exceção explícita.  
14. Offline com horário original e de sincronização.  
15. Handoff não cria viagem própria.  
16. Conferência/volumes vs repasse físico.  
17. Líder de Delivery ou gerente encerra ocorrências.  
18. Proibidos ranking, punição automática, avaliação individual automática, GPS permanente e geofence como prova de entrega.

---

*Fim do Contrato Operacional Real de Entregas V1 (texto).*


---


---


---

## 28. Notas do patch 1.0.3

Correções documentais exclusivas sobre 1.0.2:

1. Seção 11.1: linha trip_return_started com colunas alinhadas (De | Evento | Para | Ator | Pré-condições | Falha segura).
2. active=false / delivery_removed: excluído de G1, G2, G3, G4 e G5 em todas as seções normativas.

Modelo operacional e 39 cenários inalterados. Versão 1.0.2 preservada intacta.
