---
lifecycle:
  artefato: docs/etapa-4-8/C1-PORT.md
  status: ACTIVE
  authority_scope: etapa_4_8_c1_port
  superseded_by: null
  atualizado_em: "2026-09-02"
  state_basis: 9e738b1
---

# C1 — Porte isolado de conversation-crm

## Origem real (correção de premissa)

A missão partiu do pressuposto de que a origem era `feature/conversation-crm-pilot-v0`. Diagnóstico
mostrou que essa branch está **desatualizada** (21 arquivos em `src/conversation-crm`, 6 em
`tools/conversation-crm` — muito aquém do que já estava portado). A origem real, confirmada por
`diff -r` byte a byte contra o conteúdo já presente no worktree, é a branch descendente:

```
fix/b2-human-reality-hotfix @ 35493273229520e5c6e7320d5ae7419597004cc1
```

## O que foi portado, em 4 commits

| # | Commit | Conteúdo |
|---|---|---|
| 1 | `7c22b8d1ef0136e633d098cebeb3bbe73d3579b4` | `apps/deliveryos-ai-node/` — 46 arquivos |
| 2 | `fe069aa1db4eb76981283048968efe1e35f7dd72` | `src/conversation-crm/` (106) + `tools/conversation-crm/` (71, incl. `public-menu-evidence.v1.json`) |
| 3 | `a82ab588ac89cee11c651d4bd553909cbf932abe` | `tests/conversation-crm/` — 73 arquivos |
| 4 | `050d3b4d311f97dbf97b402da69c3ebb13f6430f` | `config/conversation-crm/` — 5 arquivos |

Método de porte: `git show <SHA>:<path>` por arquivo, normalização CRLF→LF (mesma convenção que já
existia nos arquivos untracked encontrados no início da sessão), sem edição de conteúdo. Repositório
**não usa Git LFS** (confirmado: sem `.gitattributes`, `git lfs ls-files` vazio) — todos os blobs,
incluindo o JSON de 2.2MB, entraram como blob normal.

## Desvio de escopo registrado: `apps/deliveryos-ai-node`

Não estava nesta branch em nenhum momento — nem na base `9e738b11`, nem na `main`. É dependência
direta de 17 arquivos já presentes em `src/conversation-crm`/`tools/conversation-crm` (mais 19 em
`tests/conversation-crm`), via dois padrões de `require`:

- **Subpath direto** (superfície estreita): `dialogue/director-contract.js`,
  `dialogue/writer-contract.js`, `dialogue/approved-response-envelope.js`,
  `dialogue/product-context-contracts.js`, `dialogue/response-writer.js`,
  `runtime/llama-cpp-runtime.js`.
- **Raiz do pacote** (`require('.../apps/deliveryos-ai-node')`) — usado em
  `native/approved-response-plan.js`, `native/conversation-pattern-state.js`, `native/runtime.js`,
  `tools/.../capacity-probe/run.js` e os 5 arquivos de `local-ai-bakeoff/`. Esse padrão carrega o
  barrel `index.js`, que agrega quase todo o pacote (config, adaptive-poll, identity-store,
  request-signing, cloud-connector, registration-client, doctor, local-model-provider,
  node-runtime, update-manager, `runtime/*`, `model-adapters/*`, `dialogue/*`, `bakeoff/*`,
  `evals/*`).

Consequência: não foi possível isolar uma fatia mínima. Os 6 consumidores de root-require obrigaram
o porte de 46 dos 58 arquivos do pacote de origem. Excluído (nada os requer):
`installer/*.ps1`, `scripts/*.ps1`, `bin/deliveryos-ai-node.js`, `manifests/*`,
`config/node-config.example.json`.

Zero dependências npm externas — só stdlib do Node (`fs`, `path`, `crypto`, `child_process`).
Nenhum binding nativo carregado em import-time (llama.cpp é `spawn`ado como subprocesso em
runtime, não linkado).

## Tarefa futura registrada — fora do escopo do C1

Reduzir a superfície reescrevendo os 6 root-requires para subpath, para que o barrel completo deixe
de ser obrigatório. Isso é **edição semântica**, não porte mecânico — não faz parte do C1 e não foi
feita nesta sessão.

## Decisão sobre `public-menu-evidence.v1.json`

Arquivo de 2.2MB, ausente no porte inicial. Estrutura verificada: cardápio público certificado
(LiveMenu + iFood do Tatá Sushi), sem nenhum campo de PII. `MenuReviewService`
(`tools/conversation-crm/customer-menu/review-service.js:166-167`) faz `fs.readFileSync`
incondicional desse arquivo no construtor, sem fallback; dois testes
(`final-local-writer-menu-review.test.js`, `hospitality-intelligence-final.test.js`) dependem dele.
Decisão (do César): portar o arquivo — a alternativa de adaptar os testes para não precisar dele
seria edição semântica dentro de um porte que deveria ser mecânico.

O campo `policy.automatic_human_approval: true` presente no JSON foi verificado: é metadado gravado
por `import-public-menu-report.js:311` na hora de gerar o arquivo (documenta uma aprovação de fonte
já dada pelo César), e **nenhum código em `review-service.js` lê `.policy`** em runtime — não há
bypass de revisão humana derivado desse campo.

## Checagem do Preservation Set (feita antes de commitar, com leitura de código, não só grep)

- **Copiloto/Entregas/Home/Event Log**: zero `require`/import de `src/entregas/`, `src/platform/`
  ou qualquer caminho de Copiloto em todo o código portado. Confirmado por busca direta nos
  requires.
- **Event Log append-only**: o Event Log canônico é `platform.event_log`
  (`src/platform/migrations/0001_platform_foundation.sql:97`, protegido por trigger
  `BEFORE UPDATE OR DELETE ... RAISE EXCEPTION`). O conversation-crm nunca referencia essa tabela.
  Tem seu próprio log isolado (`NativeEventStore`, arquivo JSONL próprio, `fs.openSync(file,'a')` +
  `fsync`, sem update/delete exposto) e suas próprias tabelas Postgres
  (`conversation_ai_job_event`, `conversation_ai_node_event`) com o mesmo padrão de trigger
  append-only replicado — nunca a tabela real.
- **FACT ≠ INFERENCE ≠ SIMULATION ≠ UNKNOWN**: o vocabulário literal não existe no código (são
  termos do usuário, não strings do sistema), mas o princípio equivalente do CLAUDE.md é aplicado
  estruturalmente: `native/contracts.js:46,62` — `if (!output.synthetic) throw
  nativeError('REAL_DATA_NOT_ALLOWED')`. `curation_state` do menu mantém enum fechado
  (`unknown`, `inferred`, `human_approved`, `verified_official_public_source`...), sem coerção
  implícita.
- **Autoridade humana final**: `authority.js` (`approvePlan`) aprova planos de resposta de
  conversa *simulada* dentro do sandbox, não publica nada real. `publication-gate.js` tem
  `EXTERNAL_ACTION_ALLOWED: false` e `EXTERNAL_PUBLICATION_ALLOWED: false` como **constantes
  literais**, não deriváveis de nenhum input. `human-queue.js` só registra fila/estado de
  escalonamento via o próprio event-store append-only, não resolve nada sozinho.
- **Q-004 em aberto** ("CRM, Evolução, Treinamento, RH e Gestão são módulos do DeliveryOS?"): o C1
  não a decide — não integra, não ativa, não aparece em navegação/Home. Ver `BLOQUEIO-Q-004.md`
  para a implicação em C2.

## Cleanup

`.patch-chunk-probe.txt` (arquivo solto de 5 linhas, untracked, resíduo de sondagem anterior)
removido do worktree — não fazia parte do C1, backup confirmado pelo César antes da remoção.
