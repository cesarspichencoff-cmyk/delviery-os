# CAIXA_MOOCA — pré-instalação do TATÁ Reader V2
Data local: 2026-10-09 06:26:49 -03:00
Estado: **PLAN_OK / NÃO INSTALADO / APROVAÇÃO HUMANA DO V2 PENDENTE**

## Procedência
- Branch base Claude: `feat/cloud-solo-reader-resilience-20261007` @ `cac840b0a2a92750529c824522b1dfa4f874e6e0`.
- Branch de preparo: `tmp/tata-reader-caixa-preflight-20261009`.
- V2 extraído da CAIXA, copiado **sem mudanças de texto** para `runtime/tata-reader/candidates/tata_reader_continuous_watch_candidate_v2.ps1`.
- Prova de identidade byte-exata: arquivo da CAIXA possui 23.192 bytes ASCII sem CR; o conteúdo GitHub recuperado na branch possui 23.192 bytes ASCII idênticos; SHA256 medido na CAIXA `77C16940EFCAF38E380369AD6F17FBC849C67EC191F9617C3C1EF5119DFF31F0`.

## Auditoria estática EXECUTADA NA CAIXA
Ferramenta: `runtime/tata-reader/tata_reader_watch_static_audit_v1.cjs` da branch Claude.
- `recommendation: INSTALL_ONLY_UNDER_SUPERVISOR`
- `supervisor_bounded_mode_compatible: true`
- `continuous_mode_safe: false`
- `human_review_required: true`
- Falhas conhecidas do watcher: `READER_NOT_CLOSED_IN_FINALLY`, `POLL_ERRORS_SWALLOWED_IN_CONTINUOUS_MODE`, `CONNECTION_NOT_RESET_AFTER_ERROR`.
- Não significa aprovação para instalação autônoma; revisão humana ainda obrigatória.

## Execução REAL do cutover em modo Plan (SOMENTE LEITURA)
Arquivo da branch Claude: `runtime/tata-reader/tata_reader_supervisor_cutover_v1.ps1`, executado na CAIXA com `-Mode Plan` e runtime copiado em diretório temporário isolado `C:\TATA\comanda-v1\cutover\shadow-v1\live-truth-v1\cloud-preflight-runtime`.

Veredito: `PLAN_OK` / `preflight_ok=true`.
- `service_identity_ok=true` para `NT SERVICE\TataComandaReader`.
- `candidate_sha_ok=true`, `candidate_audit_allows_supervisor=true`, `candidate_checkpoint=COMPATIBLE`, `node_present=true`, `bin_writable_by_non_admin=false`.
- Host binário real medido, serviço `Running`.
- Saúde **anterior**: `STALLED`, apesar de SCM e host `RUNNING`; razões: `CONSUMER_STATUS_SCHEMA_INVALID`, `HEARTBEAT_MISSING`, `CHECKPOINT_STALE`.
- **Sem restart, sem instalação, sem escrita de dados/permissões no SQL Server, sem print/fiscal/SEFAZ/Odhen, sem cutover.**

### Os 3 hashes que um futuro Apply exige (DEVEM SER REMEDIDOS NO MOMENTO DO APPLY)
```text
ExpectedInstalledWatcherSha256 = 149CB75C5EBC5F8A8EB4179A3F4BA97535A69A979001E085F8DF2DD16230A914
ExpectedHostBinarySha256     = 6DAEAD3C4F0B33C907A49E700A810A056C119817263D4AA59BB3B10DC99A137F
SupervisorSha256             = 2B6DC012918F317C8D244531B3CCB2FD33E33B226C6E6E668BEE4B698936BEF5
```

Outros fingerprints atuais:
- `CandidateSha256 = 77C16940EFCAF38E380369AD6F17FBC849C67EC191F9617C3C1EF5119DFF31F0`
- `CheckpointSha256 = 0356EEF2B5DE12066AF73A3A5139A009A58B512D874F6ECCFC6E0093668C2E54`

## Fronteira próxima
1. **Pessoa humana deve ler/revisar o V2 e registrar aceite.** Revisão automatizada não substitui esse gate.
2. Na janela fora do pico, revalidar hashes, processo, checkpoint, identidade e configuração efetiva.
3. Executar `Apply` somente com triple-SHA fresco e monitoramento do avanço real de polling. Código 0 = HEALTHY; 3 = rollback comprovado; 2 = interromper e assistência humana.
4. Guardar e publicar recibo sanitizado, sem PII nem IDs de pedidos, e verificar regressões de consumer/status. Não promover CI ou Plan a `WORLD_PROVEN`.

## Nota
Repositório é público; a evidência acima contém apenas hashes, nomes de componentes e estados técnicos. Não inclui dados pessoais, conteúdo de pedidos nem credenciais.
