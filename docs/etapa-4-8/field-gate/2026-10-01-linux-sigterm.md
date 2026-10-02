---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-01-linux-sigterm.md
  status: ACTIVE
  authority_scope: linux_sigterm_runtime_evidence
  superseded_by: null
  atualizado_em: "2026-10-01"
  state_basis: ebb06f4
---

# SIGTERM real em Linux — camada Node do DeliveryOS

Data: 2026-10-01
Host: Foxxy / WSL2
Resultado: **Linux -> Node -> handler PROVEN; PID1 da imagem final NOT_RUN**

## Contexto

O estado canônico ainda marcava encerramento gracioso por SIGTERM como não
comprovado porque, no Windows, um sinal externo não exercitava o handler Node
da mesma forma que em Linux.

O Foxxy possui WSL2 com kernel Linux 6.18 e Node 22.22.1. Isso permitiu separar
a semântica Linux do empacotamento Docker, sem instalar Docker nem abrir banco.
## Gate reproduzível

Foi criado `run-linux-sigterm-tests.ts`.

No Windows:

- o gate declara `PULADO` em voz alta;
- não afirma que sinal externo foi provado.

No WSL Linux, o mesmo JavaScript compilado executa três casos:

1. SIGTERM real chega a um processo Node que usa o `shutdown()` canônico;
2. controle de timeout confirma que não há falso gracioso;
3. o binário real `entregas-source-ingest.js`, desligado por configuração,
   recebe SIGTERM sem abrir fonte ou banco.

Comando real usado para a prova Linux:

```bash
node dist/src/platform/run-linux-sigterm-tests.js
```
## Resultado

- SIG1: **PASS** — `SIGNAL:SIGTERM`, `DRAIN:START`, `DRAIN:END`,
  `CLOSE:START`, `CLOSE:END`, resultado `graceful=true`, exit 0;
- SIG2: **PASS** — timeout de 300 ms, `graceful=false`, exit 1 e nenhum
  `CLOSE:START`;
- SIG3: **PASS** — `source-ingest` real anunciou
  `DESLIGADO — nenhuma fonte ou banco foi aberto`, recebeu SIGTERM e saiu 0;
- total: **LINUX_SIGTERM 3/3 PASS**.

O primeiro ensaio manual, antes do gate permanente, mediu o caso gracioso em
aproximadamente 121 ms e o timeout em aproximadamente 301 ms.

## Fronteira

Isto prova a camada **kernel Linux -> processo Node -> handler/shutdown**.

Não prova:

- `dumb-init` como PID1 da imagem final;
- encaminhamento do sinal pelo container Docker;
- `USER node`, `npm prune --omit=dev` ou tamanho da imagem final;
- crítico/assíncrono completos contra banco real nesta sessão.

Esses itens continuam dentro do bloqueio de empacotamento Docker, não do
comportamento básico de SIGTERM do Node.
