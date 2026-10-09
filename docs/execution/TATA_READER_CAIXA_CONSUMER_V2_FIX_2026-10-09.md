# Reader TATÁ — correção de health consumer v2 (CAIXA real)
Data local: 2026-10-09
Branch: `tmp/tata-reader-caixa-preflight-20261009`
Base não alterada: `feat/cloud-solo-reader-resilience-20261007` @ `cac840b0a2a92750529c824522b1dfa4f874e6e0`.

## Descoberta / causa
Em `C:\ProgramData\TataComandaReader\evidence\shadow-consumer-status.json`, a CAIXA publica `deliveryos.live-shadow-consumer-status.v2`, com `state=RUNNING` no instante da inspeção. O avaliador Cloud reconhecia apenas `.v1`, acrescentava `CONSUMER_STATUS_SCHEMA_INVALID` e, criticamente, podia retornar **HEALTHY mesmo com o consumidor v2 FAILED ou com schema desconhecido**.

## Evidência vermelha antes da correção
Teste controlado na CAIXA (somente JS isolado; nenhum serviço tocado) com supervisor/heartbeat e checkpoint sintéticos saudáveis:
- `.v2 RUNNING`: `HEALTHY`
- `.v2 FAILED`: **`HEALTHY` indevido**
- `v999 RUNNING`: **`HEALTHY` indevido**
- assert para `.v2 FAILED => DEGRADED` falhou, comprovando o defeito.

## Mudança mínima
`runtime/tata-reader/tata_reader_health_v1.cjs`:
- aceitar os schemas conhecidos `.v1` e `.v2`;
- `FAILED` em qualquer schema conhecido degrada;
- schema não suportado passa a `DEGRADED` com razão `CONSUMER_STATUS_SCHEMA_INVALID`, jamais `HEALTHY`.
- Sem alterar SQL, watcher, supervisor, host, Android, consumer produtor ou efeito em produção.

`tests/tata-reader/run-health-tests.cjs`:
- H19 cobre `.v2 RUNNING` e `.v2 FAILED`;
- H20 cobre schema desconhecido.

## Evidência verde
- Teste dirigido CAIXA, após troca APENAS do módulo da pasta isolada `cloud-preflight-runtime`: `.v2 RUNNING => HEALTHY`, `.v2 FAILED => DEGRADED / CONSUMER_FAILED`, `v999 => DEGRADED / CONSUMER_STATUS_SCHEMA_INVALID`.
- Foxxy no worktree destacável da branch: `node tests/tata-reader/run-health-tests.cjs` **20/20 PASS, exit 0**.
- Foxxy: `npx --no-install tsc --noEmit` **exit 0**.
- CAIXA real: `tata_reader_supervisor_cutover_v1.ps1 -Mode Plan` usando runtime de preflight corrigido: **`PLAN_OK`**; `health_before=STALLED`, razões agora apenas `HEARTBEAT_MISSING`, `CHECKPOINT_STALE`; nenhum arquivo instalado/restart/alteração SQL.
- Testes `run-saude-fontes-tests.ts` no **Windows Foxxy**: **9/10**, F6 test harness subprocesso `spawnSync("npx")` retornou status `null`. `run-product-system-tests.ts` também falhou no caso de spawn `null !== 0`. Nenhum desses testes foi refeito no Linux nesta sessão; **NÃO classificá-los como PASS**. O CI anterior do Claude estava verde em Linux/Windows em outra versão, não revalida automaticamente esta branch.

## Fronteira restante
- `runtime/tata-reader/candidates/tata_reader_continuous_watch_candidate_v2.ps1` publicado com o conteúdo byte-exato da CAIXA (23.192 ASCII/LF, SHA256 local `77C16940EFCAF38E380369AD6F17FBC849C67EC191F9617C3C1EF5119DFF31F0`).
- Revisão humana do V2 é **PENDENTE**. Auditoria estática dá `INSTALL_ONLY_UNDER_SUPERVISOR`.
- `Apply` ainda **NÃO executado**. O serviço operacional não foi reiniciado, não houve implantação, sem novo `WORLD_PROVEN`.
- Revalidar 3 hashes frescos, janela fora de pico e aprovações humanas antes de instalar.
- Após eventual Apply, verificar progresso real de SQL/checkpoint/heartbeat e consumidor; em falha, rollback automático conforme o contrato.
