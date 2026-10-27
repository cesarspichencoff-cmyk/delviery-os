# Cadastro de acesso e procedência atual da fonte

## Correção da revisão anterior

O CI produto 40504374924, commit bb1f4da, concluiu com falha somente na guarda C6: o adaptador HTTP novo estava sob `src/platform/copiloto/`, namespace protegido do núcleo. Os testes HTTPS e Chromium 390/1440 passaram (oito famílias), assim como a regressão Android 40504374926. Portanto a revisão anterior não é declarada verde.

O adaptador foi movido para `src/platform/auth/operator-http.ts`, ao lado da sessão e da autorização que compõe. É transporte/autenticação, não mecanismo de decisão do copiloto: não importa nem modifica shadow, atenção, despacho ou cálculo de sinais. Teste HTTP e imports acompanham a mudança. Nenhuma guarda, lista de exceções, baseline ou envelope foi relaxado. Os 40 controles M1 passaram localmente após a correção, além dos 14 de governança.

## Cadastro implementado

`operator-file-roster.ts` fornece `approvedSubject` e `lookupGrant` para a composição já existente. Lê um arquivo absoluto explicitamente configurado pelo servidor, a cada consulta, sem usuários padrão ou cadastro automático. O exemplo versionado contém lista vazia.

Cada entrada exige email normalizado, subject do provedor existente, unitId ITAIM, role gerente/lider, active booleano, approvalRef e expiresAt UTC canônico. E-mail ou subject duplicado, campo inválido, unidade diferente, arquivo ausente/corrompido ou leitura alterada bloqueiam o acesso. Limites: 100 entradas/64 KiB. Arquivo/link simbólico divergente recusado; comparação de metadados não é snapshot transacional nem proteção contra administrador malicioso.

Remoção, inativação e vencimento são percebidos na consulta seguinte, sem reinício. O registro deve ficar fora da pasta pública, com ACL de operador/administrador verificada na instalação. O módulo não cria ACL nem configura pessoas por conta própria. Não substitui comprovação humana de aprovação nem a autenticação Neon.

Composição prevista, com valores reais ainda pendentes:

```ts
const roster = createOperatorFileRoster({file: protectedAbsolutePath, issuer: authBase, now});
const sessions = createNeonOperatorSessions({authBase, appOrigin, now,
  approvedSubject: roster.approvedSubject});
const handler = createOperatorHttp({sessions, now, assets,
  lookupGrant: roster.lookupGrant, readFeed});
```

Prova local: oito famílias do cadastro passaram, incluindo revogação antes de leitura, arquivo inválido e duplicidades. As seis famílias HTTPS passaram usando o cadastro em arquivo na jornada. TypeScript compilou. A nova execução CI ainda precisa ser consultada; não confundir com a prova anterior.

## Provedor existente — consulta sem alteração

Em 27/10, o conector confirmou Managed Better Auth no projeto/branch já existentes do TATÁ OS, com URL de São Paulo preservada. O domínio `https://deliveryos-piloto.eu1.netbird.services` não está em trusted_origins; localhost está desabilitado. Nada foi adicionado e nenhuma configuração existente foi substituída.

Às 11h48 de São Paulo, GET do contrato OpenAPI do provedor retornou 200, OpenAPI 3.1.1. Confirmados POST `/email-otp/send-verification-otp` (email,type), POST `/sign-in/email-otp` (email,otp), GET/POST `/get-session`. O contrato consultado não listou parâmetros de query de get-session: o comportamento de disableCookieCache, cookies e sessão autenticada continua pendente de prova real. Nenhum OTP, token ou credencial foi enviado/recebido nessa consulta.

## Fonte após a abertura

Conferência somente de metadados no Caixa Mooca às 11h48min41s de 27/10: três eventos recentes, último observado 11h48min37s, ready=true, zero bloqueios, serviço LUNCH, evidência HUMAN_CONFIRMED_RULE. É a primeira prova aqui registrada de eventos posteriores à instalação da regra semanal. Não exportados identificadores, clientes ou itens; nenhum reset/replay/write.

Isso confirma emissão recente pelo leitor e resolução do serviço. Não comprova inventário completo, publicação no copiloto, modo real/control autorizado nem conversão do horário nativo: DTHRABERMESA continua sem offset. O modo da fonte não foi inferido nem alterado.

## Próximo passo concreto

Identificar o primeiro e-mail de operador no provedor existente e obter o vínculo aprovado de subject/ITAIM/papel. Preparar a adição exata da origem Delivery OS e teste humano de OTP, preservando TATÁ OS. Só depois integrar o leitor com procedência e política temporal explícitas e preparar instalação reversível. Não enviar código sem a instrução correspondente nem publicar usuários de produção no repositório público.
