---
lifecycle:
  artefato: docs/etapa-4-8/Q015-RETENCAO.md
  status: ACTIVE
  authority_scope: q015_retencao_intelligence_spine
  superseded_by: null
  atualizado_em: "2026-09-30"
  state_basis: d1aade5
  question_refs: ["Q-015"]
---

# Q-015 — retenção da Intelligence Spine

Estado da decisão: **ANSWERED por César em 2026-09-30.**

Estado da implementação: **CODE_READY + TEST_PASS local.** O runtime Docker/volume nomeado e backup fora do host ainda não são WORLD_PROVEN; por isso a Spine continua desligada por padrão e o código recusa ligá-la em `pilot`/`production`.

## 1. Decisão aprovada

- execução da Spine em intervalo próprio de **60 s**, separada do tick operacional de 1 s;
- `live_cycle_runs`: **7 dias**;
- `live_observations` + `conference_clock_events`: nunca apagar por idade enquanto o pedido não estiver comprovadamente terminal; após `completed`/`cancelled`, **30 dias**;
- `copilot_recommendations`: propostas permanecem; estados terminais/decisões humanas ficam por **90 dias**;
- `real`, `simulated` e `control` nunca compartilham diretório de escopo;
- retenção ambígua falha para o lado de **preservar**, nunca para apagar.

## 2. Gap que originou a Q-015

A medição anterior da cadeia `memoryOnly` foi ~344 B por passada por escopo. A 1 tick/s, isso equivalia a ~28,3 MiB/dia por escopo sem teto. A leitura vigente já era limitada, mas o histórico próprio da Spine não sobrevivia a restart.

Com intervalo próprio de 60 s, o crescimento bruto equivalente cai para ~0,47 MiB/dia por escopo antes de compactação.

## 3. Arquitetura implementada

Não foi criada tabela nem um segundo store.

- o store continua sendo `src/conference-brain/storage/store.js`;
- `platform.event_log` continua sendo a verdade durável dos fatos da plataforma;
- a Spine recebe `DELIVERYOS_INTELLIGENCE_DIR` apenas quando habilitada;
- o diretório é particionado por `source_mode + unit_id + hash`;
- no boot de cada escopo são carregados `live_cycle_runs`, `live_observations`, `conference_clock_events` e `copilot_recommendations`;
- recomendações são persistidas por `paraRegistro` no store existente e reconstruídas por `deRegistro`; nenhuma escrita direta por `fs` existe na Spine;
- `terminal_at` foi acrescentado ao contrato durável para que 90 dias tenham um instante real; legado sem esse carimbo é preservado até ser reavaliado;
- a composição prepara `intelligence-data` para o assíncrono, mas a flag continua `false` por padrão.
## 4. Compactação

O store mantém escrita normal append-only. A Q-015 acrescentou `rewrite()` exclusivamente para retenção/compactação:

- valida todos os registros antes da troca;
- escreve arquivo temporário;
- relê e valida o temporário com o mesmo schema/chave natural;
- troca por `rename` somente depois da conferência;
- falha de compactação fica contida na Spine e não revisa o resultado operacional.

A compactação da Spine roda no máximo uma vez por hora.

## 5. Regras de retenção implementadas

### Ciclos de saúde
`live_cycle_runs` com `finished_at`/`started_at` anterior a 7 dias sai. Timestamp ausente/inválido é preservado.

### Pedido
O último `live_observation.status` governa a decisão. Só `completed` e `cancelled` são terminais. Se o último estado terminal tiver mais de 30 dias, saem as observações e os eventos de relógio daquele pedido. Pedido ativo, desconhecido ou ambíguo permanece independentemente da idade.

### Recomendações
`proposed` permanece. `expired`, `dismissed`, `invalidated` e `accepted_for_future` só saem após 90 dias de `terminal_at`. Registro terminal legado sem `terminal_at` permanece.

## 6. Backup e restore

Foram implementados:

- snapshot para diretório temporário e promoção por rename;
- manifest `deliveryos-intelligence-backup@1.0.0`;
- tamanho + SHA-256 por arquivo;
- recusa de conjunto de arquivos divergente ou hash inválido;
- 14 snapshots locais por padrão;
- restore somente para destino inexistente/vazio;
- serviço `deliveryos-intelligence-backup` sem rede, em profile `intelligence`;
- serviço `deliveryos-intelligence-restore` sem rede, em profile `maintenance`.

O binário compilado foi exercitado em 2026-09-30: snapshot → restore → **SHA-256 idêntico**. A suíte Q-015 também restaura uma recomendação `dismissed` e prova que a mesma conclusão continua `dismissed`, sem ressuscitar como `proposed`.

Limite: os dois volumes locais ainda podem ser perdidos junto com o host. Antes de habilitar fora de `local`, falta provar cópia fora do host ou outra proteção equivalente. Nenhum gasto foi criado por esta implementação.

## 7. Fecho técnico local — 2026-09-30

- `test:platform:q015`: **13/13 PASS**, incluindo retenção de evidência referenciada e bloqueio de compactação quando há quarentena;
- `npm run build`: **PASS** (`tsc`);
- Intelligence Spine: **29/29 PASS**;
- Copiloto shadow: **40/40 PASS**;
- suíte adversarial da Spine: **31/31 mutações detectadas, 0 cegas**;
- binário compilado `intelligence-backup.js`: snapshot → restore com **SHA-256 idêntico**;
- `compose.platform.yaml`: parse YAML válido, 8 serviços e 4 volumes, incluindo `intelligence-data` e `intelligence-backups`;
- `docker compose config`: **BLOCKED_BY_ENV** — Docker CLI indisponível no Windows e no WSL desta sessão;
- gate `run-spine-process-tests.ts` com PostgreSQL real: alcançou o servidor, mas ficou **BLOCKED_BY_PERMISSION** (`42501`, papel do laboratório sem `CREATEDB`).

Correções adversariais acrescentadas durante a auditoria:

- recomendação preservada fixa `live_cycle_run`, `live_observation` e `conference_clock_event` que referencia, evitando evidência pendente;
- `rewrite()` recusa compactar entidade que carregou linha corrompida ou inválida; quarentena nunca é apagada pela retenção;
- arquivo temporário da compactação recebe `fsync` antes do `rename`.

Fronteira final: **CODE_READY + TEST_PASS local**. Não é `DEPLOYED`, `WORLD_PROVEN` nem autorização para ligar a Spine fora de `local`.