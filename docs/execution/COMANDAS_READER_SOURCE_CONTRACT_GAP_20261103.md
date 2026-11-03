# TATÁ Comandas ↔ Delivery OS — incompatibilidade do produtor Reader identificada (03/11/2026)

**Estado:** inspeção estática de código versionado + teste offline. **Não é prova de que o script versionado corresponde aos bytes protegidos em execução no caixa.** O serviço instalado continua isolado e sem alterações.

## Diferença material comprovada em fonte

- Código da PR #135: `tools/tata_reader_continuous_watch_candidate_v1.ps1`, blob Git `8cc7415047bb982d236c1224fd9fdc1c7f1fb620`.
- No SELECT do candidato, `TEKNISA.COMANDAVEN` fornece identidade/estado, `TEKNISA.ITCOMANDAVEN` fornece linha/produto/quantidade e `PRODUTO` fornece classificação. **Não seleciona** `DSOBSCOMANDA` (pedido), `DSOBSDESCIT`, `DSOBSPEDDIGCMD` nem `TXPRODCOMVEN` (itens).
- Seu evento `deliveryos.tata-reader-stable-order-event.v1` traz `order` com cabeçalho/itens, mas **não tem** `order.observation_rows` e `order.observation_scan_complete`. O consumidor `runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs` (blob `8e75fea85437d063c2f6ee2df09ee33962d42ce6`) exige `observation_scan_complete===true` e acrescenta `OBSERVATION_SOURCE_NOT_PROVEN_COMPLETE` se ausente. O replayer da PR #137 também exige as observações completas: não presumir `[]` como ausência comprovada.
- `Hash-Text` da captura PowerShell usa `[BitConverter]::ToString(...).Replace("-","")`: retorna hex **maiúsculo**. O replayer da #137 exige `^[0-9a-f]{64}$` e compara com `snapshotHash` SHA-256 canônico em minúsculas. Converter só a caixa do hexadecimal **não prova paridade de serialização** entre `ConvertTo-Json -Compress` e `JSON.stringify`; verificar byte a byte incluindo ordem dos campos, representação de timestamps, caracteres acentuados e observações.
- A comparação anterior com revisão arquivada 9627 foi montada por adaptador em memória que adicionou `observation_scan_complete=true` e `observation_rows=[]` **para aquele ensaio**. Isso prova interoperabilidade das formas compatíveis, não prova que o watcher contínuo atual já as emite. Esta é a lacuna agora identificada.

### Prova diferencial adicional: PowerShell versus Node, somente Foxxy

Executei cinco fixtures falsas com uma estrutura de ordem e observação idêntica em PowerShell (`ConvertTo-Json -Compress`) e Node (`JSON.stringify`). Os bytes e SHA-256 coincidiram em quatro casos após normalizar a caixa do hash: ASCII, acentos, aspas duplas e barra invertida. **O caso com apóstrofo divergiu**: a serialização PowerShell escapou o apóstrofo, produzindo cinco bytes adicionais, e o hash permaneceu diferente mesmo em minúsculas. Portanto a correção superficial `ToLowerInvariant()` não é segura em qualquer texto de observação. Nenhuma revisão real foi lida. A extensão do teste do contrato agora classifica separadamente `SNAPSHOT_HASH_UPPERCASE_ONLY` e `SNAPSHOT_HASH_UPPERCASE_AND_SERIALIZATION_DIVERGENT`.

## Evidência de campos nativos já conhecida (sem SQL nesta rodada)

`tools/authorized/tata_reader_real_order_observation_probe_v1.ps1` já contém SELECT parametrizado para `TEKNISA.COMANDAVEN.DSOBSCOMANDA` e `TEKNISA.ITCOMANDAVEN.{NRPRODCOMVEN,CDPRODUTO,DSOBSDESCIT,DSOBSPEDDIGCMD,TXPRODCOMVEN}`. Isso sustenta os **nomes das colunas e a estratégia de join**, não atesta direitos correntes, cobertura, snapshots transacionais ou qualquer revisão de 03/11.

## Rota de correção mínima: aproveitar o watcher existente

1. **Antes de modificar o serviço:** comprovar a versão real do watcher por um canal aprovado (sem bypass de ACL), sua integridade, a identidade SQL efetiva, e as condições de leitura. O `GetOwner` externo respondeu acesso negado, enquanto o fonte do watcher possui verificações internas `WindowsIdentity.GetCurrent().Name` e `SUSER_SNAME()`; verificações no código não equivalem à prova de execução atual.
2. **Candidato offline:** expandir a consulta **nativa existente** para trazer observação do pedido e as três observações de cada item **na mesma captura**, mantendo o join por `CDFILIAL,CDLOJA,NRVENDAREST,NRCOMANDA` e `NRPRODCOMVEN/CDPRODUTO`, sem chamadas externas de iFood nem novo monitor/serviço.
3. **Completude:** marcar `observation_scan_complete=true` apenas após leitura integral bem-sucedida, cardinalidade única de itens, ausência de campos truncados/ambíguos, e evidência da associação exata. Em falha ou mudança de revisão, `HOLD` explícito, nunca `[]` inventado; proteger alergias e instruções sensíveis.
4. **Hash canônico:** computar `snapshot_hash` sobre os mesmos campos e mesma codificação da função `snapshotHash` usada pelo replayer e pelo Comandas; executar teste diferencial PowerShell↔Node para Unicode/observações, com hash lower-case exato, sem confiar só na conversão de caixa.
5. **Prova piloto:** ensaio isolado primeiro com pedidos fictícios e, somente depois de autorização humana específica, **uma** revisão real read-only de Itaim, com recibo de fonte, contagem de itens/observações e referência opaca, sem exportar texto ao chat. Nenhuma mutação em Teknisa, SQL, serviço, ACL ou caixa durante preparação.
6. **Saída real:** mesmo após contrato perfeito, ainda exigir fonte autenticada/fresca, ciclo de vida definido, UUID iFood independente, sequenciamento atestado e não duplicação da via de Conferência. A PR #137 mantém todas essas decisões em `HOLD`.

## Novo diagnóstico versionado

- `runtime/reporting/native_reader_producer_contract_review_v1.cjs` projeta motivo de incompatibilidade por categoria sem exportar nomes, número da comanda, código de produto, observações ou endereço. Nunca autoriza pedido ou impressão.
- `tests/reporting/run-native-reader-producer-contract-review-tests.cjs`: **27/27 PASS no Foxxy**; antigo formato sem completude = `OBSERVATION_COMPLETENESS_MISSING_OR_UNATTESTED`; hash maiúsculo = `SNAPSHOT_HASH_NOT_CANONICAL_LOWERCASE_HEX`; observação vinculada errado ou alterada = `HOLD`.
- Regressão local junto a 31 recibos, 25 timestamps, 48 replay e 53 diagnósticos = **184/184 verificações** em dados fictícios. Não afirmar cobertura GitHub CI desses novos testes sem workflow próprio.

## Política de efeitos

`SOURCE_CANDIDATE_CODE_REVIEW=PROVEN`, `INSTALLED_WATCHER_SAME_BYTES=UNKNOWN`, `NATIVE_NOTES_CAPTURED_LIVE=UNKNOWN`, `HASH_CROSS_LANGUAGE_PARITY=FAILS_FOR_APOSTROPHE_FIXTURE`, `REAL_ORDER_JOIN=UNKNOWN`, `PRINT=HOLD`.

A impressão fictícia da via Conferência foi validada por foto. A impressão noturna precisa ser tão escura quanto nítida, mas as alternativas ESC/POS continuam offline, sem alteração da impressora. Cozinha e Sushi seguem na Teknisa.

**Não** contatar Teknisa sem nova iniciativa de César; não usar credenciais não autorizadas nem executar comandos de captura SQL no caixa como atalho.
