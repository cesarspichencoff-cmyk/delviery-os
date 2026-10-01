# CAIXA_MOOCA — Claude Handoff v2 — STANDALONE READ-ONLY — 2026-10-01

## Missão

Executar somente o preflight read-only autocontido do projeto de comandas no computador real do Caixa Mooca e devolver a evidência para revisão.

Este handoff NÃO autoriza:
- leitura de pedido real;
- impressão;
- criação de job no spooler;
- escrita no Odhen/Teknisa;
- emissão de NFC-e;
- chamada à SEFAZ;
- abertura/fechamento de caixa;
- alteração de fila/driver/porta;
- teste de porta 9100;
- cutover;
- mudanças em produção.

## Fonte

Repositório: `cesarspichencoff-cmyk/delviery-os`
Branch: `fix/odhen-routing-config-proof-20260930`

Use o HEAD atual da branch e registre o SHA exato antes da execução.

## Único arquivo necessário

`tools/mooca_commandas_preflight_standalone_readonly.ps1`

Este script é autocontido. Ele NÃO chama os quatro probes auxiliares e não precisa baixá-los.

Auditoria já feita antes deste handoff:
- o scan de fonte é restrito a quatro raízes de código/config;
- exclui explicitamente `Log`, `Logs`, `Temp`, `cache` e `node_modules`;
- não usa HTTP;
- não chama SEFAZ;
- não abre pedido;
- não usa `Test-NetConnection`;
- não imprime;
- não altera configuração de impressora;
- não chama scripts filhos;
- só grava o JSON final de evidência.

## Comando permitido

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\mooca_commandas_preflight_standalone_readonly.ps1 `
  -OdhenRoot "C:\TEKNISA\odhen-perifericos" `
  -Server "192.168.0.24\SQLEXPRESS" `
  -Database "teknisa" `
  -OutputPath ".\mooca-commandas-preflight-real.json"
```

## O que o script pode fazer

1. ler arquivos de código/configuração nas quatro raízes permitidas;
2. calcular hashes desses arquivos;
3. procurar apenas nomes/tokens técnicos necessários;
4. consultar somente metadados/permissões do SQL Server;
5. ler metadados de filas, drivers, portas e estado das impressoras Windows;
6. gravar um único JSON de evidência.

## O que o script NÃO pode fazer

- SELECT de linhas operacionais de pedido;
- INSERT/UPDATE/DELETE/EXEC operacional;
- iniciar Odhen/Periféricos;
- acessar certificado/CSC/segredo;
- chamar API externa;
- enviar payload a impressora;
- criar job no spooler;
- alterar printer/driver/port;
- emitir documento fiscal.

## Effect Boundary esperado

```text
order_row_read=false
database_write=false
odhen_write=false
fiscal_action=false
sefaz_call=false
print=false
spooler_write=false
printer_configuration_change=false
network_payload_sent_to_printer=false
cutover=false
```

Atividade de evidência pode ser verdadeira e deve ser reportada como tal:

```text
source_files_read=
database_metadata_query=
printer_metadata_read=
evidence_file_write=true
```

## Resultado a devolver

```text
DELIVERYOS_HEAD=
VERTICE_HEAD= ou UNKNOWN

SCRIPT_SHA256=
EXIT_CODE=
JSON_PATH=

ODHEN_ROOT_EXISTS=
ODHEN_FILES_SCANNED=
ODHEN_REQUIRED_TOKENS_MISSING=

SQL_CONNECTED=
SQL_DATABASE_MATCHES=
SQL_SAFE_FOR_ORDER_READ=
SQL_BLOCKER=
SQL_ELEVATED_ROLES=
SQL_EXECUTABLE_PROCEDURE_COUNT=

PRINTER_METADATA_COLLECTED=
EXPECTED_PRINTERS_WITH_MATCHING_QUEUE=
EXPECTED_PRINTERS_WITHOUT_MATCHING_QUEUE=
QUEUE_DRIVER_PORT_SUMMARY=

NATIVE_NFCE_CANDIDATE_DETECTED=
FISCAL_TOKEN_HITS_SUMMARY=

READY_FOR_ONE_MINIMIZED_ORDER_READ_CANDIDATE=

EVIDENCE_ACTIVITY=
EFFECT_BOUNDARY=
```

Também devolva o JSON inteiro ou seu conteúdo integral.

## Gate obrigatório

Mesmo se `READY_FOR_ONE_MINIMIZED_ORDER_READ_CANDIDATE=true`, PARE.

NÃO leia pedido real ainda.

NÃO corrija blocker durante este handoff.

NÃO tente criar usuário SQL, reduzir privilégio, mudar configuração ou contornar permissões.

## Prova prévia do script

O script autocontido já passou:
- verificador estático: PASS;
- execução fail-closed no Foxxy com raiz Odhen e SQL propositalmente inválidos;
- exit code: 4;
- `ready_for_one_minimized_order_read_candidate=false`;
- nenhum efeito operacional/fiscal;
- `evidence_file_write=true` explicitamente declarado.

Sucesso desta etapa significa observar fielmente o ambiente real, não obter tudo verde.