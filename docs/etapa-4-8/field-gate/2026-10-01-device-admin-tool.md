# Field gate Android — ferramenta administrativa de aparelho

Data: 2026-10-01
Host: Foxxy
Base antes da mudança: `9c1aef334c64f6fa4e365db7c0c571420b2b4631`

## Gap

O roteiro físico autorizava e revogava aparelhos por SQL manual direto em
`identity.device`. Isso preservava a autoridade humana, mas deixava o gate
sujeito a erro de digitação, vínculo com ator errado, unidade errada ou
reativação acidental de aparelho revogado.

## Implementação

Foi criada `tools/entregas_device_admin.ts`, apoiada em
`src/platform/admin/device-admin.ts`.

Modos:

- `status`: somente leitura;
- `authorize`: plano read-only e, separadamente, aplicação;
- `revoke`: plano read-only e, separadamente, aplicação.

Toda escrita exige simultaneamente:

- `--apply=YES`;
- `--expect <fingerprint>` produzido pelo plano;
- o estado atual do banco ainda gerar exatamente o mesmo fingerprint.

A autorização recusa:

- unidade inexistente ou inativa;
- ator inexistente ou inativo;
- ator de outra unidade;
- ator que não seja `motoboy_interno`;
- aparelho já autorizado para outra identidade;
- aparelho revogado, que exige fluxo explícito de recuperação e nunca volta
  silenciosamente.

A revogação preserva a linha e o histórico: grava somente `revoked_at` e
`revoked_by`.

A saída de status não expõe `secret_hash`; mostra apenas `linked: true|false`.

## Provas locais

- `npm run test:platform:device-admin`: **15/15 PASS**;
- `npm run build`: **PASS**;
- artefato `dist/tools/entregas_device_admin.js`: **presente**;
- `npm run test:platform:auth`: **24/24 PASS**;
- `npm run test:platform:cadeia`: **9/9 lógica PASS**; a subseção que exige
  PostgreSQL real foi **PULADA** porque `DELIVERYOS_PG_URL` não estava
  definida e não é contada como prova de banco real;
- controle negativo do binário compilado: `authorize --apply=YES` sem
  `--expect` saiu com **exit 1** e
  `apply recusado: informe --expect <fingerprint-do-plan>`.

## Fronteira da prova

**CODE_READY + TEST_PASS local.**

Ainda não houve execução desta CLI contra o banco operacional nem autorização
de um aparelho físico real. Isso continua dentro do field gate e permanece
`NOT_RUN` até existir o telefone e o efeito ser executado conscientemente.
