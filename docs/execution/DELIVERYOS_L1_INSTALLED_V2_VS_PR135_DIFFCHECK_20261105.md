# Delivery OS Itaim — diferença material do Reader instalado V2 vs candidata Comandas #135

**Data:** 05/11/2026. **Etapa vinculante:** L1 de L8; gates N2 (revisão/observações) e N3 (hash canônico) ainda em HOLD. Revisão somente leitura de **código** já instalado no `CAIXA_MOOCA`, sem consultar SQL ou abrir arquivo de pedido. PR Delivery OS #137 DRAFT; PR Comandas #135 DRAFT.

## Fontes efetivamente comparadas

- **V2 em execução no caixa:** `C:\ProgramData\TataComandaReader\bin\tata_reader_continuous_watch_candidate_v2.ps1`, arquivo de 387 linhas. SHA-256 do arquivo foi aferido independentemente no checkpoint anterior: `92B33E82ED72426BE46FE20BCB2A4F4557F9716108886F89E15A4E262C506D44`. É um arquivo instalado, **não** o novo candidato da PR #135.
- **Consulta candidata PR #135:** `tools/comandas_reader_notes_single_select_v1_REVIEW_ONLY.sql` na branch `audit/comandas-native-chain-20261102`. Também existe `tools/verificar_comandas_reader_notes_single_select_v1_offline.cjs`, que já testa a rejeição do predicado largo `DLV[_]%` e outros limites. A consulta **nunca foi executada** no SQL operacional.
- **Consumidor PR #137:** `runtime/reporting/native_reader_producer_contract_review_v1.cjs` e `copiloto_tata_file_feed_v1.cjs`. Ambos permanecem sem autenticação independente do SQL; o file feed declara `live_source_verified:false`, mesmo com dados sintéticos/locais aceitos no contrato.

## Difference Check: três lacunas precisas

| Critério | V2 instalado, observado no código | PR #135 preparada | Consequência |
|---|---|---|---|
| Origem delivery | `c.IDORGCMDVENDA LIKE N'DLV[_]%'` | `c.IDORGCMDVENDA='DLV_IFO'` | V2 **pode** incluir outras origens DLV_* no conjunto limitado. Nenhuma ocorrência de outra origem foi demonstrada; não alegar mistura efetiva sem prova |
| Seleção e ordenação | `TOP (@top)`, padrão `TopOrders=50`, ordenação em `recent` por `DTHRABERMESA, NRVENDAREST` sem `NRCOMANDA` como desempate | `TOP (@top)` ainda limitado, mas ordena também por `NRCOMANDA DESC`; filtro exato `DLV_IFO` | Em empate, V2 pode variar quais comandas entram no Top 50; **capacidade total de cobertura ainda não comprovada** nem na candidata |
| Serialização/hashing | `Hash-Text ($hashBasis | ConvertTo-Json -Depth 12 -Compress)` | Serializador estrito PowerShell↔Node em revisão com SHA-256 canônico em `tools/comandas_reader_canonical_json_v1_REVIEW_ONLY.ps1` | Caso de apóstrofo difere em laboratório; `ToLowerInvariant()` sozinho não resolve hash divergente. V2 atual não fornece N3 canônico provado |

**O que já coincide:** V2 lê `DSOBSCOMANDA`, `DSOBSDESCIT`, `DSOBSPEDDIGCMD`, `TXPRODCOMVEN`; monta `order.items` + `observation_rows` com referência de item e declara `observation_scan_complete=true`. Usa o escopo loja `0001/01`. A existência dos campos **não prova** isolamento de revisão, cobertura, integridade dos joins ou aceitação de uma observação em operação.

**Risco independente no V2:** `observation_scan_complete=true` é atribuído no montador após o retorno do reader. O campo representa uma declaração da rotina, não uma prova externa de que a seleção no banco abrangeu **todas** as linhas e alterações da revisão. Mesmo `TOP 50` sem erro não demonstra que não existam pedidos adicionais. Não inferir "50 pedidos ativos", "cobertura 100%" ou "todas as observações chegaram".

## Prova de saúde de 05/11 (metadados, não pedidos)

- Heartbeat do V2 em `2026-11-05T01:19:48-03:00`: `RUNNING`, `last_success_at=01:19:07-03:00`, `consecutive_failures=0`, último lote `OK` e zero eventos novos no lote. Checkpoint do watcher atualizado às `2026-11-05T04:19:48.366Z`.
- O comprovante em `evidence/continuous-watch-proof-v1/checkpoint.json` não foi atualizado desde `2026-10-05T16:18:28.064Z`: é **histórico**, não evidência de uma revisão de novembro.
- Consumidor sombra `RUNNING` mas `last_projection_status=SKIPPED_LOCKED`; projeção antiga não é Home viva.

## Gates exatos para a próxima ação

1. **N2 — origem/recorte:** atestar que uma leitura autorizada utiliza **somente** `DLV_IFO` em Itaim, que o desempate por comanda é explícito e que a consulta não corta a revisão selecionada. Verificar esquema, permissão e isolamento **sem alterar** o SQL. O template de PR #135 não substitui a prova de leitura real.
2. **N2 — completude:** uma única revisão já previamente sanitizada, com contagens de itens/observações e ligações de item conferidas contra evidência independente, **sem nomes, telefones, endereços, texto sensível ou identificadores de pedido exportados**. Na falta dessa prova, HOLD.
3. **N3 — hash:** conferir mesmo conjunto e ordenação de campos no PowerShell↔Node, inclusive valores fictícios com apóstrofo, e só avançar ao hash da revisão real por canal local autorizado. Hash local por si só prova autoconsistência, não autenticidade da origem.
4. **N4/N5:** origem, atualização e permissão operacional separadas da forma do evento; não marcar `live_source_verified` ou publicar pedidos por `sourceMode='real'`, string de evidência ou heartbeat. O contrato de leitura já retorna `live_source_verified:false` por desenho.
5. **Mudança na produção:** nenhuma autorizada por este documento. **Não** substituir V2 por arquivos da PR #135, não ativar o consumidor de escrita, não abrir console, não consultar SQL, não imprimir, não ler pedidos pessoais no chat e não realizar merge/cutover.

**Resultado:** revisão estrutural da versão **realmente instalada** `PROVEN`, lacunas exatas `FACT`; casos em que o risco ocorreu `UNKNOWN`; L1/N2–N3 `HOLD`. A correção de recuperação do projetor segue em laboratório, separada da captura de observações.

## Checkpoint adicional: distribuição das 250 datas e correção de fuso

**Leitura somente dos metadados de `state/reader-watch-checkpoint-v1.json` em 05/11; nenhuma identidade ou nota de pedido exportada:** 250 entradas; 31 contêm no campo `last_seen_order_time` o prefixo de data `2026-11-03`, e 219 o prefixo `2026-11-04`. Todas as 250 possuem timestamps `yyyy-MM-ddTHH:mm:ss.fffffff` **SEM offset/Z**, por exemplo a primeira abertura por ordem de tempo está entre 03/11 21:05:14 e a última em **04/11 22:59:00 no relógio textual da origem**. Nenhuma data começa com `2026-11-05` no snapshot (não se esperam, necessariamente, pedidos após meia-noite). Todas têm hash de formato hexadecimal e emitted_hash == snapshot_hash, o que prova autoconsistência de checkpoint, NÃO pedidos ativos nem cobertura total.

**Correção de análise:** uma conversão inicial com `Date.parse` tratou o horário sem fuso como se estivesse em UTC e apresentou a última abertura incorretamente às `19h59` no fuso de São Paulo. O texto do banco **não** traz fuso; o valor bruto correto é `22:59`. Não usar essa conversão para calcular frescor até obter evidência da origem. A própria biblioteca já versionada em `runtime/reporting/tata_source_time_v1.cjs` exige `sourceTimePolicy` explícita, amarrada a `unitId`, `sourceUnitId`, `sourceStoreId` e `evidenceRef`, para converter horário local sem offset; sem isso, devolve `EXPLICIT_SOURCE_TIMEZONE_REQUIRED`. **A biblioteca já protege o produto desse erro**, portanto não criar conversor novo.

**Gates:** ausência de datas em 05/11 no checkpoint não significa falha do Reader; a última abertura textual de 04/11 22:59 é compatível com o encerramento do jantar, mas o vínculo com horário real local e cobertura de todas as comandas ainda é UNKNOWN. Não inferir origem/fuso do relógio do runner, do ChatGPT ou do Windows. `N2` e `N3` permanecem HOLD.

