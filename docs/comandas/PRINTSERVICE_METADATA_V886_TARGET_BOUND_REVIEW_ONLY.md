# TATÁ Comandas — metadados PrintService V8.86

**Estado: DRAFT / HOLD / alvo exato / nenhum registro de evento lido.**

## Correção real

A V8.85 chamava sua lista de limites de `effects`, mas não registrava que o
observador executa processo, cria um job efêmero, lê a identidade local, o
relógio e a configuração do canal. Isso podia produzir um falso negativo na
auditoria: ausência de efeito operacional não significa ausência absoluta de
atividade no host.

A V8.86 corrige a taxonomia. O relatório declara como verdadeiros os acessos
observacionais necessários e mantém falsos, separadamente, impressão, fila,
spooler, registros do Event Log, inventário de processos, serviços, arquivos
da aplicação, GP, Teknisa, fiscal/SEFAZ, sequência, instalação e deploy.

## Vínculo de alvo e frescor

O script só continua quando o nome local do Windows é exatamente
`CAIXA_MOOCA`; o valor lido não é exportado. Ele exige um desafio hexadecimal
de 64 caracteres e devolve somente o SHA-256 desse desafio. Um desafio novo
permite detectar replay de uma saída antiga sem gravar nonce no computador.

Esse teste local não se autentica sozinho. A execução só constitui evidência
quando o recibo externo do conector também identifica o dispositivo
`CAIXA_MOOCA`. O script sempre declara
`connector_device_binding_proven_by_script=false`. Nome do Windows e nome do
dispositivo são evidências complementares, não autoridade de loja lógica.
`CDFILIAL`, `CDLOJA`, unidade e topologia continuam fora do escopo e
`target_logical_store_identity_proven=false`.

## Leitura permitida nesta etapa

Depois dos guardas, o script:

1. reduz a SID da identidade de execução e o conjunto de SIDs do token a
   hashes SHA-256, sem exportar SIDs ou nomes;
2. executa uma única chamada
   `Get-WinEvent -ListLog Microsoft-Windows-PrintService/Operational`;
3. limita o job a dez segundos e solicita seu encerramento/remoção;
4. exporta somente presença, habilitação e hash do descritor de segurança;
5. permanece `HOLD_OPERATIONAL_METADATA_ONLY` em qualquer resultado.

Não há leitura de evento 307 nem de qualquer outro registro. O hash do
descritor não prova a semântica efetiva da ACL. Os hashes do token observado
não provam que a conta seja um coletor dedicado nem excluem identidades de GP
ou Teknisa.

## Situação da execução real

Em 25/10/2026, César informou que a CAIXA estava conectada. A conexão de
ferramenta observada nesta revisão, porém, ofereceu somente o dispositivo
`Foxxy`; havia clientes remotos ativos, mas sem título ou linha de comando que
vinculasse uma janela a `CAIXA_MOOCA`. Nenhum comando foi executado no alvo
incerto. A inspeção real permanece `NOT_RUN` até o conector listar o dispositivo
exato.

## Prova de revisão antes da publicação

- verificador estático/adversarial V8.86: **81/81**;
- parser do Windows PowerShell 5.1 no Foxxy: **PASS**;
- execução negativa no Foxxy: recusada por
  `V886_EXACT_TARGET_HOST_REQUIRED`, código de saída **1**, antes de token ou
  PrintService;
- V8.84: **65/65**; V8.85: **54/54**; V8.83: **40/40**; V8.82: **39/39**;
- evidência contraditória V8.80: **13/13**; coexistência: **69/69**;
- idempotência/recuperação: **31/31**;
- pedidos simultâneos: **28/28**, permutações **720/720**, interleavings
  **256/256**;
- reconexão: **44/44**, permutações **120/120**, mutações **512/512**;
- TypeScript `typecheck`, `build` e `git diff --check`: **PASS**.

Essas provas validam código, sintaxe e recusa do host errado. Não substituem a
execução na `CAIXA_MOOCA` nem comprovam estado do canal operacional.

## Próximo portão

Quando `CAIXA_MOOCA` aparecer como dispositivo do conector:

1. gerar um desafio novo fora do host;
2. executar o script uma única vez em memória, sem copiar arquivo;
3. conferir o recibo do dispositivo, o hash do desafio e a saída permitida;
4. parar em `HOLD`, mesmo se o canal estiver presente e habilitado;
5. interpretar ACL, identidade dedicada e exclusão GP/Teknisa somente em uma
   etapa separada, sem ler registros.

**NO EVENT RECORD READ / NO EVENT 307 / NO EVENT LOG CHANGE / NO SPOOLER OR
PRINTER API / NO PRINT OR REPRINT / NO PROCESS OR SERVICE INVENTORY / NO
APPLICATION FILE READ OR WRITE / NO GP OR TEKNISA ACCESS / NO FISCAL OR SEFAZ
ACCESS / NO SEQUENCE READ OR WRITE / NO INSTALL / NO DEPLOY / NO MERGE / NO
CASH REGISTER ACCESS.**
