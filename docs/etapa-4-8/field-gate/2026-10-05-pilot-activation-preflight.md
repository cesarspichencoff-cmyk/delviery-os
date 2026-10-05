# Pilot Activation Preflight — zero efeito

Data: 2026-10-05  
Branch: `tmp/pilot-activation-preflight-20261005`  
Base: `20b4782fed90374eef0bbae00468275fa641ce07`

## Objetivo

Transformar os blockers externos do piloto em uma leitura executável do ambiente sem tocar o
mundo operacional.

## Comandos

- `npm run test:platform:pilot-activation-preflight`
- `npm run preflight:pilot:activation`

## Prova

- typecheck: PASS;
- testes adversariais: **9/9 PASS**;
- `adb`: disponível;
- aparelhos físicos: **0**;
- emuladores conectados: **0**;
- Docker Compose no Foxxy: indisponível;
- URL operacional: ausente;
- credencial do Product Reader: ausente;
- source-ingest solicitado neste shell: não;
- `consumer_live`: `OFF / NOT_AUTHORIZED` pelo STATE;
- `EFFECT_ATTEMPTED=false`;
- Figma Full: node `28:2`, screenshot renderizado.

## Regra anti-falso-GO

`NOT_DEPLOYED` não pode casar com `DEPLOYED`. Esse defeito foi encontrado pelo teste PAP4 no
primeiro passe e corrigido antes do checkpoint. Presença de URL/toggle/credencial não promove efeito:
vira `PRESENT_UNVERIFIED` até existir evidência no STATE.

## Fronteira

Este preflight não abre conexão PostgreSQL, não cria credencial, não conecta aparelho, não executa
migration, não faz deploy/cutover e não liga source-ingest/consumer.
