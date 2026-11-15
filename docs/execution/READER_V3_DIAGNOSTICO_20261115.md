# Reader V3 — diagnóstico da fonte real e decisão de arquitetura (15/11/2026)

Tudo abaixo é FACT medido no CAIXA_MOOCA, **só leitura**, pelo conector, com
`tools/windows-local-lab/diagnostico-reader.cjs` (contagens, nomes de campo e códigos; nenhum
identificador, nome, item ou observação saiu da máquina) e pela leitura do **código instalado**.

## 1. O que está instalado

| Peça | Onde | O que faz |
|---|---|---|
| Serviço | `bin\TataComandaReader.ContinuousService.exe` + supervisor `tata-reader-supervisor@1` | sobe e vigia o watcher |
| Watcher | `bin\tata_reader_continuous_watch_candidate_v2.ps1` (sha256 `92B33E82…` no config) | consulta a Teknisa e grava `state\reader-events-v1\*.json` |
| Consumidor sombra | `shadow\live_shadow_consumer_loop_v1.cjs` (node, filho do serviço) | gera decisões de impressão/embalagem em `state\reader-shadow-decisions-v1\` |
| Estado de serviço | `state\production-service-state.json` | turno do dia, gravado por `bin\set_production_service_state_v1.ps1` (**manual**) |

Nenhum desses programas está versionado neste repositório.

## 2. Por que tudo aparece bloqueado (causa demonstrada)

Varredura de **21.071 eventos** (40 dias, 400–860 por dia), todos legíveis, todos com decisão:

| Bloqueio declarado pelo produtor | Eventos |
|---|---|
| `SERVICE_STATE_EXPIRED_FOR_ORDER` | 8.935 |
| `SERVICE_STATE_DATE_MISMATCH_ORDER_DATE` | 8.396 |
| `BACKFILL_SERVICE_UNRESOLVED_PRE_18H` | 57 |
| `SERVICE_HOURS_OUTSIDE_WINDOW` | 33 |
| **qualquer bloqueio de dado** | **0** |

`ready_for_downstream_shadow`: 12.046 sim, 9.025 não. **100% dos bloqueios são de estado de
serviço.** O arquivo de estado foi gravado pela última vez em **14/10 09:55** por um passo manual
que ninguém fez desde então, embora exista uma política semanal configurada desde 26/10
(`bin\production-service-weekly-policy.json`: almoço 11–15 / 16:30 sáb-dom, jantar 18–23). O
bloqueio é **operacional, não de integridade de dado**.

## 3. Por que a leitura é incompleta (causa estrutural)

A consulta instalada (linhas ~204–224 do watcher) lê **só** `COMANDAVEN` + `ITCOMANDAVEN` +
`PRODUTO`. Não lê `ITCOMANDAEST` (componentes de combinado), `OBSITCOMANDAVEN` /
`OBSITCOMANDAEST` (observações por item) nem `OCORRENCIA` (modificadores e observação cobrada).
O código do fornecedor (`Pedido.php`, `Comanda.php`, `MSDEQuery.php`; ver
`DELIVERYOS_L1_NATIVE_CHILD_WRITERS_AND_X_AMBIGUITY_20261112.md`) grava essas relações em comandos
separados. Medido nos eventos: só **96** de amostra trazem linhas de observação; **nenhum** traz
componente ou complemento.

## 4. Por que o caixa gasta CPU e o SQL trabalha sem parar (causa demonstrada pelo código)

- **Consumidor sombra:** a cada **2 s**, para sempre, lista os 21 mil arquivos, ordena e faz dois
  `existsSync` por arquivo (~42 mil chamadas de arquivo a cada 2 s), sem marca d'água nem
  checkpoint. Medido: **241.385 s de CPU em ~4 dias (~70% de um núcleo)**. O custo cresce com o
  histórico e nunca para.
- **Watcher:** a cada **3 s**, `TOP (@top)` dos pedidos mais recentes recalculado do zero, com
  `CONVERT(nvarchar(64), c.IDORGCMDVENDA) LIKE N'DLV[_]%'` (função sobre a coluna: o índice não
  ajuda) e `ORDER BY` sobre o join com `VENDAREST`. Cada lote de 20 consultas suprime **1.000
  duplicatas**; total acumulado **5.890.144**. É releitura, não leitura nova.
- Acesso: Windows (SSPI) com o login esperado do serviço, `READ COMMITTED`, `LOCK_TIMEOUT 2000`,
  sem escrita. É o **único** acesso legítimo ao SQL da Teknisa.

## 5. Decisão de arquitetura (por evidência)

| Caminho | Veredito |
|---|---|
| A — consertar o V2 no lugar | Necessário para as tabelas filhas e para a carga do SQL, mas só pelo próprio serviço (identidade legítima): é intervenção produtiva. |
| B — Reader V3 com outra identidade de SQL | **Recusado:** exigiria login/ACL nova na Teknisa (mudança produtiva de credencial) para ler o que o serviço já lê. |
| **C — híbrido, em duas camadas** | **Escolhido.** (1) No Delivery OS, já: consumo **incremental** e honesto dos eventos que o Reader grava, com o turno derivado da **política semanal** (sem passo manual), a revisão mais recente por pedido, completude declarada por campo, e conciliação com o Gestor. (2) No Reader, por procedimento supervisionado único: watcher V3 com consulta sargável e incremental, leitura das tabelas filhas na mesma revisão, e o consumidor sombra incremental. |

O que **não** se faz: apagar os bloqueios para a tela ficar limpa. O bloqueio de estado de serviço é
substituído por uma regra automática (política semanal + hora nativa), registrada por pedido; os
demais bloqueios continuam valendo; o que a fonte não lê aparece como **não lido**, nunca como vazio.
