# Comandas Itaim — contrato de inspeção de deadlock fora do caixa (07/11/2026)

## Resultado factual e escopo

**Incidente original:** segundo `docs/comandas/INCIDENTE_NAO_INTEGRACAO_IFOOD_TEKNISA_20261106_EVIDENCIA_PASSIVA.md`, a rotina nativa Teknisa `SQL_ITENS_DETALHADOS` registrou deadlock SQL Server `40001` em **06/11/2026 21:12:59 BRT**. A existência do deadlock foi observada no arquivo nativo de exceções. Isso não demonstra a causa da falha de ingestão iFood→Teknisa, pois a rotina em questão executa **SELECT** e o grafo de sessões ainda não foi lido. Um erro do Reader aproximadamente quatro segundos antes é correlação temporal, não participação identificada.

**Verificação passiva de arquivo** (07/11): em `CAIXA_MOOCA`, apenas via `get_file_info`, o arquivo `C:\Program Files\Microsoft SQL Server\MSSQL14.SQLEXPRESS\MSSQL\Log\system_health_0_134384463380220000.xel` existe como binário, tamanho **5.239.296 bytes**, criado em 06/11/2026 às 13:45:38 UTC e modificado em 07/11/2026 às 02:43:40 UTC. O intervalo de tempo de arquivo **inclui** 06/11 às 21:12:59 BRT (07/11 00:12:59 UTC), mas não comprova que o evento foi capturado ou retido. Não existe cópia íntegra verificada neste laboratório. Leituras passivas dos `ERRORLOG`, `ERRORLOG.1` e `ERRORLOG.2` da instância 2017 não revelaram grafo `xml_deadlock_report` legível; a falta de texto não prova a ausência do evento binário. Nenhum XEL foi aberto/decodificado.

## Por que a cópia ainda é um gate

O conector de leitura disponível classifica o `.xel` como **binário** e possui paginação em linhas de texto; não há operação autenticada de transferência íntegra desse arquivo via esse conector. Tratar um resultado textual ou parcial como a cópia binária original seria prova falsa. Não renomear, mover, rotacionar, remover ou tentar parsear o arquivo em produção e não iniciar CMD, PowerShell, SQL Server Management Studio, novo processo ou consulta no CAIXA_MOOCA.

A documentação oficial Microsoft confirma duas formas de ler XEL em **ambiente apropriado**: SQL Server Management Studio e `sys.fn_xe_file_target_read_file`; qualquer execução de SQL, mesmo apenas SELECT, fica **fora do escopo deste laboratório** e depende de autorização e ambiente próprios. Fonte: https://learn.microsoft.com/pt-br/sql/relational-databases/system-functions/sys-fn-xe-file-target-read-file-transact-sql?view=sql-server-ver17.

## Ferramenta isolada criada agora

- `tools/comandas_deadlock_graph_participant_review_v1_offline.py` aceita **somente XML de evento `xml_deadlock_report` ou XDL exportado**, já disponibilizado externamente à operação, em arquivo de até 1 MiB. Rejeita `*.xel` e entidades/DOCTYPE; não abre SQL Server, não executa comandos no Windows, não grava nem transmite arquivos.
- Compara horário declaradamente presente no XML com o incidente, normalizado para **2026-11-07 00:12:59 UTC**, tolerância de 10 segundos. Um `.xdl` direto sem timestamp **não** pode ser vinculado a essa ocorrência, embora sua estrutura possa ser examinada em laboratório.
- Confronta `clientapp` com o **nome literal esperado** `TataReaderContinuousWatchV1` na candidata revisada (não equivale a prova da configuração efetiva de todas as sessões). Relata somente indicadores agregados: quantidade de matches literais, se o processo apontado foi vítima, vezes em listas `owner`/`waiter`, quantidade de outras sessões e ausência de `clientapp`. **Nunca imprime texto SQL, identificador de processo, usuário, máquina, login, nome de cliente, objeto/tabela, recursos ou pedidos.**
- Mesmo um XML aparentemente coerente com Reader identificado retorna `status=HOLD`, `reader_participation_world_proven=false` e `reader_cause_of_ifood_ingestion_failure_proven=false`. XML fornecido sem prova de origem pode ser fabricado. Um grafo sem match literal do Reader **não** o inocenta de todos os incidentes.
- `tools/verificar_comandas_deadlock_graph_participant_review_v1_offline.py` valida 25 cenários sintéticos: Reader como proprietário, vítima ou ausente; falsa semelhança de nome, horários, origem incompleta, XML malformado, referências inválidas, DTD/ENTITY, vazamento de campos privados, binário `*.xel` e ausência de efeitos. CI restrita a esta branch de análise, Linux e Windows.

## Próximo passo que realmente altera a investigação

1. **Preservar** o XEL nativo sem alteração e garantir que uma cópia **bit a bit** possa ser obtida por canal autorizado que suporte bytes binários, com integridade SHA-256 verificada no destino. Não há demonstração disso no conector atual; `COPY_AVAILABLE=UNKNOWN`.
2. Analisar essa **cópia** em máquina isolada com ferramenta apropriada, exportando apenas o evento do intervalo relevante (ou XDL com registro temporal independente). Não adicionar bruto XEL/XML ao GitHub, que pode revelar SQL, logins, computadores e dados de clientes.
3. Executar o analisador offline contra o XML exportado **fora da operação**. Mesmo a presença de Reader no grafo não prova perda de pedido iFood; correlacionar posteriormente com o processo de ingresso real e uma conciliação independente iFood↔Teknisa.
4. Só depois decidir se existe justificativa causal para testar frequência do Reader, isolamento, planos de consulta ou qualquer mudança de serviço — sempre com autorização própria e rollback.

**Estado:** `XEL_METADATA_VERIFIED` · `XEL_BYTES_NOT_ACQUIRED` · `DEADLOCK_GRAPH_UNKNOWN` · `READER_CAUSALITY_UNKNOWN` · `OFFHOST_XML_ANALYZER_TESTED_SYNTHETIC_ONLY` · `STAGE_3=IN_PROGRESS` · `PRINT=HOLD` · `CUTOVER=HOLD`. Nenhuma consulta SQL, serviço, fila, impressão, instalador ou fornecedor foi acionado nesta rodada.
