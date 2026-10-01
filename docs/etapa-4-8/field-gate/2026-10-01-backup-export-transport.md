---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-01-backup-export-transport.md
  status: ACTIVE
  authority_scope: backup_export_transport_evidence
  superseded_by: null
  atualizado_em: "2026-10-01"
  state_basis: c31b852
---

# Transporte neutro do pacote de backup

Data: 2026-10-01
Host: Foxxy
Base Git: `c31b8524a06111df0f3b2f3cd476d44846cbed5c`
Resultado: **CODE_READY + TEST_PASS local; off-host real NOT_RUN**

## Objetivo

O destino externo ainda não foi escolhido e o runbook proíbe presumir Neon,
Google Drive, S3 ou qualquer outro provedor. Mesmo assim, o pacote
`snapshot + .sha256` precisava de um transporte reutilizável que não
dependesse do fornecedor.

Foi criado:

```
npm run export:entregas:backup -- <snapshot> --dest <diretorio-montado>
```

O destino precisa existir antes da chamada. A ferramenta não instala mount,
não cria conta, não recebe credencial de nuvem e não sabe se o diretório está
na mesma máquina, em NFS, FUSE, SMB, S3 montado, Drive montado ou outro meio.

## Regra de verdade

A ferramenta **nunca** retorna que o backup está off-host.

Mesmo quando a cópia termina e é relida com sucesso, a saída contém:

```json
{
  "source_verified": true,
  "destination_verified": true,
  "off_host_proven": false
}
```

Ela mede também `same_filesystem_device`. Isso pode detectar o caso óbvio de
origem e destino no mesmo filesystem, mas o inverso não prova separação física
de host.

## Fluxo

1. verifica o pacote de origem com o contrato de integridade atual;
2. recusa origem adulterada, sidecar ausente ou sidecar de outro nome;
3. exige que o diretório de destino já exista;
4. cria uma pasta de bundle única, sem sobrescrever bundle anterior;
5. copia snapshot e sidecar;
6. relê e verifica o pacote no destino;
7. grava `deliveryos-backup-export.json` com hash, bytes e as fronteiras de
   evidência;
8. não possui nenhuma rotina de exclusão no destino.

Uma falha depois da criação pode deixar um bundle parcial identificado. A
ferramenta não apaga esse material automaticamente porque o destino futuro pode
usar credencial sem permissão de delete.

## Provas

- `test:entregas:backup-export`: **7/7 PASS**;
- origem válida -> cópia + readback + manifesto: PASS;
- origem adulterada -> recusa antes de criar bundle: PASS;
- sidecar apontando outro snapshot -> recusa antes de escrever: PASS;
- destino inexistente -> recusa, não cria caminho silenciosamente: PASS;
- repetição do mesmo `transfer_id` -> não sobrescreve: PASS;
- destino no mesmo filesystem -> declarado como tal e
  `off_host_proven=false`: PASS;
- guarda estrutural: implementação sem `rm/unlink/rmdir`: PASS;
- CLI real em diretórios temporários do Foxxy:
  - export válido: exit **0**;
  - `same_filesystem_device=true`;
  - `off_host_proven=false`;
  - sem `--dest`: exit **2**.

## O que falta para fechar off-host

Ainda é obrigatório:

- César escolher/autorizar o destino externo;
- configurar a credencial com o mínimo de poder possível e sem delete quando
  o provedor suportar;
- executar a cópia para um destino comprovadamente fora do host;
- verificar o pacote recebido;
- restaurar essa cópia em banco separado/vazio;
- provar retenção mínima de 14 dias no destino escolhido.

Nenhum desses efeitos foi executado nesta frente. Portanto o item
“Cópia do backup fora do host produzida e restore off-host ensaiado” continua
em branco no checklist.
