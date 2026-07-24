# Modelo de Dados CRM V0

## Princípios

1. IDs internos, nunca nome como chave.
2. Identidades pessoais entram somente como tokens no piloto.
3. Toda entidade carrega `tenant_id` e `profile_id` quando aplicável.
4. Timeline append-only: correção é novo evento, não sobrescrita.
5. Consentimento é observado, nunca presumido.
6. Promessa exige ocorrência e autorização humana.
7. Benefício autorizado exige humano; o estado padrão é `pending_human`.
8. Nenhuma entidade executa decisão financeira.

## Entidades

### CustomerProfile

Raiz interna da pessoa no escopo de uma unidade.

- `profile_id`
- `tenant_id`
- `status`
- `provenance`
- `created_at`

Não contém nome, telefone, e-mail ou endereço.

### CustomerIdentity

Associa o perfil a uma identidade pseudonimizada.

- `identity_id`
- `profile_id`
- `identity_type`: `phone_token`, `email_token` ou `external_token`
- `value_token`
- `source`
- `verification_state`
- `created_at`

Igualdade de token pode gerar candidato; não determina fusão quando existem divergências.

### CustomerOrderReference

Referência tokenizada para um pedido observado por outra fonte.

- `reference_id`
- `profile_id`
- `order_token`
- `source`
- `observed_at`
- `status`

A frequência agregada da planilha não cria esta entidade, pois não existe pedido individual.

### CustomerOccurrence

Registro codificado de uma situação que precisa de memória ou acompanhamento.

- `occurrence_id`
- `profile_id`
- `intent`
- `origin`
- `severity`
- `status`
- `summary_code`
- `evidence_codes[]`
- `created_at`

O texto bruto da conversa não é armazenado.

### CustomerPromise

Compromisso registrado depois de decisão humana.

- `promise_id`
- `profile_id`
- `occurrence_id`
- `promise_type`
- `status`
- `authorized_by_human_id`
- `authorized_at`
- `due_at`
- `created_at`

Sem `authorized_by_human_id`, a criação falha.

### CustomerBenefit

Memória de benefício em avaliação ou autorizado.

- `benefit_id`
- `profile_id`
- `occurrence_id`
- `benefit_type`
- `status`
- `authorized_by_human_id`
- `authorized_at`
- `created_at`

`authorized`, `delivered` e `cancelled` exigem uma autorização humana registrada. O motor não cria benefício.

### CustomerConsent

Observação de consentimento por canal.

- `consent_id`
- `profile_id`
- `channel`
- `status`: `unknown`, `opt_in` ou `opt_out`
- `source`
- `observed_at`
- `created_at`

O estado vigente é a última observação append-only daquele canal. Importar telefone não significa `opt_in`.

### CustomerTimelineEvent

Memória cronológica imutável.

- `event_id`
- `profile_id`
- `event_type`
- `source`
- `occurred_at`
- `payload`

O payload aceita apenas informação operacional codificada. Chaves pessoais e conteúdo semelhante a contato são rejeitados.

## Isolamento

Toda consulta exige `tenant_id + profile_id`. Um perfil de uma unidade não pode ser lido por outra. A V0 usa memória de processo; persistência durável e política de retenção pertencem a uma fase posterior.

## Transições sem mutação

- Nova ocorrência: cria `CustomerOccurrence` e `occurrence_created`.
- Nova promessa: cria `CustomerPromise` e `promise_registered`.
- Opt-out: cria `CustomerConsent` e `consent_recorded`.
- Mudança futura de status: deverá criar nova entidade/evento de transição, nunca editar história anterior.

