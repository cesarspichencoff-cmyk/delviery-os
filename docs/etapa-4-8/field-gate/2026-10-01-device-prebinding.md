---
lifecycle:
  artefato: docs/etapa-4-8/field-gate/2026-10-01-device-prebinding.md
  status: ACTIVE
  authority_scope: field_gate_device_prebinding_evidence
  superseded_by: null
  atualizado_em: "2026-10-01"
  state_basis: 378d634
  question_refs: ["Q-018"]
---

# Pré-vínculo do aparelho antes do bootstrap

Data: 2026-10-01
Host: Foxxy
Base Git: `7d950d02be68c8ce9e9d2835aa8fc926c56d64f8`
Resultado: **CODE_READY + TEST_PASS no AVD; PostgreSQL real e aparelho físico NOT_RUN**

## Falha que foi eliminada

O desenho anterior cadastrava `device_id + unidade + motoboy` e deixava
`secret_hash` vazio. O primeiro bootstrap que chegasse à plataforma gravava
o hash do segredo. Isso deixava uma janela entre a autorização humana e o
primeiro contato: conhecer o `device_id` e chegar antes podia capturar o
vínculo.

A mitigação de "revogar e reautorizar" não era suficiente para tratar a classe
de falha. O runtime precisava deixar de ter autoridade para criar o vínculo.

## Novo fluxo

O Android mantém um segredo aleatório de 128 bits cifrado pelo Android
Keystore. A rider-mobile recebe da ponte nativa somente:

- `device_id`;
- `device_proof_sha256`: SHA-256 hexadecimal do segredo local.

O segredo bruto não entra na WebView. A API de sessão também não aceita o hash
como credencial: o aparelho continua apresentando o segredo bruto pelo canal
HTTPS, e a plataforma calcula o SHA-256 para comparar com o valor pré-vinculado.

A autorização humana agora exige:

```text
device_id + unit_id + actor_id + label + device_proof_sha256
```

A CLI exige `--proof <codigo-sha256>`, inclui o valor no fingerprint do plano
e grava `secret_hash + secret_bound_at` no ato administrativo.

## Fail-closed

- prova ausente ou fora de 64 hex: autorização recusada;
- aparelho revogado: não é reativado;
- aparelho já ligado: no-op, sem rotação de segredo;
- registro legado sem hash e mesma identidade: pode ser pré-vinculado pelo
  ato humano;
- registro sem hash no bootstrap: 401 `segredo_nao_vinculado`,
  `aguardar_humano`;
- hash diferente: 403 `segredo_divergente`;
- o runtime crítico não vincula segredo no bootstrap;
- `deliveryos_critical` perdeu privilégio UPDATE sobre
  `secret_hash` e `secret_bound_at`; `papeis_minimos.sql` executa `REVOKE`
  explícito antes do novo GRANT mínimo, porque privilégios antigos são cumulativos.

O 401 para vínculo ausente é deliberado: o Android trata 403 como condição
terminal/revogação local. Um cadastro incompleto precisa continuar recuperável
por intervenção humana sem apagar filas.

## Provas executadas

- TypeScript `--noEmit`: PASS;
- `test:platform:device-admin`: **19/19 PASS**;
- `test:platform:cadeia`: **9/9 lógica PASS**;
- `test:entregas:rider-bridge`: **30/30 PASS**;
- `test:entregas:android`: **43/43 PASS**;
- `test:platform:auth`: **26/26 PASS**;
- governança: **14/14 / GOVERNANCE_GATE_GREEN**;
- Android AVD 14:
  `:app:testDebugUnitTest :app:connectedDebugAndroidTest` =
  **19/19 instrumentados, BUILD SUCCESSFUL**;
- gate JVM independente:
  `gradlew -p gate-verification test` = **BUILD SUCCESSFUL**;
- sintaxe das bancadas `bancada_q018_cadeia.sh`, `bancada_tls_real.sh` e
  `papeis_compose_real.sh`: **PASS** via `bash -n` no WSL após normalização
  apenas em memória dos CRLF do checkout Windows;
- `bancada_tls_cliente.java`: **compilação PASS** em cópia temporária com o
  nome de classe correto;
- `test:platform:papeis:compose`: **PULADO**, pois `docker compose` não está
  disponível nesta superfície (`spawnSync docker ENOENT`). Portanto a nova
  revogação de privilégio ainda não tem prova Compose/PostgreSQL real nesta sucessão.

Controle Android adicional: o código de vínculo é exatamente o SHA-256 do
segredo lógico, continua idêntico depois de reabrir o Room e o segredo
permanece cifrado como `enc:v1:...`. Para quebrar a circularidade do teste,
`EnrollmentProofTest` usa o vetor independente `"a".repeat(32)` e exige
`3ba3f5f43b92602683c19aee62a20342b084dd5971ddd33808d81a328879a547`;
`:app:testDebugUnitTest` fechou **BUILD SUCCESSFUL** depois dessa prova.

Controles negativos da CLI:

- `authorize` sem `--proof`: **exit 2/usage**, antes de qualquer conexão;
- `--apply=YES` com proof mas sem `--expect`: exit 1,
  `apply recusado: informe --expect <fingerprint-do-plan>`.

## Fronteira de prova

`DELIVERYOS_PG_URL` não está disponível nesta sessão; portanto a subseção
PostgreSQL da cadeia foi **PULADA** e não conta como prova de banco real.
Também não houve autorização no banco operacional, deploy, geração de segredo
operacional, nem aparelho físico.

A janela está fechada **no código e no AVD**. A prova WORLD/field continua no
roteiro físico, que agora exige ID + Código de vínculo antes do bootstrap.
