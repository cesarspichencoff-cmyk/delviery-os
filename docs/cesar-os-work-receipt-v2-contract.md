# CÉSAR OS / DeliveryOS — contrato candidato de recibo com procedência (v2)

**Status: SPEC / NOT DEPLOYED.** Este documento não autoriza nem executa migração D1, gravação, cron ou promoção do consumidor. Endpoints v1 implantados permanecem compatíveis com seus clientes existentes.

## Motivo
O recibo privado v1 (`source_ingestion_receipts`) comprova somente `(source_id,batch_id)`, número de itens e cobertura. Não contém `snapshot_sha256` e não demonstra qual snapshot do arquivo histórico originou o lote. Um consumidor com cursor não pode inferir esse hash de um recibo antigo ou da contagem.

## Fronteira de confiança e dados de procedência
1. O leitor de arquivos confiável obtém os bytes da branch fixa `cesar-os-ci-snapshots` no repositório público fixo `cesarspichencoff-cmyk/delviery-os`, verifica proprietário e repositório (`292320191` e `1279837591`) e obtém `path`, SHA do blob Git e bytes reais. Nenhum caminho fornecido por usuário é aceito.
2. O leitor verifica SHA do blob Git (`SHA1('blob '+size+'\\0'+bytes)`), JSON e janela de cobertura, mantém `SOURCE_CLAIM`, `possible_commitment=false`, não armazena payload bruto.
3. **Algoritmo definido:** `snapshot_sha256 = SHA-256(bytes exatos do blob Git verificado)`. O leitor obtém esses bytes na branch fixa, verifica SHA-1 Git (`blob <size>\\0<bytes>`), valida JSON e calcula SHA-256 dos mesmos bytes. Nunca recalcula o hash serializando novamente o objeto JSON. O PR #61 agora propaga `rawBytes` verificados pela descoberta e valida novamente antes de planejar o cursor. Node e Python podem calcular SHA-256 diretamente sobre os mesmos bytes, sem divergência de serialização.
4. O atestado contém AMBOS `git_blob_sha` (SHA-1 Git dos bytes reais) e `snapshot_sha256` (SHA-256 dos mesmos bytes reais). O consumidor só admite v2 com `archive_path`, dois digests e contagens idênticos aos valores recuperados da fonte pública.
5. O leitor transmite um atestado restrito pela ligação interna do Worker privado, não como um campo de autoria humana. O runtime privado valida `(source_id,batch_id,archive_path,hash,record_count)` e as observações normalizadas antes de qualquer escrita. O cabeçalho identificador da ligação não é uma assinatura criptográfica: o isolamento/autorização efetivos do Worker devem ser inspecionados.
6. O runtime faz a admissão das observações e do recibo atestado em **uma transação D1**. Gravar recibo em etapas separadas não prova atomicidade. Se fonte/lote preexistir com outro hash, responder `BATCH_CONTENT_CONFLICT`, sem reescrever o recibo nem admitir novo compromisso.
7. O endpoint interno `/internal/work-ci/receipt?batch_id=...` v2 faz leitura fixa por fonte e lote e devolve apenas `schema`, `status`, `source_id`, `batch_id`, `archive_path`, `snapshot_sha256`, `git_blob_sha`, `archive_verification`, `receipt_id`, `items_seen`, `items_new`, `items_deduped`, `coverage_status`, `external_effect_authorized:false`.
8. `archive_verification='TRUSTED_SOURCE_REVALIDATED_AT_INGEST'` só pode ser emitido se a revalidação real ocorreu antes da transação. Um booleano ou string fornecido pelo solicitante não é prova. Recibos antigos sem atestado devem retornar `LEGACY_UNATTESTED` ou permanecer v1, sem preencher o hash retrospectivamente.
9. Para um arquivo histórico com `record_count=0`, não fabricar recibo de ingestão; avanço eventual de cursor de evidência depende de verificação do próprio arquivo, sem afirmar conclusão operacional.

## Regra adicional: integridade de bytes ≠ procedência autenticada
- `attestationFromArchiveBytes()` foi implementada como verificação local do arquivo. Ela retorna **`BYTES_VALIDATED_ORIGIN_UNCONFIRMED`**, nunca a marca de origem confiável.
- A função de decisão de admissão compara novamente caminho, quantidade, SHA Git e SHA-256 aos bytes apresentados e não realiza escrita. Um candidato literal com `TRUSTED_SOURCE_REVALIDATED_AT_INGEST` só poderá ser aceito por um **serviço de origem realmente autorizado**, depois de buscar o arquivo no GitHub com repositório, branch e blob fixados. Ainda não existe essa ponte de produção.
- A marca confiável na futura resposta privada exige duas provas separadas: fetch GitHub autenticado no serviço de origem e commit atômico privado com recibo. O fato de uma string carregar a marca não constitui essas provas.
## Validações obrigatórias e provas
- Capturar vetores de teste com JSON simples, Unicode, escaping, números, ordem de propriedades e snapshots reais. Verificar byte a byte compatibilidade Node/Python se for usada serialização canônica.
- Testar arquivo com SHA Git correto/errado, identidade trocada, replay com lote existente e hash idêntico, replay com hash divergente, commit parcial, concorrência e falhas de rollback em D1 isolado.
- Testar que `v1` nunca é aceito por `commitAfterReceipts()` do PR #61. Somente `v2` validado deve liberar o CAS do cursor.
- Provar recepção REAL de novo lote e leitura posterior de recibo v2 em Cloudflare, com novo lote e contagens de compromissos inalteradas, antes de autorizar cron.
- Medir custo/latência e provar preservação de Gmail, Calendar, Outlook, Zapia e ActivityWatch.

## Estado observável nesta revisão
- **CODE_READY candidato**: trava do PR #61 rejeita v1, aceita v2 com path, contagem e impressão digital verificadas via leitor confiável simulado.
- **NÃO EXISTE** origem v2 implantada, rota D1 transacional comprovada nem recebimento automático de arquivo pelo produtor em execução nova.
- Não há base para promover PR #61 nem ativar atualização automática somente com testes simulados.