# TATÁ Comandas — disposição pontual de observação geral (03/11/2026)

**Autorização humana:** César confirmou, nesta conversa, a classificação de **uma** observação geral do par já exportado no CAIXA_MOOCA como metadado financeiro não destinado à produção. **Decisão:** preservar integralmente `DSOBSCOMANDA` no evento, decisão e registro original; excluí-la **somente das visualizações virtuais** Cozinha, Sushi e Conferência. A autorização NÃO se aplica a outro pedido, revisão, texto, nota de item, impressora ou ao sistema de produção.

## Segurança de escopo e origem

A cadeia de replay agora aceita, opcionalmente, `note_disposition_claim` em memória. Esse registro privado precisa conter ação `EXCLUDE_FROM_PRODUCTION_TICKETS`, classe `NON_PRODUCTION_SENSITIVE_PAYMENT_CANCEL_METADATA`, escopo `SHADOW_VIEW_ONLY`, campo `DSOBSCOMANDA` e referência humana explícita. Exige identidade exata da chave forte, hash do snapshot, fingerprint da decisão, SHA-256 do conteúdo da nota e SHA-256 **dos bytes originais dos dois arquivos exportados**. Apenas uma observação geral, com vínculo nativo verificado e equivalência entre evento, decisão e junção, pode ser excluída das vistas virtuais.

**Nenhuma classificação automática por palavras como "PAGO" ou "PIX".** Outros textos, outra revisão, mudança de valor, fonte ou arquivo, falta de revisão humana ou claim alterado seguem `HOLD`. O registro de decisão **não é assinatura digital, não autentica por si a identidade do operador** e nunca autoriza impressão, sequência ou disponibilização ao serviço. A autoridade humana nesta conversa sustenta somente este teste pontual. É proibido interpretar `EXCLUDED_FOR_SHADOW_ONLY` como permissão operacional.

O `tools/comandas_shadow_offline_run_v1.cjs` usa os dois arquivos já capturados e opcionalmente um terceiro arquivo privado de decisão. Valida os hashes antes de avaliar o pedido. A saída sanitizada indica `note_excluded_in_shadow_only` e `human_approval_cryptographically_authenticated:false`; não inclui o texto confidencial. O gerador da decisão privada, quando utilizado, não é acionado pelo runtime nem cria aprovação sozinho: deve refletir a decisão humana já tomada, específica do par capturado. O arquivo da decisão fica exclusivamente na pasta privada do caixa.

## Prova e fronteira

Testes Foxxy para a nova candidata: `COMANDAS_NATIVE_CHAIN_V1=29/29` (inclui aceitação só da observação exata e sete negativas), `COMANDAS_SHADOW_BUNDLE_V1=9/9` (inclui replay pareado de fixture com/sem decisão, alteração de arquivo/claim e fonte preservada), `COMANDAS_HOMOLOGATION_CANDIDATE_V1=5/5`, `COMANDAS_VIRTUAL_PAPER_V1=12/12`.

Esses testes **não são prova em produção**. Requerem CI Linux/Windows no novo HEAD e, somente então, replay da mesma amostra confidencial no próprio CAIXA usando bundle novo byte-pinado, sem alterar watcher, ACL, banco, fila, spooler, fiscal, número TATÁ ou serviço. Mesmo com L4 virtual, **L5 deve continuar HOLD** por falta da sequência atestada e comprovação independente de primeiro disparo; vias físicas permanecem proibidas.

**Não reproduzir o texto da nota nem suas quantias, identificadores ou demais conteúdo em GitHub ou relatórios.**
