# Delivery OS Itaim — Reader V2 instalado → Copiloto sem reiniciar watcher (04/11/2026)

**Decisão técnica e limite:** manter o serviço Reader real já instalado sem alteração. Uma opção de leitura **apenas em memória, desligada por padrão** reconcilia digest SHA legado maiúsculo somente quando `snapshotHash(order)` recalculado com o algoritmo canônico do consumidor coincide exatamente. Isso NÃO constitui prova de revisão transacional atômica, nem de pronto físico, nem autorização para publicar dados no Home.

## Evidência atual, preservando outras auditorias

- PR #135, `docs/comandas/ITAIM_REAL_READER_SQL_SOURCE_PROOF_20261104.md`: auditoria administrativa independente realizada no CAIXA_MOOCA, sem mudanças no SQL/serviço; **sessão SQL de `NT SERVICE\\TataComandaReader` comprovada**, worker realmente instalado V2 com supervisor e pin SHA, leitura nativa de observações, `RCSI=OFF`, `SNAPSHOT=OFF`, `READ COMMITTED`, sem `rowversion` nas quatro tabelas inspecionadas. O watcher V1 instalado é **supervisor**, não fonte SQL principal. Não repetir consultas e não pedir novas ACLs. Nenhum acesso à conta administrativa significa autoria operacional de pedidos.
- O V2 instalado lê quatro campos de observações e emite `observation_scan_complete` por autodeclaração; sem prova independente de snapshot, a completude física das revisões continua `UNKNOWN`.
- 250 chaves distintas foram agregadas na leitura administrativa do checkpoint, todas com SHA maiúsculo e `emitted_hash=snapshot_hash`; não é inventário ativo. A auditoria separada da PR #135 verificou 100/100 amostras recentes e 240/240 amostras históricas com hash canônico igual **depois de normalização estritamente validada**; amostras podem se sobrepor. Nenhuma encontrou nota com apóstrofo. A serialização PowerShell antiga pode divergir da de Node com caracteres especiais; um mero `.toLowerCase()` sem recomputar **é proibido**.
- PR #135 também tem candidata de atualização do MESMO watcher: `tools/tata_reader_continuous_watch_v2_canonical_candidate_REVIEW_ONLY.ps1` e `docs/comandas/READER_V2_CANONICAL_CANDIDATE_ROLLOUT_GATE_20261104.md`. O código é review-only e **bloqueia o caixa e checkpoints antigos**. Evitar uma migração arriscada enquanto uma ponte em memória suficiente puder ser demonstrada.

## Reuso e implementação somente na PR #137

1. **Nova função pura mínima** `runtime/reporting/native_reader_verified_legacy_hash_v1.cjs`: reusa o `snapshotHash` **já existente** em `native_reader_shadow_replay_v1.cjs`. Somente aceita entrada de hash hexadecimal uniforme lower/upper se seu valor convertido para lower coincidir **integralmente** com hash canônico recomputado sobre o objeto de origem. Se divergir, devolve `HOLD` e não fornece evento. Não altera objeto de origem, arquivo, checkpoint nem gera evento.
2. **Porta já existente** `runtime/reporting/copiloto_tata_file_feed_v1.cjs`: continua a checar o evento ORIGINAL contra o checkpoint ORIGINAL **antes** da normalização. Reusa depois `adaptStableTataOrderV1`, que por sua vez usa `native_reader_producer_contract_review_v1.cjs` e exige `observation_scan_complete=true`, linhas de observação, itens/identidade e digest canônico. Se qualquer campo falhar, a revisão corrente fica indisponível, sem fallback indevido.
3. **Opt-in estrito de configuração privilegiada** `scope.allowVerifiedLegacyUppercase===true` permite a ponte apenas com `selection='checkpoint'`, `sourceMode='real'`, unidade `ITAIM`, origem `0001/01`. Valor ausente `false` permanece comportamento anterior; tipo incorreto, outra loja, modo controle ou leitura de diretório são recusados. Nenhuma rota HTTP pública, deploy, instalação ou habilitação foi feita. Esse sinal **não deve ser derivado da requisição do navegador**.
4. A projeção continua explicitando `live_source_verified=false`, `operational_order_total=null`, `ready_for_dispatch=null` e ciclo KDS `UNKNOWN`; campos de texto de observações não entram no read model resumido do Copiloto. Não confundir `source_mode:'real'` — um rótulo do chamador — com autenticação de origem real.

## Provas executadas

**Foxxy, branch PR #137 em worktree destacado, dados exclusivamente fictícios:**
- `tests/tata-reader/run-real-feed-boundary-tests.cjs`: **11/11 PASS**; inclui digest legado validado sem alterar checkpoint/arquivo, opt-in desligado por padrão, exceções de outra loja/modo, nota adulterada, linha incompleta, hash conflitante, pronto e live sempre desconhecidos.
- `run-copilot-reader-adapter-tests.cjs`: **21/21 PASS**.
- `run-native-reader-producer-contract-review-tests.cjs`: **27/27 PASS**.
- `run-native-reader-shadow-replay-tests.cjs`: **48/48 PASS**.
- A suite `run-file-feed-tests.cjs` no Foxxy parou ao tentar criar um symlink de teste (EPERM do Windows); **não** foi alterada a permissão do host. O CI Linux foi usado para provar esse caso.

**GitHub Actions, run 41780271973, commit `ff302d20e1db22a4b3e06f857a78583ff6e7ba10`: `completed/success` para jobs Linux e Windows.** Os logs do job Linux confirmam `COPILOTO_REAL_CHECKPOINT_BOUNDARY_PASS 11/11 SYNTHETIC_ONLY` e `TATA_FILE_FEED_PASS 19`, além do adaptador 21, revisor 27, observer 42, pair 40 e readiness 53. Nenhuma credencial, SQL, pedido de cliente, restaurante, impressora ou GPS foi usado nesses testes.

## O que exatamente ainda impede lançamento

1. **Fonte nativa atômica por pedido:** o SQL atual tem `RCSI OFF/SNAPSHOT OFF`; um SHA autocoerente não comprova que cabeçalho, itens e notas vieram da mesma revisão sob concorrência. Encontrar e ensaiar em isolamento **mecanismo não invasivo** de leitura consistente, com custo/timeout e plano de abortar antes de qualquer SQL sob carga. Não ativar recursos globais do banco, nem bloqueios potencialmente longos no POS sem autorização/prova.
2. **Conformidade de captura:** a seleção V2 usa `DLV[_]% ` mais amplo; leitor Copiloto deve aceitar somente `DLV_IFO`. A candidata V2 da PR #135 restringe o filtro, mas **não foi implantada**. A cobertura atual de 250 revisões no checkpoint não equivale a todos os pedidos ainda abertos; não pintar total de pedidos como conhecido.
3. **Estados de pronto nas praças:** a origem entrega itens, mas não contém ato físico conclusivo por estação. Reusar `produtor-trabalho-praca.ts`, `projetar-leitura.ts` e recibos Entregas/conferência já existentes; não equiparar P/3/X, impressão ou `ready_order` com pronto físico.
4. **Home e dispositivos:** ligar essas leituras qualificadas à Operação Viva (único Foco) e à Home original; nenhuma etapa desta ponte libera `/copiloto` Shadow como substituto visual. Testar campo Xiaomi/iPhone, turno e rollback somente após fonte provada.

**Prioridade de continuidade:** tentar primeiro a rota **read-only, sem substituição** da fonte, pois ela elimina migração de 250 hashes como dependência da leitura diagnóstica. Só considerar rollout da candidata V2 se dados de produção exigirem atualização na origem e houver prova de migração/restart controlados. Nunca confundir `LAB_PASS` com `WORLD_PROVEN`.

**Efeitos:** `SQL_REAL_EXECUTADO_NESTA_IMPLEMENTACAO=NO`; `ALTER_DB=NO`; `WINDOWS_SERVICE_MODIFIED=NO`; `CHECKPOINT_PRODUCAO_MODIFIED=NO`; `PRINT=NO`; `DEPLOY=NO`; `LIVE_HOME=HOLD`; `PROVEN=LAB_ONLY`.
