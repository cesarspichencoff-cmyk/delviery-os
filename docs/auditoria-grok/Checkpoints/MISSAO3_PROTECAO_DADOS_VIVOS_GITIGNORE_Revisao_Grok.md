# Revisão Adversarial Grok — Checkpoint Fable

| Campo | Valor |
|---|---|
| **Fase (rótulo da missão)** | Missão 3 — proteção dos dados vivos no `.gitignore` |
| **Escopo real do commit** | Proteção Git **e** fechamento documental das ressalvas F1 (R1–R5 + médios) |
| **Branch Fable** | `feature/preloja-fable` (não alterada por este revisor) |
| **Hash base (pedido)** | `0b68cc3` |
| **Hash commit (pedido)** | `a441bc7` — **INVÁLIDO como HEAD da missão** (ver §0) |
| **Hash commit (efetivo)** | `73272bcbf1bca8c69811f4a1388638582adc3694` |
| **Mensagem** | `Fecha ressalvas arquiteturais antes da Fase 2` |
| **Revisor** | Red Team Grok · `audit/preloja-grok` |
| **Data** | 10/07/2026 |
| **main / branch Fable** | intocadas |

---

## 0. Correção de hashes (obrigatória)

O pedido informou:

```text
HASH BASE:   0b68cc3
HASH COMMIT: a441bc7
```

Isso **inverte** a linha do tempo:

| Hash | Conteúdo real |
|---|---|
| `a441bc7` | *Prepara roteiro de inspecao…* — **ancestral** (main estável pré-Fable pré-loja) |
| `0b68cc3` | *Audita arquitetura pre-loja…* — Fase 1 (docs/preloja) |
| `73272bc` | *Fecha ressalvas arquiteturais antes da Fase 2* — **único commit em `0b68cc3..origin/feature/preloja-fable`** |

```text
git log --oneline 0b68cc3..a441bc7     →  (vazio)
git log --oneline 0b68cc3..origin/feature/preloja-fable
  →  73272bc Fecha ressalvas arquiteturais antes da Fase 2
```

**Esta revisão analisa o range correto:** `0b68cc3...73272bc`.

O título “Missão 3 / gitignore” descreve **parte** do commit (`.gitignore` + Addendum §6). O commit também fecha **todas** as ressalvas da revisão anterior (`de26588`). Avaliamos os dois eixos.

---

## 1. Diff e arquivos lidos

```text
git fetch origin
git show --stat 73272bc
git diff --stat 0b68cc3...73272bc
git log --oneline 0b68cc3..73272bc
```

| Arquivo | Δ |
|---|---|
| `.gitignore` | +5 linhas (proteção live/runtime) |
| `docs/preloja/Addendum_PreRequisitos_Fase2_V0.md` | **novo** (+326) |
| `docs/preloja/Arquitetura_PreLoja_V0.md` | reescrito pontualmente |
| `docs/preloja/Auditoria_Mestra_PreLoja_V0.md` | correções F1-01/04/03/11… |
| `docs/preloja/Matriz_Riscos_PreLoja_V0.md` | riscos 4,7 + 16–18 |
| `docs/preloja/Plano_Execucao_PreLoja_V0.md` | F2/F4/F5/F6/F8 + mapa crítico |

**Código de produção:** zero. **Deps:** zero. **Secrets no diff:** só menções normativas (senha/cookie proibidos).

---

## 2. Testes e ataque (ambiente isolado)

### Regressão de cérebro (worktree grok; sem install)

| Teste | Resultado |
|---|---|
| `node tools/verificar_integridade_cardapio.js` | OK |
| `node tools/teste_fonte_real.js` | OK |
| `src/live` / build | N/A (sem código live; sem `node_modules`) |

### Ataque ao `.gitignore` de `73272bc` (repo temp com o arquivo exato)

| Caminho de ataque | Resultado |
|---|---|
| `data/live/eventos.jsonl` | **IGNORED** (`/data/live/`) |
| `data/live/sim/noite.json` | **IGNORED** |
| `runtime/eventos.jsonl` | **IGNORED** (`/runtime/`) |
| `foo.live.jsonl` / `sub/foo.live.jsonl` | **IGNORED** (`*.live.jsonl`) |
| `foo.runtime.jsonl` | **IGNORED** |
| `data/eventos.jsonl` (raiz) | **IGNORED** (regra antiga `/data/*.jsonl`) |
| `data/generated/live/x.jsonl` | **IGNORED** (`/data/generated/*`) |
| `data/Live/…` (case) | **IGNORED** neste Windows |
| **`data/live_backup/eventos.jsonl`** | **VISIBLE** — furo |
| **`tools/runtime/x.jsonl`** | **VISIBLE** — furo (`/runtime/` só na raiz) |
| **`docs/live/x.jsonl`** | **VISIBLE** — furo |

`git status` no repo de ataque staging: apenas `.gitignore` + os três paths **VISIBLE** acima.

A prova declarada no Addendum §6 (`data/live/prova-ignore.jsonl` + `*.live.jsonl`) é **reproduzível e correta** para os paths canônicos. Não cobre aliases laterais (ver F3-01).

---

## 3. Veredito

# **APROVADO COM RESSALVAS**

| Dimensão | Julgamento |
|---|---|
| Proteção dos paths canônicos (`data/live/`, `runtime/` na raiz, sufixos `*.live.jsonl`) | **Aprovado** — F1-03 fechado no essencial |
| Fechamento das ressalvas R1–R5 (F1-01…05) | **Aprovado** — correções honestas e acionáveis |
| Fechamento dos médios F1-06…12 | **Aprovado** no papel |
| Higiene de commit | **PASS** |
| Autorizar Fase 2 (documental) | **Sim, com ressalvas leves** (paths canônicos obrigatórios + limpar residual na matriz) |
| Bloqueia Fase Sombra S0? | **Não** |
| Bloqueia S1 / operação real? | **Não neste hash** (ainda sem capturador); residual de gitignore vira risco se F2 gravar fora dos paths canônicos |

**Não é “Bloqueado”.** **Não é “Precisa corrigir” como gate duro** — os furos são contornáveis por disciplina de path (já recomendada no Addendum: produção em `%LOCALAPPDATA%\DeliveryOS\runtime`).  
**Não é “Aprovado” puro** porque o ataque mostrou 3 padrões VISIBLE e um residual documental na matriz.

---

## 4. Fechamento das ressalvas da revisão anterior

| Achado anterior | Tratamento em `73272bc` | Status adversarial |
|---|---|---|
| F1-01 confComp ≠ staleness | Addendum §4 + correção explícita na Auditoria §6 + Plano F5 + risco 16 | **FECHADO** (spec); falta código/teste na F2/F5 |
| F1-02 envelope | Addendum §5 + Arquitetura §3 revogada | **FECHADO** |
| F1-03 gitignore | `.gitignore` + prova §6 | **FECHADO no canônico**; ressalva F3-01 |
| F1-04 merge temporal | §7 `conflict` + Auditoria §9 + risco 4 | **FECHADO** |
| F1-05 embalagens | F6 SUSPENSA + caminho crítico sem F6 | **FECHADO** |
| F1-06 duas árvores | §9 hierarquia canônica | **FECHADO** |
| F1-07 UI parcial | §10 + Plano F4 | **FECHADO** |
| F1-08 click | §11 + risco 17 | **FECHADO** |
| F1-09 numeração | Fases 2–8 | **FECHADO** |
| F1-10 evidência testes | §12 G1/G2 | **FECHADO** |
| F1-11 pedido_alterado | §13 | **FECHADO** |
| F1-12 rasura | §14 quality.* | **FECHADO** |

Crédito: o Fable **admitiu erro** na premissa confComp e na proximidade temporal — postura correta (Lei 5).

---

## 5. Achados desta revisão

### F3-01 — `.gitignore` não cobre aliases laterais de runtime

| Campo | Conteúdo |
|---|---|
| **ID** | F3-01 |
| **Gravidade** | **Média** (Alta se F2 gravar nesses paths) |
| **Hash** | `73272bc` |
| **Arquivo e trecho** | `.gitignore` L18–21: `/data/live/`, `/runtime/`, `*.live.jsonl`, `*.runtime.jsonl` |
| **Evidência** | Ataque em repo temp: `data/live_backup/eventos.jsonl`, `tools/runtime/x.jsonl`, `docs/live/x.jsonl` ficaram **VISIBLE** e entraram em `git add -A` |
| **Como reproduzir** | Extrair `.gitignore` de `73272bc`; criar os 3 paths; `git check-ignore -v`; `git status --short` |
| **Impacto** | `git add -A` em checkpoint descuidado versiona JSONL vivo se o código/desenvolvedor usar pasta “quase canônica” |
| **Correção recomendada** | (a) **Norma dura na F2:** só gravar em `data/live/` ou `%LOCALAPPDATA%\DeliveryOS\runtime`; (b) opcional: adicionar `/data/live_*/`, ou documentar allowlist; (c) gate de checkpoint: script que falha se `git status` listar `*.jsonl` sob `data/` exceto allowlist; (d) **não** expandir gitignore de forma cega a ponto de esconder lixo irrelevante — preferir path único |
| **Bloqueia próxima fase?** | **Não** se F2 usar só paths canônicos |
| **Bloqueia Fase Sombra?** | Não |
| **Bloqueia operação real?** | Não se runtime fora do repo (como desenhado) |
| **Confiança** | **Alta** (reproduzido) |

---

### F3-02 — Matriz de riscos ainda diz “gitignore na Fase 2” (residual)

| Campo | Conteúdo |
|---|---|
| **ID** | F3-02 |
| **Gravidade** | **Baixa** |
| **Hash** | `73272bc` |
| **Arquivo e trecho** | `Matriz_Riscos_PreLoja_V0.md` risco **#6**: *"Linha `data/live/*` no `.gitignore` (Fase 2)"* |
| **Evidência** | Diff da matriz atualizou #4, #7, #16–18, mas **não** reescreveu a mitigação do #6; contradiz Auditoria §13 e Addendum §6 (“FEITO”) |
| **Como reproduzir** | `git show 73272bc:docs/preloja/Matriz_Riscos_PreLoja_V0.md` · linha do risco 6 |
| **Impacto** | Agente futuro “adianta” de novo o gitignore ou acha que ainda falta |
| **Correção recomendada** | Uma linha: “`.gitignore` já cobre `/data/live/` (73272bc); checkpoint confere `git status`” |
| **Bloqueia próxima fase?** | Não |
| **Bloqueia Fase Sombra / real?** | Não |
| **Confiança** | **Alta** |

---

### F3-03 — Estado `atrasada` definido sem linha na matriz de comportamento

| Campo | Conteúdo |
|---|---|
| **ID** | F3-03 |
| **Gravidade** | **Média** |
| **Hash** | `73272bc` |
| **Arquivo e trecho** | Addendum §4: estados `atual \| atrasada \| vencida \| …`; matriz só combina atual/vencida/desconectada |
| **Evidência** | Texto: `atrasada` = entre limiares; comportamento normativo omite o que fazer com ação dominante / Foco / UI |
| **Como reproduzir** | Ler §4 tabela de estados vs matriz status×composição |
| **Impacto** | Implementador de F5 trata `atrasada` como `atual` (grita) ou como `vencida` (silencia demais) |
| **Correção recomendada** | Uma linha normativa: ex. `atrasada` ⇒ observar + mostrar idade; **não** elevar severidade artificial; ação dominante só se outra fonte `atual` e regra X; ou explicitar “igual a atual até calibrar na Sombra” |
| **Bloqueia próxima fase?** | Não F2 núcleo; **sim** fechar antes de F5 |
| **Bloqueia Fase Sombra?** | Parcial (calibração) |
| **Bloqueia operação real?** | Parcial |
| **Confiança** | **Alta** |

---

### F3-04 — `idempotency_key` de `status_ifood` com `captured_at_arredondado` é ambígua

| Campo | Conteúdo |
|---|---|
| **ID** | F3-04 |
| **Gravidade** | **Média** |
| **Hash** | `73272bc` |
| **Arquivo e trecho** | Addendum §5 exemplo status: `status:{ifood_short}:{dia}:{coluna}:{captured_at_arredondado}` |
| **Evidência** | Arredondamento não especificado (1s? 30s? 1min?). Pode: (a) colapsar transições rápidas em preparo→pronto no mesmo bucket; (b) inflar log com heartbeats se bucket fino — embora `pedido_vivo` exista para heartbeat |
| **Como reproduzir** | Dois status “pronto” no mesmo bucket vs mudança de coluna no mesmo segundo |
| **Impacto** | Dedup engole mudança legítima **ou** explode volume |
| **Correção recomendada** | Chave de fato de status: `status:{ifood_short}:{dia}:{coluna}` **sem** tempo (última observação atualiza carimbo); heartbeats só via `pedido_vivo`; ou documentar bucket e teste de regressão |
| **Bloqueia próxima fase?** | Spec de `dedup.js` na F2 |
| **Bloqueia sombra/real?** | Parcial |
| **Confiança** | **Média-alta** |

---

### F3-05 — Diagrama da Arquitetura ainda lista Mapa/Pressão/Sinais “iguais aos de hoje”

| Campo | Conteúdo |
|---|---|
| **ID** | F3-05 |
| **Gravidade** | **Baixa** |
| **Hash** | `73272bc` |
| **Arquivo e trecho** | `Arquitetura_PreLoja_V0.md` §1 caixa app-v1: *"Foco/Mapa/Pressão/Sinais, mesmos de hoje"*; Plano F4 e Addendum §10 já restringem |
| **Evidência** | Inconsistência visual residual pós-correção |
| **Impacto** | Leitor do diagrama ignora o Addendum |
| **Correção recomendada** | Ajustar legenda: “superfície **mínima** no vivo; Mapa/… sob §10” |
| **Bloqueia?** | Não / Não / Não |
| **Confiança** | **Alta** |

---

### F3-06 — `consolidar.js` no layout ainda diz “casamento pelo código iFood” sem `conflict`

| Campo | Conteúdo |
|---|---|
| **ID** | F3-06 |
| **Gravidade** | **Baixa** |
| **Hash** | `73272bc` |
| **Arquivo e trecho** | Arquitetura §2: `consolidar.js — casamento comanda×status pelo código iFood` |
| **Evidência** | §3 e Addendum §7 já exigem estados `matched|partial|unmatched|conflict` |
| **Impacto** | Implementador naive só casa por curto |
| **Correção recomendada** | Uma frase: “casamento com estados §7; curto sozinho insuficiente sob ambiguidade” |
| **Bloqueia?** | Não se F2 seguir Addendum |
| **Confiança** | **Alta** |

---

### F3-07 — `quality.completeness` sem `suspect` / papel de `conflict` no evento

| Campo | Conteúdo |
|---|---|
| **ID** | F3-07 |
| **Gravidade** | **Baixa** |
| **Hash** | `73272bc` |
| **Arquivo e trecho** | Addendum §5: `completeness: complete \| partial` |
| **Evidência** | Checklist adversarial pedia também `suspect`/`conflict` no quality; Fable colocou `conflict` no **casamento consolidado** (§7) — aceitável se documentado. `suspect` (parse duvidoso) só aparece via `parsing_warnings` |
| **Impacto** | Baixo se consolidado carregar `match_state` |
| **Correção recomendada** | Exigir no snapshot: `match_state` + opcional `completeness: suspect` quando warnings > 0 |
| **Bloqueia?** | Não |
| **Confiança** | **Média** |

---

### F3-08 — Nenhuma regressão de código; falsa confiança residual só se tratar spec como runtime

| Campo | Conteúdo |
|---|---|
| **ID** | F3-08 |
| **Gravidade** | **Informativa** |
| **Hash** | `73272bc` |
| **Evidência** | Diff só docs + gitignore; cérebro intacto (testes OK) |
| **Impacto** | Zero na loja **hoje**; ganho real na F2 se gates forem codificados |
| **Correção** | N/A — lembrar: documento não implementa staleness/conflict |
| **Bloqueia?** | Não |
| **Confiança** | **Alta** |

---

## 6. Checklist adversarial (resumo)

| Seção | Resultado |
|---|---|
| 0 Higiene | **PASS** |
| 1 Contrato | **PASS** (Addendum §5) |
| 3 Dedup / 4 Consolidação | **PASS** com nota F3-04 |
| 5–6 Parcial / Cancel | **PASS** |
| 7 Recuperação | **PASS** desenho |
| 8 Offline / staleness | **PASS** spec (F3-03 buraco `atrasada`) |
| 10 Flags | **PASS** |
| 11 Embalagens | **PASS** (suspensa) |
| 14–15 Segurança / Privacidade | **PASS** (+ gitignore canônico) |
| 16 Rollback | **PASS** desenho |
| Proibidos no diff | **PASS** |

---

## 7. Temas obrigatórios da missão

| Tema | Avaliação |
|---|---|
| Premissas falsas | **Corrigidas** (confComp, merge temporal) |
| Casos extremos | Spec cobre conflict/staleness/reimpressão; `atrasada` e idempotency status ainda frouxos |
| Dados incompletos | Bem |
| Duplicidade | Bem (pedido_interno + conflict) |
| Fora de ordem | Mencionado em §13; precedência cancel ainda pouco tabular |
| Recuperação | Replay + linha truncada mantidos |
| Privacidade | Schema sem tel/endereço + runtime fora do repo |
| Falha silenciosa | schema_version quarentena; gitignore residual F3-01 |
| Falsa confiança | Política G1/G2; risco 18 |
| Regressões | Nenhuma de código |
| Acoplamentos | Addendum vence Fase 1; canônicos acima |
| Impacto na loja | **Nenhum runtime**; reduz risco futuro de commit de PII/live |

---

## 8. Parecer

```text
Checkpoint Fable efetivo: 73272bcbf1bca8c69811f4a1388638582adc3694
Base: 0b68cc3
Pedido HASH COMMIT a441bc7: DESCARTADO (ancestral; range vazio)
Fase: Missão 3 gitignore + fechamento ressalvas F1
Revisor: Red Team Grok
Data: 2026-07-10

Altos FAIL: (nenhum crítico de processo)
Médios: F3-01, F3-03, F3-04
Baixos: F3-02, F3-05, F3-06, F3-07

Pode autorizar Fase 2 documentalmente? SIM (com paths canônicos)
Pode S1 captura? AINDA NÃO (sem núcleo)
Pode operação real? NÃO

Decisão: APROVADO COM RESSALVAS
```

### Ressalvas leves (não bloqueiam AUTORIZO FASE 2)

1. Gravar **somente** em paths cobertos (`data/live/` ou runtime fora do repo).  
2. Corrigir residual da matriz risco #6 quando houver micro-doc.  
3. Definir comportamento de `atrasada` antes/durante F5.  
4. Fechar fórmula de `idempotency_key` de status na F2.

---

## 9. Commit desta revisão

Somente este arquivo em `audit/preloja-grok`. Branch Fable e `main` intocadas.

*Hash da revisão Grok: preenchido no commit seguinte a este arquivo.*
