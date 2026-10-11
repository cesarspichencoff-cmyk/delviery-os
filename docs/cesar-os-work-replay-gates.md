# CÉSAR OS / DeliveryOS — Release gates for public CI replay

**REVIEW ONLY.** No production deploy, Cloudflare D1 migration, Cron, human-commitment admission, or paid service is authorized by this document.

## Scope and chain
- Producer PR #58: create-only time-addressed GitHub CI archive, plus legacy latest.json.
- Consumer PR #61: stacked on #58, read-only replay planner, bounded reconciliation and candidate durable cursor adapter.
- Exact source: cesarspichencoff-cmyk/delviery-os, repository ID 1279837591, owner ID 292320191. SOURCE_CLAIM only; no raw payload or commitments.

## Required gates before any production promotion
1. Review producer archive semantics, Git blob SHA, collision behavior and backwards compatibility. The archive is append-only **by code contract**, not immutable against repository administrators.
2. Verify the first real archival GitHub workflow run, including 404/403/429/5xx and complete proof of exactly one historical file and the latest pointer. Current workflow is manual-only.
3. Verify discovery of archives across UTC day boundaries. Missing directory or uncovered interval means UNKNOWN/GAPS_DETECTED; never infer an empty window or continuous source coverage.
4. Measure API cost/rate impact: a seven-day horizon can cause up to eight daily listings + 200 file reads + 20 run reconciliation reads = **228 GitHub API GETs per replay cycle**. This is an upper bound, not a measured rate. Do not schedule hourly without caching/rate-budget tests.
5. Verify candidate D1 cursor table migration on isolated DB with backup, access boundaries and compare-and-swap collisions. It has NOT been deployed.
6. Keep discovery cursor distinct from ingestion acknowledgement: a cursor revision is not proof that observations were written. Require an exact source-ingestion receipt before advancing any ingestion cursor; design atomicity/idempotence across cursor and receipts.
7. Reconcile lifecycle via bounded GitHub Actions run GETs; verify repo/owner IDs, monotonicity, same-timestamp contradictions, pagination/rotation. A completed run is still a source claim, not a human commitment.
8. Preserve rollback and regressions for Gmail, Calendar, Outlook, Zapia, ActivityWatch and existing bridge/private Workers.
9. Refresh any static snapshot older than 90 minutes before a new ingestion. Never retry an OpenAI security-blocked POST through an equivalent route.
10. Only with separate authorized promotion and end-to-end world proof discuss recurring GitHub dispatch, DELIVERYOS_WORK_ENABLED and INGEST_ENABLED; remain OFF otherwise.

## Proof boundary
- Historical local evidence: 48/48 Node tests PASS no Foxxy em fase anterior. Agora existe CI remoto no GitHub: a rodada 2026-10-10T23:51Z comprovou **79/79 Node + 6/6 SQLite**, com leitura do arquivo histórico público, ainda sem D1 privado.
- O produtor foi mesclado na main pelo PR #58 (`be84a0d651c545295a5db2c8c7452694bb9f6f30`) e seu workflow continua MANUAL. O consumidor PR #61 permanece DRAFT/NOT MERGED. Cloudflare privado/D1 e agendamentos recorrentes NÃO foram alterados neste ciclo.
- WORLD_PROVEN de leitura limitada: arquivo histórico semeado manualmente foi consultado pela API real GitHub, com duas execuções e uma atualização tardia. NÃO comprovados: publicação automática pelo produtor, replay no D1, recibo v2 autenticado, transação privada, continuidade completa, novo lote INGESTED.
- The 16 previously imported WORK observations are distinct from this unreleased consumer. Avoid DONE/10/10 without these gates.
## Receipt-gated cursor addition (review only)
- `replay-ack-gate.mjs` requires a one-to-one normalization intent for each newly discovered archive and a matching private receipt (`PROCESSED`, `source_id`, `batch_id`, exact count, new+deduped count, coverage, receipt ID).
- Invalid, missing, duplicate or conflicting receipts block cursor advancement; concurrent CAS conflicts do not claim success.
- Caller-supplied receipt reader MUST be a trusted service binding in production; **tests use fake readers and memory store**. No private D1 migration or read/write was performed by this PR.
- This addresses only the logical commit guard; it is NOT end-to-end exactly-once proof or permission to enable recurring collection.


## Oct 10 real proof, after producer promotion
- Producer PR #58 merged to protected `main` at `be84a0d651c545295a5db2c8c7452694bb9f6f30`; public snapshot workflow remains `workflow_dispatch` only (no cron).
- A manual one-time archive fixture was created from the ALREADY-PUBLIC `latest.json` under `ci-snapshots/deliveryos/archive/2026/10/10/20261010T204645627Z.json` on the dedicated snapshot branch. GitHub readback confirmed exact same blob SHA `1b7963fdab69be502b88c9f0864277d5be96cb47` and two rows. This is **NOT** evidence that the producer automatically archived a snapshot.
- GitHub Actions real PR review run `38094232779`, job `114336703201`: 54/54 Node tests, real archive API reading, two GitHub run GETs, one late lifecycle update, zero missing runs, zero coverage gaps in the bounded historical hour. A current time slice without relevant archives was truthfully flagged `GAPS_DETECTED`.
- Later checks on the main-synchronized child PR and Python SQLite validation passed: 54 Node tests, 3 SQLite tests, and the same real read-only smoke. SQLite confirms CAS conflict semantics and restricted schema; REAL D1 unchanged.
- PR #61 is now based on `main` and remains DRAFT. Only the producer is merged. Its PR checks are read-only and event-driven on PRs, not schedule triggers.

## Blocking incompatibility — receipt fingerprint
- `replay-ack-gate.mjs` now requires each nonempty archive's exact count and SHA-256 digest to match a trusted receipt before cursor advancement. The CURRENT deployed private receipt GET v1 does **not** return `snapshot_sha256`. The candidate therefore **must NOT** be wired to production until ingestion metadata and service-bound receipt v2 convey a verified digest, with read-after-write testing and idempotence. No fake digest or client-supplied assertion may replace this.
- A fully validated zero-record historical file is evidence, not a D1 ingestion: it advances only the proposed evidence cursor without fabricating an ingestion receipt.
- Historic probe is fixed to a known manually seeded archive, so it tests that archive only, not all windows or the producer's live publishing behavior.

## Current hard blocks
- Prior Cloudflare D1 write POST was stopped by tool security; do not repeat equivalent route or bypass it. The new ingestion remains NOT PROVEN.
- Existing producer cannot be marked WORLD_PROVEN for automatic archive creation until one manually dispatched production GitHub Action writes a genuinely new archive and its latest pointer. Do not fake the action.
- No schedule or producer auto-run, Cloudflare D1 migration or bridge ingestion activation by these PRs.
## Fase 28: requisitos de autenticação e teto gratuito (2026-10-10)
- O consumidor exige SHA-256 dos bytes exatos do arquivo mais SHA do blob Git, caminho e contagem idênticos, mas **não recebe ainda recibo v2 da produção**.
- O protótipo `attestationFromArchiveBytes` valida bytes sem autenticar a origem e emite `BYTES_VALIDATED_ORIGIN_UNCONFIRMED`; não é autorização de escrita.
- `d1-bulk-plan.mjs` agrupa até 100 observações em 25 INSERTs de até 84 parâmetros, reserva cinco statements adicionais e testa 100 inserções, replay e rollback em SQLite isolado, nunca D1 real.
- O normalizador privado calcula `observation_id` por SHA-256 de fonte+ref+fingerprint; o agrupador valida essa identidade, WORK/SOURCE_CLAIM e metadados com até 4096 bytes, rejeitando payload bruto/credenciais.
- GitHub Actions mais recente verificado: **79/79 Node + 6/6 SQLite** e ambos checks PASS, commit de código `00205e1094f555fee00411a9481b36cccaa052cc`. Changes posteriores são documentação, ainda precisam dos checks de sua própria HEAD para prova final.
- Limites oficiais D1: 50 consultas/Worker no Free, 100 bind params/query. Link: https://developers.cloudflare.com/d1/platform/limits/ ; atomicidade de D1.batch: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch .
- Não mesclar PR #61, nem migrar D1, nem ligar cron antes de provados origem autenticada, recibo e cursor transacionais no ambiente real.
