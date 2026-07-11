# Revisão Adversarial — Endurecimento F2-01 a F2-04

| Campo | Valor |
|---|---|
| **Escopo** | **Somente** correção dos achados F2-01…F2-04 (não reabre a Fase 2 inteira) |
| **Base** | `4a74077541245f3429cfe9b6cc6caefdd295588e` |
| **Commit corretivo** | `b4baf129e973b623d1a2c5ae58685b0621958884` |
| **Mensagem** | `Endurece privacidade tempo e deduplicacao do nucleo live` |
| **Branch Fable** | `feature/preloja-fable` (não alterada por este revisor) |
| **Revisor** | Red Team Grok · `audit/preloja-grok` |
| **Data** | 11/07/2026 |

---

## Veredito

# **APROVADO PARA FASE 3**

Nenhum bloqueio nos 10 pontos pedidos. Suíte live: **92/92 PASS**. Arquivos protegidos do cérebro/UI/seed: **zero** no diff.

---

## Diff (higiene)

```text
git log --oneline 4a74077..b4baf12  →  b4baf12 (1 commit)
```

| Incluído | Excluído (protegido) |
|---|---|
| `src/live/*` (incl. novo `sanitizar.js`) | `motor.js`, `decisao.js`, `app-v1/` |
| `tests/live/*` (pii, dia-local, clock-skew, dedup-log) | `package.json`, seed, cardápio |
| `docs/preloja/Contrato_Nucleo_Fonte_Viva_V0.md` | `.gitignore` (sem mudança neste commit) |

`git diff --name-only` filtrado por motor/decisão/app-v1/package/seed/gitignore → **lista vazia**.

---

## Checklist dos 10 pontos

| # | Critério | Resultado | Evidência |
|---|---|---|---|
| **1** | PII aninhada **não** aparece no log aceito, quarentena nem mensagens persistidas | **PASS** | Nested `payload.itens[0].meta.telefone` + `entrega.endereco` → quarentena `dado_pessoal_nao_permitido`, campo = caminho; marcador `SENSIBLE_PII_MARKER_999` **ausente** de `eventos.live.jsonl` e `quarentena.live.jsonl`. Schema inválido com `payload.telefone` → redigido; disco sem marcador. Testes `pii.test.js` (F2-01 disco limpo). |
| **2** | Sanitização em objetos e arrays | **PASS** | `sanitizar.acharCampoProibido` recursivo (obj/array/obj-in-array, depth 8); allowlist de `itens` só `nome/quantidade/observacao`. Testes + ataque unitário `itens[0].meta.email`. |
| **3** | Dia operacional com timezone **IANA** explícito | **PASS** | `localDayKey(iso, storeTimeZone)` via `Intl` + IANA; `2026-07-11T02:30:00.000Z` → `2026-07-10` em `America/Sao_Paulo`, `2026-07-11` em `UTC`; meia-noite local 03:00Z → dia 11 BRT. Casamento usa dia local (testes `dia-local.test.js`). |
| **4** | Timezone ausente **não** cai em UTC silencioso | **PASS** | `storeTimeZone: null` default; `localDayKey(..., null\|""\|IANA inválido)` → **`null`**. Sem TZ: casamento por dia não ocorre (parciais honestos) — testes F2-02. |
| **5** | `captured_at` futuro ≠ fonte fresca; idade não negativa | **PASS** | `classificarFonte`: futuro além de `clockSkewToleranceMs` → `desconhecida` / `relogio_inconsistente_carimbo_no_futuro`, `aparenta_atual: false`, `freshness_age_ms = max(0, …)`. Núcleo marca skew em quality + warning. Testes `clock-skew.test.js`. |
| **6** | Dedup **antes** do append | **PASS** | `nucleo.receber`: `dedup.consultar` → se duplicata, return **sem** `anexarEvento`; só `novo_fato` chama `anexarEvento`. |
| **7** | Duplicata após reinício não é anexada | **PASS** | Replay reconstrói índices; reenvio do mesmo `event_id` → `duplicado_ignorado`; linhas no log **1→1**. Teste F2-04 restart + reprodução com `reconstruirDoLog`. |
| **8** | Mesmo `event_id` com conteúdo divergente **não** substitui original | **PASS** | `evento_divergente` → quarentena `event_id_reutilizado_com_conteudo_divergente`; log aceito com 1 linha; estado/coluna original preservados. |
| **9** | Todos os testes live passam | **PASS** | `node --test tests/live/*.test.js` → **92 pass / 0 fail** (worktree isolado `b4baf12`, sem `npm install`). |
| **10** | Nenhum arquivo protegido alterado | **PASS** | Ver tabela de diff acima. |

---

## Como foi atacado (isolado)

Worktree detach em `b4baf12` + testes oficiais + scripts manuais:

1. Marcador PII em nested object/array e em evento malformado → disco limpo.  
2. `localDayKey` BRT vs UTC e null/IANA inválido.  
3. `captured_at = agora+1h` → freshness não “atualizada”.  
4. Dup event_id / restart / conteúdo divergente → contagem de linhas JSONL.  
5. Grep de paths protegidos no diff.

---

## O que mudou (mapa mínimo F2-01…04)

| Achado | Mecanismo no `b4baf12` |
|---|---|
| F2-01 | `sanitizar.js`: scan recursivo + redação + allowlist; `contrato`/`quarentena`/`nucleo` integrados |
| F2-02 | `localDayKey` + `config.storeTimeZone` (null default); consolidação/correlação usam dia local |
| F2-03 | Skew captured×received; future stamp → fonte `desconhecida`; age ≥ 0 |
| F2-04 | `dedup.consultar` antes de append; divergência → quarentena; replay reindexa |

---

## Notas **não bloqueantes** (não impedem F3)

Estas já estavam declaradas no desenho e **não** falham os 10 critérios:

1. Detecção de PII é por **nome de campo**, não por varredura de valor livre em `observacao` (limitação permanente documentada em `sanitizar.js` / Contrato).  
2. Fase 3 **deve** configurar `storeTimeZone` IANA da loja nos simuladores que casam por dia — sem isso o núcleo recusa casamento silencioso (comportamento desejado).  
3. `diaDe` (prefixo ISO) permanece exportado como utilitário legado, com aviso de não usar para correlação multi-fonte.

Nenhuma exige correção antes da Fase 3.

---

## Parecer

```text
Base:     4a74077
Corretivo: b4baf129e973b623d1a2c5ae58685b0621958884
Pontos 1–10: PASS
Live tests: 92/92
Arquivos protegidos: 0 tocados

Decisão: APROVADO PARA FASE 3
```

Fable pode iniciar a **Fase 3 (simulador)** sob este núcleo endurecido.  
Este revisor **não** implementou código, **não** fez merge, **não** alterou a branch Fable.
