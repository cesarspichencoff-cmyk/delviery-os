# Revisão de Segurança e Privacidade — Auditoria 2026-07-20

> Escopo: worktrees do DeliveryOS + `tata-house`. Classificação P0 (bloqueante) → P3 (melhoria).
> Regra: "seguro localmente" ≠ "seguro". Nada aqui foi corrigido escondendo erro.

## 1. Resumo

**Nenhum P0. Nenhum segredo real vazado. Nenhum P1 sem decisão.** Os achados são de postura de ambiente (servidor de dev exposto na LAN) e higiene, coerentes com um produto em fase de demonstração local — não em produção.

## 2. Segredos e credenciais

| Verificação | Resultado |
|---|---|
| `.env` real versionado | **Não** — só `.env.example` (placeholders) em todos os worktrees |
| Chaves hardcoded (`eyJ…`, `sb_secret_…`, `service_role`) no código/bundle | **Nenhuma** — `grep` em `src/`, `public/`, `out/` do `tata-house` limpo |
| Supabase | Lido só de `process.env` (`tata-house/src/lib/cardapio/supabase/config.ts`); ausência = app cai para localStorage |
| Tokens/`.pem`/`.key` rastreados no git | Nenhum |

**Veredito:** limpo. (P3: recomendar `git-secrets`/scan no CI antes de tornar repositórios acessíveis a terceiros.)

## 3. Servidor do Copiloto (`tools/servir_v1.js`) — dev server

| Item | Achado | Sev |
|---|---|---|
| Path traversal | **Bloqueado.** `../` codificado → **403** (testado: `/..%2f..%2f.gitconfig` → 403). Guard `path.join` + `startsWith(DIR)`. | OK |
| Bind address | `0.0.0.0` (todas as interfaces) — **alcançável na LAN** (imprime "no celular: http://192.168.x.x:PORT"). | **P2** |
| Escopo servido | Serve a raiz do repo: `src/`, `docs/`, `data/` acessíveis por HTTP (por design — o browser carrega `motor.js`). `.git` no worktree é arquivo, não dir (404). | **P2** |
| Auth / HTTPS | Nenhuma. É dev server. | P2 (só relevante fora de localhost) |
| CSP / headers de segurança | Ausentes (`X-Content-Type-Options`, `X-Frame-Options`, CSP). | **P3** |
| Stack trace exposto | `catch` devolve payload de erro estruturado (via `montarPayloadInterface`), **não** stack cru. | OK |
| Endpoints de debug em "produção" | QA catalog oculto por `?qa=1` (gate no `app.js`); feature flag sombra desligada por padrão em produção. | OK |

**P2 — servidor de dev na LAN servindo o repo inteiro.** Mitigação imediata (baixo risco, sem decisão de produto): trocar bind para `127.0.0.1` por padrão e exigir opt-in explícito (`HOST=0.0.0.0`) para acesso via celular. Isso NÃO altera baseline visual nem lógica — é config de rede. Ver §7 (correção aplicada).

## 4. Modo sombra — privacidade

| Verificação | Resultado |
|---|---|
| Nomes de funcionário nos registros | **Ausentes** (testado; `config_nome` é nome da *config*, não pessoa) |
| Ranking / score individual | **Ausentes** (proibido por `stamp()` em `labels.js`: `ranks_employees:false`) |
| Comando executável na saída | **Ausente** (`intervencao_executavel:false` sempre) |
| PII em `observacoes.runtime.jsonl` | Nenhuma — só praça, tempos, estado, hash, commit |
| Persistência | `*.runtime.jsonl` gitignored; sem banco, sem envio externo |
| Crescimento do log | Append sem rotação/limite — cresce (lento, por dedup). **P3** (ver [PROJECT_WIDE_READINESS_AUDIT.md](PROJECT_WIDE_READINESS_AUDIT.md)) |

## 5. Entregas — dados reais no working tree

`deliveryos-entregas-v1` tem material real solto (não commitado):
- `_tmp_motoboy.xlsx` (660 KB — planilha real de motoboys) — **gitignored** (`_tmp_*`), confirmado por `git check-ignore`.
- `_tmp_r1_*.txt` — relatórios; cabeçalho declara "Conteúdo anonimizado; sem dados pessoais, ranking ou avaliação individual".
- `docs/entregas/gate-zero/*.md` — untracked, sem PII aparente (mapas de estrutura).

**Achado (P3):** os `_tmp_*` estão protegidos por `.gitignore`, então **não há risco de commit acidental**. Recomendação: mover dados brutos reais para `deliveryos-private-sources/` (repo de originais imutáveis) em vez de deixá-los no working tree do worktree de código, alinhado ao CLAUDE.md ("nunca deixar patrimônio importante solto no working tree").

## 6. tata-house (app separado)

- Supabase opcional, chave pública (anon) por env — modelo correto (RLS deve estar ativo no lado Supabase; **não auditável daqui** — registrar como pendência de verificação no projeto Supabase).
- IA via Edge Function recomendada (chave no servidor) — `.env.example` documenta.
- **Fora do escopo de release do DeliveryOS** enquanto for produto separado.

## 7. Correções aplicadas nesta auditoria

- **P2 → mitigado:** `tools/servir_v1.js` passa a bindar `127.0.0.1` por padrão; acesso via LAN exige `HOST=0.0.0.0` explícito. Baixo risco, sem decisão de produto, coberto por teste. Ver commit da auditoria e [PROJECT_WIDE_READINESS_AUDIT.md](PROJECT_WIDE_READINESS_AUDIT.md) §correções.

## 8. Classificação final

| Sev | Qtd | Itens |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 1 (mitigado) | Dev server bind `0.0.0.0` servindo repo na LAN → corrigido para `127.0.0.1` default |
| P3 | 4 | Sem CSP/headers; log sombra sem rotação; dados reais no working tree do Entregas (gitignored); sem scan de segredos no CI |

**Nada bloqueia demonstração local controlada. Nada está pronto para piloto/produção** (falta auth, HTTPS, monitoramento, RLS verificado, rotação de logs).
