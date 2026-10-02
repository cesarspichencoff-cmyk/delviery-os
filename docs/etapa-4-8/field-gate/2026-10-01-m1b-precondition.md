---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-01-m1b-precondition.md
  status: ACTIVE
  authority_scope: m1b_perceptual_precondition_evidence
  superseded_by: null
  atualizado_em: "2026-10-01"
  state_basis: a4ff604
---

# M1B perceptual — precondição legível e execução real

Data: 2026-10-01
Host: Foxxy
Resultado: **precondição fechada + gate perceptual real 5/5 PASS**

## Reproduzido antes

Sem listener em `localhost:5292`, `test:platform:m1b-perceptual` terminava
com `TypeError: fetch failed` + `ECONNREFUSED` e stack trace, exit 1. Isso
era ausência de precondição externa, não regressão perceptiva da superfície.

## Correção

A sonda de `/surfaces/home.css` agora ocorre antes de abrir Chromium:

- conexão recusada, timeout, DNS/rede indisponível => `PULADO` explícito;
- HTTP presente mas não-2xx => erro real, nunca skip;
- HTTP 2xx => o CSS segue para a prova de procedência byte/hash.
O helper isolado é `src/platform/m1b-precondition.ts`; o gate
`test:platform:m1b-precondition` cobre as três classes acima.

## Prova sem servidor

Com a porta 5292 realmente sem listener:

- precondition gate: **3/3 PASS**;
- saída: `PULADO: servidor M1 indisponivel...`;
- marcador: `M1B_PERCEPTUAL_GATE_SKIPPED`;
- exit: **0**;
- nenhum stack trace de `ECONNREFUSED`.

Isso é NOT_RUN explícito, não PASS perceptual.

## Prova com servidor real

O Product System foi iniciado com:

```powershell
$env:PRODUCT_UI_PORT="5292"; npm run ui:product
```

A suíte confirmou `home.css servido == disco` e executou as cinco mutações
em Chromium real.
Resultados observados:

- MP1 território do Foco: **62% -> 30%**;
- MP2 breakpoint mobile: **100% -> 0%**;
- MP3 microtipografia: **11px -> 10px**;
- MP4 baseline da causadora: **46px -> 52px**;
- MP5 variedade de corpos: **3 -> 1**;
- total: **5 passaram / 0 falharam**;
- marcador: `M1B_PERCEPTUAL_GATE_GREEN`;
- exit: **0**.

Cada mutação restaurou o arquivo ao hash de origem. `git status` depois da
execução mostrou apenas os arquivos desta correção, sem diff em
`home.css` ou `shell.css`.

## Fronteira

Esta prova fecha somente o bloqueio de precondição/legibilidade do M1B e
executa sua instrumentação perceptiva local. Ela não muda autoridade visual,
não altera Figma e não resolve PB11/PB13.
