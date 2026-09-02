---
lifecycle:
  artefato: docs/etapa-4-8/C2-HARDENING.md
  status: ACTIVE
  authority_scope: etapa_4_8_c2_hardening
  superseded_by: null
  atualizado_em: "2026-09-02"
  state_basis: 3be68c4
---

# C2 — Hardening B2 e recertificação isolada

> Sessão remota, branch `feature/deliveryos-test-rc-convergence-v1`, base desta etapa `3be68c4`.
> Ambiente: Linux, Node v22.22.2, `npm ci` (36 pacotes). PowerShell ausente. PostgreSQL e Docker
> ausentes — suítes correspondentes ficam BLOCKED/NOT_RUN, nunca verde silencioso (CLAUDE.md §10).
> **Nenhuma linha de código foi editada nesta etapa.** Quatro commits, todos de arquivos trazidos
> byte a byte da origem. Sem push, sem merge, sem deploy.

## 1. Resultado central

O hardening B2 **não precisava ser reaplicado**. Já estava inteiro na branch, byte a byte. O que
faltava não era semântica: era a **fronteira do porte C1**, que deixou de fora quatro grupos de
arquivos dos quais o código portado depende em runtime de teste. Fechados esses quatro grupos, a
recertificação targeted do B2 fecha **84/84 verde**.

## 2. Prova de que os 14 commits já estavam aplicados

Os 14 commits de hardening B2 são `680bff1..3549327` em `fix/b2-human-reality-hotfix` (de
"Experimenta autoridade cognitiva conversacional local" a "Congela replay final do fluxo de
recomendação"). Tocam 77 arquivos.

Comparação byte a byte dos **301 arquivos portados pelo C1** contra `3549327`:

| Classe | Arquivos |
|---|---|
| Blob git idêntico | 125 |
| Diferença **só** em newline final | 176 |
| **Diferença de conteúdo** | **0** |

Dos 77 arquivos tocados pelos 14 commits, os 45 que caem dentro dos diretórios portados (4 em
`src/`, 32 em `tools/`, 9 em `tests/`) estavam **todos presentes e idênticos**. Reaplicar os commits
seria no-op sobre 45 arquivos e conflito sobre os outros 32.

## 3. Régua verdadeira: a origem também não fica verde neste ambiente

Antes de julgar a branch, mediu-se a árvore de origem `3549327` extraída para fora do repositório,
com os mesmos `node_modules` e o mesmo Node:

| Árvore | tests | pass | fail | cancelled |
|---|---|---|---|---|
| Origem `3549327` | 836 | 810 | 4 (**3 reais**) | 21 |
| HEAD antes do C2 | 829 | 688 | 119 | 21 |

**Correção de medição, registrada em vez de escondida**: das 4 falhas da origem, uma
(`exportação contém manifesto, HEAD, hashes e zero mensagem bruta de chat`) foi **induzida pelo
próprio controle**. A cópia de origem foi feita por `git archive`, sem diretório `.git`; o exportador
chama `git rev-parse HEAD` (`homologation/exporter.js:80`) e o teste exige
`assert.match(manifest.head, /^[a-f0-9]{40}$/)`. Sem `.git`, o campo vem vazio. Não é falha da
origem — é falha do meu instrumento. A origem tem **3** falhas reais, exatamente as mesmas 3 que
sobram no HEAD hoje.

As 3 falhas reais e os 21 cancelamentos **não são desta etapa** — são o piso do próprio B2 em Linux:

- `host divergente e path fora da raiz são recusados` e
  `runtime llama.cpp proíbe bind público e traversal de modelo` — asserção sobre `'..\outside'`,
  com **contrabarra**. Em POSIX isso é nome de arquivo legítimo, não travessia. O controle em si está
  íntegro: verificado por execução direta que `confinedPath` **bloqueia** `../outside` e
  `/etc/passwd` com `AI_NODE_PATH_OUTSIDE_ROOT`, e aceita `sub/ok.txt`. Teste preso ao Windows, não
  buraco de segurança.
- `scripts do instalador têm sintaxe PowerShell válida` — não há `pwsh` nem `powershell` na máquina.
- 21 cancelamentos em `local-ai-adversarial.test.js`, em cascata a partir de
  `timeout HTTPS não abre destino alternativo`: `cloud-connector.js:37` faz `timeout.unref?.()`, e o
  `fetch` falso do teste só resolve pelo abort desse timer. Sendo o único handle vivo, o loop de
  eventos drena antes do disparo → `Promise resolution is still pending`. **Reproduzido idêntico na
  árvore de origem** (3 pass, 21 cancelled). Defeito latente do B2, anterior a esta etapa. Não
  corrigido aqui: corrigir exigiria editar código do B2, e o C2 não encontrou FAIL semântico que o
  justificasse.

**Diferencial líquido antes do C2**: 115 falhas existiam só no HEAD, zero só na origem. Regressão
estrita — e nenhuma delas vinda de código.

## 4. A causa: quatro grupos que o C1 não portou

Todas as 115 eram falta de arquivo, não defeito de lógica:

| Grupo | Caminho | Arquivos | Bytes | Por que o código precisa |
|---|---|---|---|---|
| **A** | `evals/` | 18 | 1.483.204 | `homologation/data.js:79` faz `readJson` incondicional de `evals/human-review/` no construtor, sem fallback; 95 falhas nasciam de um único ENOENT em `baseline-conversations-v1.json` |
| **B** | `scripts/verifiers/chatbot/` | 11 | 54.981 | 5 testes fazem `require` direto desses verificadores |
| **C** | 12 arquivos de `apps/deliveryos-ai-node/` | 12 | 22.637 | `ai-node-portable.test.js` faz `scandir` em `installer/` e lê `manifests/model-manifest.json` |
| **D** | `docs/execution/chatbot/` | 88 | 1.525.468 | `STATE.json` lido por teste; contém o pacote congelado de recertificação targeted do B2 |

O grupo **C** contradiz o `C1-PORT.md`, que registrou esses 12 arquivos como
"Excluído (nada os requer)". **Isso estava factualmente errado**: a verificação do C1 olhou os
`require` do código de produção e não os acessos de sistema de arquivos feitos pelos testes.
Correção aplicada em `C1-PORT.md` no mesmo commit deste documento.

O grupo **D** era o mais relevante para o C2: nele vive
`TARGETED_RECERTIFICATION_B2_POST_CERTIFICATION_RECOVERY_V1/`, o pacote congelado com
`MANIFEST.json`, entradas, saídas e evidência técnica. O construtor
`b2/build-targeted-recertification.js` já estava portado pelo C1, mas exige `--source-zip` apontando
para o pacote anterior — que estava justamente neste grupo. Sem ele, a recertificação targeted não
tinha contra o que ser feita.

## 5. Como o porte foi feito

Quatro commits, um por grupo, por `git checkout 3549327 -- <caminho>`: cópia direta do object store,
**byte-exata**. Diferente do C1, **não houve normalização CRLF→LF** — verificado antes que os 117
arquivos de A, B e D já estavam em LF (a única ocorrência de `\r` é conteúdo binário dentro do
`.zip`) e que os 12 de C também. `core.autocrlf` não está definido e não há `.gitattributes` na
branch, então nenhum filtro se aplica.

Isso importa porque o grupo D contém **evidência validada por hash**. Verificação feita depois do
porte, não presumida:

- os 6 arquivos declarados em `MANIFEST.json` conferem `sha256` e contagem de bytes — 6 ok, 0
  divergência;
- `TARGETED_RECERTIFICATION_B2_POST_CERTIFICATION_RECOVERY_V1.zip` confere o `sha256` declarado no
  seu próprio `.zip.sha256`;
- cada um dos 129 arquivos foi conferido por `git hash-object` contra o blob de origem: **zero
  divergência** nos quatro grupos.

Uma normalização de fim de linha, do jeito que o C1 fez, teria quebrado esses hashes.

## 6. Resultado da recertificação

**Recertificação targeted B2** — as 9 suítes tocadas pelos 14 commits de hardening
(`b2-minimal-architecture-proof`, `b2-post-certification-recovery`, `b2-product-surface`,
`cognitive-authority-experiment`, `human-reality-recommendation-hotfix`,
`local-planner-capacity-probe`, `post-composition-validator`, `product-structured-wiring`,
`recommendation-flow-final`):

```
# tests 84   # pass 84   # fail 0   # cancelled 0
```

**Suíte isolada completa** `tests/conversation-crm/`:

| Árvore | tests | pass | fail | cancelled |
|---|---|---|---|---|
| HEAD antes do C2 | 829 | 688 | 119 | 21 |
| **HEAD depois do C2** | **836** | **808** | **6** | 21 |
| Origem `3549327` | 836 | 810 | 4 (3 reais) | 21 |

Das 115 regressões, **112 fecharam**. As 3 que sobram são as 3 da origem (§3). As outras 3 falhas do
total de 6 são o grupo E abaixo — parado por decisão, não por defeito.

## 7. Grupo E — parado por decisão do César

Três testes exigem alteração em arquivos **compartilhados do produto**:

- `manifesto npm oferece instalação, execução, teste e transporte de configuração`
  (`portability.test.js:145`) — exige 4 scripts `conversation-crm:*` em `package.json`;
- `scripts npm expõem execução e painel sem nova dependência`
  (`local-model-bakeoff.test.js:222`) — exige `conversation-local-ai:bakeoff`;
- `Git ignora runtime, imports, backups, uploads e configuração privada`
  (`portability.test.js:156`) — exige 6 marcadores em `.gitignore`: `/runtime/`,
  `/imports/conversation-crm/`, `/backups/conversation-crm/`, `/uploads/conversation-crm/`,
  `/.cache/conversation-crm/`, `/config/conversation-crm/config.json`.

`package.json` é o manifesto do produto. Inscrever `conversation-crm:*` nele é o primeiro lugar em
que o CRM deixaria de ser código em disco e passaria a ser comando reconhecido do DeliveryOS — o que
encosta em `Q-004` ("CRM, Evolução, Treinamento, RH e Gestão são módulos do DeliveryOS?", aberta,
`default_behavior: PAUSE`).

**Decisão do César nesta sessão: nenhum dos dois. Mantém PAUSE.** `package.json` e `.gitignore`
seguem intactos. Os 3 testes ficam vermelhos e ficam registrados como **bloqueados por Q-004, não
como falha técnica**. Os 6 marcadores de `.gitignore` — que são proteção de dados, não ativação de
módulo — ficam junto, na mesma decisão, por viverem no mesmo arquivo compartilhado.

## 8. `.gitattributes` — não portado, registrado à parte

A origem tem um `.gitattributes` (introduzido dentro da janela dos 14 commits, por `60ba67b`) cuja
única regra é
`data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json text eol=lf`. Não tem relação
com `conversation-crm`: protege a config sombra da Capacidade Viva, validada por SHA-256 na
inicialização, contra checkout com CRLF no Windows.

**Não foi portado.** Verificado que nenhum teste de `conversation-crm` o referencia, e ele é arquivo
compartilhado da raiz, do mesmo tipo que o grupo E. Fica registrado como pendência real e separada:
em checkout Windows com `core.autocrlf=true`, aquele JSON materializa com CRLF, o hash deixa de bater
e o motor sombra se recusa a iniciar. Não afeta Linux. Decisão do César, fora do C2.

## 9. Baseline do produto — zero regressão, medido depois do porte

| Área | C0-BASELINE | Depois do C2 |
|---|---|---|
| `build` | PASS | PASS |
| `typecheck` | PASS | PASS |
| `test:platform` | PASS (44) | PASS (44) |
| envelopes | PASS (23) | PASS (23) |
| deploy-audit | PASS (30) | PASS (30) |
| R5 | PASS (242) | PASS (30 linhas OK, 0 falha) |
| product system | PASS | PASS (44) |
| visual-order | — | PASS (`VISUAL_ORDER_GATE_GREEN`) |
| skills | — | PASS (12) |
| Entregas — persistência | FAIL pré-existente | FAIL (2), **idêntico na base `9e738b11`** |
| Entregas — GPS | FAIL pré-existente | **PASS (50)** |
| governança — lifecycle/Q-014 | FAIL pré-existente | FAIL (G6b, G6c, G9), **idêntico na base** |
| PostgreSQL / Docker | BLOCKED | BLOCKED / NOT_RUN |

Quatro pontos de honestidade:

- As falhas de Entregas-persistência e de governança foram **reproduzidas na base `9e738b11`** em
  worktree separado, com saída idêntica. Pré-existência provada por controle, não herdada de
  documento.
- O gate de governança **não ganhou falha nova** com os 88 arquivos entrando em `docs/execution/`.
  Era risco real — as guardas G6 leem lifecycle de artefatos de execução — e foi medido, não
  suposto: mesmas três falhas, mesmas mensagens, antes e depois.
- A falha de Entregas-persistência tem causa datada: `impossible_timestamp` em 2 de 2 pontos de GPS.
  É fixture relativa a relógio, não defeito de persistência. Registrado, fora do escopo do C2.
- Entregas-GPS passou 50/50 aqui, divergindo do C0. A diferença de ambiente (Linux vs. a máquina do
  C0) é a explicação provável, mas **não foi medida** — fica como **não comprovado**.

## 10. Checagem de dados feita antes do porte

Grupos A e D somam ~3MB de corpora e evidência congelada. Verificado antes de qualquer commit:

- `evals/human-review/` — 50 conversas; `README.md` declara "exclusivamente sintéticas"; os 50 casos
  carregam `"synthetic": true`.
- `evals/local-ai/rebakeoff/` — corpus gerado por semente declarada
  (`"seed": "TATA-LOCAL-AI-BAKEOFF-V1"`).
- Varredura de PII em `evals/` e `docs/execution/chatbot/`: zero e-mail, zero CPF, zero telefone
  brasileiro completo, zero campo `customer_name`/`phone`/`whatsapp`/`email`. As 65 sequências
  numéricas que um regex ingênuo aponta como telefone são fragmentos de SHA-256 e uma URL pública do
  LiveMenu — inspecionadas.
- `docs/Politica_Dados.md` escopa a proibição a `data/`; `evals/` não é `data/`. E, decisivo: **os
  blobs já estavam neste repositório**, alcançáveis por `fix/b2-human-reality-hotfix`. Portá-los
  mudou qual branch os referencia, não se estão no Git.

## 11. Preservation Set — reconferido

- **Copiloto M1, Entregas, Home M1**: intocados. Nenhum arquivo desses domínios aparece nos quatro
  commits.
- **Event Log append-only**: `platform.event_log` não é referenciado por nada do `conversation-crm`.
  Nenhum commit desta etapa escreve nele. As réplicas isoladas do CRM continuam isoladas.
- **FACT ≠ INFERENCE ≠ SIMULATION ≠ UNKNOWN**: preservado. Os corpora do grupo A carregam
  `"synthetic": true` explícito e o `README.md` declara a natureza sintética — o porte manteve o
  carimbo intacto (byte-exato), não o apagou.
- **Autoridade humana final**: exercida. O grupo E e o `.gitattributes` pararam à espera do César, e
  foi ele quem decidiu manter PAUSE.
- **Q-004**: não decidida nem tocada. Nada em navegação, Home, `areas.ts`, runtime crítico/assíncrono
  ou documento de autoridade de produto foi alterado. O CRM continua sem ser importado de fora dele
  mesmo.

## 12. O que fica para depois

- **Q-004** segue aberta e continua bloqueando qualquer integração real do CRM ao produto — ver
  `BLOQUEIO-Q-004.md`. Os 3 testes do grupo E são a medida exata desse bloqueio hoje.
- **`.gitattributes`** (§8): pendência de portabilidade Windows, independente do CRM.
- **`local-ai-adversarial.test.js`**: 21 cancelamentos por `timeout.unref?.()` em
  `cloud-connector.js:37`. Defeito latente do B2, reproduzido na origem. Corrigir exige editar
  código do B2 — decisão do César.
- **Redução de superfície de `apps/deliveryos-ai-node`** (6 root-requires → subpath): continua fora
  de C1, C2 e C3, como já registrado em `C1-PORT.md`.
- **C3** — Intelligence Spine, sem criar novo Copiloto nem supermotor: não iniciado.
