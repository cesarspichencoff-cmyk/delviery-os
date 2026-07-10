# Revisão Adversarial Grok — Checkpoint Fable

| Campo | Valor |
|---|---|
| **Fase** | AUDITORIA E ARQUITETURA PRÉ-LOJA (Fase 1 do programa Fable) |
| **Branch Fable** | `feature/preloja-fable` |
| **Hash base** | `a441bc7e9ed209ca965be549dbbd0cd787867bd5` |
| **Hash do commit** | `0b68cc3ca3a9b95aae605cb402ba34fc84d9b76b` |
| **Mensagem** | `Audita arquitetura pre-loja do DeliveryOS` |
| **Revisor** | Red Team Grok · branch `audit/preloja-grok` |
| **Data** | 10/07/2026 |
| **Escopo do diff** | 4 arquivos docs only · +558 linhas · **zero código** |
| **main** | não tocada |
| **Branch Fable** | não alterada por este revisor |

---

## 0. Verificações de processo

```
git fetch origin
git show --stat 0b68cc3
git log --oneline a441bc7..0b68cc3   →  0b68cc3 (1 commit)
git merge-base --is-ancestor a441bc7 0b68cc3  →  OK
```

| Check | Resultado |
|---|---|
| Ancestralidade base→commit | `a441bc7` é ancestral de `0b68cc3` |
| Só docs? | Sim: `docs/preloja/*` apenas |
| Secrets/cookies/passwords no diff | Não (só menção normativa) |
| PDF/imagem | Não |
| Código produção / motor / seed | Intacto |
| Linguagem "validado na loja / produção" | Ausente no commit; honestidade "nada implementado" OK |

### Arquivos lidos na íntegra

1. `docs/preloja/Auditoria_Mestra_PreLoja_V0.md`
2. `docs/preloja/Arquitetura_PreLoja_V0.md`
3. `docs/preloja/Matriz_Riscos_PreLoja_V0.md`
4. `docs/preloja/Plano_Execucao_PreLoja_V0.md`

### Testes executados (ambiente isolado — worktree grok; sem install)

| Teste | Resultado | Nota |
|---|---|---|
| `node tools/verificar_integridade_cardapio.js` | OK | Regressão seed |
| `node tools/teste_fonte_real.js` | OK | Seam de itens intacto |
| `npm run build/typecheck/demo` | N/A | `node_modules` ausente; missão proíbe install |
| Testes de `src/live/` | N/A | **Não existem neste commit** (Fase 1 só docs) |
| Prova `.gitignore` × `data/live/` | **FALHA de cobertura** | ver F1-03 |

### Ataque ("tentar quebrar")

Não há runtime a quebrar neste hash. O ataque foi **lógico e de premissas**:
- Provar hole de gitignore em `data/live/eventos.jsonl` (arquivo apareceu como `??` no `git status`).
- Confrontar afirmações "Fato" com o código em `a441bc7`.
- Cruzar com biblioteca adversarial em `docs/auditoria-grok/` e com `Logica_Embalagens` §16.
- Simular cenários de consolidação (colisão de curto, status stale, confComp) sem código.

---

## 1. Veredito

# **APROVADO COM RESSALVAS**

| Dimensão | Julgamento |
|---|---|
| Entrega da Fase 1 (auditoria + arquitetura + plano + riscos, só docs) | **Cumpre** |
| Qualidade e honestidade geral | **Alta** — Fato/Hipótese/Decisão/Pendência bem separados na auditoria mestra |
| Aderência ao que o Red Team pediu para pré-loja | **Boa base**, com lacunas de contrato e 1 premissa falsa grave |
| Autorizar Fase 2 sem correção documental | **Não recomendado** até fechar ressalvas **R1–R5** (abaixo) |
| Bloqueia Fase Sombra S0 cognitiva (export)? | **Não** |
| Bloqueia Fase Sombra S1 (captura live)? | **Não ainda** — S1 depende de Fases 2–7 + inspeção; este commit não implementa |
| Bloqueia operação real? | **N/A neste hash** (sem código live) |

### Ressalvas obrigatórias antes de `AUTORIZO FASE 2`

| # | Ressalva | Origem |
|---|---|---|
| **R1** | Corrigir premissa falsa: `confComp`/confiança atual **não** para recomendações por fonte stale | F1-01 |
| **R2** | Completar contrato de eventos (`event_id`, `schema_version`, `quality`, no-click, ids) no doc de arquitetura | F1-02 |
| **R3** | Confirmar no plano da Fase 2 a linha **efetiva** `data/live/*` no `.gitignore` + prova `git check-ignore` | F1-03 |
| **R4** | Remover ou rebaixar "casamento por proximidade temporal" em colisão de curto — vira inventar vínculo | F1-04 |
| **R5** | Reordenar/condicionar Fase 6 embalagens à §16 de `Logica_Embalagens` (matriz + César), não como default do pipeline pré-loja | F1-05 |

Ressalvas **não bloqueiam** o encerramento da Fase 1 como pacote documental; **bloqueiam** tratar o plano atual como especificação fechada da Fase 2.

---

## 2. O que está bem (crédito adversarial)

1. **Zero código** na fase certa — não implementou adaptadores reais nem tocou no cérebro.
2. **Seam correto**: quinta porta → mesmo shape `NIGHT`+`rows`; motor intocado.
3. **Partials explícitos** (comanda sem status / status sem comanda) alinhados ao Red Team.
4. **Cancel só de status**; reimpressão não cria segundo pedido — correto.
5. **Simuladores antes de adaptadores reais** — lei 10 (adaptador descartável).
6. **Flags default OFF** e rollback = desligar flag — bom.
7. **Pendências da loja** listadas com honestidade (DOM A/B/C/D, DataType Epson, etc.).
8. **Matriz de riscos** nomeia falsa confiança do simulador (risco 2) e parcial completo (risco 5).
9. **Fatos verificados que batem com o repo:**
   - `makeFonteItensFromRows` em `motor.js:146-178` — **confirmado**.
   - `servir_v1.js` porta **5179** — **confirmado**.
   - `app-v1` chama `decidir` com `active: sess.active` — **confirmado**.
   - Sem framework de teste no `package.json` — **confirmado**.
   - `.gitignore` cobre `/data/*.jsonl` na raiz, não nested live — Fable **acertou** a pendência.

---

## 3. Achados

### F1-01 — Premissa falsa: confiança do cérebro NÃO para ação quando status congela

| Campo | Conteúdo |
|---|---|
| **ID** | F1-01 |
| **Gravidade** | **Alta** (arquitetura / falsa confiança) |
| **Hash** | `0b68cc3` |
| **Arquivo e trecho** | `Auditoria_Mestra` §6 Offline: *"para de recomendar ação quando a confiança cair… mecanismo… já existe no cérebro — confComp"*; `Arquitetura` §5: mesma tese |
| **Evidência** | Em `decisao.js`, `confComp` só depende de `fonteReal` e de fraqueza de severidade/unblock — **não** lê idade de fonte, `fonte_desconectada`, nem quality do live. Com `fonteReal: true`, recomendações saem `"alta"` mesmo se status estiver congelado há 40 min. Não existe no motor gate "parar de recomendar por staleness". |
| **Como reproduzir** | Ler `confComp` em `src/perfil-delivery/decisao.js` (~L78); buscar `idade`/`stale`/`fonte_desconect` no perfil-delivery → ausência; montar mentalmente snapshot com `fonteReal:true` e status antigo → ação ainda elegível. |
| **Impacto** | Fase 5 pode achar que "já está resolvido" e só carimbar idade no rodapé, enquanto o Foco continua mandando agir com dado morto (silêncio perigoso + falsa confiança). |
| **Correção recomendada** | Documentar **mecanismo novo obrigatório** no path live (antes de `decidir` ou na UI): se `qualidade.idade` ou fonte status offline > limiar → **não chamar ação dominante** / forçar foco puro ou modo só-observação. Não atribuir isso a `confComp` atual. |
| **Bloqueia próxima fase (F2)?** | **Não** o núcleo de eventos; **sim** fechar desenho de F5 sem corrigir o texto |
| **Bloqueia Fase Sombra?** | S1 se UI live mentir saúde: **sim** |
| **Bloqueia operação real?** | **Sim** se não houver gate de staleness |
| **Confiança** | **Alta** |

---

### F1-02 — Contrato de eventos incompleto vs checklist adversarial

| Campo | Conteúdo |
|---|---|
| **ID** | F1-02 |
| **Gravidade** | **Alta** |
| **Hash** | `0b68cc3` |
| **Arquivo e trecho** | `Arquitetura_PreLoja_V0.md` §3 — envelope `{tipo, fonte, recebido_em, dados}` |
| **Evidência** | Checklist Grok exige `event_id`, `observed_at` vs `source_ts`, `schema_version`, estados `complete/partial/suspect/conflict`, heartbeat/erro de 1ª classe. O V0 tem tipos úteis (`fonte_conectada/desconectada`, reimpressão, cancel) mas **omite** id estável do evento, versionamento de schema, e nomeia qualidade só no snapshot (não no evento). `pedido_vivo` é tipo opaco sem semântica. |
| **Como reproduzir** | Diff mental: checklist §1 vs Arquitetura §3. |
| **Impacto** | Fase 2 pode implementar JSON ad hoc; dedup/replay e auditoria de checkpoints posteriores ficam frágeis; dois agentes (Fable/Grok) medem coisas diferentes. |
| **Correção recomendada** | Estender o envelope no doc (ainda Fase 1 addendum ou início F2 **antes** de código): `event_id`, `schema_version`, `observed_at`, `source_ts?`, `quality`, `dedup_key` candidata; definir ou remover `pedido_vivo`; proibir click path por escrito no contrato de adaptadores. |
| **Bloqueia próxima fase?** | **Sim como spec fechada** — F2 deve começar pelo contrato completo |
| **Bloqueia Fase Sombra?** | Indireto (S1) |
| **Bloqueia operação real?** | Indireto |
| **Confiança** | **Alta** |

---

### F1-03 — `data/live/*` ainda não ignorado; risco real de commit acidental

| Campo | Conteúdo |
|---|---|
| **ID** | F1-03 |
| **Gravidade** | **Alta** (quando F2 criar arquivos; **Média** neste hash docs-only) |
| **Hash** | `0b68cc3` (decisão correta, implementação ausente) |
| **Arquivo e trecho** | `Auditoria_Mestra` §13; `Plano` Fase 2; `.gitignore` atual linhas 3–12 |
| **Evidência** | Experimento nesta sessão: criar `data/live/eventos.jsonl` → `git check-ignore` **não** ignora → `git status` mostra `?? data/live/eventos.jsonl`. Padrão `/data/*.jsonl` **não** cobre subpastas. |
| **Como reproduzir** | `mkdir data/live; echo x > data/live/eventos.jsonl; git check-ignore -v data/live/eventos.jsonl; git status --short` |
| **Impacto** | Primeiro `git add -A` na Fase 2 pode versionar eventos (mesmo sintéticos) e violar Política de Dados. |
| **Correção recomendada** | **Primeira linha de código/diff da Fase 2** (ou hotfix doc+gitignore autorizado): `/data/live/*` + `.gitkeep` se necessário; gate de checkpoint com `git status` limpo de live. |
| **Bloqueia próxima fase?** | **Sim se F2 criar live sem gitignore no mesmo commit** |
| **Bloqueia Fase Sombra?** | Não |
| **Bloqueia operação real?** | Não diretamente |
| **Confiança** | **Alta** (reproduzido) |

---

### F1-04 — Resolução de colisão de código curto por "proximidade temporal" inventa casamento

| Campo | Conteúdo |
|---|---|
| **ID** | F1-04 |
| **Gravidade** | **Alta** |
| **Hash** | `0b68cc3` |
| **Arquivo e trecho** | `Auditoria_Mestra` §9: *"empate resolve por proximidade temporal e fica marcado incerto.colisao_curto se ambíguo"* |
| **Evidência** | Red Team (FV-01, DC-02, checklist 4.3): colisão → **`conflict`**, nunca merge silencioso. "Proximidade temporal" **é** um merge heurístico — pode casar status do pedido B com comanda A em pico denso. Marcar `incerto` depois de já ter unido é epistemologia fraca. |
| **Como reproduzir** | Cenário: dois prints com curto "0724" em 3 min; um status "pronto"; heurística temporal gruda no errado. |
| **Impacto** | Itens de um pedido + tempo de outro → pior classe de bug (ação no ID errado). |
| **Correção recomendada** | Sem chave forte (pedido_interno no status ou desambiguação humana): estado **`conflict` / não casar**; não alimentar motor de praça com o par ambíguo. Proximidade temporal só como **sinal de diagnóstico**, nunca como união automática. |
| **Bloqueia próxima fase?** | **Sim** na implementação de `consolidar.js` |
| **Bloqueia Fase Sombra?** | S1 se consolidar cego: **sim** |
| **Bloqueia operação real?** | **Sim** |
| **Confiança** | **Alta** |

---

### F1-05 — Fase 6 (embalagens V1) conflita com §16 da lógica oficial e com DC-04

| Campo | Conteúdo |
|---|---|
| **ID** | F1-05 |
| **Gravidade** | **Alta** (escopo / produto) |
| **Hash** | `0b68cc3` |
| **Arquivo e trecho** | `Plano_Execucao` Fase 6; `Arquitetura` §6; vs `docs/Logica_Embalagens_DeliveryOS_V0.md` §16: *"Só depois transformar a lógica em função… Nunca antes da validação"*; Red Team DC-04 / G-E-03 |
| **Evidência** | Plano coloca motor de embalagens **dentro** do programa pré-loja com flag, testes e integração a Sinais de Fluxo **antes** das 8 respostas do César e da matriz técnica. Mesmo com `incerto` e flag OFF, o programa **normaliza** automação de embalagem como entrega pré-loja. |
| **Como reproduzir** | Ler Embalagens §16 + Plano F6 lado a lado. |
| **Impacto** | Pressão para ligar flag em demo; sinais de sacola "bonitos" com regras incompletas; desvia Fable de F2–F5 (encanamento) que é o caminho crítico. |
| **Correção recomendada** | Condicionar F6 a: (a) respostas §15 César; (b) matriz técnica; (c) autorização explícita separada. Até lá F6 = **opcional / park**, não no caminho crítico F2→F5→F7. Se implementar cedo: **somente módulo + testes, flag OFF, zero wiring em Sinais/UI**. |
| **Bloqueia próxima fase (F2)?** | **Não** |
| **Bloqueia Fase Sombra?** | Não se flag OFF e sem wiring |
| **Bloqueia operação real?** | **Sim** se embalagem-fato na UI |
| **Confiança** | **Alta** |

---

### F1-06 — Segunda árvore documental sem ponte formal com docs canônicos

| Campo | Conteúdo |
|---|---|
| **ID** | F1-06 |
| **Gravidade** | **Média** |
| **Hash** | `0b68cc3` |
| **Arquivo e trecho** | Pasta `docs/preloja/*` vs `docs/Arquitetura_Sincronizacao_Local_V1.md`, `Auditoria_Fonte_Viva_Loja_V1.md`, `Inspecao_Fontes_Reais_Loja_V0.md`, `docs/auditoria-grok/*` |
| **Evidência** | Pré-loja re-especifica o mesmo sistema (duas fontes, casamento, sombra) com vocabulário paralelo (`tipo` vs `kind`, fases 2–8 vs S0/S1/T/P/O do Grok). Há menções pontuais, mas **não** há seção "em conflito, qual doc vence" nem mapa de equivalência. |
| **Como reproduzir** | Buscar em `docs/preloja` referências a `auditoria-grok` → ausentes; comparar envelopes de evento. |
| **Impacto** | Dois "fontes oficiais" → César e agentes escolhem a narrativa conveniente; drift silencioso. |
| **Correção recomendada** | Addendum de 1 página: hierarquia (ex.: Constituição > Leis > preloja operacional > auditoria-grok adversarial) e tabela de equivalência S1↔Fases Fable. |
| **Bloqueia próxima fase?** | Não |
| **Bloqueia Fase Sombra?** | Não |
| **Bloqueia operação real?** | Não |
| **Confiança** | **Média-alta** |

---

### F1-07 — "Parar de recomendar" + poll + Mapa/Pressão/Sinais = superfície cognitiva expandida no live

| Campo | Conteúdo |
|---|---|
| **ID** | F1-07 |
| **Gravidade** | **Média** |
| **Hash** | `0b68cc3` |
| **Arquivo e trecho** | `Plano` Fase 4: *"Calmo/Ambiente/Foco/Mapa/Pressão/Sinais idênticos"*; `Arquitetura` diagrama app-v1 |
| **Evidência** | app-v1 já tem mapa com Caixa/Cozinha em `validacao` e Conferência com verde quando sem sit — Red Team G-E-05/R-15/R-23. Replicar "idêntico" no vivo **propaga** riscos de poluição e verde falso para o path novo, em vez de endurecer honestidade. |
| **Como reproduzir** | `app-v1/app.js` mapa ambientes (~L219–264). |
| **Impacto** | Live herda UI que já tensiona Leis 5/12; demo "rica" > núcleo. |
| **Correção recomendada** | Gate F4: path live pode **restringir** superfície (Foco+Ambiente+Calmo+health) antes de Mapa/Pressão/Sinais; não exigir paridade pixel com todas as camadas experimentais. |
| **Bloqueia próxima fase?** | Não F2 |
| **Bloqueia Fase Sombra?** | S1 se poluir: parcial |
| **Bloqueia operação real?** | Parcial |
| **Confiança** | **Média** |

---

### F1-08 — Proibição de click / isolamento de sessão fracos no pacote F1

| Campo | Conteúdo |
|---|---|
| **ID** | F1-08 |
| **Gravidade** | **Média** (sobe a **Crítica** se F3/F7 automatizar browser) |
| **Hash** | `0b68cc3` |
| **Arquivo e trecho** | Segurança §12 da Auditoria (senha/cookie/write-back) — **não** lista "nunca click em ação do Gestor"; Plano não tem gate `ALLOW_CLICK=false` |
| **Evidência** | Red Team X-FIND-02 / checklist 10.2 e 14.2. Programa adia adaptador real, mas F3 "simulador" e F7 "sombra" podem deslizar para Playwright. |
| **Como reproduzir** | Grep nos 4 docs: ausência de "click"/"Playwright"/"Puppeteer" como proibição dura. |
| **Impacto** | Superfície de desastre operacional se alguém "só testar" o Gestor. |
| **Correção recomendada** | Uma linha inviolável nos 4 docs + gate F2/F3: adaptadores **read-only**; zero API de click no programa; inspeção DOM = manual F12. |
| **Bloqueia próxima fase?** | Não F2 simulador puro |
| **Bloqueia Fase Sombra?** | Se houver click path: **sim** |
| **Bloqueia operação real?** | **Sim** se click |
| **Confiança** | **Alta** no gap documental |

---

### F1-09 — Numeração de fases inconsistente (2–7 vs 2–8)

| Campo | Conteúdo |
|---|---|
| **ID** | F1-09 |
| **Gravidade** | **Baixa** |
| **Hash** | `0b68cc3` |
| **Arquivo e trecho** | `Arquitetura` intro "Fases 2-7"; `Auditoria` "Fases 2-8"; `Plano` tem F8 RC |
| **Evidência** | Textual |
| **Impacto** | Confusão de checkpoint ("já acabou no 7?"). |
| **Correção recomendada** | Unificar: 2–8 com F8 = RC. |
| **Bloqueia?** | Não / Não / Não |
| **Confiança** | **Alta** |

---

### F1-10 — Gates de regressão F2 assumem ambiente que o worktree Fable pode não ter

| Campo | Conteúdo |
|---|---|
| **ID** | F1-10 |
| **Gravidade** | **Média** |
| **Hash** | `0b68cc3` |
| **Arquivo e trecho** | `Plano` pré-requisito `npm ci`; gate F2: autoteste 8,1 + auditoria troca 0 |
| **Evidência** | Autoteste e auditoria de divergência dependem de `data/raw` (gitignorado) + deps. Worktree fable sem `node_modules` é fato declarado pelo próprio Plano. Red Team nesta máquina: typecheck/demo inacessíveis sem install. |
| **Impacto** | Checkpoint F2 "vermelho" por ambiente, ou pior: skip silencioso dos gates. |
| **Correção recomendada** | Separar gates: (G1) `node --test src/live` sempre; (G2) bateria histórica **se** raw+deps presentes, senão reportar `SKIP com motivo` — nunca inventar nota 8,1. Autorizar `npm ci` explicitamente (já pedido). |
| **Bloqueia próxima fase?** | Bloqueia **execução** de F2 sem `npm ci` + dados |
| **Bloqueia Fase Sombra?** | Não |
| **Bloqueia operação real?** | Não |
| **Confiança** | **Alta** |

---

### F1-11 — `pedido_alterado` e `pedido_reimpresso` sem regra de diff de conteúdo

| Campo | Conteúdo |
|---|---|
| **ID** | F1-11 |
| **Gravidade** | **Média** |
| **Hash** | `0b68cc3` |
| **Arquivo e trecho** | `Auditoria_Mestra` §11 |
| **Evidência** | Define reimpressão = mesmo `pedido_interno`; alterado = "conteúdo diferente" sem definir igualdade de itens (ordem? qtd? obs?). Risco: ruído de reparse ⇄ `pedido_alterado` falso. |
| **Impacto** | Versões fantasma; contadores de qualidade mentem. |
| **Correção recomendada** | Hash canônico de itens ordenados; reimpressão idêntica = só carimbo; divergente = `reimpressao_divergente` (checklist 3.3). |
| **Bloqueia F2?** | Spec de `dedup.js`/`consolidar.js` deve fechar |
| **Bloqueia sombra/real?** | Parcial |
| **Confiança** | **Média-alta** |

---

### F1-12 — Rasura à caneta: "herda limitação" sem slot no contrato de qualidade

| Campo | Conteúdo |
|---|---|
| **ID** | F1-12 |
| **Gravidade** | **Média** |
| **Hash** | `0b68cc3` |
| **Arquivo e trecho** | Matriz risco 13; Auditoria §11; snapshot `qualidade` na Arquitetura §3 **sem** campo de limitação permanente |
| **Evidência** | Parser canônico já prevê `incerto.pode_ter_sido_corrigido_a_mao`; snapshot Fable não lista equivalente. |
| **Impacto** | UI live lista itens como verdade final (G-E-04). |
| **Correção recomendada** | `qualidade.limitacoes: ["comanda_pode_diferir_do_papel"]` sempre no vivo; copy "itens impressos". |
| **Bloqueia F2?** | Não |
| **Bloqueia sombra/real?** | Real se UI finalista |
| **Confiança** | **Alta** |

---

## 4. Checklist adversarial (aplicado a este commit)

| Seção | Resultado | Nota |
|---|---|---|
| 0 Higiene | **PASS** | Só docs; sem secrets; sem motor |
| 1 Contrato eventos | **FAIL parcial** | Desenho bom; faltam ids/schema/quality no envelope (F1-02) |
| 2 Validação | **N/A** | Sem parser ainda; regras boas na auditoria §10 |
| 3 Dedup | **FAIL parcial** | Reimpressão OK; colisão temporal ruim (F1-04) |
| 4 Consolidação | **PASS com ressalva** | Partials OK; casamento curto+temporal (F1-04) |
| 5 Parciais | **PASS** | Explícitos e corretos |
| 6 Cancelamento | **PASS** | Só status |
| 7 Recuperação | **PASS desenho** | Replay log; linha truncada — falta prova em F2 |
| 8 Offline | **FAIL premissa** | F1-01 confComp |
| 9 Simulação | **N/A** | F3 futuro; risco 2 bem nomeado |
| 10 Feature flags | **PASS desenho** | Defaults false |
| 11 Embalagens | **FAIL escopo** | F1-05 vs §16 |
| 12 Windows | **PASS desenho** | F7; sem serviço |
| 13 Interface | **RESSALVA** | F1-07 superfície rica |
| 14 Segurança | **PASS parcial** | Write-back/senha OK; click fraco (F1-08) |
| 15 Privacidade | **PASS desenho** | Sem tel/endereço no schema; gitignore live pendente |
| 16 Rollback | **PASS desenho** | Flags + stop |
| Itens proibidos no diff | **PASS** | Nenhum |

---

## 5. Premissas falsas / frágeis (resumo)

| Premissa no Fable | Status |
|---|---|
| `confComp` já cobre degradação de fonte viva | **Falsa** (F1-01) |
| `/data/*.jsonl` quase cobre live | **Falsa na prática** sem linha nested (F1-03) |
| Proximidade temporal resolve colisão com segurança | **Frágil/perigosa** (F1-04) |
| Embalagens V1 no pipeline pré-loja respeita doc oficial | **Conflita §16** (F1-05) |
| Shape NIGHT+rows basta com envelope | **Plausível** — OK como hipótese |
| Simulador ≠ prova operacional | **Verdadeira** (bem dita) |
| Adaptadores reais fora do programa | **Verdadeira e correta** |

---

## 6. Casos extremos (ataque ao desenho F1)

| Cenário | O desenho F1 aguenta? | Nota |
|---|---|---|
| Status sem comanda | Sim (parcial) | OK |
| Comanda sem status | Sim | OK |
| Reimpressão | Sim (chave pedido_interno) | Fechar hash de conteúdo (F1-11) |
| Cancel pós-print | Sim | OK |
| Fora de ordem | Mencionado no plano F2/F3 | Ainda sem regra de precedência formal no doc |
| Colisão curto | **Frágil** | F1-04 |
| JSONL truncado | Sim (decisão §10) | Provar em F2 |
| Fonte caída + Foco ativo | **Frágil** | F1-01 |
| 30 dias sintéticos "verde" | Risco 2 mitiga em texto | Exigir frase no runner F3 |
| Rasura | Limitação aceita | F1-12 slot qualidade |
| Click no Gestor | **Não blindado no texto** | F1-08 |
| `git add -A` com live | **Quebra** hoje | F1-03 |

---

## 7. Dados incompletos, duplicidade, ordem, recuperação, privacidade, falha silenciosa

| Tema | Avaliação neste checkpoint |
|---|---|
| Dados incompletos | Bem tratados na auditoria §8 |
| Duplicidade | Quase bem; colisão e diff de alterado fracos |
| Fora de ordem | Só na lista de testes F2 — falta tabela de precedência (cancel > status > print) no doc de arquitetura |
| Recuperação | Desenho sólido; zero prova (esperado em F1) |
| Privacidade | Schema mínimo bom; gitignore live crítico na F2 |
| Falha silenciosa | Risco residual: status stale sem gate de ação (F1-01); parcial mal rotulado se F4 fraco |
| Falsa confiança | Explícita no risco 2 (bom); implícita em confComp (ruim) |
| Regressões | Nenhuma de código neste hash |
| Acoplamentos | Bem mapeados (app-v1, protótipo morto, shape janela) |
| Impacto real na loja | **Nenhum neste commit**; risco futuro se plano virar código sem ressalvas |

---

## 8. O que o Fable pode fazer agora vs não

### Pode (próximo passo autorizado só com ressalvas absorvidas)

- Addendum de contrato (R1–R5) em `docs/preloja/` **ou** primeiro commit de F2 só com contrato+gitignore+testes vazios
- Pedir `AUTORIZO npm ci` + `AUTORIZO FASE 2` após addendum
- Manter adaptadores reais **fora**

### Não deve

- Implementar `consolidar` com merge temporal de curto
- Ligar embalagens a Sinais/UI
- Afirmar que staleness já está no cérebro
- Introduzir automação de click "só para inspecionar"
- Tratar 30 dias sintéticos como prova de operação

---

## 9. Parecer final (template checklist)

```text
Checkpoint Fable: 0b68cc3ca3a9b95aae605cb402ba34fc84d9b76b
Fase: AUDITORIA E ARQUITETURA PRÉ-LOJA
Revisor: Red Team Grok
Data: 2026-07-10

Críticos FAIL: (nenhum de código; nenhum secret)
Altos FAIL: F1-01, F1-02, F1-03 (quando F2), F1-04, F1-05
Médios: F1-06, F1-07, F1-08, F1-10, F1-11, F1-12
Baixos: F1-09

Pode encerrar Fase 1 documental? SIM
Pode ir para F2 lab sem addendum? NÃO RECOMENDADO
Pode ir para T loja? NÃO (sem implementação + inspeção)
Pode ir para P visível? NÃO
Pode operação real? NÃO

Linguagem proibida no PR: ausente (bom)

Decisão: APROVADO COM RESSALVAS
```

---

## 10. Referências cruzadas

- Biblioteca adversarial: `docs/auditoria-grok/`
- Checklist: `docs/auditoria-grok/Checklist_Adversarial_Revisao_Fable.md`
- Commit Fable: `0b68cc3`
- Base estável: `a441bc7`

---

*Revisão apenas documental. Código do Fable e `main` intocados. Branch Fable não modificada.*
