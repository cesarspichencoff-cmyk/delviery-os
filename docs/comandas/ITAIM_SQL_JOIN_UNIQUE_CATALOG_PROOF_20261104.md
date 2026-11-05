# ITAIM / TATÁ Comandas — verificação real de unicidade das junções (`sys.*`) — 04/11/2026

**Estado:** `CATALOG_UNIQUE_KEYS_OBSERVED` — evidência direta de catálogo, limitada ao instante da consulta; **ETAPA 3 EM_ANDAMENTO, PR #135 DRAFT/HOLD.** Não é prova de execução da candidata, plano SQL, completude semântica, revisão monotônica, ausência de espera dos escritores, papel físico ou autorização para impressão.

## Autorização e método

César autorizou expressamente, nesta conversa de 04/11/2026, **exclusivamente uma consulta de metadados `sys.*` na Teknisa**, em sessão isolada e somente leitura, sem pedidos, serviços ou impressoras.

- Dispositivo selecionado e confirmado via `list_devices`: **CAIXA_MOOCA**, online, `4f30e48d-a3a3-4559-81d1-ef789025e099` (não Foxxy).
- Worker instalado foi **somente lido** para conferir parâmetros, sem iniciá-lo ou alterá-lo. Origem: `(local)\SQLEXPRESS`; banco `teknisa`; autenticação integrada do Windows (`SSPI`).
- Consulta exata do repositório: `tools/comandas_reader_join_unique_catalog_REVIEW_ONLY.sql`, blob GitHub `fed24c7180c97cd9037b6c6c6cb372fd6c9d3e16`. Pré-checagem estática: **um único SELECT**, `FROM sys.schemas`, joins restritos a `sys.tables`, `sys.indexes`, `sys.index_columns`, `sys.columns`; filtros para as quatro tabelas `TEKNISA`. Nenhuma consulta às linhas de tabelas operacionais.
- Execução isolada via `System.Data.SqlClient.SqlConnection`: `Pooling=False`, `Integrated Security=SSPI`, `Application Name=TataComandasUniqueCatalogAuditReadOnly`, `Connect Timeout=5`, `CommandTimeout=8`. Host PowerShell iniciado com `-NoProfile -NonInteractive -WindowStyle Hidden` solicitado. Não houve verificação visual da tela para atestar ausência absoluta de piscadas.
- O processo retornou `TATA_CATALOG_JSON_BEGIN/END`, foi finalizado e descartou leitor, comando e conexão. Identidade Windows observada: `CAIXA_MOOCA\Tata`; servidor ADO.NET `(local)\SQLEXPRESS`; `SqlConnection.Database=teknisa`. **O login SQL visto do servidor não foi consultado de forma independente nesta etapa.**
- Não houve `SELECT` em pedidos, `SHOWPLAN`, `SET SERIALIZABLE`, escrita SQL, alteração do banco, serviço, Reader, ACL, arquivos operacionais, spooler, impressora, sequência, fiscal/SEFAZ, instalação, deploy ou merge.

## Resultado factual do catálogo consultado

**385 linhas de metadados de índice**, **116 índices**, **4 índices marcados como únicos**. Todos os quatro são chaves primárias `CLUSTERED`, com `is_unique=1`, `is_disabled=0`, `is_hypothetical=0` e `has_filter=0`.

| Tabela | Índice único observado | Colunas reais da chave (ordem `key_ordinal`) | O que sustenta |
|---|---|---|---|
| `COMANDAVEN` | `PK_COMANDAVEN` | `CDFILIAL`, `NRVENDAREST`, `NRCOMANDA` | No máximo um cabeçalho por esses valores; `CDLOJA` é filtro adicional da candidata |
| `VENDAREST` | `PK_VENDAREST` | `CDFILIAL`, `NRVENDAREST` | No máximo uma venda correspondente pela junção atual |
| `ITCOMANDAVEN` | `PK_ITCOMANDAVEN` | `CDFILIAL`, `NRVENDAREST`, `NRCOMANDA`, `NRPRODCOMVEN` | No máximo uma linha por **identidade completa de item**; a comanda continua naturalmente 1:N em itens |
| `PRODUTO` | `PK_PRODUTO` | `CDPRODUTO` | No máximo um registro de produto para cada `CDPRODUTO` associado |

**Conclusão da lacuna específica:** as chaves únicas estão efetivamente presentes e habilitadas no catálogo consultado. Na **consulta candidata atual**, a igualdade das junções cobre as chaves das tabelas de cabeçalho, venda e produto; os identificadores de linha de item são únicos pela PK. A hipótese genérica de que registros duplicados nessas mesmas chaves poderiam multiplicar a junção **não é corroborada pela estrutura observada**. A proteção sintética contra duplicações permanece necessária como defesa contra inconsistência de origem, regressões de consulta e mudanças futuras.

**Limites:** `UNIQUE` garante *no máximo um registro por chave*, não existência da linha, não ausência de órfãos/itens faltantes, não igualdade entre os instantes dos commits da aplicação, não preserva transições entre polls e não prova plano/locks. Não implica `TOP(201)` = 201 itens completos nem garante que nenhuma linha seja omitida por alterações semânticas da Teknisa. O catálogo não autentica origem iFood independente, emissão de papel ou recebimento na praça. Nenhum teste real de impressão foi realizado.

## Gates e decisão

- `CATALOG_PK_UNIQUE=OBSERVED_DIRECTLY` para as quatro tabelas, no instante da consulta.
- `EXACT_CANDIDATE_PLAN=UNKNOWN`; `SERIALIZABLE_WRITER_IMPACT=UNKNOWN`; `NATIVE_SEMANTIC_REVISION=UNKNOWN`; `PAPER_CENSUS=NOT_OBSERVED`.
- `SOURCE_ROWSET_COMPLETENESS=UNPROVEN`; `PRINT=HOLD`; `CUTOVER=HOLD`.
- **Próxima ação segura:** avaliar em revisão offline se a necessidade de uma consulta sob `SERIALIZABLE` continua justificável diante da rota conservadora Cozinha/Sushi nativas + Conferência somente em sombra. Qualquer `SHOWPLAN`, consulta de pedidos, ensaio de locks, instalação ou impressão exige nova autorização específica; esta autorização cobriu **somente** a leitura de catálogo já executada.

**Checkpoint:** PR #135, branch `audit/comandas-native-chain-20261102`; fonte canônica VÉRTICE revalidada em `vertice-active`/`VERTICE_ENTRY.md`, blob `912a02f932acc42e76cb1fb7d46b3f1f8a0c380d`.
