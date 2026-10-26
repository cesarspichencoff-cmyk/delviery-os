# TATÁ Comandas — coletor de fonte V8.83

**Estado: DRAFT / HOLD / preview-only / runner Windows descartável.**

## Decisão de segurança

A V8.82 definiu o contrato de uma observação assinada e source-separated, mas
um coletor que consultasse o spooler real antes de identidade, permissões e
autorização próprias criaria capacidade operacional prematura.

A V8.83 implementa apenas o **normalizador do contrato**, executável somente
em fixture sintética no `RUNNER_TEMP` de GitHub Actions Windows. O script não
contém chamadas para spooler, impressora, serviço, event log, CIM, SQL, rede ou
assinatura. Ele não possui modo live.

Implementação:
`tools/comandas_print_attempt_source_collector_v883_review_only.ps1`.

Verificadores:

- `tools/verificar_print_attempt_source_collector_v883_static.js`;
- `tools/verificar_print_attempt_source_collector_v883_windows.cjs`.

## O que o preview demonstra

Sobre uma fixture limitada a 64 KiB e contida no diretório temporário do
runner, o normalizador:

1. valida envelope, contexto, hashes, identidades, tentativa, revisão, nonce e
   timestamps canônicos;
2. limita o snapshot a 256 jobs sintéticos;
3. seleciona um único job numérico esperado e recusa duplicidade;
4. traduz o `StatusMask` do Windows para o vocabulário conservador V8.80;
5. traduz somente estados codificados da impressora, sem nomes, documento,
   conta ou caminho;
6. recusa coerção de strings em booleanos ou números inteiros;
7. marca bits e códigos desconhecidos como estado não reconhecido, fazendo a
   composição V8.82 falhar fechada;
8. calcula SHA-256 determinístico do snapshot sanitizado em memória;
9. produz um candidato V8.82 **não assinado**;
10. declara todos os efeitos e todas as autoridades como falsos, inclusive a
    identidade do runner, que não é provada apenas por variáveis de ambiente.

O teste Windows cria a fixture somente dentro do `RUNNER_TEMP`, executa o
PowerShell, acrescenta uma chave Ed25519 efêmera em memória no processo de
teste e passa o candidato pelo verificador V8.82. Isso prova compatibilidade
do contrato; não prova custódia independente.

## Cenários adversariais

- `PRINTED` resulta apenas em reconciliação V8.82;
- job ausente nunca vira prova de ausência de efeito;
- `ERROR + PRINTED` permanece ambíguo;
- impressora offline bloqueia `PRINTED`;
- bit de status ou código da impressora desconhecido falha fechado;
- falha de leitura assinada resulta em `WITNESS_SOURCE_UNAVAILABLE`;
- permutação de jobs não altera o hash sanitizado;
- alteração material muda o hash;
- qualquer job duplicado, campo inesperado, coerção de tipo, identidade inválida e
  timestamp não canônico são recusados;
- fixture fora de `RUNNER_TEMP` é recusada antes da leitura;
- mutações que adicionem APIs live, escrita, rede, assinatura ou autoridade
  positiva falham no verificador estático.

## O que ainda não existe

- adaptador live para `Win32_PrintJob`, `Get-PrintJob` ou Event 307;
- serviço coletor instalado;
- usuário/token Windows separado;
- ACL efetiva e identidade de processo verificadas;
- assinatura sob chave custodiada externamente;
- relógio/revogação externos;
- execução no caixa;
- vínculo a papel físico.

Uma futura adaptação live exige autorização própria e deve provar primeiro a
identidade do coletor, leitura mínima, ausência de documento/usuário na saída,
separação do emissor e comportamento fail-closed quando a fonte desaparece.

A V8.84 fecha o próximo recorte de arquitetura: acesso direto à fila Windows
não é aceito como estritamente read-only porque os direitos de leitura da
impressora incluem capacidade básica de impressão. A única rota ainda elegível
para revisão é um canal PrintService/Operational já habilitado, sem acesso live
ou autoridade nesta PR. Ver `PRINT_SOURCE_ACCESS_V884_REVIEW_ONLY.md`.

O mapa pinado nesta PR continua sendo `0001 - TATA ITAIM`. Nada nesta versão
prova a topologia da `CAIXA_MOOCA`.

## Limite de efeito

**NO LIVE SPOOLER / NO MERGE / NO DEPLOY / NO INSTALL / NO PRINT / NO
SPOOLER WRITE / NO SERVICE CHANGE / NO GP OR TEKNISA CHANGE / NO FISCAL OR
SEFAZ CHANGE / NO CASH REGISTER ACCESS.**

