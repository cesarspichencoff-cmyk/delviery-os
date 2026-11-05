# Delivery OS Itaim — Gate L1 da fonte nativa (Reader ↔ TATÁ Comandas)

**Checkpoint:** 04/11/2026 BRT. **Escopo:** revisão de código e provas documentais, sem acesso ao SQL ou pedidos vivos. PR Delivery OS **#137**, branch `feat/gestor-shadow-observer-20261103`; PR TATÁ Comandas **#135**, branch `audit/comandas-native-chain-20261102`. Ambas DRAFT/HOLD, sem merge.

## 1. Decisão vinculante recuperada

O contrato de lançamento `docs/execution/DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md` exige L1→L8; para L1 (pedidos/itens/observações reais do Itaim), a **primeira opção** é reusar o Reader nativo existente, com autorização, comprovação de instalação e leitura estritamente read-only. A captura do DOM do Gestor é uma rota auxiliar de prova, **não** fonte total nem requisito para continuar estudando o Reader. Não habilitar API oficial, terceiro coletor, licença, instalação de extensão ou tarefas visíveis.

## 2. Contrato que efetivamente encaixa — e onde PARA

**Produtor puro da PR #135:** `tools/comandas_reader_native_note_rowset_v1_review_only.cjs`, lido na branch da PR #135 (Git blob `6ad65f3e0265f5312483019e9ec6eeefdab8f46f`). A partir de um *rowset sintético de uma consulta*, monta `privateEvent` com:
- schema `deliveryos.tata-reader-stable-order-event.v1`;
- `order_key=CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA`;
- `snapshot_hash` canônico SHA-256 em letras minúsculas;
- 8 campos de cabeçalho, 5 de cada item, `observation_rows` ligadas por `item_index`/`CDPRODUTO`, `observation_scan_complete=true`;
- três campos possíveis de observação por item (DSOBSDESCIT, DSOBSPEDDIGCMD, TXPRODCOMVEN) e DSOBSCOMANDA por pedido, só uma vez.
O montador **não lê SQL, arquivos nem rede**; é função pura. `source_read_exhausted=true` é apenas uma alegação de quem fornece as linhas.

**Consumidor puro da PR #137:** `runtime/reporting/native_reader_producer_contract_review_v1.cjs` (Git blob `c753ac8c16aa1266b3eba2ba478614e49fc94e85`). Valida o schema, escopo `0001/01/DLV_IFO`, 4 partes da chave, hash canônico, linhas de item sem duplicidade e observações coerentes e completas. Sempre devolve `state:HOLD`, `ordersPublishable:0`, `actualNativeSourceAuthenticated:false`, `observationScanIndependentlyProven:false`, sem exportar as observações.

**Diferença crítica de autoridade:** o candidato do produtor #135 define `ready_for_downstream_shadow=false`, `sourceAuthenticated=false` e bloqueios explícitos. O adaptador `runtime/reporting/copiloto_tata_reader_adapter_v1.cjs` da #137 exige, além da forma válida, `ready_for_downstream_shadow=true`, `blockers=[]`, resolução de serviço, `observed_at` com fuso, `effects.database_read=true` e efeitos de escrita falsos. O montador #135 **não fornece nem atesta esses fatos**; não preencher os campos artificialmente nem mudar os bloqueios para passar no adaptador.

**Fronteira extra no arquivo de leitura:** `runtime/reporting/copiloto_tata_file_feed_v1.cjs` consegue projetar revisões de um *fixture* de checkpoint, mas mantém `live_source_verified:false` e `operational_order_total:null`. O modo declarado `sourceMode:'real'` e `mappingEvidenceRef` em string não são atestação independente. O estado `observed_records` nesse modelo é observação de arquivos, **não** prova de pedidos atuais no iFood nem autorização para Home.

## 3. Bloqueio novo confirmado ao ler o manifesto da PR #135

O manifesto `docs/comandas/CANDIDATA_HOMOLOGACAO_CADEIA_NATIVA_V1.manifest.json` inclui explicitamente `file_write` para `runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs`. O próprio `docs/comandas/CANDIDATA_FINAL_HOMOLOGACAO_20261102.md` registra um **STOP vigente de 04/11/2026**: esse consumidor pode ler `C:\ProgramData\TataComandaReader\state\tata-sequence-state.json`, escrever JSON em `outPath` e expor conteúdo/observações em stdout; o piloto de copiar o manifesto inteiro para o caixa está suspenso. Este checkpoint **não autoriza contornar esse STOP**. O montador puro pode ser analisado em laboratório; o consumidor com efeitos não deve ser executado no caixa.

## 4. Próxima prova que de fato libera o caminho L1

| Gate | Prova concreta necessária | Estado |
|---|---|---|
| N1 — binário original | Verificar versão/hash, identidade e permissões do Reader **efetivamente instalado** por canal autorizado, sem contornar ACL | UNKNOWN |
| N2 — rowset | Consulta limitada, de uma revisão real do Itaim, com permissão específica, sem escrita; provar isolamento da revisão, contagem de linhas, join de itens/notas e fim real de leitura | HOLD |
| N3 — canonicalidade | Demonstrar a paridade PowerShell↔Node e hash SHA-256 no envelope real sanitizado, sem transportar texto de clientes | LAB PASS, FIELD UNKNOWN |
| N4 — autorização e frescor | Comprovar unidade/origem e horário da fonte, serviço correto, ausência de efeitos, bloqueios resolvidos por evidência independente; emitir recibo sanitizado | HOLD |
| N5 — Home | Provar só a projeção em shadow do Copiloto existente, com `live_source_verified` separado de `sourceMode`, status físico desconhecido e sem recomendação de praça não medida | HOLD |

**Próximo ato de maior valor autorizado sem efeitos:** revisão estática da lacuna Reader instalado ↔ produtor completo da PR #135; preparar um protocolo de verificação `N1` **somente de leitura** para a identidade responsável pelo serviço, sem abrir SQL, copiar dados de cliente, executar Comandas com escrita, iniciar console no caixa, alterar ACL/serviço ou acionar impressora. Se N1 não puder ser executado por um canal comprovadamente silencioso, registrar bloqueio, não inventar verificação.

## 5. Resultado e escopo preservados

- **FACT:** PR #135 já possui montador puro e testes offline de observações; PR #137 possui verificador puro de envelope com bloqueio de publicação. Não significa que produtor real e consumidor operacional estejam conectados.
- **FACT:** manifesto da candidata inteira inclui escrita de arquivos e está em STOP para piloto no caixa.
- **UNKNOWN:** bytes/identidade do watcher instalado, autenticidade/frescor do rowset, autorização do SQL, exposição de UUID iFood e prontidão física por praça.
- **PROHIBITED:** ativação, merge, deploy, instalação de novo Reader, SQL em produção, captura de clientes, alteração do Gestor, impressão, ocultação automática do Edge ou qualquer comando que possa piscar CMD/PowerShell.
- **PR #137 permanece DRAFT/HOLD**. Este documento é decisão de contrato; **não** prova de campo nem liberação da V1.
