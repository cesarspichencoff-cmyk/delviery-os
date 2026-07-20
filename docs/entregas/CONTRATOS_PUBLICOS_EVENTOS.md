# Contratos públicos de eventos — ENTREGAS

| Campo | Valor |
|---|---|
| Catálogo | `catalog_version` **1.0.0** |
| Envelope | `schema_version` **1.0.0** |
| Status | **pre_integration** |
| Consumer live | **disabled** |
| Código | `src/entregas/contracts/events/` |
| Hash | `computePublicSchemasHash()` — ver freeze manifest / saída dos testes |

---

## Congelamento

Arquivo lógico: `buildPublicContractsFreezeManifest(origin_commit)` em  
`src/entregas/contracts/events/freeze-manifest.ts`.

Conteúdo do manifesto:

- `catalog_version`, `schema_version`
- lista de `event_types` + contagem
- aliases (somente leitura; não duplicam log)
- `schemas_hash` (SHA-256 do material canônico)
- política de compatibilidade
- `origin_commit` (git SHA no freeze)
- `status: pre_integration`
- `consumer_live: disabled`

**Mudança incompatível** (renomear evento, mudar significado de campo, remover obrigatório) → **nova** `schema_version` / `catalog_version`.  
Campos opcionais aditivos, se ignoráveis por consumidores antigos, podem permanecer na mesma major com documentação.

---

## Envelope (campos)

### Obrigatórios
`event_id`, `event_type`, `schema_version`, `occurred_at`, `recorded_at`, `idempotency_key`, `source` (=`entregas`), `source_health`, `confidence`, `unit_id`, `payload`, `correlation_id`

### Opcionais
`synced_at`, `trip_id`, `delivery_id`, `handoff_id`, `occurrence_id`, `rider_actor_id` (opaco), `causation_id`, `contract_version`

### Proibidos no payload
Nome completo, telefone, ranking, produtividade, WhatsApp bruto, CPF/documento, score, endereço completo, histórico de coordenadas, senhas — ver `FORBIDDEN_PAYLOAD_KEYS`.

---

## Eventos

Nomes **COR** quando canônicos. Lista completa em `catalog.ts` (`PUBLIC_EVENT_TYPES`).

Aliases de leitura (não gravar no outbox):  
`delivery_added_to_trip`→`delivery_added`, `trip_departed`→`trip_started`, `handoff_confirmed`→`handoff_transferred`, etc.

---

## Ordenação e correlação

- **Sem** garantia de ordenação global.  
- Correlação explícita: `trip_id` | `delivery_id` | `handoff_id` | `occurrence_id` | `correlation_id`.  
- `occurred_at` é o horário do fato; `synced_at` não o substitui.

---

## Localização (se futura)

Se um sinal operacional de localização for necessário:

- finalidade limitada (ex.: retorno à loja);
- precisão mínima necessária;
- retenção curta;
- **não** histórico contínuo no evento público padrão.

---

## Validação

`validatePublicEvent()` — testes de contrato + exemplos em `examples.ts`.

---

*Contrato público pre_integration · consumer live disabled · 2026-07-20*
