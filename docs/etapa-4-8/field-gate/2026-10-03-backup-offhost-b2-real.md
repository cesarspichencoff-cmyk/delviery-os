# Prova externa de backup — Backblaze B2

Data: 2026-10-03
Escopo: **ensaio isolado, não operacional**
Branch: `tmp/offhost-s3-minio-proof-20261002`
Checkpoint anterior: `f0daa895a00c0dee7a5f171ca59c6dfd4d4653e4`

## Estado final

- **Cópia fisicamente off-host:** PROVEN.
- **Round-trip S3 com identidades separadas:** PROVEN.
- **Uploader sem leitura e sem delete:** PROVEN.
- **Reader sem escrita:** PROVEN.
- **Restore de dump PostgreSQL vindo do provedor externo:** PROVEN.
- **Retenção real de 14 dias em Compliance:** PROVEN.
- **Produção, cutover, migrations operacionais ou deploy:** NÃO EXECUTADOS.

## Infraestrutura do ensaio

- provedor: Backblaze B2;
- região S3: `us-east-005`;
- bucket: `deliveryos-offhost-proof-20261003-84c7`;
- bucket privado;
- Object Lock habilitado;
- Default Retention: `COMPLIANCE / 14 days`;
- prefixo: `deliveryos-backups/`.

## Credenciais finais de prova

- writer: capability **exatamente `writeFiles`**;
- reader: capabilities **exatamente `listAllBucketNames,readFiles`**;
- ambas restritas ao bucket, ao prefixo e com TTL de 24 h;
- cinco chaves temporárias anteriores foram revogadas;
- cache administrativo local e segredos locais foram removidos após os testes.

## Provas finais

1. `BACKUP_OFFHOST_S3_LIVE_GREEN 7/7`.
2. `BAD_SIGNATURE_REJECTED=true`.
3. PostgreSQL 17.11 real e isolado produziu `pg_dump --format=custom`.
4. O dump fez round-trip pelo B2 antes do restore.
5. O restore ocorreu sobre banco realmente vazio.
6. `PILOT_POSTGRES_BACKUP_RESTORE: 7/7 PASS`.
7. Fingerprint, conteúdo, eventos, outbox, triggers e continuidade de versão foram preservados.

## Fronteira

Esta prova fecha a frente técnica de **backup off-host do piloto** no escopo isolado. Ela não
constitui autorização de produção. Permanecem separados os efeitos operacionais: credencial SQL
real, migrations 0006–0008 no banco operacional, seleção de
`ENTREGAS_STORAGE_BACKEND=postgres`, cutover, deploy e ativação de `consumer_live`/UI live.
