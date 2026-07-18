# Decisões de Produto — Entregas V0.1

| Campo | Valor |
|---|---|
| Worktree | `deliveryos-tata-evolucao` |
| Branch | `research/tata-evolucao-grok` |
| Base auditoria | `docs/entregas-design-audit/` + contratos `docs/deliveryos/*` |
| Status | Decisões para design V0.1 — **sem protótipo visual nesta missão** |

---

## 0. Tese e fronteiras (fechado)

**Tese:** Entregas é a **consciência operacional da viagem** (estados, desconhecidos, confirmações, fechamento real), da preparação ao fechamento comprovado.

**Não é:** rastreador invasivo · mapa decorativo · ranking · painel de produtividade · chat · lista genérica de pedidos · clone de app logístico.

| Princípio | Status |
|---|---|
| Presença ≠ disponibilidade | **Fechado** (contrato V0.1) |
| Promessa ≠ execução | **Fechado** |
| Saída ≠ entrega | **Fechado** |
| Sem reclamação ≠ confirmação | **Fechado** |
| Localização ≠ prova única | **Fechado** |
| GPS não punitivo | **Fechado** |
| Viagem só termina com fechamento comprovado | **Fechado** |
| Foco amplo = Copiloto/OV, não Entregas | **Fechado** |

---

## 1. Volumes (fechado — modelo simples)

### 1.1 Conceito

**Volume** = unidade física contável (sacola, caixa, envelope) associada a um `delivery_id` e, na viagem, agregada no `trip_id`.

Não é ficha técnica de item de cardápio.

### 1.2 Campos

| Campo | Significado | Momento |
|---|---|---|
| `volumes_expected` | Esperado para a entrega | Montagem / OV+expedição |
| `volumes_checked` | Conferido na loja antes do handoff ao rider | Conferência |
| `volumes_handed_to_rider` | Passados ao entregador (próprio ou no handoff) | Pickup / handoff |
| `volumes_received_by_rider` | Rider confirma o que recebeu | PickupConfirm |
| `volumes_delivered_to_customer` | Entregues no stop | DeliveryConfirmation |
| `volumes_returned` | Voltaram à loja | Return / recusa |
| `volume_divergence` | Diferença em qualquer momento | Flag + audit |

### 1.3 Regras UX / produto

| Regra | Efeito |
|---|---|
| V-01 | Sem `volumes_expected` (ou override LE) → não `ready_to_depart` |
| V-02 | `handed_to_rider` deve igualar `received_by_rider` ou abrir **E07** |
| V-03 | Divergência na loja **bloqueia saída** até resolver ou override LE + audit |
| V-04 | Confirmação de entrega pede volumes entregues (default = expected se 1 volume) |
| V-05 | Recusa/avaria sem entrega → volumes entram em `volumes_returned` no retorno |
| V-06 | Fechamento de viagem exige reconciliação: expected ≈ delivered + returned (+ divergência aceita) |
| V-07 | UI **não** atribui culpa nominal por divergência |

Previne: volume esquecido · handoff errado · saída incompleta · fechamento sem reconciliação.

---

## 2. Tentativas (fechado — evento, não só status)

### 2.1 Objeto `DeliveryAttempt`

| Campo | Obrigatório |
|---|---|
| `attempt_id` | sim |
| `delivery_id` · `trip_id` · `stop_id` | sim |
| `started_at` | sim |
| `result` | sim: `success` · `failed` · `deferred` · `abandoned_safety` |
| `exception_code` | se failed/deferred (E01–E10) |
| `evidence_refs` | opcional |
| `next_action` | sim: `retry` · `continue_route` · `return_store` · `await_le` |
| `ended_at` | sim |

### 2.2 Regras

| Regra | Conteúdo |
|---|---|
| T-01 | Tentativa **sem sucesso não encerra** a Delivery |
| T-02 | `success` exige `DeliveryConfirmation` (método + volumes) |
| T-03 | Cada visita relevante ao stop gera attempt (não “sumir” no status) |
| T-04 | Máx. tentativas na **mesma viagem**: **2** por padrão (provisório); 3ª = LE |
| T-05 | E08 → `abandoned_safety` + retorno; sem nova tentativa forçada |
| T-06 | Histórico de attempts é auditável; sem score de rider |

---

## 3. Mobile V0.1 (fechado — escopo)

### Inclui
Viagem atual · próxima parada · ordem das entregas · referência operacional · volumes · confirmação chegada (leve) · confirmação entrega · registrar exceção · registrar retorno · estado offline · fila de sync pendente.

### Exclui
Ranking · produtividade · chat genérico · histórico permanente de GPS · admin excessivo · financeiro · dashboards · mapa como home.

Detalhe de arquitetura: `UX_ARCHITECTURE.md`.

---

## 4. Papel do mapa (fechado)

| Decisão | Conteúdo |
|---|---|
| Papel | **Apoio**, nunca superfície principal |
| Quando mostrar | Sob demanda (“Ver mapa”) na parada atual / navegação externa |
| Quando oculto | Default mobile; desktop expedição; pico de loja |
| Dados mínimos | Ponto da parada atual (se houver); **não** trail completo na UI de chão |
| Sem localização | Fluxo **100% textual**: ordem de paradas + ref + ação |
| Alternativa | Lista ordenada + endereço/ref operacional |
| Privacidade | Sem heatmaps; sem replay punitivo; sessão GPS só na trip |
| Desatualizado | Badge “localização desatualizada”; não inventar pin |

**A experiência funciona sem mapa.**

---

## 5. Notificações (fechado — enxuto)

### Permitidas (operacionais)

| Evento | Quem | Nota |
|---|---|---|
| Viagem pronta / atribuída | Rider | 1× |
| Alteração relevante **antes** da saída | Rider | volumes/stops/cancel |
| Tentativa sem sucesso (se LE precisa saber) | LE | não spam a cada minuto |
| Retorno solicitado | Rider / LE | |
| Conflito de sincronização | Rider + LE | acionável |
| Fechamento pendente | LE / rider | return provisional |

### Proibidas
Repetição agressiva · urgência permanente · cobrança individual (“você está lento”) · alerta sem ação · ranking push.

Cooldown + agrupar; alinhar espírito de operação silenciosa do Copiloto **sem** Entregas emitir Foco.

---

## 6. Reenvio (fechado — fronteira)

| Sistema | Papel |
|---|---|
| **Entregas** | Registra fato (não entregue, retorno, volumes) e **transporte** da nova ida se houver |
| **OV / Copiloto / LE** | Decide **se** reenviar e prioridade operacional |
| **Caixa** | Consequência financeira (estorno, recobrança) — **fora** de Entregas |
| Nova entrega | Novo `delivery_id` |
| Vínculo | `reissue_of` / `related_delivery_id` auditável à original |

Reenvio **não** é fluxo financeiro dentro de Entregas.

---

## 7. Retenção e privacidade (provisório — configurável)

| Dado | Recomendação V0.1 | Nota |
|---|---|---|
| Dados da viagem (estados, timestamps) | Operacional **90 dias**; audit resumo **365 dias** | Ajustável |
| Localização de sessão (pontos GPS) | **Só durante trip ativa** em device; servidor: retenção curta **14–30 dias** se sincronizado | Sem histórico “sempre ligado” |
| Evidências (fotos de embalagem) | **60–90 dias** ou até disputa encerrada | Mínimo necessário |
| Ocorrências | **180–365 dias** | Sem PII extra |
| Logs offline / sync | Até sync + **30 dias** trilha | |

### Princípios (fechados)
Coleta mínima · acesso por função · sem histórico GPS desnecessário · sem análise de desempenho individual · retenção documentada · evidência alternativa ao GPS (confirmação + volumes + attempt).

**Não** é prazo jurídico definitivo — validação posterior com César/jurídico.

---

## 8. Decisões provisórias (explícitas)

| ID | Tema | Provisório |
|---|---|---|
| P1 | Máx. 2 tentativas/viagem | Ajustável por loja |
| P2 | Prazos de retenção numéricos | Faixas; não lei |
| P3 | Chegada ao stop: botão “Cheguei” opcional se GPS fraco | Não obrigar precisão |
| P4 | Foto em E06 opcional | Nunca default invasivo |

---

## 9. Explicitamente fora do V0.1 de produto

Integração live Copiloto · write Foco · ranking · geofence auto-disponível · multi-loja · chat · $ em Entregas · OCR completo de todas impressoras.
