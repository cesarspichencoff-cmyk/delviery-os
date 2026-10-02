---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-02-runtime-image-final-ci.md
  status: ACTIVE
  authority_scope: runtime_final_image_ci_evidence
  superseded_by: null
  atualizado_em: "2026-10-02"
  state_basis: 9a2b99c
---

# Imagem runtime final — Docker real em GitHub Actions

Data: 2026-10-02
Produto provado: `9a2b99c8bdaa9150c306003720a079050e6b49fe`
Branch temporária da prova: `tmp/runtime-image-final-proof-20261002`
Commit do gate: `371e07a8eea6c803ced63d97c8f13c39b20c0fda`
GitHub Actions run: **36968177991**
Job: **110716363420**
Resultado: **SUCCESS**

A branch temporária diferia de `9a2b99c` somente por
`.github/workflows/runtime-image-final-proof.yml`. Nenhum arquivo de produto,
Dockerfile ou Compose foi alterado para fazer a prova passar.

## O que foi executado

O runner padrão `ubuntu-latest` executou:

```
docker build --progress=plain \
  -f deploy/Dockerfile.platform \
  --build-arg DELIVERYOS_COMMIT="$GITHUB_SHA" \
  -t deliveryos-platform:proof .
```

O build final passou usando a base declarada `node:22-bookworm-slim`.
Durante a camada runtime, o apt instalou o pacote Debian
`dumb-init 1.2.5-2`.

## Invariantes da imagem final

A inspeção da imagem e um container `--read-only` com `tmpfs /tmp`
comprovaram:

- `Config.User = node`;
- `Entrypoint = ["dumb-init", "--"]`;
- nenhum `CMD` padrão;
- `dist/` e `node_modules/` pertencem a `node:node`;
- processo dentro da imagem roda sem root;
- `dumb-init v1.2.5` está presente;
- `pg@8.13.1` está presente e carregável por Node;
- `typescript` e `playwright` não estão na imagem runtime;
- `npm ls --omit=dev --depth=0` mostrou somente `pg@8.13.1`;
- `dist/build-stamp.json` carregou o commit exato do gate;
- imagem Docker: **231.158.743 bytes**;
- filesystem `/app`: **4.294.489 bytes**.

## Binário real + PID1 + SIGTERM

Foi executado dentro da imagem final o binário real:

```
node dist/src/platform/bin/entregas-source-ingest.js
```

com `DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED=false`.

A prova observou:

- log `DESLIGADO — nenhuma fonte ou banco foi aberto`;
- `/proc/1/cmdline` = `dumb-init -- node dist/src/platform/bin/entregas-source-ingest.js`;
- `docker top` mostrou `dumb-init` supervisionando o processo Node;
- `docker stop -t 5` levou o container a exit code **0**.

Resultado explícito do gate:

```
FINAL_IMAGE_CONFIG_GREEN
FINAL_IMAGE_FILESYSTEM_GREEN
FINAL_IMAGE_REAL_BINARY_PID1_SIGTERM_GREEN
FINAL_IMAGE_MEASURED
```

## Controle contra falso positivo

A execução anterior `36967981792` NÃO é evidência: o primeiro gate chamava o
source-ingest desligado em foreground e esperava que ele terminasse sozinho.
O serviço é deliberadamente persistente e só encerra com sinal. O gate foi
corrigido para testar o comportamento real, não para mudar o produto.

Depois da execução verde, o workflow temporário foi removido da branch no
commit `034a1d7`. Nenhuma imagem foi enviada a registry, nenhum artefato foi
publicado e nenhum deploy ocorreu.

## Fronteira

**Fechado / PROVEN:**

- `docker build` da imagem runtime final;
- base final e instalação de `dumb-init`;
- `USER node` efetivo;
- `COPY --chown` efetivo para os assets de runtime;
- prune de dependências de desenvolvimento;
- presença do driver PostgreSQL;
- tamanho final da imagem;
- PID1 e encaminhamento de SIGTERM para binário real.

**Ainda não provado por esta execução:**

- `docker compose up` da composição completa `deploy/compose.platform.yaml`;
- deploy em ambiente operacional;
- segredo/credencial operacional;
- aparelho físico;
- backup off-host.

Nenhum efeito de produção foi executado.
