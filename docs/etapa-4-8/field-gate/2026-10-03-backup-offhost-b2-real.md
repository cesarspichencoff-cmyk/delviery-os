# Prova externa de backup â€” Backblaze B2

Data: 2026-10-03
Escopo: **ensaio isolado, nÃ£o operacional**
Branch: `tmp/offhost-s3-minio-proof-20261002`
Base antes desta sucessÃ£o: `99b1ba6db4b8ddf808fe9ae81d2426d9fa7960e3`

## Estado final desta prova

- **CÃ³pia fisicamente off-host:** PROVEN.
- **Round-trip S3 com identidades separadas:** PROVEN.
- **Restore de dump PostgreSQL vindo do provedor externo:** PROVEN.
- **RetenÃ§Ã£o real de 14 dias em Compliance:** PROVEN.
- **Uploader com capability IAM estrita sem deleteFiles:** **NOT_PROVEN / GAP ABERTO**.
- **ProduÃ§Ã£o, cutover, migrations operacionais ou deploy:** NÃƒO AUTORIZADOS / NÃƒO EXECUTADOS.

## Infraestrutura de ensaio

- provedor: Backblaze B2;
- regiÃ£o S3: `us-east-005`;
- bucket: `deliveryos-offhost-proof-20261003-84c7`;
- bucket privado;
- Object Lock habilitado;
- Default Retention: `COMPLIANCE / 14 days`;
- prefixo: `deliveryos-backups/`.

## Provas executadas

- `BACKUP_OFFHOST_S3_LIVE_GREEN 7/7` e `BAD_SIGNATURE_REJECTED=true` no B2 real.
- `PILOT_POSTGRES_BACKUP_RESTORE: 7/7 PASS` usando o dump baixado do B2 como entrada do restore.
- O restore ocorreu em banco vazio e preservou fingerprint, contagens, eventos, outbox, triggers e versÃµes.
- RegressÃ£o do candidato: S3 unitÃ¡rio `10/10`, integridade `7/7`, export `7/7`, typecheck e governanÃ§a verdes.

## Fronteira aberta

A credencial temporÃ¡ria de upload criada pelo preset `Write Only` do painel B2 nÃ£o possui `readFiles`, mas inclui `deleteFiles`. Object Lock em `COMPLIANCE / 14 days` impede apagar os objetos retidos e a chave expira em 24 h; isso reduz o risco do ensaio, porÃ©m **nÃ£o substitui** a prova de uma credencial definitiva limitada a `writeFiles` sem `deleteFiles`. Esse requisito permanece aberto antes de ativaÃ§Ã£o operacional.
