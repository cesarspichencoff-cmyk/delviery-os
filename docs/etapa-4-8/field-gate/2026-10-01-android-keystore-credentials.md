# Credenciais Android em repouso — Android Keystore

Data: 2026-10-01
Host: Foxxy
Base Git: `11d242591b549ae71feaf901098e5b2e10248626`
Resultado: **CODE_READY + TEST_PASS no AVD; aparelho físico NOT_RUN**

## Problema

O `device_secret` e o `session_token` eram persistidos em `device_state`
no Room em texto puro. O diretório privado e `allowBackup=false` reduziam a
superfície, mas uma extração do SQLite ainda revelaria as credenciais.

## Correção

Foi criado `LocalSecretCipher` com:

- chave AES não exportável no `AndroidKeyStore`;
- `AES/GCM/NoPadding`;
- IV aleatório obrigatório;
- AAD distinto para `device_secret` e `session_token`;
- envelope versionado `enc:v1:<iv>:<ciphertext>`;
- criação da chave sincronizada para evitar rotação acidental no primeiro uso concorrente.
`DeviceSession` agora:

- cifra segredo novo antes de gravar;
- cifra token novo antes de gravar;
- migra segredo legado em claro no primeiro uso preservando exatamente a identidade;
- migra token legado em claro no primeiro uso;
- abre credencial cifrada apenas para uso em memória;
- se o token ficar indecifrável, remove somente token/validade e força novo bootstrap;
- se o segredo do aparelho ficar indecifrável, falha fechado e **não gera outro** silenciosamente;
- nunca toca filas GPS/outbox/aceites ao lidar com perda da chave.

Não foi adicionada dependência externa: a implementação usa APIs nativas do Android.

## Provas no AVD Android 14

`test:entregas:android`:

- **43/43 PASS**;
- verifica Keystore, AES-GCM, AAD, ausência de escrita direta do token e sincronização da criação da chave.

`:app:testDebugUnitTest :app:connectedDebugAndroidTest`:

- **18/18 instrumentados PASS**;
- `BUILD SUCCESSFUL`.
Os testes instrumentados exercitaram SQLite e Android Keystore reais:

1. segredo novo fica cifrado no banco e continua abrível após reabrir o Room;
2. segredo legado em claro migra sem mudar o valor lógico;
3. token novo fica cifrado e continua utilizável após reabrir o Room;
4. token legado migra no primeiro acesso;
5. exclusão da chave do Keystore faz o token falhar fechando, mantém a fila GPS e impede regeneração silenciosa do segredo.

Gate JVM independente:

- fontes verificadas: 3 principais + 1 teste;
- `BUILD SUCCESSFUL`;
- a cifra Android não contaminou o gate Kotlin puro.

Governança foi validada antes da documentação desta prova e será repetida após o commit.

## Fronteira

Isto prova **proteção em repouso** no AVD. Não prova resistência de um aparelho
comprometido enquanto o processo está executando, porque o app precisa abrir a
credencial para usá-la.

Aparelho físico, deploy e operação real continuam `NOT_RUN`.
