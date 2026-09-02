-- DeliveryOS Customer Intelligence V1.
-- Contrato para aplicação futura no PostgreSQL existente.
-- Não executar automaticamente em produção.

create table if not exists customers (
  customer_id text primary key,
  tenant_id text not null,
  status text not null,
  provenance text not null,
  created_at timestamptz not null
);

create table if not exists customer_events (
  event_id text primary key,
  customer_id text not null references customers(customer_id),
  sequence bigint not null,
  event_type text not null,
  source text not null,
  actor text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  unique (customer_id, sequence)
);

create table if not exists customer_identities (
  identity_id text primary key,
  customer_id text not null references customers(customer_id),
  identity_type text not null,
  identity_token text not null,
  source text not null,
  verification_state text not null,
  created_at timestamptz not null,
  unique (identity_type, identity_token, source, customer_id)
);

create table if not exists customer_facts (
  fact_id text primary key,
  customer_id text not null references customers(customer_id),
  field text not null,
  value jsonb,
  certainty_state text not null,
  source text not null,
  observed_at timestamptz not null,
  valid_until timestamptz
);

create table if not exists customer_consents (
  consent_id text primary key,
  customer_id text not null references customers(customer_id),
  purpose text not null,
  channel text not null,
  state text not null,
  source text not null,
  evidence_code text,
  observed_at timestamptz not null,
  expires_at timestamptz
);

create table if not exists customer_relations (
  relation_id text primary key,
  customer_id text not null references customers(customer_id),
  relation_type text not null,
  source text not null,
  payload jsonb not null,
  occurred_at timestamptz not null
);

create table if not exists customer_restrictions (
  restriction_id text primary key,
  customer_id text not null references customers(customer_id),
  restriction_type text not null,
  restriction_value jsonb not null,
  certainty_state text not null,
  source text not null,
  created_at timestamptz not null
);

create table if not exists customer_data_requests (
  data_request_id text primary key,
  customer_id text not null references customers(customer_id),
  request_type text not null,
  state text not null,
  requested_at timestamptz not null,
  completed_at timestamptz,
  evidence_code text
);

create table if not exists customer_merge_history (
  merge_event_id text primary key,
  surviving_customer_id text not null references customers(customer_id),
  merged_customer_id text not null,
  decision text not null,
  decided_by text not null,
  occurred_at timestamptz not null,
  reversible_payload jsonb not null
);

create table if not exists import_batches (
  batch_id text primary key,
  source_adapter text not null,
  source_version text not null,
  file_hash text not null,
  state text not null,
  created_at timestamptz not null,
  unique (source_adapter, source_version, file_hash)
);

create table if not exists import_rows (
  import_row_id text primary key,
  batch_id text not null references import_batches(batch_id),
  row_number integer not null,
  state text not null,
  normalized_payload jsonb,
  warning_codes jsonb not null,
  unique (batch_id, row_number)
);

create table if not exists import_errors (
  import_error_id text primary key,
  batch_id text not null references import_batches(batch_id),
  row_number integer,
  error_code text not null,
  removed_fields jsonb not null
);

create table if not exists import_column_mappings (
  mapping_id text primary key,
  source_adapter text not null,
  source_version text not null,
  mapping jsonb not null,
  created_at timestamptz not null
);

