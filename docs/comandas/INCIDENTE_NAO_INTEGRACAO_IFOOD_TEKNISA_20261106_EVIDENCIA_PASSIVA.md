# Incidente Itaim — pedidos presentes no iFood que não chegam à Teknisa

**Data da ocorrência:** 06/11/2026, jantar.  
**Estado:** `INCIDENT_CONFIRMED_BY_HUMAN_REPORT`; `ROOT_CAUSE=UNKNOWN`; `READER_INDIRECT_CONTRIBUTION=UNPROVEN`; `DRAFT/HOLD`.  
**Método:** leitura passiva de metadados/arquivos já existentes e engenharia documental; nenhum processo iniciado no CAIXA_MOOCA, nenhuma consulta SQL nova, nenhuma alteração em banco, serviços, impressoras, spooler ou integração. Nenhum número de pedido, cliente, dado fiscal, token, arquivo bruto ou conteúdo de comanda é transcrito aqui.

## 1. O problema e a fronteira correta

César confirmou que **alguns pedidos entram no iFood mas não integram à Teknisa, inclusive após esperar**. O defeito relatado é de **ingestão/persistência entre sistemas**, não de impressão da via de um pedido já registrado e nem de classificação ou projeção de uma comanda TATÁ. Até haver uma reconciliação individual e temporal independente, o relato não quantifica pedidos, frequência ou perda financeira.

Uma conciliação histórica de 25/10 (fonte: `CONCILIACAO_IFOOD_TEKNISA_20261025_CORRECAO_HUMANA.md`) já encontrou **3 códigos curtos presentes na exportação iFood e ausentes da consulta SQL Teknisa**, além de seis apenas na fonte nativa. As fotografias foram de momentos diferentes; não atribuir estes casos ao incidente de hoje nem à versão atual do Reader.

## 2. Evidências locais do Reader no jantar 06/11

O Reader **V2 em produção** (SHA-256 verificado `92B33E82ED72426BE46FE20BCB2A4F4557F9716108886F89E15A4E262C506D44`) está em leitura SQL/local-eventos, com `database_write=false`, `print=false`, `spooler_write=false`. Sua consulta instalada usa **TOP 50 pedidos recentes a cada 3 segundos**, `SET LOCK_TIMEOUT 2000` e `CommandTimeout=5`; o supervisor processa lotes de 20 polls. Não é um integrador de pedidos do iFood nem uma rotina que os grava na Teknisa.

A leitura passiva de `C:\ProgramData\TataComandaReader\evidence\continuous-watcher.stderr.log` (últimos 2350 registros do arquivo) encontrou **22 eventos `BATCH_FAILED` de 18h59 a 22h04** do dia 06/11. Classificação pela mensagem de exceção seguinte:

| Hora BRT | Timeout de lock | Timeout de comando | Total |
|---|---:|---:|---:|
| 18h | 1 | 0 | 1 |
| 19h | 6 | 3 | 9 |
| 20h | 1 | 0 | 1 |
| 21h | 9 | 0 | 9 |
| 22h até 22h04 | 2 | 0 | 2 |
| **Total** | **19** | **3** | **22** |

Exemplos relevantes: `19:10:40` lock; `19:29:19/28/40` comando; `20:37:44` lock; `21:11:23`, `21:12:55` e `21:31:46` locks. A falha `21:12:55` ocorreu aproximadamente **4 segundos antes** do deadlock nativo abaixo. A proximidade temporal **não prova mesma transação, mesmo pedido nem relação causal**.

Heartbeat passivo às **22h22 BRT**: `RUNNING`, último lote `#12726 OK`, `poll_errors=0`, `events_emitted=3`, `consecutive_failures=0`, acumulado `failed=577` e `events_emitted=5485`. `RUNNING` não invalida os bloqueios anteriores nem prova integração. O consumidor sombra continuava `RUNNING`, `print=false`; sua métrica `processed` mede eventos próprios, não pedidos completos independentes do iFood.

## 3. Evidências independentes da própria Teknisa

Leitura passiva de `C:\Teknisa\LOG\logException\NRORG_5315\logException_06_11_2026.txt`: em **06/11 às 21:12:59 BRT**, a própria rotina **`SQL_ITENS_DETALHADOS`** registrou **erro 40001**, SQL Server deadlock, uma transação escolhida como vítima. Esse é um defeito nativo real de concorrência ocorrido no jantar, mas não foi demonstrado ser a rotina de ingestão iFood nem identificados os outros participantes do ciclo de bloqueio.

Comparação de arquivos de exceção do mesmo diretório (não é um log exaustivo de todos os erros da aplicação):

| Dia | Deadlocks registrados | Rotina |
|---|---:|---|
| 01/11 | 1 (20:31) | `SQL_ALTERA_STATUS_MESA` |
| 02/11 | 1 (20:59) | `SQL_ITENS_DETALHADOS` |
| 03/11 | 2 (13:17 e 22:03) | `SQL_ITENS_DETALHADOS`, `SQL_ULTIMA_VENDA` |
| 04/11 | 0 nesse arquivo | — |
| 05/11 | sem arquivo `logException_05_11_2026.txt` encontrado | desconhecido |
| 06/11 | 1 (21:12) | `SQL_ITENS_DETALHADOS` |

A recorrência em dias e rotinas diferentes amplia a hipótese de contenção estrutural no SQL/ERP, não identifica um responsável. As falhas do Reader podem ser **vítimas** de locks de escritores nativos, mas suas leituras também podem competir por locks sob o isolamento atual.

## 4. Características de risco observadas no banco

Prova anterior verificada em `ITAIM_REAL_READER_SQL_SOURCE_PROOF_20261104.md` e `READER_V2_CACHED_SQL_PLAN_AND_ATOMICITY_GATE_20261104.md`:
- Reader sob **READ COMMITTED**, com **RCSI OFF** e **SNAPSHOT OFF** no SQL Express local.
- Consulta do Reader percorre `COMANDAVEN`, `VENDAREST`, `ITCOMANDAVEN` e `PRODUTO`; um plano cacheado real continha três seeks e **um scan em PRODUTO**, com **9.249 leituras lógicas** e **28,70 ms** na última execução desse plano observado anteriormente (não benchmark do jantar, e não medição de deadlock).
- Read-only **não significa sem locks ou sem consumo de recursos**. Também não autoriza a conclusão inversa de que essa consulta provoca os deadlocks.

**Hipóteses em aberto, sem ordenar como causas comprovadas:**
1. O integrador iFood/Retail/ForSale rejeitou ou não persistiu determinados pedidos, por erro de integração, estado, rede, fila ou configuração.
2. A operação nativa de gravação sofreu concorrência/bloqueio ou saturação SQL, **com ou sem participação do Reader**.
3. A busca na Teknisa não reflete a mesma unidade, chave ou estado do relatório iFood; depende de reconciliação exata.
4. Retenção, alteração de estado ou movimentação nativa de registros após ingestão aparenta ausência numa leitura posterior.

## 5. Contraevidências e controles negativos

- O log `C:\Users\Tata\AppData\Roaming\Gestor de Pedidos\log.log` foi modificado na noite de 06/11, mas as **450 linhas finais analisadas** continham checagens rotineiras de atualização do aplicativo; não houve mensagens `error`, `timeout`, `order`, `teknisa` ou `ifood` nessa janela. **Esse log não é evidência de que a integração funcionou**.
- A pasta `C:\Teknisa\LOG\SEMCONEXAO\NRORG_5315` tinha arquivos de novembro nos caixas observados, mas **não havia arquivo de 06/11** nas pastas examinadas (003, 004, 005, 006 e 008). Ausência de um arquivo de contingência específico **não prova conexão saudável nem cobre o integrador externo**.
- `C:\Teknisa\LOG\vendaApi\...` possui logs de vendas/fiscal do dia. Não foram usados para inferir integridade de entrada iFood: incluem XML fiscal e não constituem prova independente da ingestão de cada pedido. Nenhum dado fiscal foi extraído/publicado.
- A observação local do `DeliveryOS-Itaim-Observer\status.json` informa `liveSourceVerified=false` e `CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`; métricas projetadas não substituem a comparação oficial iFood↔Teknisa.

## 6. Conclusão, resposta segura e gates

**PROVEN:** houve falhas de leitura por bloqueio/timeout SQL do Reader no jantar e deadlock nativo da Teknisa às 21:12:59. Ambos compartilham a infraestrutura SQL, e a implementação do Reader faz consultas frequentes sob `READ COMMITTED/RCSI OFF`.

**HUMAN_REPORTED:** pedidos permanecem no iFood sem integração posterior à Teknisa.

**UNKNOWN:** se esses pedidos encontraram rejeição de API, indisponibilidade, timeout da escrita, deadlock, movimentação de registros ou outro motivo; se alguma sessão do Reader participou do deadlock ou prejudicou o integrador; quantos pedidos realmente faltaram; nexo causal entre as falhas observadas e cada pedido.

**Proteção imediata:** a operação deve comparar diretamente o Gestor iFood com a Teknisa e aplicar apenas a contingência de pedidos já usada pela loja, com controle contra duplicações se houver integração tardia; não confiar exclusivamente em impressão ou relatórios do TATÁ.

**Investigação técnica futura que diferencia causa sem pedir exemplos isolados:**
1. Obter por canal oficial, **autorizado e sem acesso invasivo à tela**, evidência agregada e contemporânea de *todos* os pedidos iFood e das gravações correspondentes na Teknisa; reconciliar por chave e janela, com cuidado de não exportar cliente ou fiscal. Sem fonte independente disponível, a taxa atual de não integração é **UNKNOWN**.
2. Identificar, em janela de manutenção própria, **vítima e participantes reais do deadlock** (grafo de deadlock/sessões SQL e programa de origem), com plano de leitura e escopo/privacidade aprovados. `SQL_ITENS_DETALHADOS` não identifica sozinho o bloqueador.
3. Auditar o caminho de persistência do integrador, seus erros e retentativas. Não confundir log de atualização do Gestor ou relatório fiscal com log de integração.
4. Só se houver autorização operacional específica, fazer ensaio controlado de pressão com Reader ativo/inativo em janela segura, métricas antes/depois e rollback. **Não** usar paralisação ad hoc durante o serviço; evitar que o teste provoque perda de pedido.
5. Redesenhar e medir **offline** filtros, paginação/frequência, cobertura e planos do Reader; qualquer alteração de watcher no caixa exige homologação, reversibilidade e aprovação separadas. Não ativar RCSI, SNAPSHOT, `NOLOCK` ou novos hints de isolamento globalmente como tentativa rápida.

**Fronteiras mantidas:** `STAGE_3=IN_PROGRESS`, `STAGE_4=NOT_AUTHORIZED`, `PR_135=DRAFT_HOLD`, `PRINT=HOLD`, `CUTOVER=HOLD`, `SQL_NEW=NOT_EXECUTED`, `HOST_COMMAND=NOT_EXECUTED`, `SERVICE_CHANGE=NOT_EXECUTED`. Este registro e seu eventual commit GitHub têm somente efeito documental; CI offline não constitui prova operacional.
