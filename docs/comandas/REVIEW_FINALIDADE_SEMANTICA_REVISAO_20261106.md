# Conferência — revisão estável não atesta conclusão da aplicação (06/11/2026)

**Escopo:** somente código no GitHub e testes com dados fictícios. PR #140, branch `audit/comandas-v715-direct-itaim-scope-lab-20261106`. Nenhuma leitura nova no caixa, SQL, serviço, impressão, Xiaomi, pedido ou identidade real.

## Fato verificável no código atual

- Reader V2: `tools/tata_reader_continuous_watch_v2_canonical_candidate_REVIEW_ONLY.ps1` acumula `stable_count` com repetição de `snapshot_hash` (linhas 431–450) e emite `ready_for_downstream_shadow` quando o serviço não apresenta bloqueadores (linhas 453–467). **Isto não equivale a ACK do aplicativo nem a confirmação de que todas as notas/linhas foram gravadas.**
- Consumidor V7.14 / V7.15: `ready` é calculado pela ausência de bloqueadores de regras sobre a **revisão observada**. Não recebe comprovante externo de encerramento da escrita da revisão.
- Replay do Delivery OS `runtime/reporting/native_reader_shadow_replay_v1.cjs` já preserva `nativeLifecycleSemanticsProven=false`, `ordersPublishable=0` e `operationalEventEmissionAuthorized=false`. Não promove pedidos.
- Conferência `tools/conference_only_from_sanitized_v1.cjs` já garante `operational_ready=false`, `physical_print_authorized=false`, `escpos_bytes=0`, inclusive quando a representação virtual é coerente.
- A descrição `NATIVE_CONTENT_PROVEN` no motor de replay significa coerência do **conteúdo presente naquele snapshot**; **não** é prova de que outra observação, revisão ou cancelamento não será gravado depois. `SHADOW_PAIR_REPLAYED` significa reprodução isolada, não pedido pronto para operação.

## Alteração de proteção da candidata V7.15, sem instalação

No `runtime/shadow/live_shadow_consumer_v2_candidate_v715_REVIEW_ONLY.cjs` o resultado de cálculo sombra mantém `ready` com semântica histórica, mas inclui explicitamente os campos constantes:
- `native_business_finality_proven=false`
- `native_revision_complete_proven=false`
- `operational_ready=false`
- `physical_print_authorized=false`

Eles permanecem falsos mesmo se o evento carregar alegações próprias de ACK, disponibilidade, prontidão ou impressão, ou se o estado nativo for `3`, `P` ou `X`. Isso é **defesa contra promoção indevida**, não obtenção de prova N2-B.

## Limites e próximo gate de maior valor

N2-A (consistência de snapshot SQL) e N2-B (completude semântica dos registros pela aplicação) são **provas independentes**. `StablePolls`, transação `SERIALIZABLE`, hash idêntico, nome da fonte `DLV_IFO`, número fiscal, horário e estado nativo sem mapeamento independente não bastam. A prova ainda em falta é um recibo ou fronteira observável da aplicação, vinculado **à mesma chave e revisão**, que demonstre disponibilidade final de itens e observações para a praça.

A documentação já versionada `docs/execution/DELIVERYOS_L1_N2_SQL_SNAPSHOT_VS_APP_COMPLETION_20261106.md` contém o contraexemplo de nota adicionada depois de múltiplas leituras idênticas. **Não repetir** esse mesmo cenário fingindo que mais testes criariam fonte de autoridade.

Sem evidência nativa independente, **`BUSINESS_FINALITY=UNKNOWN/HOLD`**, `HOME/PRINT/CUTOVER=HOLD`, Etapa 3 em progresso, Etapa 4 não autorizada. Censo passivo do papel natural continua uma linha de observação já aprovada no escopo anterior, ainda sem resultado verificado. Não consultar fornecedor nem ativar instrumentos no caixa.
