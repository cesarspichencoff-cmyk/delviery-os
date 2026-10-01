# JTI único por emissão de sessão

Data: 2026-10-01
Host: Foxxy
Base Git: `7553af8b0cdd0caa945d984c12a3f66e67b8683e`
Resultado: **CODE_READY + TEST_PASS local**

## Gap

O `jti` padrão do token de aparelho era derivado apenas de `device_id + iat`.
Como `iat` tem resolução de segundos, duas emissões para o mesmo aparelho no
mesmo segundo recebiam o mesmo identificador de auditoria.

## Correção

`emitirToken` agora gera `jti` com 96 bits de `randomBytes` por emissão.
O campo continua injetável explicitamente para fixtures determinísticas.
A assinatura e a verificação do token não mudaram.

## Provas

- `test:platform:auth`: **26/26 PASS**;
- duas emissões no mesmo segundo: `jti` e token distintos;
- formato padrão continua base64url com 16 caracteres;
- `jti` injetado em fixture continua preservado;
- `test:platform:cadeia`: **9/9 lógica PASS**;
- TypeScript `--noEmit`: PASS.

A subprova PostgreSQL real de `test:platform:cadeia` ficou **PULADA** porque
`DELIVERYOS_PG_URL` está ausente nesta sessão. Nenhum deploy ocorreu.
