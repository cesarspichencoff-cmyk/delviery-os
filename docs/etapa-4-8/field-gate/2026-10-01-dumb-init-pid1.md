---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-01-dumb-init-pid1.md
  status: ACTIVE
  authority_scope: dumb_init_pid1_signal_evidence
  superseded_by: null
  atualizado_em: "2026-10-01"
  state_basis: 51e2485
---

# dumb-init Bookworm como PID 1 — encaminhamento de SIGTERM

Data: 2026-10-01
Host: Foxxy / WSL2
Resultado: **comportamento PID1 PROVEN fora da imagem Docker**

## Artefato exercitado

Pacote: Debian Bookworm `dumb-init 1.2.5-2 amd64`.

O índice oficial `bookworm/main/binary-amd64/Packages.xz` informou:

- arquivo: `pool/main/d/dumb-init/dumb-init_1.2.5-2_amd64.deb`;
- SHA-256:
  `a8eae71eb01d0b1c378708a8dbef0247615e9f9d43dd7b37ca77958963360afd`.

O download foi conferido byte a byte pelo hash antes da extração.
## Execução

O pacote não foi instalado. Foi extraído em `mktemp`.

Com `unshare -Urpf --mount-proc`, o `dumb-init` foi executado como o
processo 1 de um PID namespace. A prova observou:

- `dumb-init v1.2.5`;
- `DUMB_INIT_NSpid: 1`;
- filho real:
  `dist/src/platform/bin/entregas-source-ingest.js`;
- `DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED=false`, portanto nenhuma fonte
  ou banco foi aberto;
- SIGTERM enviado ao PID externo do `dumb-init`;
- child e supervisor terminaram limpos;
- `LAUNCHER_EXIT=0`;
- marcador final: `DUMB_INIT_PID1_SIGTERM_PASS`.

A prova reproduzível vive em
`tools/provar_dumb_init_bookworm_pid1.sh`.
## Controle negativo

Uma cópia temporária do roteiro recebeu um SHA-256 esperado deliberadamente
incorreto. O download legítimo foi recusado antes da extração:

- marcador: `DUMB_INIT_BOOKWORM_SHA256_MISMATCH`;
- exit: **4**;
- o probe temporário foi removido.

## Fronteira

Esta prova fecha a semântica:

`Linux -> dumb-init como PID1 -> SIGTERM -> processo Node real`.

Ela **não** prova que `deploy/Dockerfile.platform` já constrói a imagem final
neste Foxxy. Continuam NOT_RUN até um build de imagem real:

- presença desse mesmo pacote dentro da imagem construída;
- `USER node`;
- `npm prune --omit=dev`;
- tamanho final da imagem;
- composição Docker completa.

Nenhum pacote foi instalado no WSL e nenhum banco/deploy operacional foi
tocado.
