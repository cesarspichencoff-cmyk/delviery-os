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

## Sucessão — pré-vínculo antes do bootstrap

Em 2026-10-01 a ferramenta foi endurecida para eliminar a janela de primeiro
contato. O Android exibe um `device_proof_sha256` (SHA-256 do segredo local
cifrado; nunca o segredo). `authorize` agora exige `--proof <sha256>` e grava
esse hash no mesmo ato humano que cria/autoriza o aparelho.

Consequências:

- o fingerprint do plano inclui a prova revisada;
- registro legado sem `secret_hash` pode ser pré-vinculado apenas se continuar
  na mesma unidade/ator e não estiver revogado;
- aparelho já ligado é no-op: a ferramenta não rotaciona segredo;
- o runtime de sessão recusa cadastro sem hash com 401
  `segredo_nao_vinculado`; não existe mais vínculo por “quem chega primeiro”;
- o papel `deliveryos_critical` perdeu UPDATE sobre
  `secret_hash/secret_bound_at`; o SQL aplica `REVOKE` explícito para remover
  também grants herdados de versões anteriores. Só o lado humano/administrativo
  pode criar o vínculo.

## Provas locais

Prova original da ferramenta:

- `npm run test:platform:device-admin`: **15/15 PASS**;
- `npm run build`: **PASS**;
- artefato `dist/tools/entregas_device_admin.js`: **presente**;
- `npm run test:platform:auth`: **24/24 PASS**.

Sucessão do pré-vínculo em 2026-10-01:

- `test:platform:device-admin`: **19/19 PASS**;
- `test:platform:auth`: **26/26 PASS**;
- `test:platform:cadeia`: **9/9 lógica PASS**; a subseção PostgreSQL real foi
  **PULADA** porque `DELIVERYOS_PG_URL` não está definida;
- rider bridge: **30/30 PASS**;
- Android estrutural: **43/43 PASS**;
- Android instrumentado no AVD 14: **19/19 PASS / BUILD SUCCESSFUL**;
- controle negativo: `authorize` sem `--proof` saiu com **exit 2/usage**, antes de qualquer conexão;
- controle negativo: `authorize --apply=YES --proof <válido>` sem `--expect`
  saiu com **exit 1** e
  `apply recusado: informe --expect <fingerprint-do-plan>`.

Ver `2026-10-01-device-prebinding.md` para a prova consolidada.

## Fronteira da prova

**CODE_READY + TEST_PASS local.**

Ainda não houve execução desta CLI contra o banco operacional nem autorização
de um aparelho físico real. Isso continua dentro do field gate e permanece
`NOT_RUN` até existir o telefone e o efeito ser executado conscientemente.
