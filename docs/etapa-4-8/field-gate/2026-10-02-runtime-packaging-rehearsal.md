---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-02-runtime-packaging-rehearsal.md
  status: ACTIVE
  authority_scope: runtime_packaging_rehearsal_evidence
  superseded_by: null
  atualizado_em: "2026-10-02"
  state_basis: 813bc44
---

# Runtime packaging rehearsal — prune + non-root

Data: 2026-10-02
Host: Foxxy / WSL2
Base Git: `813bc44a17c7f66379219dd7809c952852b6465e`
Resultado original: **REHEARSAL PASS**.

**Sucessão no mesmo dia:** a imagem Docker final foi depois construída e provada em GitHub Actions run `36968177991`. Ver `2026-10-02-runtime-image-final-ci.md`. Este documento permanece como evidência do ensaio anterior, não como estado atual da imagem.

## Objetivo

Docker/Podman/Buildah/Nerdctl/Runc não existem no Foxxy/WSL. Portanto esta
prova não tenta chamar um diretório temporário de "imagem Docker".

Ela mede separadamente duas invariantes do estágio final de
`deploy/Dockerfile.platform` que ainda podiam ser exercitadas sem engine OCI:

1. `npm prune --omit=dev` preserva as dependências de runtime;
2. o runtime real consegue executar como usuário Linux não-root.

## Prova de prune

Foi copiado o `node_modules` atual para `/tmp`; o worktree não foi alterado.
Dentro da cópia foi executado:

```
npm prune --omit=dev --offline --no-audit --no-fund
```

Medição:

- `node_modules` antes: **56.193.119 bytes**;
- depois: **436.961 bytes**;
- `pg@8.13.1`: presente e `require("pg")` PASS;
- `typescript`: ausente depois do prune;
- `playwright`: ausente depois do prune.

O `--dry-run` anterior identificou 23 pacotes removíveis de desenvolvimento e
manteve `pg@8.13.1` como dependência direta de produção.

## Prova não-root

O `dist/` produzido por `npm run build:platform` no HEAD foi copiado para o
mesmo diretório temporário com o `node_modules` podado.

O binário real:

```
dist/src/platform/bin/entregas-source-ingest.js
```

foi executado por `runuser -u nobody`:

- UID observado do processo Node: **65534**;
- `NODE_ENV=production`;
- source-ingest explicitamente desligado, portanto nenhum banco/fonte aberto;
- SIGTERM externo: **exit 0**;
- log: `[source-ingest] DESLIGADO — nenhuma fonte ou banco foi aberto`.

Tamanho medido da cópia de runtime:

- `dist/`: **3.503.453 bytes**;
- app (`dist + package.json + node_modules`): **3.971.689 bytes**.

## Controle contra falso positivo

Uma tentativa anterior de `npm ci --offline` em diretório totalmente vazio
falhou porque o cache não continha `xtend@4.0.2`. Essa falha foi preservada
como limite: esta prova usa uma **cópia do node_modules já instalado** e mede o
prune real; não prova que um build limpo sem rede consegue instalar tudo.

## Fronteira

Isto NÃO prova:

- `docker build`;
- a base exata `node:22-bookworm-slim`;
- `USER node` dentro de uma imagem;
- ownership gerado por `COPY --chown=node:node`;
- presença do dumb-init dentro da imagem final;
- tamanho final das camadas OCI;
- `docker compose up`.

Naquele ponto, esses itens ainda eram NOT_RUN. A sucessão
`2026-10-02-runtime-image-final-ci.md` fechou posteriormente `docker build`,
`USER node`, ownership, dumb-init na imagem final, tamanho e PID1/SIGTERM.
Permanece fora desta prova apenas o que depende da composição completa e de
efeitos externos, como `docker compose up` da plataforma e deploy.
