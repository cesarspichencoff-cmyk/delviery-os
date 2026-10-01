# CAIXA_MOOCA — Handoff para Claude — READ-ONLY — 2026-10-01

## Missão

Executar somente o preflight read-only do projeto de comandas no computador real do Caixa Mooca e devolver evidência suficiente para o próximo gate.

Este handoff NÃO autoriza:
- impressão;
- criação de job no spooler;
- escrita no Odhen/Teknisa;
- leitura de pedido real;
- emissão de NFC-e;
- chamada à SEFAZ;
- abertura/fechamento de caixa;
- alteração de fila/driver/porta;
- cutover;
- mudanças em produção.

## Fonte canônica do trabalho

Repositório: `cesarspichencoff-cmyk/delviery-os`
Branch: `fix/odhen-routing-config-proof-20260930`

Antes de executar:
1. `git fetch origin fix/odhen-routing-config-proof-20260930`
2. usar worktree/diretório limpo apontando para `origin/fix/odhen-routing-config-proof-20260930`;
3. registrar o HEAD exato;
4. não fazer merge, reset destrutivo ou checkout sobre diretório operacional com mudanças locais.

## VÉRTICE

Se o repositório canônico VÉRTICE estiver disponível:
- repo: `cesarspichencoff-cmyk/vertice-runtime.`
- branch: `vertice-active`
- leia primeiro `VERTICE_ENTRY.md`;
- registre o HEAD.
Se não estiver disponível localmente, marque `VERTICE_LOCAL_REVALIDATION=UNKNOWN` e não invente.

## Preflight permitido

No worktree limpo do DeliveryOS, execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\mooca_commandas_preflight_readonly.ps1 `
  -OdhenRoot "C:\TEKNISA\odhen-perifericos" `
  -Server "192.168.0.24\SQLEXPRESS" `
  -Database "teknisa" `
  -OutputPath ".\mooca-commandas-preflight-real.json"
```

O script compõe apenas:
1. fonte/código/configuração Odhen;
2. superfície fiscal em código/configuração;
3. metadados/permissões SQL;
4. inventário read-only de filas/driver/porta das impressoras.

## Effect Boundary

Durante esta etapa deve permanecer:

```text
order_row_read=false
database_write=false
odhen_write=false
fiscal_action=false
sefaz_call=false
print=false
spooler_write=false
printer_configuration_change=false
cutover=false
```

Não habilitar `-ProbeTcp9100` nesta primeira execução.

## O que NÃO fazer mesmo que pareça conveniente

- não abrir pedido real;
- não rodar SELECT em linhas de pedidos além do metadata preflight previsto;
- não testar impressão;
- não enviar texto para porta 9100;
- não reiniciar serviço Teknisa/Odhen;
- não alterar impressora padrão;
- não instalar driver;
- não editar config;
- não copiar certificado/CSC/token;
- não exibir secrets;
- não usar credencial encontrada no código/config;
- não chamar endpoint fiscal;
- não corrigir nada durante o diagnóstico.

Se qualquer ferramenta pedir elevação, credencial nova, alteração ou efeito, pare e reporte.

## Resultado esperado

Preserve o JSON `mooca-commandas-preflight-real.json`.

Devolva um resumo factual com:

```text
DELIVERYOS_HEAD=
VERTICE_HEAD= ou UNKNOWN

ODHEN_ROOT_EXISTS=
ODHEN_FILES_SCANNED=
ODHEN_REQUIRED_TOKENS_MISSING=

SQL_CONNECTED=
SQL_DATABASE_MATCHES=
SQL_SAFE_FOR_ORDER_READ=
SQL_BLOCKER=

PRINTER_METADATA_COLLECTED=
EXPECTED_PRINTERS_WITH_MATCHING_QUEUE=
EXPECTED_PRINTERS_WITHOUT_MATCHING_QUEUE=
QUEUE/DRIVER/PORT observations=

FISCAL_SURFACE_METADATA_COLLECTED=
NATIVE_NFCE_CANDIDATE_DETECTED=
FISCAL_TOKEN_HITS summary=

READY_FOR_ONE_MINIMIZED_ORDER_READ_CANDIDATE=

EFFECTS:
order_row_read=
database_write=
odhen_write=
fiscal_action=
print=
spooler_write=
printer_configuration_change=
cutover=
```

Inclua também:
- exit code exato do script;
- qualquer erro bruto relevante;
- caminho local exato do JSON;
- não masque UNKNOWN como PASS.

## Gate de encerramento

Esta etapa termina após o preflight.

Mesmo se `READY_FOR_ONE_MINIMIZED_ORDER_READ_CANDIDATE=true`, NÃO leia o pedido real ainda.

O próximo gate será decidido após revisão da evidência por César/ChatGPT.

## Critério de sucesso desta etapa

Sucesso não significa tudo verde.

Sucesso significa:
- preflight executado no host correto;
- nenhum efeito proibido ocorreu;
- resultado preservado;
- blockers/UNKNOWNs capturados fielmente;
- nenhuma tentativa de contornar um blocker.