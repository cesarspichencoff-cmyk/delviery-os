# Protocolo DeliveryOS AI Node v1

## Identidade de trabalho

`idempotency_key = SHA-256(conversation_id_sanitizado | turn_id | request_type | model_version | prompt_contract_version)`.

Campos mínimos: `job_id`, `idempotency_key`, `conversation_id`, `turn_id`,
`request_type`, `requested_model`, `provider_version`, `prompt_contract_version`,
`payload_hash`, `node_id`, `lease_owner`, `lease_expires_at`, `attempt_count`,
`created_at`, `expires_at`, `completed_at`, `validator_result`,
`fallback_reason` e métricas de tempo.

## Endpoints lógicos

```text
POST /internal/ai-node/v1/register
POST /internal/ai-node/v1/heartbeat
POST /internal/ai-node/v1/jobs/claim
POST /internal/ai-node/v1/jobs/:jobId/processing
POST /internal/ai-node/v1/jobs/:jobId/result
```

O contrato não obriga uma framework HTTP. A camada hospedada valida autenticação,
unidade, estado do node, nonce, relógio, hash do corpo e assinatura antes de
chamar os serviços.

## Claim/lease

1. o node autenticado pede no máximo um trabalho compatível;
2. o store escolhe `queued` não expirado com lock concorrente;
3. grava evento `claimed`, proprietário e vencimento do lease;
4. o node confirma `processing` usando o mesmo lease token;
5. resultado assinado é aceito somente durante lease válido, uma vez;
6. resultado tardio, node revogado ou payload divergente é rejeitado;
7. lease expirado gera `expired` e requeue se o job ainda estiver válido;
8. após tentativas máximas, o job vira `failed` e o fallback é registrado.

## Envelope ao node

Somente mensagem sanitizada, histórico recente sanitizado, resumo estruturado,
fatos autorizados, jornada, pergunta pendente, playbook, ações permitidas e
claims proibidos. O envelope não contém texto bruto persistível, chain of
thought, PII, credencial, GPS, CRM integral ou identificador real completo.

## Resultado

O node devolve `director_output` ou `writer_output`, metadados do modelo,
latências e hashes. Reasoning é descartado no node. O DeliveryOS valida schema,
fatos, ações, políticas, links, números e perguntas antes de considerar a saída.

