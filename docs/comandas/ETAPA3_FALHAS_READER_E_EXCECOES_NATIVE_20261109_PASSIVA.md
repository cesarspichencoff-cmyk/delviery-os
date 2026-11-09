# TATÁ Comandas — Etapa 3: falhas de leitura SQL e exceções nativas (09/11/2026)

**Estado:** `PASSIVE_HOST_EVIDENCE` · `READER_SQL_READ_FAILURES_OBSERVED` · `IFOOD_INGRESS_CAUSE_UNKNOWN` · `N2_A/N2_B=UNPROVEN` · `PRINT/CUTOVER=HOLD`.

## Escopo de leitura

Foram usados exclusivamente os recursos de **listar arquivos, consultar metadados e ler faixas de texto**, já disponíveis no CAIXA_MOOCA (máquina física do Itaim), nos seguintes locais:

- `C:\ProgramData\TataComandaReader\evidence\continuous-watcher.stderr.log`, leitura das **140 linhas finais**, com metadados do arquivo;
- `C:\ProgramData\TataComandaReader\evidence\continuous-host-status.json` e `shadow-consumer-status.json`, somente leitura;
- `C:\ProgramData\TataComandaReader\bin\tata_reader_continuous_watch_candidate_v2.ps1`, linhas **185–269**, para conferir parâmetros de consulta;
- `C:\Teknisa\LOG\logException\NRORG_5315\logException_06_11_2026.txt`, `logException_08_11_2026.txt` e `logException_09_11_2026.txt`, apenas arquivos de exceção existentes.

Nenhum arquivo foi alterado; nenhum CMD/PowerShell, processo, SQL, serviço, spooler, impressão, instalação, consulta de pedido, API ou ação na interface foi iniciado. Não foram copiados dados transacionais, identificadores de pedidos, SQL proprietário ou informações de clientes a este documento.

## Fatos: 09/11, Reader

O recorte final do log continha **cinco linhas de início `BATCH_FAILED` datadas de 09/11**; as cinco tinham diagnóstico SQL associado no próprio log:

| Hora local indicada no log | Etapa de consulta | Categoria observada |
| --- | --- | --- |
| 05:55:47 | `ExecuteReader` | Tempo limite de comando |
| 07:40:54 | `ExecuteReader` | Tempo limite de comando |
| 11:23:10 | `Read` | Tempo limite de solicitação de bloqueio |
| 11:24:59 | `Read` | Tempo limite de solicitação de bloqueio |
| 13:12:32 | `Read` | Tempo limite de solicitação de bloqueio |

**Total nesta leitura:** 5 `BATCH_FAILED`, com **2 command timeouts** e **3 lock timeouts**. É contagem dos eventos localizados **nesse arquivo e recorte**, não taxa de pedidos, histórico completo do dia ou prova de ausência de falhas posteriores. O arquivo tinha **5.079 linhas** e último registro de modificação em **09/11 13:12:32 -03**, conforme metadados/linhas lidos; não concluir que o Reader esteja saudável apenas porque o log deixou de crescer.

O script instalado inspecionado contém `CommandTimeout=5` e `SET LOCK_TIMEOUT 2000`. A SQL instalada usa `READ COMMITTED` conforme prova anterior, consulta repetida e `CONVERT(nvarchar(64), c.IDORGCMDVENDA) LIKE N'DLV[_]%'`, cuja abrangência é **maior** que a origem estrita `DLV_IFO`. A consulta tem `JOINs` cuja segurança de escopo da candidata foi revista anteriormente, mas a versão instalada não foi substituída. **Leitura é operação sujeita a locks; falha do Reader não equivale a falha da escrita iFood**.

## Status: sinal atual ≠ prova de saúde

- `continuous-host-status.json`: contém `state=RUNNING`, mas o próprio `updated_at` era de **29/10/2026**. É um marcador **obsoleto**, não uma atestação de execução atual.
- `shadow-consumer-status.json`: foi atualizado em 09/11 e informa `state=RUNNING`, `print=false`, `database_write=false`, `spooler_write=false`. Os contadores internos `processed`, `ready_count` e `blocked_count` pertencem ao consumidor sombra e **não** medem pedidos completamente integrados nem conferência real homologada; `ready_count` não concede autoridade de impressão. A atualização do consumidor **não atesta** a saúde do Reader a montante.

## Contraprova: outros erros nativos não explicam iFood

- Arquivo de exceção Teknisa de 08/11: duas entradas do tipo **mesa não encontrada**, em contexto de mesa, sem vínculo demonstrado com ingestão iFood.
- Arquivo de 09/11: **timeout SOAP na autorização NFC-e / SEFAZ**, às 14:57:12, após cerca de 8 segundos. É um incidente de comunicação fiscal, não prova de rejeição do pedido pelo integrador iFood.
- Arquivo de 06/11: há deadlock SQL `40001` registrado na consulta nativa `SQL_ITENS_DETALHADOS` às 21:12:59, já documentado. É um `SELECT`; não comprova falha em `INSERT` iFood.

**A pasta `logException` não cobre necessariamente todos os processos/serviços nem todos os erros possíveis.** Não usar a ausência de `INSERT` nesses arquivos como prova de que todos os pedidos foram gravados.

## Diferença material e decisão

**Comprovado no escopo lido:** o Reader teve falhas de leitura SQL em 09/11 (inclusive bloqueios), o consumidor sombra reporta execução, o host-status geral está desatualizado e o erro fiscal da Teknisa é de natureza separada.

**Inferência cautelosa:** as falhas de leitura podem prejudicar a continuidade/amostragem da observação do Reader, mas **não há prova** de perda de pedidos, participação no deadlock, bloqueio de escritores ou causalidade sobre falhas de integração.

**Ainda não provado:** origem efetiva do integrador iFood, fim de todos os commits de cabeçalho/itens/componentes/observações, plano e impacto de locking da consulta candidata, primeira via de impressão, censo físico.

**Próxima prova que muda decisão:** obter um recibo primário, autorizado e correlacionável de **ingestão → gravação completa**; em separado, medir efeito da leitura sobre escritores em ambiente seguro e autorizado, antes de qualquer alteração de frequência/SQL. Sem essa evidência, não ajustar o Reader instalado por tentativa, não ativar impressão própria do iFood (relatada OFF por César), não imprimir TATÁ e não promover `RUNNING` ou `ready_count` a `WORLD_PROVEN`.

**Portões:** `STAGE_3=IN_PROGRESS`, `STAGE_4=NOT_AUTHORIZED`, `STAGE_5=PAPER_CENSUS_PENDING`, `PRINT=HOLD`, `CUTOVER=HOLD`.
