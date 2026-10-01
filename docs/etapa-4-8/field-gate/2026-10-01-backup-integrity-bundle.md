---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-01-backup-integrity-bundle.md
  status: ACTIVE
  authority_scope: backup_integrity_bundle_evidence
  superseded_by: null
  atualizado_em: "2026-10-01"
  state_basis: ba8f2cd
---

# Backup transportável — integridade de snapshot + sidecar SHA-256

Data: 2026-10-01
Host: Foxxy
Base Git: `ba8f2cd030987bb101eb5a0e0c2149c4f8b14178`
Resultado: **CODE_READY + TEST_PASS local; destino off-host e Docker/Compose real NOT_RUN**

## Gap reproduzido

O backend file já criava um arquivo `.sha256`, mas o restore não o verificava.
O sidecar PostgreSQL do Compose criava `pg_dump --format=custom` sem checksum
transportável. Portanto uma cópia futura para outro host não tinha um contrato
único para provar que os bytes recebidos eram os mesmos do snapshot gerado.

Isso não é o mesmo que backup off-host: é a integridade necessária para poder
verificar uma cópia depois do transporte.
## Correção

O sidecar de backup do Compose agora, para **file e postgres**:

- cria o snapshot;
- calcula `sha256sum` dentro de `/backups`, de forma que o sidecar guarde
  somente o **basename**, e não um caminho absoluto do host/container;
- grava `<snapshot>.sha256`;
- remove snapshot + sidecar como um par quando a retenção elimina o antigo.

O restore PostgreSQL de manutenção agora:

- exige snapshot;
- exige o `.sha256` correspondente;
- valida que o sidecar contém **uma única linha**, hash hexadecimal de 64
  caracteres e referencia exatamente o snapshot selecionado;
- só então executa `sha256sum -c -- <sidecar>` antes de consultar/restaurar
  o alvo;
- recusa sidecar ausente, malformado, apontando outro snapshot ou hash
  divergente com exit 78;
- mantém as travas anteriores: confirmação literal, alvo diferente do
  operacional, banco alvo vazio e restore fail-closed.

No backend file:

- backups novos passam a usar o mesmo formato portátil do GNU `sha256sum`;
- `restoreBackup()` verifica o sidecar antes de validar/substituir dados;
- snapshots legados cujo sidecar contém somente 64 hex continuam aceitos,
  desde que o hash corresponda exatamente aos bytes do backup.
Foi criada também a CLI independente:

```
npm run verify:entregas:backup -- <snapshot>
```

Ela não conhece provedor. Lê o snapshot em stream, exige sidecar ao lado,
recusa sidecar malformado ou que referencia outro nome e devolve JSON
`deliveryos-backup-integrity@1`.

## Provas

- `test:entregas:backup-integrity`: **7/7 PASS**;
- `test:entregas:pilot-gate`: **10/10 PASS**;
- `test:entregas:deploy-audit`: **39/39 PASS**;
- `test:entregas:persistence-recreate`: **17/17 PASS** depois de alinhar a
  recuperação em diretório limpo ao novo contrato `snapshot + sidecar`;
- `test:entregas` completo: **PASS / exit 0** após essa correção;
- CLI real:
  - snapshot válido: exit **0**;
  - snapshot adulterado após gerar o sidecar: exit **1**, `sha256_mismatch`;
  - sem argumento: exit **2**;
- GNU `sha256sum` real no WSL:
  - snapshot intacto: `SHA256SUM_VALID_PASS`;
  - um byte acrescentado depois: `SHA256SUM_TAMPER_REJECTED`;
- controle adversarial do sidecar PostgreSQL no WSL:
  - sidecar do snapshot selecionado: `SIDECAR_SELECTED_PASS`;
  - sidecar válido, mas apontando outro snapshot:
    `SIDECAR_OTHER_NAME_REJECTED`;
  - sidecar do nome certo com bytes adulterados:
    `SIDECAR_BAD_HASH_REJECTED`;
- TypeScript compila no mesmo gate do deploy-audit.
## O que isto NÃO prova

- **não existe cópia off-host configurada**;
- nenhum provedor externo foi escolhido;
- nenhum segredo ou credencial externa foi criado;
- Docker/Compose real desta mudança não rodou no Foxxy;
- PostgreSQL real desta mudança não foi executado;
- SHA-256 prova **integridade acidental**, não autenticidade contra um atacante
  que consiga substituir snapshot e sidecar juntos. Assinatura/HMAC exigiria
  gestão de chave própria e não foi inventada por conveniência;
- nenhum backup operacional, restore operacional, deploy ou cutover ocorreu.

Portanto a lacuna off-host continua aberta. O ganho provado é menor e preciso:
qualquer cópia futura do par snapshot + sidecar pode ser verificada sem depender
do fornecedor escolhido.
